# Plano de correções — launcher MCP ABAP e documentação

> **Status:** pendente de implementação
> **Origem:** análise do repositório em 2026-11-18 (branch `feature/politica-mcp-abap`, commit `7651085`)
> **Escopo:** `scripts/mcp-launch.mjs`, `scripts/sap-probe.mjs`, `scripts/sync-agents.mjs`, `.agents/mcp.servers.json`, `standards/politica-mcp-abap.md`, ADR-0009 e documentação relacionada.

Os achados estão agrupados em três blocos, um PR por bloco, na ordem de implementação. Cada item informa a situação atual, a correção proposta e o critério de aceite. Os números de linha valem para o commit `7651085`.

Situação no momento da análise: `node scripts/sync-agents.mjs --check` passa (22 arquivos gerados conferem). Nada foi testado contra um SAP real.

---

## Bloco 1 — Segurança do launcher (prioridade alta)

Itens em que uma trava da política pode ser contornada. Este PR inclui os testes automatizados (item 1.7).

### 1.1 Restrições do `sistemas-sap.json` ignoradas sem aviso

- **Onde:** `scripts/mcp-launch.mjs:139-149`
- **Situação atual:**
  - Uma entrada sem `mandante` nunca é aplicada: o código compara `String(undefined).padStart(3, "0")` (`"undefined"`) com o mandante.
  - Uma entrada com `<` ou `>` em qualquer campo, inclusive `observacao`, é descartada pelo teste `PLACEHOLDER.test(JSON.stringify(r))`.
  - JSON malformado gera exceção não tratada (stack trace) em vez de mensagem clara.
  - Contradiz a garantia de que "uma entrada só restringe".
- **Correção:**
  - Validar o esquema de cada entrada (`sid` e `ambiente` obrigatórios; `ambiente` em DEV/SANDBOX/QAS/PRD).
  - Sem `mandante`, a restrição vale para todos os mandantes do SID.
  - Aplicar o filtro de placeholder só a `sid`, `mandante` e `ambiente`.
  - Entrada inválida ou JSON malformado: recusar iniciar, com mensagem que aponte a entrada.
- **Aceite:** testes cobrindo entrada sem mandante, `observacao` com `<...>`, JSON inválido e ambiente fora da enumeração.

### 1.2 SID tirado do `LOGSYS` tratado como confirmado

- **Onde:** `scripts/sap-probe.mjs:140`, `scripts/mcp-launch.mjs:128-130` e `:202`
- **Situação atual:** quando `systeminformation` não retorna o SID, ele é inferido de `T000-LOGSYS` (`<SID>CLNT<nnn>`). Isso é só uma convenção, e depois de uma cópia de mandante o `LOGSYS` costuma vir errado. Com SID errado:
  - o registro de restrições não encontra a entrada (combina com o 1.1);
  - o `--expect` do vsp recebe o SID errado;
  - o arquivo de runtime grava `sidConfirmado: true`.
- **Correção:**
  - O probe passa a informar a origem do SID (`systeminformation` ou `logsys`).
  - SID vindo do `LOGSYS` → `sidConfirmado: false`.
  - Nesse caso, exigir `<P>_SAP_SID` igual ao inferido; sem ele, vsp recusa e ARC-1 inicia somente leitura.
- **Aceite:** testes com `LOGSYS` válido, inválido e divergente do SID declarado.

### 1.3 TLS pode ser desligado pelo ambiente herdado

- **Onde:** `scripts/mcp-launch.mjs:155-159` (filtro do `childEnv`) e o próprio processo do launcher (probe)
- **Situação atual:** o filtro remove só `SAP_*`, `ARC1_*`, `VSP_*` e `ABAP_ADT_TOKEN`. `NODE_TLS_REJECT_UNAUTHORIZED=0` afeta o probe e é repassado ao ARC-1; `NODE_OPTIONS` também passa. Contradiz o "TLS nunca é desligado" da política.
- **Correção:**
  - Recusar iniciar se `NODE_TLS_REJECT_UNAUTHORIZED` for `0`, citando `NODE_EXTRA_CA_CERTS` como alternativa.
  - Não repassar `NODE_OPTIONS` nem `NODE_TLS_REJECT_UNAUTHORIZED` ao processo filho.
- **Aceite:** launcher com `NODE_TLS_REJECT_UNAUTHORIZED=0` recusa iniciar com mensagem clara.

### 1.4 URL `http://` aceita

- **Onde:** `scripts/sap-probe.mjs` (classe `Sessao`), `scripts/mcp-launch.mjs:91`
- **Situação atual:** a autenticação Basic (usuário e senha) trafega em texto claro se a URL for `http://`.
- **Correção:** exigir `https://`, exceto para `localhost`/`127.0.0.1`.
- **Aceite:** URL `http://host-remoto` recusa iniciar; `http://localhost` continua aceita.

### 1.5 ARC-1 não recusa SAP_BASIS < 750

- **Onde:** `scripts/mcp-launch.mjs:163-165`
- **Situação atual:** `writes = isDev && basis < 816` não tem limite inferior. Num DEV com release 7.02, o ARC-1 inicia com escrita habilitada. A política (regra absoluta 5) manda não prosseguir. O vsp já faz a checagem (`:189`).
- **Correção:** checagem comum de release, antes da decisão por ferramenta: `basis < 750` → recusar, para os dois servidores.
- **Aceite:** teste com SAP_BASIS 702 recusando ARC-1 e vsp.

### 1.6 Ambiente desconhecido aceito por `maisRestritivo`

- **Onde:** `scripts/sap-probe.mjs:21`
- **Situação atual:** `maisRestritivo("DEV", "HOMOLOG")` retorna `"HOMOLOG"`. Não libera nada (`isDev` fica falso), mas grava um valor fora da enumeração no runtime.
- **Correção:** valor desconhecido → tratar como `PRD` (falha fechada), ou lançar erro; a validação do 1.1 já barra no registro.
- **Aceite:** teste unitário de `maisRestritivo` com valor fora da enumeração.

### 1.7 Testes automatizados das travas

- **Situação atual:** não há testes para `classificar`, `maisRestritivo`, `lerDataPreview` nem para as decisões do launcher. A CI (`.github/workflows/sync-agents.yml`) só roda `--check`.
- **Correção:**
  - Testes com `node:test` (sem dependências), por exemplo em `scripts/test/`.
  - Extrair a decisão do launcher (ambiente efetivo, modo, argumentos e variáveis do filho) para uma função pura testável, separada do I/O.
  - Adicionar o passo `node --test scripts/test/` na CI.
- **Aceite:** CI roda os testes; todos os casos dos itens 1.1 a 1.6 cobertos, mais a tabela de classificação da seção 2 da política.

---

## Bloco 2 — Operação e robustez (prioridade média)

### 2.1 Escrita do ARC-1 em DEV liga automaticamente

- **Onde:** `scripts/mcp-launch.mjs:163-177`
- **Situação atual:**
  - A política (4.2) chama isso de "exceção controlada", mas não há opt-in: basta o ARC-1 apontar para um DEV.
  - Um analista que aponta o ARC-1 para o DEV só para leitura não consegue iniciar sem `ARC1_ALLOWED_PACKAGES` (`req` falha).
- **Correção:** nova variável `<P>_ALLOW_DEV_WRITES=true`. Sem ela, ARC-1 em DEV inicia somente leitura e não exige pacotes. Atualizar `.env.example`, política 4.2 e `docs/setup-mcp-abap.md`.
- **Aceite:** ARC-1 em DEV sem a flag → somente leitura; com a flag e sem pacotes → recusa.

### 2.2 Regras da política só como instrução ao agente

- **Onde:** `scripts/mcp-launch.mjs:176` (`SAP_DENY_ACTIONS`)
- **Situação atual:** "ABAP Unit nunca em PRD" (política 4.2) depende só do prompt.
- **Correção:** quando o ambiente efetivo for PRD, acrescentar as ações de unit test do ARC-1 a `SAP_DENY_ACTIONS`. **Antes**, confirmar o nome exato da ação na versão fixada (`arc-1@1.10.1`). Levantar outras regras da política que possam virar trava técnica.
- **Aceite:** em PRD, a ação de unit test aparece negada no diagnóstico.

### 2.3 Servidor `vsp` sem `timeoutSec`

- **Onde:** `.agents/mcp.servers.json` (entrada `vsp`)
- **Situação atual:** o launcher faz até 3 requisições de 20 s e um `vsp --version` de 15 s antes de responder. Codex e Kimi usam o timeout padrão de inicialização (curto; no Codex, 10 s), então o vsp tende a falhar na partida.
- **Correção:** `"timeoutSec": 120` e regenerar com `node scripts/sync-agents.mjs`.
- **Aceite:** `.codex/config.toml` e `.kimi-code/mcp.json` gerados com o timeout do vsp.

### 2.4 `ARC1_BIN`/`VSP_BIN` como `.cmd`/`.bat` no Windows

- **Onde:** `scripts/mcp-launch.mjs:100-106` e `:214`
- **Situação atual:** `spawn`/`spawnSync` sem `shell` falham com `EINVAL` para `.cmd`/`.bat` (Node ≥ 18.20.2 / 20.12.2). A mensagem atual sugere "Desbloquear o arquivo", o que engana.
- **Correção:** detectar a extensão e executar com `shell: true` (argumentos fixos e sem dados do usuário além do caminho, que deve ser citado), ou dar mensagem específica para `EINVAL`.
- **Aceite:** `VSP_BIN` apontando para um `.cmd` inicia ou recebe mensagem correta.

### 2.5 Caminho relativo `scripts/mcp-launch.mjs` nas configs MCP

- **Onde:** `.agents/mcp.servers.json` e todos os gerados (`.mcp.json`, `.codex/config.toml`, `.kimi-code/mcp.json`, `.agents/mcp_config.json`)
- **Situação atual:** depende do diretório de trabalho da ferramenta. Uma sessão iniciada numa subpasta (por exemplo, a de um app Fiori) quebra o arc-1 e o vsp.
- **Correção:** verificar o comportamento de cada ferramenta. Onde houver suporte, gerar `cwd` (Codex) ou caminho baseado na raiz do projeto. Documentar a limitação onde não houver.
- **Aceite:** registro do teste por ferramenta no `docs/setup-mcp-abap.md`.

### 2.6 Arquivo de runtime desatualizado ou concorrente

- **Onde:** `scripts/mcp-launch.mjs:66-69` e `:212-217`; política seção 3
- **Situação atual:**
  - No Windows, matar o `cmd /c` ou o processo à força não dispara `exit`: o arquivo fica e o orquestrador pode rotear para um servidor que caiu.
  - Duas sessões no mesmo servidor (por exemplo, Claude e Codex) apagam o arquivo uma da outra.
- **Correção:**
  - Política seção 3: o orquestrador confere se o `pid` do arquivo está vivo antes de rotear.
  - Ao encerrar, só apagar o arquivo se o `pid` gravado for o próprio.
  - Avaliar um arquivo por PID (`<servidor>.<pid>.json`).
- **Aceite:** encerrar uma de duas sessões não apaga o runtime da outra.

---

## Bloco 3 — Consistência e documentação (prioridade baixa)

### 3.1 Renomeação NE/SE incompleta

- **Situação atual:** o diff não commitado em `docs/setup-mcp-abap.md` troca NE/SE por XXX/YYY, mas `arc-1-qas-ne` e `ARC1_QAS_NE_*` continuam em:
  - `scripts/mcp-launch.mjs:11`
  - `.env.example:8`
  - `.agents/mcp.servers.json` (`_comentario`)
  - `standards/politica-mcp-abap.md:75`
- **Correção:** aplicar a mesma troca nos quatro arquivos (se a intenção era anonimizar sistemas de cliente) e rodar `sync-agents.mjs`.
- **Aceite:** `grep -ri "qas-ne\|QAS_NE\|qas-se\|QAS_SE"` sem resultados.

### 3.2 Exceção de SQL livre não registrada

- **Situação atual:** o probe lê a T000 pelo data preview do ADT (`/sap/bc/adt/datapreview/freestyle`), endpoint de SQL livre, enquanto a política diz "SQL livre sempre desligado".
- **Correção:** registrar a exceção (consulta fixa, só T000, só leitura, feita pelo launcher e não pelo agente) na política seção 2 e no ADR-0009.

### 3.3 Status do ADR-0009

- **Situação atual:** "Proposto", mas o `AGENTS.md` já o trata como regra obrigatória.
- **Correção:** mudar para "Aceito" quando o PR for aprovado, e atualizar `docs/adr/README.md`.

### 3.4 README desatualizado sobre `cmd /c`

- **Onde:** `README.md:274`
- **Situação atual:** diz que só o `npx` ganha o prefixo `cmd /c`; hoje o `node` também ganha.
- **Correção:** "os comandos stdio ganham o prefixo `cmd /c` no Windows".

### 3.5 Leitura do `.env` e placeholders

- **Onde:** `scripts/mcp-launch.mjs:72-86`
- **Situação atual:** uma senha que contenha `<...>` é tomada por placeholder e o erro diz "variável não definida". Comentários no fim da linha não são tratados (manter assim é aceitável, porque senhas podem conter `#`, mas deve ser documentado).
- **Correção:** não aplicar o filtro de placeholder a `SAP_PASSWORD`, ou usar mensagem específica ("parece placeholder"). Documentar em `.env.example` que não há comentário no fim da linha.

### 3.6 Robustez do `sync-agents.mjs`

- **Onde:** `scripts/sync-agents.mjs:74` e `:118-126`
- **Situação atual:**
  - `description` de uma linha é gerada em YAML sem aspas: quebra se tiver `": "`.
  - Todo arquivo de skill é lido como UTF-8 com normalização de CRLF: corrompe binários (imagens).
- **Correção:** citar a `description` (ou sempre usar `>-`); copiar arquivos não textuais byte a byte.

---

## Observação

Nenhum item deste plano foi implementado. Ao implementar, seguir a ordem dos blocos; o Bloco 1 deve vir com os testes do item 1.7 no mesmo PR.
