// Testes do wrapper que roda o fiori-mcp e o preview com os certificados fixados
// (scripts/com-certificados.mjs, ADR-0016).
// Rodar: node --test scripts/test/
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { certificadosFixados, montarBundle, resolverComando } from "../com-certificados.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "com-certificados.mjs");
const pem = (x) => `-----BEGIN CERTIFICATE-----\n${x}\n-----END CERTIFICATE-----\n`;

describe("certificadosFixados", () => {
  test("pega todo <P>_SAP_CA_CERT, de qualquer conexão", () => {
    const r = certificadosFixados(
      { VSP_SAP_CA_CERT: ".agents/certs/vsp.pem", ARC1_QAS_SAP_CA_CERT: ".agents/certs/arc-1-qas.pem", VSP_SAP_URL: "https://x" }, {});
    assert.deepEqual(r.map((c) => c.nome), ["ARC1_QAS_SAP_CA_CERT", "VSP_SAP_CA_CERT"]);
  });
  test("o ambiente prevalece sobre o .env", () => {
    const r = certificadosFixados({ VSP_SAP_CA_CERT: "a.pem" }, { VSP_SAP_CA_CERT: "b.pem" });
    assert.deepEqual(r, [{ nome: "VSP_SAP_CA_CERT", valor: "b.pem" }]);
  });
  test("ignora vazio e placeholder do .env.example", () => {
    assert.deepEqual(certificadosFixados({ VSP_SAP_CA_CERT: "", ARC1_DEV_SAP_CA_CERT: "<caminho>" }, {}), []);
  });
});

describe("montarBundle", () => {
  test("concatena e remove certificado repetido", () => {
    const b = montarBundle([pem("AAA"), pem("BBB") + pem("AAA").replace(/\n/g, "\r\n")]);
    assert.equal(b.match(/BEGIN CERTIFICATE/g).length, 2);
    assert.match(b, /AAA/);
    assert.match(b, /BBB/);
  });
  test("sem certificado: vazio (o ambiente fica como está)", () => {
    assert.equal(montarBundle([]), "");
    assert.equal(montarBundle(["não é PEM"]), "");
  });
});

describe("resolverComando", () => {
  const NPX = String.raw`C:\Program Files\nodejs\npx.cmd`;
  const env = { Path: String.raw`C:\Windows;C:\Program Files\nodejs` };
  const existe = (p) => p === NPX;
  test("Windows: npx vira o caminho completo do npx.cmd no PATH", () => {
    assert.equal(resolverComando("npx", "win32", env, existe), NPX);
  });
  test("Windows: fora do PATH, ao menos com a extensão", () => {
    assert.equal(resolverComando("npm", "win32", env, existe), "npm.cmd");
  });
  test("Windows: node e caminhos explícitos ficam como estão", () => {
    assert.equal(resolverComando("node", "win32", env, existe), "node");
  });
  test("fora do Windows, sem mudança", () => assert.equal(resolverComando("npx", "linux", env, existe), "npx"));
});

describe("execução", () => {
  test("sem comando: erro de uso", () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /informe o comando/);
  });
  test("recusa NODE_TLS_REJECT_UNAUTHORIZED=0", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "node", "-e", "0"], {
      encoding: "utf8", env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /NODE_TLS_REJECT_UNAUTHORIZED=0/);
  });
});
