// Testes do ARC-1 gerenciado (scripts/arc1-pacote.mjs), sem rede: o npm é simulado e "instala"
// um pacote falso na pasta pedida.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FalhaArc1, VARIAVEIS_EXIGIDAS, garantirArc1, localizarNpmCli, nodeAtende, pastaCache, variaveisAusentes } from "../arc1-pacote.mjs";

describe("nodeAtende", () => {
  test(">=x.y", () => {
    assert.equal(nodeAtende(">=22.19", "22.19.0"), true);
    assert.equal(nodeAtende(">=22.19", "22.18.9"), false);
    assert.equal(nodeAtende(">=22.19", "24.1.0"), true);
    assert.equal(nodeAtende(">= 24", "22.30.0"), false);
    assert.equal(nodeAtende(">=22.19.1", "22.19.0"), false);
  });
  test("formato não reconhecido -> null", () => {
    assert.equal(nodeAtende("^22 || ^24", "24.0.0"), null);
    assert.equal(nodeAtende(undefined, "24.0.0"), null);
  });
});

describe("variaveisAusentes", () => {
  const codigo = VARIAVEIS_EXIGIDAS.map((v) => `env.${v}`).join(";");
  test("todas presentes", () => assert.deepEqual(variaveisAusentes(codigo), []));
  test("variável renomeada é detectada", () => {
    assert.deepEqual(variaveisAusentes(codigo.replace("SAP_DENY_ACTIONS", "ARC1_DENY")), ["SAP_DENY_ACTIONS"]);
  });
  test("nome mais longo não conta (SAP_ALLOW_WRITES_X não é SAP_ALLOW_WRITES)", () => {
    assert.deepEqual(variaveisAusentes(codigo.replace("env.SAP_ALLOW_WRITES;", "env.SAP_ALLOW_WRITES_X;")), ["SAP_ALLOW_WRITES"]);
  });
});

describe("garantirArc1", () => {
  let tmp, chamadas, latest, publicado;
  // publicado[versao] = { engines, codigo } — o que o "npm install" grava
  const npmSimulado = (args) => {
    chamadas.push(args.slice(0, 2).join(" "));
    if (args[0] === "view") {
      if (latest instanceof Error) return { status: 1, stdout: "", stderr: "npm error network ETIMEDOUT" };
      return { status: 0, stdout: JSON.stringify(latest), stderr: "" };
    }
    if (args[0] === "install") {
      const prefixo = args[args.indexOf("--prefix") + 1];
      const versao = args.find((a) => a.startsWith("arc-1@")).split("@")[1];
      const p = publicado[versao];
      if (!p) return { status: 1, stdout: "", stderr: "npm error 404 Not Found" };
      const raiz = path.join(prefixo, "node_modules", "arc-1");
      fs.mkdirSync(path.join(raiz, "bin"), { recursive: true });
      fs.mkdirSync(path.join(raiz, "dist", "authz"), { recursive: true });
      fs.writeFileSync(path.join(raiz, "package.json"), JSON.stringify({ name: "arc-1", version: versao, bin: { "arc-1": "bin/arc1.js" }, engines: { node: p.engines } }));
      fs.writeFileSync(path.join(raiz, "bin", "arc1.js"), "");
      fs.writeFileSync(path.join(raiz, "dist", "authz", "policy.js"), p.codigo);
      return { status: 0, stdout: "", stderr: "" };
    }
    throw new Error(`npm ${args[0]} inesperado`);
  };
  const CODIGO = VARIAVEIS_EXIGIDAS.map((v) => `process.env.${v}`).join("\n");
  const opcoes = (env = {}, extra = {}) => ({
    platform: "linux", env: { XDG_CACHE_HOME: tmp, ...env }, home: tmp, versaoNode: "24.1.0",
    execPath: "/usr/bin/node", npm: npmSimulado, ...extra,
  });
  const pasta = () => pastaCache("linux", { XDG_CACHE_HOME: tmp }, tmp);

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arc1-teste-"));
    chamadas = [];
    latest = "1.10.1";
    publicado = { "1.10.1": { engines: ">=22.19", codigo: CODIGO }, "1.11.0": { engines: ">=22.19", codigo: CODIGO } };
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test("instala a última estável e executa com o Node atual", () => {
    const r = garantirArc1(opcoes());
    assert.equal(r.versao, "1.10.1");
    assert.equal(r.command, "/usr/bin/node");
    assert.equal(r.args[0], path.join(pasta(), "1.10.1", "node_modules", "arc-1", "bin", "arc1.js"));
    assert.deepEqual(fs.readdirSync(pasta()), ["1.10.1"]); // sem temporário sobrando
  });
  test("mesma versão: usa o cache sem instalar de novo", () => {
    garantirArc1(opcoes());
    chamadas = [];
    garantirArc1(opcoes());
    assert.deepEqual(chamadas, ["view arc-1@latest"]);
  });
  test("versão nova: instala e remove a anterior", () => {
    garantirArc1(opcoes());
    latest = "1.11.0";
    assert.equal(garantirArc1(opcoes()).versao, "1.11.0");
    assert.deepEqual(fs.readdirSync(pasta()), ["1.11.0"]);
  });
  test("sem acesso ao npm: usa a versão mais nova do cache, com aviso", () => {
    garantirArc1(opcoes());
    latest = new Error();
    const avisos = [];
    assert.equal(garantirArc1(opcoes({}, { log: (m) => avisos.push(m) })).versao, "1.10.1");
    assert.ok(avisos.some((a) => a.includes("cache") && a.includes("ETIMEDOUT")));
  });
  test("sem acesso ao npm e sem cache: orienta a usar ARC1_BIN", () => {
    latest = new Error();
    assert.throws(() => garantirArc1(opcoes()), (e) => e instanceof FalhaArc1 && /ARC1_BIN/.test(e.message));
  });
  test("ARC1_VERSION fixa a versão e não consulta a última", () => {
    latest = "1.11.0";
    assert.equal(garantirArc1(opcoes({ ARC1_VERSION: "1.10.1" })).versao, "1.10.1");
    assert.ok(!chamadas.some((c) => c.startsWith("view")));
  });
  test("ARC1_VERSION inválida é recusada", () => {
    assert.throws(() => garantirArc1(opcoes({ ARC1_VERSION: "latest" })), (e) => e instanceof FalhaArc1 && /ARC1_VERSION/.test(e.message));
  });
  test("falha do npm install não deixa nada no cache", () => {
    latest = "9.9.9";
    assert.throws(() => garantirArc1(opcoes()), (e) => e instanceof FalhaArc1 && /404/.test(e.message));
    assert.deepEqual(fs.readdirSync(pasta()), []);
  });
  test("Node abaixo do engines da versão nova é recusado", () => {
    publicado["1.10.1"].engines = ">=26";
    assert.throws(() => garantirArc1(opcoes()), (e) => e instanceof FalhaArc1 && /Node\.js >=26/.test(e.message));
  });
  test("versão que não reconhece uma variável de segurança é recusada", () => {
    publicado["1.10.1"].codigo = CODIGO.replace("SAP_ALLOW_FREE_SQL", "SAP_FREE_SQL");
    assert.throws(() => garantirArc1(opcoes()), (e) => e instanceof FalhaArc1 && /SAP_ALLOW_FREE_SQL/.test(e.message));
  });
  test("cache incompleto (sem bin) é instalado de novo", () => {
    garantirArc1(opcoes());
    fs.rmSync(path.join(pasta(), "1.10.1", "node_modules", "arc-1", "bin"), { recursive: true });
    chamadas = [];
    garantirArc1(opcoes());
    assert.ok(chamadas.includes("install --prefix"));
  });
});

describe("localizarNpmCli", () => {
  test("acha o npm-cli.js do Node em uso (o desta máquina)", () => {
    const cli = localizarNpmCli(process.execPath, {});
    assert.ok(cli && cli.endsWith("npm-cli.js") && fs.existsSync(cli));
  });
  test("Node sem npm ao lado -> null", () => {
    assert.equal(localizarNpmCli(path.join(os.tmpdir(), "nao-existe", "node"), {}), null);
  });
});
