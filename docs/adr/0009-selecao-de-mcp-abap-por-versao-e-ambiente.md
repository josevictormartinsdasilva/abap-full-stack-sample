# ADR-0009: Seleção de MCP ABAP por versão e ambiente

- **Status:** Aceito (2026-11-19, PR #5 na `develop`)
- **Data:** 2026-11-17

## Contexto

O template acessa o SAP somente pelo MCP oficial da SAP (`abap-adt`, [ADR-0007](0007-mcp-como-camada-de-acesso-ao-sap-e-ao-fiori.md)). Esse servidor funciona bem em S/4HANA 2025. Em releases anteriores (S/4HANA 2023 ou inferior), parte das ferramentas fica indisponível, e muitos clientes ainda estão nessas versões.

Foi feito um estudo de caso, com análise do código-fonte, de dois servidores MCP comunitários (licença MIT) que acessam o SAP via ADT a partir do NW 7.50:

- **ARC-1** ([arc-mcp/arc-1](https://github.com/arc-mcp/arc-1)), TypeScript.
  - Seguro por padrão: todos os flags de escrita, prévia de dados e SQL começam desligados (`src/server/types.ts`).
  - Proíbe execução de ABAP e RFC no core (ADR-0009 do próprio projeto).
  - Oferece auditoria, escopos por usuário e principal propagation.
  - Foi desenhado como alternativa governada ao MCP oficial, com guia de comparação próprio.
- **vibing-steampunk / vsp** ([oisee/vibing-steampunk](https://github.com/oisee/vibing-steampunk)), Go.
  - Tem a maior amplitude: debugger, execução de ABAP, RFC, decodificação de tabelas cluster, análise de pacotes, dumps, traces e jobs.
  - Mas o servidor MCP inicia **sem restrições** por padrão (`internal/mcp/server.go`, `UnrestrictedSafetyConfig`).
  - Não tem trilha de auditoria estruturada.

## Decisão

1. **O servidor MCP é escolhido por sistema**, conforme a versão (SAP_BASIS) e o ambiente:
   - **S/4HANA 2025+** → `abap-adt`, para desenvolvimento e análise. Em QAS/PRD, somente leitura.
   - **S/4HANA ≤ 2023, QAS/PRD** → `arc-1`, somente análise.
   - **S/4HANA ≤ 2023, DEV/SANDBOX** → `vsp`, para desenvolvimento e análise.
2. **O ambiente e o release são detectados no próprio SAP, não declarados.** O operador informa só a conexão. O launcher lê:
   - o SID (`/sap/bc/adt/core/http/systeminformation`; o inferido do `T000-LOGSYS` não conta como confirmado e exige declaração igual);
   - o SAP_BASIS (`/sap/bc/adt/system/components`);
   - o papel do mandante na SCC4 (`T000-CCCATEGORY` e `CCNOCLIIND`).

   O que não puder ser lido é tratado como PRD. `standards/sistemas-sap.json` é opcional e só pode tornar um sistema mais restritivo. O resultado vai para `.agents/runtime/<servidor>.<pid>.json`. O orquestrador lista os servidores vivos com `node scripts/mcp-runtime.mjs` para rotear.
3. **`arc-1` e `vsp` só são iniciados por `scripts/mcp-launch.mjs`.** O launcher:
   - detecta o sistema e confere SID e mandante com o que foi configurado;
   - impõe as travas técnicas (vsp só em DEV/SANDBOX com `--expect`, `--allowed-packages` e `--block-free-sql`; ARC-1 somente leitura fora de DEV, sem prévia de dados nem SQL; SAP_BASIS < 750 recusado; só `https://` e sem TLS desligado);
   - mantém as decisões numa função pura (`scripts/mcp-politica.mjs`), coberta por testes em `scripts/test/` que a CI executa;
   - isola as credenciais de cada servidor por prefixo de variável;
   - fixa a versão do ARC-1.
4. **As regras completas** ficam em `standards/politica-mcp-abap.md`. O `AGENTS.md` exige segui-las antes de qualquer chamada SAP.

## Alternativas consideradas

- **Somente o MCP oficial em todos os releases.** Perde funcionalidades justamente onde está a maior parte da base instalada.
- **Somente ARC-1 abaixo de 2025.** Mais seguro, mas sem debugger, sem execução e com menos análise de runtime para o desenvolvimento.
- **Somente vsp abaixo de 2025.** O padrão sem restrições e a capacidade de executar código e ler dados de negócio são inadequados para QAS/PRD de clientes.
- **Travas apenas por instrução ao agente.** Insuficientes para o vsp, cujo padrão é sem restrições. Por isso as travas principais ficam no launcher.

## Consequências

- (+) Cada faixa de release usa o servidor com melhor cobertura funcional, e os ambientes de cliente ficam somente leitura por trava técnica, não só por instrução.
- (+) A classificação não depende do operador: um engano na configuração (URL de QAS no lugar do DEV, ambiente declarado errado) é barrado pela detecção. O orquestrador roteia sem suposição ([ADR-0008](0008-parametros-do-cliente-centralizados-sem-suposicao.md)).
- (−) A detecção depende de a SCC4 estar correta e de o usuário ter autorização de data preview na T000; sem ela, o sistema é tratado como PRD. A opção de modificação global (SE06) não é lida.
- (−) **Exceção ao "SQL livre desligado":** a leitura da T000 usa o endpoint de SQL livre do ADT (`/sap/bc/adt/datapreview/freestyle`). A consulta é fixa no código, só na T000, só leitura e feita pelo launcher antes de o servidor subir. Os agentes continuam sem SQL livre nem prévia de dados. Detalhes na seção 2 da política.
- (+) A trava do sistema de desenvolvimento ([ADR-0004](0004-trava-do-sistema-de-desenvolvimento.md)) continua válida e passa a valer para o servidor selecionado.
- (−) **Dependências novas:** ARC-1 e vsp são comunitários, sem suporte SAP. As versões precisam de acompanhamento e atualização por PR.
- (−) **Política de APIs da SAP:** a FAQ Q33 classifica as APIs ADT como internas e as limita a canais endossados. Usar ARC-1/vsp em clientes exige aceite formal do cliente.
- (−) **Credenciais:** ficam no ambiente do sistema ou no `.env` local. O launcher lê o `.env` porque as ferramentas de IA não o carregam sozinhas.
- (−) **Travas que continuam procedurais.** Algumas operações do vsp não podem ser bloqueadas individualmente sem bloquear a escrita de código, e dependem de confirmação do usuário:
  - execução de ABAP;
  - RFC;
  - escrita de variáveis no debugger;
  - leitura de dados de negócio.
- (−) **Requisito de ambiente:** o binário `vsp` precisa estar instalado (no `PATH` ou em `VSP_BIN`), e o ARC-1 precisa de Node.js ≥ 22.19 e de `npx` na primeira execução. Passo a passo em `docs/setup-mcp-abap.md`. Na primeira execução, o `npx` precisa baixar o ARC-1, o que pode exigir aumentar o timeout do servidor em algumas ferramentas.
- (−) **Herança de ambiente (a validar):** Codex e Kimi não foram testados quanto ao repasse de variáveis de ambiente aos processos stdio. O fallback do launcher para o `.env` cobre o caso.

## Evidências

- Estudo de caso de 2026-11-17 (ARC-1 v1.10.1, vsp v2.62.1):
  - vsp `internal/mcp/server.go`, linha 227, e `pkg/adt/safety.go`;
  - ARC-1 `src/server/types.ts`, linhas 315–319, e `docs_page/arc-1-vs-sap-abap-mcp-server.md`.
- `standards/politica-mcp-abap.md`, `scripts/mcp-launch.mjs`, `.agents/mcp.servers.json`.
- `scripts/sap-probe.mjs`, `scripts/mcp-politica.mjs`, `scripts/test/`, `standards/sistemas-sap.json` (restrições opcionais).
- `AGENTS.md`, regras 3 e 4.
