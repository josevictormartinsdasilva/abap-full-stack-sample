// Pacote gerenciado do ARC-1: sempre a última versão estável do npm (dist-tag "latest"),
// instalada uma vez num cache do usuário com `npm install` e executada com o Node atual.
// ARC1_VERSION=<x.y.z> fixa uma versão (ex.: para voltar atrás se uma versão quebrar).
//
// O npm confere a integridade de cada pacote (sha512 do registry) e respeita o registry e o proxy
// configurados na máquina. Como a versão não é fixada, o launcher também confere, a cada início,
// se o pacote instalado ainda reconhece as variáveis de segurança que ele define
// (VARIAVEIS_EXIGIDAS) e se o Node atende ao "engines" do pacote.
//
// IMPORTANTE: stdout é o canal MCP do launcher. Este módulo não escreve em stdout (a saída do npm
// é capturada).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PACOTE = "arc-1";
const VERSAO = /^v?(\d+\.\d+\.\d+)$/;
const TIMEOUT_CONSULTA_MS = 30_000;
const TIMEOUT_INSTALACAO_MS = 600_000;

// Variáveis que o launcher define para o ARC-1 (scripts/mcp-politica.mjs). Se uma versão nova
// não reconhecer alguma, a trava correspondente sumiria em silêncio: o launcher recusa iniciar.
export const VARIAVEIS_EXIGIDAS = ["SAP_TRANSPORT", "SAP_INSECURE", "SAP_ALLOW_WRITES",
  "SAP_ALLOW_TRANSPORT_WRITES", "SAP_ALLOW_GIT_WRITES", "SAP_ALLOW_DATA_PREVIEW", "SAP_ALLOW_FREE_SQL",
  "SAP_ALLOW_PLUGIN_EXECUTE", "SAP_DENY_ACTIONS", "SAP_ALLOWED_PACKAGES", "SAP_BLOCKED_DATA_SOURCES"];

export function variaveisAusentes(codigo) {
  return VARIAVEIS_EXIGIDAS.filter((v) => !new RegExp(`\\b${v}\\b`).test(codigo));
}

// Confere a versão do Node contra o "engines.node" do pacote. Entende ">=x", ">=x.y" e ">=x.y.z";
// devolve null para outros formatos (o launcher só avisa).
export function nodeAtende(engines, versaoNode) {
  const m = String(engines ?? "").trim().match(/^>=\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!m) return null;
  const req = [m[1], m[2] ?? 0, m[3] ?? 0].map(Number);
  const atual = versaoNode.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) if (atual[i] !== req[i]) return atual[i] > req[i];
  return true;
}

export function pastaCache(platform, env, home) {
  const base = platform === "win32"
    ? (env.LOCALAPPDATA || path.join(home, "AppData", "Local"))
    : (env.XDG_CACHE_HOME || path.join(home, platform === "darwin" ? "Library/Caches" : ".cache"));
  return path.join(base, "abap-full-stack", "arc-1");
}

const compararVersao = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};

export class FalhaArc1 extends Error {}

// npm-cli.js do npm que acompanha o Node em uso. Executá-lo com o próprio Node evita o npm.cmd
// e o cmd.exe no Windows (aspas e %~dp0 quebram a resolução do npm.cmd).
export function localizarNpmCli(execPath, env) {
  const dir = path.dirname(execPath);
  const candidatos = [
    env.npm_execpath,
    path.join(dir, "node_modules", "npm", "bin", "npm-cli.js"), // Windows
    path.join(dir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"), // Linux/macOS
  ];
  return candidatos.find((c) => c && /npm-cli\.js$/.test(c) && fs.existsSync(c)) ?? null;
}

// Executa o npm com a saída capturada (nunca no stdout do launcher).
function npmPadrao(args, timeout, execPath, env) {
  const cli = localizarNpmCli(execPath, env);
  if (!cli) return { status: null, stdout: "", stderr: "", erro: new Error(`npm não encontrado junto do Node em ${path.dirname(execPath)}`) };
  const r = spawnSync(execPath, [cli, ...args], { encoding: "utf8", timeout, windowsHide: true, env: { ...env, NODE_OPTIONS: "" } });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "", erro: r.error };
}
const resumoErro = (r) => r.erro?.message || r.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(" ") || `código ${r.status}`;

// Instalação de uma versão no cache, se estiver completa: { pacote, bin } ou null.
function instalacao(pasta, versao) {
  const raiz = path.join(pasta, versao, "node_modules", PACOTE);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf8"));
    const rel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[PACOTE];
    const bin = rel && path.join(raiz, rel);
    return pkg.version === versao && bin && fs.existsSync(bin) ? { raiz, pkg, bin } : null;
  } catch {
    return null;
  }
}

function versoesNoCache(pasta) {
  try {
    return fs.readdirSync(pasta).filter((d) => VERSAO.test(d)).sort(compararVersao).reverse();
  } catch {
    return [];
  }
}

// Todo o JavaScript de dist/, para conferir as variáveis reconhecidas.
function codigoDoPacote(raiz) {
  const partes = [];
  const andar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else if (/\.(c|m)?js$/.test(e.name)) partes.push(fs.readFileSync(p, "utf8"));
    }
  };
  andar(fs.existsSync(path.join(raiz, "dist")) ? path.join(raiz, "dist") : raiz);
  return partes.join("\n");
}

// Confere o pacote instalado: Node exigido e variáveis de segurança.
function conferir(inst, versao, versaoNode, log) {
  const atende = nodeAtende(inst.pkg.engines?.node, versaoNode);
  if (atende === false)
    throw new FalhaArc1(`o ARC-1 v${versao} exige Node.js ${inst.pkg.engines.node}; esta máquina tem ${versaoNode}. Atualize o Node ou fixe uma versão anterior com ARC1_VERSION.`);
  if (atende === null && inst.pkg.engines?.node)
    log(`aviso: não foi possível interpretar o engines.node "${inst.pkg.engines.node}" do ARC-1 v${versao}.`);
  const ausentes = variaveisAusentes(codigoDoPacote(inst.raiz));
  if (ausentes.length)
    throw new FalhaArc1(`o ARC-1 v${versao} não reconhece ${ausentes.join(", ")}, que o launcher usa para aplicar a política. Fixe uma versão anterior com ARC1_VERSION.`);
}

// Garante o ARC-1 no cache e devolve { command, args, versao } para executá-lo com o Node atual.
//   platform, env, home, versaoNode, execPath   para testes (padrão: os do processo)
//   npm(args, timeout)                          para testes (padrão: o npm da máquina)
//   log(msg)                                    mensagens de progresso e avisos (stderr no launcher)
export function garantirArc1({
  platform = process.platform, env = process.env, home = os.homedir(), versaoNode = process.versions.node,
  execPath = process.execPath, npm = (args, timeout) => npmPadrao(args, timeout, execPath, env), log = () => {},
} = {}) {
  const pasta = pastaCache(platform, env, home);
  const executar = (versao, inst) => {
    conferir(inst, versao, versaoNode, log);
    return { command: execPath, args: [inst.bin], versao };
  };

  // 1. Versão: a fixada em ARC1_VERSION ou a última estável do npm.
  let versao;
  if (env.ARC1_VERSION) {
    const m = String(env.ARC1_VERSION).trim().match(VERSAO);
    if (!m) throw new FalhaArc1(`ARC1_VERSION=${env.ARC1_VERSION} não é uma versão válida (ex.: 1.10.1).`);
    versao = m[1];
  } else {
    const r = npm(["view", `${PACOTE}@latest`, "version", "--json"], TIMEOUT_CONSULTA_MS);
    const m = r.status === 0 && String(JSON.parse(r.stdout || "null") ?? "").match(VERSAO);
    if (m) versao = m[1];
    else {
      // Sem acesso ao registry: usa a versão mais nova já instalada.
      for (const v of versoesNoCache(pasta)) {
        const inst = instalacao(pasta, v);
        if (inst) {
          log(`aviso: não foi possível consultar a última versão do ARC-1 (${resumoErro(r)}); usando a v${v} do cache.`);
          return executar(v, inst);
        }
      }
      throw new FalhaArc1(`não foi possível consultar a última versão do ARC-1 no npm (${resumoErro(r)}) e não há versão no cache. Se a rede bloqueia o npm, instale o ARC-1 manualmente e defina ARC1_BIN.`);
    }
  }

  // 2. Já instalada?
  const existente = instalacao(pasta, versao);
  if (existente) return executar(versao, existente);

  // 3. Instala numa pasta temporária e renomeia: dois launchers ao mesmo tempo não deixam
  //    instalação pela metade.
  log(`instalando ARC-1 v${versao} (npm install; pode levar alguns minutos)`);
  fs.mkdirSync(pasta, { recursive: true });
  const tmp = path.join(pasta, `.tmp-${versao}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tmp);
  fs.writeFileSync(path.join(tmp, "package.json"), '{ "private": true }\n');
  const r = npm(["install", "--prefix", tmp, `${PACOTE}@${versao}`, "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], TIMEOUT_INSTALACAO_MS);
  if (r.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new FalhaArc1(`não foi possível instalar o ARC-1 v${versao} (${resumoErro(r)}). Se a rede bloqueia o npm, instale o ARC-1 manualmente e defina ARC1_BIN.`);
  }
  const destino = path.join(pasta, versao);
  if (instalacao(pasta, versao)) {
    fs.rmSync(tmp, { recursive: true, force: true }); // outro launcher instalou primeiro
  } else {
    try {
      fs.rmSync(destino, { recursive: true, force: true }); // instalação incompleta de antes
      fs.renameSync(tmp, destino);
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      if (!instalacao(pasta, versao)) throw new FalhaArc1(`não foi possível gravar ${destino} (${e.code || e.message}).`);
    }
  }
  const inst = instalacao(pasta, versao);
  if (!inst) throw new FalhaArc1(`a instalação do ARC-1 v${versao} em ${destino} está incompleta (sem package.json ou bin).`);
  log(`ARC-1 v${versao} instalado em ${destino}`);

  // 4. Remove versões antigas e temporários abandonados há mais de 1 h (melhor esforço: uma
  //    versão antiga pode estar em uso por outra sessão; um temporário recente é outra instalação).
  for (const d of fs.readdirSync(pasta)) {
    const p = path.join(pasta, d);
    try {
      const abandonado = d.startsWith(".tmp-") && Date.now() - fs.statSync(p).mtimeMs > 3_600_000;
      if ((VERSAO.test(d) && d !== versao) || abandonado) fs.rmSync(p, { recursive: true, force: true });
    } catch {}
  }

  return executar(versao, inst);
}
