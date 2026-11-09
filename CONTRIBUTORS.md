# Contribuidores

Registro de quem contribuiu com o projeto e do que cada pessoa fez.

## Como se registrar

Em todo Pull Request (ou commit direto), adicione **uma linha** na tabela de [Histórico de atividades](#histórico-de-atividades) e, na primeira contribuição, uma linha em [Contribuidores](#contribuidores-1).

- Use a data no formato `AAAA-MM-DD`.
- A **Área** deve ser uma destas: `Orquestrador`, `abap-rap-dev`, `abap-classic-dev`, `fiori-elements-dev`, `abap-qa-auditor`, `Skills`, `MCP`, `Padrão de desenvolvimento`, `Documentação`, `Ferramenta (Claude Code / Antigravity / Kimi / Codex)`.
- Descreva a atividade em uma frase objetiva. Não inclua tokens, URLs internas ou dados de cliente.
- Alterou uma skill ou agente? Edite a fonte em `.agents/` e rode `node scripts/sync-agents.mjs` (os arquivos gerados entram no mesmo commit).
- Entradas mais recentes ficam no **topo** da tabela.

## Contribuidores

| Nome | GitHub / E-mail | Primeira contribuição | Áreas |
|---|---|---|---|
| José Victor Martins da Silva | — | 2026-11-05 | Orquestrador, Skills, MCP, Documentação, Ferramenta |
| Luciano Filho | — | 2026-11-09 | Orquestrador, Skills, MCP, Padrão de desenvolvimento, Documentação |

## Histórico de atividades

| Data | Contribuidor | Área | Atividade |
|---|---|---|---|
| 2026-11-09 | Luciano Filho | Orquestrador | Fonte única em `.agents/` + gerador `scripts/sync-agents.mjs` e checagem na CI; regras do orquestrador só no `AGENTS.md`; padrões movidos para `standards/` com bloco `cliente` e sem valores do cenário de demonstração |
| 2026-11-09 | José Victor Martins da Silva | Ferramenta (Codex) | Preparação dos subagentes, MCPs e regras de orquestração para o Codex (`.codex/`) |
| 2026-11-06 | José Victor Martins da Silva | Documentação | Atualização do README sobre o orquestrador |
| 2026-11-06 | José Victor Martins da Silva | Ferramenta (Kimi) | Refatoração automática dos subagentes para o Kimi Code |
| 2026-11-05 | José Victor Martins da Silva | Documentação | Ajustes no README |
| 2026-11-05 | José Victor Martins da Silva | MCP | Adição do `.env.example` e documentação do token MCP (Windows/macOS) |
| 2026-11-05 | José Victor Martins da Silva | Orquestrador | Arquitetura multiagente SAP Full Stack (ABAP & Fiori) para Antigravity e Claude Code |
