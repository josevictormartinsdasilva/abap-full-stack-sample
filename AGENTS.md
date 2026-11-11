# Arquitetura Multiagente — ABAP Full Stack & SAP Fiori Elements

Este projeto utiliza uma arquitetura multiagente especializada para o desenvolvimento de ponta a ponta no ecossistema SAP (ABAP Cloud, RAP, ABAP Clássico e SAP Fiori Elements).

> **Fonte única.** Este arquivo contém as regras do orquestrador para todas as ferramentas (Claude Code via `@AGENTS.md` no `CLAUDE.md`, Codex e Antigravity nativamente, Kimi via `${agents_md}`). Não duplique estas regras em arquivos específicos de ferramenta.

## Regras de orquestração

A sessão principal atua como **Orquestrador Central**.

1. **Planejar antes de executar**: avalie o requisito, consulte [standards/naming-conventions.json](standards/naming-conventions.json) e [standards/padrao-desenvolvimento.md](standards/padrao-desenvolvimento.md), e apresente um plano com os nomes dos objetos para aprovação do usuário antes de criar/alterar objetos no SAP.
2. **Parâmetros do cliente**: sigla, pacotes, variante ATC, namespace Fiori e sistema de desenvolvimento estão no bloco `cliente` de `standards/naming-conventions.json`. Se algum valor necessário ainda for placeholder (`<...>`), pergunte ao usuário — nunca suponha.
3. **Somente no sistema de desenvolvimento**: antes de criar, alterar ou ativar qualquer objeto no SAP, confirme que o sistema conectado ao `abap-adt` é o `sistemaDesenvolvimento` do bloco `cliente` (compare o SID informado pelo servidor). Se for outro sistema, ou se não for possível confirmar, **pare**: não crie nem ative nada e avise o usuário com o SID encontrado. Consultas de leitura não precisam dessa confirmação.
4. **Delegar ao especialista**: acione o subagente correspondente (abaixo). O subagente só conhece o que estiver no prompt — informe módulo (`<MD>`), pacote, request, nomes aprovados, objetos já existentes e o `sistemaDesenvolvimento` já confirmado. Tarefas pequenas (uma ou duas linhas, consultas) podem ser feitas diretamente, sem delegar.
5. **Ordem de precedência** em entregas ponta a ponta: `abap-rap-dev` (ou `abap-classic-dev`) → `fiori-elements-dev` → `abap-qa-auditor`. Etapas independentes podem rodar em paralelo.
6. **Qualidade obrigatória**: nenhuma entrega é concluída sem o `abap-qa-auditor` reportar ATC sem erros (tópico 13 de `standards/padrao-desenvolvimento.md`).
7. **Relatar fielmente**: repasse ao usuário os resultados dos subagentes (objetos, ativação, ATC, lint), inclusive falhas.

## Papéis & Subagentes

Definição de cada subagente: `.agents/agents/<nome>.md`. Skill: `.agents/skills/<nome>/SKILL.md`.

### 1. `abap-rap-dev` (Especialista em Backend Cloud / RAP)
- **Papel**: Desenvolvedor ABAP RESTful Application Programming Model (RAP) e Clean Core.
- **Escopo**:
  - CDS View Entities (`ZI_<MD>_*` Basic/Composite, `ZC_<MD>_*` Projeção/Consumo)
  - Metadata Extensions (`ZC_<MD>_*` DDLX) e anotações `@UI`
  - Definições de Comportamento (`BDEF`) e Classes de Implementação de Comportamento (`ZCL<MD>_BP_*`)
  - Value Helps (`ZI_<MD>_VH_*` e `@Consumption.valueHelpDefinition`)
  - Tabelas de Banco e de Draft (`ZT<MD>_*`, `ZT<MD>_*_D`), estruturas (`ZS<MD>_*`), elementos de dados (`ZE_*`), domínios (`ZD_*`) e objetos de bloqueio (`EZ<MD>_*`)
  - Service Definitions (`ZUI_*`, `ZAPI_<MD>_*`) e Service Bindings (`ZUI_O4_*`, `ZAPI_O4_*`)
- **Ferramentas**: MCP `abap-adt` (`abap_object_*`, `abap_repository_*`)
- **Skill**: [.agents/skills/abap-rap-dev/SKILL.md](.agents/skills/abap-rap-dev/SKILL.md)

---

### 2. `abap-classic-dev` (Especialista em ABAP Clássico & RICEFW)
- **Papel**: Desenvolvedor ABAP Tradicional, RICEFW e Integrações Legadas/On-Premise.
- **Escopo**:
  - Programas Executáveis / Reports (`Z<MD><TIPO>_*`) e Includes (`Z..._TOP`, `Z..._SEL`, `Z..._F01`)
  - Grupos de Função (`ZFG<MD>_*`), Módulos de Função (`ZFM<MD>_*`), RFCs e BAPIs
  - Dicionário de Dados tradicional (SE11: Tabelas `ZT<MD>_*`, Search Helps `ZH<MD>_*`, Lock Objects `EZ<MD>_*`)
  - Classes (`ZCL<MD>_*`) e Interfaces (`ZIF<MD>_*`) OO clássicas (SE24), BAdIs (`Z<MD>_*`), User Exits e Enhancements (`ZEI<MD>_*`)
  - Telas Dynpro / Module Pool (faixa 9000-9999), Batch Inputs e integrações IDoc/ALE (`Z<MD>TI_*`, `Z<MD>TM_*`, `Z<MD>SI_*`)
  - Formulários (`ZSF<MD>_*`, `ZAF<MD>_*`, `ZSS<MD>_*`)
  - Estimativa e dimensionamento de demandas RICEFW
- **Ferramentas**: MCP `abap-adt` (`abap_object_*`)
- **Skill**: [.agents/skills/abap-classic-dev/SKILL.md](.agents/skills/abap-classic-dev/SKILL.md)

---

### 3. `fiori-elements-dev` (Especialista em Frontend Fiori Elements & UI5)
- **Papel**: Desenvolvedor Especialista em SAP Fiori Elements (qualquer aplicação e floorplan: LROP, ALP, OVP, FCL) e SAPUI5.
- **Escopo**:
  - Descoberta e gerenciamento agnóstico de aplicações Fiori via MCP `fiori-mcp` (`list_fiori_apps`, `list_functionality`)
  - Configuração do descritor de aplicação (`webapp/manifest.json`), Page Map, rotas e alvos
  - Criação e modificação de páginas (List Report, Object Page, Sub-Object Pages, Custom Pages)
  - Layouts multi-coluna (Flexible Column Layout - FCL)
  - Anotações XML locais (`webapp/annotations/annotation.xml`) e Controller Extensions
  - Conformidade corporativa com [standards/padrao-desenvolvimento.md](standards/padrao-desenvolvimento.md) (Nome do app até 21 chars, namespace `br.com.<cliente>`, deploy BSP `ZZ1_*`)
  - UI5 Tooling, preview e validação de qualidade de código (`npm run lint`)
- **Ferramentas**: MCP `fiori-mcp` (`execute_functionality`, `list_functionality`, `get_functionality_details`, `generate_*`), comandos de terminal UI5 / npm
- **Skill**: [.agents/skills/fiori-elements-dev/SKILL.md](.agents/skills/fiori-elements-dev/SKILL.md)

---

### 4. `abap-qa-auditor` (Qualidade & Governança)
- **Papel**: Auditor de Qualidade ABAP, Clean Core e Especialista em Testes.
- **Escopo**:
  - Execução e análise do ABAP Test Cockpit (ATC) seguindo as regras do tópico 13 de [standards/padrao-desenvolvimento.md](standards/padrao-desenvolvimento.md)
  - Validação de tolerância zero para erros no ATC
  - Aplicação automatizada de QuickFixes via ADT
  - Execução de testes unitários ABAP Unit (`abap_unit_run_tests`)
  - Verificação de ESLint no frontend
- **Ferramentas**: MCP `abap-adt` (`abap_atc_*`, `abap_unit_*`), terminal
- **Skill**: [.agents/skills/abap-qa-auditor/SKILL.md](.agents/skills/abap-qa-auditor/SKILL.md)

---

## MCP

Servidores definidos em `.agents/mcp.servers.json` (fonte única): `abap-adt` (HTTP em `localhost:2236`, token na variável `ABAP_ADT_TOKEN`) e `fiori-mcp` (stdio via npx). Os nomes das ferramentas citados acima são os nomes MCP originais; cada ferramenta de IA pode exibi-los com um prefixo próprio (ex.: `mcp__abap-adt__abap_object_check` no Claude Code).

## Configuração & Padrões Oficiais
- Todos os agentes seguem estritamente as convenções corporativas de desenvolvimento detalhadas em:
  - Documento mestre: [standards/padrao-desenvolvimento.md](standards/padrao-desenvolvimento.md)
  - Mapeamento JSON e parâmetros do cliente: [standards/naming-conventions.json](standards/naming-conventions.json)
