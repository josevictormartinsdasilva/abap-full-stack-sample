# ADR-0012: Fallback de análise em QAS/PRD S/4HANA 2025+

- **Status:** Aceito (2026-11-24, PR #19)
- **Data:** 2026-11-24

## Contexto

O [ADR-0009](0009-selecao-de-mcp-abap-por-versao-e-ambiente.md) define o `abap-adt` (MCP oficial SAP) como único servidor de um sistema S/4HANA 2025+, inclusive para análise em QAS/PRD. A política só previa o `arc-1` somente leitura como contingência quando o `abap-adt` estivesse **fora do ar**.

O [ADR-0011](0011-fallback-de-desenvolvimento-em-s4hana-2025.md) tratou a lacuna de operação no `abap-adt`, mas só para desenvolvimento em DEV/SANDBOX. Faltava o caso do `abap-adt` no ar, mas **sem a operação de análise** pedida num QAS/PRD 2025+. Exemplos: dumps, traces, onde-usado ou a leitura de um tipo de objeto que a SAP ainda não entregou no MCP oficial. Pela regra absoluta 4 da política ("cada sistema só pelo servidor da matriz"), o agente teria de parar, embora o `arc-1` cubra essas operações em modo somente leitura.

## Decisão

1. **Cadeia de fallback, só para análise em QAS/PRD 2025+:** `abap-adt` → `arc-1` somente leitura → parar e informar. Sempre no mesmo sistema, pela entrada `arc-1-qas` ou `arc-1-prd` apontada para ele.
2. **O `vsp` nunca entra na cadeia** (regra absoluta 1), e não há execução manual pelo agente: se o `arc-1` também não atender, o orquestrador informa o que faltou e o usuário faz a análise por conta própria (ADT ou SAP GUI).
3. **Mesmo critério do ADR-0011:** o fallback vale só quando a operação não existe no `abap-adt`, conforme a tabela de sinais da seção 4.4 da política, com a evidência mostrada ao usuário e a confirmação dele antes de trocar de servidor.
4. **Só a operação que faltou sai do `abap-adt`.** O restante da análise continua nele.
5. **Mesmo sistema:** o SID e o mandante do `arc-1` (em `node scripts/mcp-runtime.mjs`) precisam ser os do sistema consultado pelo `abap-adt`.
6. **Sem flag nova.** Em QAS/PRD, o launcher já inicia o `arc-1` somente leitura em qualquer release, nega ABAP Unit e `SAPWrite.delete` e ignora `<P>_FALLBACK_2025` e `<P>_ALLOW_DEV_WRITES`. O que é procedural é só a decisão de usar o `arc-1` com o `abap-adt` no ar.
7. Regras completas na seção 4.5 de `standards/politica-mcp-abap.md`.

## Alternativas consideradas

- **Manter sem fallback.** É a mais restritiva, mas trava análises de suporte (dumps, traces, impacto) justamente no ambiente onde elas mais importam, enquanto o MCP oficial tiver lacunas.
- **Emendar o ADR-0011.** O ADR-0011 trata de desenvolvimento em DEV/SANDBOX, com opt-in e escrita. A análise em QAS/PRD tem outro risco (dados de negócio, LGPD) e outra trava (somente leitura sempre), e uma decisão aceita não é reescrita.
- **Exigir opt-in (`<P>_FALLBACK_2025`) também para análise.** Não acrescenta proteção: em QAS/PRD o `arc-1` já é somente leitura, e preencher as variáveis da entrada `arc-1-qas`/`arc-1-prd` já é uma escolha explícita do desenvolvedor.

## Consequências

- (+) Lacunas do MCP oficial não bloqueiam análises em QAS/PRD 2025+, e o caminho fica definido e auditável no relatório.
- (+) Nenhuma escrita em QAS/PRD: a trava técnica do launcher não muda.
- (−) Usar o `arc-1` num sistema de cliente reabre as questões de compliance do ADR-0009 (APIs ADT internas, FAQ Q33, aceite formal do cliente).
- (−) A leitura em QAS/PRD pode expor dados de negócio ao provedor do modelo de IA (LGPD, política seção 7). A prévia de dados e o SQL livre continuam desligados no `arc-1`, mas dumps e traces podem conter dados.
- (−) Sem opt-in, a regra "só quando a operação não existe" depende do orquestrador e da confirmação do usuário. Com a entrada `arc-1-qas`/`arc-1-prd` preenchida, o servidor está sempre disponível, e o agente poderia preferi-lo ao oficial. A tabela de sinais e a evidência mostrada ao usuário reduzem esse risco.

## Evidências

- `scripts/mcp-politica.mjs` (`decidir`): `ARC1_NEGADAS_FORA_DEV` e o modo somente leitura fora de DEV/SANDBOX.
- `scripts/test/mcp-politica.test.mjs`: "ARC-1 com opt-in em QAS/PRD 2025+ continua somente leitura".
- `standards/politica-mcp-abap.md`, seções 1, 4.2, 4.4, 4.5 e 6.
