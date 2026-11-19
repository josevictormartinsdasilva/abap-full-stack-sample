// Binário gerenciado do vibing-steampunk (vsp): sempre a última release estável do GitHub,
// baixada uma vez para o cache do usuário e conferida pelo SHA-256 do checksums.txt da mesma
// release. VSP_VERSION=<x.y.z> fixa uma versão (ex.: para voltar atrás se uma release quebrar).
//
// A conferência do hash protege contra download corrompido ou trocado no caminho, não contra uma
// release adulterada na origem. Por isso o launcher também confere, a cada início, se as flags de
// segurança que ele passa ao vsp continuam existindo (FLAGS_EXIGIDAS).
//
// IMPORTANTE: stdout é o canal MCP do launcher. Este módulo não escreve em stdout.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = "https://github.com/oisee/vibing-steampunk";
const TIMEOUT_CONSULTA_MS = 10_000;
const TIMEOUT_DOWNLOAD_MS = 180_000;
const VERSAO = /^v?(\d+\.\d+\.\d+)$/;

// Flags que o launcher passa ao vsp (scripts/mcp-politica.mjs). Se uma versão nova não tiver
// alguma delas, o launcher recusa iniciar em vez de rodar sem a trava.
export const FLAGS_EXIGIDAS = ["--mode", "--expect", "--allowed-packages", "--block-free-sql",
  "--read-only", "--allow-transportable-edits", "--allowed-transports", "--enable-transports"];

export function flagsAusentes(textoAjuda) {
  return FLAGS_EXIGIDAS.filter((f) => !new RegExp(`(^|\\s)${f}(\\s|=|$)`, "m").test(textoAjuda));
}

const SO = { win32: "windows", linux: "linux", darwin: "darwin" };
const ARQ = { x64: "amd64", arm64: "arm64" };

// Nome do asset da release para a plataforma, ou null se o vsp não publica para ela.
export function assetDaPlataforma(platform, arch) {
  if (!SO[platform] || !ARQ[arch]) return null;
  return `vsp-${SO[platform]}-${ARQ[arch]}${platform === "win32" ? ".exe" : ""}`;
}

// Pasta de cache por usuário (fora do projeto, compartilhada entre projetos/clientes).
export function pastaCache(platform, env, home) {
  const base = platform === "win32"
    ? (env.LOCALAPPDATA || path.join(home, "AppData", "Local"))
    : (env.XDG_CACHE_HOME || path.join(home, platform === "darwin" ? "Library/Caches" : ".cache"));
  return path.join(base, "abap-full-stack", "vsp");
}

// Lê o checksums.txt ("<sha256>  <arquivo>" por linha) -> { arquivo: sha256 }.
export function lerChecksums(texto) {
  const out = {};
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.trim().match(/^([0-9a-f]{64})\s+\*?(\S+)$/i);
    if (m) out[m[2]] = m[1].toLowerCase();
  }
  return out;
}

const compararVersao = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export class FalhaVsp extends Error {}

// Última release estável: /releases/latest redireciona para a tag (ignora pré-releases e
// rascunhos, e não consome o limite da API do GitHub).
async function ultimaEstavel(fetch) {
  const res = await fetch(`${REPO}/releases/latest`, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_CONSULTA_MS) });
  const destino = res.headers.get("location") || "";
  const m = destino.match(/\/releases\/tag\/([^/?#]+)$/);
  const versao = m && decodeURIComponent(m[1]).match(VERSAO);
  if (!versao) throw new Error(`resposta inesperada (HTTP ${res.status})`);
  return versao[1];
}

// Binário de uma versão no cache, se estiver íntegro (hash do checksums.txt salvo junto).
function binarioNoCache(pasta, versao, asset, nomeLocal) {
  const dir = path.join(pasta, versao);
  try {
    const esperado = lerChecksums(fs.readFileSync(path.join(dir, "checksums.txt"), "utf8"))[asset];
    const bin = path.join(dir, nomeLocal);
    return esperado && sha256(fs.readFileSync(bin)) === esperado ? bin : null;
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

async function baixar(fetch, url) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_DOWNLOAD_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Grava num temporário e renomeia: dois launchers ao mesmo tempo não deixam arquivo pela metade.
function gravar(destino, buf, mode) {
  const tmp = `${destino}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, buf, { mode });
  try {
    fs.renameSync(tmp, destino);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

// Garante o binário no cache e devolve { caminho, versao }.
//   platform, arch, env, home   para testes (padrão: os do processo)
//   fetch                       para testes (padrão: globalThis.fetch)
//   log(msg)                    mensagens de progresso e avisos (stderr no launcher)
export async function garantirVsp({
  platform = process.platform, arch = process.arch, env = process.env, home = os.homedir(),
  fetch = globalThis.fetch, log = () => {},
} = {}) {
  const asset = assetDaPlataforma(platform, arch);
  if (!asset) throw new FalhaVsp(`o vsp não publica binário para ${platform}/${arch}. Compile-o e defina VSP_BIN.`);
  const nomeLocal = platform === "win32" ? "vsp.exe" : "vsp";
  const pasta = pastaCache(platform, env, home);

  // 1. Versão: a fixada em VSP_VERSION ou a última estável.
  let versao;
  if (env.VSP_VERSION) {
    const m = String(env.VSP_VERSION).trim().match(VERSAO);
    if (!m) throw new FalhaVsp(`VSP_VERSION=${env.VSP_VERSION} não é uma versão válida (ex.: 2.62.1).`);
    versao = m[1];
  } else {
    try {
      versao = await ultimaEstavel(fetch);
    } catch (e) {
      // Sem acesso ao GitHub: usa a versão mais nova já baixada.
      for (const v of versoesNoCache(pasta)) {
        const bin = binarioNoCache(pasta, v, asset, nomeLocal);
        if (bin) {
          log(`aviso: não foi possível consultar a última versão do vsp (${e.message}); usando a v${v} do cache.`);
          return { caminho: bin, versao: v };
        }
      }
      throw new FalhaVsp(`não foi possível consultar a última versão do vsp em ${REPO} (${e.message}) e não há versão no cache. Se a rede bloqueia o GitHub, baixe o binário manualmente e defina VSP_BIN.`);
    }
  }

  // 2. Já baixada e íntegra?
  const noCache = binarioNoCache(pasta, versao, asset, nomeLocal);
  if (noCache) return { caminho: noCache, versao };

  // 3. Baixa checksums.txt e o binário da release, e confere.
  const base = `${REPO}/releases/download/v${versao}`;
  log(`baixando vsp v${versao} (${asset})`);
  let esperado, buf;
  try {
    esperado = lerChecksums((await baixar(fetch, `${base}/checksums.txt`)).toString("utf8"));
    if (!esperado[asset]) throw new FalhaVsp(`a release v${versao} do vsp não tem ${asset} no checksums.txt. Defina VSP_VERSION com uma versão anterior ou use VSP_BIN.`);
    buf = await baixar(fetch, `${base}/${asset}`);
  } catch (e) {
    if (e instanceof FalhaVsp) throw e;
    throw new FalhaVsp(`não foi possível baixar o vsp v${versao} de ${base} (${e.message}). Se a rede bloqueia o GitHub, baixe o binário manualmente e defina VSP_BIN.`);
  }
  const obtido = sha256(buf);
  if (obtido !== esperado[asset])
    throw new FalhaVsp(`o download de ${asset} v${versao} não confere com o checksums.txt da release (esperado ${esperado[asset]}, obtido ${obtido}). O binário foi descartado.`);

  const dir = path.join(pasta, versao);
  const destino = path.join(dir, nomeLocal);
  fs.mkdirSync(dir, { recursive: true });
  try {
    gravar(path.join(dir, "checksums.txt"), Object.entries(esperado).map(([a, h]) => `${h}  ${a}`).join("\n") + "\n", 0o644);
    gravar(destino, buf, 0o755);
  } catch (e) {
    // Outro launcher pode ter gravado (e estar executando) o mesmo arquivo.
    if (!binarioNoCache(pasta, versao, asset, nomeLocal)) throw new FalhaVsp(`não foi possível gravar ${destino} (${e.code || e.message}).`);
  }
  log(`vsp v${versao} salvo em ${destino}`);

  // 4. Remove versões antigas (melhor esforço: pode estar em uso por outra sessão).
  for (const v of versoesNoCache(pasta))
    if (v !== versao) try { fs.rmSync(path.join(pasta, v), { recursive: true, force: true }); } catch {}

  return { caminho: destino, versao };
}
