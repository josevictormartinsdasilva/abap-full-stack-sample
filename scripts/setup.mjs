#!/usr/bin/env node
// Assistente de configuração de um projeto (um clone por cliente).
//
//   node scripts/setup.mjs                       configura tudo, passo a passo
//   node scripts/setup.mjs --apenas=dev          refaz só uma etapa: dev, qas, prd, cliente, token
//   node scripts/setup.mjs --apenas=qas,prd      (várias, separadas por vírgula)
//
// O que faz:
//   1. Confere o Node e a plataforma; cria o .env a partir do .env.example.
//   2. Para cada sistema (DEV pelo vsp, QAS e PRD pelo arc-1), pede só a conexão (URL, mandante,
//      usuário, senha), detecta no próprio SAP o SID, o release e o ambiente
//      (scripts/sap-probe.mjs) e grava no .env. O SID detectado vai para <P>_SAP_SID, que o
//      launcher usa como conferência.
//   3. Pede os parâmetros do cliente e grava no bloco "cliente" de
//      standards/naming-conventions.json (o sistemaDesenvolvimento vem do SID detectado no DEV)
//      e nos placeholders de standards/padrao-desenvolvimento.md.
//   4. Se algum sistema for S/4HANA 2025+, oferece gravar o ABAP_ADT_TOKEN nas variáveis do usuário.
//   5. Roda o scripts/doctor.mjs.
//
// Senhas e token só passam por este processo local: nunca vão para a ferramenta de IA. A senha
// é digitada sem eco e nunca é exibida. Nada é gravado sem confirmação.
// Sem dependências: só Node.js >= 18 (o ARC-1 exige 22.19; o passo 1 avisa).

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Writable } from "node:stream";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detectar, validarUrlSap } from "./sap-probe.mjs";
import { BASIS_MCP_OFICIAL, BASIS_MINIMO, valorDeVariavel } from "./mcp-politica.mjs";
import { nodeAtende } from "./arc1-pacote.mjs";
import {
  atualizarCliente, atualizarDotEnv, atualizarProjetoCTS, camposPendentes, ehPlaceholder, lerDotEnv,
  placeholdersPadrao, preencherPadrao, prefixoDoServidor, situacaoConexao, situacaoProjetoCTS,
} from "./config-local.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARQ = {
  env: path.join(ROOT, ".env"),
  envExemplo: path.join(ROOT, ".env.example"),
  servidores: path.join(ROOT, ".agents/mcp.servers.json"),
  nomenclatura: path.join(ROOT, "standards/naming-conventions.json"),
  padrao: path.join(ROOT, "standards/padrao-desenvolvimento.md"),
};
const NODE_MINIMO = ">=22.19";

const ETAPAS = ["dev", "qas", "prd", "cliente", "token"];
const argApenas = process.argv.find((a) => a.startsWith("--apenas="));
const apenas = argApenas ? argApenas.split("=")[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : ETAPAS;
for (const e of apenas) if (!ETAPAS.includes(e)) sair(`etapa desconhecida em --apenas: "${e}" (use ${ETAPAS.join(", ")})`);
const faz = (etapa) => apenas.includes(etapa);

// Um sistema por entrada de .agents/mcp.servers.json (projeto = um cliente). O DEV vai pelo vsp;
// QAS e PRD, pelo arc-1, somente leitura. O arc-1-dev é opcional e avançado: fica de fora.
const SISTEMAS = [
  { etapa: "dev", servidor: "vsp", rotulo: "DEV (desenvolvimento)", esperado: ["DEV", "SANDBOX"], padrao: true },
  { etapa: "qas", servidor: "arc-1-qas", rotulo: "QAS (somente leitura)", esperado: ["QAS"], padrao: false },
  { etapa: "prd", servidor: "arc-1-prd", rotulo: "PRD (somente leitura)", esperado: ["PRD"], padrao: false },
];

// ---------------------------------------------------------------- terminal
const cor = process.stdout.isTTY && !process.env.NO_COLOR;
const pinta = (c) => (s) => (cor ? `\x1b[${c}m${s}\x1b[0m` : s);
const negrito = pinta("1"), verde = pinta("32"), amarelo = pinta("33"), vermelho = pinta("31"), cinza = pinta("90");
const titulo = (s) => console.log(`\n${negrito(s)}`);
const ok = (s) => console.log(`  ${verde("✔")} ${s}`);
const aviso = (s) => console.log(`  ${amarelo("!")} ${s}`);
const erro = (s) => console.log(`  ${vermelho("✖")} ${s}`);
const info = (s) => console.log(`  ${cinza(s)}`);
function sair(msg, codigo = 2) {
  console.error(`setup: ${msg}`);
  process.exit(codigo);
}

// Leitura de linhas com fila: com entrada por pipe, as linhas chegam antes das perguntas e não
// podem se perder. A senha é lida com a saída do readline silenciada (sem eco nem asteriscos).
let mudo = false;
const saida = new Writable({ write(chunk, _enc, cb) { if (!mudo) process.stdout.write(chunk); cb(); } });
saida.isTTY = process.stdout.isTTY;
Object.defineProperty(saida, "columns", { get: () => process.stdout.columns });
const rl = readline.createInterface({ input: process.stdin, output: saida, terminal: Boolean(process.stdin.isTTY) });
const fila = [];
let esperando = null, fechado = false;
rl.on("line", (l) => (esperando ? (esperando(l), (esperando = null)) : fila.push(l)));
rl.on("close", () => { fechado = true; esperando?.(null); });
rl.on("SIGINT", () => { mudo = false; console.log(`\n\n${amarelo("Cancelado.")} O que já foi confirmado e gravado continua gravado.`); process.exit(130); });

async function linha(prompt, { oculto = false } = {}) {
  if (oculto || fechado) {
    // Com entrada por pipe, o readline fecha no fim da entrada, mas as respostas seguem na fila.
    process.stdout.write(prompt);
    mudo = oculto;
  } else {
    rl.setPrompt(prompt);
    rl.prompt();
  }
  const l = fila.length ? fila.shift() : fechado ? null : await new Promise((r) => (esperando = r));
  if (oculto) {
    mudo = false;
    process.stdout.write("\n");
  }
  if (l === null) sair("entrada encerrada antes do fim do assistente; nada além do já confirmado foi gravado");
  return l.trim();
}

// Pergunta com valor atual como padrão (Enter mantém) e validação opcional.
async function perguntar(texto, { atual, validar, oculto = false, opcional = false } = {}) {
  const temAtual = atual !== undefined && atual !== null && atual !== "";
  const dica = temAtual ? (oculto ? cinza(" [Enter mantém a atual]") : cinza(` [${atual}]`)) : "";
  for (;;) {
    const r = await linha(`  ${texto}${dica}: `, { oculto });
    const valor = r === "" && temAtual ? atual : r;
    if (valor === "" && !opcional) {
      aviso("obrigatório");
      continue;
    }
    const problema = valor === "" ? null : validar?.(valor);
    if (problema) {
      aviso(problema);
      continue;
    }
    return valor;
  }
}

async function confirmar(texto, padrao) {
  for (;;) {
    const r = (await linha(`  ${texto} ${cinza(padrao ? "[S/n]" : "[s/N]")} `)).toLowerCase();
    if (r === "") return padrao;
    if (["s", "sim", "y", "yes"].includes(r)) return true;
    if (["n", "nao", "não", "no"].includes(r)) return false;
  }
}

// ---------------------------------------------------------------- arquivos
const ler = (f) => fs.readFileSync(f, "utf8");
const lerEnvTexto = () => (fs.existsSync(ARQ.env) ? ler(ARQ.env) : "");
function gravarEnv(valores) {
  fs.writeFileSync(ARQ.env, atualizarDotEnv(lerEnvTexto(), valores));
}
// Valor efetivo: ambiente do sistema primeiro, depois .env (mesma ordem do launcher).
function valorAtual(nome, dotenv) {
  return valorDeVariavel(nome, process.env[nome] ?? dotenv[nome]).valor;
}

// ---------------------------------------------------------------- 1. pré-requisitos
async function preRequisitos() {
  titulo("1. Pré-requisitos");
  if (nodeAtende(NODE_MINIMO, process.versions.node)) ok(`Node.js ${process.versions.node}`);
  else aviso(`Node.js ${process.versions.node}: o ARC-1 (QAS/PRD) exige 22.19 ou superior. Instale a LTS de https://nodejs.org e rode o setup de novo.`);

  if (process.platform !== "win32") {
    const mcp = fs.existsSync(path.join(ROOT, ".mcp.json")) ? ler(path.join(ROOT, ".mcp.json")) : "";
    if (mcp.includes('"cmd"')) {
      aviso("os arquivos de MCP versionados usam \"cmd /c\", que só existe no Windows.");
      if (await confirmar("Gerar a versão para macOS/Linux agora (sync-agents --platform=unix)?", true)) {
        const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/sync-agents.mjs"), "--platform=unix"], { cwd: ROOT, stdio: "inherit" });
        if (r.status === 0) ok("arquivos de MCP gerados para macOS/Linux (não faça commit deles)");
        else erro("sync-agents falhou; veja a mensagem acima");
      }
    } else ok("arquivos de MCP já estão no formato macOS/Linux");
  }

  if (!fs.existsSync(ARQ.env)) {
    fs.copyFileSync(ARQ.envExemplo, ARQ.env);
    ok(".env criado a partir do .env.example (está no .gitignore)");
  } else ok(".env encontrado");
}

// ---------------------------------------------------------------- 2. sistemas SAP
function explicarFalha(e) {
  const msg = e?.cause?.code || e?.code ? `${e.message} (${e.cause?.code || e.code})` : e?.message || String(e);
  if (/SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|CERT_/.test(msg))
    return `${msg}\n      O certificado do SAP é de uma CA interna. Peça ao Basis a CA raiz em .pem e defina NODE_EXTRA_CA_CERTS (o setup oferece isso a seguir).`;
  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return `${msg}\n      Host não encontrado: confira a URL e se você está na VPN do cliente.`;
  if (/ECONNREFUSED|ETIMEDOUT|TimeoutError|aborted/i.test(msg)) return `${msg}\n      Sem resposta: confira a porta HTTPS do ICM, a VPN e o firewall.`;
  return msg;
}

async function oferecerCertificado() {
  if (process.env.NODE_EXTRA_CA_CERTS) {
    info(`NODE_EXTRA_CA_CERTS já está definido (${process.env.NODE_EXTRA_CA_CERTS}); confira se é a CA certa.`);
    return;
  }
  if (!(await confirmar("Informar agora o arquivo .pem da CA do cliente?", true))) return;
  const pem = await perguntar("Caminho do .pem", {
    validar: (p) => (fs.existsSync(p) && /BEGIN CERTIFICATE/.test(ler(p)) ? null : "arquivo não encontrado ou não é um certificado PEM"),
  });
  gravarVariavelUsuario("NODE_EXTRA_CA_CERTS", path.resolve(pem));
  info("O Node só lê essa variável ao iniciar: feche este terminal, abra outro e rode o setup de novo.");
  process.exit(0);
}

// Grava uma variável de ambiente permanente do usuário. No Windows, pelo registro do usuário
// (sem passar o valor na linha de comando); no macOS/Linux, mostra a linha para o perfil do shell.
function gravarVariavelUsuario(nome, valor, { secreto = false } = {}) {
  if (process.platform === "win32") {
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `[Environment]::SetEnvironmentVariable('${nome}', [Console]::In.ReadToEnd().TrimEnd(), 'User')`],
    { input: valor, encoding: "utf8", windowsHide: true });
    if (r.status === 0) {
      ok(`${nome} gravada nas variáveis do usuário`);
      info("Feche e abra o terminal e a ferramenta de IA para ela valer.");
      return true;
    }
    erro(`não foi possível gravar ${nome}: ${(r.stderr || r.error?.message || "").trim()}`);
    return false;
  }
  aviso(`acrescente ao seu ~/.bashrc ou ~/.zshrc e abra um terminal novo:`);
  console.log(`\n    export ${nome}=${secreto ? "'<o valor que você digitou>'" : `'${valor}'`}\n`);
  return false;
}

async function configurarSistema(s, servidores, resultados) {
  if (!servidores[s.servidor]) return;
  const { prefix } = prefixoDoServidor(s.servidor);
  titulo(`Sistema ${s.rotulo} — servidor ${s.servidor}`);
  let dotenv = lerDotEnv(lerEnvTexto());
  const { situacao } = situacaoConexao(prefix, (n) => process.env[n] ?? dotenv[n]);
  const atual = (n) => valorAtual(`${prefix}_${n}`, dotenv);

  if (situacao === "completa") {
    info(`já configurado: ${atual("SAP_URL")}, mandante ${atual("SAP_CLIENT")}, usuário ${atual("SAP_USER")}`);
    if (!(await confirmar("Reconfigurar ou testar de novo?", false))) return;
  } else if (!(await confirmar(`Configurar o ${s.rotulo.split(" ")[0]} agora?`, s.padrao))) {
    info("pulado. O servidor vai aparecer como falho no /mcp, o que é esperado se você não usa esse sistema.");
    return;
  }
  if (s.etapa !== "dev") info("Use um usuário só de leitura: o ARC-1 roda somente leitura em QAS/PRD.");

  for (;;) {
    const conn = {
      url: (await perguntar("URL HTTPS do SAP (ex.: https://host:44300)", {
        atual: atual("SAP_URL"),
        validar: (u) => { try { validarUrlSap(u); return null; } catch (e) { return e.message; } },
      })).replace(/\/+$/, ""),
      client: await perguntar("Mandante", { atual: atual("SAP_CLIENT"), validar: (m) => (/^\d{1,3}$/.test(m) ? null : "use 3 dígitos, ex.: 100") }),
      user: (await perguntar("Usuário", { atual: atual("SAP_USER") })).toUpperCase(),
      password: await perguntar("Senha (não aparece ao digitar)", { atual: atual("SAP_PASSWORD"), oculto: true }),
    };
    conn.client = conn.client.padStart(3, "0");

    info("conectando ao SAP para detectar o sistema...");
    let det;
    try {
      det = await detectar(conn);
    } catch (e) {
      erro(`não foi possível identificar o sistema: ${explicarFalha(e)}`);
      if (/CA interna/.test(explicarFalha(e))) await oferecerCertificado();
      if (await confirmar("Corrigir e tentar de novo?", true)) continue;
      if (await confirmar("Gravar a conexão no .env mesmo assim (sem detectar)?", false)) {
        gravarEnv(conexaoParaEnv(prefix, conn, s, null));
        aviso("gravado sem detecção; rode o doctor depois para conferir");
      }
      return;
    }

    det.avisos.forEach((a) => aviso(a));
    console.log(`\n    ${negrito(det.sid ?? "SID?")} · mandante ${det.client ?? conn.client} · ${det.produto} · ${negrito(det.ambiente)}`);
    info(`  ${det.motivo}`);
    if (det.sidOrigem === "logsys") aviso(`o SID ${det.sid} foi inferido do T000-LOGSYS, não confirmado pelo sistema`);

    const problemas = [];
    if (det.sapBasis < BASIS_MINIMO) problemas.push(`SAP_BASIS ${det.sapBasis} está fora do escopo do projeto (mínimo ${BASIS_MINIMO})`);
    if (!s.esperado.includes(det.ambiente))
      problemas.push(`você configurou como ${s.rotulo.split(" ")[0]}, mas o sistema foi detectado como ${det.ambiente}${s.etapa === "dev" ? "; o vsp vai recusar iniciar" : ""}`);
    if (det.client && det.client !== conn.client) problemas.push(`o mandante conectado é ${det.client}, não ${conn.client}`);
    if (!det.sid) problemas.push("o SID não foi detectado; o launcher vai exigir que você informe <P>_SAP_SID");
    problemas.forEach((p) => erro(p));

    const oficial = det.sapBasis >= BASIS_MCP_OFICIAL;
    if (oficial && s.etapa === "dev")
      aviso(`${det.produto}: o servidor de desenvolvimento é o abap-adt. O vsp fica configurado só como fallback (política 4.4), desligado até você precisar.`);
    if (oficial && s.etapa !== "dev")
      info(`${det.produto}: a análise é pelo abap-adt; o arc-1 fica como contingência de análise.`);

    if (problemas.length && (await confirmar("Corrigir e tentar de novo?", true))) continue;
    if (!(await confirmar("Gravar esta conexão no .env?", !problemas.length))) return;
    gravarEnv(conexaoParaEnv(prefix, conn, s, det.sid));
    ok(`gravado no .env (${prefix}_*)`);
    resultados[s.etapa] = { sid: det.sid, produto: det.produto, ambiente: det.ambiente, oficial };
    return;
  }
}

function conexaoParaEnv(prefix, conn, s, sid) {
  const valores = {
    [`${prefix}_SAP_URL`]: conn.url,
    [`${prefix}_SAP_CLIENT`]: conn.client,
    [`${prefix}_SAP_USER`]: conn.user,
    [`${prefix}_SAP_PASSWORD`]: conn.password,
  };
  // O SID detectado vira conferência: se a URL for trocada por engano, o launcher recusa.
  if (sid) valores[`${prefix}_SAP_SID`] = sid;
  if (s.etapa === "dev") {
    const atual = lerDotEnv(lerEnvTexto())[`${prefix}_ALLOWED_PACKAGES`];
    if (!atual) valores[`${prefix}_ALLOWED_PACKAGES`] = "$TMP,Z*";
  }
  return valores;
}

// ---------------------------------------------------------------- 3. parâmetros do cliente
const CAMPOS_CLIENTE = [
  { campo: "empresa", texto: "Nome da empresa (cliente)" },
  { campo: "sigla", texto: "Sigla do cliente (prefixo dos objetos)", ajustar: (v) => v.toUpperCase(),
    validar: (v) => (/^[A-Z0-9]{1,4}$/i.test(v) ? null : "use de 1 a 4 letras ou dígitos") },
  { campo: "pacotePadraoATC", texto: "Pacote padrão (ATC)", ajustar: (v) => v.toUpperCase() },
  { campo: "varianteATC", texto: "Variante ATC", ajustar: (v) => v.toUpperCase() },
  { campo: "namespaceFiori", texto: "Namespace Fiori", validar: (v) => (/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(v) ? null : "use minúsculas separadas por ponto, ex.: br.com.cliente") },
  { campo: "pastaAppsFiori", texto: "Pasta dos apps Fiori (caminho local)" },
];

async function configurarCliente(resultados) {
  titulo("Parâmetros do cliente — standards/naming-conventions.json");
  const texto = ler(ARQ.nomenclatura);
  const cliente = JSON.parse(texto).cliente;
  const pendentes = camposPendentes(cliente).filter((c) => c !== "sistemaDesenvolvimento");
  let revisar = true;
  if (!pendentes.length) {
    info("todos os parâmetros já estão preenchidos");
    revisar = await confirmar("Revisar mesmo assim?", false);
  } else info("Enter mantém o valor entre colchetes.");
  const novos = {};
  for (const c of revisar ? CAMPOS_CLIENTE : []) {
    if (!(c.campo in cliente)) continue;
    let atual = ehPlaceholder(cliente[c.campo]) ? undefined : cliente[c.campo];
    if (c.campo === "namespaceFiori" && !atual && novos.empresa)
      atual = `br.com.${novos.empresa.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "")}`;
    const v = await perguntar(c.texto, { atual, validar: c.validar, opcional: c.opcional });
    if (v !== "") novos[c.campo] = c.ajustar ? c.ajustar(v) : v;
  }

  // O sistema de desenvolvimento é o SID detectado no DEV, não digitado.
  const sidAtual = cliente.sistemaDesenvolvimento?.match(/^[A-Z][A-Z0-9]{2}$/)?.[0];
  const sidDev = resultados.dev?.sid;
  if (sidDev && sidAtual && sidAtual !== sidDev) {
    aviso(`o sistemaDesenvolvimento atual é ${sidAtual}, mas o DEV conectado agora é ${sidDev}`);
    if (await confirmar(`Trocar para ${sidDev}?`, false)) novos.sistemaDesenvolvimento = sidDev;
  } else if (sidDev && sidDev !== sidAtual) {
    novos.sistemaDesenvolvimento = sidDev;
    ok(`sistemaDesenvolvimento = ${sidDev} (detectado no DEV)`);
  } else if (!sidAtual) {
    novos.sistemaDesenvolvimento = await perguntar("SID do sistema de desenvolvimento (só nele os agentes criam objetos)", {
      validar: (v) => (/^[A-Z][A-Z0-9]{2}$/.test(v.toUpperCase()) ? null : "SID tem 3 caracteres, ex.: DS4"),
    });
    novos.sistemaDesenvolvimento = novos.sistemaDesenvolvimento.toUpperCase();
  }

  // Projeto CTS: vai na request (requests.projetoCTS), não no pacote, e nem todo cliente usa.
  const requests = JSON.parse(texto).requests;
  const cts = situacaoProjetoCTS(requests);
  let novoCTS; // undefined = sem mudança; null = não se aplica; objeto = definido
  if (cts === "pendente" || revisar) {
    console.log("");
    info("Projeto CTS: atribuído a cada request na criação (SE09/SE10), não ao pacote. Nem todo cliente usa.");
    const usa = await confirmar("Este cliente atribui projeto CTS às requests?", cts === "definido");
    if (!usa) novoCTS = null;
    else {
      const p = cts === "definido" ? requests.projetoCTS : {};
      novoCTS = {
        projeto: (await perguntar("Projeto CTS", { atual: p.projeto })).toUpperCase(),
        identificador: await perguntar("Identificação do projeto", { atual: p.identificador }),
        descricao: await perguntar("Descrição breve do projeto", { atual: p.descricao }),
      };
    }
    if (novoCTS === null && cts === "nao-se-aplica") novoCTS = undefined;
  }

  const semMudanca = !Object.keys(novos).length && novoCTS === undefined;
  if (!semMudanca) {
    if (!(await confirmar("Gravar os parâmetros do cliente?", true))) return;
    let novoTexto = Object.keys(novos).length ? atualizarCliente(texto, novos) : texto;
    if (novoCTS !== undefined) novoTexto = atualizarProjetoCTS(novoTexto, novoCTS);
    fs.writeFileSync(ARQ.nomenclatura, novoTexto);
    ok("standards/naming-conventions.json atualizado");
  }
  const ctsFinal = novoCTS !== undefined ? novoCTS : cts === "nao-se-aplica" ? null : cts === "definido" ? requests.projetoCTS : undefined;
  return preencherDocumentoPadrao({
    ...cliente, ...novos,
    ...(ctsFinal === null ? { semProjetoCTS: true } : {}),
    ...(ctsFinal ? { projetoCTS: ctsFinal.projeto, idProjetoCTS: ctsFinal.identificador, descricaoProjetoCTS: ctsFinal.descricao } : {}),
  });
}

function preencherDocumentoPadrao(valores) {
  const texto = ler(ARQ.padrao);
  const antes = placeholdersPadrao(texto);
  if (!antes.length) return;
  const novo = preencherPadrao(texto, valores);
  if (novo !== texto) {
    fs.writeFileSync(ARQ.padrao, novo);
    ok(`standards/padrao-desenvolvimento.md: ${antes.filter((p) => !novo.includes(p)).join(", ")} preenchidos`);
  }
  const restam = placeholdersPadrao(novo);
  if (restam.length) info(`ainda sem valor em padrao-desenvolvimento.md: ${restam.join(", ")}`);
}

// ---------------------------------------------------------------- 4. token do abap-adt
async function configurarToken(resultados) {
  const algum2025 = Object.values(resultados).some((r) => r?.oficial);
  const tem = Boolean(process.env.ABAP_ADT_TOKEN && !ehPlaceholder(process.env.ABAP_ADT_TOKEN));
  if (!algum2025 && !argApenas) return; // sem 2025+, só com --apenas=token
  titulo("Servidor abap-adt (S/4HANA 2025+)");
  info("O token não fica no .env: as ferramentas de IA o leem das variáveis do usuário.");
  if (tem && !(await confirmar("ABAP_ADT_TOKEN já está definido. Trocar?", false))) return;
  if (!tem && !(await confirmar("Gravar o ABAP_ADT_TOKEN agora?", true))) return;
  const token = await perguntar("Token do abap-adt (não aparece ao digitar)", { oculto: true });
  gravarVariavelUsuario("ABAP_ADT_TOKEN", token, { secreto: true });
}

// ---------------------------------------------------------------- execução
console.log(negrito("Configuração do projeto ABAP Full Stack"));
info("Senhas e token ficam só nesta máquina (.env e variáveis do usuário); não passam pela IA.");
info("Ctrl+C cancela a qualquer momento.");

await preRequisitos();
const servidores = JSON.parse(ler(ARQ.servidores)).servers;
const resultados = {};
for (const s of SISTEMAS) if (faz(s.etapa)) await configurarSistema(s, servidores, resultados);
if (faz("cliente")) await configurarCliente(resultados);
if (faz("token")) await configurarToken(resultados);

titulo("Verificação final (doctor)");
rl.close();
const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/doctor.mjs")], { cwd: ROOT, stdio: "inherit" });
process.exit(r.status ?? 1);
