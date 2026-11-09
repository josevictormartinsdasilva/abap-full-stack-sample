# CLAUDE.md — Orquestrador SAP Full Stack (ABAP & Fiori)

@AGENTS.md

## Específico do Claude Code

- As regras de orquestração estão no `AGENTS.md` (importado acima). Não as duplique aqui.
- Para delegar, use a ferramenta Agent com o `subagent_type` do especialista (`abap-rap-dev`, `abap-classic-dev`, `fiori-elements-dev`, `abap-qa-auditor`).
- `.claude/agents/`, `.claude/skills/`, `.claude/settings.json` e `.mcp.json` são **gerados** por `node scripts/sync-agents.mjs` a partir de `.agents/`. Edite a fonte em `.agents/` e rode o script; nunca edite os gerados.
- As ferramentas MCP aparecem como `mcp__abap-adt__*` e `mcp__fiori-mcp__*`. Use `/mcp` para conferir a conexão e `/agents` para ver os subagentes.
