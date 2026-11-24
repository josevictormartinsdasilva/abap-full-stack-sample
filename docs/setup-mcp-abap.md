# Configuração dos MCPs `vsp` e `arc-1` na máquina

Guia para preparar a máquina de cada desenvolvedor para os servidores `vsp` e `arc-1`, usados em sistemas S/4HANA 2023 ou inferior. As regras de uso estão na [política de MCP ABAP](../standards/politica-mcp-abap.md), e o racional da decisão no [ADR-0009](adr/0009-selecao-de-mcp-abap-por-versao-e-ambiente.md).

| Servidor | Sistema | Modo |
|---|---|---|
| `vsp` | DEV / Sandbox ≤ 2023 (em 2025+, só como [fallback](#fallback-do-abap-adt-em-s4hana-2025)) | Desenvolvimento |
| `arc-1-qas` | QAS ≤ 2023 (em 2025+, só contingência e [fallback de análise](#fallback-de-análise-em-qas-2025)) | Somente leitura |
| — | PRD: **nenhum servidor**, nem para leitura ([ADR-0014](adr/0014-ambiente-produtivo-fora-do-alcance-dos-agentes.md)) | Recusado pelo launcher |
| `arc-1-dev` (opcional) | DEV, o mesmo do `vsp`: exceção da política 4.2 em ≤ 2023 ou 2º fallback em 2025+ | Somente leitura, salvo opt-in |
| `abap-adt` | S/4HANA 2025+ | Ver [Configuração do Token MCP](../README.md#-configuração-do-token-mcp-abap-adt) |

Você **não edita** nenhum arquivo de MCP (`.mcp.json`, `.codex/config.toml` etc.). Eles já vêm gerados com uma entrada por sistema do cliente: `vsp` (DEV), `arc-1-qas` (QAS) e `arc-1-dev` (DEV pelo ARC-1, opcional), todas apontando para `scripts/mcp-launch.mjs`. O projeto é usado com um clone por cliente, e o nome de cada entrada define o prefixo das variáveis no `.env` (`vsp` → `VSP_*`, `arc-1-qas` → `ARC1_QAS_*`, `arc-1-dev` → `ARC1_DEV_*`). Preparar a máquina é só instalar os executáveis, preencher o `.env` e conferir a detecção.

---

## Passo a passo

### Uma vez por máquina

**1. Node.js 22.19 ou superior.** É o mínimo do ARC-1 hoje. Uma versão nova do ARC-1 pode exigir mais; nesse caso o launcher avisa.

```powershell
node -v
```

Se estiver abaixo, instale a versão LTS de [nodejs.org](https://nodejs.org).

**2. Binário do vsp — automático.** Não há passo de instalação. Na primeira execução, o launcher baixa das [releases do vibing-steampunk](https://github.com/oisee/vibing-steampunk/releases) o binário da sua plataforma, sempre na **última release estável** (pré-releases são ignoradas). A cada início ele consulta a versão; quando sai uma nova, baixa uma vez e apaga a anterior do cache.

- **Integridade:** o binário só é usado se o SHA-256 bater com o `checksums.txt` da mesma release. O hash é conferido de novo a cada início.
- **Trava:** antes de iniciar, o launcher confere no `vsp --help` se as flags de segurança que ele usa (`--expect`, `--allowed-packages`, `--block-free-sql` etc.) continuam existindo. Se uma versão nova renomear alguma, ele recusa iniciar.
- **Sem internet:** usa a versão mais nova que já está no cache, com um aviso.
- **Voltar atrás:** se uma release nova quebrar algo, fixe a versão anterior no `.env` com `VSP_VERSION=2.62.1`.

O binário fica num cache do usuário, compartilhado entre projetos:

| Sistema | Pasta |
|---|---|
| Windows | `%LOCALAPPDATA%\abap-full-stack\vsp\<versão>\` |
| Linux | `~/.cache/abap-full-stack/vsp/<versão>/` (ou `$XDG_CACHE_HOME`) |
| macOS | `~/Library/Caches/abap-full-stack/vsp/<versão>/` |

Rode o diagnóstico (passo 7) antes de abrir a ferramenta de IA. Assim o primeiro download acontece fora do tempo limite de inicialização do MCP.

**Rede que bloqueia o GitHub:** baixe manualmente o asset da sua plataforma (ex.: `vsp-windows-amd64.exe`) da [última release](https://github.com/oisee/vibing-steampunk/releases/latest) e defina `VSP_BIN` no `.env` com o caminho completo (passo 4). Com `VSP_BIN` definido, o launcher não baixa nada, mas continua conferindo as flags. O `vsp` que estiver no PATH não é usado.

**3. Certificado HTTPS — só se o SAP usar certificado autoassinado ou de CA interna.** O caso mais comum é o certificado autoassinado que o STRUST gera, com erro `DEPTH_ZERO_SELF_SIGNED_CERT`. O `node scripts/setup.mjs` resolve isso sozinho ([ADR-0013](adr/0013-certificado-fixado-e-tls-do-vsp.md)):

1. Ele baixa o certificado do servidor (só o handshake TLS, sem usuário nem senha) e mostra assunto, SAN, validade e o **SHA-256**.
2. **Confira o SHA-256 com o Basis** (STRUST, PSE "SSL Server Standard") antes de confirmar. É isso que garante que ninguém trocou o certificado no caminho.
3. Confirmado, ele grava o arquivo em `.agents/certs/<servidor>.pem` (não versionado) e `<P>_SAP_CA_CERT` no `.env`. O launcher passa a confiar só nesse certificado para essa conexão, no probe e no `arc-1`. Não é preciso variável global nem reabrir o terminal.
4. Se o servidor não enviar a CA raiz da cadeia, o setup pede o `.pem` dela, que você obtém com o Basis.

**`vsp` com certificado fixado:** o `vsp` é um binário Go. Ele não lê o certificado fixado nem o `NODE_EXTRA_CA_CERTS`, e recusa certificado sem SAN mesmo que confiável. O setup oferece `VSP_SAP_INSECURE=true`: o launcher confere o certificado fixado ao iniciar e só então passa `--insecure` ao `vsp`. Durante a sessão, o `vsp` não verifica o TLS. Use isso até o Basis emitir um certificado com SAN (`DNS:<host>`). Depois, importe a CA em "Autoridades de Certificação Raiz Confiáveis" do usuário no Windows e remova a variável.

**CA corporativa para todos os sistemas:** o `NODE_EXTRA_CA_CERTS` global continua valendo, para o probe e o `arc-1`:

```powershell
[Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', 'C:\certs\ca-cliente.pem', 'User')
```

**ARC-1 — automático.** Também não tem passo de instalação. O launcher instala a **última versão estável** do npm (`arc-1@latest`) num cache do usuário (`%LOCALAPPDATA%\abap-full-stack\arc-1\<versão>\`, ou `~/.cache`/`~/Library/Caches` no Linux/macOS) e a executa com o Node da máquina. A cada início ele consulta a versão (cerca de 3 s); quando sai uma nova, instala uma vez e apaga a anterior.

- **Integridade:** o `npm install` confere cada pacote pelo hash do registry e usa o registry e o proxy configurados no npm da máquina.
- **Trava:** antes de iniciar, o launcher confere se a versão instalada ainda reconhece as variáveis de segurança que ele define (`SAP_ALLOW_WRITES`, `SAP_DENY_ACTIONS`, `SAP_ALLOW_FREE_SQL` etc.) e se o Node atende ao `engines` dela. Se não, recusa iniciar.
- **Sem acesso ao npm:** usa a versão mais nova que já está no cache, com um aviso.
- **Voltar atrás:** fixe uma versão no `.env` com `ARC1_VERSION=1.10.1`.

A primeira instalação leva cerca de 30 s. Rode o diagnóstico (passo 7) antes de abrir a ferramenta de IA.

### Uma vez por projeto / cliente

> **Atalho:** `node scripts/setup.mjs` faz os passos 4 a 7 (pede a conexão, detecta o sistema e grava o `.env`) e, no fim, roda `node scripts/doctor.mjs`. Os passos abaixo valem para a configuração manual e para entender o que o assistente grava.

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

**6. Preencher a conexão do QAS (`arc-1-qas`):**

```ini
ARC1_QAS_SAP_URL=https://qs4.cliente.com.br:44300
ARC1_QAS_SAP_CLIENT=400
ARC1_QAS_SAP_USER=USUARIO_LEITURA
ARC1_QAS_SAP_PASSWORD=...
```

Informe só a conexão. SID, release e ambiente são **detectados no próprio SAP**: o nome da entrada é só um rótulo, e se a URL de `arc-1-qas` apontar para um DEV, vale o DEV. **Não configure o PRD:** nenhum servidor acessa o ambiente produtivo, e o launcher recusa qualquer conexão detectada como PRD, qualquer que seja o nome da entrada ([ADR-0014](adr/0014-ambiente-produtivo-fora-do-alcance-dos-agentes.md)). A conexão `ARC1_DEV_*` (`arc-1-dev`) é opcional e só precisa ser preenchida para a exceção da política 4.2 ou para o 2º fallback em 2025+ (ver [Fallback](#fallback-do-abap-adt-em-s4hana-2025)). Se o cliente não tiver um dos sistemas, ou você não for usar o `arc-1` nele, deixe as variáveis dele com o placeholder: o servidor aparece como falho no `/mcp`, o que é esperado.

**7. Testar a detecção:**

```powershell
node scripts/mcp-launch.mjs vsp --diagnostico
node scripts/mcp-launch.mjs arc-1-qas --diagnostico
```

Resultado esperado:

```
mcp-launch: baixando vsp v2.62.1 (vsp-windows-amd64.exe)
mcp-launch: vsp v2.62.1 salvo em C:\Users\...\AppData\Local\abap-full-stack\vsp\2.62.1\vsp.exe
mcp-launch: vsp encontrado: vsp version v2.62.1 (...)
mcp-launch: vsp -> DS4/110 · S/4HANA 2023 · DEV (mandante de customizing ...) · desenvolvimento
mcp-launch: arc-1-qas -> QS4/400 · S/4HANA 2023 · QAS (mandante de teste ...) · somente leitura
```

Antes de conectar ao SAP, o diagnóstico confere os executáveis: o binário do `vsp` (baixado e conferido pelo SHA-256, ou o `VSP_BIN`) e as flags de segurança dele, e o ARC-1 (instalado pelo npm, ou o `ARC1_BIN`) com as variáveis de segurança e o Node exigido. Se faltar algo, ele para com a indicação do passo deste guia que resolve.

Confira se SID, produto e ambiente estão corretos. Se aparecer uma recusa, veja a seção [Problemas comuns](#problemas-comuns).

### Toda vez que for usar

**8. Abrir a ferramenta e conferir as conexões.**

1. Abra a ferramenta de IA **na raiz do projeto**. O launcher é chamado por caminho relativo (`scripts/mcp-launch.mjs`) e não é encontrado se o servidor for iniciado em outra pasta (ver [Diretório de trabalho por ferramenta](#diretório-de-trabalho-por-ferramenta)).
2. Rode `/mcp` (Claude Code). Devem aparecer conectados o `fiori-mcp` e os servidores que você configurou (`vsp` e/ou `arc-1-qas`; `abap-adt` só se houver S/4HANA 2025+). Um servidor não configurado aparece como falho, o que é esperado.

Se você alterar o `.env`, reinicie a ferramenta: os servidores só são iniciados na abertura da sessão.

---

## Variáveis opcionais

As variáveis de conexão e de comportamento usam o prefixo da entrada: `VSP`, `ARC1_QAS`, `ARC1_DEV`. Na tabela, `ARC1_*` vale para qualquer entrada `arc-1-*` (ex.: `ARC1_QAS_SAP_SID`). `VSP_BIN`, `VSP_VERSION`, `ARC1_BIN` e `ARC1_VERSION` são as únicas sem prefixo por entrada: valem para todas.

| Variável | Para quê |
|---|---|
| `VSP_SAP_SID` / `ARC1_SAP_SID` | Conferência: se o SID detectado for diferente, o launcher recusa iniciar. Pega URL trocada. |
| `VSP_ALLOWED_TRANSPORTS=DS4K*` | Permite ao `vsp` editar objetos em pacotes transportáveis, só nas requests do padrão informado. |
| `VSP_ENABLE_TRANSPORTS=true` | Permite ao `vsp` criar e liberar requests. Use só quando necessário. |
| `VSP_READ_ONLY=true` | Usa o `vsp` no DEV apenas para análise. |
| `VSP_BIN` | Caminho de um `vsp` baixado manualmente, para redes que bloqueiam o GitHub. Com ela, o launcher não baixa o binário e não confere o hash, mas confere as flags de segurança. |
| `VSP_VERSION` | Fixa uma versão do `vsp` (ex.: `2.62.1`) em vez da última estável. Use para voltar atrás quando uma release nova quebrar algo. Um `.cmd`/`.bat` também é aceito, desde que o caminho e os valores das variáveis `VSP_*` não tenham `%`, `!`, `^` ou aspas. |
| `ARC1_BIN` | Caminho de um ARC-1 já instalado, para redes que bloqueiam o npm. Instale com `npm install -g arc-1`. No Windows, o `npm` instala um `arc-1.cmd`, que pode ser usado aqui. Com ela, o launcher não instala nem confere o pacote. |
| `ARC1_VERSION` | Fixa uma versão do ARC-1 (ex.: `1.10.1`) em vez da última estável. Use para voltar atrás quando uma versão nova quebrar algo. |
| `ARC1_DEV_ALLOW_DEV_WRITES=true` + `ARC1_DEV_ALLOWED_PACKAGES=Z*` | Exceção controlada da política (4.2): habilita a escrita do `arc-1` num DEV/SANDBOX ≤ 2023, restrita aos pacotes informados. Vale na entrada `arc-1-dev`, que já vem no template. Sem a flag, o `arc-1` no DEV fica somente leitura e não pede pacotes. |
| `VSP_FALLBACK_2025=true` / `ARC1_DEV_FALLBACK_2025=true` | Fallback do `abap-adt` num DEV/SANDBOX S/4HANA 2025+ (política 4.4), quando ele não oferecer uma operação de desenvolvimento. No `arc-1`, vale na entrada `arc-1-dev` e exige também `ARC1_DEV_ALLOW_DEV_WRITES=true` e `ARC1_DEV_ALLOWED_PACKAGES`. Ignorada fora de DEV/SANDBOX. Ligue só quando necessário e reinicie a sessão da ferramenta de IA. |
| `ARC1_BLOCKED_DATA_SOURCES` | Tabelas a bloquear na leitura (experimental). Ex.: `USR02,PA0002`. |

---

## Diretório de trabalho por ferramenta

As configurações geradas chamam `node scripts/mcp-launch.mjs <servidor>` com caminho **relativo**. Ele só funciona se a ferramenta iniciar o servidor com a raiz do projeto como diretório de trabalho. Levantamento feito em 2026-11-19 na documentação de cada ferramenta:

| Ferramenta | Diretório do servidor stdio | Recurso para fixar a raiz | Situação |
|---|---|---|---|
| Claude Code (`.mcp.json`) | Não documentado | `CLAUDE_PROJECT_DIR` existe no ambiente do servidor, mas não pode ser usado em `args` (a expansão acontece antes e exige um padrão, ex.: `${CLAUDE_PROJECT_DIR:-.}`) | Abrir na raiz |
| Codex (`.codex/config.toml`) | Não documentado. O Codex carrega todo `.codex/config.toml` entre a raiz do Git e a pasta atual, então a config **é** lida numa subpasta | Campo `cwd`, mas sem regra documentada para caminho relativo | Abrir na raiz |
| Kimi Code (`.kimi-code/mcp.json`) | Não documentado | Campo `cwd`, sem regra documentada para caminho relativo | O `.kimi-code/mcp.json` só é lido na pasta atual: numa subpasta, os servidores nem aparecem. Abrir na raiz |
| Antigravity (`.agents/mcp_config.json`) | Não documentado | Campo `cwd`, sem variável para a pasta do workspace | Abrir na raiz (workspace = raiz do projeto) |

Nenhuma ferramenta documenta um jeito portátil (sem caminho absoluto da máquina) de apontar para a raiz. Por isso as configurações continuam com caminho relativo, e a regra é **abrir a ferramenta na raiz do projeto**. Testes em cada ferramenta com sessão aberta numa subpasta (ex.: a de um app Fiori) ainda não foram feitos. Ao fazê-los, registre o resultado nesta tabela.

---

## Validações pendentes

O launcher é coberto por testes automatizados (`node --test scripts/test/*.test.mjs`). Contra ambientes reais, já foi validado:

- **2026-11-19, `vsp` num DEV S/4HANA 2023 (SAP_BASIS 758):** ambiente `DEV`, modo desenvolvimento, SID lido do `systeminformation`. O teste revelou e corrigiu o erro `406` na leitura da T000 em releases ≤ 2023.
- **2026-11-19, download e cache (Windows):** `vsp` v2.62.1 baixado do GitHub, com `VSP_VERSION=2.61.0` testado; ARC-1 v1.10.1 instalado pelo npm.

Falta, antes de levar a `develop` para a `main`:

1. **ARC-1 no DEV ≤ 2023:** `node scripts/mcp-launch.mjs arc-1-dev --diagnostico`, com `ARC1_DEV_*` apontando para o DEV. Conferir SID, `sidOrigem`, produto, ambiente `DEV`, modo, e `acoesNegadas` só com `SAPWrite.delete`.
2. **QAS ≤ 2023:** `node scripts/mcp-launch.mjs arc-1-qas --diagnostico`. Conferir ambiente `QAS`, modo somente leitura e `acoesNegadas` com `SAPDiagnose.unittest` e `SAPDiagnose.unittest_ci`.
3. **Subpasta:** em cada ferramenta, abrir a sessão numa subpasta e registrar o resultado na tabela da seção anterior.

**Versões novas do ARC-1 e do vsp** entram sozinhas (última estável). Se uma delas renomear uma ação negada (`ARC1_NEGADAS_*` em `scripts/mcp-politica.mjs`, conferidas em `dist/authz/policy.js`), o próprio ARC-1 recusa iniciar com o nome desconhecido. Se renomear uma variável ou flag de segurança, o launcher recusa. Nos dois casos, fixe a versão anterior (`ARC1_VERSION`/`VSP_VERSION`) e ajuste o launcher por PR.

---

## Autorizações SAP dos usuários

| Usuário | Precisa de |
|---|---|
| Ambos | Acesso ao ADT: serviço ICF `/sap/bc/adt` ativo e autorizações de desenvolvedor ADT. |
| Ambos | Data preview na `T000`, usado na detecção do ambiente. Sem ela, o sistema é tratado como **PRD**, e o launcher recusa os dois servidores. |
| `vsp` (DEV) | Autorizações de desenvolvimento, restritas aos pacotes do projeto. |
| `arc-1-qas` | Somente leitura. O launcher já força leitura, mas a autorização SAP é a segunda barreira. |

---

## Fallback do `abap-adt` em S/4HANA 2025+

Num sistema 2025+, o servidor é o `abap-adt`. Se ele **não oferecer** uma operação de desenvolvimento (por exemplo, um tipo de objeto que a SAP ainda não entregou no MCP oficial), a [política, seção 4.4](../standards/politica-mcp-abap.md) define a cadeia `abap-adt` → `vsp` → `arc-1` → execução manual. Ela vale só em DEV/SANDBOX. No QAS não há fallback de desenvolvimento, e o PRD não é acessado.

O `vsp` e o `arc-1` ficam **desligados por padrão** num sistema 2025+ (opt-in): o `vsp` recusa iniciar e o `arc-1` sobe somente leitura. Só sobem como fallback quando você liga a variável.

**Quando usar:** só quando o orquestrador mostrar que o `abap-adt` não oferece a operação. Antes de propor o fallback, ele apresenta a evidência (a ferramenta consultada ou a mensagem de erro literal) e o sinal correspondente na tabela da política, seção 4.4. Confira a evidência antes de confirmar. Erro de sintaxe, objeto bloqueado, falta de autorização, request inválida ou timeout não são motivo para ligar o fallback.

**Passo a passo:**

1. **Ligue o `vsp`.** No `.env`, aponte as variáveis `VSP_*` para o **mesmo DEV** do `abap-adt` e acrescente:

   ```env
   VSP_FALLBACK_2025=true
   ```

2. **Teste** e confira se o SID é o do DEV e se o modo é `desenvolvimento (fallback do abap-adt)`:

   ```powershell
   node scripts/mcp-launch.mjs vsp --diagnostico
   ```

3. **Reinicie a sessão** da ferramenta de IA e confira com `/mcp` que o `vsp` conectou. Peça de novo a operação. O orquestrador usa o `vsp` só para ela; o restante, inclusive o ATC, continua no `abap-adt`.
4. **Se o `vsp` também não atender, use o `arc-1` no DEV.** Use a entrada `arc-1-dev`, que já vem no template (a `arc-1-qas` aponta para outro sistema). Preencha `ARC1_DEV_SAP_*` com o **mesmo DEV** e descomente as variáveis abaixo. Repita os passos 2 e 3 com `arc-1-dev`. O modo esperado é `escrita restrita a pacotes (fallback do abap-adt)`.

   ```env
   ARC1_DEV_FALLBACK_2025=true
   ARC1_DEV_ALLOW_DEV_WRITES=true
   ARC1_DEV_ALLOWED_PACKAGES=Z*
   ```

5. **Se nenhum atender,** o orquestrador informa o que faltou e, se você autorizar, entrega o código e o passo a passo para criar o objeto no ADT (Eclipse). Depois que você criar e ativar, ele confere o objeto pelo `abap-adt`, e o ATC roda normalmente.
6. **Ao terminar, desligue** as variáveis (comente as linhas no `.env`) e reinicie a sessão.

**Qual conexão usar no dia a dia:** o projeto é usado com um clone por cliente/desenvolvimento. O cliente tem um DEV e pode ter QAS. O PRD não é acessado (ADR-0014). Num cliente 2025+:

| Sistema | Servidor no dia a dia | Contingência / fallback | Entrada |
|---|---|---|---|
| DEV | `abap-adt` | `vsp` como fallback de desenvolvimento (flag) | `vsp` (padrão) |
| QAS | `abap-adt` (leitura) | `arc-1` só leitura, se o `abap-adt` cair ou não oferecer a análise (opcional) | `arc-1-qas` |
| PRD | — | — (nenhum servidor, nem para leitura) | — |
| DEV (raro) | — | `arc-1` como 2º fallback, se o `vsp` não atender | `arc-1-dev` |

- **Use a entrada `vsp`** que já vem no template. Deixe `VSP_*` apontando de vez para o DEV do cliente, com `VSP_FALLBACK_2025=true` comentado. Para usar, descomente essa linha e reinicie a sessão.
- **`arc-1-qas`** também já vem no template. Preencha-a só se quiser a contingência de análise. A `arc-1-dev` também já vem no template: preencha `ARC1_DEV_*` só se o `vsp` não atender. Nomeie pelo sistema, não como "fallback": o papel de fallback vem da detecção do release e da flag.
- **Use o seu próprio usuário SAP de desenvolvimento**, não um usuário técnico compartilhado. Assim, as alterações ficam registradas no seu nome, como no Eclipse. Restrinja as autorizações aos pacotes do projeto.
- **Defina `<P>_SAP_SID`** com o SID do DEV 2025, para o launcher recusar se a URL estiver trocada. Esse SID precisa ser o mesmo de `cliente.sistemaDesenvolvimento` em `standards/naming-conventions.json`.

> Usar `vsp`/`arc-1` num sistema de cliente exige aceite formal do cliente (política, seção 7). Decisão registrada no [ADR-0011](adr/0011-fallback-de-desenvolvimento-em-s4hana-2025.md).

### Fallback de análise em QAS 2025+

Num QAS 2025+, a análise é feita pelo `abap-adt`. Se ele estiver no ar, mas **não oferecer** a operação de análise pedida (por exemplo, dumps, traces ou onde-usado), a [política, seção 4.5](../standards/politica-mcp-abap.md) permite usar o `arc-1` **somente leitura** no mesmo sistema. Se o `arc-1` também não atender, o orquestrador para e informa. O `vsp` nunca é usado no QAS.

- **Não há flag para ligar.** Basta a entrada `arc-1-qas` estar preenchida (`ARC1_QAS_*`). No QAS, o launcher sempre sobe o `arc-1` somente leitura, com ABAP Unit negado e sem prévia de dados nem SQL livre.
- **Mesma evidência do fallback de desenvolvimento:** antes de trocar de servidor, o orquestrador mostra a operação, a ferramenta consultada ou o erro literal e o sinal da tabela da seção 4.4, e espera a sua confirmação. Indisponibilidade do `abap-adt` não é lacuna: aí vale a contingência normal.
- **Mesmo sistema:** confira em `node scripts/mcp-runtime.mjs` se o SID e o mandante do `arc-1` são os do sistema consultado pelo `abap-adt`.
- **Dados:** dumps e traces podem conter dados de negócio. Considere a LGPD antes de ler esses dados num sistema de cliente (política, seção 7).

> Decisão registrada no [ADR-0012](adr/0012-fallback-de-analise-em-qas-prd-s4hana-2025.md), restrita ao QAS pelo [ADR-0014](adr/0014-ambiente-produtivo-fora-do-alcance-dos-agentes.md). No PRD não há fallback, porque nenhum servidor o acessa. Usar o `arc-1` num sistema de cliente também exige aceite formal do cliente.

---

## Vários sistemas do mesmo tipo

O template já traz uma entrada por sistema do cliente: `vsp` (DEV), `arc-1-qas` e `arc-1-dev`. Para uma conexão a mais, por exemplo um sandbox além do DEV (`vsp-sandbox`):

1. Em `.agents/mcp.servers.json`, acrescente a entrada:

   ```json
   "vsp-sandbox": { "transport": "stdio", "command": "node", "args": ["scripts/mcp-launch.mjs", "vsp-sandbox"], "timeoutSec": 120 }
   ```

2. Rode `node scripts/sync-agents.mjs` e faça commit.
3. No `.env`, use o prefixo derivado do nome da entrada: `VSP_SANDBOX_SAP_URL`, `VSP_SANDBOX_SAP_CLIENT` etc.

O nome define o prefixo: o que vem depois de `arc-1` ou `vsp` vira sufixo em maiúsculas (`arc-1-dev` → `ARC1_DEV_*`, `vsp-sandbox` → `VSP_SANDBOX_*`).

---

## macOS / Linux

As etapas são as mesmas, com três diferenças:

- **vsp:** o download também é automático (cache em `~/.cache` no Linux e `~/Library/Caches` no macOS). Com `VSP_BIN`, dê `chmod +x` no arquivo baixado manualmente.
- **Variáveis de ambiente:** use `export` no `~/.zshrc`. Exemplo: `export NODE_EXTRA_CA_CERTS=~/certs/ca-cliente.pem`.
- **Adaptadores:** gere a variante Unix localmente com `node scripts/sync-agents.mjs --platform=unix`. **Não faça commit** dessa variante: os arquivos versionados usam `cmd /c`, que só existe no Windows.

---

## Problemas comuns

Todas as mensagens do launcher começam com `mcp-launch:`. Para vê-las, rode o diagnóstico do passo 7.

| Mensagem | Causa e solução |
|---|---|
| `variável VSP_SAP_URL não definida` | `.env` ausente ou incompleto. Refaça os passos 4 a 6. |
| `logon recusado (401)` | Usuário ou senha errados, ou usuário bloqueado no SAP. |
| `fetch failed` / erro de certificado | URL ou porta erradas, VPN desligada, ou certificado autoassinado ou de CA interna. Ver passo 3. |
| `DEPTH_ZERO_SELF_SIGNED_CERT` ou `SELF_SIGNED_CERT_IN_CHAIN` | Certificado autoassinado (padrão do STRUST). Rode `node scripts/setup.mjs` e fixe o certificado (passo 3). Não há CA a pedir ao Basis. |
| `O certificado do servidor não confere com <P>_SAP_CA_CERT` | O certificado foi renovado no STRUST, ou a conexão está sendo interceptada. Confira o SHA-256 com o Basis e fixe de novo com `node scripts/setup.mjs --apenas=dev` (ou `qas`). |
| `vsp`: `x509: certificate signed by unknown authority` ou `relies on legacy Common Name field` | O `vsp` (Go) não usa o certificado fixado e recusa certificado sem SAN. Ver "`vsp` com certificado fixado" no passo 3. |
| `T000 ilegível ... tratado como PRD` / `recusado: ... é PRD` | Se o sistema não for produtivo, o usuário não tem autorização de data preview na T000: peça-a ao time de segurança SAP. Se for o PRD, é o esperado: nenhum servidor acessa o ambiente produtivo (ADR-0014). |
| `vsp recusado: ... é QAS` | A URL do `vsp` aponta para um QAS, ou o mandante do DEV não está como customizing (`C`) na SCC4. |
| `o sistema conectado é QS4, mas VSP_SAP_SID diz DS4` | A URL está trocada. Corrija `VSP_SAP_URL`. |
| `vsp recusado: SAP_BASIS 816 ... é servido pelo abap-adt` | É um S/4HANA 2025. Use o `abap-adt` (MCP oficial). Só para uma operação de desenvolvimento que ele não ofereça, defina `VSP_FALLBACK_2025=true` (política 4.4). |
| `recusado: SAP_BASIS 702 ... fora do escopo` | Release anterior ao NW 7.50. A política não cobre esse sistema (regra absoluta 5). |
| `vsp recusado: o SID DS4 veio do T000-LOGSYS` | O release não informa o SID pelo ADT. Se o SID estiver certo, defina `VSP_SAP_SID=DS4`. Sem isso, o `arc-1` também só inicia em leitura. |
| `o T000-LOGSYS indica o SID QS4, mas VSP_SAP_SID diz DS4` | A URL está trocada, ou o LOGSYS ficou errado depois de uma cópia de mandante. Confira a URL; se for o LOGSYS, peça a correção ao Basis. |
| `a URL do SAP precisa ser https://` | Use a porta HTTPS do ICM (ex.: `https://host:44300`). `http://` só é aceito para `localhost`. |
| `NODE_TLS_REJECT_UNAUTHORIZED=0 desliga a verificação TLS` | Remova a variável do ambiente. Para certificado autoassinado ou de CA interna, fixe o certificado pelo setup (passo 3). |
| `standards/sistemas-sap.json ...` | O registro de restrições tem JSON inválido ou uma entrada sem `sid`/`ambiente` válidos. A mensagem aponta a entrada (`restricoes[n]`). |
| `não foi possível baixar .../vsp-...` | A rede bloqueou o GitHub ou exige proxy (o download do launcher não usa proxy). Baixe o arquivo manualmente e defina `VSP_BIN` (passo 2). |
| `não foi possível consultar a última versão do vsp ... e não há versão no cache` | Primeiro uso sem acesso ao GitHub. Baixe o arquivo manualmente e defina `VSP_BIN` (passo 2). |
| `aviso: não foi possível consultar a última versão do vsp ...; usando a vX do cache` | Sem acesso ao GitHub no momento. O launcher seguiu com a versão já baixada. |
| `o download de vsp-... não confere com o checksums.txt da release` | O arquivo recebido não é o publicado na release (proxy que altera o conteúdo, por exemplo). Nada foi gravado. Tente de novo; se persistir, avise quem mantém o projeto. |
| `a release vX do vsp não tem vsp-... no checksums.txt` | A release nova não publicou o binário da sua plataforma. Fixe a versão anterior com `VSP_VERSION`. |
| `o vsp em uso (...) não tem as flags ...` | A versão nova renomeou ou removeu uma flag que o launcher usa para aplicar a política. Fixe a versão anterior com `VSP_VERSION` e avise quem mantém o projeto, para ajustar `scripts/mcp-politica.mjs`. |
| `"...\vsp.exe" não encontrado` | O caminho em `VSP_BIN` está errado. Corrija-o ou remova a variável para usar o download automático. |
| `"vsp" não pôde ser executado (EACCES/EPERM)` | O arquivo está bloqueado. No Windows, abra as propriedades do arquivo e marque "Desbloquear". No macOS, rode `xattr -d com.apple.quarantine`. No Linux, rode `chmod +x`. |
| `"vsp --version" terminou com código ...` | O arquivo em `VSP_BIN` não é o `vsp` correto, ou é de outra plataforma. Baixe novamente o asset da sua plataforma ou remova `VSP_BIN`. |
| `o ARC-1 vX exige Node.js >=...` | A versão nova do ARC-1 pede um Node mais recente. Atualize o Node (passo 1) ou fixe a versão anterior com `ARC1_VERSION`. |
| `não foi possível consultar a última versão do ARC-1 no npm ... e não há versão no cache` | Primeiro uso sem acesso ao npm. Confira o registry e o proxy do npm (`npm config get registry`) ou instale o ARC-1 manualmente e use `ARC1_BIN`. |
| `aviso: não foi possível consultar a última versão do ARC-1 ...; usando a vX do cache` | Sem acesso ao npm no momento. O launcher seguiu com a versão já instalada. |
| `não foi possível instalar o ARC-1 vX` | O `npm install` falhou. A mensagem traz o fim do erro do npm (rede, proxy, registry ou compilação do `better-sqlite3`). Para contornar, use `ARC1_BIN`. |
| `o ARC-1 vX não reconhece SAP_...` | A versão nova renomeou ou removeu uma variável que o launcher usa para aplicar a política. Fixe a versão anterior com `ARC1_VERSION` e avise quem mantém o projeto, para ajustar `scripts/mcp-politica.mjs`. |
| `arc-1-*` dá timeout na 1ª vez | A primeira instalação (ou a de uma versão nova) passou do tempo limite da ferramenta de IA. Rode `node scripts/mcp-launch.mjs arc-1-qas --diagnostico` uma vez no terminal e reabra a ferramenta. |
| Servidor falho no `/mcp`, mas o diagnóstico passa | A ferramenta foi aberta fora da raiz do projeto, ou não foi reiniciada após mudar o `.env`. |
| `"...\arc-1.cmd" não pôde ser executado (EINVAL)` | O caminho não aponta para um arquivo executável (pasta ou atalho). Confira `ARC1_BIN`/`VSP_BIN`. |
| `... é um script .cmd/.bat e precisa do cmd.exe, mas ... contém caractere` | O caminho ou um valor de `VSP_*` tem `%`, `!`, `^` ou aspas, que o `cmd.exe` interpretaria. Use o `.exe` ou remova o caractere. |
| `aviso: ... o ARC-1 inicia somente leitura; ... defina ARC1_..._ALLOW_DEV_WRITES=true` | A entrada `arc-1-*` aponta para um DEV. Se for a `arc-1-qas`, a URL está trocada. Só defina a flag se o cliente não autorizou o `vsp` (política 4.2). |

> Antes de usar `arc-1` ou `vsp` em ambiente de cliente, obtenha o aceite formal do cliente. A política de APIs da SAP classifica as APIs ADT como internas (ver seção 7 da [política](../standards/politica-mcp-abap.md)).
