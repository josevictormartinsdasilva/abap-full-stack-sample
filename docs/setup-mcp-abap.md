# Configuração dos MCPs `vsp` e `arc-1` na máquina

Guia para preparar a máquina de cada desenvolvedor para os servidores `vsp` e `arc-1`, usados em sistemas S/4HANA 2023 ou inferior. As regras de uso estão na [política de MCP ABAP](../standards/politica-mcp-abap.md), e o racional da decisão no [ADR-0009](adr/0009-selecao-de-mcp-abap-por-versao-e-ambiente.md).

| Servidor | Sistema | Modo |
|---|---|---|
| `vsp` | DEV / Sandbox ≤ 2023 | Desenvolvimento |
| `arc-1` | QAS / PRD ≤ 2023 | Somente leitura |
| `abap-adt` | S/4HANA 2025+ | Ver [Configuração do Token MCP](../README.md#-configuração-do-token-mcp-abap-adt) |

Você **não edita** nenhum arquivo de MCP (`.mcp.json`, `.codex/config.toml` etc.). Eles já vêm gerados com `arc-1` e `vsp` apontando para `scripts/mcp-launch.mjs`. Preparar a máquina é só instalar os executáveis, preencher o `.env` e conferir a detecção.

---

## Passo a passo

### Uma vez por máquina

**1. Node.js 22.19 ou superior.** O ARC-1 exige essa versão.

```powershell
node -v
```

Se estiver abaixo, instale a versão LTS de [nodejs.org](https://nodejs.org).

**2. Binário do vsp.**

1. Baixe o asset da sua plataforma (ex.: `windows-amd64`) em [releases do vibing-steampunk](https://github.com/oisee/vibing-steampunk/releases). Use a versão homologada pelo projeto (v2.62.1), não a "latest".
2. Salve como `C:\tools\vsp\vsp.exe`.
3. Adicione a pasta ao PATH do usuário:

   ```powershell
   [Environment]::SetEnvironmentVariable('Path', $env:Path + ';C:\tools\vsp', 'User')
   ```

4. Abra um terminal novo e confira:

   ```powershell
   vsp --version
   ```

Alternativa ao PATH: defina `VSP_BIN=C:\tools\vsp\vsp.exe` no `.env` (passo 4).

**3. Certificado HTTPS — só se o SAP usar certificado de CA interna.** O launcher nunca desliga a verificação TLS. Peça ao time de Basis ou de infraestrutura a CA raiz em formato `.pem` e aponte o Node para ela:

```powershell
[Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', 'C:\certs\ca-cliente.pem', 'User')
```

O ARC-1 não tem passo de instalação: o launcher o baixa sozinho na primeira execução (`npx arc-1@1.10.1`).

### Uma vez por projeto / cliente

**4. Criar o `.env`** na raiz do projeto, a partir do modelo:

```powershell
Copy-Item .env.example .env
```

O `.env` está no `.gitignore`. Nunca faça commit dele.

**5. Preencher a conexão do DEV (`vsp`):**

```ini
VSP_SAP_URL=https://ds4.cliente.com.br:44300
VSP_SAP_CLIENT=110
VSP_SAP_USER=SEU_USUARIO
VSP_SAP_PASSWORD=...
VSP_ALLOWED_PACKAGES=$TMP,Z*
```

**6. Preencher a conexão do QAS/PRD (`arc-1`):**

```ini
ARC1_SAP_URL=https://qs4.cliente.com.br:44300
ARC1_SAP_CLIENT=400
ARC1_SAP_USER=USUARIO_LEITURA
ARC1_SAP_PASSWORD=...
```

Informe só a conexão. SID, release e ambiente são **detectados no próprio SAP**. Se o cliente não tiver um dos sistemas, deixe as variáveis dele vazias.

**7. Testar a detecção:**

```powershell
node scripts/mcp-launch.mjs vsp --diagnostico
node scripts/mcp-launch.mjs arc-1 --diagnostico
```

Resultado esperado:

```
mcp-launch: vsp encontrado: vsp v2.62.1 (...)
mcp-launch: vsp -> DS4/110 · S/4HANA 2023 · DEV (mandante de customizing ...) · desenvolvimento
mcp-launch: arc-1 -> QS4/400 · S/4HANA 2023 · QAS (mandante de teste ...) · somente leitura
```

Antes de conectar ao SAP, o diagnóstico confere os executáveis: o binário do `vsp` (ou o `VSP_BIN`) e a versão do Node exigida pelo ARC-1. Se faltar algo, ele para com a indicação do passo deste guia que resolve.

Confira se SID, produto e ambiente estão corretos. Se aparecer uma recusa, veja a seção [Problemas comuns](#problemas-comuns).

### Toda vez que for usar

**8. Abrir a ferramenta e conferir as conexões.**

1. Abra a ferramenta de IA **na raiz do projeto**. O launcher é chamado por caminho relativo (`scripts/mcp-launch.mjs`) e não é encontrado se o servidor for iniciado em outra pasta (ver [Diretório de trabalho por ferramenta](#diretório-de-trabalho-por-ferramenta)).
2. Rode `/mcp` (Claude Code). Os servidores `abap-adt`, `arc-1`, `vsp` e `fiori-mcp` devem aparecer conectados.

Se você alterar o `.env`, reinicie a ferramenta: os servidores só são iniciados na abertura da sessão.

---

## Variáveis opcionais

| Variável | Para quê |
|---|---|
| `VSP_SAP_SID` / `ARC1_SAP_SID` | Conferência: se o SID detectado for diferente, o launcher recusa iniciar. Pega URL trocada. |
| `VSP_ALLOWED_TRANSPORTS=DS4K*` | Permite ao `vsp` editar objetos em pacotes transportáveis, só nas requests do padrão informado. |
| `VSP_ENABLE_TRANSPORTS=true` | Permite ao `vsp` criar e liberar requests. Use só quando necessário. |
| `VSP_READ_ONLY=true` | Usa o `vsp` no DEV apenas para análise. |
| `VSP_BIN` | Caminho do `vsp.exe` quando ele não estiver no PATH. Um `.cmd`/`.bat` também é aceito, desde que o caminho e os valores das variáveis `VSP_*` não tenham `%`, `!`, `^` ou aspas. |
| `ARC1_BIN` | Caminho de um ARC-1 já instalado, para redes que bloqueiam o `npx`. Instale com `npm install -g arc-1@1.10.1`. No Windows, o `npm` instala um `arc-1.cmd`, que pode ser usado aqui. |
| `ARC1_ALLOW_DEV_WRITES=true` + `ARC1_ALLOWED_PACKAGES=Z*` | Exceção controlada da política (4.2): habilita a escrita do `arc-1` quando ele aponta para um DEV/SANDBOX ≤ 2023, restrita aos pacotes informados. Sem a flag, o `arc-1` no DEV fica somente leitura e não pede pacotes. |
| `ARC1_BLOCKED_DATA_SOURCES` | Tabelas a bloquear na leitura (experimental). Ex.: `USR02,PA0002`. |

---

## Diretório de trabalho por ferramenta

As configurações geradas chamam `node scripts/mcp-launch.mjs <servidor>` com caminho **relativo**. Ele só funciona se a ferramenta iniciar o servidor com a raiz do projeto como diretório de trabalho. Levantamento feito em 2026-11-19 na documentação de cada ferramenta (item 2.5 do [plano de correções](plano-correcoes-mcp-abap.md)):

| Ferramenta | Diretório do servidor stdio | Recurso para fixar a raiz | Situação |
|---|---|---|---|
| Claude Code (`.mcp.json`) | Não documentado | `CLAUDE_PROJECT_DIR` existe no ambiente do servidor, mas não pode ser usado em `args` (a expansão acontece antes e exige um padrão, ex.: `${CLAUDE_PROJECT_DIR:-.}`) | Abrir na raiz |
| Codex (`.codex/config.toml`) | Não documentado. O Codex carrega todo `.codex/config.toml` entre a raiz do Git e a pasta atual, então a config **é** lida numa subpasta | Campo `cwd`, mas sem regra documentada para caminho relativo | Abrir na raiz |
| Kimi Code (`.kimi-code/mcp.json`) | Não documentado | Campo `cwd`, sem regra documentada para caminho relativo | O `.kimi-code/mcp.json` só é lido na pasta atual: numa subpasta, os servidores nem aparecem. Abrir na raiz |
| Antigravity (`.agents/mcp_config.json`) | Não documentado | Campo `cwd`, sem variável para a pasta do workspace | Abrir na raiz (workspace = raiz do projeto) |

Nenhuma ferramenta documenta um jeito portátil (sem caminho absoluto da máquina) de apontar para a raiz. Por isso as configurações continuam com caminho relativo, e a regra é **abrir a ferramenta na raiz do projeto**. Testes em cada ferramenta com sessão aberta numa subpasta (ex.: a de um app Fiori) ainda não foram feitos. Ao fazê-los, registre o resultado nesta tabela.

---

## Autorizações SAP dos usuários

| Usuário | Precisa de |
|---|---|
| Ambos | Acesso ao ADT: serviço ICF `/sap/bc/adt` ativo e autorizações de desenvolvedor ADT. |
| Ambos | Data preview na `T000`, usado na detecção do ambiente. Sem ela, o sistema é tratado como **PRD**, e o `vsp` não sobe. |
| `vsp` (DEV) | Autorizações de desenvolvimento, restritas aos pacotes do projeto. |
| `arc-1` (QAS/PRD) | Somente leitura. O launcher já força leitura, mas a autorização SAP é a segunda barreira. |

---

## Vários sistemas do mesmo tipo

Exemplo: dois QAS, XXX e YYY.

1. Em `.agents/mcp.servers.json`, troque a entrada `arc-1` por duas:

   ```json
   "arc-1-qas-xxx": { "transport": "stdio", "command": "node", "args": ["scripts/mcp-launch.mjs", "arc-1-qas-xxx"], "timeoutSec": 300 },
   "arc-1-qas-yyy": { "transport": "stdio", "command": "node", "args": ["scripts/mcp-launch.mjs", "arc-1-qas-yyy"], "timeoutSec": 300 }
   ```

2. Rode `node scripts/sync-agents.mjs` e faça commit.
3. No `.env`, use os prefixos derivados do nome do servidor: `ARC1_QAS_XXX_SAP_URL`, `ARC1_QAS_YYY_SAP_URL` etc.

---

## macOS / Linux

As etapas são as mesmas, com três diferenças:

- **vsp:** baixe o asset `darwin-arm64` ou `linux-amd64`, dê `chmod +x` e coloque-o como `vsp` no PATH (ex.: `/usr/local/bin/vsp`).
- **Variáveis de ambiente:** use `export` no `~/.zshrc`. Exemplo: `export NODE_EXTRA_CA_CERTS=~/certs/ca-cliente.pem`.
- **Adaptadores:** gere a variante Unix localmente com `node scripts/sync-agents.mjs --platform=unix`. **Não faça commit** dessa variante: os arquivos versionados usam `cmd /c`, que só existe no Windows.

---

## Problemas comuns

Todas as mensagens do launcher começam com `mcp-launch:`. Para vê-las, rode o diagnóstico do passo 7.

| Mensagem | Causa e solução |
|---|---|
| `variável VSP_SAP_URL não definida` | `.env` ausente ou incompleto. Refaça os passos 4 a 6. |
| `logon recusado (401)` | Usuário ou senha errados, ou usuário bloqueado no SAP. |
| `fetch failed` / erro de certificado | URL ou porta erradas, VPN desligada ou CA interna. Ver passo 3. |
| `T000 ilegível ... tratado como PRD` | O usuário não tem autorização de data preview. Peça-a ao time de segurança SAP. |
| `vsp recusado: ... é QAS` | A URL do `vsp` aponta para um QAS, ou o mandante do DEV não está como customizing (`C`) na SCC4. |
| `o sistema conectado é QS4, mas VSP_SAP_SID diz DS4` | A URL está trocada. Corrija `VSP_SAP_URL`. |
| `vsp recusado: SAP_BASIS 816` | É um S/4HANA 2025. Use o `abap-adt` (MCP oficial). |
| `recusado: SAP_BASIS 702 ... fora do escopo` | Release anterior ao NW 7.50. A política não cobre esse sistema (regra absoluta 5). |
| `vsp recusado: o SID DS4 veio do T000-LOGSYS` | O release não informa o SID pelo ADT. Se o SID estiver certo, defina `VSP_SAP_SID=DS4`. Sem isso, o `arc-1` também só inicia em leitura. |
| `o T000-LOGSYS indica o SID QS4, mas VSP_SAP_SID diz DS4` | A URL está trocada, ou o LOGSYS ficou errado depois de uma cópia de mandante. Confira a URL; se for o LOGSYS, peça a correção ao Basis. |
| `a URL do SAP precisa ser https://` | Use a porta HTTPS do ICM (ex.: `https://host:44300`). `http://` só é aceito para `localhost`. |
| `NODE_TLS_REJECT_UNAUTHORIZED=0 desliga a verificação TLS` | Remova a variável do ambiente. Para certificado de CA interna, use `NODE_EXTRA_CA_CERTS` (passo 3). |
| `standards/sistemas-sap.json ...` | O registro de restrições tem JSON inválido ou uma entrada sem `sid`/`ambiente` válidos. A mensagem aponta a entrada (`restricoes[n]`). |
| `"vsp" não encontrado` | O binário não foi baixado (passo 2), ou não está no PATH. Abra um terminal novo depois de alterar o PATH, ou defina `VSP_BIN`. |
| `"vsp" não pôde ser executado (EACCES/EPERM)` | O arquivo está bloqueado. No Windows, abra as propriedades do arquivo e marque "Desbloquear". No macOS, rode `xattr -d com.apple.quarantine`. No Linux, rode `chmod +x`. |
| `"vsp --version" terminou com código ...` | O arquivo não é o `vsp` correto, ou é de outra plataforma. Baixe novamente o asset da sua plataforma. |
| `o ARC-1 exige Node.js >= 22.19` | Atualize o Node (passo 1). |
| `arc-1` dá timeout na 1ª vez | A rede está bloqueando o npm. Instale o ARC-1 antes e use `ARC1_BIN`. |
| Servidor falho no `/mcp`, mas o diagnóstico passa | A ferramenta foi aberta fora da raiz do projeto, ou não foi reiniciada após mudar o `.env`. |
| `"...\arc-1.cmd" não pôde ser executado (EINVAL)` | O caminho não aponta para um arquivo executável (pasta ou atalho). Confira `ARC1_BIN`/`VSP_BIN`. |
| `... é um script .cmd/.bat e precisa do cmd.exe, mas ... contém caractere` | O caminho ou um valor de `VSP_*` tem `%`, `!`, `^` ou aspas, que o `cmd.exe` interpretaria. Use o `.exe` ou remova o caractere. |
| `aviso: ... o ARC-1 inicia somente leitura; ... defina ARC1_ALLOW_DEV_WRITES=true` | O `arc-1` aponta para um DEV. Só defina a flag se o cliente não autorizou o `vsp` (política 4.2). |

> Antes de usar `arc-1` ou `vsp` em ambiente de cliente, obtenha o aceite formal do cliente. A política de APIs da SAP classifica as APIs ADT como internas (ver seção 7 da [política](../standards/politica-mcp-abap.md)).
