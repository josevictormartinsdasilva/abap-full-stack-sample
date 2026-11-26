# Glossário

Os termos que aparecem neste projeto, em linguagem simples. Se você está começando, leia este arquivo antes do [guia de primeiros passos](primeiros-passos.md) e volte aqui quando encontrar uma palavra nova.

Os termos estão agrupados por assunto. Para achar um termo, use a busca do navegador ou do editor (`Ctrl+F`).

---

## A IA e o projeto

| Termo | O que é |
|---|---|
| **Ferramenta de IA** | O programa com que você conversa: Claude Code, Codex, Kimi ou Antigravity. Ele roda na pasta do projeto e lê as regras daqui. |
| **Orquestrador** | O papel que a ferramenta de IA assume na conversa principal. Ele entende o pedido, monta o plano, pede a sua aprovação e chama o especialista certo. As regras dele estão no [AGENTS.md](../AGENTS.md). |
| **Subagente** (ou agente especialista) | Uma "IA auxiliar" com uma especialidade só, chamada pelo orquestrador. São quatro: `abap-rap-dev` (RAP e CDS), `abap-classic-dev` (ABAP clássico), `fiori-elements-dev` (apps Fiori) e `abap-qa-auditor` (ATC e testes). O subagente só sabe o que o orquestrador conta para ele. |
| **Skill** | O "manual de instruções" de um especialista: regras, exemplos e material de referência que ele consulta. Fica em `.agents/skills/`. |
| **Plano** | A lista de objetos que a IA pretende criar ou alterar, com os nomes, apresentada **antes** de mexer no SAP. Nada acontece sem a sua aprovação. Veja [como revisar um plano](revisar-o-plano.md). |
| **Prompt** | O que você escreve para a IA. Peça em linguagem natural, como faria a um colega. |
| **Placeholder** | Um valor ainda não preenchido, escrito entre `<` e `>` (ex.: `<SIGLA>`). Enquanto houver placeholder, os agentes perguntam em vez de supor. |
| **ADR** | *Architecture Decision Record*: um documento curto que registra uma decisão do projeto e o porquê. Ficam em [docs/adr/](adr/README.md). Você não precisa lê-los para usar o projeto. |
| **Template** | Este repositório é um modelo: cada cliente ou projeto ganha uma cópia própria, configurada com os dados daquele cliente. |

## A ponte entre a IA e o SAP

| Termo | O que é |
|---|---|
| **MCP** | *Model Context Protocol*. É a "ponte" que deixa a IA usar ferramentas de fora, como o ADT. Sem MCP, a IA só conversa; com MCP, ela consegue ler e criar objetos no SAP. |
| **Servidor MCP** | O programa que fica do outro lado da ponte e executa o que a IA pede. Este projeto usa quatro: `abap-adt`, `vsp`, `arc-1` e `fiori-mcp`. |
| **`abap-adt`** | O servidor MCP **oficial da SAP**, que vem dentro do ADT (Eclipse ou VS Code). Usado em S/4HANA 2025 ou superior. Só funciona com a IDE aberta. |
| **`vsp`** | Servidor MCP da comunidade, usado para **desenvolver** no DEV de sistemas S/4HANA 2023 ou inferior. O projeto baixa e confere o programa sozinho. |
| **`arc-1`** | Servidor MCP da comunidade, usado para **analisar** (só leitura) o QAS de sistemas S/4HANA 2023 ou inferior. |
| **`fiori-mcp`** | Servidor MCP da SAP para criar e alterar apps Fiori no seu computador. |
| **Launcher** | O script `scripts/mcp-launch.mjs`, que liga o `vsp` e o `arc-1`. Antes de ligar, ele confere no SAP qual sistema é e aplica as travas de segurança. Mensagens dele começam com `mcp-launch:`. |
| **Política de MCP** | A regra que diz qual servidor pode acessar cada sistema e o que ele pode fazer: [politica-mcp-abap.md](../standards/politica-mcp-abap.md). |
| **Fallback** | O "plano B": quando o `abap-adt` não tem uma operação, a política permite usar outro servidor só para ela, com a sua confirmação. |
| **Token** | Uma senha gerada pela IDE para a ferramenta de IA conversar com o `abap-adt`. Fica na variável `ABAP_ADT_TOKEN`. |
| **`/mcp`** | Comando do Claude Code que mostra quais servidores MCP estão conectados. |

## Configuração na sua máquina

| Termo | O que é |
|---|---|
| **Node.js** | O programa que roda os scripts do projeto (`node scripts/...`). Precisa da versão 22.19 ou superior. |
| **`.env`** | Arquivo na raiz do projeto com as conexões do `vsp` e do `arc-1` (URL, usuário, senha). Fica só na sua máquina e nunca vai para o Git. |
| **Variáveis do usuário** | Configurações do sistema operacional que os programas leem ao abrir. O token do `abap-adt` fica aqui, e não no `.env`. Depois de mudar uma, feche e abra o terminal e a ferramenta de IA. |
| **`setup`** | O assistente `node scripts/setup.mjs`: faz perguntas e grava a configuração para você. |
| **`doctor`** | O verificador `node scripts/doctor.mjs`: confere toda a instalação e diz o que fazer em cada falha. **É o primeiro comando a rodar quando algo não funciona.** |
| **Terminal** | A janela de linha de comando (PowerShell no Windows). Os comandos deste projeto rodam nela, na pasta do projeto. |
| **Raiz do projeto** | A pasta principal do repositório, a que contém o `AGENTS.md`. Abra a ferramenta de IA sempre nela. |
| **Git / branch / commit** | O Git guarda o histórico dos arquivos. Uma *branch* é uma linha de trabalho separada; um *commit* é um ponto salvo nessa linha. |

## Sistemas SAP

| Termo | O que é |
|---|---|
| **SID** | O nome de três letras do sistema SAP (ex.: `DS4`). É como os agentes conferem em qual sistema estão. |
| **Mandante** | O número do "cliente lógico" dentro do sistema (ex.: `100`). É o mesmo que você informa no logon do SAP GUI. |
| **DEV / QAS / PRD** | Desenvolvimento, Qualidade (testes) e Produção. Os agentes **só criam objetos no DEV**, só leem no QAS e **nunca acessam o PRD**. |
| **SANDBOX** | Sistema de testes livres, tratado como um DEV. |
| **`sistemaDesenvolvimento`** | O SID do DEV do cliente, gravado em [naming-conventions.json](../standards/naming-conventions.json). Se o sistema conectado não for esse, o agente se recusa a criar objetos. |
| **Release** | A versão do SAP (ex.: S/4HANA 2023). O projeto descobre sozinho, pelo componente **SAP_BASIS** (816 ou mais = 2025+). |
| **T000** | A tabela de mandantes do SAP. O launcher a lê para saber se o sistema é DEV, QAS ou PRD. Se o seu usuário não puder lê-la, o sistema é tratado como PRD, por segurança. |
| **SCC4** | Transação onde o Basis define o papel de cada mandante (customizing, teste, produção). É de lá que vem a informação lida na T000. |
| **ADT** | *ABAP Development Tools*: o ambiente de desenvolvimento ABAP no Eclipse ou no VS Code. Os servidores MCP usam os mesmos serviços que o ADT usa. |
| **Destination** | No ADT for VS Code, a conexão salva com um sistema SAP. |
| **ICM / ICF** | Partes do SAP que atendem chamadas pela web. O Basis precisa deixar ativo o serviço `/sap/bc/adt` e informar a URL HTTPS (ex.: `https://host:44300`). |
| **Certificado / SHA-256 / STRUST** | O certificado HTTPS prova que você está falando com o SAP certo. O SHA-256 é a "impressão digital" dele, que o Basis confere na transação STRUST. O setup mostra esse valor antes de confiar no certificado. |

## Organização do desenvolvimento

| Termo | O que é |
|---|---|
| **Módulo (`<MD>`)** | A área de negócio: `SD`, `MM`, `FI`, `PP` etc. Entra no nome dos objetos (tópico 4 do [padrão](../standards/padrao-desenvolvimento.md)). |
| **Sigla** | A abreviação do cliente, definida no bloco `cliente` de [naming-conventions.json](../standards/naming-conventions.json). |
| **Pacote** | A "pasta" onde o objeto fica no SAP. Segue o formato `Z<MD>_<processo>` (tópico 5 do padrão). |
| **`$TMP`** | Pacote local: o objeto não é transportado. Bom para testes. Objetos locais começam com `Y` (tópico 8 do padrão). |
| **Request** | A "caixa" que leva as alterações do DEV para o QAS e o PRD. O nome segue o formato `GAP - Descrição` (tópico 6 do padrão). |
| **Projeto CTS** | Um agrupador de requests que alguns clientes usam. Se o cliente não usa, o projeto registra "não se aplica". |
| **GAP** | Uma necessidade do cliente que o SAP standard não atende e que vira desenvolvimento (ex.: `FIAA-01`). |
| **RICEFW** | Os tipos de desenvolvimento: *Reports, Interfaces, Conversions, Enhancements, Forms, Workflows*. |
| **Onde-usado** (*Where-used*) | Lista de objetos que usam um objeto. Confira antes de alterar algo que outros reaproveitam (tópico 7 do padrão). |

## Qualidade

| Termo | O que é |
|---|---|
| **ATC** | *ABAP Test Cockpit*: a verificação automática de qualidade do código (performance, segurança, sintaxe, convenções). **Nenhuma entrega é concluída com erro no ATC** (tópico 13 do padrão). |
| **Variante ATC** | O conjunto de verificações que o cliente escolheu para o ATC. |
| **QuickFix** | Uma correção automática que o ADT sugere para um problema do ATC. |
| **ABAP Unit** | Testes automáticos escritos em ABAP. Só rodam no DEV ou no SANDBOX. |
| **ESLint / lint** | A verificação de qualidade do código dos apps Fiori (`npm run lint`). |
| **Clean Core** | A prática de não modificar o SAP standard e usar só APIs liberadas pela SAP, para facilitar as atualizações do sistema. |
| **API liberada** (*released*) | Um objeto standard que a SAP garante que não vai mudar e que pode ser usado em ABAP Cloud. |

## ABAP moderno (RAP e CDS)

| Termo | O que é |
|---|---|
| **ABAP Cloud** | O ABAP "restrito" ao que é liberado pela SAP, usado em Clean Core e no BTP. |
| **RAP** | *ABAP RESTful Application Programming Model*: o jeito atual de construir aplicações (dados, regras e serviço) para apps Fiori. |
| **CDS View Entity** | Uma visão de dados definida em código, que substitui as views SE11. `ZI_<MD>_*` são as views básicas (*interface*); `ZC_<MD>_*` são as de consumo (*projeção*), que o app usa. |
| **Metadata Extension (DDLX)** | Arquivo separado com as anotações `@UI`, que dizem como os campos aparecem no app Fiori. |
| **Behavior Definition (BDEF)** | Diz o que a aplicação RAP pode fazer: criar, alterar, apagar, ações, validações. |
| **Behavior Pool** | A classe ABAP (`ZCL<MD>_BP_*`) com o código das regras definidas no BDEF. |
| **Draft** | Rascunho: o usuário edita e salva depois, sem perder dados no meio. Usa uma tabela extra (`ZT<MD>_*_D`). |
| **Value Help** | A ajuda de pesquisa (F4) de um campo, feita com uma CDS (`ZI_<MD>_VH_*`). |
| **Service Definition / Service Binding** | A definição diz quais entidades o serviço expõe; o binding publica o serviço como OData. |
| **OData** | O protocolo pelo qual o app Fiori conversa com o SAP. |

## Fiori

| Termo | O que é |
|---|---|
| **SAP Fiori Elements** | Apps Fiori gerados a partir das anotações, com pouco código de tela. |
| **Floorplan** | O "modelo de tela" do app: List Report + Object Page (LROP), Analytical List Page (ALP), Overview Page (OVP). |
| **FCL** | *Flexible Column Layout*: a lista e o detalhe lado a lado, em colunas. |
| **`manifest.json`** | O arquivo de configuração do app Fiori: páginas, rotas e serviço. |
| **Controller Extension** | Código JavaScript para um comportamento que as anotações não cobrem. |
| **BSP** | O repositório no SAP onde o app Fiori é publicado (`ZZ1_*`). |
