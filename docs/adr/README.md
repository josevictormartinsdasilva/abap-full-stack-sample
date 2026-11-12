# Registros de Decisão de Arquitetura (ADR)

Este diretório registra as decisões de arquitetura do template **Orquestrador SAP Full Stack (ABAP & Fiori)**.
Formato: MADR simplificado, em português. Um arquivo por decisão: `NNNN-titulo.md`.

## Convenções

- **Status**: `Proposto`, `Aceito`, `Substituído por ADR-NNNN` ou `Obsoleto`.
- **Data**: data do commit que introduziu a decisão.
- Uma decisão aceita não é reescrita. Para mudá-la, crie um novo ADR e marque o anterior como substituído.
- Trechos marcados **(a validar)** são inferência feita a partir do código e do histórico do git. O racional não estava registrado e deve ser confirmado por quem tomou a decisão.

## Índice

| ADR | Título | Status |
|---|---|---|
| [0001](0001-arquitetura-multiagente-com-orquestrador-central.md) | Arquitetura multiagente com orquestrador central | Aceito |
| [0002](0002-fonte-unica-em-agents-com-adaptadores-gerados.md) | `.agents/` e `AGENTS.md` como fonte única, com adaptadores gerados | Aceito |
| [0003](0003-suporte-multi-ferramenta.md) | Suporte multi-ferramenta (Claude Code, Codex, Antigravity, Kimi) | Aceito |
| [0004](0004-trava-do-sistema-de-desenvolvimento.md) | Trava do sistema de desenvolvimento | Aceito |
| [0005](0005-planejar-e-aprovar-antes-de-alterar-objetos-sap.md) | Planejar e obter aprovação antes de alterar objetos SAP | Aceito |
| [0006](0006-atc-tolerancia-zero-como-criterio-de-entrega.md) | ATC com tolerância zero como critério de entrega | Aceito |
| [0007](0007-mcp-como-camada-de-acesso-ao-sap-e-ao-fiori.md) | MCP como camada de acesso ao SAP e ao Fiori | Aceito |
| [0008](0008-parametros-do-cliente-centralizados-sem-suposicao.md) | Parâmetros do cliente centralizados, sem suposição | Aceito |

## Modelo

```markdown
# ADR-NNNN: Título

- **Status:** Proposto | Aceito | Substituído por ADR-NNNN | Obsoleto
- **Data:** AAAA-MM-DD

## Contexto
## Decisão
## Alternativas consideradas
## Consequências
## Evidências
```
