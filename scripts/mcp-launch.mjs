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
//   <P>_SAP_SID   opcional: se informado, precisa bater com o SID detectado
//   ARC-1: <P>_ALLOWED_PACKAGES (só se o sistema for DEV/SANDBOX), <P>_BLOCKED_DATA_SOURCES, ARC1_BIN
//   vsp:   <P>_ALLOWED_PACKAGES (obrigatória), <P>_ALLOWED_TRANSPORTS, <P>_ENABLE_TRANSPORTS,
//          <P>_READ_ONLY, VSP_BIN
//
// O launcher NÃO confia no que foi declarado: lê do próprio SAP (scripts/sap-probe.mjs) o SID,
// o mandante, o release (SAP_BASIS) e o papel do mandante (T000/SCC4). O registro opcional
// standards/sistemas-sap.json só pode tornar a classificação MAIS restritiva.
//
// Travas aplicadas (não dependem do agente):
//   - vsp: só em DEV/SANDBOX detectado e SAP_BASIS 750–815; sempre com --expect (SID detectado),
//     --allowed-packages e --block-free-sql; nunca --insecure.
//   - ARC-1: fora de DEV/SANDBOX, ou com SAP_BASIS >= 816, somente leitura; prévia de dados,
//     SQL livre, escrita em transporte/Git e execução de plugins sempre desligados.
//   - O que não puder ser detectado é tratado como o caso mais restritivo.
//   - Nenhuma variável SAP_* do ambiente do usuário é herdada; o processo filho roda num
//     diretório neutro para não carregar o .env do projeto.
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
import { detectar, maisRestritivo } from "./sap-probe.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARC1_PACKAGE = "arc-1@1.10.1"; // versão fixada (mesmo critério do fiori-mcp, ADR-0007)
const REGISTRO = "standards/sistemas-sap.json";
const PLACEHOLDER = /<[^>]*>/;

function fail(msg) {
  console.error(`mcp-launch: ${msg}`);
  process.exit(2);
}
const log = (msg) => console.error(`mcp-launch: ${msg}`);

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
const flag = (name) => /^(true|1|yes)$/i.test(v(name) ?? "");

const conn = {
  url: req("SAP_URL"),
  client: req("SAP_CLIENT"),
  user: req("SAP_USER").toUpperCase(),
  password: req("SAP_PASSWORD"),
};
const sidDeclarado = v("SAP_SID")?.toUpperCase();

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

const sid = det.sid ?? sidDeclarado;
if (!sid) fail("SID não detectado (sistema sem systeminformation e T000 ilegível) — informe " + `${prefix}_SAP_SID`);
if (!det.sid) log(`aviso: SID não confirmado pelo sistema; usando o declarado ${sidDeclarado}`);
if (det.sid && sidDeclarado && det.sid !== sidDeclarado)
  fail(`o sistema conectado é ${det.sid}, mas ${prefix}_SAP_SID diz ${sidDeclarado} — confira a URL`);
if (det.client && det.client !== String(conn.client).padStart(3, "0"))
  fail(`o mandante conectado é ${det.client}, não ${conn.client}`);

// ---------------------------------------------------------------- registro opcional (só restringe)
let ambiente = det.ambiente;
let motivo = det.motivo;
if (fs.existsSync(path.join(ROOT, REGISTRO))) {
  const lista = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRO), "utf8"))?.restricoes ?? [];
  const r = lista.find((x) => String(x.sid).toUpperCase() === sid && String(x.mandante).padStart(3, "0") === String(conn.client).padStart(3, "0"));
  if (r && !PLACEHOLDER.test(JSON.stringify(r))) {
    const declarado = String(r.ambiente).toUpperCase();
    const efetivo = maisRestritivo(ambiente, declarado);
    if (efetivo !== ambiente) motivo = `${REGISTRO} restringe a ${declarado} (detectado: ${ambiente})`;
    else if (declarado !== ambiente) log(`aviso: ${REGISTRO} declara ${declarado}, mas o sistema é ${ambiente}; vale o mais restritivo (${ambiente})`);
    ambiente = efetivo;
  }
}
const isDev = ambiente === "DEV" || ambiente === "SANDBOX";
const basis = det.sapBasis;

// ---------------------------------------------------------------- decisão por ferramenta
const childEnv = {};
for (const [k, val] of Object.entries(process.env)) {
  if (/^(SAP_|ARC1_|VSP_|ABAP_ADT_TOKEN$)/.test(k)) continue; // nada de SAP_* herdado
  childEnv[k] = val;
}
Object.assign(childEnv, { SAP_URL: conn.url, SAP_CLIENT: conn.client, SAP_USER: conn.user, SAP_PASSWORD: conn.password });

let command, args, shell = false, modo;

if (tool === "arc-1") {
  const writes = isDev && basis < 816;
  modo = writes ? "escrita restrita a pacotes" : "somente leitura";
  Object.assign(childEnv, {
    SAP_TRANSPORT: "stdio",
    SAP_INSECURE: "false",
    SAP_ALLOW_WRITES: String(writes),
    SAP_ALLOW_TRANSPORT_WRITES: "false",
    SAP_ALLOW_GIT_WRITES: "false",
    SAP_ALLOW_DATA_PREVIEW: "false",
    SAP_ALLOW_FREE_SQL: "false",
    SAP_ALLOW_PLUGIN_EXECUTE: "false",
    SAP_DENY_ACTIONS: "SAPWrite.delete",
  });
  if (writes) childEnv.SAP_ALLOWED_PACKAGES = req("ALLOWED_PACKAGES");
  if (v("BLOCKED_DATA_SOURCES")) childEnv.SAP_BLOCKED_DATA_SOURCES = v("BLOCKED_DATA_SOURCES");
  if (process.env.ARC1_BIN) {
    command = process.env.ARC1_BIN;
    args = [];
  } else {
    command = process.platform === "win32" ? "npx.cmd" : "npx";
    args = ["--yes", ARC1_PACKAGE];
    shell = process.platform === "win32"; // .cmd exige shell no Node >= 20; argumentos fixos
  }
} else {
  if (!isDev) fail(`vsp recusado: ${sid}/${conn.client} é ${ambiente} — ${motivo}. Política MCP: vsp só em DEV/SANDBOX.`);
  if (basis < 750 || basis >= 816) fail(`vsp recusado: SAP_BASIS ${basis} (${det.produto}); permitido só 750–815.`);
  modo = flag("READ_ONLY") ? "somente leitura" : "desenvolvimento";
  command = process.env.VSP_BIN || "vsp";
  args = ["--mode", "hyperfocused", "--expect", `${sid}.${String(conn.client).padStart(3, "0")}/${conn.user}`,
    "--allowed-packages", req("ALLOWED_PACKAGES"), "--block-free-sql"];
  if (v("ALLOWED_TRANSPORTS")) args.push("--allow-transportable-edits", "--allowed-transports", v("ALLOWED_TRANSPORTS"));
  if (flag("ENABLE_TRANSPORTS")) args.push("--enable-transports");
  if (flag("READ_ONLY")) args.push("--read-only");
}

const estado = {
  servidor: server, ferramenta: tool, sid, mandante: String(conn.client).padStart(3, "0"), usuario: conn.user,
  sapBasis: basis, produto: det.produto, ambiente, motivo, modo,
  sidConfirmado: Boolean(det.sid), detectadoEm: new Date().toISOString(), pid: process.pid,
};
log(`${server} -> ${sid}/${estado.mandante} · ${det.produto} · ${ambiente} (${motivo}) · ${modo}`);

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
