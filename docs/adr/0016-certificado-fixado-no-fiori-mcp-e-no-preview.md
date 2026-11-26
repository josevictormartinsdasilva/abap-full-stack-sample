# ADR-0016: Certificado fixado também no fiori-mcp e no preview dos apps Fiori

- **Status:** Aceito (2026-11-26)
- **Data:** 2026-11-26

## Contexto

O [ADR-0013](0013-certificado-fixado-e-tls-do-vsp.md) fixa o certificado do SAP por conexão (`.agents/certs/<servidor>.pem`, variável `<P>_SAP_CA_CERT`) e o entrega ao probe e ao `arc-1`. O `fiori-mcp` e o preview do app (`npm start`/`fiori run`) ficaram de fora: são processos Node que falam com o mesmo SAP, mas não passam pelo launcher.

Numa POC com SAP de certificado autoassinado, o `fiori-mcp` falhou com `self-signed certificate` ao ler o serviço OData. A correção local foi `"env": { "NODE_EXTRA_CA_CERTS": ".agents/certs/vsp.pem" }` na entrada `fiori-mcp` de `.agents/mcp.servers.json`. Ela não serve ao template:

- o `.mcp.json` e os demais arquivos gerados são versionados, e o caminho do `.pem` depende do nome da conexão e de o cliente precisar de certificado fixado;
- apontar para um arquivo que não existe faz o Node avisar a cada início (`Ignoring extra certs from ...`);
- o preview tem o mesmo problema e não lê o `.mcp.json`.

## Decisão

1. **Wrapper `scripts/com-certificados.mjs`.** Roda o comando informado com `NODE_EXTRA_CA_CERTS` apontando para um arquivo que junta os `.pem` de **todas** as variáveis `<P>_SAP_CA_CERT` (ambiente ou `.env` da raiz) e o `NODE_EXTRA_CA_CERTS` que o usuário já tenha definido. O arquivo fica em `.agents/certs/node-extra-ca.pem` (não versionado) e é refeito a cada início. Sem certificado fixado, o comando roda sem mudança no ambiente.
2. **A entrada `fiori-mcp` usa o wrapper**: `node scripts/com-certificados.mjs npx --yes @sap-ux/fiori-mcp-server@<versão> fiori-mcp`. A fonte (`.agents/mcp.servers.json`) não tem caminho de `.pem`, então os arquivos gerados continuam iguais em todo cliente.
3. **O preview usa o mesmo wrapper**, na pasta do app: `node <raiz>/scripts/com-certificados.mjs npm start`.
4. **A verificação TLS nunca é desligada.** O wrapper recusa iniciar com `NODE_TLS_REJECT_UNAUTHORIZED=0`, e `ignoreCertErrors: true` no `ui5.yaml` continua proibido.
5. Os certificados confiáveis são só os que o usuário já conferiu pelo SHA-256 no setup (ADR-0013). O wrapper não baixa nem fixa certificado.

## Alternativas consideradas

- **Caminho fixo na fonte (`.agents/certs/vsp.pem` ou um nome neutro como `dev.pem`).** Funciona só quando o arquivo existe; sem ele, o Node avisa a cada início. E um nome neutro gravado pelo setup ainda deixaria de fora os certificados das outras conexões.
- **O `sync-agents` injetar o `.pem` do DEV na entrada `fiori-mcp`.** O arquivo gerado passaria a depender da máquina e do cliente, e o `.mcp.json` é versionado.
- **`NODE_EXTRA_CA_CERTS` global do usuário.** É o passo manual que o ADR-0013 removeu, e exige reabrir o terminal.
- **`ignoreCertErrors: true` no `ui5.yaml` / `NODE_TLS_REJECT_UNAUTHORIZED=0`.** Desliga o TLS, o que a política proíbe.

## Consequências

- (+) `fiori-mcp` e preview funcionam com SAP de certificado autoassinado ou de CA interna, sem passo manual e sem caminho de cliente no repositório.
- (+) Uma conexão a mais com certificado fixado entra sozinha, pelo nome da variável.
- (−) O processo do `fiori-mcp` passa a confiar em todos os certificados fixados do projeto, não só no do sistema que ele acessa. São certificados já conferidos pelo usuário, e o `NODE_EXTRA_CA_CERTS` só acrescenta âncoras: não desliga nenhuma verificação.
- (−) Como o launcher, o wrapper depende de a ferramenta de IA iniciar o servidor com a raiz do projeto como diretório de trabalho (ver `docs/setup-mcp-abap.md`, "Diretório de trabalho por ferramenta").

## Evidências

- Mensagem da POC: `self-signed certificate` no `fiori-mcp`, resolvida com `NODE_EXTRA_CA_CERTS` apontando para o `.pem` fixado pelo setup.
- `scripts/com-certificados.mjs` e `scripts/test/com-certificados.test.mjs`.
- Teste local (Windows, Node 24): `fiori-mcp` 1.15.19 iniciado pelo wrapper respondeu ao `initialize` do MCP.
