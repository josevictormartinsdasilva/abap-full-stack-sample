# ADR-0003: Suporte multi-ferramenta (Claude Code, Codex, Antigravity, Kimi)

- **Status:** Aceito
- **Data:** 2026-11-05 (Claude Code e Antigravity), 2026-11-06 (Kimi), 2026-11-09 (Codex)

## Contexto

O time de consultoria não usa uma única ferramenta de IA. O template precisa funcionar com as ferramentas adotadas, sem manter regras diferentes para cada uma.

## Decisão

O mesmo conjunto de regras e agentes atende:

| Ferramenta | Como lê as regras | Adaptadores gerados |
|---|---|---|
| Claude Code | `CLAUDE.md` importa `@AGENTS.md` | `.claude/agents`, `.claude/skills`, `.claude/settings.json`, `.mcp.json` |
| Codex | `AGENTS.md` nativamente | `.codex/agents/*.toml`, `.codex/config.toml` |
| Antigravity | `AGENTS.md` nativamente | `.agents/mcp_config.json` |
| Kimi | `${agents_md}` | `.kimi-code/agents/*.md`, `.kimi-code/mcp.json` |

Os adaptadores são gerados conforme o [ADR-0002](0002-fonte-unica-em-agents-com-adaptadores-gerados.md).

## Alternativas consideradas (a validar)

- **Padronizar numa única ferramenta.** Não atende quem já usa outra.

## Consequências

- (+) O time escolhe a ferramenta sem perder as regras do projeto.
- (−) Cada nova ferramenta exige um novo gerador em `sync-agents.mjs`.
- (−) Os nomes das ferramentas MCP variam por ferramenta (por exemplo `mcp__abap-adt__abap_object_check` no Claude Code), então o `AGENTS.md` cita os nomes originais.

## Evidências

- Commits `88bfcb2`, `7ad0651`, `05ebc36`, `98bd48f`
- `AGENTS.md` (seção MCP) e cabeçalho de `scripts/sync-agents.mjs`
