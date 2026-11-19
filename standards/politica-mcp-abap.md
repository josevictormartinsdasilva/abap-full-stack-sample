# Política de Seleção de MCP ABAP

> **Natureza:** regra obrigatória para o orquestrador e para todos os subagentes que acessam o SAP.
> **Decisão:** [ADR-0009](../docs/adr/0009-selecao-de-mcp-abap-por-versao-e-ambiente.md).
> **Princípio:** em caso de dúvida, use a opção mais restritiva e pergunte ao usuário.

Esta política define **qual servidor MCP** acessa cada sistema SAP, conforme a versão do S/4HANA e o ambiente. Ela complementa a trava do sistema de desenvolvimento ([ADR-0004](../docs/adr/0004-trava-do-sistema-de-desenvolvimento.md)), sem substituí-la.

---

## 1. Matriz de decisão

| Versão do sistema | Ambiente | Finalidade | Servidor MCP | Modo |
|---|---|---|---|---|
| S/4HANA 2025+ (SAP_BASIS ≥ 816) | DEV / SANDBOX | Desenvolvimento e análise | `abap-adt` (MCP oficial SAP) | Escrita conforme ADR-0004 |
| S/4HANA 2025+ (SAP_BASIS ≥ 816) | QAS / PRD | Somente análise | `abap-adt` (MCP oficial SAP) | Somente leitura |
| S/4HANA 2023 ou inferior (SAP_BASIS 750–815) | QAS / PRD | Somente análise | `arc-1` | Somente leitura (forçado pelo launcher) |
| S/4HANA 2023 ou inferior (SAP_BASIS 750–815) | DEV / SANDBOX | Desenvolvimento e análise | `vsp` (vibing-steampunk) | Endurecido (forçado pelo launcher) |

**Regras absolutas:**

1. **`vsp` nunca acessa QAS ou PRD.** O launcher recusa iniciar.
2. **Nenhuma escrita em QAS ou PRD**, por nenhum servidor: criar, alterar, ativar, excluir, liberar transporte ou aplicar quickfix.
3. **O ambiente e o release vêm do próprio sistema**, não de declaração do operador (seção 2). O que não puder ser detectado é tratado como o caso mais restritivo.
4. **Cada sistema é acessado só pelo servidor que a matriz indica para ele.** Não use outro servidor só porque ele "também funcionaria".
5. **SAP_BASIS < 750** está fora do escopo. Informe o usuário e não prossiga.

---

## 2. Identificação automática do sistema

O operador só informa **como conectar**: URL, mandante, usuário e senha (`ARC1_*` / `VSP_*`). Antes de iniciar o `arc-1` ou o `vsp`, o launcher ([scripts/mcp-launch.mjs](../scripts/mcp-launch.mjs), com [scripts/sap-probe.mjs](../scripts/sap-probe.mjs)) lê o próprio SAP pelos mesmos endpoints ADT que o Eclipse usa:

| O que | De onde | Se não puder ler |
|---|---|---|
| SID, mandante e usuário | `/sap/bc/adt/core/http/systeminformation` (SID confirmado); em releases antigos, `T000-LOGSYS` (`<SID>CLNT<mandante>`, SID **não confirmado**) | Usa `<P>_SAP_SID` declarado, com aviso; sem ele, não inicia |
| Release | `/sap/bc/adt/system/components` (SAP_BASIS e S4CORE) | Não inicia |
| Ambiente | `T000` do mandante (SCC4): `CCCATEGORY` e `CCNOCLIIND` | Tratado como **PRD** |

**Classificação do ambiente:**

| T000 (SCC4) | Ambiente |
|---|---|
| `CCCATEGORY = P` (produção) | PRD |
| `CCCATEGORY = T` (teste) | QAS |
| `CCCATEGORY = C` (customizing) e repositório alterável no mandante (`CCNOCLIIND` vazio ou `1`) | DEV |
| `CCCATEGORY = D` ou `E` (demo, treinamento) e repositório alterável | SANDBOX |
| Qualquer outra combinação (ex.: `C` com repositório bloqueado, `S`) | QAS (somente leitura) |

**Conferências do launcher:**

- Se `<P>_SAP_SID` for informado e o SID detectado for outro, ele **recusa** iniciar. Isso pega a URL trocada.
- Um SID tirado do `T000-LOGSYS` é só convenção e costuma vir errado depois de uma cópia de mandante. Por isso ele **não conta como confirmado** (`sidConfirmado: false` no runtime) e exige `<P>_SAP_SID` igual. Sem a declaração, o `vsp` recusa iniciar e o `arc-1` inicia somente leitura.
- O mandante detectado precisa bater com o configurado.
- O `vsp` recebe o SID detectado em `--expect` e o confere de novo a cada sessão.
- SAP_BASIS < 750 recusa os dois servidores (regra absoluta 5).
- A URL precisa ser `https://` (exceto `localhost`), porque a autenticação é Basic. `NODE_TLS_REJECT_UNAUTHORIZED=0` faz o launcher recusar iniciar; para certificado de CA interna, use `NODE_EXTRA_CA_CERTS`. `NODE_OPTIONS` e `NODE_TLS_REJECT_UNAUTHORIZED` não são repassados ao servidor.

**Restrições adicionais (opcional):** [sistemas-sap.json](sistemas-sap.json) permite declarar um sistema como mais restritivo do que o detectado. Exemplo: um QAS cujo mandante foi cadastrado como customizing (`C`) na SCC4. Uma declaração **nunca libera**: vale sempre o mais restritivo entre o detectado e o declarado (DEV < SANDBOX < QAS < PRD).

- Cada entrada tem `sid` e `ambiente` (`DEV`, `SANDBOX`, `QAS` ou `PRD`) obrigatórios. `mandante` é opcional: sem ele, a restrição vale para todos os mandantes do SID.
- Uma entrada com `sid` ainda em placeholder (`<...>`) é tratada como modelo e ignorada, com aviso.
- JSON malformado ou entrada inválida faz o launcher **recusar** iniciar, com a posição da entrada na mensagem. Assim, uma restrição nunca deixa de valer em silêncio.

**Limites da detecção:**

- A classificação depende de a SCC4 estar correta. A opção de modificação global do sistema (SE06) não é lida, mas, se estiver bloqueada, o próprio SAP recusa as escritas.
- A leitura da T000 usa o data preview do ADT. Um usuário sem essa autorização faz o sistema ser tratado como PRD.

**Exceção à regra "SQL livre sempre desligado":** o launcher lê a T000 pelo endpoint de SQL livre do ADT (`/sap/bc/adt/datapreview/freestyle`), porque é o único caminho comum a todos os releases a partir do NW 7.50. A exceção é restrita:

- **consulta fixa**, no código do launcher (`SELECT MANDT, LOGSYS, CCCATEGORY, CCCORACTIV, CCNOCLIIND FROM T000 WHERE MANDT = '<mandante>'`). O mandante é reduzido a dígitos antes de entrar na consulta, e nenhum outro valor vem de configuração ou de agente;
- **só a T000**, uma linha de configuração do mandante, sem dado de negócio;
- **só leitura** (`SELECT`), uma vez por início de servidor;
- **feita pelo launcher, antes de o servidor MCP subir.** O agente nunca tem acesso a esse endpoint: no `arc-1` e no `vsp`, SQL livre e prévia de dados continuam desligados (`SAP_ALLOW_FREE_SQL=false`, `SAP_ALLOW_DATA_PREVIEW=false`, `--block-free-sql`).
- O `abap-adt` (MCP oficial) não passa pelo launcher. Para ele, o agente confirma SID e release pelas ferramentas de informação de sistema do próprio servidor.

**Resultado para o orquestrador:** a cada início, o launcher grava em `.agents/runtime/<servidor>.<pid>.json` (não versionado) o SID, o mandante, o produto, o SAP_BASIS, o ambiente, o motivo da classificação, o modo (desenvolvimento ou somente leitura), as ações negadas e o `pid`. Cada sessão tem o seu arquivo, então duas ferramentas no mesmo servidor não apagam o estado uma da outra. O arquivo é apagado quando o servidor encerra normalmente. Se o processo for morto à força, o arquivo fica, por isso o orquestrador não lê os arquivos diretamente: usa `node scripts/mcp-runtime.mjs`, que lista em JSON só os servidores cujo processo está vivo e descarta os demais.

**Diagnóstico:** `node scripts/mcp-launch.mjs <servidor> --diagnostico` mostra o que foi detectado e a decisão, sem iniciar o servidor.

| SAP_BASIS | Produto | Faixa |
|---|---|---|
| ≥ 816 | S/4HANA 2025+ | MCP oficial (`abap-adt`) |
| 758 | S/4HANA 2023 | ≤ 2023 |
| 757 / 756 / 755 / 754 | S/4HANA 2022 / 2021 / 2020 / 1909 | ≤ 2023 |
| 750–753 | S/4HANA 1511–1809, ECC EhP8 (NW 7.50) | ≤ 2023 |

**Mais de um sistema da mesma faixa:** cada sistema tem a sua entrada em `.agents/mcp.servers.json`, com sufixo no nome (ex.: `arc-1-qas-xxx`, `arc-1-qas-yyy`), e variáveis próprias (`ARC1_QAS_XXX_*`, `ARC1_QAS_YYY_*`). Depois de alterar, rode `node scripts/sync-agents.mjs`.

---

## 3. Procedimento obrigatório antes de qualquer chamada SAP

1. **Identificar o sistema-alvo** (SID e mandante) pelo pedido do usuário. Se houver ambiguidade, pergunte.
2. **Descobrir qual servidor está conectado a ele:**
   - para `arc-1` e `vsp`, rode `node scripts/mcp-runtime.mjs` e use o servidor cujo `sid`/`mandante` corresponda. Ele só lista servidores com processo vivo; um arquivo em `.agents/runtime/` que não aparece ali é de um servidor que caiu;
   - para `abap-adt`, consulte a informação de sistema do próprio servidor.

   Se nenhum servidor ativo estiver conectado ao sistema-alvo, **pare** e informe o usuário.
3. **Aplicar a classificação detectada.** Use o `ambiente` e o `modo` do arquivo de runtime, nunca o que o usuário ou o prompt afirmam. Se o usuário disser que um sistema é DEV e a detecção disser QAS ou PRD, vale a detecção. Informe a divergência.
4. **Classificar a tarefa** como análise ou desenvolvimento. Desenvolvimento em QAS/PRD é **recusado**, com a sugestão de reproduzir num DEV.
5. **Delegar.** Ao acionar um subagente, informe: sistema, ambiente detectado, servidor MCP e as restrições aplicáveis (seção 4). O subagente não usa nenhum outro servidor SAP.
6. **Relatar.** No relatório final, informe o sistema, o servidor usado, as escritas realizadas e as ações recusadas pela política.

---

## 4. Regras por servidor

### 4.1 `abap-adt` — MCP oficial SAP (S/4HANA 2025+)

- **Escrita:** apenas em DEV/SANDBOX, com a trava do [ADR-0004](../docs/adr/0004-trava-do-sistema-de-desenvolvimento.md).
- **QAS/PRD:** somente leitura, busca, checks, ATC (sem aplicar quickfix) e consultas de transporte. ABAP Unit não: só em DEV/SANDBOX. No `abap-adt` essa regra é procedural, porque ele não passa pelo launcher.
- **Restrições de acesso:** a configuração do ADT deve manter `adt.mcpServer.accessRestrictionsEnabled = true`, com destinos e pacotes listados. Essa configuração fica no IDE de cada desenvolvedor, fora deste repositório.
- **Recursos Joule** (explicação de objeto, AI-fix do ATC, documentação): podem ter custo adicional. Use somente com autorização do usuário.

### 4.2 `arc-1` — ARC-1 (S/4HANA ≤ 2023, QAS/PRD)

**Travas técnicas** aplicadas por `scripts/mcp-launch.mjs`, que o agente não consegue desligar:

- Somente leitura em todo sistema que não seja detectado como DEV/SANDBOX, em qualquer sistema com SAP_BASIS ≥ 816 e quando o SID não for confirmado (seção 2).
- Prévia de dados, SQL livre, escrita em transporte e Git, e execução de plugins sempre desligados.
- `SAPWrite.delete` sempre negado.
- Fora de DEV/SANDBOX (QAS e PRD), ABAP Unit negado (`SAPDiagnose.unittest` e `SAPDiagnose.unittest_ci`). As ações de teste não são bloqueadas pelo modo somente leitura do ARC-1, por isso a negação é explícita.

Outras regras desta seção já são garantidas pelo modo somente leitura e pela prévia de dados desligada (conferido em `arc-1@1.10.1`): aplicar quickfix, iniciar trace e alterar o estado do SQL trace são escrita; `odata_perf` e `authorization_trace` são consulta de dados.

**Ferramentas permitidas:**

- `SAPRead` e `SAPSearch`.
- `SAPNavigate` e `SAPContext` (dependências, where-used, impacto de CDS).
- `SAPLint`.
- `SAPDiagnose`: syntax check, ATC sem aplicar quickfix, dumps e traces. ABAP Unit não (só em DEV/SANDBOX).
- `SAPTransport` em leitura: list, get, diff e history.

**Exceção controlada:** se um cliente não autorizar o `vsp` no DEV, o `arc-1` pode ser apontado para o DEV com escrita. A escrita exige opt-in explícito: `ARC1_ALLOW_DEV_WRITES=true` e `ARC1_ALLOWED_PACKAGES`. Sem a flag, o `arc-1` no DEV inicia somente leitura (uso só para análise) e não pede pacotes. A flag é ignorada fora de DEV/SANDBOX, em SAP_BASIS ≥ 816 e com SID não confirmado.

### 4.3 `vsp` — vibing-steampunk (S/4HANA ≤ 2023, DEV/SANDBOX)

> ⚠️ O `vsp` puro inicia **sem restrições**. Por isso ele só pode ser iniciado pelo launcher, nunca diretamente no `.mcp.json` de uma ferramenta.

**Travas técnicas** aplicadas pelo launcher:

- Só inicia para sistemas **detectados** como DEV/SANDBOX, com SAP_BASIS 750–815 e SID confirmado (seção 2).
- Sempre com `--expect SID.MANDANTE/USUARIO`, `--allowed-packages` e `--block-free-sql`.
- `--insecure` nunca é usado.
- Edição de objetos transportáveis só com `VSP_ALLOWED_TRANSPORTS` definido.

**Permitido em DEV/SANDBOX:**

- Leitura, busca e edição (inclusive de métodos individuais).
- Criação e ativação de objetos.
- Syntax check, ABAP Unit e ATC.
- Análises de pacote via `SAP(action="analyze")`: `health`, `effects`, `check_boundaries` e `impact`. O inventário Clean Core (`vsp api-surface`) existe apenas na CLI do vsp.
- Dumps, traces e debugger em modo leitura.

**Exige confirmação explícita do usuário a cada uso,** mesmo que já autorizado antes na sessão:

- `execute_abap` — cria um programa temporário no sistema.
- Chamada RFC de módulo de função e execução de relatório (`CALL_RFC`, `RUN_REPORT`).
- Escrita de variáveis no debugger — altera a execução real, inclusive gravações no banco.
- Leitura de tabelas com dados de negócio ou pessoais, inclusive tabelas cluster.
- `install_zadt_vsp`, `deploy_zip` e qualquer instalação de objetos de terceiros no SAP.
- Exclusão de objetos.

**Proibido:**

- Liberar transportes, salvo pedido explícito do usuário.

---

## 5. Equivalência de operações entre servidores

Os subagentes descrevem o trabalho em termos do `abap-adt`. Quando o servidor do sistema for outro, use o equivalente abaixo. No `vsp`, confirme a sintaxe exata com `SAP(action="help", target="<ação>")`.

| Operação | `abap-adt` | `vsp` (DEV/SANDBOX ≤ 2023) | `arc-1` (QAS/PRD ≤ 2023) |
|---|---|---|---|
| Buscar objeto | `abap_repository_*` | `SAP(action="search")` / `grep` | `SAPSearch` |
| Ler código | `abap_object_*` (leitura) | `SAP(action="read")` | `SAPRead` |
| Criar / editar | `abap_object_*` (escrita) | `SAP(action="create")` / `edit` | Proibido |
| Syntax check | `abap_object_check` | `SAP(action="analyze")`, `type=syntax_check` | `SAPDiagnose` |
| Ativar | `abap_object_*` (ativação) | `SAP(action="edit")` (ver help) | Proibido |
| ATC | `abap_atc_*` | `SAP(action="test", target="ATC")` | `SAPDiagnose` (sem quickfix) |
| ABAP Unit | `abap_unit_*` (somente DEV/SANDBOX) | `SAP(action="test")` | — (negado pelo launcher) |
| Onde é usado / impacto | `abap_repository_*` | `SAP(action="analyze")`, `type=impact` | `SAPContext` |
| Dumps | feeds | `SAP(action="analyze")`, `type=list_dumps` | `SAPDiagnose` |
| Transportes | `abap_transport_*` | `SAP(action="system")` | `SAPTransport` (leitura) |

Prefixos por ferramenta de IA: no Claude Code, por exemplo, os servidores aparecem como `mcp__abap-adt__*`, `mcp__arc-1__*` e `mcp__vsp__SAP`.

---

## 6. Casos fora da matriz

| Situação | Ação |
|---|---|
| SAP_BASIS < 750 | Não prosseguir. Informar o usuário. |
| BTP ABAP Environment / S/4HANA Cloud Public | `abap-adt`. |
| `abap-adt` indisponível num sistema 2025+ | `arc-1`, apenas para análise (o launcher força somente leitura em SAP_BASIS ≥ 816). Desenvolvimento aguarda o `abap-adt`. |
| Tarefa envolvendo vários sistemas | Aplicar a matriz **por sistema**. A autorização de um sistema não vale para outro. |
| Servidor do sistema indisponível (erro ao iniciar) | Repassar ao usuário a mensagem do `mcp-launch`. Não trocar de servidor por conta própria. |

---

## 7. Compliance

- **Fluxo de dados:** código-fonte, diagnósticos e dados lidos vão para o provedor do modelo de IA. Em QAS e PRD de clientes, considere as obrigações de LGPD antes de ler qualquer dado de negócio.
- **Política de APIs da SAP:** a SAP API Policy (FAQ Q33) classifica as APIs ADT como internas e as limita a canais de desenvolvimento endossados. O uso de `arc-1` e `vsp` em ambiente de cliente exige aceite formal do cliente.
- **Escopo das restrições:** a lista de pacotes permitidos restringe **escritas, não leituras**. O controle de leitura depende das autorizações SAP do usuário configurado. Use usuários com autorização mínima, de preferência somente leitura em QAS/PRD.
- **Credenciais:** ficam no ambiente do sistema ou no `.env` local, que não é versionado. Nunca grave credenciais em arquivos do repositório.
- **Suporte:** `arc-1` e `vsp` são projetos comunitários (licença MIT), sem suporte SAP. As versões ficam fixadas (ARC-1 no launcher; `vsp` pelo binário instalado) e são atualizadas por PR.
