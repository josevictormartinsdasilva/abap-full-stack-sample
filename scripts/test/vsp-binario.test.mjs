// Testes do binário gerenciado do vsp (scripts/vsp-binario.mjs), sem rede: o GitHub é simulado.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FLAGS_EXIGIDAS, FalhaVsp, assetDaPlataforma, flagsAusentes, garantirVsp, lerChecksums, pastaCache } from "../vsp-binario.mjs";

const sha = (x) => crypto.createHash("sha256").update(x).digest("hex");

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
});

describe("pastaCache", () => {
  test("Windows usa LOCALAPPDATA", () => {
    assert.equal(pastaCache("win32", { LOCALAPPDATA: "C:\\U\\L" }, "C:\\U"), path.join("C:\\U\\L", "abap-full-stack", "vsp"));
  });
  test("Linux usa XDG_CACHE_HOME ou ~/.cache", () => {
    assert.equal(pastaCache("linux", { XDG_CACHE_HOME: "/x" }, "/h"), path.join("/x", "abap-full-stack", "vsp"));
    assert.equal(pastaCache("linux", {}, "/h"), path.join("/h", ".cache", "abap-full-stack", "vsp"));
  });
});

describe("lerChecksums", () => {
  test("formato do sha256sum, com e sem *", () => {
    const h = "a".repeat(64);
    assert.deepEqual(lerChecksums(`${h}  vsp-linux-amd64\r\n${h} *vsp.exe\nlixo\n`), { "vsp-linux-amd64": h, "vsp.exe": h });
  });
});

describe("flagsAusentes", () => {
  const ajuda = FLAGS_EXIGIDAS.map((f) => `      ${f} string   descrição`).join("\n");
  test("ajuda com todas as flags -> nenhuma ausente", () => assert.deepEqual(flagsAusentes(ajuda), []));
  test("flag renomeada é detectada", () => {
    assert.deepEqual(flagsAusentes(ajuda.replace("--block-free-sql", "--no-free-sql")), ["--block-free-sql"]);
  });
  test("prefixo não conta como a flag (--read-only-x não é --read-only)", () => {
    assert.deepEqual(flagsAusentes(ajuda.replace("--read-only ", "--read-only-x ")), ["--read-only"]);
  });
});

describe("garantirVsp", () => {
  const ASSET = "vsp-linux-amd64";
  let tmp, pedidos, releases, latest;
  // releases: { "2.62.1": Buffer } — binário publicado por versão; latest: versão estável ou Error
  const fetchSimulado = async (url, init = {}) => {
    pedidos.push(url);
    if (url.endsWith("/releases/latest")) {
      if (latest instanceof Error) throw latest;
      return new Response(null, { status: 302, headers: { location: `https://github.com/oisee/vibing-steampunk/releases/tag/v${latest}` } });
    }
    const m = url.match(/\/download\/v([\d.]+)\/(.+)$/);
    const bin = m && releases[m[1]];
    if (!bin) return new Response("", { status: 404 });
    if (m[2] === "checksums.txt") return new Response(`${sha(bin.publicado ?? bin)}  ${ASSET}\n`);
    if (m[2] === ASSET) return new Response(bin);
    return new Response("", { status: 404 });
  };
  const opcoes = (env = {}) => ({ platform: "linux", arch: "x64", env: { XDG_CACHE_HOME: tmp, ...env }, home: tmp, fetch: fetchSimulado });
  const pasta = () => pastaCache("linux", { XDG_CACHE_HOME: tmp }, tmp);

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vsp-teste-"));
    pedidos = [];
    releases = { "2.62.1": Buffer.from("vsp 2.62.1"), "2.63.0": Buffer.from("vsp 2.63.0") };
    latest = "2.62.1";
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test("baixa a última estável, confere e grava no cache", async () => {
    const r = await garantirVsp(opcoes());
    assert.equal(r.versao, "2.62.1");
    assert.deepEqual(fs.readFileSync(r.caminho), releases["2.62.1"]);
    assert.deepEqual(fs.readdirSync(path.dirname(r.caminho)).sort(), ["checksums.txt", "vsp"]); // sem .tmp
  });
  test("mesma versão: usa o cache sem baixar o binário de novo", async () => {
    await garantirVsp(opcoes());
    pedidos = [];
    await garantirVsp(opcoes());
    assert.deepEqual(pedidos.map((u) => u.split("/").pop()), ["latest"]);
  });
  test("release nova: baixa e remove a anterior do cache", async () => {
    await garantirVsp(opcoes());
    latest = "2.63.0";
    const r = await garantirVsp(opcoes());
    assert.equal(r.versao, "2.63.0");
    assert.deepEqual(fs.readdirSync(pasta()), ["2.63.0"]);
  });
  test("sem acesso ao GitHub: usa a versão mais nova do cache, com aviso", async () => {
    await garantirVsp(opcoes());
    latest = new Error("fetch failed");
    const avisos = [];
    const r = await garantirVsp({ ...opcoes(), log: (m) => avisos.push(m) });
    assert.equal(r.versao, "2.62.1");
    assert.ok(avisos.some((a) => a.includes("cache")));
  });
  test("sem acesso ao GitHub e sem cache: orienta a usar VSP_BIN", async () => {
    latest = new Error("fetch failed");
    await assert.rejects(garantirVsp(opcoes()), (e) => e instanceof FalhaVsp && /VSP_BIN/.test(e.message));
  });
  test("VSP_VERSION fixa a versão e não consulta a última", async () => {
    latest = "2.63.0";
    const r = await garantirVsp(opcoes({ VSP_VERSION: "v2.62.1" }));
    assert.equal(r.versao, "2.62.1");
    assert.ok(!pedidos.some((u) => u.endsWith("/latest")));
  });
  test("VSP_VERSION inválida é recusada", async () => {
    await assert.rejects(garantirVsp(opcoes({ VSP_VERSION: "../../x" })), (e) => e instanceof FalhaVsp && /VSP_VERSION/.test(e.message));
  });
  test("cache adulterado é baixado de novo", async () => {
    const r = await garantirVsp(opcoes());
    fs.writeFileSync(r.caminho, "adulterado");
    await garantirVsp(opcoes());
    assert.deepEqual(fs.readFileSync(r.caminho), releases["2.62.1"]);
  });
  test("binário que não confere com o checksums.txt é recusado e não grava nada", async () => {
    releases["2.62.1"] = Object.assign(Buffer.from("trocado no caminho"), { publicado: "original" });
    await assert.rejects(garantirVsp(opcoes()), (e) => e instanceof FalhaVsp && /checksums\.txt/.test(e.message));
    assert.equal(fs.existsSync(path.join(pasta(), "2.62.1", "vsp")), false);
  });
  test("release sem o binário da plataforma orienta a fixar versão anterior", async () => {
    releases["2.62.1"] = Object.assign(Buffer.from("x"), { publicado: "x" });
    const original = fetchSimulado;
    const opc = { ...opcoes(), fetch: async (url, init) => url.endsWith("checksums.txt") ? new Response(`${"b".repeat(64)}  outro\n`) : original(url, init) };
    await assert.rejects(garantirVsp(opc), (e) => e instanceof FalhaVsp && /VSP_VERSION/.test(e.message));
  });
  test("plataforma sem binário orienta a usar VSP_BIN, sem rede", async () => {
    await assert.rejects(garantirVsp({ ...opcoes(), arch: "ia32" }), (e) => e instanceof FalhaVsp && /VSP_BIN/.test(e.message));
    assert.equal(pedidos.length, 0);
  });
});
