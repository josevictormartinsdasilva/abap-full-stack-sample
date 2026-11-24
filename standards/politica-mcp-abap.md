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

Em S/4HANA 2025+ DEV/SANDBOX, uma operação de desenvolvimento que o `abap-adt` não ofereça segue a cadeia de fallback da seção 4.4. Em S/4HANA 2025+ QAS/PRD, uma operação de análise que o `abap-adt` não ofereça segue o fallback somente leitura da seção 4.5.

**Regras absolutas:**

1. **`vsp` nunca acessa QAS ou PRD.** O launcher recusa iniciar.
2. **Nenhuma escrita em QAS ou PRD**, por nenhum servidor: criar, alterar, ativar, excluir, liberar transporte ou aplicar quickfix.
3. **O ambiente e o release vêm do próprio sistema**, não de declaração do operador (seção 2). O que não puder ser detectado é tratado como o caso mais restritivo.
4. **Cada sistema é acessado só pelo servidor que a matriz indica para ele.** Não use outro servidor só porque ele "também funcionaria". As únicas exceções são os fallbacks de S/4HANA 2025+: desenvolvimento em DEV/SANDBOX (seção 4.4) e análise em QAS/PRD (seção 4.5).
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

**Uma entrada por sistema:** cada sistema do cliente tem a sua entrada em `.agents/mcp.servers.json`, e o sufixo do nome define o prefixo das variáveis. O template traz `vsp` (DEV, `VSP_*`), `arc-1-qas` (`ARC1_QAS_*`), `arc-1-prd` (`ARC1_PRD_*`) e `arc-1-dev` (DEV pelo ARC-1, `ARC1_DEV_*`, opcional). Uma conexão a mais segue o mesmo padrão (ex.: `vsp-sandbox`, `VSP_SANDBOX_*`). Depois de alterar, rode `node scripts/sync-agents.mjs`.

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

### 4.2 `arc-1` — ARC-1 (S/4HANA ≤ 2023, QAS/PRD; em 2025+, só contingência e fallback)

**Travas técnicas** aplicadas por `scripts/mcp-launch.mjs`, que o agente não consegue desligar:

- Somente leitura em todo sistema que não seja detectado como DEV/SANDBOX, em qualquer sistema com SAP_BASIS ≥ 816 (salvo o fallback da seção 4.4) e quando o SID não for confirmado (seção 2).
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

**Exceção controlada:** se um cliente não autorizar o `vsp` no DEV, o `arc-1` pode ser apontado para o DEV com escrita. A escrita usa a entrada `arc-1-dev` (variáveis `ARC1_DEV_*`) e exige opt-in explícito: `<P>_ALLOW_DEV_WRITES=true` e `<P>_ALLOWED_PACKAGES` (ex.: `ARC1_DEV_ALLOW_DEV_WRITES`). Sem a flag, o `arc-1` no DEV inicia somente leitura (uso só para análise) e não pede pacotes. A flag é ignorada fora de DEV/SANDBOX, com SID não confirmado e em SAP_BASIS ≥ 816 sem `<P>_FALLBACK_2025=true` (seção 4.4).

### 4.3 `vsp` — vibing-steampunk (S/4HANA ≤ 2023, DEV/SANDBOX)

> ⚠️ O `vsp` puro inicia **sem restrições**. Por isso ele só pode ser iniciado pelo launcher, nunca diretamente no `.mcp.json` de uma ferramenta.

**Travas técnicas** aplicadas pelo launcher:

- Só inicia para sistemas **detectados** como DEV/SANDBOX, com SAP_BASIS 750–815 e SID confirmado (seção 2). Em SAP_BASIS ≥ 816, só como fallback do `abap-adt`, com `VSP_FALLBACK_2025=true` (seção 4.4).
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

### 4.4 Fallback de desenvolvimento em S/4HANA 2025+

O `abap-adt` é o servidor de um sistema 2025+. Se ele **não oferecer** uma operação de desenvolvimento pedida (criar, alterar ou ativar um tipo de objeto que a SAP ainda não entregou no MCP oficial), o orquestrador segue esta cadeia, **sempre no mesmo sistema DEV/SANDBOX**, e para no primeiro servidor que atender:

1. **`abap-adt`**: tentar primeiro, sempre.
2. **`vsp`**: com as mesmas travas da seção 4.3.
3. **`arc-1`**: com escrita restrita a pacotes.
4. **Execução manual**: se nenhum servidor atender, informar ao usuário qual operação faltou em cada servidor e, **só com autorização dele**, entregar o código-fonte e o passo a passo para o desenvolvedor executar no ADT (Eclipse).

**Quando o fallback vale:**

- Só quando a operação **não existe** no servidor, conforme os sinais da tabela abaixo, e com a evidência mostrada ao usuário.
- Só para **desenvolvimento** em DEV/SANDBOX. Em QAS/PRD 2025+ não há fallback de desenvolvimento: a análise é feita pelo `abap-adt`; se ele não oferecer a operação, pelo `arc-1` somente leitura (seção 4.5); se estiver fora do ar, também pelo `arc-1` somente leitura (seção 6).
- Só para a **operação** que faltou. As demais etapas da mesma entrega continuam no `abap-adt`, inclusive o ATC e o ABAP Unit do `abap-qa-auditor`.
- A trava do sistema de desenvolvimento ([ADR-0004](../docs/adr/0004-trava-do-sistema-de-desenvolvimento.md)) vale em cada servidor: o SID do `vsp` ou do `arc-1` (em `node scripts/mcp-runtime.mjs`) precisa ser o `sistemaDesenvolvimento`, o mesmo do `abap-adt`.
- As confirmações exigidas a cada uso no `vsp` (seção 4.3) continuam valendo.

**Como identificar que a operação não existe:**

| Sinal | Conta como operação ausente? |
|---|---|
| Nenhuma ferramenta do servidor cobre a operação (conferido na lista de ferramentas que o servidor publica) | Sim |
| O tipo de objeto ou a ação pedida não está entre os valores aceitos pelo esquema da ferramenta (ex.: enum de tipos de objeto) | Sim |
| A ferramenta responde que a operação ou o tipo "não é suportado" ou "não está implementado" | Sim |
| O ADT responde HTTP 404 ou 501 **no endpoint do tipo de objeto ou da ação** (o recurso não existe no sistema) | Sim |
| HTTP 404 porque **o objeto** consultado não existe | Não: o objeto não existe, a operação sim |
| HTTP 401/403, falta de autorização | Não |
| Objeto bloqueado (lock) ou em edição por outro usuário | Não |
| Erro de sintaxe ou de ativação | Não |
| Request inválida ou ausente, pacote fora da lista permitida | Não |
| Timeout, erro de conexão ou servidor fora do ar | Não: é indisponibilidade (seção 6), não lacuna |
| Parâmetro errado na chamada | Não: corrija a chamada |
| Sinal ambíguo, que não se encaixa claramente em nenhuma linha acima | Não: informe o usuário e pergunte |

**Evidência antes de trocar de servidor:** a cada passo da cadeia (`abap-adt` → `vsp`, `vsp` → `arc-1`, `arc-1` → execução manual), o orquestrador para e mostra ao usuário:

1. a operação pedida (ex.: "criar objeto do tipo X no pacote Y");
2. o servidor que não a atendeu e a versão dele, se o servidor informar;
3. a evidência: a ferramenta consultada e o trecho do esquema que não cobre a operação, ou a mensagem de erro **literal** devolvida pelo servidor;
4. a linha da tabela acima em que o sinal se encaixa;
5. o próximo servidor da cadeia.

Só depois da confirmação do usuário o orquestrador segue para o próximo servidor. Sem evidência, ou com sinal ambíguo, não há fallback. Os subagentes não trocam de servidor por conta própria: devolvem ao orquestrador a operação e a evidência.

**Travas técnicas** aplicadas pelo launcher em SAP_BASIS ≥ 816:

- Sem opt-in, nada muda: o `vsp` recusa iniciar e o `arc-1` inicia somente leitura.
- `vsp`: inicia só com `VSP_FALLBACK_2025=true`, em DEV/SANDBOX detectado e com SID confirmado, com os mesmos argumentos endurecidos da seção 4.3.
- `arc-1`: escreve só pela entrada `arc-1-dev`, apontada para o DEV, com `ARC1_DEV_FALLBACK_2025=true`, `ARC1_DEV_ALLOW_DEV_WRITES=true` e `ARC1_DEV_ALLOWED_PACKAGES`, em DEV/SANDBOX com SID confirmado. As travas fixas da seção 4.2 continuam.
- Fora de DEV/SANDBOX, a flag é ignorada, com aviso.
- O modo gravado no runtime indica `(fallback do abap-adt)`.

Os opt-ins ficam desligados por padrão. O desenvolvedor os liga quando o fallback for necessário e reinicia a sessão da ferramenta de IA para o servidor subir.

**Relatório:** o orquestrador informa ao usuário a operação que o `abap-adt` não ofereceu, o servidor que a executou (ou que ela foi entregue para execução manual) e os objetos afetados. Na execução manual, depois que o desenvolvedor criar o objeto, o orquestrador confere pelo `abap-adt` que ele existe e está ativo, e o `abap-qa-auditor` roda o ATC normalmente.

### 4.5 Fallback de análise em QAS/PRD S/4HANA 2025+

Decisão: [ADR-0012](../docs/adr/0012-fallback-de-analise-em-qas-prd-s4hana-2025.md).

O `abap-adt` é o servidor de análise de um QAS/PRD 2025+. Se ele estiver no ar, mas **não oferecer** uma operação de análise pedida (por exemplo: dumps, traces, onde-usado ou a leitura de um tipo de objeto que a SAP ainda não entregou no MCP oficial), o orquestrador segue esta cadeia, **sempre no mesmo sistema**:

1. **`abap-adt`**: tentar primeiro, sempre.
2. **`arc-1` somente leitura**: pela entrada apontada para esse sistema (`arc-1-qas` ou `arc-1-prd`), com as ferramentas permitidas da seção 4.2.
3. **Parar e informar**: se o `arc-1` também não atender, informar ao usuário qual operação faltou em cada servidor. O agente não tem outro caminho; a análise fica com o usuário (ADT ou SAP GUI).

O `vsp` nunca entra nesta cadeia (regra absoluta 1).

**Quando o fallback vale:**

- Só para **análise** (leitura, busca, onde-usado, syntax check, ATC sem quickfix, dumps, traces e consultas de transporte). Pedido de escrita em QAS/PRD continua recusado (seção 3, passo 4).
- Só quando a operação **não existe** no `abap-adt`, conforme a tabela de sinais da seção 4.4, com a mesma evidência e a confirmação do usuário antes de trocar de servidor. As linhas de request, pacote e ativação não se aplicam. Indisponibilidade não é lacuna: segue a seção 6.
- Só para a **operação** que faltou. O restante da análise continua no `abap-adt`.
- O SID e o mandante do `arc-1` (em `node scripts/mcp-runtime.mjs`) precisam ser os do sistema consultado pelo `abap-adt`. Se divergirem, pare e informe.
- Os subagentes não trocam de servidor por conta própria: devolvem ao orquestrador a operação e a evidência.

**Travas técnicas:** nenhuma flag nova. Em QAS/PRD, o launcher sempre inicia o `arc-1` somente leitura, em qualquer release, com ABAP Unit e `SAPWrite.delete` negados e prévia de dados e SQL livre desligados (seção 4.2). `<P>_FALLBACK_2025` e `<P>_ALLOW_DEV_WRITES` são ignoradas fora de DEV/SANDBOX. A decisão de usar o `arc-1` com o `abap-adt` no ar é procedural.

**Dados:** dumps e traces podem conter dados de negócio. Antes de lê-los num QAS/PRD de cliente, considere as obrigações de LGPD (seção 7).

**Relatório:** o orquestrador informa ao usuário a operação que o `abap-adt` não ofereceu, a evidência, o servidor que a executou e o sistema consultado.

---

## 5. Equivalência de operações entre servidores

Os subagentes descrevem o trabalho em termos do `abap-adt`. Quando o servidor do sistema for outro, use o equivalente abaixo. No `vsp`, confirme a sintaxe exata com `SAP(action="help", target="<ação>")`.

| Operação | `abap-adt` | `vsp` (DEV/SANDBOX ≤ 2023) | `arc-1` (QAS/PRD ≤ 2023; fallback de análise em 2025+) |
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

Prefixos por ferramenta de IA: no Claude Code, por exemplo, os servidores aparecem como `mcp__abap-adt__*`, `mcp__arc-1-qas__*`, `mcp__arc-1-prd__*` e `mcp__vsp__SAP`.

---

## 6. Casos fora da matriz

| Situação | Ação |
|---|---|
| SAP_BASIS < 750 | Não prosseguir. Informar o usuário. |
| BTP ABAP Environment / S/4HANA Cloud Public | `abap-adt`. |
| `abap-adt` indisponível (fora do ar) num sistema 2025+ | `arc-1`, apenas para análise (sem o opt-in da seção 4.4, o launcher força somente leitura em SAP_BASIS ≥ 816). Desenvolvimento aguarda o `abap-adt`. |
| `abap-adt` no ar, mas sem a operação de desenvolvimento pedida (2025+) | Cadeia de fallback da seção 4.4: `vsp` → `arc-1` → execução manual autorizada pelo usuário. |
| `abap-adt` no ar, mas sem a operação de análise pedida (QAS/PRD 2025+) | Fallback da seção 4.5: `arc-1` somente leitura no mesmo sistema → parar e informar. |
| Tarefa envolvendo vários sistemas | Aplicar a matriz **por sistema**. A autorização de um sistema não vale para outro. |
| Servidor do sistema indisponível (erro ao iniciar) | Repassar ao usuário a mensagem do `mcp-launch`. Não trocar de servidor por conta própria. |

---

## 7. Compliance

- **Fluxo de dados:** código-fonte, diagnósticos e dados lidos vão para o provedor do modelo de IA. Em QAS e PRD de clientes, considere as obrigações de LGPD antes de ler qualquer dado de negócio.
- **Política de APIs da SAP:** a SAP API Policy (FAQ Q33) classifica as APIs ADT como internas e as limita a canais de desenvolvimento endossados. O uso de `arc-1` e `vsp` em ambiente de cliente exige aceite formal do cliente.
- **Escopo das restrições:** a lista de pacotes permitidos restringe **escritas, não leituras**. O controle de leitura depende das autorizações SAP do usuário configurado. Use usuários com autorização mínima, de preferência somente leitura em QAS/PRD.
- **Credenciais:** ficam no ambiente do sistema ou no `.env` local, que não é versionado. Nunca grave credenciais em arquivos do repositório.
- **Suporte:** `arc-1` e `vsp` são projetos comunitários (licença MIT), sem suporte SAP. O launcher usa sempre a última versão estável de cada um e recusa iniciar se uma versão nova deixar de reconhecer uma flag ou variável de segurança que ele aplica. Para voltar a uma versão anterior, use `ARC1_VERSION`/`VSP_VERSION` (ver `docs/setup-mcp-abap.md`).
