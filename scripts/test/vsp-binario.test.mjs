// Testes do binário gerenciado do vsp (scripts/vsp-binario.mjs), sem rede: o GitHub é simulado.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FalhaVsp, VSP_SHA256, VSP_VERSAO, assetDaPlataforma, garantirVsp, pastaCache } from "../vsp-binario.mjs";

describe("assetDaPlataforma", () => {
  test("mapeia as plataformas publicadas", () => {
    assert.equal(assetDaPlataforma("win32", "x64"), "vsp-windows-amd64.exe");
    assert.equal(assetDaPlataforma("win32", "arm64"), "vsp-windows-arm64.exe");
    assert.equal(assetDaPlataforma("linux", "x64"), "vsp-linux-amd64");
    assert.equal(assetDaPlataforma("darwin", "arm64"), "vsp-darwin-arm64");
  });
  test("plataforma sem binário -> null", () => {
    assert.equal(assetDaPlataforma("win32", "ia32"), null);
    assert.equal(assetDaPlataforma("freebsd", "x64"), null);
  });
  test("todo asset tem SHA-256 de 64 hex", () => {
    for (const h of Object.values(VSP_SHA256)) assert.match(h, /^[0-9a-f]{64}$/);
  });
});

describe("pastaCache", () => {
  test("Windows usa LOCALAPPDATA e a versão", () => {
    const p = pastaCache("win32", { LOCALAPPDATA: "C:\\U\\AppData\\Local" }, "C:\\U");
    assert.ok(p.includes("abap-full-stack") && p.endsWith(VSP_VERSAO));
    assert.ok(p.startsWith("C:\\U\\AppData\\Local"));
  });
  test("Linux usa XDG_CACHE_HOME ou ~/.cache", () => {
    assert.ok(pastaCache("linux", { XDG_CACHE_HOME: "/x" }, "/h").startsWith(path.join("/x")));
    assert.ok(pastaCache("linux", {}, "/h").startsWith(path.join("/h", ".cache")));
  });
});

describe("garantirVsp", () => {
  const BIN = Buffer.from("binário falso do vsp");
  const HASH_REAL = VSP_SHA256["vsp-linux-amd64"];
  let tmp, chamadas;
  const SHA = crypto.createHash("sha256").update(BIN).digest("hex");

  // Usa o asset linux-amd64 com o hash trocado pelo do binário falso; restaura no afterEach.
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vsp-teste-"));
    chamadas = 0;
    VSP_SHA256["vsp-linux-amd64"] = SHA;
  });
  afterEach(() => {
    VSP_SHA256["vsp-linux-amd64"] = HASH_REAL;
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const opcoes = (conteudo, status = 200) => ({
    platform: "linux", arch: "x64", env: { XDG_CACHE_HOME: tmp }, home: tmp,
    fetch: async (url) => {
      chamadas++;
      assert.ok(url.endsWith(`/v${VSP_VERSAO}/vsp-linux-amd64`));
      return new Response(conteudo, { status });
    },
  });

  test("baixa, confere e grava no cache", async () => {
    const destino = await garantirVsp(opcoes(BIN));
    assert.deepEqual(fs.readFileSync(destino), BIN);
    assert.equal(chamadas, 1);
    assert.deepEqual(fs.readdirSync(path.dirname(destino)), ["vsp"]); // sem .tmp sobrando
  });
  test("segunda execução usa o cache sem baixar", async () => {
    await garantirVsp(opcoes(BIN));
    await garantirVsp(opcoes(BIN));
    assert.equal(chamadas, 1);
  });
  test("cache adulterado é baixado de novo", async () => {
    const destino = await garantirVsp(opcoes(BIN));
    fs.writeFileSync(destino, "adulterado");
    await garantirVsp(opcoes(BIN));
    assert.equal(chamadas, 2);
    assert.deepEqual(fs.readFileSync(destino), BIN);
  });
  test("download com hash diferente é recusado e não grava nada", async () => {
    await assert.rejects(garantirVsp(opcoes(Buffer.from("outro conteúdo"))), (e) => e instanceof FalhaVsp && /SHA-256/.test(e.message));
    assert.equal(fs.existsSync(pastaCache("linux", { XDG_CACHE_HOME: tmp }, tmp)), false);
  });
  test("falha de rede orienta a usar VSP_BIN", async () => {
    await assert.rejects(garantirVsp(opcoes("", 404)), (e) => e instanceof FalhaVsp && /VSP_BIN/.test(e.message));
  });
  test("plataforma sem binário orienta a usar VSP_BIN", async () => {
    await assert.rejects(garantirVsp({ ...opcoes(BIN), arch: "ia32" }), (e) => e instanceof FalhaVsp && /VSP_BIN/.test(e.message));
    assert.equal(chamadas, 0);
  });
});
