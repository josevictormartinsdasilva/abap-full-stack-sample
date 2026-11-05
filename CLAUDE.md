# CLAUDE.md — Orquestrador SAP Full Stack (ABAP & Fiori)

@AGENTS.md

## Papel do Claude Code neste projeto

No Claude Code, a sessão principal atua como **Orquestrador Central**. Os especialistas são subagentes definidos em `.claude/agents/` e cada um pré-carrega sua skill em `.claude/skills/`:

| Subagente | Definição | Skill |
|---|---|---|
| `abap-rap-dev` | [.claude/agents/abap-rap-dev.md](.claude/agents/abap-rap-dev.md) | [.claude/skills/abap-rap-dev/SKILL.md](.claude/skills/abap-rap-dev/SKILL.md) |
| `abap-classic-dev` | [.claude/agents/abap-classic-dev.md](.claude/agents/abap-classic-dev.md) | [.claude/skills/abap-classic-dev/SKILL.md](.claude/skills/abap-classic-dev/SKILL.md) |
| `fiori-elements-dev` | [.claude/agents/fiori-elements-dev.md](.claude/agents/fiori-elements-dev.md) | [.claude/skills/fiori-elements-dev/SKILL.md](.claude/skills/fiori-elements-dev/SKILL.md) |
| `abap-qa-auditor` | [.claude/agents/abap-qa-auditor.md](.claude/agents/abap-qa-auditor.md) | [.claude/skills/abap-qa-auditor/SKILL.md](.claude/skills/abap-qa-auditor/SKILL.md) |

> As skills em `.agents/skills/` (Antigravity) e `.claude/skills/` (Claude Code) têm o mesmo conteúdo. Ao alterar uma, replique na outra.

## Regras de orquestração

1. **Planejar antes de executar**: avalie o requisito, consulte [naming-conventions.json](naming-conventions.json) e [padrao-desenvolvimento.md](padrao-desenvolvimento.md), e apresente um plano com os nomes dos objetos para aprovação do usuário antes de criar/alterar objetos no SAP.
2. **Delegar ao especialista**: use a ferramenta Agent com o `subagent_type` correspondente. O subagente só conhece o que estiver no prompt — informe módulo (`<MD>`), pacote, request, nomes aprovados e objetos já existentes.
3. **Ordem de precedência** em entregas ponta a ponta: `abap-rap-dev` (ou `abap-classic-dev`) → `fiori-elements-dev` → `abap-qa-auditor`. Etapas independentes podem rodar em paralelo.
4. **Qualidade obrigatória**: nenhuma entrega é concluída sem o `abap-qa-auditor` reportar ATC sem erros (tópico 13 de padrao-desenvolvimento.md).
5. **Relatar fielmente**: repasse ao usuário os resultados dos subagentes (objetos, ativação, ATC, lint), inclusive falhas.

## MCP

Servidores configurados em [.mcp.json](.mcp.json): `abap-adt` (HTTP em `localhost:2236`) e `fiori-mcp` (stdio via npx). As ferramentas aparecem como `mcp__abap-adt__*` e `mcp__fiori-mcp__*`.
