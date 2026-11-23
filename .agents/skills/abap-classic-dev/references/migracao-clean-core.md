# Remediação de código clássico rumo ao clean core

> **Origem.** Adaptado de `skills/abap-cloud-migration/SKILL.md` e `skills/abap-cloud-migration/references/migration-checklist.md` do repositório [likweitan/abap-skills](https://github.com/likweitan/abap-skills) (commit `b3306be`, licença MIT). Corrigido e traduzido. Ver [THIRD_PARTY_NOTICES.md](../../../../THIRD_PARTY_NOTICES.md).
>
> **Níveis e mapeamento ATC** estão em [clean-core-niveis.md](../../abap-qa-auditor/references/clean-core-niveis.md). Este arquivo trata do **como remediar**.
>
> **Política de sistemas.** Análise pode ser feita em qualquer ambiente pelo servidor MCP indicado em [politica-mcp-abap.md](../../../../standards/politica-mcp-abap.md). Alterações, só no `sistemaDesenvolvimento` e com plano aprovado (regras 1 e 4 do `AGENTS.md`).
>
> **Literais nos exemplos** (textos, IDs de objeto, URLs) são ilustrativos. No código real, use constantes ou textos (tópico 17.4 do padrão).

## Quando ler

Ao avaliar ou corrigir código clássico com achados de clean core, ao estimar uma remediação e ao escolher substitutos para FMs, tabelas e instruções não permitidas.

## Fluxo

1. **Diagnóstico**: o `abap-qa-auditor` roda a variante ATC do cliente no pacote e converte as prioridades em níveis (P1 → D, P2 → C, P3 → B).
2. **Prioridade**: D primeiro (obrigatório), depois C (reduzir), depois B (monitorar).
3. **Estratégia por objeto**: aposentar, renovar side-by-side, renovar on-stack ou adaptar (tabela abaixo).
4. **Plano com nomes de objetos**, aprovado pelo usuário antes de alterar.
5. **Substituir**: API liberada → API clássica → wrapper com uma isenção.
6. **Validar**: ATC sem P1, testes funcionais e de regressão.

## Prioridades

**Nível D, eliminar:**
- modificações e enhancements implícitos/explícitos → BAdI (ver [badi-enhancements.md](badi-enhancements.md));
- escrita direta em tabela SAP → API liberada ou clássica (BAPI, BO RAP liberado);
- objetos `noAPI` → sucessor indicado no Cloudification Repository;
- instruções críticas (`EXEC SQL`, kernel/system calls, geração de código) → ABAP SQL, AMDP, API;
- chamada a form routine de programa SAP (`PERFORM ... IN PROGRAM`) → API liberada ou clássica.

**Nível C, reduzir:**
- leitura direta de tabela SAP → CDS liberada ou clássica;
- FM/classe interna → API liberada ou clássica;
- o que sobrar: wrapper + uma isenção granular, e acompanhar o changelog de objetos SAP (`SYCM`).

**Nível B, monitorar:**
- trocar APIs depreciadas pelo sucessor;
- não reescrever código clássico estável sem motivo de negócio.

## Estratégias para código legado

| Estratégia | Quando | Tarefas |
|---|---|---|
| Aposentar | Código sem uso produtivo (é comum ser a maior parte do legado) | Coletar uso com `SUSG`/`SCMON`, analisar no app Custom Code Migration, remover |
| Renovar side-by-side | Extensões pouco acopladas | Levar para o SAP Business AI Platform (BTP) com APIs remotas liberadas |
| Renovar on-stack | Extensões muito acopladas que valem reescrever | Reimplementar em ABAP Cloud com APIs e pontos de extensão liberados |
| Adaptar | Nenhuma das anteriores é viável | Quick fixes do ATC, Simplification Database, SQL Monitor, pushdown com CDS/AMDP |

## Substituições comuns

### Tabelas → CDS liberadas

| Tabela | CDS liberada |
|---|---|
| `MARA` | `I_Product` |
| `KNA1` | `I_Customer` |
| `LFA1` | `I_Supplier` |
| `BUT000` | `I_BusinessPartner` |
| `T001` | `I_CompanyCode` |
| `VBAK` / `VBAP` | `I_SalesOrder` / `I_SalesOrderItem` |
| `EKKO` / `EKPO` | `I_PurchaseOrderAPI01` / `I_PurchaseOrderItemAPI01` |
| `BKPF` / `BSEG` | `I_JournalEntry` / `I_JournalEntryItem` |

Confirme no Cloudification Repository ou na árvore *Released Objects* do ADT que a view está liberada **no release do cliente** e que traz os campos necessários. Nem toda tabela tem equivalente completo.

### Funções → alternativas

| Clássico | Alternativa |
|---|---|
| `GUID_CREATE` | `cl_system_uuid=>create_uuid_x16_static( )` |
| `CONVERSION_EXIT_ALPHA_INPUT` / `_OUTPUT` | `|{ lv_valor ALPHA = IN }|` / `|{ lv_valor ALPHA = OUT }|` |
| `NUMBER_GET_NEXT` | `cl_numberrange_runtime=>number_get( )` |
| `ENQUEUE_*` / `DEQUEUE_*` | Bloqueio RAP ou `cl_abap_lock_object_factory` |
| `SO_NEW_DOCUMENT_ATT_SEND_API1` | `cl_bcs_mail_message` |
| `JOB_OPEN` / `JOB_CLOSE` | Application Jobs (`cl_apj_rt_api`) |
| `BAPI_TRANSACTION_COMMIT` dentro de RAP | Não chamar: o framework faz o commit |
| `READ_TEXT` / `SAVE_TEXT` | Sem API liberada genérica: wrapper (nível B/C) ou API do objeto de negócio |
| `RFC_READ_TABLE` (`noAPI`) | CDS liberada ou API remota liberada |
| `POPUP_TO_CONFIRM` | Sem equivalente em ABAP Cloud: diálogo na UI Fiori |

Mais classes em [classes-liberadas.md](../../abap-rap-dev/references/classes-liberadas.md).

### Construções da linguagem (para levar código a ABAP Cloud)

| Clássico | Alternativa em ABAP Cloud |
|---|---|
| `CALL TRANSACTION` | Ação RAP ou navegação Fiori |
| `SUBMIT ... AND RETURN` | Application Job |
| `WRITE`, `SKIP`, `ULINE` | UI Fiori; em classes de console, `if_oo_adt_classrun` |
| `CALL SCREEN`, selection screen | App Fiori Elements |
| `CALL FUNCTION ... IN UPDATE TASK` | Sequência de save do RAP |
| `EXEC SQL` | ABAP SQL ou AMDP |
| `GENERATE SUBROUTINE POOL` | Padrões de projeto (strategy/factory) |
| `GET/SET PARAMETER ID` | Parâmetros explícitos |
| `INCLUDE` de programa | Métodos e classes |

Em código que continua em Standard ABAP (nível B), essas instruções seguem permitidas. A conversão só é necessária para levar o objeto a ABAP Cloud.

## Wrapper

Regras e exemplo em [clean-core-niveis.md](../../abap-qa-auditor/references/clean-core-niveis.md#padrão-wrapper). Resumo:
- componente clássico, liberado para ABAP Cloud (contrato C1);
- tipos não liberados redeclarados com `TYPES` no wrapper;
- uma isenção ATC no wrapper;
- `SU22` para os objetos de autorização da API embrulhada;
- aposentar quando a SAP liberar a API.

## Migração por tipo de objeto

| Origem | Destino on-stack (nível A) |
|---|---|
| Report | CDS + classe ABAP Cloud + Application Job (catálogo com `cl_apj_dt_create_content`) e, se houver UI, app Fiori |
| Transação Dynpro | BO RAP + Fiori Elements (skills `abap-rap-dev` e `fiori-elements-dev`) |
| BAPI própria | BO RAP com ações; parâmetros como CDS abstract entity |
| RFC própria | Classe liberada (lógica simples), BO RAP (CRUD) ou wrapper (lógica complexa) |

## Troca de versão de linguagem

Objetos de um componente clássico podem passar a ABAP for Cloud Development individualmente: código (classes, interfaces) a partir do S/4HANA 2019; DDIC e CDS a partir do 2022. Rode antes a variante `ABAP_CLOUD_READINESS` (se disponível no sistema).

## Checklist de validação

- [ ] ATC na variante do cliente: **zero P1**.
- [ ] P2 restantes justificados, cada um com wrapper ou isenção recomendada.
- [ ] P3 revisados (depreciadas trocadas pelo sucessor).
- [ ] Isenções granulares e documentadas, aprovadas pelo cliente.
- [ ] Testes ABAP Unit (DEV/SANDBOX) e regressão funcional.
- [ ] Wrappers documentados: objeto embrulhado, nível e data de revisão.
- [ ] Changelog de objetos SAP importado e revisado antes do upgrade.

## Estimativa de esforço (referência)

Valores de partida; ajuste ao histórico do cliente e às regras de estimativa da skill.

| Objeto | Baixa | Média | Alta |
|---|---|---|---|
| Report simples | 2–4 h | 4–8 h | 8–16 h |
| Report complexo | 4–8 h | 8–16 h | 16–32 h |
| Módulo de função | 1–2 h | 2–4 h | 4–8 h |
| Integração com BAPI | 4–8 h | 8–16 h | 16–32 h |
| Transação Dynpro | 8–16 h | 16–32 h | 32–64 h |

| Transição | Esforço típico |
|---|---|
| D → B | Baixo a médio (troca por BAdI ou API clássica) |
| D → A | Alto (API liberada ou reimplementação RAP) |
| C → B | Baixo (objeto interno por API clássica) |
| C → A | Médio (exige CDS ou API liberada) |
| C → C com wrapper | Baixo (mitigação provisória) |
| B → A | Médio a alto (geralmente exige UI Fiori/RAP) |

## Fontes

- Guia SAP *Extend SAP S/4HANA in the cloud and on premise with ABAP based extensions*, v2.3 (agosto de 2025)
- [SAP Cloudification Repository](https://github.com/SAP/abap-atc-cr-cv-s4hc)
- [SAP ABAP Cheat Sheets: ABAP for Cloud Development](https://github.com/SAP-samples/abap-cheat-sheets/blob/main/19_ABAP_for_Cloud_Development.md)
