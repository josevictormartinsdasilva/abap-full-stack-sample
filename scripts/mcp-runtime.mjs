#!/usr/bin/env node
// Estado dos servidores arc-1/vsp em execução, para o orquestrador rotear (política, seção 3).
//
//   node scripts/mcp-runtime.mjs      lista em stdout (JSON) os servidores ativos e remove os
//                                     arquivos de processos que já terminaram
//
// Cada execução do launcher grava .agents/runtime/<servidor>.<pid>.json. Assim, duas sessões
// no mesmo servidor (ex.: Claude Code e Codex) não apagam o arquivo uma da outra, e um arquivo
// deixado por um processo morto à força (no Windows, matar o cmd /c não dispara "exit") é
// reconhecido pelo pid e descartado.
//
// Sem dependências: só Node.js >= 18.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RUNTIME_DIR = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), ".agents/runtime");

export const arquivoDaSessao = (dir, servidor, pid) => path.join(dir, `${servidor}.${pid}.json`);

// process.kill(pid, 0) não envia sinal: só testa se o processo existe. EPERM = existe, de outro usuário.
export function processoVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function lerEstados(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
    const arquivo = path.join(dir, f);
    try {
      return { arquivo, estado: JSON.parse(fs.readFileSync(arquivo, "utf8")) };
    } catch {
      return { arquivo, estado: null }; // ilegível (ex.: gravação interrompida): tratado como morto
    }
  });
}

// Remove os arquivos cujo processo terminou (de todos os servidores, ou só de um) e devolve os vivos.
export function listarAtivos(dir = RUNTIME_DIR, { servidor, vivo = processoVivo } = {}) {
  const ativos = [];
  for (const { arquivo, estado } of lerEstados(dir)) {
    if (servidor && estado?.servidor !== servidor) continue;
    if (estado && vivo(estado.pid)) ativos.push(estado);
    else fs.rmSync(arquivo, { force: true });
  }
  return ativos;
}

// Grava o estado da sessão. Gravação atômica (arquivo temporário + rename) para que um leitor
// concorrente nunca veja JSON pela metade.
export function gravarEstado(dir, estado) {
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = arquivoDaSessao(dir, estado.servidor, estado.pid);
  const tmp = `${arquivo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(estado, null, 2) + "\n");
  fs.renameSync(tmp, arquivo);
  return arquivo;
}

// Apaga só o arquivo desta sessão, e só se o pid gravado for o próprio.
export function removerEstado(dir, servidor, pid) {
  const arquivo = arquivoDaSessao(dir, servidor, pid);
  try {
    if (JSON.parse(fs.readFileSync(arquivo, "utf8")).pid === pid) fs.rmSync(arquivo, { force: true });
  } catch { /* já removido ou ilegível: sem efeito */ }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.stdout.write(JSON.stringify(listarAtivos(), null, 2) + "\n");
}
