# CDS View Entities

> **Origem.** Adaptado de `skills/cds-view-entities/SKILL.md` do repositório [likweitan/abap-skills](https://github.com/likweitan/abap-skills) (commit `b3306be`, licença MIT). Exemplos corrigidos e convertidos para a nomenclatura de [naming-conventions.json](../../../../standards/naming-conventions.json). Ver [THIRD_PARTY_NOTICES.md](../../../../THIRD_PARTY_NOTICES.md).
>
> **Precedência.** O [padrao-desenvolvimento.md](../../../../standards/padrao-desenvolvimento.md) prevalece. Exemplos com módulo `SD` e entidade `ORDEM` são ilustrativos.
>
> **Literais nos exemplos** (textos, IDs de objeto, URLs) são ilustrativos. No código real, use constantes ou textos (tópico 17.4 do padrão).

## Quando ler

Antes de criar ou alterar CDS view entities, projeções, metadata extensions, access controls (DCL) ou value helps.

## Regras gerais

- Use sempre `define view entity` (sem `@AbapCatalog.sqlViewName`). `define view` é legado.
- Nomes: `ZI_<MD>_*` (basic/composite, inclusive raiz RAP), `ZC_<MD>_*` (projeção/consumo), `ZI_<MD>_VH_*` (value help). DCL e DDLX têm o mesmo nome da view.
- Exponha as associações que o consumidor (ABAP SQL, projeção, OData) precisa.
- Anotações de UI ficam na metadata extension, não na view.

## Raiz RAP com campos administrativos

```cds
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'Ordem de venda'
define root view entity ZI_SD_ORDEM
  as select from ztsd_ordem
  composition [0..*] of ZI_SD_ORDEM_ITEM as _Item
  association [0..1] to I_Customer       as _Cliente on $projection.Cliente = _Cliente.Customer
{
  key ordem_uuid            as OrdemUUID,
      ordem_id              as OrdemId,
      cliente               as Cliente,
      descricao             as Descricao,
      status                as Status,
      @Semantics.amount.currencyCode: 'Moeda'
      valor_liquido         as ValorLiquido,
      moeda                 as Moeda,

      @Semantics.user.createdBy: true
      created_by            as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at            as CreatedAt,
      @Semantics.user.localInstanceLastChangedBy: true
      last_changed_by       as LastChangedBy,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed_at as LocalLastChangedAt,
      @Semantics.systemDateTime.lastChangedAt: true
      last_changed_at       as LastChangedAt,

      _Item,
      _Cliente
}
```

Cada alias aparece uma única vez. `LocalLastChangedAt` (etag da instância) e `LastChangedAt` (total etag do draft) vêm de **colunas diferentes** da tabela.

| Campo | Tipo na tabela | Anotação | Uso |
|---|---|---|---|
| `CreatedBy` | `abp_creation_user` | `@Semantics.user.createdBy` | Quem criou |
| `CreatedAt` | `abp_creation_tstmpl` | `@Semantics.systemDateTime.createdAt` | Quando criou |
| `LastChangedBy` | `abp_locinst_lastchange_user` | `@Semantics.user.localInstanceLastChangedBy` | Quem alterou |
| `LocalLastChangedAt` | `abp_locinst_lastchange_tstmpl` | `@Semantics.systemDateTime.localInstanceLastChangedAt` | `etag master` |
| `LastChangedAt` | `abp_lastchange_tstmpl` | `@Semantics.systemDateTime.lastChangedAt` | `total etag` (draft) |

## Filha da composição

```cds
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'Item da ordem de venda'
define view entity ZI_SD_ORDEM_ITEM
  as select from ztsd_ordem_item
  association to parent ZI_SD_ORDEM as _Ordem on $projection.OrdemUUID = _Ordem.OrdemUUID
{
  key item_uuid             as ItemUUID,
      ordem_uuid            as OrdemUUID,
      produto               as Produto,
      @Semantics.quantity.unitOfMeasure: 'Unidade'
      quantidade            as Quantidade,
      unidade               as Unidade,
      @Semantics.amount.currencyCode: 'Moeda'
      valor_total           as ValorTotal,
      moeda                 as Moeda,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed_at as LocalLastChangedAt,

      _Ordem
}
```

## Projeção transacional

A projeção de uma raiz também é raiz e declara o contrato do provedor.

```cds
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'Ordem de venda - projeção'
@Metadata.allowExtensions: true
define root view entity ZC_SD_ORDEM
  provider contract transactional_query
  as projection on ZI_SD_ORDEM
{
  key OrdemUUID,
      OrdemId,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_SD_VH_CLIENTE', element: 'Cliente' } }]
      Cliente,
      Descricao,
      Status,
      ValorLiquido,
      Moeda,
      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LocalLastChangedAt,
      LastChangedAt,

      _Item : redirected to composition child ZC_SD_ORDEM_ITEM
}
```

```cds
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'Item da ordem - projeção'
@Metadata.allowExtensions: true
define view entity ZC_SD_ORDEM_ITEM
  as projection on ZI_SD_ORDEM_ITEM
{
  key ItemUUID,
      OrdemUUID,
      Produto,
      Quantidade,
      Unidade,
      ValorTotal,
      Moeda,
      LocalLastChangedAt,

      _Ordem : redirected to parent ZC_SD_ORDEM
}
```

## Metadata extension (DDLX)

Mesmo nome da projeção. Chaves técnicas ocultas e posições em incrementos de 10, conforme a skill `abap-rap-dev`.

```cds
@Metadata.layer: #CUSTOMER
@UI.headerInfo: { typeName: 'Ordem', typeNamePlural: 'Ordens',
                  title: { type: #STANDARD, value: 'OrdemId' },
                  description: { type: #STANDARD, value: 'Descricao' } }
annotate entity ZC_SD_ORDEM with
{
  @UI.facet: [ { id: 'Geral', purpose: #STANDARD, type: #IDENTIFICATION_REFERENCE,
                 label: 'Dados gerais', position: 10 },
               { id: 'Itens', purpose: #STANDARD, type: #LINEITEM_REFERENCE,
                 label: 'Itens', position: 20, targetElement: '_Item' } ]
  @UI.hidden: true
  OrdemUUID;

  @UI.lineItem: [{ position: 10, importance: #HIGH }]
  @UI.identification: [{ position: 10 }]
  @UI.selectionField: [{ position: 10 }]
  OrdemId;

  @UI.lineItem: [{ position: 20 }]
  @UI.identification: [{ position: 20 }]
  @UI.selectionField: [{ position: 20 }]
  Cliente;

  @UI.lineItem: [{ position: 30 }]
  @UI.identification: [{ position: 30 }]
  ValorLiquido;
}
```

## Associações em ABAP SQL

```abap
" Expressão de caminho (LEFT OUTER JOIN por padrão)
SELECT FROM zi_sd_ordem
  FIELDS OrdemId, \_Cliente-CustomerName
  WHERE OrdemId = @lv_ordem_id
  INTO TABLE @DATA(lt_ordem).

" Filtro na associação
SELECT FROM zi_sd_ordem
  FIELDS OrdemId, \_Item[ Produto = 'PROD01' ]-Quantidade
  WHERE OrdemId = @lv_ordem_id
  INTO TABLE @DATA(lt_item).
```

Prefira associações a joins: são resolvidas sob demanda e permitem expressões de caminho.

## Expressões

```cds
cast( valor as abap.dec(15,2) )                         as ValorConvertido,
case status when 'N' then 'Novo' when 'C' then 'Concluído' else 'Outro' end as StatusTexto,
case when valor_liquido > 10000 then 'A' when valor_liquido > 1000 then 'B' else 'C' end as Faixa,
quantidade * preco_unitario                             as ValorCalculado,
concat_with_space( nome, sobrenome, 1 )                 as NomeCompleto,
substring( cep, 1, 2 )                                  as Regiao,
dats_days_between( data_inicio, data_fim )              as DuracaoDias,
dats_add_days( data_ordem, 30, 'INITIAL' )              as Vencimento,
$session.user                                           as UsuarioAtual,
$session.system_date                                    as DataSistema
```

Agregação (o `group by` lista todos os campos não agregados):

```cds
define view entity ZI_SD_ORDEM_RESUMO
  as select from ztsd_ordem
{
  key cliente                                     as Cliente,
      count(*)                                    as QtdOrdens,
      sum( valor_liquido )                        as ValorTotal,
      avg( valor_liquido as abap.dec(15,2) )      as ValorMedio,
      max( data_ordem )                           as UltimaOrdem
}
group by cliente
```

Parâmetros:

```cds
define view entity ZI_SD_ORDEM_DESDE
  with parameters p_data : abap.dats
  as select from ztsd_ordem
{
  key ordem_uuid as OrdemUUID,
      data_ordem as DataOrdem
}
where data_ordem >= $parameters.p_data
```

```abap
SELECT FROM zi_sd_ordem_desde( p_data = @lv_data )
  FIELDS OrdemUUID, DataOrdem
  INTO TABLE @DATA(lt_ordem).
```

## Access control (DCL)

Mesmo nome da view protegida.

```cds
@EndUserText.label: 'Controle de acesso - Ordem'
@MappingRole: true
define role ZI_SD_ORDEM {
  grant select on ZI_SD_ORDEM
    where ( Cliente ) = aspect pfcg_auth ( ZSD_ORDEM, KUNNR, ACTVT = '03' );
}
```

Herdar as condições da raiz na projeção:

```cds
@EndUserText.label: 'Controle de acesso - Ordem (projeção)'
@MappingRole: true
define role ZC_SD_ORDEM {
  grant select on ZC_SD_ORDEM
    where inheriting conditions from entity ZI_SD_ORDEM;
}
```

Toda view com `@AccessControl.authorizationCheck: #CHECK` precisa de um DCL próprio, inclusive as filhas (`ZI_SD_ORDEM_ITEM`, `ZC_SD_ORDEM_ITEM`). Sem ele, a ativação gera aviso e a leitura fica sem restrição. Alternativa: `#NOT_REQUIRED` com o motivo documentado.

| Padrão | Uso |
|---|---|
| `aspect pfcg_auth ( objeto, campo, ACTVT = '03' )` | Objeto de autorização |
| `inheriting conditions from entity` | Reaproveitar as regras de outra entidade |
| `CreatedBy = aspect user` | Restringir ao usuário atual |
| Sem DCL | Só com `@AccessControl.authorizationCheck: #NOT_REQUIRED` na view e motivo documentado |

## Clean core em CDS

| Cenário | Nível |
|---|---|
| `SELECT` em CDS liberada da SAP (`I_*`) | A |
| CDS própria sobre tabelas próprias | A |
| `SELECT` em CDS clássica (nomeada) da SAP | B |
| Wrapper sobre CDS ou tabela não liberada | B (se o objeto embrulhado for API clássica) ou C |
| Leitura direta de tabela SAP | C (ATC prioridade 2) |
| Escrita direta em tabela SAP | D (ATC prioridade 1) |

Use `extend view entity` e metadata extensions em vez de modificar CDS da SAP. Níveis e regras completas em [clean-core-niveis.md](../../abap-qa-auditor/references/clean-core-niveis.md).

## Fontes

- [SAP ABAP Cheat Sheets: CDS View Entities](https://github.com/SAP-samples/abap-cheat-sheets/blob/main/15_CDS_View_Entities.md)
- [ABAP CDS (ABAP Keyword Documentation)](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abencds.htm)
