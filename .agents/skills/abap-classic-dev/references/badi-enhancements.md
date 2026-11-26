# BAdIs, exits e enhancements

> **Origem.** Adaptado de `skills/badi-enhancement/SKILL.md` e `skills/badi-enhancement/references/badi-patterns.md` do repositório [likweitan/abap-skills](https://github.com/likweitan/abap-skills) (commit `b3306be`, licença MIT). Corrigido, traduzido e alinhado ao tópico 17 de [padrao-desenvolvimento.md](../../../../standards/padrao-desenvolvimento.md). Ver [THIRD_PARTY_NOTICES.md](../../../../THIRD_PARTY_NOTICES.md).
>
> **Precedência.** As regras do tópico 17 do padrão prevalecem sobre a classificação clean core. A classificação entra no relatório como informação de risco.
>
> **Literais nos exemplos** (textos, IDs de objeto, URLs) são ilustrativos. No código real, use constantes ou textos (tópico 17.4 do padrão).

## Quando ler

Antes de implementar ou criar uma BAdI, uma user/customer exit ou um enhancement, e ao avaliar se um enhancement existente pode ser substituído.

## Regras e nomes

- **Regras**: tópicos 17.5 a 17.9 de [padrao-desenvolvimento.md](../../../../standards/padrao-desenvolvimento.md) (ordem BAdI → Exit → Enhancement, lógica em include com `IF FOUND`, enhancement implícito só com alinhamento prévio da frente técnica, comandos a evitar, memória). Os exemplos abaixo já seguem essas regras.
- **Nomes**: bloco `extensibilidadesEIntegracoes` (BAdI, enhancement implementation, exit) e blocos de classes/interfaces e programas/includes de [naming-conventions.json](../../../../standards/naming-conventions.json). Os exemplos usam `ZSD_CALCULO_IMPOSTO` (BAdI), `ZIFSD_*` (interface), `ZCLSD_*` (classe), `ZEISD_*` (enhancement implementation) e `ZSDI_*` (include).
- **Enhancement spot**: o padrão não define nome. Pergunte ao usuário antes de criar um.
- **Enhancement implícito**: o agente não cria sem a confirmação do alinhamento com a frente técnica, registrada pelo usuário.

## Clean core por técnica

| Técnica | Nível | Observação |
|---|---|---|
| Key user extensibility | A | Campos, lógica (app *Custom Logic*, ABAP restrito) e CDS customizados |
| BAdI liberada | A | Ponto de extensão preferido |
| Extension include liberado | A | Para campos em tabelas e CDS |
| `extend view entity` / metadata extension | A/B | Em vez de modificar CDS SAP |
| BAdI não liberada | B | Boa escolha em código clássico |
| User exit (VOFM, `SAPMV45A`) | B | Estável; tecnicamente é modificação |
| Customer exit (SMOD/CMOD) | B | Use só onde não houver BAdI |
| Append de domínio, search help append/exit | B | Aceitáveis |
| CI include / extension include não liberado | B | Monitorar include liberado |
| Append clássico em tabela SAP | C | Migrar para extension include quando existir |
| Enhancement explícito hospedando BAdI própria | B/D | Só para chamar uma BAdI. Código inline no spot = D |
| Enhancement implícito | D | Equivale a modificação |
| Source code plug-in | D | Achado ATC prioridade 1 |
| BAdI marcada como interna da SAP | D | Só em caso excepcional |
| Modificação | D | Evitar. Se inevitável, usar o modification assistant |

Achados de nível D aparecem como prioridade 1 no ATC (checks "Allowed Enhancement Technologies" e "Search customer modifications") e **reprovam a entrega** pelo tópico 13. Por isso um enhancement implícito aprovado pela frente técnica ainda precisa de isenção ATC aprovada pelo cliente. Ver [clean-core-niveis.md](../../abap-qa-auditor/references/clean-core-niveis.md).

## BAdI nova (enhancement framework)

| Aspecto | BAdI nova | BAdI clássica |
|---|---|---|
| Ferramenta | ADT ou SE18/SE19 | SE18/SE19 |
| Container | Enhancement spot | Não tem |
| Uso | Único **ou** múltiplo (definido na BAdI) | Único ou múltiplo |
| Filtro | Tipos de filtro | Valores de filtro |
| Fallback | Sim | Não |
| ABAP Cloud | Só BAdIs liberadas | Não disponível |
| Chamada | `GET BADI` / `CALL BADI` | `cl_exithandler=>get_instance` |

### Chamar uma BAdI

A variável de referência tem o tipo **da BAdI** (nome da definição), não da interface.

```abap
DATA lo_badi TYPE REF TO zsd_calculo_imposto.

TRY.
    GET BADI lo_badi
      FILTERS pais = lv_pais.

    CALL BADI lo_badi->calcular
      EXPORTING is_documento = ls_documento
      CHANGING  ct_mensagens = lt_mensagens.

  CATCH cx_badi_not_implemented.
    " Só ocorre em BAdI de uso único sem implementação ativa e sem fallback
  CATCH cx_badi_multiply_implemented.
    " BAdI de uso único com mais de uma implementação ativa
ENDTRY.
```

Em BAdI de uso múltiplo sem implementação, `GET BADI` não levanta exceção e `CALL BADI` simplesmente não faz nada.

### Interface

Não declare `cx_badi_not_implemented` na interface: essa exceção é do `GET BADI`.

```abap
INTERFACE zifsd_calculo_imposto PUBLIC.
  INTERFACES if_badi_interface.

  METHODS calcular
    IMPORTING is_documento TYPE zssd_documento
    CHANGING  ct_mensagens TYPE bapiret2_t.
ENDINTERFACE.
```

### Implementação (padrão do include)

```abap
CLASS zclsd_badi_imposto_br DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_badi_interface.
    INTERFACES zifsd_calculo_imposto.
ENDCLASS.

CLASS zclsd_badi_imposto_br IMPLEMENTATION.
  METHOD zifsd_calculo_imposto~calcular.
    " Toda a lógica fica no include (tópico 17.6 do padrão).
    INCLUDE zsdi_badi_imposto IF FOUND.
  ENDMETHOD.
ENDCLASS.
```

O padrão do include vale para código clássico (Standard ABAP). Em ABAP for Cloud Development não existe `INCLUDE` de programa: a lógica fica na própria classe, e só BAdIs liberadas podem ser implementadas.

### Criar uma BAdI própria (passos no ADT)

1. Enhancement spot (nome a confirmar com o usuário).
2. Definição da BAdI `Z<MD>_*` no spot: interface, uso único ou múltiplo, filtros, classe fallback (opcional).
3. Interface `ZIF<MD>_*` com `if_badi_interface`.
4. Ponto de chamada com `GET BADI` / `CALL BADI` no código próprio.
5. Enhancement implementation `ZEI<MD>_*` e classe `ZCL<MD>_*` para cada implementação.

### Encontrar uma BAdI existente

- ADT: busca por BAdI ou enhancement spot; em S/4HANA com ABAP Cloud, objetos liberados com `api:` na busca.
- SE18 / SE84.
- Depuração: breakpoint na instrução `GET BADI` (BAdI nova) ou em `cl_exithandler=>get_instance` (BAdI clássica) durante o processo.
- Cloudification Repository: BAdIs `classicAPI` (nível B) e liberadas (nível A).

## Exits

```abap
" Dentro da exit (ex.: include de user exit ou FM de customer exit):
* Lógica no include ZSDI_USEREXIT_SAVE (tópico 17.7)
INCLUDE zsdi_userexit_save IF FOUND.
```

## Substituir técnicas de nível D

| Existente | Substituto, em ordem de preferência |
|---|---|
| Modificação | BAdI liberada → BAdI clássica → key user extensibility |
| Enhancement implícito | BAdI liberada → BAdI clássica |
| Enhancement explícito com código inline | Mover a lógica para BAdI própria chamada do spot |
| Source code plug-in | BAdI liberada ou clássica |
| Implementação de BAdI interna da SAP | Outro ponto de extensão liberado ou clássico |
| Nota SAP com correção manual | Desfazer quando a correção chegar no pacote de suporte |

Fluxo:
1. Rodar o ATC (ver skill `abap-qa-auditor`) e listar os achados de prioridade 1 de enhancement e modificação.
2. Para cada um, procurar BAdI liberada; senão, BAdI clássica.
3. Sem nenhuma das duas: key user extensibility, ou BAdI própria hospedada num enhancement explícito.
4. Apresentar o plano ao usuário (regra 1 do `AGENTS.md`) antes de remover qualquer enhancement.
5. Migrar a lógica, remover a técnica de nível D e rodar o ATC de novo.

Enhancement explícito hospedando BAdI própria (sem lógica inline):

```abap
ENHANCEMENT 1 zeisd_preco_custom.
  DATA lo_badi TYPE REF TO zsd_preco_custom.
  GET BADI lo_badi.
  CALL BADI lo_badi->ajustar CHANGING cs_item = ls_item.
ENDENHANCEMENT.
```

## Testes

Teste a **classe de implementação** diretamente com ABAP Unit, injetando os dados. Não teste um dublê da BAdI no lugar da implementação. Ver [abap-unit-testing.md](../../abap-qa-auditor/references/abap-unit-testing.md).

## Fontes

- [SAP ABAP Cheat Sheets: BAdIs](https://github.com/SAP-samples/abap-cheat-sheets/blob/main/35_BAdIs.md)
- Guia SAP *Extend SAP S/4HANA in the cloud and on premise with ABAP based extensions*, v2.3 (agosto de 2025)
