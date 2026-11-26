#!/usr/bin/env node
// Roda um comando Node (servidor fiori-mcp, preview de app Fiori) confiando nos certificados
// fixados das conexões SAP (ADR-0013 e ADR-0016).
//
//   node scripts/com-certificados.mjs <comando> [argumentos...]
//   ex., na pasta de um app Fiori:  node ../../scripts/com-certificados.mjs npm start
//
// Junta os .pem de todas as variáveis <P>_SAP_CA_CERT (ambiente ou .env da raiz do projeto, as
// mesmas que o setup grava para o launcher) e o NODE_EXTRA_CA_CERTS que o usuário já tenha
// definido num único arquivo em .agents/certs/ (não versionado), e aponta NODE_EXTRA_CA_CERTS
// para ele. Sem certificado fixado, roda o comando sem mudar o ambiente.
//
// Nunca desliga a verificação TLS: recusa iniciar com NODE_TLS_REJECT_UNAUTHORIZED=0.
// Mensagens vão para o stderr: o stdout é do comando (no fiori-mcp, o protocolo MCP).
//
// Sem dependências: só Node.js >= 18.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Recusa, comandoParaSpawn, valorDeVariavel, verificarTls } from "./mcp-politica.mjs";
import { lerDotEnv } from "./config-local.mjs";
import { PASTA_CERTS, lerCertificado } from "./sap-tls.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ARQUIVO_BUNDLE = `${PASTA_CERTS}/node-extra-ca.pem`;

// Variáveis <P>_SAP_CA_CERT preenchidas (sem placeholder), em ordem de nome. O ambiente
// prevalece sobre o .env, como no launcher.
export function certificadosFixados(dotenv, env) {
  const nomes = new Set([...Object.keys(dotenv), ...Object.keys(env)].filter((k) => /(^|_)SAP_CA_CERT$/.test(k)));
  return [...nomes].sort()
    .map((nome) => ({ nome, valor: valorDeVariavel(nome, env[nome] ?? dotenv[nome]).valor }))
    .filter((c) => c.valor);
}

// Concatena os PEM sem repetir certificado (o mesmo .pem pode servir a mais de uma conexão).
export function montarBundle(pems) {
  const blocos = new Set();
  for (const pem of pems)
    for (const b of pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [])
      blocos.add(b.replace(/\r\n/g, "\n").trim());
  return blocos.size ? [...blocos].join("\n") + "\n" : "";
}

// No Windows, npm/npx/pnpm/yarn são scripts .cmd. O spawn não os acha sem a extensão, e o
// cmd.exe precisa do caminho completo: com o nome entre aspas, o %~dp0 do script aponta para a
// pasta atual em vez da pasta do npm. existe() é injetável para os testes.
export function resolverComando(command, platform, env = process.env, existe = fs.existsSync) {
  if (platform !== "win32" || !/^(npm|npx|pnpm|yarn)$/i.test(command)) return command;
  const nome = `${command}.cmd`;
  const dirs = String(env.Path ?? env.PATH ?? "").split(";").filter(Boolean);
  for (const d of dirs) {
    const candidato = path.win32.join(d, nome);
    if (existe(candidato)) return candidato;
  }
  return nome;
}

function main() {
  const log = (msg) => process.stderr.write(`[com-certificados] ${msg}\n`);
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    log("informe o comando (ex.: node scripts/com-certificados.mjs npm start)");
    process.exit(2);
  }
  try {
    verificarTls(process.env);
  } catch (e) {
    log(e.message);
    process.exit(1);
  }

  const arquivoEnv = path.join(ROOT, ".env");
  const dotenv = fs.existsSync(arquivoEnv) ? lerDotEnv(fs.readFileSync(arquivoEnv, "utf8")) : {};
  const pems = [];
  for (const { nome, valor } of certificadosFixados(dotenv, process.env)) {
    try {
      pems.push(lerCertificado(ROOT, valor).pem);
    } catch (e) {
      log(`aviso: ${nome}: ${e.message}. Rode node scripts/setup.mjs para fixar o certificado de novo.`);
    }
  }
  const extra = process.env.NODE_EXTRA_CA_CERTS;
  if (extra && fs.existsSync(extra)) pems.push(fs.readFileSync(extra, "utf8"));

  const env = { ...process.env };
  const bundle = montarBundle(pems);
  if (bundle) {
    const arquivo = path.join(ROOT, ARQUIVO_BUNDLE);
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    // Grava e renomeia: o fiori-mcp e o preview podem iniciar ao mesmo tempo.
    const tmp = `${arquivo}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, bundle);
    fs.renameSync(tmp, arquivo);
    env.NODE_EXTRA_CA_CERTS = arquivo;
  }

  let spawnArgs;
  try {
    spawnArgs = comandoParaSpawn(resolverComando(command, process.platform), args, process.platform);
  } catch (e) {
    log(e instanceof Recusa ? e.message : String(e));
    process.exit(1);
  }
  // Com shell, comandoParaSpawn já pôs cada parte entre aspas: vai como linha única.
  const filho = spawnArgs.shell
    ? spawn([spawnArgs.command, ...spawnArgs.args].join(" "), { stdio: "inherit", shell: true, env, windowsHide: true })
    : spawn(spawnArgs.command, spawnArgs.args, { stdio: "inherit", env, windowsHide: true });
  for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => filho.kill(sinal));
  filho.on("error", (e) => {
    log(`não foi possível iniciar ${command}: ${e.message}`);
    process.exit(1);
  });
  filho.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
