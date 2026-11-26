---
name: abap-rap-dev
description: >-
  Skill de especialista para desenvolvimento de artefatos de backend ABAP RAP no SAP BTP ABAP Cloud.
  Use ao criar ou modificar CDS Views, Metadata Extensions, Behavior Definitions,
  Value Helps, Tabelas ou Classes ABAP seguindo padrao-desenvolvimento.md.
---

# Agente Desenvolvedor ABAP RAP

Esta skill orienta o desenvolvimento, ajuste e ativação de objetos do modelo ABAP RESTful Application Programming Model (RAP) seguindo estritamente as diretrizes corporativas de [padrao-desenvolvimento.md](../../../standards/padrao-desenvolvimento.md) e [naming-conventions.json](../../../standards/naming-conventions.json).

## Diretrizes de Nomenclatura (Padrão Corporativo)

1. **CDS Views (Core Data Services)**:
   - **View Basic**: `ZI_<MD>_<DESCRICAO>` (ex: `ZI_SD_ORDEM`)
   - **View Composite**: `ZI_<MD>_<DESCRICAO>` (ex: `ZI_SD_ORDEM_CUBE`)
   - **View Consumption / Projeção**: `ZC_<MD>_<DESCRICAO>` (ex: `ZC_SD_ORDEM`)
   - **SQL View (`@AbapCatalog.sqlViewName`)**: **não usar** em CDS View Entities (`DEFINE VIEW ENTITY`), que são o padrão em RAP / ABAP Cloud. `ZV<MD>_<DESCRICAO>` vale só para manutenção de views DDIC-based legadas (`DEFINE VIEW`).
   - **Access Control (DCL)**: Mesmo nome da view CDS (`ZI_<MD>_<DESCRICAO>` ou `ZC_<MD>_<DESCRICAO>`)
   - **Value Help CDS**: `ZI_<MD>_VH_<DESCRICAO>` (ex: `ZI_SD_VH_CLIENTE`)

2. **Metadata Extensions (`DDLX`)**:
   - Mesmo nome da CDS à qual se refere (`ZC_<MD>_<DESCRICAO>`).
   - Oculte chaves técnicas (`UUID`, `ParentUUID`) com `@UI.hidden: true`.
   - Renumere as posições em incrementos de 10 sem lacunas (`10, 20, 30...`).
   - Configure cabeçalhos com campos de negócio significativos (`title.value: 'Description'`, `description.value: 'AgencyID'`).

3. **Publicação OData (Service Definition & Binding)**:
   - **Service Definition UI**: `ZUI_<DESCRICAO>` (ex: `ZUI_SD_ORDEM`)
   - **Service Definition API**: `ZAPI_<MD>_<DESCRICAO>`
   - **Service Binding OData V4 UI**: `ZUI_O4_<DESCRICAO>` (ex: `ZUI_O4_SD_ORDEM`)
   - **Service Binding OData V2 UI**: `ZUI_O2_<DESCRICAO>`
   - **Service Binding API**: `ZAPI_O4_<DESCRICAO>` / `ZAPI_O2_<DESCRICAO>`

4. **Tabelas & Dicionário**:
   - Tabela Transparente: `ZT<MD>_<DESCRICAO>` (ex: `ZTSD_ORDEM`). **Máximo de 16 caracteres** no nome: confira antes de pôr o nome no plano.
   - Tabela Draft: `ZT<MD>_<DESCRICAO>_D` (ex: `ZTSD_ORDEM_D`)
   - Estrutura: `ZS<MD>_<DESCRICAO>` (ex: `ZSSD_ORDEM_DADOS`)
   - Elemento de Dados: `ZE_<DESCRICAO>`
   - Domínio: `ZD_<DESCRICAO>`

5. **Classes e Behavior Pool**:
   - Classe de Comportamento: `ZCL<MD>_BP_<ENTIDADE>` ou `ZBP_C_<ENTIDADE>`
   - Métodos e Variáveis: Seguir rigorosamente as convenções de prefixos (`IV/IS/IT/IO/IR_*`, `EV/ES/ET/EO/ER_*`, `CV/CS/CT/CO/CR_*`, `RV/RS/RT/RO/RR_*`, `LT_*`, `LS_*`, `LV_*`, `<FS_*`).

## Diretrizes de desenho (validadas em S/4HANA 2023, SAP_BASIS 758)

1. **Prefira CDS pura a custom entity e elementos virtuais** para regras de seleção e agregação. Regra em ABAP (query provider, elementos virtuais) deixa os campos sem filtro e sem ordenação, faz uma leitura por linha e obriga a implementar o filtro à mão. No 758, o DDLX é recusado sobre custom entity (`Cannot annotate '…'. The type of the annotated entity is not supported`), e uma projeção não aceita custom entity como base (`Only CDS view entities or CDS DDIC-based views can be basis entities`).
   - **Autorização:** a CDS própria **não herda** o DCL das CDS standard que lê. Decida explicitamente e registre no plano: DCL próprio ou `@AccessControl.authorizationCheck: #NOT_REQUIRED` com justificativa.
2. **Refatorar custom entity para view entity:**
   - troque o tipo na própria DDLS, sem apagar e recriar: o serviço não precisa ser desmontado;
   - DDLS interdependentes podem falhar juntas por dependência circular: ative em etapas;
   - entidade de detalhe fora do BO, exposta num serviço transacional, precisa de `root` na ZI e de `root … provider contract transactional_query` na ZC. Sem isso: *"Transactional Projection View must be part of a business object"* e *"ROOT keyword not valid since … is not a root property"*;
   - na projeção raiz, a associação precisa ser `redirected to`. Associação própria dá *"Key fields of entities … do not match"* (SD_CDS_ENTITY 165).
3. **Value help:** `@Consumption.valueHelpDefinition` na projeção não basta. A CDS de value help precisa estar **exposta na SRVD**, senão o filtro fica sem F4. Numa raiz com `group by` e joins, os avisos `SD_CDS_ENTITY 151` (search help não herdada) são esperados: defina a value help na projeção.
4. **Texto da coluna:** `@ObjectModel.text.element` faz o código aparecer junto do nome e duplica a coluna de texto. Quando houver coluna própria para o texto, use `@UI.textArrangement: #TEXT_SEPARATE`.
5. **Ação em massa tudo-ou-nada:** `invocationGrouping: #CHANGE_SET` no `@UI.lineItem` da ação e validação do conjunto inteiro no handler.
6. **EML `PRIVILEGED` em BO standard liberado** (ex.: `I_SalesOrderTP`) dispensa a autorização standard de alteração. É decisão de segurança: só com registro na especificação e aprovação no plano.
7. **Tabela de parâmetros lida em CDS** (ex.: valor numérico em `low`): `cast(cast(lpad(rtrim(low,' '),10,'0') as abap.numc(10)) as abap.int4)` ativa no 758, restrito por `case` à linha do parâmetro. Limites: só a semântica `I`/`EQ`; valor não numérico gera erro de SQL, não mensagem; linhas duplicadas na mesma chave multiplicam registros. Documente esses limites para quem mantém o parâmetro.
8. **Não apague nada sem where-used**, inclusive referências nas classes locais dos behavior pools.
9. **No `vsp`, `edit` ativa mesmo com `activate: false`:** cada gravação deve deixar o objeto num estado que ative.

## Referências (leia sob demanda)

Material técnico de apoio em `references/`. Leia o arquivo indicado **antes** de começar a tarefa correspondente. Nomes, prefixos e regras deste documento e de `padrao-desenvolvimento.md` prevalecem sobre os exemplos das referências.

| Tarefa | Arquivo |
|---|---|
| Escrever ou alterar BDEF, behavior pool (`ZCL<MD>_BP_*`) ou código EML | [references/rap-bdl-eml.md](references/rap-bdl-eml.md) |
| Criar ou alterar CDS view entity, projeção, metadata extension, DCL ou value help | [references/cds-view-entities.md](references/cds-view-entities.md) |
| Escolher classe liberada (UUID, data/usuário, e-mail, HTTP, JSON, log, bgPF, bloqueio, numeração) | [references/classes-liberadas.md](references/classes-liberadas.md) |
| *(Opcional)* SQL avançado (window functions, CTE, conjuntos) ou AMDP / table function | [references/abap-sql-amdp.md](references/abap-sql-amdp.md) |
| Saber se uma API ou técnica mantém o nível A | [../abap-qa-auditor/references/clean-core-niveis.md](../abap-qa-auditor/references/clean-core-niveis.md) |
