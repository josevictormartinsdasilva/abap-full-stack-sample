// Binário gerenciado do vibing-steampunk (vsp): versão fixada, baixada uma vez das releases
// oficiais e conferida pelo SHA-256 antes de cada uso. Equivale ao `npx arc-1@<versão>` do ARC-1.
//
// Para atualizar a versão: troque VSP_VERSAO e copie os hashes do checksums.txt da release nova
// (https://github.com/oisee/vibing-steampunk/releases). Hash que não confere = binário recusado.
//
// IMPORTANTE: stdout é o canal MCP do launcher. Este módulo não escreve em stdout.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const VSP_VERSAO = "2.62.1";
const BASE_URL = `https://github.com/oisee/vibing-steampunk/releases/download/v${VSP_VERSAO}`;
const TIMEOUT_MS = 180_000;

// checksums.txt da release v2.62.1
export const VSP_SHA256 = {
  "vsp-windows-amd64.exe": "e6d792a715464cd2812553b2df0d4f79e76a8d05ab7df6f2af12bbfce5c289e3",
  "vsp-windows-arm64.exe": "784bd62a41b2906ec73981f575f12ce6bd2035a96e69122b3e61689f4ba3bf8c",
  "vsp-linux-amd64": "16361aaf5f02799b8961c94b1a1a2dc2583b73e1ab45a768098f32351287b1a4",
  "vsp-linux-arm64": "39fb5c1343030f5f30029a42aa5a0ccb368a30f4be4ce427106f365e5c78c4da",
  "vsp-darwin-amd64": "a4f48d01737825ca1eab94ea72ae19fae2e1ac95c4a8e2ac309725363bd92ed7",
  "vsp-darwin-arm64": "199246837cdc5e12adadfd78a4d1e453519413fb2c58adc915dae39320fb2cac",
};

const SO = { win32: "windows", linux: "linux", darwin: "darwin" };
const ARQ = { x64: "amd64", arm64: "arm64" };

// Nome do asset da release para a plataforma, ou null se não houver binário publicado.
export function assetDaPlataforma(platform, arch) {
  if (!SO[platform] || !ARQ[arch]) return null;
  const nome = `vsp-${SO[platform]}-${ARQ[arch]}${platform === "win32" ? ".exe" : ""}`;
  return VSP_SHA256[nome] ? nome : null;
}

// Pasta de cache por usuário (fora do projeto, compartilhada entre projetos/clientes).
export function pastaCache(platform, env, home) {
  const base = platform === "win32"
    ? (env.LOCALAPPDATA || path.join(home, "AppData", "Local"))
    : (env.XDG_CACHE_HOME || path.join(home, platform === "darwin" ? "Library/Caches" : ".cache"));
  return path.join(base, "abap-full-stack", "vsp", VSP_VERSAO);
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const confere = (arquivo, esperado) => {
  try {
    return sha256(fs.readFileSync(arquivo)) === esperado;
  } catch {
    return false;
  }
};

export class FalhaVsp extends Error {}

// Garante o binário no cache e devolve o caminho. Baixa só se faltar ou não conferir.
//   platform, arch, env, home   para testes (padrão: os do processo)
//   fetch                       para testes (padrão: globalThis.fetch)
//   log(msg)                    mensagens de progresso (stderr no launcher)
export async function garantirVsp({
  platform = process.platform, arch = process.arch, env = process.env, home = os.homedir(),
  fetch = globalThis.fetch, log = () => {},
} = {}) {
  const asset = assetDaPlataforma(platform, arch);
  if (!asset)
    throw new FalhaVsp(`não há binário do vsp v${VSP_VERSAO} para ${platform}/${arch}. Compile-o ou baixe-o e defina VSP_BIN.`);
  const esperado = VSP_SHA256[asset];
  const pasta = pastaCache(platform, env, home);
  const destino = path.join(pasta, platform === "win32" ? "vsp.exe" : "vsp");

  if (fs.existsSync(destino)) {
    if (confere(destino, esperado)) return destino;
    log(`o vsp em ${destino} não confere com o SHA-256 da v${VSP_VERSAO}; baixando de novo`);
  }

  const url = `${BASE_URL}/${asset}`;
  log(`baixando vsp v${VSP_VERSAO} (${asset}) — só na primeira vez`);
  let buf;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    throw new FalhaVsp(`não foi possível baixar ${url} (${e.message}). Se a rede bloqueia o GitHub, baixe o arquivo manualmente e defina VSP_BIN.`);
  }
  const obtido = sha256(buf);
  if (obtido !== esperado)
    throw new FalhaVsp(`o download de ${asset} não confere com o SHA-256 fixado (esperado ${esperado}, obtido ${obtido}). O binário foi descartado.`);

  // Grava num temporário e renomeia: dois launchers ao mesmo tempo não deixam arquivo pela metade.
  fs.mkdirSync(pasta, { recursive: true });
  const tmp = `${destino}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, buf, { mode: 0o755 });
  try {
    fs.renameSync(tmp, destino);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    // Outro launcher pode ter gravado (e estar executando) o mesmo arquivo.
    if (!confere(destino, esperado)) throw new FalhaVsp(`não foi possível gravar ${destino} (${e.code || e.message}).`);
  }
  log(`vsp v${VSP_VERSAO} salvo em ${destino}`);
  return destino;
}
