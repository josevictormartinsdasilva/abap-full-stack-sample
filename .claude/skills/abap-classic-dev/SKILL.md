---
name: abap-classic-dev
description: >-
  Skill de especialista para desenvolvimento ABAP Clássico e RICEFW tradicional
  seguindo rigorosamente o documento corporativo padrao-desenvolvimento.md.
---

<!-- GERADO por scripts/sync-agents.mjs — não edite; altere a fonte em .agents/ e rode o script. -->

# Agente Desenvolvedor ABAP Clássico

Esta skill orienta o desenvolvimento e manutenção de soluções em ABAP Tradicional e RICEFW de acordo com as regras de [padrao-desenvolvimento.md](../../../standards/padrao-desenvolvimento.md) e [naming-conventions.json](../../../standards/naming-conventions.json).

## Nomenclatura Corporativa Oficial

1. **Programas & Includes (Tópico 8.1 / 8.4)**:
   - Programa: `Z<MD><TIPO>_<DESCRICAO>`
     - Tipos: `C` (Carga), `I` (Interface), `F` (Formulário), `R` (Relatório), `W` (Workflow).
     - Exemplo: `ZMMR_ESTOQUE_ANALITICO`, `ZSDI_INTEGRACAO_ORDEM`.
   - Cabeçalho padronizado obrigatório em todos os programas (`[EMPRESA]` = `cliente.empresa` de naming-conventions.json):
     ```abap
     ***********************************************************************
     ***                         © [EMPRESA]                             ***
     ***********************************************************************
     *** DESCRIÇÃO: [DESCRIÇÃO DO PROGRAMA]                                *
     *** AUTOR    : [NOME DO DESENVOLVEDOR] – [CONSULTORIA]                *
     *** FUNCIONAL: [NOME DO FUNCIONAL] – [CONSULTORIA]                    *
     *** DATA     : [DATA]                                                 *
     ***********************************************************************
     ```
   - Includes: `Z<MD><TIPO>_<DESCRICAO>_<SUFIXO>`
     - Sufixos: `TOP` (Declarações globais), `SEL` (Tela de seleção), `PBO` (Process Before Output), `PAI` (Process After Input), `F01` (Forms/Subrotinas).

2. **Modularização & Funções**:
   - Grupo de Funções: `ZFG<MD>_<DESCRICAO>` (ex: `ZFGSD_CALCULOS`)
   - Módulo de Função: `ZFM<MD>_<DESCRICAO>` (ex: `ZFMSD_CALCULA_DESCONTO`)
   - BAPIs: `ZBAPI<MD>_<DESCRICAO>` ou `Z_BAPI_<DESCRICAO>`
   - Classes Globais: `ZCL<MD>_<DESCRICAO>`
   - Interfaces Globais: `ZIF<MD>_<DESCRICAO>`
   - Classes de Exceção: `ZCX<MD>_<DESCRICAO>`
   - Classes Locais: `LCL_<NOME>`, Interfaces Locais: `LIF_<NOME>`

3. **Dicionário de Dados (SE11)**:
   - Tabela Transparente: `ZT<MD>_<DESCRICAO>` (ex: `ZTSD_PEDIDOS`)
   - Estrutura: `ZS<MD>_<DESCRICAO>` (ex: `ZSSD_ITEM_PEDIDO`, `ZSCA_CAMPOS_CONTROLE`)
   - Tipo de Tabela: `ZCTG<MD>_<DESCRICAO>` ou `ZTT<MD>_<DESCRICAO>`
   - Elemento de Dados: `ZE_<DESCRICAO>`
   - Domínio: `ZD_<DESCRICAO>`
   - Ajuda de Pesquisa (Search Help): `ZH<MD>_<DESCRICAO>`
   - Objeto de Bloqueio (Lock Object): `EZ<MD>_<DESCRICAO>`

4. **Convenção de Variáveis no Código (Tópico 12)**:
   - Globais: `TY_*` (Types), `GC_*` (Constantes), `GV_*` (Variáveis), `GT_*` (Tabelas), `GS_*` (Estruturas), `<GFS_*` (Field-Symbols), `P_*` (Parameters), `S_*` (Select-Options).
   - Locais: `LV_*` (Variáveis), `LT_*` (Tabelas), `LS_*` (Estruturas), `LC_*` (Constantes), `<FS_*` (Field-Symbols), `LO_*` (Objetos), `LR_*` (Ranges).
   - Parâmetros: `IV/IS/IT/IO/IR_*` (Importing), `EV/ES/ET/EO/ER_*` (Exporting), `CV/CS/CT/CO/CR_*` (Changing), `RV/RS/RT/RO/RR_*` (Returning).
   - ⚠️ **Parâmetro TABLES em funções é obsoleto: NUNCA UTILIZAR!**

5. **Formulários & Extensões**:
   - SmartForms: `ZSF<MD>_<DESCRICAO>`, Adobe Forms: `ZAF<MD>_<DESCRICAO>`, Smart Styles: `ZST<MD>_<DESCRICAO>`.
   - Enhancement Implementation: `ZEI<MD>_<DESCRICAO>`.
   - BAdI: `Z<MD>_<DESCRICAO>`, User Exit / CMOD: `Z<MD>_<DESCRICAO>`.
