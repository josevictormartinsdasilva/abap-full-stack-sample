---
name: abap-qa-auditor
description: >-
  Skill de especialista para qualidade de código ABAP, verificações ATC, quickfixes automáticos
  e testes unitários no SAP BTP ABAP Cloud / S/4HANA e camadas UI5.
---

# Agente Auditor de Qualidade & Governança ABAP

Esta skill orienta os procedimentos de garantia de qualidade e conformidade de código conforme o tópico 13 de [padrao-desenvolvimento.md](../../../standards/padrao-desenvolvimento.md).

## Escopo e parâmetros do projeto

Não há pacote nem pasta fixos nesta skill. Determine o escopo nesta ordem:

1. Pacote, objetos ou request informados pelo orquestrador.
2. Bloco `cliente` de [naming-conventions.json](../../../standards/naming-conventions.json): `pacotePadraoATC`, `varianteATC` e `pastaAppsFiori`.
3. Se o valor ainda estiver como placeholder (`<...>`), **pare e pergunte** — nunca rode ATC num pacote suposto.

## Servidor MCP

Os nomes de ferramentas abaixo são os do `abap-adt` (MCP oficial, S/4HANA 2025+). Em sistemas ≤ 2023, use o servidor informado pelo orquestrador (`vsp` em DEV/SANDBOX, `arc-1` em QAS/PRD) e as equivalências da seção 5 de [politica-mcp-abap.md](../../../standards/politica-mcp-abap.md). Em QAS/PRD, a auditoria é somente leitura: não aplique QuickFixes e não rode ABAP Unit, que só é executado em DEV/SANDBOX.

## Tarefas Principais

1. **Verificações ATC (ABAP Test Cockpit)**:
   - Iniciar execução do ATC via `abap_atc_run_start`, usando a variante `varianteATC` do projeto.
   - Obter resultados e apontamentos via `abap_atc_run_get_result`.
   - Aplicar QuickFixes automatizados com `abap_atc_quickfixes_apply` quando houver suporte; reexecutar o ATC para confirmar.
   - Tolerância zero: qualquer erro de ATC reprova a entrega.

2. **Testes Unitários ABAP Unit**:
   - Executar suítes de teste unitário via `abap_unit_run_tests` no escopo definido acima, **somente em DEV/SANDBOX**. Teste unitário executa código e pode ter efeito colateral (gravação, RFC, bloqueio); em QAS/PRD, não execute e registre no relatório que não foi executado.

3. **Linting de Frontend**:
   - Executar `npm run lint` na pasta de cada app Fiori afetado (raiz com `package.json` e `ui5.yaml`) para garantir zero erros ou avisos de ESLint.

4. **Nomenclatura**:
   - Auditar os nomes dos objetos criados/alterados contra `naming-conventions.json`.
