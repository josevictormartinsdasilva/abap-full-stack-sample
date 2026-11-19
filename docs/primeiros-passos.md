# Primeiros passos

Guia para quem vai **usar** o projeto no dia a dia: um desenvolvedor ABAP que recebeu o repositório e quer sair do zero até o primeiro objeto criado pelos agentes. Se você vai **manter o template** (editar agentes, skills e MCPs), leia depois a seção [Estrutura](../README.md#-estrutura-fonte-única--adaptadores-gerados) do README.

Tempo estimado: 1 a 2 horas de configuração, sem contar a espera pelas liberações da etapa 1.

---

## Como funciona, em uma frase

Você conversa com uma ferramenta de IA (Claude Code, Codex, Kimi ou Antigravity) aberta na pasta deste projeto. Ela atua como **orquestrador**: entende o pedido, apresenta um plano com os nomes dos objetos, espera a sua aprovação e então cria os objetos no SAP pelos servidores **MCP**, que dão à IA acesso ao ADT. No fim, o ATC precisa sair sem erros.

---

## 1. Antes de começar: o que pedir a outras pessoas

Estes itens não dependem de você. Peça logo no início, porque costumam demorar.

| Pedir a | O quê | Para quê |
|---|---|---|
| Gestor do projeto / cliente | SID e mandante do **DEV**, sigla do cliente, pacote, variante ATC, projeto CTS, namespace Fiori | Preencher o bloco `cliente` (etapa 4) |
| Gestor do projeto / cliente | **Aceite formal** para usar `vsp`/`arc-1`, se o sistema for S/4HANA 2023 ou inferior | A SAP classifica as APIs ADT como internas ([política, seção 7](../standards/politica-mcp-abap.md)) |
| Basis | Release do sistema (S/4HANA 2025+ ou ≤ 2023) e URL **HTTPS** do ICM (ex.: `https://host:44300`) | Escolher o caminho da etapa 5 |
| Basis | Serviço ICF `/sap/bc/adt` ativo | Sem ele, nenhum MCP conecta |
| Basis / infraestrutura | CA raiz em `.pem`, se o SAP usar certificado de CA interna | Conexão HTTPS (o launcher nunca desliga a verificação TLS) |
| Segurança SAP | Usuário de DEV com autorizações de desenvolvedor ADT, restritas aos pacotes do projeto | Os agentes criam e ativam objetos com esse usuário |
| Segurança SAP | Autorização de **data preview na T000** para esse usuário | O launcher lê a T000 para saber se o sistema é DEV, QAS ou PRD. Sem ela, o sistema é tratado como PRD e nada é criado |
| Segurança SAP | Usuário **somente leitura** em QAS/PRD (opcional) | Análise com o `arc-1` |
| Responsável pela ferramenta de IA | Acesso/licença da ferramenta (Claude Code, Codex etc.) | Usar o orquestrador |

> Use **sempre** um usuário restrito ao DEV para desenvolvimento. O projeto tem várias travas, mas a autorização SAP é a última barreira.

---

## 2. Preparar a máquina (uma vez)

1. **Git** — para clonar o repositório. Confira com `git --version`.
2. **Node.js 22.19 ou superior** — usado pelo launcher dos MCPs e pelo `fiori-mcp`. Confira com `node -v`. Se precisar, instale a versão LTS de [nodejs.org](https://nodejs.org).
3. **A ferramenta de IA.** Para o Claude Code, siga a [documentação oficial de instalação](https://docs.claude.com/en/docs/claude-code/setup). Para as outras, veja [Suporte a Ferramentas](../README.md#-suporte-a-ferramentas) no README.
4. **Clonar o repositório:**

   ```powershell
   git clone <URL_DO_REPOSITORIO>
   cd abap-full-stack
   ```

5. **Conferir se o projeto está íntegro:**

   ```powershell
   node --test scripts/test/*.test.mjs
   ```

   Todos os testes devem passar (`fail 0`).

> **macOS / Linux:** os arquivos versionados usam `cmd /c`, que só existe no Windows. Rode `node scripts/sync-agents.mjs --platform=unix` na sua cópia e **não faça commit** do resultado.

---

## 3. Variáveis de ambiente: o básico

Os MCPs leem senhas e tokens de **variáveis de ambiente** ou do arquivo `.env`. Nunca grave esses valores em arquivos versionados.

```powershell
Copy-Item .env.example .env
```

- O `.env` está no `.gitignore` e é lido pelo launcher do `vsp` e do `arc-1`.
- O token do `abap-adt` (`ABAP_ADT_TOKEN`) **não** é lido do `.env` pelas ferramentas de IA. Ele precisa estar nas variáveis do sistema (ver [Configuração do Token MCP](../README.md#-configuração-do-token-mcp-abap-adt)).
- Depois de alterar uma variável do sistema ou o `.env`, **feche e abra de novo** o terminal e a ferramenta de IA.

---

## 4. Parâmetros do cliente (uma vez por projeto)

Se outra pessoa já adotou o template para este cliente, pule esta etapa e só confira se não há valores `<...>` no bloco `cliente`.

1. Preencha o bloco `cliente` de [standards/naming-conventions.json](../standards/naming-conventions.json) com os dados da etapa 1: empresa, sigla, pacote e variante ATC, namespace Fiori, pasta dos apps e `sistemaDesenvolvimento` (SID do DEV).
2. Preencha os placeholders de [standards/padrao-desenvolvimento.md](../standards/padrao-desenvolvimento.md): `<VARIANTE_ATC>`, `<PROJETO_CTS>`, `<ID_PROJETO_CTS>`, `<DESCRICAO_PROJETO_CTS>` e `[EMPRESA]`.

Enquanto houver `<...>`, os agentes perguntam em vez de supor. O projeto funciona, mas você vai responder às mesmas perguntas várias vezes.

---

## 5. Conectar ao SAP

Escolha o caminho pelo release do sistema DEV (informado pelo Basis na etapa 1).

| Release | Servidor MCP | Caminho |
|---|---|---|
| S/4HANA 2025 ou superior (SAP_BASIS ≥ 816) | `abap-adt` (MCP oficial SAP) | 5A |
| S/4HANA 2023 ou inferior (SAP_BASIS 750 a 815) | `vsp` no DEV, `arc-1` em QAS/PRD | 5B |
| Anterior ao NetWeaver 7.50 | — | Fora do escopo do projeto |

O release que vale é o **detectado no SAP**, não o declarado. Se o launcher recusar, a mensagem diz o motivo.

### 5A. S/4HANA 2025+ — `abap-adt`

O servidor `abap-adt` precisa estar **rodando na sua máquina** em `http://localhost:2236/mcp`, e o token dele precisa estar em `ABAP_ADT_TOKEN`.

> **PENDENTE — a documentar pelo responsável do projeto:** onde obter o servidor `abap-adt`, como instalá-lo e iniciá-lo, como conectá-lo ao sistema SAP e como gerar o token. Enquanto esta seção não for preenchida, peça essas instruções a quem mantém o projeto (ver [CONTRIBUTORS.md](../CONTRIBUTORS.md)).

Com o servidor rodando e o token gerado:

1. Defina a variável do token (Windows, permanente):

   ```powershell
   [Environment]::SetEnvironmentVariable('ABAP_ADT_TOKEN','<SEU_TOKEN>','User')
   ```

2. Feche e abra o terminal.

Se o `/mcp` mostrar `ECONNREFUSED` no `abap-adt`, o servidor não está rodando ou não está na porta 2236.

### 5B. S/4HANA 2023 ou inferior — `vsp` e `arc-1`

Siga os passos 1 a 7 de [docs/setup-mcp-abap.md](setup-mcp-abap.md). Em resumo:

1. Nada a instalar para o `vsp`: o launcher baixa a versão homologada (v2.62.1) na primeira execução e confere o SHA-256. Se a rede bloquear o GitHub, veja o passo 2 do guia.
2. Se o SAP usar CA interna, aponte `NODE_EXTRA_CA_CERTS` para o `.pem`.
3. Preencha no `.env` as variáveis `VSP_*` (DEV) e, se for usar, `ARC1_*` (QAS/PRD).
4. Teste:

   ```powershell
   node scripts/mcp-launch.mjs vsp --diagnostico
   ```

   Confira na saída se o **SID, o produto e o ambiente** (`DEV`) estão corretos. Qualquer recusa está explicada na tabela [Problemas comuns](setup-mcp-abap.md#problemas-comuns).

---

## 6. Abrir a ferramenta e conferir as conexões

1. Abra a ferramenta **na raiz do projeto** (a pasta que contém o `AGENTS.md`). Aberta numa subpasta, os MCPs `vsp` e `arc-1` não sobem.

   ```powershell
   cd abap-full-stack
   claude
   ```

2. No Claude Code, digite `/mcp`. Devem aparecer conectados:
   - `fiori-mcp`, sempre;
   - `abap-adt` (caminho 5A) **ou** `vsp` (caminho 5B);
   - `arc-1`, se você configurou QAS/PRD.

   Um servidor que você não configurou aparece como falho. Isso é esperado (ex.: `abap-adt` falho num cliente só com S/4HANA 2023).

3. Digite `/agents`. Devem aparecer `abap-rap-dev`, `abap-classic-dev`, `fiori-elements-dev` e `abap-qa-auditor`.

---

## 7. Primeiro teste de ponta a ponta

Faça este teste antes de usar o projeto em uma demanda real. Ele confirma a leitura, a criação, a ativação e o ATC.

**Passo 1 — Leitura (não altera nada):**

```text
Qual é o SID, o release e o ambiente do sistema conectado? Depois, mostre a definição da tabela T001.
```

Esperado: o orquestrador informa o servidor MCP usado, o SID e o ambiente (`DEV`), e mostra os campos da T001. Confira se o SID é o do DEV.

**Passo 2 — Criação de um objeto local:**

```text
Crie uma classe local de teste YCL_TESTE_AGENTE no pacote $TMP, com um método que retorna a data atual. Depois rode o ATC nela.
```

Esperado, nesta ordem:

1. O orquestrador apresenta um **plano** com o nome do objeto e **pede sua aprovação**. Nada é criado antes disso.
2. Ele confirma que o SID conectado é o `sistemaDesenvolvimento` do bloco `cliente`.
3. A classe é criada e **ativada**.
4. O `abap-qa-auditor` roda o ATC e relata o resultado.

**Passo 3 — Conferir no SAP:** abra a classe no Eclipse/ADT ou na SE24 e confira. Depois, apague-a manualmente.

Se os três passos funcionaram, a instalação está completa.

---

## 8. No dia a dia

- **Peça em linguagem natural.** Exemplos por agente em [Como Utilizar no Dia a Dia](../README.md#-como-utilizar-no-dia-a-dia-exemplos-de-prompts).
- **Informe o contexto da demanda:** módulo (`SD`, `MM`...), GAP, pacote e request. O que você não informar, o orquestrador pergunta.
- **Leia o plano antes de aprovar.** Os nomes seguem o [padrão de nomenclatura](../standards/naming-conventions.json), mas a decisão é sua.
- **Tarefas pequenas** (uma ou duas linhas, consultas) podem ser feitas direto, sem subagente. Para forçar um especialista, cite o nome: "Peça ao `abap-rap-dev`...".

Regras que valem sempre e que você vai notar:

| Regra | O que acontece |
|---|---|
| Plano antes de alterar | Nada é criado ou alterado no SAP sem a sua aprovação |
| Só no DEV | Se o SID conectado não for o DEV do bloco `cliente`, o agente para e avisa |
| QAS e PRD são somente leitura | Com qualquer servidor. ABAP Unit também só roda em DEV/SANDBOX |
| ATC sem erros | Uma entrega só é concluída quando o ATC não tem erros |
| Relato fiel | O agente informa o sistema e o servidor usados, e o que foi recusado pela política |

---

## 9. Quando algo der errado

| Sintoma | O que fazer |
|---|---|
| Servidor falho no `/mcp`, mas o `--diagnostico` passa | Abra a ferramenta na raiz do projeto e reinicie-a depois de mudar o `.env` |
| `abap-adt` com `ECONNREFUSED` | O servidor `abap-adt` não está rodando em `localhost:2236` (etapa 5A) |
| `vsp` recusado por ser QAS/PRD | A URL aponta para outro sistema, ou o usuário não tem data preview na T000 |
| O agente pergunta sigla, pacote ou variante toda hora | Há placeholders `<...>` no bloco `cliente` (etapa 4) |
| O agente se recusa a criar objetos | Confira na mensagem o SID encontrado. Ele só cria no `sistemaDesenvolvimento` |
| Qualquer mensagem `mcp-launch:` | Consulte [Problemas comuns](setup-mcp-abap.md#problemas-comuns) |

Se nada resolver, rode `node scripts/mcp-launch.mjs <servidor> --diagnostico` e envie a saída a quem mantém o projeto, **sem** senhas ou tokens.
