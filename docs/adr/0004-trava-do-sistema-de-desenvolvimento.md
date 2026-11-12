# ADR-0004: Trava do sistema de desenvolvimento

- **Status:** Aceito
- **Data:** 2026-11-10

## Contexto

Os agentes têm acesso de escrita ao SAP via MCP `abap-adt`. Se a conexão apontar, por engano, para um sistema de qualidade ou produção, uma criação ou ativação indevida teria impacto real e difícil de reverter.

## Decisão

Antes de **criar, alterar ou ativar** qualquer objeto, o orquestrador compara o SID informado pelo servidor `abap-adt` com o `sistemaDesenvolvimento` do bloco `cliente` de `standards/naming-conventions.json`.

- Se o sistema for outro, ou se não for possível confirmar, o agente **para**: não cria nem ativa nada e avisa o usuário com o SID encontrado.
- Consultas de leitura não exigem a confirmação.
- O orquestrador repassa ao subagente o `sistemaDesenvolvimento` já confirmado.

## Alternativas consideradas (a validar)

- **Confiar na configuração do MCP.** Um erro de conexão passaria sem ser notado.
- **Bloqueio só no lado do servidor MCP.** Fora do controle deste repositório.

## Consequências

- (+) Reduz o risco de escrita em sistema errado.
- (+) A regra vale para todas as ferramentas, pois está no `AGENTS.md`.
- (−) É uma trava procedural, feita por instrução ao agente, não um bloqueio técnico. Não substitui a segregação de acessos e as autorizações no SAP.
- (−) Depende de o `sistemaDesenvolvimento` estar preenchido (ver [ADR-0008](0008-parametros-do-cliente-centralizados-sem-suposicao.md)). Enquanto for placeholder, a confirmação não é possível e a escrita fica bloqueada.

## Evidências

- `AGENTS.md`, regra 3
- `standards/naming-conventions.json`, campo `cliente.sistemaDesenvolvimento`
- Commit `7783fc9`, PR #3
