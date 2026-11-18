#!/usr/bin/env node
// Inicia os servidores MCP ARC-1 e vibing-steampunk (vsp) aplicando as travas técnicas da
// política standards/politica-mcp-abap.md (ADR-0009).
//
//   node scripts/mcp-launch.mjs <servidor>                 inicia o servidor (uso pelas ferramentas de IA)
//   node scripts/mcp-launch.mjs <servidor> --diagnostico   só detecta o sistema e mostra a decisão
//
// <servidor> é a chave do servidor em .agents/mcp.servers.json e define a ferramenta e o
// prefixo das variáveis de ambiente:
//   arc-1          -> ARC1_*          vsp          -> VSP_*
//   arc-1-qas-ne   -> ARC1_QAS_NE_*   vsp-sandbox  -> VSP_SANDBOX_*
//
// Variáveis (do ambiente do sistema ou, como fallback, do .env da raiz do projeto):
//   <P>_SAP_URL, <P>_SAP_CLIENT, <P>_SAP_USER, <P>_SAP_PASSWORD   obrigatórias
//   <P>_SAP_SID   opcional: se informado, precisa bater com o SID detectado; obrigatório quando
//                 o SID só puder ser inferido do T000-LOGSYS (senão vsp recusa e ARC-1 só lê)
//   ARC-1: <P>_ALLOWED_PACKAGES (só se o sistema for DEV/SANDBOX), <P>_BLOCKED_DATA_SOURCES, ARC1_BIN
//   vsp:   <P>_ALLOWED_PACKAGES (obrigatória), <P>_ALLOWED_TRANSPORTS, <P>_ENABLE_TRANSPORTS,
//          <P>_READ_ONLY, VSP_BIN
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
//   - ARC-1: fora de DEV/SANDBOX, com SAP_BASIS >= 816 ou com SID não confirmado, somente
//     leitura; prévia de dados, SQL livre, escrita em transporte/Git e plugins sempre desligados.
//   - O que não puder ser detectado é tratado como o caso mais restritivo.
//   - Nenhuma variável SAP_*, NODE_OPTIONS ou NODE_TLS_REJECT_UNAUTHORIZED do ambiente do
//     usuário é herdada; o processo filho roda num diretório neutro para não carregar o .env.
//
// Para o orquestrador rotear, o resultado da detecção é gravado em .agents/runtime/<servidor>.json
// (não versionado), apagado no início de cada execução e ao encerrar o servidor.
//
// IMPORTANTE: stdout é o canal MCP. Este script só escreve em stderr.
// Sem dependências: só Node.js >= 18.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detectar, validarUrlSap } from "./sap-probe.mjs";
import { PLACEHOLDER, Recusa, aplicarRegistro, decidir, lerRegistro, resolverSid, verificarTls } from "./mcp-politica.mjs";

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
const runtimeDir = path.join(ROOT, ".agents/runtime");
const runtimeFile = path.join(runtimeDir, `${server}.json`);
const limparRuntime = () => { try { fs.rmSync(runtimeFile, { force: true }); } catch { /* sem efeito */ } };
if (!DIAGNOSTICO) limparRuntime(); // nunca deixar a detecção de uma sessão anterior valendo

// ---------------------------------------------------------------- TLS (antes de qualquer conexão)
politica(() => verificarTls(process.env));

// ---------------------------------------------------------------- variáveis
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
const v = (name) => {
  const val = process.env[`${prefix}_${name}`] ?? dotenv[`${prefix}_${name}`];
  return val === undefined || val === "" || PLACEHOLDER.test(val) ? undefined : val;
};
const req = (name) => v(name) ?? fail(`variável ${prefix}_${name} não definida (ambiente ou .env)`);

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
  const r = spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 15000, windowsHide: true });
  if (r.error?.code === "ENOENT")
    fail(`"${cmd}" não encontrado. Instale-o ou defina ${variavel} com o caminho completo (${GUIA}, ${passo}).`);
  if (r.error) fail(`"${cmd}" não pôde ser executado (${r.error.code || r.error.message}). Se foi baixado agora, o sistema pode tê-lo bloqueado — no Windows, "Desbloquear" nas propriedades do arquivo; no macOS, xattr -d com.apple.quarantine (${GUIA}, ${passo}).`);
  if (r.status !== 0) fail(`"${cmd} --version" terminou com código ${r.status}; confira se é o binário correto (${GUIA}, ${passo}).`);
  return (r.stdout || r.stderr || "").trim().split(/\r?\n/)[0];
}
if (tool === "vsp") {
  const versao = verificarBinario(process.env.VSP_BIN || "vsp", "VSP_BIN", "passo 2");
  log(`vsp encontrado: ${versao}`);
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
const { command, args, shell, modo, childEnv, avisos } = politica(() =>
  decidir({ tool, prefix, sistema, conn, v, env: process.env, platform: process.platform }));
avisos.forEach((a) => log(`aviso: ${a}`));

const estado = {
  servidor: server, ferramenta: tool, sid, mandante, usuario: conn.user,
  sapBasis: det.sapBasis, produto: det.produto, ambiente, motivo, modo,
  sidConfirmado: sidInfo.sidConfirmado, sidOrigem: sidInfo.sidOrigem,
  detectadoEm: new Date().toISOString(), pid: process.pid,
};
log(`${server} -> ${sid}/${mandante} · ${det.produto} · ${ambiente} (${motivo}) · ${modo}`);

if (DIAGNOSTICO) {
  console.error(JSON.stringify({ ...estado, t000: det.t000, args: tool === "vsp" ? args : undefined }, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------- execução
fs.mkdirSync(runtimeDir, { recursive: true });
fs.writeFileSync(runtimeFile, JSON.stringify(estado, null, 2) + "\n");
const child = spawn(command, args, { env: childEnv, cwd: os.tmpdir(), stdio: "inherit", shell });
child.on("error", (e) => { limparRuntime(); fail(`não foi possível iniciar "${command}": ${e.message}`); });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => { limparRuntime(); process.exit(signal ? 1 : code ?? 1); });
