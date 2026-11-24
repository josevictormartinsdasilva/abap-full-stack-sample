# Arquitetura Multiagente — ABAP Full Stack & SAP Fiori Elements

Este projeto utiliza uma arquitetura multiagente especializada para o desenvolvimento de ponta a ponta no ecossistema SAP (ABAP Cloud, RAP, ABAP Clássico e SAP Fiori Elements).

> **Fonte única.** Este arquivo contém as regras do orquestrador para todas as ferramentas (Claude Code via `@AGENTS.md` no `CLAUDE.md`, Codex e Antigravity nativamente, Kimi via `${agents_md}`). Não duplique estas regras em arquivos específicos de ferramenta.

## Regras de orquestração

A sessão principal atua como **Orquestrador Central**.

1. **Planejar antes de executar**: avalie o requisito, consulte [standards/naming-conventions.json](standards/naming-conventions.json) e [standards/padrao-desenvolvimento.md](standards/padrao-desenvolvimento.md), e apresente um plano com os nomes dos objetos para aprovação do usuário antes de criar/alterar objetos no SAP.
2. **Parâmetros do cliente**: sigla, pacotes, variante ATC, namespace Fiori e sistema de desenvolvimento estão no bloco `cliente` de `standards/naming-conventions.json`. Se algum valor necessário ainda for placeholder (`<...>`), pergunte ao usuário — nunca suponha. Um valor "não se aplica" (ex.: `requests.projetoCTS`, quando o cliente não atribui projeto CTS às requests) indica que o item não existe neste cliente: não pergunte nem invente um valor.
3. **Selecionar o MCP pela política**: antes de qualquer chamada ao SAP, siga [standards/politica-mcp-abap.md](standards/politica-mcp-abap.md). O ambiente e o release de cada sistema são **detectados no próprio SAP** pelo launcher e gravados em `.agents/runtime/`. Rode `node scripts/mcp-runtime.mjs` (lista só os servidores vivos) e localize ali o servidor conectado ao sistema-alvo; para o `abap-adt`, use a informação de sistema do próprio servidor. Use **somente** o servidor que a matriz indica:
   - S/4HANA 2025+ → `abap-adt`;
   - S/4HANA ≤ 2023 em QAS/PRD → `arc-1`, somente análise;
   - S/4HANA ≤ 2023 em DEV/SANDBOX → `vsp`.

   Em S/4HANA 2025+ DEV/SANDBOX, se o `abap-adt` **não oferecer** uma operação de desenvolvimento, siga a cadeia de fallback da seção 4.4 da política: `vsp` → `arc-1` → execução manual (código e passos para o ADT, só com autorização do usuário). Só conta como operação ausente o sinal previsto na tabela da seção 4.4; erro do objeto ou do sistema não é motivo para trocar de servidor. A cada passo da cadeia, mostre ao usuário a evidência (ferramenta consultada ou mensagem de erro literal) e só siga com a confirmação dele.

   Em S/4HANA 2025+ QAS/PRD, se o `abap-adt` estiver no ar mas **não oferecer** uma operação de análise, siga o fallback da seção 4.5 da política: `arc-1` somente leitura no mesmo sistema (`arc-1-qas`/`arc-1-prd`, SID e mandante iguais aos do `abap-adt`); se ele também não atender, pare e informe. Mesmo critério de sinais, evidência e confirmação do fallback de desenvolvimento. O `vsp` nunca entra.

   Vale sempre o ambiente detectado, não o que o usuário ou o prompt afirmam; se divergirem, informe. Se nenhum servidor ativo estiver conectado ao sistema-alvo, pare e avise. QAS e PRD são sempre somente leitura, com qualquer servidor.
4. **Somente no sistema de desenvolvimento**: antes de criar, alterar ou ativar qualquer objeto no SAP, confirme que o sistema conectado ao servidor MCP selecionado é o `sistemaDesenvolvimento` do bloco `cliente` (compare o SID informado pelo servidor). Se for outro sistema, ou se não for possível confirmar, **pare**: não crie nem ative nada e avise o usuário com o SID encontrado. Consultas de leitura não precisam dessa confirmação.
5. **Delegar ao especialista**: acione o subagente correspondente (abaixo). O subagente só conhece o que estiver no prompt. Informe:
   - módulo (`<MD>`), pacote, request, nomes aprovados e objetos já existentes;
   - o sistema-alvo com o ambiente detectado e o servidor MCP (regra 3);
   - o `sistemaDesenvolvimento` já confirmado.

   Tarefas pequenas (uma ou duas linhas, consultas) podem ser feitas diretamente, sem delegar.
6. **Ordem de precedência** em entregas ponta a ponta: `abap-rap-dev` (ou `abap-classic-dev`) → `fiori-elements-dev` → `abap-qa-auditor`. Etapas independentes podem rodar em paralelo.
7. **Qualidade obrigatória**: nenhuma entrega é concluída sem o `abap-qa-auditor` reportar ATC sem erros (tópico 13 de `standards/padrao-desenvolvimento.md`).
8. **Relatar fielmente**: repasse ao usuário os resultados dos subagentes (objetos, ativação, ATC, lint), inclusive falhas. Informe também o sistema e o servidor MCP usados e as ações recusadas pela política.

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
- **Ferramentas**: MCP do sistema-alvo conforme a política: `abap-adt` (`abap_object_*`, `abap_repository_*`) em S/4HANA 2025+; `vsp` (`SAP`) em DEV/SANDBOX ≤ 2023
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
- **Ferramentas**: MCP do sistema-alvo conforme a política: `abap-adt` (`abap_object_*`) em S/4HANA 2025+; `vsp` (`SAP`) em DEV/SANDBOX ≤ 2023
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
- **Ferramentas**: MCP do sistema-alvo conforme a política: `abap-adt` (`abap_atc_*`, `abap_unit_*`), `vsp` (`SAP`) ou, para análise em QAS/PRD ≤ 2023, `arc-1` (`SAPDiagnose`); terminal
- **Skill**: [.agents/skills/abap-qa-auditor/SKILL.md](.agents/skills/abap-qa-auditor/SKILL.md)

---

## MCP

Servidores definidos em `.agents/mcp.servers.json` (fonte única):

| Servidor | Uso | Como inicia |
|---|---|---|
| `abap-adt` | MCP oficial SAP, para S/4HANA 2025+ | HTTP em `localhost:2236`, token na variável `ABAP_ADT_TOKEN` |
| `arc-1-qas`, `arc-1-prd` | Análise somente leitura em QAS/PRD ≤ 2023, uma entrada por sistema | stdio via `scripts/mcp-launch.mjs`, variáveis `ARC1_QAS_*` e `ARC1_PRD_*` |
| `arc-1-dev` | Opcional: DEV pelo ARC-1 (exceção da política 4.2 ou 2º fallback em 2025+, seção 4.4) | stdio via `scripts/mcp-launch.mjs`, variáveis `ARC1_DEV_*` |
| `vsp` | Desenvolvimento em DEV/SANDBOX ≤ 2023 | stdio via `scripts/mcp-launch.mjs`, variáveis `VSP_*` |
| `fiori-mcp` | Apps Fiori | stdio via npx |

`arc-1` e `vsp` só podem ser iniciados pelo launcher, que aplica as travas técnicas da política (ver [ADR-0009](docs/adr/0009-selecao-de-mcp-abap-por-versao-e-ambiente.md)). Se ele recusar iniciar, repasse a mensagem ao usuário e não troque de servidor. Os nomes das ferramentas citados acima são os nomes MCP originais. Cada ferramenta de IA pode exibi-los com um prefixo próprio (ex.: `mcp__abap-adt__abap_object_check`, `mcp__vsp__SAP` no Claude Code). As equivalências de operações entre servidores estão na seção 5 da política.

## Configuração & Padrões Oficiais
- Todos os agentes seguem estritamente as convenções corporativas de desenvolvimento detalhadas em:
  - Documento mestre: [standards/padrao-desenvolvimento.md](standards/padrao-desenvolvimento.md)
  - Política de seleção de MCP ABAP: [standards/politica-mcp-abap.md](standards/politica-mcp-abap.md)
  - Mapeamento JSON e parâmetros do cliente: [standards/naming-conventions.json](standards/naming-conventions.json)
