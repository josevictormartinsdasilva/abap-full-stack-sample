// Testes de ponta a ponta do launcher (scripts/mcp-launch.mjs), sem SAP: só os caminhos que
// recusam antes de conectar. Usa --diagnostico para não tocar em .agents/runtime/.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LAUNCHER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "mcp-launch.mjs");
const SERVIDOR = "arc-1-teste"; // prefixo ARC1_TESTE: não colide com o .env do projeto

function executar(extra) {
  const env = {};
  for (const [k, val] of Object.entries(process.env))
    if (!/^(SAP_|ARC1_|VSP_|NODE_TLS_REJECT_UNAUTHORIZED$|NODE_OPTIONS$|NODE_TEST_CONTEXT$)/i.test(k)) env[k] = val;
  Object.assign(env, {
    ARC1_TESTE_SAP_URL: "https://127.0.0.1:1",
    ARC1_TESTE_SAP_CLIENT: "100",
    ARC1_TESTE_SAP_USER: "teste",
    ARC1_TESTE_SAP_PASSWORD: "teste",
    ARC1_BIN: process.execPath, // "node --version" passa na verificação de binário
    ...extra,
  });
  const r = spawnSync(process.execPath, [LAUNCHER, SERVIDOR, "--diagnostico"], { env, encoding: "utf8", timeout: 60000 });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout };
}

describe("mcp-launch — recusas antes de conectar", () => {
  test("NODE_TLS_REJECT_UNAUTHORIZED=0 recusa com mensagem clara (1.3)", () => {
    const r = executar({ NODE_TLS_REJECT_UNAUTHORIZED: "0" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /NODE_TLS_REJECT_UNAUTHORIZED=0.*NODE_EXTRA_CA_CERTS/s);
    assert.equal(r.stdout, "", "stdout é o canal MCP e deve ficar vazio");
  });
  test("URL http:// remota recusa (1.4)", () => {
    const r = executar({ ARC1_TESTE_SAP_URL: "http://sap.exemplo.com:8000" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /ARC1_TESTE_SAP_URL: a URL do SAP precisa ser https:\/\//);
  });
  test("URL http://localhost passa da validação e chega à conexão (1.4)", () => {
    const r = executar({ ARC1_TESTE_SAP_URL: "http://127.0.0.1:1" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /não foi possível identificar o sistema em http:\/\/127\.0\.0\.1:1/);
    assert.doesNotMatch(r.stderr, /precisa ser https/);
  });
});
