# Arquitetura Multiagente — SAP Full Stack (ABAP & Fiori)

Bem-vindo ao ambiente de desenvolvimento integrado para o ecossistema SAP. Este projeto adota uma arquitetura multiagente especializada que cobre o ciclo de vida completo de desenvolvimento: desde a modelagem de dados no backend (**ABAP Cloud / RAP** e **ABAP Clássico / RICEFW**) até a interface de usuário (**SAP Fiori Elements / SAPUI5**) e a auditoria de conformidade (**ABAP Test Cockpit / ATC**).

Todos os agentes seguem rigorosamente os padrões corporativos de desenvolvimento documentados em [padrao-desenvolvimento.md](standards/padrao-desenvolvimento.md) e mapeados em [naming-conventions.json](standards/naming-conventions.json).

---

## 🧭 Visão Geral dos Agentes

```mermaid
flowchart TD
    User([Desenvolvedor / Usuário]) --> Lead[Orquestrador Central]

    subgraph Backend_Layer["Camada Backend & Dados"]
        Lead -->|ABAP Cloud / RAP / Clean Core| RAP["abap-rap-dev"]
        Lead -->|ABAP Clássico / RICEFW / Legado| Classic["abap-classic-dev"]
    end

    subgraph Frontend_Layer["Camada Frontend & Experiência"]
        Lead -->|Fiori Elements / UI5 / Page Map| Fiori["fiori-elements-dev"]
    end

    subgraph Quality_Layer["Governança & Qualidade"]
        Lead -->|ATC / QuickFixes / Testes Unitários| QA["abap-qa-auditor"]
    end

    RAP --- ADT_MCP[(abap-adt MCP)]
    Classic --- ADT_MCP
    Fiori --- FIORI_MCP[(fiori-mcp MCP)]
    QA --- ADT_MCP
```

---

## 📋 Papéis e Especialidades

| Agente | Especialidade | Escopo de Atuação | Ferramentas MCP | Skill |
|---|---|---|---|---|
| **`abap-rap-dev`** | Backend Cloud & RAP | CDS View Entities (`ZI_*`, `ZC_*`), Metadata Extensions (`DDLX`), Behavior Definitions (`BDEF`), Classes de Comportamento (`ZCL<MD>_BP_*`), Value Helps e tabelas de banco/draft. | `abap-adt` | [SKILL.md](.agents/skills/abap-rap-dev/SKILL.md) |
| **`abap-classic-dev`** | ABAP Clássico & RICEFW | Reports (`PROG`), Includes (`_TOP`, `_SEL`, `_F01`), Function Groups/Modules (`FUGR/F`, `FUGR/FF`), BAPIs, Telas Dynpro (9000-9999), SE11 e estimativas de esforço. | `abap-adt` | [SKILL.md](.agents/skills/abap-classic-dev/SKILL.md) |
| **`fiori-elements-dev`** | Frontend Fiori & UI5 | Gerenciamento agnóstico de apps Fiori (LROP, ALP, OVP, FCL), Page Map no `manifest.json`, rotas, alvos, anotações XML locais e scripts UI5. | `fiori-mcp`, Terminal UI5/npm | [SKILL.md](.agents/skills/fiori-elements-dev/SKILL.md) |
| **`abap-qa-auditor`** | Qualidade & Governança | Execução de inspeções ATC, aplicação de QuickFixes automatizados, testes ABAP Unit e validação estática de código frontend (`eslint`). | `abap-adt`, Terminal | [SKILL.md](.agents/skills/abap-qa-auditor/SKILL.md) |

---

## 🎯 Quando Utilizar Cada Agente (Matriz de Decisão)

Utilize este guia rápido para saber qual agente acionar de acordo com o seu objetivo:

### 1. Criar ou Evoluir Serviços Modernos (Fiori / BTP / Clean Core)
* **Agente**: **`abap-rap-dev`**
* **Quando usar**:
  - Modelar novas entidades CDS (básicas, de composição ou de projeção).
  - Criar ou ajustar anotações de interface em Metadata Extensions (`@UI.lineItem`, `@UI.identification`, `@UI.facet`, `@UI.headerInfo`).
  - Configurar Value Helps padronizados (`@Consumption.valueHelpDefinition`) com validação semântica.
  - Implementar lógica transacional (validações, determinações, ações) em Behavior Pools.
  - Publicar serviços OData V4 (`SRVD` / `SRVB`).

### 2. Manutenção, Legado e Rotinas Batch
* **Agente**: **`abap-classic-dev`**
* **Quando usar**:
  - Desenvolver ou dar manutenção em relatórios executáveis (`Z..._REP`) e telas Dynpro clássicas.
  - Criar módulos de função RFC ou BAPIs customizadas para integração.
  - Manutenção em User Exits, BAdIs clássicas ou pontos de ampliação (Enhancements).
  - Configurar objetos tradicionais no dicionário SE11 (Search Helps `ZH*`, Lock Objects `EZ*`).
  - Estimar complexidade e horas de desenvolvimento para demandas RICEFW.

### 3. Ajustes de Telas, Navegação e Páginas Fiori
* **Agente**: **`fiori-elements-dev`**
* **Quando usar**:
  - Adicionar, alterar ou remover páginas no Page Map (List Report, Object Pages, Sub-Object Pages).
  - Configurar comportamento de tabelas (responsiva, grid, modo de criação `NewPage` vs `CreationDialog`).
  - Ajustar Flexible Column Layout (FCL) para visualização em múltiplas colunas.
  - Implementar Controller Extensions para comportamentos customizados na interface.
  - Executar validações de integridade e linter (`npm run lint`) no frontend.

### 4. Inspeção de Código e Homologação Técnica
* **Agente**: **`abap-qa-auditor`**
* **Quando usar**:
  - Antes de liberar uma Task/Request de desenvolvimento.
  - Executar a bateria de verificações do ABAP Test Cockpit (ATC) seguindo a variante corporativa.
  - Aplicar correções automáticas (QuickFixes) sugeridas pelo ADT.
  - Executar testes unitários automatizados (ABAP Unit).
  - Auditar aderência ao padrão de tolerância zero para erros do ATC.

---

## 💬 Como Utilizar no Dia a Dia (Exemplos de Prompts)

Você não precisa decorar comandos técnicos. Basta direcionar o pedido no chat de forma natural:

### Exemplos para `abap-rap-dev`:
```text
"Peça ao abap-rap-dev para adicionar um Value Help de clientes na entidade ZC_SD_ORDEM usando a view padrão I_Customer_VH."
```
```text
"Peça ao abap-rap-dev para ocultar os campos técnicos de UUID da metadata extension ZC_SD_ORDEM_ITEM e reordenar as posições de 10 em 10."
```

### Exemplos para `fiori-elements-dev`:
```text
"Peça ao fiori-elements-dev para adicionar uma segunda Object Page para os itens de reserva no aplicativo Fiori."
```
```text
"Peça ao fiori-elements-dev para configurar a tabela do List Report como ResponsiveTable e rodar o linter."
```

### Exemplos para `abap-classic-dev`:
```text
"Peça ao abap-classic-dev para criar a estrutura do programa ZSD_RELATORIO_VENDAS com includes _TOP, _SEL e _F01 seguindo o cabeçalho oficial."
```
```text
"Peça ao abap-classic-dev para estimar uma demanda de Relatório ALV com complexidade média."
```

### Exemplos para `abap-qa-auditor`:
```text
"Peça ao abap-qa-auditor para rodar a inspeção ATC no pacote <PACOTE> e relatar os apontamentos encontrados."
```
```text
"Peça ao abap-qa-auditor para verificar se o frontend e o backend possuem alguma pendência antes do transporte."
```

---

## 🔄 Fluxo de Trabalho Integrado (Ponta a Ponta)

Quando uma nova funcionalidade completa precisa ser entregue, o **Orquestrador Central** coordena os subagentes na ordem ideal de precedência:

```
[1. Planejamento] ──> [2. Backend RAP] ──> [3. Frontend Fiori] ──> [4. Auditoria QA] ──> [5. Entrega]
    Orquestrador         abap-rap-dev         fiori-elements-dev      abap-qa-auditor       Pronto
  (Plano aprovado)     (CDS/DDLX ativos)     (Page Map / Rotas)       (ATC 100% limpo)
```

1. **Orquestrador**: Avalia o requisito, consulta [naming-conventions.json](standards/naming-conventions.json) e submete um plano de ação para sua confirmação.
2. **`abap-rap-dev`**: Implementa os objetos no backend, valida sintaxe (`abap_object_check`) e ativa no sistema SAP BTP.
3. **`fiori-elements-dev`**: Atualiza o descritor `manifest.json`, sincroniza navegações e valida o linter.
4. **`abap-qa-auditor`**: Dispara o ATC no backend, executa testes unitários e confirma que não existem desvios nem erros residuais.

---

## 📚 Documentos de Referência

- **[standards/padrao-desenvolvimento.md](standards/padrao-desenvolvimento.md)**: Manual normativo corporativo de desenvolvimento SAP (Módulos, Pacotes, Requests, Dicionário SE11, ABAP OO, CDS, Fiori e Regras de ATC).
- **[standards/naming-conventions.json](standards/naming-conventions.json)**: Mapeamento técnico estruturado com todos os prefixos e padrões de nomenclatura, mais o bloco `cliente` com os parâmetros do projeto.
- **[AGENTS.md](AGENTS.md)**: Regras do orquestrador e papéis dos subagentes — fonte única para todas as ferramentas.
- **[CLAUDE.md](CLAUDE.md)**: Importa o `AGENTS.md` e adiciona só o que é específico do Claude Code.

---

## 🚀 Adotando o template num projeto

1. Preencha o bloco `cliente` de [standards/naming-conventions.json](standards/naming-conventions.json): empresa, sigla, pacote e variante ATC, namespace Fiori, pasta dos apps e sistema de desenvolvimento. Enquanto houver placeholders `<...>`, os agentes perguntam em vez de supor.
2. Preencha os placeholders restantes de [standards/padrao-desenvolvimento.md](standards/padrao-desenvolvimento.md) (`<VARIANTE_ATC>`, `<PROJETO_CTS>`, `<ID_PROJETO_CTS>`, `<DESCRICAO_PROJETO_CTS>` e `[EMPRESA]`) ou substitua o documento pelo padrão do cliente.
3. Configure o token MCP (seção abaixo) e confirme a conexão com `/mcp`.
4. **Libere os agentes apenas no sistema de desenvolvimento.** Eles criam e ativam objetos diretamente via `abap-adt`; use um usuário com autorizações restritas a DEV/sandbox.

---

## 🤖 Suporte a Ferramentas

| Item | Antigravity | Claude Code | Kimi Code (3.x) | Codex |
|---|---|---|---|---|
| Instruções do orquestrador | `AGENTS.md` | `CLAUDE.md` (importa `AGENTS.md`) | `.kimi-code/agents/orquestrador.md` (injeta `AGENTS.md`) | `AGENTS.md` (nativo) |
| Subagentes | Declarados no `AGENTS.md` | `.claude/agents/*.md` *(gerado)* | `.kimi-code/agents/*.md` *(gerado)* | `.codex/agents/*.toml` *(gerado)* |
| Skills | `.agents/skills/` | `.claude/skills/` *(gerado)* | `.agents/skills/` (nativo) | `.agents/skills/` (nativo) |
| Servidores MCP | `.agents/mcp_config.json` *(gerado)* | `.mcp.json` *(gerado)* | `.kimi-code/mcp.json` *(gerado)* | `.codex/config.toml` *(gerado)* |

No Claude Code, use `/agents` para ver os subagentes e `/mcp` para conferir a conexão dos servidores.

No Kimi Code, inicie com `kimi --agent orquestrador`. **A flag é necessária**: sem ela a sessão usa o agente padrão e não aplica as regras de orquestração. Defina antes `ABAP_ADT_TOKEN` no ambiente. O Kimi pede confiança no workspace na primeira vez, pois o `mcp.json` do projeto executa comandos.

No Codex, abra o projeto na raiz e marque-o como confiável (o `.codex/config.toml` só é lido em projetos trusted). Defina `ABAP_ADT_TOKEN` no ambiente. As regras de orquestração vêm do `AGENTS.md`. Os subagentes só são acionados quando você pedir explicitamente ("use o subagente abap-rap-dev...").

---

## 🔑 Configuração do Token MCP (`abap-adt`)

O token do servidor `abap-adt` **não é versionado**. Cada desenvolvedor configura o seu:

1. Copie `.env.example` para `.env` e preencha `ABAP_ADT_TOKEN` (o `.env` está no `.gitignore`).
2. **Claude Code, Codex e Kimi** leem `ABAP_ADT_TOKEN` das variáveis de ambiente do sistema — eles **não carregam o `.env` sozinhos**. Defina a variável antes de abrir a ferramenta:
   - **Windows (PowerShell, permanente)**: `[Environment]::SetEnvironmentVariable('ABAP_ADT_TOKEN','<SEU_TOKEN>','User')` e reinicie o terminal.
   - **Windows (sessão atual)**: `$env:ABAP_ADT_TOKEN = '<SEU_TOKEN>'`.
   - **macOS / Linux (zsh, permanente)**: `echo "export ABAP_ADT_TOKEN='<SEU_TOKEN>'" >> ~/.zshrc` e abra um terminal novo (no bash, use `~/.bashrc`).
   - **macOS / Linux (sessão atual)**: `export ABAP_ADT_TOKEN='<SEU_TOKEN>'`.
   - No macOS, inicie a ferramenta **pelo terminal**. Apps abertos pelo ícone não enxergam o `~/.zshrc`.
3. **Antigravity**: substitua `<SEU_TOKEN>` em `.agents/mcp_config.json` apenas na sua cópia local, **sem fazer commit** desse valor.
4. Confirme a conexão com `/mcp`.

> O servidor `abap-adt` (HTTP em `localhost:2236`) precisa estar rodando na sua máquina. Nunca grave o token real em arquivos versionados.

### ⚠️ Usando no macOS / Linux

Os arquivos versionados usam o wrapper `cmd /c` para o `fiori-mcp`, que só existe no Windows. Na sua cópia local, gere a variante Unix (requer Node.js):

```bash
node scripts/sync-agents.mjs --platform=unix
```

Não faça commit desse resultado: a CI espera a variante Windows.

---

## 📁 Estrutura: fonte única + adaptadores gerados

O conteúdo (padrões, regras, skills, subagentes, MCP) é escrito **uma vez**. O script `scripts/sync-agents.mjs` gera o "envelope" que cada ferramenta de IA espera.

```
AGENTS.md                       ← regras do orquestrador (fonte)
CLAUDE.md                       ← @AGENTS.md + específico do Claude (fonte)
standards/
  padrao-desenvolvimento.md     ← padrão corporativo (fonte)
  naming-conventions.json       ← prefixos + bloco "cliente" (fonte)
.agents/
  agents/<nome>.md              ← subagentes (fonte)
  skills/<nome>/SKILL.md        ← skills (fonte)
  mcp.servers.json              ← servidores MCP (fonte)
  mcp_config.json               ← gerado (Antigravity)
scripts/sync-agents.mjs         ← gerador
.claude/  .codex/  .kimi-code/  .mcp.json   ← gerados
```

Os arquivos gerados são versionados (quem clona usa direto) e trazem o aviso `GERADO por scripts/sync-agents.mjs`. Em `.claude/settings.json` o script só gerencia `enabledMcpjsonServers` e `env.MCP_TIMEOUT`; as demais chaves (permissões etc.) podem ser editadas à mão.

### Formato de um subagente (`.agents/agents/<nome>.md`)

```markdown
---
name: abap-rap-dev
description: >-
  Quando acionar este especialista (texto usado por todas as ferramentas).
skill: abap-rap-dev
---

Você é o **abap-rap-dev**, ...

{{skill}}

## Fontes normativas ...
```

O marcador `{{skill}}` vira a instrução de carregar a skill na sintaxe de cada ferramenta (`$skill` no Codex, `/skill:skill` no Kimi). No Claude Code ele é removido, pois a skill é pré-carregada pelo campo `skills:`.

### Os subagentes são obrigatórios?

**Não.** Eles são uma opção para tarefas maiores; tarefas pequenas podem ser pedidas direto ao orquestrador (sessão principal).

- **Forçar um subagente**: cite o nome no pedido ("Peça ao `abap-rap-dev`...").
- **Evitar a delegação**: diga "faça você mesmo, sem subagente".
- **Regras que valem sempre** (com ou sem subagente): apresentar o plano com os nomes dos objetos para aprovação antes de criar/alterar algo no SAP, e só concluir a entrega com ATC sem erros pelo `abap-qa-auditor`.

| Vale delegar | Não vale delegar |
|---|---|
| Entregas ponta a ponta (backend → Fiori → QA) | Ajustes de uma ou duas linhas |
| Trabalho com muita saída (ATC, logs extensos), que fica fora do contexto principal | Consultas e dúvidas |
| Etapas independentes, que podem rodar em paralelo | Tarefas em que o contexto da conversa importa (o subagente só conhece o que está no prompt) |

### Regras de manutenção

- **Edite só a fonte** (`AGENTS.md`, `standards/`, `.agents/agents/`, `.agents/skills/`, `.agents/mcp.servers.json`) e rode:
  ```bash
  node scripts/sync-agents.mjs
  ```
  Faça commit da fonte **e** dos arquivos gerados juntos.
- **A CI** (`.github/workflows/sync-agents.yml`) roda `node scripts/sync-agents.mjs --check` e reprova o PR se algum arquivo gerado foi editado à mão ou ficou desatualizado.
- **Novo agente?** Crie `.agents/agents/<nome>.md` e `.agents/skills/<nome>/SKILL.md`, registre-o no `AGENTS.md` e rode o script. Os arquivos de todas as ferramentas são criados automaticamente.
- **Removeu um agente?** Apague a fonte e rode o script: os arquivos gerados órfãos são removidos.
- **Não use valores de cliente nas skills.** Pacotes, variantes e pastas vêm do bloco `cliente` de `standards/naming-conventions.json`.
- **Padrões corporativos** (`standards/`) são a fonte única de verdade — não duplique regras dentro das skills.

---

## 🤝 Contribuidores

Quem contribuir deve registrar a atividade em [CONTRIBUTORS.md](CONTRIBUTORS.md) (uma linha por contribuição).
