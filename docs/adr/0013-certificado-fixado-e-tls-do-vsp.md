# ADR-0013: Certificado fixado por conexão e opt-in de TLS sem verificação no vsp

- **Status:** Aceito (2026-11-24, PRs #20 e #22)
- **Data:** 2026-11-24

## Contexto

O [ADR-0009](0009-selecao-de-mcp-abap-por-versao-e-ambiente.md) proíbe desligar a verificação TLS: a autenticação do `arc-1` e do `vsp` é Basic, e quem se passar pelo SAP captura usuário e senha. Para certificado de CA interna, a única saída documentada era o `NODE_EXTRA_CA_CERTS` global.

Na prática, muitos sistemas usam o certificado **autoassinado** que o STRUST gera, frequentemente **sem SAN** (só o CN). Num caso real (`DEPTH_ZERO_SELF_SIGNED_CERT`), três problemas apareceram:

1. Não há CA a pedir ao Basis: o certificado do servidor é a própria âncora. A mensagem do setup ("CA interna") levava a um pedido impossível.
2. O `NODE_EXTRA_CA_CERTS` é global e manual: o desenvolvedor precisa obter o `.pem`, gravar a variável e reabrir o terminal.
3. O `vsp` é um binário Go: não lê o `NODE_EXTRA_CA_CERTS`, não tem opção de CA própria (só `--insecure`) e, desde o Go 1.15, recusa certificado sem SAN mesmo que a CA seja confiável. Testado com o `vsp` 2.62.1: `x509: certificate signed by unknown authority`.

## Decisão

1. **Certificado fixado por conexão (padrão).** No erro de certificado, o `setup.mjs` lê a cadeia do servidor (só o handshake TLS, sem credencial), mostra assunto, SAN, validade e o **SHA-256**, e pede ao usuário que o confira com o Basis (STRUST) antes de confiar. Confirmado, grava o `.pem` em `.agents/certs/<servidor>.pem` (não versionado) e `<P>_SAP_CA_CERT` no `.env`.
   - Autoassinado: fixa o próprio certificado. Cadeia com raiz enviada: fixa a raiz. Raiz não enviada: pede o `.pem` da CA raiz.
2. **O launcher confia só no certificado fixado** daquela conexão: o probe usa o `.pem` como única âncora (`node:https` com `ca`), e o `arc-1` o recebe por `NODE_EXTRA_CA_CERTS` no processo filho. A verificação TLS nunca é desligada no Node. Se o certificado do servidor mudar, o launcher recusa iniciar e orienta a conferir com o Basis e fixar de novo.
3. **Opt-in `<P>_SAP_INSECURE=true`, só no `vsp`**, desligado por padrão. O launcher passa `--insecure` ao `vsp` **depois** de o probe ter verificado o certificado (fixado ou da cadeia do sistema) na mesma inicialização. As demais travas do `vsp` não mudam (DEV/SANDBOX, `--expect`, `--allowed-packages`, `--block-free-sql`). O runtime e o doctor mostram o modo TLS, e o launcher avisa a cada início.
4. **No `arc-1`, `<P>_SAP_INSECURE` é ignorada**, com aviso: ele sempre verifica, com o certificado fixado.
5. `NODE_TLS_REJECT_UNAUTHORIZED=0` continua recusado, e `http://` continua aceito só para `localhost`.

## Alternativas consideradas

- **Manter só o `NODE_EXTRA_CA_CERTS` global.** Não resolve o `vsp` e mantém o passo manual que gerou a dúvida.
- **Desligar o TLS em todas as conexões, com opt-in.** Desnecessário para o `arc-1` e o probe (Node aceita o certificado fixado, mesmo sem SAN), e expõe a senha do QAS.
- **Importar o certificado no repositório do Windows para o `vsp`.** Não basta: o Go recusa certificado sem SAN mesmo confiável. Vale como solução definitiva junto com um certificado com SAN emitido pelo Basis.
- **Fixar por SHA-256 em vez de `.pem`.** Exige desligar a validação da cadeia e conferir o hash por fora; com o `.pem` como âncora, a validação padrão do OpenSSL (inclusive o nome do host) continua valendo.

## Consequências

- (+) Certificado autoassinado deixa de exigir CA, variável global ou reinício do terminal: o setup resolve na hora, por conexão.
- (+) Certificado trocado ou interceptação no início da sessão são detectados: o launcher recusa iniciar.
- (−) Com `<P>_SAP_INSECURE=true`, o `vsp` não verifica o TLS durante a sessão. Uma interceptação que comece depois da verificação inicial não seria detectada, e a senha do DEV ficaria exposta. A mitigação é procedural: usar só enquanto o Basis não emite um certificado com SAN.
- (−) A conferência do SHA-256 depende do usuário. Sem ela, o primeiro uso confia no que a rede entregou (*trust on first use*).
- (−) Renovar o certificado no STRUST exige fixar de novo (`node scripts/setup.mjs --apenas=dev` ou `qas`).

## Evidências

- `scripts/sap-tls.mjs`, `scripts/sap-probe.mjs` (`requisicaoComCa`), `scripts/mcp-politica.mjs` (`decidir`, parâmetro `caCert`), `scripts/mcp-launch.mjs` e `scripts/setup.mjs` (`oferecerConfianca`).
- Testes em `scripts/test/sap-tls.test.mjs` e `scripts/test/mcp-politica.test.mjs` ("TLS: certificado fixado e opt-in insecure do vsp").
- `standards/politica-mcp-abap.md`, seções 2 e 4.3.
