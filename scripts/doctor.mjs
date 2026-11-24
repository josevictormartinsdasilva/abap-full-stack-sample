#!/usr/bin/env node
// Verifica, de uma vez, se o projeto está pronto para uso nesta máquina.
//
//   node scripts/doctor.mjs
//
// Confere: versão do Node, arquivos gerados em sincronia com .agents/, testes das travas do
// launcher, parâmetros do cliente, cada conexão vsp/arc-1 do .env (pelo próprio
// `mcp-launch.mjs --diagnostico`, que detecta o sistema no SAP), o servidor abap-adt e o npx do
// fiori-mcp. Para cada problema, mostra o que fazer.
//
// Só lê: não grava arquivo nem altera nada no SAP. Nunca exibe senha ou token.
// Saída 0 sem erros (avisos não contam), 1 com algum erro.
// Sem dependências: só Node.js >= 18.

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BASIS_MCP_OFICIAL, valorDeVariavel } from "./mcp-politica.mjs";
import { nodeAtende } from "./arc1-pacote.mjs";
import {
  camposPendentes, ehPlaceholder, lerDiagnostico, lerDotEnv, placeholdersPadrao,
  prefixoDoServidor, recusaEsperada2025, situacaoConexao, situacaoProjetoCTS,
} from "./config-local.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(ROOT, ...p);
const NODE_MINIMO = ">=22.19";

const cor = process.stdout.isTTY && !process.env.NO_COLOR;
const pinta = (c) => (s) => (cor ? `\x1b[${c}m${s}\x1b[0m` : s);
const negrito = pinta("1"), verde = pinta("32"), amarelo = pinta("33"), vermelho = pinta("31"), cinza = pinta("90");

const totais = { ok: 0, aviso: 0, erro: 0 };
const secao = (s) => console.log(`\n${negrito(s)}`);
function item(nivel, texto, acao) {
  totais[nivel] = (totais[nivel] ?? 0) + 1;
  const marca = { ok: verde("✔"), aviso: amarelo("!"), erro: vermelho("✖"), info: cinza("·") }[nivel];
  console.log(`  ${marca} ${texto}`);
  if (acao) console.log(`      ${cinza("→")} ${acao}`);
}

const executar = (args, opcoes = {}) =>
  spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 120000, ...opcoes });

// ---------------------------------------------------------------- arquivos de configuração
const servidores = JSON.parse(fs.readFileSync(rel(".agents/mcp.servers.json"), "utf8")).servers;
const temEnv = fs.existsSync(rel(".env"));
const dotenv = temEnv ? lerDotEnv(fs.readFileSync(rel(".env"), "utf8")) : {};
const lerVar = (n) => process.env[n] ?? dotenv[n];
const nomenclatura = JSON.parse(fs.readFileSync(rel("standards/naming-conventions.json"), "utf8"));
const cliente = nomenclatura.cliente || {};
const sidDev = ehPlaceholder(cliente.sistemaDesenvolvimento) ? null : cliente.sistemaDesenvolvimento.trim().toUpperCase();
const abapServidores = Object.keys(servidores).filter((s) => prefixoDoServidor(s));

console.log(negrito("Diagnóstico do projeto ABAP Full Stack"));

// ---------------------------------------------------------------- máquina e projeto
secao("Máquina e projeto");
const usaArc1 = abapServidores.some((s) => s.startsWith("arc-1") && situacaoConexao(prefixoDoServidor(s).prefix, lerVar).situacao !== "vazia");
if (nodeAtende(NODE_MINIMO, process.versions.node)) item("ok", `Node.js ${process.versions.node}`);
else item(usaArc1 ? "erro" : "aviso", `Node.js ${process.versions.node} — o ARC-1 exige 22.19 ou superior`, "instale a LTS de https://nodejs.org");

const unix = process.platform !== "win32";
const sync = executar([rel("scripts/sync-agents.mjs"), "--check", ...(unix ? ["--platform=unix"] : [])]);
if (sync.status === 0) item("ok", "arquivos gerados em sincronia com .agents/");
else item("erro", "arquivos gerados desatualizados ou alterados à mão",
  unix ? "rode node scripts/sync-agents.mjs --platform=unix (sem commit)" : "rode node scripts/sync-agents.mjs");

const testes = fs.readdirSync(rel("scripts/test")).filter((f) => f.endsWith(".test.mjs")).map((f) => rel("scripts/test", f));
const t = executar(["--test", ...testes], { env: { ...process.env, NO_COLOR: "1" } });
const falhas = (t.stdout + t.stderr).match(/^ℹ fail (\d+)/m)?.[1];
if (t.status === 0) item("ok", `testes das travas do launcher (${(t.stdout.match(/^ℹ pass (\d+)/m) || [])[1] ?? "?"} passaram)`);
else item("erro", `testes das travas do launcher falharam (${falhas ?? "?"} falhas)`,
  "não use os servidores vsp/arc-1 até resolver; rode node --test scripts/test/ e envie a saída a quem mantém o projeto");

// ---------------------------------------------------------------- parâmetros do cliente
secao("Parâmetros do cliente");
const pendentes = camposPendentes(cliente);
if (!sidDev) item("erro", "sistemaDesenvolvimento não preenchido: os agentes não criam nem ativam objetos", "rode node scripts/setup.mjs --apenas=dev,cliente");
else item("ok", `sistemaDesenvolvimento = ${sidDev}`);
const outros = pendentes.filter((c) => c !== "sistemaDesenvolvimento");
if (outros.length) item("aviso", `sem valor em naming-conventions.json: ${outros.join(", ")} (os agentes vão perguntar)`, "rode node scripts/setup.mjs --apenas=cliente");
else item("ok", "naming-conventions.json preenchido");
const cts = situacaoProjetoCTS(nomenclatura.requests);
if (cts === "pendente") item("aviso", "projeto CTS das requests não definido (os agentes vão perguntar)",
  "rode node scripts/setup.mjs --apenas=cliente e responda se o cliente usa projeto CTS (se não usar, fica \"não se aplica\")");
else item("ok", cts === "definido" ? `projeto CTS das requests = ${nomenclatura.requests.projetoCTS.projeto}` : "projeto CTS: não se aplica a este cliente");
const restam = placeholdersPadrao(fs.readFileSync(rel("standards/padrao-desenvolvimento.md"), "utf8"));
if (restam.length) item("aviso", `placeholders em padrao-desenvolvimento.md: ${restam.join(", ")}`, "rode node scripts/setup.mjs --apenas=cliente");
else item("ok", "padrao-desenvolvimento.md preenchido");

// ---------------------------------------------------------------- conexões vsp / arc-1
secao("Conexões SAP (vsp / arc-1)");
if (!temEnv) item("aviso", ".env não encontrado", "rode node scripts/setup.mjs");

function diagnosticar(servidor) {
  return new Promise((resolve) => {
    const filho = spawn(process.execPath, [rel("scripts/mcp-launch.mjs"), servidor, "--diagnostico"],
      { cwd: ROOT, env: process.env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    filho.stderr.on("data", (d) => (stderr += d));
    const limite = setTimeout(() => filho.kill(), 180000);
    filho.on("close", (status) => { clearTimeout(limite); resolve({ status, ...lerDiagnostico(stderr) }); });
    filho.on("error", (e) => { clearTimeout(limite); resolve({ status: 1, estado: null, avisos: [], erro: e.message }); });
  });
}

// ADR-0014: não há mais conexão com o PRD. Credenciais esquecidas no .env são só risco.
if (Object.keys(dotenv).some((k) => /^ARC1_PRD_/.test(k) && !ehPlaceholder(dotenv[k])))
  item("aviso", "o .env ainda tem variáveis ARC1_PRD_*: o projeto não acessa mais o ambiente produtivo (ADR-0014)", "apague essas linhas do .env, inclusive a senha");

const configurados = [];
for (const s of abapServidores) {
  const { prefix } = prefixoDoServidor(s);
  const c = situacaoConexao(prefix, lerVar);
  if (c.situacao === "vazia") item("info", `${s}: não configurado ${cinza("(aparece como falho no /mcp; normal se você não usa esse sistema)")}`);
  else if (c.situacao === "incompleta") item("erro", `${s}: faltam ${c.faltando.join(", ")}`, `rode node scripts/setup.mjs ou preencha no .env`);
  else configurados.push(s);
}
if (configurados.length) console.log(cinza(`    detectando ${configurados.join(", ")} no SAP (a 1ª vez pode baixar o vsp/ARC-1)...`));
const diagnosticos = Object.fromEntries(await Promise.all(configurados.map(async (s) => [s, await diagnosticar(s)])));

const papelEsperado = (s) => (/-qas/.test(s) ? "QAS" : /-dev|^vsp/.test(s) ? "DEV" : null);
let rotaDev = false;
let algum2025 = false;
for (const s of configurados) {
  const d = diagnosticos[s];
  if (d.estado) {
    const e = d.estado;
    if (e.sapBasis >= BASIS_MCP_OFICIAL) algum2025 = true;
    item("ok", `${s}: ${e.sid}/${e.mandante} · ${e.produto} · ${e.ambiente} · ${e.modo}${e.tls ? ` · TLS: ${e.tls}` : ""}`);
    d.avisos.forEach((a) => item("aviso", `${s}: ${a}`));
    const esperado = papelEsperado(s);
    if (esperado === "DEV" && !["DEV", "SANDBOX"].includes(e.ambiente)) item("erro", `${s}: configurado como DEV, mas o sistema é ${e.ambiente}`, "confira a URL e o mandante");
    else if (esperado && esperado !== "DEV" && e.ambiente !== esperado) item("aviso", `${s}: esperado ${esperado}, detectado ${e.ambiente}`, "confira a URL e o mandante");
    if (esperado === "DEV" && sidDev && e.sid !== sidDev)
      item("erro", `${s}: conectado em ${e.sid}, mas o sistemaDesenvolvimento é ${sidDev}`, "confira a URL ou rode node scripts/setup.mjs --apenas=dev,cliente");
    if (s.startsWith("vsp") && !/somente leitura/.test(e.modo) && e.sid === sidDev) rotaDev = true;
  } else if (recusaEsperada2025(d.erro)) {
    algum2025 = true;
    item("info", `${s}: sistema S/4HANA 2025+, servido pelo abap-adt; o ${s} fica como fallback, desligado (esperado)`);
  } else {
    item("erro", `${s}: ${d.erro ?? `o diagnóstico terminou com código ${d.status}`}`,
      `detalhes: node scripts/mcp-launch.mjs ${s} --diagnostico · tabela "Problemas comuns" em docs/setup-mcp-abap.md`);
  }
}

// ---------------------------------------------------------------- abap-adt
secao("abap-adt (S/4HANA 2025+)");
const adt = servidores["abap-adt"];
if (adt) {
  const variavel = adt.tokenEnvVar || "ABAP_ADT_TOKEN";
  const token = valorDeVariavel(variavel, process.env[variavel]).valor;
  let tokenNoUsuario = false;
  if (!token && process.platform === "win32") {
    const r = spawnSync("reg", ["query", "HKCU\\Environment", "/v", variavel], { encoding: "utf8", windowsHide: true });
    tokenNoUsuario = r.status === 0;
  }
  let respondeu = false, falhaConexao = null;
  try {
    await fetch(adt.url, { method: "GET", signal: AbortSignal.timeout(3000) });
    respondeu = true;
  } catch (e) {
    falhaConexao = e.cause?.code || e.name;
  }
  // Exigido se algum sistema é 2025+, ou se o token existe e não há vsp configurado (abap-adt
  // como única rota). Token de outro projeto num cliente só 2023 não é problema.
  const vspConfigurado = configurados.some((s) => s.startsWith("vsp"));
  const relevante = algum2025 || ((Boolean(token) || tokenNoUsuario) && !vspConfigurado);
  const nivel = relevante ? "erro" : "info";
  if (!relevante) item("info", `não usado ${cinza("(nenhum sistema 2025+ detectado; aparece como falho no /mcp, o que é normal)")}`);
  else {
    if (token) item("ok", `${variavel} definido`);
    else if (tokenNoUsuario) item("aviso", `${variavel} está nas variáveis do usuário, mas não neste terminal`, "feche e abra o terminal e a ferramenta de IA");
    else item(nivel, `${variavel} não definido`, "rode node scripts/setup.mjs --apenas=token");
    if (respondeu) {
      item("ok", `servidor respondendo em ${adt.url}`);
      if (token) rotaDev = true;
    } else item(nivel, `servidor não responde em ${adt.url} (${falhaConexao})`, "inicie o servidor abap-adt (seção 5A de docs/primeiros-passos.md)");
  }
}

// ---------------------------------------------------------------- fiori-mcp
secao("fiori-mcp");
// Comando fixo, sem valor do usuário: pelo shell, o npx.cmd do Windows resolve a própria pasta.
const n = spawnSync("npx --version", { encoding: "utf8", windowsHide: true, shell: true, timeout: 30000 });
if (n.status === 0) item("ok", `npx ${n.stdout.trim()}`);
else item("erro", "npx não encontrado: o fiori-mcp não sobe", "reinstale o Node.js (o npx vem junto)");

// ---------------------------------------------------------------- resumo
secao("Resumo");
if (!rotaDev) item("erro", "nenhuma rota de desenvolvimento pronta no sistemaDesenvolvimento (vsp em DEV ou abap-adt com token)",
  algum2025 ? "resolva os itens do abap-adt acima" : "rode node scripts/setup.mjs --apenas=dev");
console.log(`\n  ${verde(`${totais.ok} ok`)} · ${amarelo(`${totais.aviso} avisos`)} · ${vermelho(`${totais.erro} erros`)}`);
if (totais.erro) console.log(`\n  Corrija os erros acima e rode ${negrito("node scripts/doctor.mjs")} de novo.`);
else console.log(`\n  ${verde("Pronto.")} Abra a ferramenta de IA na raiz do projeto e confira com /mcp.`);
process.exit(totais.erro ? 1 : 0);
