# ABAP SQL moderno e AMDP (referência opcional)

> **Origem.** Adaptado de `skills/abap-sql-amdp/SKILL.md` do repositório [likweitan/abap-skills](https://github.com/likweitan/abap-skills) (commit `b3306be`, licença MIT). Exemplos corrigidos e convertidos para a nomenclatura e os prefixos do projeto. Ver [THIRD_PARTY_NOTICES.md](../../../../THIRD_PARTY_NOTICES.md).
>
> **Opcional.** Consulte só quando a tarefa envolver SQL não trivial (window functions, CTE, operações de conjunto) ou AMDP. Para SELECT comum, as regras de performance do tópico 13 de [padrao-desenvolvimento.md](../../../../standards/padrao-desenvolvimento.md) bastam.
>
> **Literais nos exemplos** (textos, IDs de objeto, URLs) são ilustrativos. No código real, use constantes ou textos (tópico 17.4 do padrão).

## Princípios

- Prefira ABAP SQL. Use AMDP só quando houver ganho claro (SQLScript, table function, processamento massivo).
- Leia de CDS liberadas (`I_*`) ou das suas views, não de tabelas SAP (nível C na leitura, D na escrita).
- Liste os campos (sem `SELECT *`), use host variables com `@` e declarações inline.

## Consultas

```abap
" Linha única
SELECT SINGLE FROM zi_sd_ordem
  FIELDS OrdemId, Descricao, ValorLiquido, Moeda
  WHERE OrdemId = @lv_ordem_id
  INTO @DATA(ls_ordem).

" Expressões na lista de campos
SELECT FROM zi_sd_ordem_item
  FIELDS OrdemUUID,
         Quantidade * 2                                         AS QuantidadeDobro,
         CASE WHEN Quantidade > 100 THEN 'ALTO' ELSE 'NORMAL' END AS Faixa,
         CAST( ValorTotal AS DECFLOAT34 )                       AS ValorDec
  INTO TABLE @DATA(lt_item).

" Agregação
SELECT FROM zi_sd_ordem
  FIELDS Cliente, COUNT(*) AS QtdOrdens, SUM( ValorLiquido ) AS Total
  GROUP BY Cliente
  HAVING COUNT(*) > 10
  INTO TABLE @DATA(lt_resumo).
```

### Window functions

```abap
SELECT FROM zi_sd_ordem
  FIELDS Cliente, OrdemId, CreatedAt, ValorLiquido,
         SUM( ValorLiquido ) OVER( PARTITION BY Cliente ORDER BY CreatedAt
                                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW ) AS Acumulado,
         ROW_NUMBER( )       OVER( PARTITION BY Cliente ORDER BY CreatedAt DESCENDING ) AS Sequencia,
         RANK( )             OVER( PARTITION BY Cliente ORDER BY ValorLiquido DESCENDING ) AS Ranking,
         LAG( ValorLiquido ) OVER( PARTITION BY Cliente ORDER BY CreatedAt )          AS ValorAnterior
  INTO TABLE @DATA(lt_janela).
```

### CTE (common table expressions)

```abap
WITH
  +ordens AS ( SELECT FROM zi_sd_ordem
                 FIELDS OrdemUUID, Cliente
                 WHERE Cliente IN @lr_cliente ),
  +itens  AS ( SELECT FROM zi_sd_ordem_item
                 FIELDS OrdemUUID, COUNT(*) AS QtdItens
                 GROUP BY OrdemUUID )
  SELECT FROM +ordens AS o
    INNER JOIN +itens AS i ON o~OrdemUUID = i~OrdemUUID
    FIELDS o~Cliente, i~QtdItens
    ORDER BY i~QtdItens DESCENDING
    INTO TABLE @DATA(lt_resultado).
```

### Operações de conjunto e subconsultas

```abap
SELECT FROM ztsd_ordem FIELDS cliente
UNION
SELECT FROM ztsd_ordem_hist FIELDS cliente
INTO TABLE @DATA(lt_clientes).

SELECT FROM zi_sd_ordem AS o
  FIELDS o~OrdemId
  WHERE EXISTS ( SELECT FROM zi_sd_ordem_item AS i
                   FIELDS i~ItemUUID
                   WHERE i~OrdemUUID = o~OrdemUUID AND i~Quantidade > 100 )
  INTO TABLE @DATA(lt_ordens_grandes).
```

### `PRIVILEGED ACCESS`

Ignora o DCL da CDS. Só use em processamento técnico (jobs, integrações) com justificativa documentada, nunca para contornar autorização de usuário.

```abap
SELECT FROM zi_sd_ordem
  FIELDS OrdemId
  INTO TABLE @DATA(lt_todas)
  PRIVILEGED ACCESS.
```

## AMDP

Nomes conforme `hanaAMDP` de naming-conventions.json: table function `ZTB_<MD>_*`, classe `ZCL_<MD>_*`, método `AMDP_<ACAO>`.

```abap
CLASS zcl_sd_amdp_ordem DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_amdp_marker_hdb.

    TYPES: BEGIN OF ty_resumo,
             cliente    TYPE c LENGTH 10,
             qtd_ordens TYPE i,
           END OF ty_resumo,
           tt_resumo TYPE STANDARD TABLE OF ty_resumo WITH EMPTY KEY.

    METHODS amdp_calcula_resumo
      AMDP OPTIONS READ-ONLY CDS SESSION CLIENT DEPENDENT
      EXPORTING VALUE(et_resumo) TYPE tt_resumo.

    CLASS-METHODS amdp_obtem_ordens_cliente FOR TABLE FUNCTION ztb_sd_ordem_cliente.
ENDCLASS.

CLASS zcl_sd_amdp_ordem IMPLEMENTATION.

  METHOD amdp_calcula_resumo BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT
                         OPTIONS READ-ONLY USING zi_sd_ordem.
    et_resumo = SELECT Cliente AS cliente, COUNT(*) AS qtd_ordens
                  FROM zi_sd_ordem
                  GROUP BY Cliente;
  ENDMETHOD.

  METHOD amdp_obtem_ordens_cliente BY DATABASE FUNCTION FOR HDB LANGUAGE SQLSCRIPT
                              OPTIONS READ-ONLY USING ztsd_ordem.
    RETURN SELECT mandt       AS client,
                  cliente     AS cliente,
                  COUNT(*)    AS qtd_ordens
             FROM ztsd_ordem
             WHERE mandt = SESSION_CONTEXT( 'CLIENT' )
             GROUP BY mandt, cliente;
  ENDMETHOD.

ENDCLASS.
```

CDS table function correspondente. Sendo client-dependent, o **primeiro** elemento do `returns` é o campo de mandante:

```cds
@EndUserText.label: 'Ordens por cliente'
@ClientHandling.type: #CLIENT_DEPENDENT
define table function ZTB_SD_ORDEM_CLIENTE
  returns {
    key client     : abap.clnt;
    key cliente    : abap.char(10);
        qtd_ordens : abap.int4;
  }
  implemented by method zcl_sd_amdp_ordem=>amdp_obtem_ordens_cliente;
```

## Clean core

| Cenário | Nível |
|---|---|
| SELECT em CDS liberada (`I_*`) ou em objetos próprios | A |
| SELECT em CDS clássica da SAP | B |
| Leitura direta de tabela SAP | C |
| Escrita direta em tabela SAP | D |
| `EXEC SQL`, hints de banco | D (instruções críticas) |
| AMDP sobre entidades liberadas/próprias | A |
| AMDP sobre tabelas SAP | C (leitura) / D (escrita) |

## Fontes

- [SAP ABAP Cheat Sheets: ABAP SQL](https://github.com/SAP-samples/abap-cheat-sheets/blob/main/03_ABAP_SQL.md) e [AMDP](https://github.com/SAP-samples/abap-cheat-sheets/blob/main/12_AMDP.md)
- [ABAP SQL (ABAP Keyword Documentation)](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenabap_sql.htm)
