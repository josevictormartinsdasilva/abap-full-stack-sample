# ATC: checks de clean core e Cloudification Repository

> **Origem.** Adaptado de `skills/atc-cloudification/SKILL.md` e `skills/atc-cloudification/references/quick-reference.md` do repositório [likweitan/abap-skills](https://github.com/likweitan/abap-skills) (commit `b3306be`, licença MIT). Traduzido e revisado. Ver [THIRD_PARTY_NOTICES.md](../../../../THIRD_PARTY_NOTICES.md).
>
> **Escopo do agente.** O `abap-qa-auditor` **executa** a variante `varianteATC` do bloco `cliente` de [naming-conventions.json](../../../../standards/naming-conventions.json) e **interpreta** os achados. Ele não cria nem altera variantes de check, notas SAP ou configurações de transporte. As seções de configuração abaixo servem para explicar ao usuário o que falta quando um check não está disponível.

## Quando ler

Ao interpretar achados de clean core no resultado do ATC, ao explicar por que um check não aparece na variante e ao recomendar isenções.

## Checks de clean core

| Check (nome funcional) | Nome técnico | O que reporta |
|---|---|---|
| Usage of APIs | `SYCM_USAGE_OF_APIS` *(a confirmar)* | Uso de objetos SAP por classificação (liberado, clássico, interno, `noAPI`), SQL em tabelas/views SAP, chamadas a form routines SAP |
| Allowed Enhancement Technologies | `SYCM_ALLOWED_ENH_TECHNOLOGY` *(a confirmar)* | Enhancements (`ENHO`) em tecnologia não permitida. Só BAdI é recomendada |
| Search customer modifications | `CI_SEARCH_CUST_MODIFICATIONS` | Objetos SAP modificados (um achado por objeto) |
| Critical statements | `CI_CRITICAL_STATEMENTS` | Kernel/system/editor calls, `EXEC SQL`, hints, geração de report/Dynpro, nametab |
| Code Vulnerability Analyzer (recomendado) | `SLIN_SEC` | Vulnerabilidades de segurança |

Os nomes técnicos marcados *(a confirmar)* vêm do repositório de origem e não foram confirmados em documentação pública da SAP. Na execução, use o nome que o próprio resultado do ATC informar.

### Pré-requisitos (S/4HANA on-premise / Private)

- **SAP Note 3565942** entrega os checks "Usage of APIs" e "Allowed Enhancement Technologies". Sozinha não basta: guias da comunidade SAP recomendam o note analyzer da **SAP Note 3627152** para obter as notas dependentes e de correção (confirme no SAP for Me). Depois de implementar, use *Import Parameters* no objeto de check do ATC.
- KBA 3786507 descreve um caso em que "Allowed Enhancement Technologies" não reporta enhancements que não são BAdI. Se o check vier vazio num pacote com enhancements implícitos conhecidos, cite essa KBA no relatório em vez de concluir que não há achados.
- Variantes de partida citadas pela SAP: `ABAP_CLEAN_CORE_DEVELOPMENT`, `ABAP_CLOUD_DEVELOPMENT_DEFAULT` e `ABAP_CLOUD_READINESS` (verifica regras de ABAP Cloud antes de trocar a versão de linguagem de um objeto). A disponibilidade depende do release; confirme no sistema.

## Cloudification Repository

Repositório: <https://github.com/SAP/abap-atc-cr-cv-s4hc>. Os arquivos JSON são o conteúdo usado pelos checks.

| Produto | Arquivo | URL |
|---|---|---|
| Clean core (níveis A–D) | `objectClassifications_SAP.json` | `https://raw.githubusercontent.com/SAP/abap-atc-cr-cv-s4hc/main/src/objectClassifications_SAP.json` |
| S/4HANA Cloud Private / on-premise, última versão | `objectReleaseInfo_PCELatest.json` | `https://raw.githubusercontent.com/SAP/abap-atc-cr-cv-s4hc/main/src/objectReleaseInfo_PCELatest.json` |
| Private, release específico | `objectReleaseInfo_PCE<ANO>_<FPS>.json` | ex.: `.../src/objectReleaseInfo_PCE2023_3.json` |
| S/4HANA Cloud Public | `objectReleaseInfoLatest.json` | `.../src/objectReleaseInfoLatest.json` |
| BTP ABAP Environment | `objectReleaseInfo_BTPLatest.json` | `.../src/objectReleaseInfo_BTPLatest.json` |

O arquivo `objectClassifications_3TierModel.json` é do modelo antigo de 3 tiers e não deve ser usado.

Estados nos JSON:
- liberação: `released`, `deprecated`, `notToBeReleased`, `notReleased`;
- classificação: `classicAPI` (B), `internalAPI` (C com sucessor liberado), `noAPI` (D). Objeto não listado e não liberado = interno (C).

Para o sistema acessar o GitHub, o SSL precisa estar configurado (STRUST).

## Interpretando o resultado

1. Agrupe os achados por prioridade e converta para nível (P1 → D, P2 → C, P3 → B), conforme [clean-core-niveis.md](clean-core-niveis.md).
2. O nível do pacote ou objeto é o **menor** encontrado.
3. **P1 reprova a entrega** (tópico 13 do padrão: tolerância zero a erros).
4. P2 e P3 entram no relatório com a ação recomendada. Não declare a entrega reprovada por P2/P3, a menos que a variante do cliente os trate como erro.
5. QuickFixes: só em DEV/SANDBOX e só os que o ADT oferecer (ver skill). Não "corrija" achado de clean core trocando a API por outra sem confirmar no Cloudification Repository que a substituta é liberada ou clássica.

## Isenções

- Isenção só para P1 e P2. Nunca para P3 (uso de API clássica é aceitável).
- Isenção granular, por achado. Baseline do ATC só para código legado que não será mais alterado.
- Prática preferida: wrapper no objeto SAP e **uma** isenção no wrapper.
- O agente **recomenda** isenções no relatório. Quem cria e aprova é o responsável técnico do cliente.

## Changelog de objetos SAP

Importado pela transação `SYCM` a partir da Simplification Database. Detecta objetos internos (nível C) com mudança incompatível prevista. Ver [clean-core-niveis.md](clean-core-niveis.md).

## Fontes

- [SAP Cloudification Repository](https://github.com/SAP/abap-atc-cr-cv-s4hc) e [viewer](https://sap.github.io/abap-atc-cr-cv-s4hc/)
- SAP Notes 3565942, 3627152 e 3578329; KBA 3786507 (acesso pelo SAP for Me)
