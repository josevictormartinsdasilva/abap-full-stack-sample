# ADR-0001: Arquitetura multiagente com orquestrador central

- **Status:** Aceito
- **Data:** 2026-11-05

## Contexto

O desenvolvimento SAP ponta a ponta cobre áreas com conhecimento e ferramentas distintos: backend RAP/Clean Core, ABAP clássico e RICEFW, frontend Fiori Elements e qualidade (ATC, ABAP Unit, ESLint). Um único agente generalista teria de carregar todas essas regras ao mesmo tempo.

## Decisão

A sessão principal atua como **Orquestrador Central**. Ela planeja, consulta os padrões e delega a quatro subagentes especialistas:

- `abap-rap-dev`: CDS, BDEF, serviços e tabelas em ABAP Cloud/RAP.
- `abap-classic-dev`: reports, módulos de função, SE11/SE24, Dynpro, IDoc e formulários.
- `fiori-elements-dev`: apps Fiori Elements e SAPUI5.
- `abap-qa-auditor`: ATC, QuickFixes, ABAP Unit e ESLint.

A ordem de precedência em entregas ponta a ponta é `abap-rap-dev` (ou `abap-classic-dev`) → `fiori-elements-dev` → `abap-qa-auditor`. Etapas independentes podem rodar em paralelo. Tarefas pequenas podem ser feitas direto pelo orquestrador. O orquestrador deve repassar fielmente os resultados dos subagentes, inclusive falhas.

## Alternativas consideradas (a validar)

- **Agente único generalista.** Contexto grande e regras misturadas.
- **Um agente por camada técnica, sem orquestrador.** O usuário teria de coordenar a ordem e o repasse de contexto.

## Consequências

- (+) Cada especialista carrega só o seu escopo e a sua skill.
- (+) A qualidade fica numa etapa final e separada.
- (−) O subagente só conhece o que estiver no prompt. O orquestrador precisa informar módulo, pacote, request, nomes aprovados e objetos existentes.
- (−) Aumenta o custo de coordenação em tarefas pequenas, por isso a exceção para tarefas de uma ou duas linhas.

## Evidências

- `AGENTS.md` (regras de orquestração e papéis)
- `.agents/agents/*.md`
- Commit `88bfcb2`
