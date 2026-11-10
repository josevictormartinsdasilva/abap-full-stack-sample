---
name: fiori-elements-dev
description: >-
  Skill de especialista para desenvolvimento, configuração e manutenção de qualquer
  aplicação SAP Fiori Elements (OData V4/V2, Floorplans LROP, ALP, OVP, FCL) e SAPUI5.
  Use para geração de apps, Page Map (manifest.json), anotações locais, controller extensions
  e automações via fiori-mcp.
---

# Agente Especialista SAP Fiori Elements & SAPUI5

Esta skill orienta o desenvolvimento, evolução e governança de aplicações **SAP Fiori Elements** em qualquer projeto, garantindo conformidade com os padrões oficiais SAP e com as diretrizes corporativas de [padrao-desenvolvimento.md](../../../standards/padrao-desenvolvimento.md).

---

## 1. Princípios de Descoberta & Localização de Aplicações

O agente deve operar de forma desacoplada de caminhos fixos:
1. **Identificação da Aplicação Alvo**:
   - Se o caminho da aplicação (`appPath`) não for explicitado pelo usuário ou orquestrador, utilize a ferramenta `list_fiori_apps` no workspace para descobrir as aplicações existentes.
   - O `appPath` válido é a pasta raiz do projeto frontend (onde residem `package.json` e `ui5.yaml`).

---

## 2. Fluxo Padronizado de Modificação (Fiori MCP 3-Step Workflow)

Ao realizar qualquer alteração estrutural no aplicativo (adicionar/remover páginas, habilitar recursos de tabela, controller extensions, configurações de cabeçalho, etc.), **siga rigorosamente as 3 etapas do servidor MCP `fiori-mcp`**:

1. **Etapa 1 — `list_functionality`**:
   - Chame com o `appPath` da aplicação.
   - Analise a lista de funcionalidades suportadas e identifique o `functionalityId` adequado.
2. **Etapa 2 — `get_functionality_details`**:
   - Chame com o `appPath` e o `functionalityId` selecionado.
   - Obtenha o esquema exato de parâmetros exigido pela operação.
3. **Etapa 3 — `execute_functionality`**:
   - Execute a modificação passando exatamente os parâmetros validados na Etapa 2.
   - Verifique o log de alterações retornadas em `changes`.

---

## 3. Diretrizes de Arquitetura Frontend & Floorplans

### 3.1. Floorplans Suportados
- **List Report & Object Page (LROP)**: Padrão para listagem, filtros analíticos e navegação detalhada pai-filho.
- **Analytical List Page (ALP)**: Foco em dados analíticos, gráficos e visualizações híbridas (gráfico + tabela).
- **Overview Page (OVP)**: Dashboards baseados em cartões (cards).
- **Flexible Column Layout (FCL)**: Layout multi-coluna expansível (duas ou três colunas) para visualização simultânea de lista e detalhes.

### 3.2. Hierarquia e Nomenclatura no `manifest.json`
- **List Report Target/Route**: `<Entidade>List` (ex: `OrdersList`, `TravelList`)
- **Main Object Page Target/Route**: `<Entidade>ObjectPage` (ex: `OrdersObjectPage`, `TravelObjectPage`)
- **Sub-Object Page Target/Route**: `<EntidadePai>__<NavPropFilho>ObjectPage` (ex: `Orders__ItemsObjectPage`)
- **Padronização Corporativa de Projeto (padrao-desenvolvimento.md)**:
  - **Nome do Módulo (APP)**: Máximo 21 caracteres.
  - **Namespace da Aplicação**: `br.com.<cliente>`.
  - **Objeto BSP para Deploy**: `ZZ1_<NOME_ABREV>` (máximo 15 caracteres no total).

---

## 4. Extensibilidade & Anotações

- **Anotações Locais (`webapp/annotations/annotation.xml`)**:
  - Utilizadas para enriquecer a UI quando anotações CDS de backend não puderem ser alteradas ou para sobreposições específicas de cliente.
- **Controller Extensions & Fragmentos Customizados**:
  - Criar extensões de controller seguindo `create-controller-extension` via MCP para ações customizadas, validações de cliente ou comportamentos visuais não cobertos por anotações padrão.

---

## 5. Garantia de Qualidade & Validação

Após qualquer modificação no descritor de aplicação ou código-fonte:
1. Validar se a sintaxe do `manifest.json` permanece íntegra e bem formatada.
2. Executar o linter oficial do projeto para certificar conformidade e ausência de warnings:
   ```bash
   npm run lint
   ```
3. Se necessário, validar a execução dos testes de integração/QUnit ou preview local (`npm start` ou `ui5 serve`).
