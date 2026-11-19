#!/usr/bin/env node
// Inicia os servidores MCP ARC-1 e vibing-steampunk (vsp) aplicando as travas técnicas da
// política standards/politica-mcp-abap.md (ADR-0009).
//
//   node scripts/mcp-launch.mjs <servidor>                 inicia o servidor (uso pelas ferramentas de IA)
//   node scripts/mcp-launch.mjs <servidor> --diagnostico   só detecta o sistema e mostra a decisão
//
// <servidor> é a chave do servidor em .agents/mcp.servers.json e define a ferramenta e o
// prefixo das variáveis de ambiente:
//   arc-1          -> ARC1_*            vsp          -> VSP_*
//   arc-1-qas-xxx  -> ARC1_QAS_XXX_*    vsp-sandbox  -> VSP_SANDBOX_*
//
// Variáveis (do ambiente do sistema ou, como fallback, do .env da raiz do projeto):
//   <P>_SAP_URL, <P>_SAP_CLIENT, <P>_SAP_USER, <P>_SAP_PASSWORD   obrigatórias
//   <P>_SAP_SID   opcional: se informado, precisa bater com o SID detectado; obrigatório quando
//                 o SID só puder ser inferido do T000-LOGSYS (senão vsp recusa e ARC-1 só lê)
//   ARC-1: <P>_ALLOW_DEV_WRITES=true + <P>_ALLOWED_PACKAGES (escrita, só em DEV/SANDBOX ≤ 2023),
//          <P>_BLOCKED_DATA_SOURCES, ARC1_BIN
//   vsp:   <P>_ALLOWED_PACKAGES (obrigatória), <P>_ALLOWED_TRANSPORTS, <P>_ENABLE_TRANSPORTS,
//          <P>_READ_ONLY, VSP_BIN (sem ele, o launcher baixa a última release estável do vsp e
//          confere o SHA-256; ver scripts/vsp-binario.mjs), VSP_VERSION (fixa uma versão)
//
// O launcher NÃO confia no que foi declarado: lê do próprio SAP (scripts/sap-probe.mjs) o SID,
// o mandante, o release (SAP_BASIS) e o papel do mandante (T000/SCC4). O registro opcional
// standards/sistemas-sap.json só pode tornar a classificação MAIS restritiva.
//
// Travas aplicadas (não dependem do agente; as decisões ficam em scripts/mcp-politica.mjs):
//   - SAP_BASIS < 750: recusa, para os dois servidores.
//   - URL só https:// (http:// apenas para localhost); NODE_TLS_REJECT_UNAUTHORIZED=0 recusa.
//   - vsp: só em DEV/SANDBOX detectado e SAP_BASIS 750–815; sempre com --expect (SID detectado),
//     --allowed-packages e --block-free-sql; nunca --insecure.
//   - ARC-1: somente leitura, exceto em DEV/SANDBOX ≤ 2023 com SID confirmado e opt-in
//     <P>_ALLOW_DEV_WRITES=true; prévia de dados, SQL livre, escrita em transporte/Git e plugins
//     sempre desligados; SAPWrite.delete sempre negado e ABAP Unit negado fora de DEV/SANDBOX.
//   - O que não puder ser detectado é tratado como o caso mais restritivo.
//   - Nenhuma variável SAP_*, NODE_OPTIONS ou NODE_TLS_REJECT_UNAUTHORIZED do ambiente do
//     usuário é herdada; o processo filho roda num diretório neutro para não carregar o .env.
//
// Para o orquestrador rotear, o resultado da detecção é gravado em
// .agents/runtime/<servidor>.<pid>.json (não versionado) e apagado ao encerrar. O orquestrador
// lista os servidores vivos com `node scripts/mcp-runtime.mjs`, que descarta arquivos de
// processos já terminados.
//
// IMPORTANTE: stdout é o canal MCP. Este script só escreve em stderr.
// Sem dependências: só Node.js >= 18.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detectar, validarUrlSap } from "./sap-probe.mjs";
import { Recusa, valorDeVariavel, aplicarRegistro, comandoParaSpawn, decidir, lerRegistro, resolverSid, verificarTls } from "./mcp-politica.mjs";
import { FalhaVsp, flagsAusentes, garantirVsp } from "./vsp-binario.mjs";
import { RUNTIME_DIR, gravarEstado, listarAtivos, removerEstado } from "./mcp-runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRO = "standards/sistemas-sap.json";

function fail(msg) {
  console.error(`mcp-launch: ${msg}`);
  process.exit(2);
}
const log = (msg) => console.error(`mcp-launch: ${msg}`);
// Executa uma decisão da política; Recusa vira mensagem e saída 2, sem stack trace.
const politica = (fn) => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof Recusa) fail(e.message);
    throw e;
  }
};

// ---------------------------------------------------------------- servidor e prefixo
const server = process.argv[2];
const DIAGNOSTICO = process.argv.includes("--diagnostico");
if (!server || server.startsWith("--")) fail("informe o servidor (ex.: node scripts/mcp-launch.mjs vsp)");
const tool = server.startsWith("arc-1") ? "arc-1" : server.startsWith("vsp") ? "vsp" : null;
if (!tool) fail(`servidor "${server}" não é arc-1* nem vsp*`);
const prefix = (tool === "arc-1" ? "ARC1" : "VSP") + server.slice(tool.length).toUpperCase().replace(/[^A-Z0-9]+/g, "_");

// ---------------------------------------------------------------- estado para o orquestrador
// Descarta os arquivos de sessões anteriores deste servidor cujo processo já terminou. Os de
// sessões vivas (outra ferramenta no mesmo servidor) ficam.
if (!DIAGNOSTICO) listarAtivos(RUNTIME_DIR, { servidor: server });
const limparRuntime = () => removerEstado(RUNTIME_DIR, server, process.pid);

// ---------------------------------------------------------------- TLS (antes de qualquer conexão)
politica(() => verificarTls(process.env));

// ---------------------------------------------------------------- variáveis
// .env: uma variável por linha (NOME=valor), linhas iniciadas por # são comentário. Não há
// comentário no fim da linha: o # faz parte do valor (senhas podem conter #). Aspas simples ou
// duplas envolvendo o valor inteiro são removidas.
function readDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}
const dotenv = readDotEnv(path.join(ROOT, ".env"));
// VSP_BIN/VSP_VERSION/ARC1_BIN: ambiente do sistema ou, como fallback, o .env (docs/setup-mcp-abap.md, passo 4).
for (const k of ["VSP_BIN", "VSP_VERSION", "ARC1_BIN"]) if (!process.env[k] && dotenv[k]) process.env[k] = dotenv[k];
const lerVar = (name) => valorDeVariavel(`${prefix}_${name}`, process.env[`${prefix}_${name}`] ?? dotenv[`${prefix}_${name}`]);
const v = (name) => lerVar(name).valor;
const req = (name) => {
  const { valor, placeholder } = lerVar(name);
  if (placeholder) fail(`variável ${prefix}_${name} ainda tem o placeholder do .env.example (<...>); preencha o valor real`);
  return valor ?? fail(`variável ${prefix}_${name} não definida (ambiente ou .env)`);
};

const conn = {
  url: req("SAP_URL"),
  client: req("SAP_CLIENT"),
  user: req("SAP_USER").toUpperCase(),
  password: req("SAP_PASSWORD"),
};
const mandante = String(conn.client).padStart(3, "0");
const sidDeclarado = v("SAP_SID")?.toUpperCase();
try {
  validarUrlSap(conn.url);
} catch (e) {
  fail(`${prefix}_SAP_URL: ${e.message}`);
}

// ---------------------------------------------------------------- executáveis (antes de tocar no SAP)
const GUIA = "docs/setup-mcp-abap.md";
function verificarBinario(cmd, variavel, passo) {
  const c = politica(() => comandoParaSpawn(cmd, ["--version"], process.platform));
  const r = spawnSync(c.command, c.args, { encoding: "utf8", timeout: 15000, windowsHide: true, shell: c.shell });
  if (r.error?.code === "ENOENT")
    fail(`"${cmd}" não encontrado. Instale-o ou defina ${variavel} com o caminho completo (${GUIA}, ${passo}).`);
  if (r.error?.code === "EINVAL")
    fail(`"${cmd}" não pôde ser executado (EINVAL). Confira se ${variavel} aponta para o executável e não para uma pasta ou atalho (${GUIA}, ${passo}).`);
  if (r.error) fail(`"${cmd}" não pôde ser executado (${r.error.code || r.error.message}). Se foi baixado agora, o sistema pode tê-lo bloqueado — no Windows, "Desbloquear" nas propriedades do arquivo; no macOS, xattr -d com.apple.quarantine (${GUIA}, ${passo}).`);
  if (r.status !== 0) fail(`"${cmd} --version" terminou com código ${r.status}; confira se é o binário correto (${GUIA}, ${passo}).`);
  return (r.stdout || r.stderr || "").trim().split(/\r?\n/)[0];
}
if (tool === "vsp") {
  // VSP_BIN explícito tem precedência; sem ele, binário gerenciado (última estável + SHA-256).
  if (!process.env.VSP_BIN) {
    try {
      process.env.VSP_BIN = (await garantirVsp({ log })).caminho;
    } catch (e) {
      if (e instanceof FalhaVsp) fail(`${e.message} (${GUIA}, passo 2)`);
      throw e;
    }
  }
  const versao = verificarBinario(process.env.VSP_BIN, "VSP_BIN", "passo 2");
  log(`vsp encontrado: ${versao}`);
  // Sem versão fixada, uma release nova pode renomear uma flag de segurança: confere antes de usar.
  const c = politica(() => comandoParaSpawn(process.env.VSP_BIN, ["--help"], process.platform));
  const ajuda = spawnSync(c.command, c.args, { encoding: "utf8", timeout: 15000, windowsHide: true, shell: c.shell });
  const ausentes = flagsAusentes(`${ajuda.stdout || ""}\n${ajuda.stderr || ""}`);
  if (ausentes.length)
    fail(`o vsp em uso (${versao}) não tem as flags ${ausentes.join(", ")}, que o launcher usa para aplicar a política. `
      + `Fixe uma versão anterior com VSP_VERSION no .env (${GUIA}, passo 2).`);
} else if (process.env.ARC1_BIN) {
  verificarBinario(process.env.ARC1_BIN, "ARC1_BIN", "variáveis opcionais");
} else {
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 19))
    fail(`o ARC-1 exige Node.js >= 22.19; esta máquina tem ${process.versions.node} (${GUIA}, passo 1).`);
}

// ---------------------------------------------------------------- detecção no próprio SAP
let det;
try {
  det = await detectar(conn);
} catch (e) {
  fail(`não foi possível identificar o sistema em ${conn.url}: ${e.message}`);
}
det.avisos.forEach((a) => log(`aviso: ${a}`));

const sidInfo = politica(() => resolverSid(det, sidDeclarado, prefix));
sidInfo.avisos.forEach((a) => log(`aviso: ${a}`));
const sid = sidInfo.sid;
if (det.client && det.client !== mandante) fail(`o mandante conectado é ${det.client}, não ${conn.client}`);

// ---------------------------------------------------------------- registro opcional (só restringe)
let ambiente = det.ambiente;
let motivo = det.motivo;
const arquivoRegistro = path.join(ROOT, REGISTRO);
if (fs.existsSync(arquivoRegistro)) {
  const { restricoes, avisos } = politica(() => lerRegistro(fs.readFileSync(arquivoRegistro, "utf8"), REGISTRO));
  const aplicado = aplicarRegistro({ sid, mandante, ambiente, motivo }, restricoes, REGISTRO);
  [...avisos, ...aplicado.avisos].forEach((a) => log(`aviso: ${a}`));
  ({ ambiente, motivo } = aplicado);
}

// ---------------------------------------------------------------- decisão por ferramenta
const sistema = { sid, sidPendente: sidInfo.sidPendente, mandante, ambiente, motivo, sapBasis: det.sapBasis, produto: det.produto };
const { command, args, shell, modo, acoesNegadas, childEnv, avisos } = politica(() =>
  decidir({ tool, prefix, sistema, conn, v, env: process.env, platform: process.platform }));
avisos.forEach((a) => log(`aviso: ${a}`));

const estado = {
  servidor: server, ferramenta: tool, sid, mandante, usuario: conn.user,
  sapBasis: det.sapBasis, produto: det.produto, ambiente, motivo, modo,
  ...(acoesNegadas ? { acoesNegadas } : {}),
  sidConfirmado: sidInfo.sidConfirmado, sidOrigem: sidInfo.sidOrigem,
  detectadoEm: new Date().toISOString(), pid: process.pid,
};
log(`${server} -> ${sid}/${mandante} · ${det.produto} · ${ambiente} (${motivo}) · ${modo}`);

if (DIAGNOSTICO) {
  console.error(JSON.stringify({ ...estado, t000: det.t000, args: tool === "vsp" ? args : undefined }, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------- execução
gravarEstado(RUNTIME_DIR, estado);
const child = spawn(command, args, { env: childEnv, cwd: os.tmpdir(), stdio: "inherit", shell });
child.on("error", (e) => { limparRuntime(); fail(`não foi possível iniciar "${command}": ${e.message}`); });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => { limparRuntime(); process.exit(signal ? 1 : code ?? 1); });
