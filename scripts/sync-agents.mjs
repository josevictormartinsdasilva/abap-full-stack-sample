#!/usr/bin/env node
// Gera os adaptadores de cada ferramenta de IA a partir da fonte única em .agents/.
//
//   node scripts/sync-agents.mjs                    gera/atualiza os arquivos
//   node scripts/sync-agents.mjs --check            só verifica (exit 1 se algo estiver desatualizado) — usado na CI
//   node scripts/sync-agents.mjs --platform=unix    gera MCP stdio sem o wrapper "cmd /c" (uso local em macOS/Linux; não faça commit)
//
// Fontes (edite estas):
//   .agents/agents/<nome>.md        subagentes (frontmatter: name, description, skill; corpo com o marcador {{skill}})
//   .agents/skills/<nome>/**        skills
//   .agents/mcp.servers.json        servidores MCP
//   AGENTS.md                       regras do orquestrador (lido nativamente pelas ferramentas; não é gerado)
//
// Gerados (não edite):
//   .claude/agents/*.md  .claude/skills/**  .claude/settings.json (só as chaves gerenciadas)  .mcp.json
//   .codex/agents/*.toml  .codex/config.toml
//   .kimi-code/agents/*.md  .kimi-code/mcp.json
//   .agents/mcp_config.json  (Antigravity)
//
// Sem dependências: só Node.js >= 18.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const PLATFORM = (args.find((a) => a.startsWith("--platform=")) || "--platform=windows").split("=")[1];
if (!["windows", "unix"].includes(PLATFORM)) fail(`--platform inválido: ${PLATFORM} (use windows ou unix)`);

const GEN = "GERADO por scripts/sync-agents.mjs — não edite; altere a fonte em .agents/ e rode o script.";

// ---------------------------------------------------------------- utilidades
function fail(msg) {
  console.error(`sync-agents: ${msg}`);
  process.exit(2);
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const listDirs = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : []);
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const json = (o) => JSON.stringify(o, null, 2) + "\n";
const tomlStr = (s) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
const tomlArr = (a) => "[" + a.map(tomlStr).join(", ") + "]";

// Frontmatter YAML mínimo: "chave: valor" e "chave: >-" seguido de linhas indentadas.
function parseFrontmatter(text, file) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) fail(`${file}: frontmatter ausente`);
  const meta = {};
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) fail(`${file}: linha de frontmatter não suportada: "${lines[i]}"`);
    const [, key, val] = kv;
    if (val === ">-" || val === ">") {
      const folded = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) folded.push(lines[++i].trim());
      meta[key] = { folded };
    } else {
      meta[key] = val.replace(/^["']|["']$/g, "");
    }
  }
  return { meta, body: m[2] };
}
const flat = (v) => (typeof v === "object" ? v.folded.join(" ") : v);
const yamlDesc = (v) => (typeof v === "object" ? ["description: >-", ...v.folded.map((l) => "  " + l)].join("\n") : `description: ${v}`);

// Remove o marcador {{skill}} ou o substitui pela instrução de carregar a skill.
function renderBody(body, skillSection) {
  const out = skillSection ? body.replace("{{skill}}", skillSection) : body.replace(/\n*\{\{skill\}\}\n*/, "\n\n");
  return out.replace(/^\n+/, "").replace(/\n*$/, "\n");
}
const skillSection = (skill, invoke) =>
  `## Skill (obrigatória)\nAntes de começar, carregue a skill \`${skill}\` (\`${invoke}\`, em \`.agents/skills/${skill}/SKILL.md\`) e siga suas regras.`;

// ---------------------------------------------------------------- fontes
const agentsDir = path.join(ROOT, ".agents/agents");
const agents = fs
  .readdirSync(agentsDir)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => {
    const file = path.join(agentsDir, f);
    const { meta, body } = parseFrontmatter(read(file), rel(file));
    for (const k of ["name", "description", "skill"]) if (!meta[k]) fail(`${rel(file)}: campo "${k}" obrigatório`);
    if (meta.name !== path.basename(f, ".md")) fail(`${rel(file)}: name "${meta.name}" difere do nome do arquivo`);
    if (!body.includes("{{skill}}")) fail(`${rel(file)}: marcador {{skill}} ausente no corpo`);
    if (body.includes("'''")) fail(`${rel(file)}: o corpo não pode conter ''' (quebra o TOML do Codex)`);
    if (!fs.existsSync(path.join(ROOT, ".agents/skills", meta.skill, "SKILL.md")))
      fail(`${rel(file)}: skill "${meta.skill}" não existe em .agents/skills/`);
    return { ...meta, body };
  });
const skills = listDirs(path.join(ROOT, ".agents/skills"));
const mcp = JSON.parse(read(path.join(ROOT, ".agents/mcp.servers.json"))).servers;
const mcpNames = Object.keys(mcp);
const maxTimeoutSec = Math.max(0, ...Object.values(mcp).map((s) => s.timeoutSec || 0));
const stdioCmd = (s) => (PLATFORM === "windows" ? { command: "cmd", args: ["/c", s.command, ...(s.args || [])] } : { command: s.command, args: s.args || [] });

// ---------------------------------------------------------------- saídas
const out = new Map(); // caminho relativo -> conteúdo
const managedDirs = [".claude/agents", ".claude/skills", ".codex/agents", ".kimi-code/agents"]; // arquivos órfãos aqui são removidos

// Claude Code
for (const a of agents) {
  out.set(
    `.claude/agents/${a.name}.md`,
    `---\nname: ${a.name}\n${yamlDesc(a.description)}\nskills:\n  - ${a.skill}\n---\n\n<!-- ${GEN} -->\n\n` + renderBody(a.body, null)
  );
}
for (const s of skills) {
  const srcDir = path.join(ROOT, ".agents/skills", s);
  for (const f of walk(srcDir)) {
    const r = path.relative(srcDir, f).split(path.sep).join("/");
    let content = read(f);
    if (r === "SKILL.md") content = content.replace(/^(---\n[\s\S]*?\n---\n)/, `$1\n<!-- ${GEN} -->\n`);
    out.set(`.claude/skills/${s}/${r}`, content);
  }
}
{
  const mcpJson = { mcpServers: {} };
  for (const [n, s] of Object.entries(mcp)) {
    mcpJson.mcpServers[n] =
      s.transport === "http"
        ? { type: "http", url: s.url, ...(s.tokenEnvVar ? { headers: { Authorization: `Bearer \${${s.tokenEnvVar}}` } } : {}) }
        : { type: "stdio", ...stdioCmd(s), env: s.env || {} };
  }
  out.set(".mcp.json", json(mcpJson));

  // settings.json: preserva o que o time adicionar; só gerencia enabledMcpjsonServers e env.MCP_TIMEOUT.
  const settingsPath = path.join(ROOT, ".claude/settings.json");
  const settings = fs.existsSync(settingsPath)
    ? JSON.parse(read(settingsPath))
    : { permissions: { allow: ["Bash(npm run lint)", "Bash(npm run lint:*)"] } };
  settings.enabledMcpjsonServers = mcpNames;
  if (maxTimeoutSec) settings.env = { ...(settings.env || {}), MCP_TIMEOUT: String(maxTimeoutSec * 1000) };
  out.set(".claude/settings.json", json(settings));
}

// Codex
for (const a of agents) {
  out.set(
    `.codex/agents/${a.name}.toml`,
    `# ${GEN}\nname = ${tomlStr(a.name)}\ndescription = ${tomlStr(flat(a.description))}\n\ndeveloper_instructions = '''\n` +
      renderBody(a.body, skillSection(a.skill, "$" + a.skill)) +
      `'''\n`
  );
}
{
  let t =
    `# ${GEN}\n# Exige projeto confiável (trusted). As regras do orquestrador vêm do AGENTS.md (lido nativamente pelo Codex).\n` +
    `# O token do abap-adt vem da variável de ambiente (nunca versionar o valor).\n\n[agents]\nmax_threads = 4\nmax_depth = 1\n`;
  for (const [n, s] of Object.entries(mcp)) {
    t += `\n[mcp_servers.${n}]\n`;
    if (s.transport === "http") {
      t += `url = ${tomlStr(s.url)}\n`;
      if (s.tokenEnvVar) t += `bearer_token_env_var = ${tomlStr(s.tokenEnvVar)}\n`;
    } else {
      const c = stdioCmd(s);
      t += `command = ${tomlStr(c.command)}\nargs = ${tomlArr(c.args)}\n`;
      if (s.timeoutSec) t += `startup_timeout_sec = ${s.timeoutSec}\n`;
    }
  }
  out.set(".codex/config.toml", t);
}

// Kimi Code
for (const a of agents) {
  out.set(
    `.kimi-code/agents/${a.name}.md`,
    `---\nname: ${a.name}\n${yamlDesc(a.description)}\n---\n\n<!-- ${GEN} -->\n\n` + renderBody(a.body, skillSection(a.skill, "/skill:" + a.skill))
  );
}
out.set(
  ".kimi-code/agents/orquestrador.md",
  `---\nname: orquestrador\ndescription: >-\n  Orquestrador Central do SAP Full Stack (ABAP & Fiori). Use como agente principal\n  (\`kimi --agent orquestrador\`) para planejar e delegar aos especialistas ${agents.map((a) => a.name).join(", ")}.\n---\n\n` +
    `<!-- ${GEN} -->\n\n\${base_prompt}\n\n# Papel: Orquestrador Central — SAP Full Stack (ABAP & Fiori)\n\n` +
    `Você é o **Orquestrador Central**. Os especialistas são subagentes (${agents.map((a) => "`" + a.name + "`").join(", ")}) e cada um carrega sua skill de \`.agents/skills/\`. ` +
    `Siga as regras de orquestração do AGENTS.md abaixo. Servidores MCP em \`.kimi-code/mcp.json\`.\n\n\${agents_md}\n`
);
{
  const k = { mcpServers: {} };
  for (const [n, s] of Object.entries(mcp)) {
    k.mcpServers[n] =
      s.transport === "http"
        ? { url: s.url, ...(s.tokenEnvVar ? { bearerTokenEnvVar: s.tokenEnvVar } : {}) }
        : { ...stdioCmd(s), ...(s.timeoutSec ? { startupTimeoutMs: s.timeoutSec * 1000 } : {}) };
  }
  out.set(".kimi-code/mcp.json", json(k));
}

// Antigravity (não lê variável de ambiente: o token é substituído localmente, sem commit)
{
  const g = { mcpServers: {} };
  for (const [n, s] of Object.entries(mcp)) {
    g.mcpServers[n] =
      s.transport === "http"
        ? { type: "streamableHttp", url: s.url, ...(s.tokenEnvVar ? { headers: { Authorization: "Bearer <SEU_TOKEN>" } } : {}), disabled: false }
        : { type: "stdio", ...(s.timeoutSec ? { timeout: s.timeoutSec } : {}), command: s.command, args: s.args || [], disabled: false };
  }
  out.set(".agents/mcp_config.json", json(g));
}

// ---------------------------------------------------------------- aplicar / verificar
const stale = [];
const orphans = [];
for (const [r, content] of out) {
  const p = path.join(ROOT, r);
  const current = fs.existsSync(p) ? read(p) : null;
  if (current !== content) stale.push(r);
}
for (const d of managedDirs) {
  for (const f of walk(path.join(ROOT, d))) if (!out.has(rel(f))) orphans.push(rel(f));
}

if (CHECK) {
  if (stale.length || orphans.length) {
    console.error("sync-agents: arquivos gerados desatualizados. Rode `node scripts/sync-agents.mjs` e faça commit.");
    stale.forEach((f) => console.error(`  desatualizado: ${f}`));
    orphans.forEach((f) => console.error(`  órfão:         ${f}`));
    process.exit(1);
  }
  console.log(`sync-agents: OK (${out.size} arquivos gerados conferem com a fonte).`);
} else {
  for (const r of stale) {
    const p = path.join(ROOT, r);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, out.get(r));
    console.log(`  escrito:  ${r}`);
  }
  for (const r of orphans) {
    fs.rmSync(path.join(ROOT, r));
    console.log(`  removido: ${r}`);
  }
  console.log(`sync-agents: ${stale.length} escrito(s), ${orphans.length} removido(s), plataforma MCP ${PLATFORM}.`);
}
