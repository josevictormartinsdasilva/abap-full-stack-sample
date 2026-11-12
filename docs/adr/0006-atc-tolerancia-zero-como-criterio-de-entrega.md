# ADR-0006: ATC com tolerância zero como critério de entrega

- **Status:** Aceito
- **Data:** 2026-11-05

## Contexto

O padrão corporativo exige inspeção pelo ABAP Test Cockpit. A variante cobre verificações de performance, segurança, robustez e Clean Core. O padrão afirma que **não serão aceitos códigos com erros** no resultado.

## Decisão

Nenhuma entrega é considerada concluída sem o `abap-qa-auditor` reportar **ATC sem erros**, usando a variante do tópico 13 do `padrao-desenvolvimento.md` (parâmetro `cliente.varianteATC`).

O `abap-qa-auditor` também aplica QuickFixes via ADT, executa ABAP Unit (`abap_unit_run_tests`) e verifica ESLint no frontend. Ele é a última etapa da ordem de precedência ([ADR-0001](0001-arquitetura-multiagente-com-orquestrador-central.md)).

## Alternativas consideradas (a validar)

- **ATC apenas informativo.** Contradiz o padrão corporativo.
- **Aceitar avisos e bloquear só erros.** É o que a decisão já faz: a tolerância zero vale para erros, não para avisos.

## Consequências

- (+) Padrão de qualidade verificável e igual para todas as entregas.
- (−) A entrega fica bloqueada até a correção dos erros.
- (−) Enquanto `varianteATC` for placeholder, a verificação não pode ser executada (ver [ADR-0008](0008-parametros-do-cliente-centralizados-sem-suposicao.md)).

## Evidências

- `AGENTS.md`, regra 6
- `standards/padrao-desenvolvimento.md`, tópico 13
