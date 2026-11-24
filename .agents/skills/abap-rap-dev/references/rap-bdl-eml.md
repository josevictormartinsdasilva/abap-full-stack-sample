# RAP: Behavior Definition (BDL), Behavior Pool e EML

> **Origem.** Adaptado de `skills/rap/SKILL.md` e `skills/rap/references/eml-quick-reference.md` do repositório [likweitan/abap-skills](https://github.com/likweitan/abap-skills) (commit `b3306be`, licença MIT). Exemplos corrigidos e convertidos para a nomenclatura de [naming-conventions.json](../../../../standards/naming-conventions.json). Ver [THIRD_PARTY_NOTICES.md](../../../../THIRD_PARTY_NOTICES.md).
>
> **Precedência.** Nomes, prefixos e regras de [padrao-desenvolvimento.md](../../../../standards/padrao-desenvolvimento.md) prevalecem sobre qualquer exemplo deste arquivo. Os exemplos usam o módulo `SD` e a entidade `ORDEM` apenas como ilustração.
>
> **Literais nos exemplos** (textos, IDs de objeto, URLs) são ilustrativos. No código real, use constantes ou textos (tópico 17.4 do padrão).

## Quando ler

Antes de escrever ou alterar um BDEF, um behavior pool (`ZCL<MD>_BP_*`) ou código EML.

## Camadas

| Camada | Artefatos (padrão do projeto) | Papel |
|---|---|---|
| Dados | `ZTSD_ORDEM`, `ZTSD_ORDEM_D` (draft) | Persistência |
| Modelo | `ZI_SD_ORDEM` (root), `ZI_SD_ORDEM_ITEM` (filha) | Modelo semântico |
| Comportamento | BDEF `ZI_SD_ORDEM` | Operações e características transacionais |
| Implementação | `ZCLSD_BP_ORDEM` | Handlers e saver |
| Projeção | `ZC_SD_ORDEM`, BDEF de projeção `ZC_SD_ORDEM` | Recorte para o consumidor |
| Serviço | `ZUI_SD_ORDEM` (definition), `ZUI_O4_SD_ORDEM` (binding V4) | Exposição OData |

## Tipos de implementação

- **Managed**: o framework mantém o buffer transacional e o CRUD. Você implementa ações, validações e determinações. O save pode ser complementado com `with additional save` ou substituído por `with unmanaged save`.
- **Unmanaged**: você implementa o buffer e todas as operações. Use quando houver lógica legada a encapsular.

## BDEF completo (managed, draft, UUID gerenciado)

Coerente com o behavior pool mais abaixo: cada handler declarado tem a característica correspondente no BDEF.

```
managed implementation in class zclsd_bp_ordem unique;
strict ( 2 );
with draft;

define behavior for ZI_SD_ORDEM alias Ordem
persistent table ztsd_ordem
draft table ztsd_ordem_d
etag master LocalLastChangedAt
lock master
total etag LastChangedAt
authorization master ( global )
with additional save
{
  field ( readonly, numbering : managed ) OrdemUUID;
  field ( readonly ) CreatedBy, CreatedAt, LastChangedBy, LastChangedAt, LocalLastChangedAt;
  field ( mandatory ) Descricao;
  field ( features : instance ) Status;

  create;
  update;
  delete;

  association _Item { create; with draft; }

  action ( features : instance ) concluir result [1] $self;

  validation validarDescricao on save { create; field Descricao; }
  determination definirStatusInicial on modify { create; }

  draft action Resume;
  draft action Edit;
  draft action Activate optimized;
  draft action Discard;
  draft determine action Prepare
  {
    validation validarDescricao;
  }

  event criada;

  mapping for ztsd_ordem corresponding
  {
    OrdemUUID          = ordem_uuid;
    OrdemId            = ordem_id;
    ValorLiquido       = valor_liquido;
    CreatedBy          = created_by;
    CreatedAt          = created_at;
    LastChangedBy      = last_changed_by;
    LocalLastChangedAt = local_last_changed_at;
    LastChangedAt      = last_changed_at;
  }
}

define behavior for ZI_SD_ORDEM_ITEM alias Item
persistent table ztsd_ordem_item
draft table ztsd_ordem_item_d
etag master LocalLastChangedAt
lock dependent by _Ordem
authorization dependent by _Ordem
{
  field ( readonly, numbering : managed ) ItemUUID;
  field ( readonly ) OrdemUUID;

  update;
  delete;

  association _Ordem { with draft; }

  side effects
  {
    field Quantidade affects field ValorTotal;
  }

  mapping for ztsd_ordem_item corresponding
  {
    ItemUUID           = item_uuid;
    OrdemUUID          = ordem_uuid;
    ValorTotal         = valor_total;
    LocalLastChangedAt = local_last_changed_at;
  }
}
```

`mapping ... corresponding` só liga automaticamente campos de **mesmo nome** (sem diferenciar maiúsculas). Todo campo CDS cujo nome difere da coluna (`CreatedBy` × `created_by`) precisa de linha explícita no mapping. Sem ela, o managed não grava o campo e não acusa erro. Aqui, `Descricao`, `Status`, `Cliente`, `Moeda`, `Produto`, `Quantidade` e `Unidade` batem com as colunas e dispensam linha.

Pontos que costumam dar erro:

- **Numeração**: `numbering : managed` (UUID gerado pelo framework) **exclui** `early numbering` e `late numbering`. Escolha uma estratégia por entidade.
- **Draft + `strict ( 2 )`**: toda associação da composição precisa de `with draft;` dos dois lados (`_Item` na raiz, `_Ordem` na filha).
- **Draft exige** `total etag` na raiz e uma `draft table` por entidade. A tabela draft inclui `"%admin" : include sych_bdl_draft_admin_inc;`.
- **Autorização**: `authorization master ( global )` pede `get_global_authorizations`. `( instance )` pede `get_instance_authorizations`. Os dois juntos: `authorization master ( global, instance )`.
- **Feature control**: `get_instance_features` só existe se houver `features : instance` em algum campo, operação ou ação.
- **Eventos**: `RAISE ENTITY EVENT` só é permitido na sequência de save (`save_modified`). Em BO managed, isso exige `with additional save`.

## BDEF de projeção

```
projection;
strict ( 2 );
use draft;
use side effects;

define behavior for ZC_SD_ORDEM alias Ordem
{
  use create;
  use update;
  use delete;

  use action concluir;

  use action Resume;
  use action Edit;
  use action Activate;
  use action Discard;
  use action Prepare;

  use association _Item { create; with draft; }
}

define behavior for ZC_SD_ORDEM_ITEM alias Item
{
  use update;
  use delete;

  use association _Ordem { with draft; }
}
```

## Behavior pool `ZCLSD_BP_ORDEM`

Os nomes dos parâmetros dos handlers (`keys`, `result`, `failed`, `reported`, `mapped`) são definidos pelo framework e não seguem os prefixos do tópico 12. As variáveis locais seguem (`lt_`, `ls_`, `lv_`).

```abap
CLASS lhc_ordem DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    CONSTANTS:
      BEGIN OF gc_status,
        novo      TYPE c LENGTH 1 VALUE 'N',
        concluido TYPE c LENGTH 1 VALUE 'C',
      END OF gc_status.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR Ordem RESULT result.

    METHODS get_instance_features FOR INSTANCE FEATURES
      IMPORTING keys REQUEST requested_features FOR Ordem RESULT result.

    METHODS concluir FOR MODIFY
      IMPORTING keys FOR ACTION Ordem~concluir RESULT result.

    METHODS validarDescricao FOR VALIDATE ON SAVE
      IMPORTING keys FOR Ordem~validarDescricao.

    METHODS definirStatusInicial FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Ordem~definirStatusInicial.
ENDCLASS.

CLASS lhc_ordem IMPLEMENTATION.

  METHOD get_global_authorizations.
    " Verificação com objeto de autorização liberado/próprio (AUTHORITY-CHECK é permitido em ABAP Cloud)
    IF requested_authorizations-%update = if_abap_behv=>mk-on.
      AUTHORITY-CHECK OBJECT 'ZSD_ORDEM' ID 'ACTVT' FIELD '02'.
      result-%update = COND #( WHEN sy-subrc = 0 THEN if_abap_behv=>auth-allowed
                                                 ELSE if_abap_behv=>auth-unauthorized ).
    ENDIF.
  ENDMETHOD.

  METHOD get_instance_features.
    READ ENTITIES OF zi_sd_ordem IN LOCAL MODE
      ENTITY Ordem
      FIELDS ( Status ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_ordem).

    result = VALUE #( FOR ls_ordem IN lt_ordem
      ( %tky                = ls_ordem-%tky
        %features-%action-concluir = COND #( WHEN ls_ordem-Status = gc_status-concluido
                                             THEN if_abap_behv=>fc-o-disabled
                                             ELSE if_abap_behv=>fc-o-enabled )
        %features-%field-Status    = if_abap_behv=>fc-f-read_only ) ).
  ENDMETHOD.

  METHOD concluir.
    MODIFY ENTITIES OF zi_sd_ordem IN LOCAL MODE
      ENTITY Ordem
      UPDATE FIELDS ( Status )
      WITH VALUE #( FOR ls_key IN keys
        ( %tky = ls_key-%tky  Status = gc_status-concluido ) )
      FAILED failed
      REPORTED reported.

    " Lê depois de modificar, para devolver o estado atualizado
    READ ENTITIES OF zi_sd_ordem IN LOCAL MODE
      ENTITY Ordem
      ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(lt_ordem).

    result = VALUE #( FOR ls_ordem IN lt_ordem
      ( %tky = ls_ordem-%tky  %param = ls_ordem ) ).
  ENDMETHOD.

  METHOD validarDescricao.
    READ ENTITIES OF zi_sd_ordem IN LOCAL MODE
      ENTITY Ordem
      FIELDS ( Descricao ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_ordem).

    LOOP AT lt_ordem INTO DATA(ls_ordem).
      " Limpa mensagens anteriores desta validação (draft)
      APPEND VALUE #( %tky = ls_ordem-%tky  %state_area = 'VALIDAR_DESCRICAO' )
        TO reported-ordem.

      IF ls_ordem-Descricao IS INITIAL.
        APPEND VALUE #( %tky = ls_ordem-%tky ) TO failed-ordem.
        APPEND VALUE #( %tky        = ls_ordem-%tky
                        %state_area = 'VALIDAR_DESCRICAO'
                        %msg        = new_message(
                                        id       = 'ZSD_ORDEM'   " classe de mensagem Z<MD>_<DESCRICAO>
                                        number   = '001'         " "Descrição obrigatória"
                                        severity = if_abap_behv_message=>severity-error )
                        %element-Descricao = if_abap_behv=>mk-on )
          TO reported-ordem.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD definirStatusInicial.
    READ ENTITIES OF zi_sd_ordem IN LOCAL MODE
      ENTITY Ordem
      FIELDS ( Status ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_ordem).

    " Só preenche quem ainda não tem status
    DELETE lt_ordem WHERE Status IS NOT INITIAL.
    IF lt_ordem IS INITIAL.
      RETURN.
    ENDIF.

    MODIFY ENTITIES OF zi_sd_ordem IN LOCAL MODE
      ENTITY Ordem
      UPDATE FIELDS ( Status )
      WITH VALUE #( FOR ls_ordem IN lt_ordem
        ( %tky = ls_ordem-%tky  Status = gc_status-novo ) )
      REPORTED DATA(lt_reported).

    reported = CORRESPONDING #( DEEP lt_reported ).
  ENDMETHOD.

ENDCLASS.

CLASS lsc_zi_sd_ordem DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save_modified REDEFINITION.
ENDCLASS.

CLASS lsc_zi_sd_ordem IMPLEMENTATION.

  METHOD save_modified.
    " Permitido aqui porque o BDEF declara "with additional save"
    IF create-ordem IS NOT INITIAL.
      RAISE ENTITY EVENT zi_sd_ordem~criada
        FROM VALUE #( FOR ls_criada IN create-ordem
          ( %key-OrdemUUID = ls_criada-OrdemUUID ) ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.
```

Observações:

- `MODIFY ... UPDATE FIELDS ( ... )` já liga o `%control` dos campos listados. Liste só os campos que você realmente preenche.
- Não reutilize a mesma variável `failed` em READ e MODIFY seguidos: o segundo sobrescreve o primeiro.

## Sequência de save

| Fase | Métodos | Propósito |
|---|---|---|
| Early save | `finalize` → `check_before_save` (falha → `cleanup_finalize`) | Garantir consistência. Uma falha devolve o controle à fase de interação |
| Late save | `adjust_numbers` → `save` / `save_modified` → `cleanup` | Persistir. Ponto sem volta: ou grava, ou ocorre erro de runtime |

## Componentes derivados mais usados

| Componente | Uso |
|---|---|
| `%cid` | ID provisório de instância criada na mesma requisição |
| `%cid_ref` | Referência a um `%cid` da mesma requisição |
| `%key` | Campos-chave |
| `%tky` | Chave transacional (`%key` + `%is_draft` + `%pid`). Prefira sempre |
| `%control` | Quais campos foram fornecidos ou pedidos |
| `%is_draft` | Indicador de draft |
| `%pid` | ID preliminar (late numbering) |
| `%target` | Instâncias-alvo de create-by-association |
| `%param` | Parâmetro ou resultado de ação/função |
| `%state_area` | Agrupa mensagens de estado (validações em draft) |

## EML: referência rápida

```abap
" Create
MODIFY ENTITIES OF zi_sd_ordem
  ENTITY Ordem
  CREATE FIELDS ( Descricao )
  WITH VALUE #( ( %cid = 'ORDEM_1'  Descricao = 'Nova ordem' ) )
  MAPPED DATA(ls_mapped)
  FAILED DATA(ls_failed)
  REPORTED DATA(ls_reported).

" Read
READ ENTITIES OF zi_sd_ordem
  ENTITY Ordem
  ALL FIELDS WITH VALUE #( ( OrdemUUID = lv_ordem_uuid ) )
  RESULT DATA(lt_ordem)
  FAILED DATA(ls_failed_read).

" Update
MODIFY ENTITIES OF zi_sd_ordem
  ENTITY Ordem
  UPDATE FIELDS ( Descricao )
  WITH VALUE #( ( %tky = ls_ordem-%tky  Descricao = 'Alterada' ) )
  FAILED DATA(ls_failed_upd).

" Delete
MODIFY ENTITIES OF zi_sd_ordem
  ENTITY Ordem
  DELETE FROM VALUE #( ( %tky = ls_ordem-%tky ) )
  FAILED DATA(ls_failed_del).

" Ação
MODIFY ENTITIES OF zi_sd_ordem
  ENTITY Ordem
  EXECUTE concluir FROM VALUE #( ( %tky = ls_ordem-%tky ) )
  RESULT DATA(lt_resultado)
  FAILED DATA(ls_failed_act).

" Deep create (raiz + itens)
MODIFY ENTITIES OF zi_sd_ordem
  ENTITY Ordem
  CREATE FIELDS ( Descricao )
  WITH VALUE #( ( %cid = 'ORDEM_1'  Descricao = 'Com itens' ) )
  CREATE BY \_Item
  FIELDS ( Quantidade )
  WITH VALUE #( ( %cid_ref = 'ORDEM_1'
                  %target  = VALUE #( ( %cid = 'ITEM_1'  Quantidade = 1 )
                                      ( %cid = 'ITEM_2'  Quantidade = 2 ) ) ) )
  MAPPED DATA(ls_mapped_deep).

" Persistir ou descartar (fora de handlers; nunca dentro do behavior pool)
COMMIT ENTITIES RESPONSE OF zi_sd_ordem
  FAILED DATA(ls_failed_commit)
  REPORTED DATA(ls_reported_commit).
IF sy-subrc <> 0.
  ROLLBACK ENTITIES.
ENDIF.
```

Regras:

- `IN LOCAL MODE` só dentro do próprio behavior pool. Ele ignora feature control e autorização.
- Nunca use `COMMIT ENTITIES` / `COMMIT WORK` dentro de handlers ou saver. Quem confirma é o framework ou o consumidor.
- Preencha `%cid` em toda criação, mesmo sem referência posterior.

## Clean core

RAP com APIs liberadas é nível A. Uma única chamada a objeto interno rebaixa a aplicação para nível C. Uma API clássica só pode ser usada dentro de RAP se tiver o rótulo `transactional-consistent` no Cloudification Repository. Detalhes em [clean-core-niveis.md](../../abap-qa-auditor/references/clean-core-niveis.md).

## Fontes

- [SAP ABAP Cheat Sheets: RAP BDL](https://github.com/SAP-samples/abap-cheat-sheets/blob/main/36_RAP_Behavior_Definition_Language.md) e [EML](https://github.com/SAP-samples/abap-cheat-sheets/blob/main/08_EML_ABAP_for_RAP.md)
- [ABAP Flight Reference Scenario](https://github.com/SAP-samples/abap-platform-refscen-flight)
- [Referência BDL (ABAP Keyword Documentation)](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/ABENBDL.html)
