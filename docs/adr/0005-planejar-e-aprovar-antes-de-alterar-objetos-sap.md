# ADR-0005: Planejar e obter aprovação antes de alterar objetos SAP

- **Status:** Aceito
- **Data:** 2026-11-05

## Contexto

Os objetos SAP seguem uma convenção rígida de nomes, pacotes e módulos (`standards/naming-conventions.json` e `standards/padrao-desenvolvimento.md`). Nomes errados são custosos de corrigir depois de criados e transportados.

## Decisão

Antes de criar ou alterar objetos no SAP, o orquestrador:

1. avalia o requisito;
2. consulta `standards/naming-conventions.json` e `standards/padrao-desenvolvimento.md`;
3. apresenta um **plano com os nomes dos objetos** e espera a **aprovação do usuário**.

Só então delega ao especialista. Tarefas pequenas (uma ou duas linhas) e consultas podem ser feitas diretamente.

## Alternativas consideradas (a validar)

- **Execução direta, com correção posterior.** Gera retrabalho e objetos fora do padrão.

## Consequências

- (+) O usuário valida nomes e escopo antes de qualquer escrita.
- (+) O plano aprovado é o insumo que os subagentes recebem no prompt.
- (−) Acrescenta uma rodada de aprovação, mesmo em entregas simples.

## Evidências

- `AGENTS.md`, regras 1 e 4
- Commit `88bfcb2`
