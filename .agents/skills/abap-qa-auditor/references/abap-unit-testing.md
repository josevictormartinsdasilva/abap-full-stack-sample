# ABAP Unit: testes, dublês e ambientes de teste

> **Origem.** Adaptado de `skills/abap-unit-testing/SKILL.md` e `skills/abap-unit-testing/references/test-environment-examples.md` do repositório [likweitan/abap-skills](https://github.com/likweitan/abap-skills) (commit `b3306be`, licença MIT). Traduzido, revisado e convertido para os prefixos do tópico 12 de [padrao-desenvolvimento.md](../../../../standards/padrao-desenvolvimento.md). Ver [THIRD_PARTY_NOTICES.md](../../../../THIRD_PARTY_NOTICES.md).
>
> **Precedência.** Os cenários de teste vêm da especificação funcional e das planilhas de teste unitário (tópico 3 do padrão). Este arquivo trata de **como** automatizá-los. ABAP Unit só é executado em DEV/SANDBOX (ver a skill).
>
> **Literais nos exemplos** (textos, IDs de objeto, URLs) são ilustrativos. No código real, use constantes ou textos (tópico 17.4 do padrão).

## Quando ler

Ao escrever ou revisar classes de teste, ao isolar dependências (banco, CDS, BO RAP, serviços) e ao analisar falhas de ABAP Unit.

## Convenções deste projeto

- Classes de teste e dublês são classes locais: prefixo `LCL_` (tópico 12). Use `lcl_teste_<nome>` para testes e `lcl_double_<nome>` para dublês.
- Atributos seguem o bloco "classes" do tópico 12 (`GO_`, `GV_`, `GT_`). Variáveis locais, `LV_`, `LT_`, `LS_`, `LO_`.
- Nomes de métodos de teste descrevem o comportamento: `deve_rejeitar_quantidade_negativa`, não `test_1`.
- Estrutura AAA: preparar (*arrange*), executar (*act*), verificar (*assert*).

## Classe de teste

```abap
CLASS lcl_teste_calculo DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    DATA go_cut TYPE REF TO zclsd_calculo_ordem.   " classe sob teste

    METHODS setup.
    METHODS deve_somar_itens          FOR TESTING.
    METHODS deve_rejeitar_qtd_negativa FOR TESTING RAISING cx_static_check.
ENDCLASS.

CLASS lcl_teste_calculo IMPLEMENTATION.

  METHOD setup.
    go_cut = NEW #( ).
  ENDMETHOD.

  METHOD deve_somar_itens.
    " Arrange
    DATA(lv_quantidade) = 5.
    DATA(lv_preco)      = CONV decfloat34( '10.50' ).

    " Act
    DATA(lv_total) = go_cut->calcular_total( iv_quantidade = lv_quantidade
                                             iv_preco      = lv_preco ).

    " Assert
    cl_abap_unit_assert=>assert_equals( act = lv_total
                                        exp = CONV decfloat34( '52.50' )
                                        msg = 'Total deve ser quantidade x preço' ).
  ENDMETHOD.

  METHOD deve_rejeitar_qtd_negativa.
    TRY.
        go_cut->calcular_total( iv_quantidade = -1  iv_preco = 1 ).
        cl_abap_unit_assert=>fail( msg = 'Deveria ter levantado exceção' ).
      CATCH zcxsd_erro_validacao.
        " esperado
    ENDTRY.
  ENDMETHOD.

ENDCLASS.
```

| Atributo | Valores | Observação |
|---|---|---|
| `DURATION` | `SHORT` / `MEDIUM` / `LONG` | Prefira `SHORT` |
| `RISK LEVEL` | `HARMLESS` / `DANGEROUS` / `CRITICAL` | `HARMLESS` = não altera dados persistentes |

Ciclo de vida: `class_setup` (uma vez, estático) → `setup` (antes de cada teste) → teste → `teardown` → `class_teardown`.

## Asserções mais usadas (`CL_ABAP_UNIT_ASSERT`)

| Método | Uso |
|---|---|
| `assert_equals( act exp )` | Igualdade |
| `assert_differs( act exp )` | Diferença |
| `assert_true` / `assert_false` | Booleano |
| `assert_initial` / `assert_not_initial` | Valor inicial |
| `assert_bound` / `assert_not_bound` | Referência |
| `assert_char_cp( act exp )` | Padrão de texto (`*erro*`) |
| `assert_number_between( lower upper number )` | Faixa numérica |
| `assert_table_contains( line table )` | Linha na tabela |
| `assert_subrc( exp )` / `assert_return_code( exp act )` | `sy-subrc` |
| `fail( msg )` | Falha forçada |

## Injeção de dependência e dublê manual

```abap
" Produção: dependência por interface, injetável no construtor
CLASS zclsd_processador DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS constructor IMPORTING io_fonte TYPE REF TO zifsd_fonte_dados OPTIONAL.
    METHODS processar   RETURNING VALUE(rv_resultado) TYPE string.
  PRIVATE SECTION.
    DATA go_fonte TYPE REF TO zifsd_fonte_dados.
ENDCLASS.

CLASS zclsd_processador IMPLEMENTATION.
  METHOD constructor.
    go_fonte = COND #( WHEN io_fonte IS BOUND THEN io_fonte ELSE NEW zclsd_fonte_dados( ) ).
  ENDMETHOD.
  METHOD processar.
    rv_resultado = |{ lines( go_fonte->obter_dados( ) ) } registros|.
  ENDMETHOD.
ENDCLASS.
```

```abap
" Teste: dublê local implementando a interface
CLASS lcl_double_fonte DEFINITION FINAL FOR TESTING.
  PUBLIC SECTION.
    INTERFACES zifsd_fonte_dados.
    DATA gt_dados TYPE zifsd_fonte_dados=>tt_dados.
ENDCLASS.

CLASS lcl_double_fonte IMPLEMENTATION.
  METHOD zifsd_fonte_dados~obter_dados.
    rt_dados = gt_dados.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_teste_processador DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    DATA go_double TYPE REF TO lcl_double_fonte.
    DATA go_cut    TYPE REF TO zclsd_processador.
    METHODS setup.
    METHODS deve_contar_registros FOR TESTING.
ENDCLASS.

CLASS lcl_teste_processador IMPLEMENTATION.
  METHOD setup.
    go_double = NEW #( ).
    go_cut    = NEW #( io_fonte = go_double ).
  ENDMETHOD.
  METHOD deve_contar_registros.
    go_double->gt_dados = VALUE #( ( chave = '1' ) ( chave = '2' ) ).
    cl_abap_unit_assert=>assert_equals( act = go_cut->processar( )  exp = `2 registros` ).
  ENDMETHOD.
ENDCLASS.
```

Também há dublês gerados por framework: `cl_abap_testdouble=>create( 'ZIFSD_FONTE_DADOS' )` com `cl_abap_testdouble=>configure_call( )`.

## CDS test environment

Isola **todas** as fontes de dados de uma CDS.

```abap
CLASS lcl_teste_cds_ordem DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    CLASS-DATA go_ambiente TYPE REF TO if_cds_test_environment.
    CLASS-METHODS class_setup.
    CLASS-METHODS class_teardown.
    METHODS setup.
    METHODS deve_listar_ordens_cliente FOR TESTING.
ENDCLASS.

CLASS lcl_teste_cds_ordem IMPLEMENTATION.
  METHOD class_setup.
    go_ambiente = cl_cds_test_environment=>create( i_for_entity = 'ZI_SD_ORDEM' ).
  ENDMETHOD.
  METHOD class_teardown.
    go_ambiente->destroy( ).
  ENDMETHOD.
  METHOD setup.
    go_ambiente->clear_doubles( ).
  ENDMETHOD.
  METHOD deve_listar_ordens_cliente.
    DATA lt_ordem TYPE STANDARD TABLE OF ztsd_ordem WITH EMPTY KEY.
    lt_ordem = VALUE #( ( ordem_id = '001' cliente = 'C1' valor_liquido = 100 moeda = 'BRL' )
                        ( ordem_id = '002' cliente = 'C1' valor_liquido = 200 moeda = 'BRL' ) ).
    go_ambiente->insert_test_data( i_data = lt_ordem ).

    SELECT FROM zi_sd_ordem FIELDS OrdemId WHERE Cliente = 'C1' INTO TABLE @DATA(lt_resultado).

    cl_abap_unit_assert=>assert_equals( act = lines( lt_resultado )  exp = 2 ).
  ENDMETHOD.
ENDCLASS.
```

## OSQL test environment

Isola tabelas/views lidas por código ABAP SQL de uma classe.

```abap
METHOD class_setup.
  go_ambiente = cl_osql_test_environment=>create(
                  i_dependency_list = VALUE #( ( 'ZTSD_ORDEM' ) ( 'ZTSD_ORDEM_ITEM' ) ) ).
ENDMETHOD.
```

Mesmo ciclo do CDS test environment: `insert_test_data`, `clear_doubles` no `setup`, `destroy` no `class_teardown`.

## RAP: dublês de BO

| Objetivo | Ferramenta |
|---|---|
| Testar código que **consome** um BO via EML | Dublê de buffer transacional: `cl_botd_txbufdbl_bo_test_env` |
| Testar código que consome um BO com respostas controladas | Mock de API EML: `cl_botd_mockemlapi_bo_test_env` |
| Testar **handlers** do behavior pool | Instanciar o handler com `CREATE OBJECT ... FOR TESTING` |

```abap
" Consumidor de BO: buffer transacional substituído
METHOD class_setup.
  go_ambiente = cl_botd_txbufdbl_bo_test_env=>create(
                  environment_config = cl_botd_txbufdbl_bo_test_env=>prepare_environment_config(
                                         )->set_bdef_dependencies( VALUE #( ( 'ZI_SD_ORDEM' ) ) ) ).
ENDMETHOD.
```

```abap
" Handler: a classe de teste precisa ser amiga local do handler
CLASS lcl_teste_handler DEFINITION DEFERRED.
CLASS lhc_ordem DEFINITION LOCAL FRIENDS lcl_teste_handler.

CLASS lcl_teste_handler DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    CLASS-DATA go_cds_amb TYPE REF TO if_cds_test_environment.
    DATA       go_handler TYPE REF TO lhc_ordem.
    CLASS-METHODS class_setup.
    CLASS-METHODS class_teardown.
    METHODS setup.
    METHODS deve_reprovar_sem_descricao FOR TESTING.
ENDCLASS.

CLASS lcl_teste_handler IMPLEMENTATION.
  METHOD class_setup.
    go_cds_amb = cl_cds_test_environment=>create( i_for_entity = 'ZI_SD_ORDEM' ).
  ENDMETHOD.
  METHOD class_teardown.
    go_cds_amb->destroy( ).
  ENDMETHOD.
  METHOD setup.
    go_cds_amb->clear_doubles( ).
    CREATE OBJECT go_handler FOR TESTING.
  ENDMETHOD.
  METHOD deve_reprovar_sem_descricao.
    " Arrange: dados no dublê; Act: chamar o método do handler com keys/failed/reported;
    " Assert: failed-ordem preenchido.
  ENDMETHOD.
ENDCLASS.
```

Os métodos de configuração dos dublês RAP (respostas, chamadas esperadas) variam por release. Consulte [RAP BO test doubles](https://help.sap.com/docs/abap-cloud/abap-rap/test) antes de usar a API de configuração.

## Test seams (código legado)

Para tornar testável código clássico sem refatorar. Em código novo, prefira injeção de dependência.

```abap
" Produção
METHOD obter_data.
  TEST-SEAM data_atual.
    rv_data = cl_abap_context_info=>get_system_date( ).
  END-TEST-SEAM.
ENDMETHOD.

" Teste
METHOD deve_usar_data_futura.
  TEST-INJECTION data_atual.
    rv_data = '20301231'.
  END-TEST-INJECTION.
  cl_abap_unit_assert=>assert_equals( act = go_cut->obter_data( )  exp = '20301231' ).
ENDMETHOD.
```

## Boas práticas

- Um comportamento por teste. Testes independentes entre si e da ordem de execução.
- Nada de dados persistentes reais: dublê para banco, CDS, BO, HTTP e RFC.
- `clear_doubles( )` no `setup`; `destroy( )` no `class_teardown`.
- Teste regras de negócio, validações, cálculos de CDS e handlers RAP. Não teste o CRUD gerenciado do framework nem getters/setters triviais.

## Fontes

- [SAP ABAP Cheat Sheets: ABAP Unit Tests](https://github.com/SAP-samples/abap-cheat-sheets/blob/main/14_ABAP_Unit_Tests.md)
- [ABAP Unit (ABAP Keyword Documentation)](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenunit_test.htm)
- [RAP BO test doubles](https://help.sap.com/docs/abap-cloud/abap-rap/test)
