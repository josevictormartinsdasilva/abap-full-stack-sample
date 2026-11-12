# ADR-0002: `.agents/` e `AGENTS.md` como fonte única, com adaptadores gerados

- **Status:** Aceito
- **Data:** 2026-11-09 (merge em 2026-11-10)

## Contexto

Cada ferramenta de IA usa arquivos e formatos próprios (`.claude/`, `.codex/`, `.kimi-code/`, `.agents/mcp_config.json`, `.mcp.json`). Manter essas cópias à mão gera divergência entre ferramentas.

## Decisão

- Subagentes (`.agents/agents/<nome>.md`), skills (`.agents/skills/<nome>/`), servidores MCP (`.agents/mcp.servers.json`) e regras do orquestrador (`AGENTS.md`) são a **fonte única**.
- `scripts/sync-agents.mjs` gera os adaptadores de cada ferramenta a partir dessa fonte. Os arquivos gerados **não são editados**.
- O script tem modo `--check` (sai com código 1 se algo estiver desatualizado). Ele é executado na CI pelo workflow `.github/workflows/sync-agents.yml`.
- O script não tem dependências além de Node.js >= 18.
- `CLAUDE.md` apenas importa `AGENTS.md` (`@AGENTS.md`) e não duplica regras.

## Alternativas consideradas (a validar)

- **Manter um conjunto de arquivos por ferramenta, editado à mão.** Risco de divergência.
- **Symlinks.** Não resolvem as diferenças de formato (Markdown, TOML, JSON), e o projeto é usado em Windows.

## Consequências

- (+) Uma edição se propaga para todas as ferramentas.
- (+) O `--check` na CI detecta adaptador desatualizado.
- (−) É preciso lembrar de rodar o script após editar a fonte.
- (−) Quem editar um arquivo gerado perde a alteração na próxima geração.
- (−) O modo `--platform=unix` gera saída que não deve ser commitada.

## Evidências

- `scripts/sync-agents.mjs` (cabeçalho)
- `.github/workflows/sync-agents.yml` (executa `node scripts/sync-agents.mjs --check`)
- `CLAUDE.md`, `AGENTS.md`
- Commit `98bd48f`, PR #1
