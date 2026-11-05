---
name: abap-rap-dev
description: >-
  Skill de especialista para desenvolvimento de artefatos de backend ABAP RAP no SAP BTP ABAP Cloud.
  Use ao criar ou modificar CDS Views, Metadata Extensions, Behavior Definitions,
  Value Helps, Tabelas ou Classes ABAP seguindo padrao-desenvolvimento.md.
---

# Agente Desenvolvedor ABAP RAP

Esta skill orienta o desenvolvimento, ajuste e ativação de objetos do modelo ABAP RESTful Application Programming Model (RAP) seguindo estritamente as diretrizes corporativas de [padrao-desenvolvimento.md](../../../padrao-desenvolvimento.md) e [naming-conventions.json](../../../naming-conventions.json).

## Diretrizes de Nomenclatura (Padrão Corporativo)

1. **CDS Views (Core Data Services)**:
   - **View Basic**: `ZI_<MD>_<DESCRICAO>` (ex: `ZI_FS_TRAVEL`)
   - **View Composite**: `ZI_<MD>_<DESCRICAO>` (ex: `ZI_FS_TRAVEL_CUBE`)
   - **View Consumption / Projeção**: `ZC_<MD>_<DESCRICAO>` (ex: `ZC_FS_TRAVEL`)
   - **Nome da SQL View (@AbapCatalog.sqlViewName)**: `ZV<MD>_<DESCRICAO>` (ex: `ZVFS_TRAVEL`)
   - **Access Control (DCL)**: Mesmo nome da view CDS (`ZI_<MD>_<DESCRICAO>` ou `ZC_<MD>_<DESCRICAO>`)
   - **Value Help CDS**: `ZI_<MD>_VH_<DESCRICAO>` (ex: `ZI_FS_VH_AGENCIA`)

2. **Metadata Extensions (`DDLX`)**:
   - Mesmo nome da CDS à qual se refere (`ZC_<MD>_<DESCRICAO>`).
   - Oculte chaves técnicas (`UUID`, `ParentUUID`) com `@UI.hidden: true`.
   - Renumere as posições em incrementos de 10 sem lacunas (`10, 20, 30...`).
   - Configure cabeçalhos com campos de negócio significativos (`title.value: 'Description'`, `description.value: 'AgencyID'`).

3. **Publicação OData (Service Definition & Binding)**:
   - **Service Definition UI**: `ZUI_<DESCRICAO>` (ex: `ZUI_FS_TRAVEL`)
   - **Service Definition API**: `ZAPI_<MD>_<DESCRICAO>`
   - **Service Binding OData V4 UI**: `ZUI_O4_<DESCRICAO>` (ex: `ZUI_O4_FS_TRAVEL`)
   - **Service Binding OData V2 UI**: `ZUI_O2_<DESCRICAO>`
   - **Service Binding API**: `ZAPI_O4_<DESCRICAO>` / `ZAPI_O2_<DESCRICAO>`

4. **Tabelas & Dicionário**:
   - Tabela Transparente: `ZT<MD>_<DESCRICAO>` (ex: `ZTFS_TRAVEL`)
   - Tabela Draft: `ZT<MD>_<DESCRICAO>_D` (ex: `ZTFS_TRAVEL_D`)
   - Estrutura: `ZS<MD>_<DESCRICAO>` (ex: `ZSFS_TRAVEL_DATA`)
   - Elemento de Dados: `ZE_<DESCRICAO>`
   - Domínio: `ZD_<DESCRICAO>`

5. **Classes e Behavior Pool**:
   - Classe de Comportamento: `ZCL<MD>_BP_<ENTIDADE>` ou `ZBP_C_<ENTIDADE>`
   - Métodos e Variáveis: Seguir rigorosamente as convenções de prefixos (`IV/IS/IT/IO/IR_*`, `EV/ES/ET/EO/ER_*`, `CV/CS/CT/CO/CR_*`, `RV/RS/RT/RO/RR_*`, `LT_*`, `LS_*`, `LV_*`, `<FS_*`).
