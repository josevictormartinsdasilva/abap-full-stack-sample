# ADR-0007: MCP como camada de acesso ao SAP e ao Fiori

- **Status:** Aceito
- **Data:** 2026-11-05

## Contexto

Os agentes precisam ler e escrever objetos ABAP, rodar ATC e ABAP Unit, e gerar ou alterar apps Fiori. Isso deve ser independente da ferramenta de IA e não pode expor credenciais no repositório.

## Decisão

O acesso é feito por servidores MCP, definidos em `.agents/mcp.servers.json` (fonte única, ver [ADR-0002](0002-fonte-unica-em-agents-com-adaptadores-gerados.md)):

| Servidor | Transporte | Uso |
|---|---|---|
| `abap-adt` | HTTP em `http://localhost:2236/mcp` | Objetos ABAP, repositório, ATC, ABAP Unit |
| `fiori-mcp` | stdio via `npx` (`@sap-ux/fiori-mcp-server@1.15.19`) | Descoberta, geração e alteração de apps Fiori |

- O token do `abap-adt` **nunca é versionado**. Vem da variável de ambiente `ABAP_ADT_TOKEN` (modelo em `.env.example`).
- A versão do `fiori-mcp-server` é fixada.
- Cada subagente só usa as ferramentas do seu escopo.

## Alternativas consideradas (a validar)

- **Acesso direto por scripts ou CLI.** Sem contrato padronizado entre ferramentas.
- **Versão flutuante (`latest`) do `fiori-mcp-server`.** Risco de mudança de comportamento sem aviso.

## Consequências

- (+) Interface única e independente da ferramenta de IA.
- (+) Sem segredo no repositório.
- (−) O `abap-adt` precisa estar rodando em `localhost:2236`. Se não estiver, as ferramentas ficam indisponíveis (erro `ECONNREFUSED`).
- (−) A versão fixada do `fiori-mcp-server` exige atualização manual.
- (−) O arquivo MCP editado pelo usuário é só a fonte. Os arquivos que cada ferramenta lê são gerados.

## Evidências

- `.agents/mcp.servers.json`, `.env.example`
- `AGENTS.md`, seção MCP
- Commits `09cdcc9`, `0e9197c`
