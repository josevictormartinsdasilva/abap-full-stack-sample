# ADR-0014: Ambiente produtivo fora do alcance dos agentes

- **Status:** Proposto
- **Data:** 2026-11-24

## Contexto

O [ADR-0009](0009-selecao-de-mcp-abap-por-versao-e-ambiente.md) permitia análise somente leitura no PRD: pelo `arc-1` em S/4HANA ≤ 2023 (entrada `arc-1-prd`) e pelo `abap-adt` em 2025+. O [ADR-0012](0012-fallback-de-analise-em-qas-prd-s4hana-2025.md) estendeu ao PRD 2025+ o fallback de análise pelo `arc-1`.

Mesmo sem escrita, a leitura no PRD expõe ao provedor do modelo de IA o código e, em dumps e traces, dados de negócio e pessoais do ambiente produtivo (LGPD). Também amplia o uso de APIs ADT internas (SAP API Policy, FAQ Q33) justamente no sistema mais sensível do cliente. A decisão é tirar o PRD do alcance dos agentes.

## Decisão

1. **Nenhum servidor MCP acessa o PRD, nem para leitura** (regra absoluta 6 da política).
2. **Trava técnica no launcher:** `arc-1` e `vsp` recusam iniciar em sistema detectado como PRD, em qualquer release e com qualquer opt-in. Vale também para:
   - o PRD por precaução (T000 ilegível): a mensagem orienta a dar ao usuário a autorização de data preview na T000, se o sistema não for produtivo;
   - o sistema que `standards/sistemas-sap.json` restringe a PRD.

   Para concluir que o sistema é PRD, o launcher faz só a detecção que já fazia (identidade, componentes e uma linha da T000) e não sobe nenhum servidor MCP.
3. **Sem entrada para PRD:** sai a `arc-1-prd` de `.agents/mcp.servers.json` (e dos adaptadores gerados), as variáveis `ARC1_PRD_*` do `.env.example` e a etapa `prd` do `setup.mjs`. O `doctor.mjs` avisa se ainda houver `ARC1_PRD_*` no `.env`.
4. **`abap-adt`:** a regra é procedural, porque ele não passa pelo launcher. O agente confere o sistema pelo próprio servidor e não faz nenhuma chamada se for PRD. A proteção técnica fica na configuração do ADT de cada desenvolvedor: nenhum destino de PRD exposto ao MCP.
5. **Análise de incidente em produção** fica com o usuário, pelas ferramentas de suporte do cliente. O agente trabalha sobre o que o usuário trouxer (dump, log, trecho de código) ou reproduz o caso no QAS ou no DEV.
6. **Altera decisões anteriores:**
   - ADR-0009: a matriz deixa de ter análise em PRD;
   - ADR-0012: o fallback de análise passa a valer só no QAS.

## Alternativas consideradas

- **Tirar o PRD só do fallback de análise (ADR-0012).** Mantinha a leitura em PRD pelo servidor principal, com a mesma exposição de dados.
- **PRD desligado por padrão, com opt-in por cliente.** Mantinha o caminho aberto e a configuração de credenciais de produção na máquina do desenvolvedor; a decisão foi não ter esse caminho.
- **Só regra procedural, sem trava no launcher.** Uma URL trocada ou uma entrada criada à mão (`arc-1-xyz` apontada para o PRD) passaria sem bloqueio.

## Consequências

- (+) Código, dumps e dados de produção não chegam ao provedor do modelo de IA pelos agentes.
- (+) Uma URL trocada que aponte para o PRD é bloqueada pela detecção, qualquer que seja o nome da entrada.
- (−) Diagnóstico de incidente produtivo (dumps, traces, performance) deixa de ser feito pelo agente direto no sistema.
- (−) Um QAS cuja T000 o usuário não consegue ler passa a ser **recusado**, e não mais aberto em leitura, porque é tratado como PRD por precaução. É preciso dar ao usuário a autorização de data preview na T000.
- (−) No `abap-adt`, a regra depende do agente e da configuração do ADT de cada desenvolvedor.

## Evidências

- `scripts/mcp-politica.mjs` (`decidir`: recusa de `ambiente === "PRD"`) e testes em `scripts/test/mcp-politica.test.mjs` ("PRD recusado para qualquer servidor").
- `.agents/mcp.servers.json`, `scripts/setup.mjs`, `scripts/doctor.mjs`, `.env.example`.
- `standards/politica-mcp-abap.md`: matriz (seção 1), regra absoluta 6, seções 2, 3, 4.1, 4.2, 4.5, 6 e 7.
