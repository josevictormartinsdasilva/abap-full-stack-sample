// Testes do estado de runtime (scripts/mcp-runtime.mjs), item 2.6. Rodar: node --test scripts/test/
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { arquivoDaSessao, gravarEstado, listarAtivos, processoVivo, removerEstado } from "../mcp-runtime.mjs";

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-runtime-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const estado = (servidor, pid, extra = {}) => ({ servidor, pid, sid: "DS4", mandante: "100", ambiente: "DEV", ...extra });
const arquivos = () => fs.readdirSync(dir).sort();

describe("processoVivo", () => {
  test("o próprio processo está vivo", () => assert.equal(processoVivo(process.pid), true));
  test("pid inválido não está vivo", () => {
    for (const pid of [0, -1, 1.5, "123", null, undefined]) assert.equal(processoVivo(pid), false, String(pid));
  });
  test("processo encerrado não está vivo", () => {
    const r = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
    assert.equal(processoVivo(Number(r.stdout)), false);
  });
});

describe("gravar, listar e remover", () => {
  test("um arquivo por sessão: <servidor>.<pid>.json", () => {
    const f = gravarEstado(dir, estado("vsp", 101));
    assert.equal(f, arquivoDaSessao(dir, "vsp", 101));
    assert.deepEqual(arquivos(), ["vsp.101.json"]);
  });
  test("encerrar uma de duas sessões no mesmo servidor não apaga a outra", () => {
    gravarEstado(dir, estado("vsp", 101));
    gravarEstado(dir, estado("vsp", 202));
    removerEstado(dir, "vsp", 101);
    assert.deepEqual(arquivos(), ["vsp.202.json"]);
  });
  test("removerEstado não apaga arquivo cujo pid gravado é outro", () => {
    fs.writeFileSync(arquivoDaSessao(dir, "vsp", 101), JSON.stringify(estado("vsp", 999)));
    removerEstado(dir, "vsp", 101);
    assert.deepEqual(arquivos(), ["vsp.101.json"]);
  });
  test("listarAtivos devolve os vivos e remove os mortos", () => {
    gravarEstado(dir, estado("vsp", 101));
    gravarEstado(dir, estado("arc-1", 202));
    gravarEstado(dir, estado("arc-1", 303));
    const ativos = listarAtivos(dir, { vivo: (pid) => pid !== 202 });
    assert.deepEqual(ativos.map((e) => e.pid).sort(), [101, 303]);
    assert.deepEqual(arquivos(), ["arc-1.303.json", "vsp.101.json"]);
  });
  test("listarAtivos filtrado por servidor só mexe nos arquivos daquele servidor", () => {
    gravarEstado(dir, estado("vsp", 101));
    gravarEstado(dir, estado("arc-1", 202));
    const ativos = listarAtivos(dir, { servidor: "vsp", vivo: () => false });
    assert.deepEqual(ativos, []);
    assert.deepEqual(arquivos(), ["arc-1.202.json"]);
  });
  test("arquivo ilegível e arquivo do formato antigo (<servidor>.json) de processo morto são removidos", () => {
    fs.writeFileSync(path.join(dir, "vsp.555.json"), "{ incompleto");
    fs.writeFileSync(path.join(dir, "arc-1.json"), JSON.stringify(estado("arc-1", 777)));
    assert.deepEqual(listarAtivos(dir, { vivo: () => false }), []);
    assert.deepEqual(arquivos(), []);
  });
  test("diretório inexistente: lista vazia", () => {
    assert.deepEqual(listarAtivos(path.join(dir, "nao-existe")), []);
  });
  test("gravação não deixa arquivo temporário", () => {
    gravarEstado(dir, estado("vsp", 101));
    assert.ok(!arquivos().some((f) => f.endsWith(".tmp")));
  });
});

describe("CLI", () => {
  test("node scripts/mcp-runtime.mjs imprime um array JSON em stdout", () => {
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "mcp-runtime.mjs");
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(Array.isArray(JSON.parse(r.stdout)));
  });
});
