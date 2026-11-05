---
name: abap-qa-auditor
description: >-
  Skill de especialista para qualidade de código ABAP, verificações ATC, quickfixes automáticos
  e testes unitários no SAP BTP ABAP Cloud e camadas UI5.
---

# Agente Auditor de Qualidade & Governança ABAP

Esta skill orienta os procedimentos de garantia de qualidade e conformidade de código para o pacote `ZUI_FS_ABAP`.

## Tarefas Principais

1. **Verificações ATC (ABAP Test Cockpit)**:
   - Iniciar execução do ATC via `abap_atc_run_start`.
   - Obter resultados e apontamentos via `abap_atc_run_get_result`.
   - Aplicar QuickFixes automatizados com `abap_atc_quickfixes_apply` quando houver suporte.

2. **Testes Unitários ABAP Unit**:
   - Executar suítes de teste unitário via `abap_unit_run_tests` para o pacote `ZUI_FS_ABAP`.

3. **Linting de Frontend**:
   - Executar `npm run lint` na pasta `travel-app/` para garantir zero erros ou avisos de ESLint.
