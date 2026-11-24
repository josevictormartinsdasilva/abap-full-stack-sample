# ADR-0008: Parâmetros do cliente centralizados, sem suposição

- **Status:** Aceito
- **Data:** 2026-11-05

## Contexto

O repositório é um template reutilizável entre clientes. Sigla, pacotes, variante ATC, namespace Fiori e sistema de desenvolvimento mudam a cada cliente. Um agente que suponha esses valores gera objetos com nomes ou destinos errados.

## Decisão

Os parâmetros do cliente ficam num único lugar, o bloco `cliente` de `standards/naming-conventions.json`:

`empresa`, `sigla`, `pacotePadraoATC`, `varianteATC`, `namespaceFiori`, `pastaAppsFiori`, `sistemaDesenvolvimento`.

O projeto CTS fica fora do bloco, em `requests.projetoCTS`, porque é atribuído à request e não ao pacote, e nem todo cliente usa. Quando o cliente não usa, o valor é a string "não se aplica", e os agentes não perguntam.

O assistente `node scripts/setup.mjs` preenche o bloco (o `sistemaDesenvolvimento` vem do SID detectado no DEV), o projeto CTS e, a partir deles, os placeholders de `standards/padrao-desenvolvimento.md`.

Os valores não preenchidos aparecem como placeholders (`<...>`). Se um valor necessário ainda for placeholder, o agente **pergunta ao usuário e nunca supõe**.

## Alternativas consideradas (a validar)

- **Valores embutidos nos prompts dos agentes.** Duplicação e risco de divergência.
- **Variáveis de ambiente.** Adequadas para segredos ([ADR-0007](0007-mcp-como-camada-de-acesso-ao-sap-e-ao-fiori.md)), mas ruins para dados de convenção que precisam ser versionados e revisados.

## Consequências

- (+) Adotar o template para um novo cliente é preencher um bloco.
- (+) Os agentes têm um comportamento definido quando o dado falta.
- (−) Enquanto o bloco tiver placeholders, parte do fluxo fica bloqueada: a trava de DEV ([ADR-0004](0004-trava-do-sistema-de-desenvolvimento.md)) e o ATC ([ADR-0006](0006-atc-tolerancia-zero-como-criterio-de-entrega.md)).
- (−) O `padrao-desenvolvimento.md` também cita `<VARIANTE_ATC>` em texto, então os dois arquivos precisam ficar coerentes.

## Evidências

- `AGENTS.md`, regra 2
- `standards/naming-conventions.json`, bloco `cliente`
