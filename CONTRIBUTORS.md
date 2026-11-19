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
| José Victor Martins da Silva | [@josevictormartinsdasilva](https://github.com/josevictormartinsdasilva) | 2026-11-05 | Orquestrador, Skills, MCP, Padrão de desenvolvimento, Documentação, Ferramenta |
| Luciano Filho | [@lucianocasado88](https://github.com/lucianocasado88) | 2026-11-09 | Orquestrador, Skills, MCP, Padrão de desenvolvimento, Documentação |

## Histórico de atividades

| Data | Contribuidor | Área | Atividade |
|---|---|---|---|
| 2026-11-19 | José Victor Martins da Silva | Documentação | Revisão geral da documentação (README, guias, ADRs e CONTRIBUTORS) para refletir o estado atual do código |
| 2026-11-19 | José Victor Martins da Silva | MCP | ARC-1 sempre na última versão estável do npm, instalado num cache do usuário, com conferência das variáveis de segurança e do Node (`scripts/arc1-pacote.mjs`, PR #12) |
| 2026-11-19 | José Victor Martins da Silva | MCP | Download automático do `vsp` na última release estável, com SHA-256 e conferência das flags de segurança (`scripts/vsp-binario.mjs`, PR #11) |
| 2026-11-19 | José Victor Martins da Silva | MCP | Correções do teste contra SAP real (S/4HANA 2023): `Accept` da leitura da T000 e `VSP_BIN`/`ARC1_BIN` lidos do `.env`; `vsp` validado num DEV (PR #10) |
| 2026-11-19 | José Victor Martins da Silva | Documentação | Guia `docs/primeiros-passos.md` para o desenvolvedor que adota o projeto (liberações, instalação, conexão, teste de ponta a ponta) (PR #9) |
| 2026-11-19 | José Victor Martins da Silva | MCP | Consistência e documentação do MCP ABAP; remoção do plano de correções já implementado (PR #8) |
| 2026-11-19 | José Victor Martins da Silva | MCP | Operação do launcher (estado por sessão em `.agents/runtime/` e `scripts/mcp-runtime.mjs`) e ABAP Unit somente em DEV/SANDBOX (PR #7) |
| 2026-11-18 | José Victor Martins da Silva | MCP | Travas do launcher endurecidas: decisões em `scripts/mcp-politica.mjs` com testes na CI, `https://` obrigatório e SID confirmado (PR #6) |
| 2026-11-18 | José Victor Martins da Silva | MCP | Política de seleção de MCP ABAP por versão e ambiente (ADR-0009), com launcher `scripts/mcp-launch.mjs` e detecção `scripts/sap-probe.mjs` para `arc-1` e `vsp` (PR #5) |
| 2026-11-12 | José Victor Martins da Silva | Documentação | ADRs iniciais da arquitetura do orquestrador (ADR-0001 a ADR-0008) (PR #4) |
| 2026-11-10 | Luciano Filho | Padrão de desenvolvimento | Super-pacote tornado opcional e depois removido do padrão; remoção da request de objetos iniciais (PR #3) |
| 2026-11-10 | Luciano Filho | Orquestrador | Trava do sistema de desenvolvimento: agentes só criam e ativam objetos no `sistemaDesenvolvimento` (PR #3) |
| 2026-11-10 | Luciano Filho | Documentação | README: qual arquivo de MCP editar e quem lê cada gerado (PR #2) |
| 2026-11-09 | Luciano Filho | Orquestrador | Fonte única em `.agents/` + gerador `scripts/sync-agents.mjs` e checagem na CI; regras do orquestrador só no `AGENTS.md`; padrões movidos para `standards/` com bloco `cliente` e sem valores do cenário de demonstração |
| 2026-11-09 | José Victor Martins da Silva | Padrão de desenvolvimento | Revisão do `padrao-desenvolvimento.md` e inclusão das figuras em `imagens/` |
| 2026-11-09 | José Victor Martins da Silva | Ferramenta (Codex) | Preparação dos subagentes, MCPs e regras de orquestração para o Codex (`.codex/`) e criação do `CONTRIBUTORS.md` |
| 2026-11-06 | José Victor Martins da Silva | Documentação | Atualização do README sobre o orquestrador |
| 2026-11-06 | José Victor Martins da Silva | Ferramenta (Kimi) | Refatoração automática dos subagentes para o Kimi Code |
| 2026-11-05 | José Victor Martins da Silva | Documentação | Ajustes no README |
| 2026-11-05 | José Victor Martins da Silva | MCP | Adição do `.env.example` e documentação do token MCP (Windows/macOS) |
| 2026-11-05 | José Victor Martins da Silva | Orquestrador | Arquitetura multiagente SAP Full Stack (ABAP & Fiori) para Antigravity e Claude Code |
