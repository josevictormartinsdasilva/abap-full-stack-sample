# Parece erro, mas é normal

Este projeto foi feito para **dizer "não"** quando algo pode dar errado: sistema errado, ambiente produtivo, ação sem aprovação. Para quem está começando, muitas dessas recusas parecem defeito. Esta página explica as mais comuns, em linguagem simples.

**Regra de ouro:** diante de qualquer mensagem estranha, rode primeiro, no terminal, na pasta do projeto:

```powershell
node scripts/doctor.mjs
```

Ele confere a instalação inteira e diz o que fazer. Se não resolver, veja a tabela de [Problemas comuns](setup-mcp-abap.md#problemas-comuns), que lista as mensagens técnicas do launcher. Palavras que você não conhece estão no [glossário](glossario.md).

---

## Na instalação e no `/mcp`

| O que você vê | Por que acontece | O que fazer |
|---|---|---|
| No `/mcp`, um ou mais servidores aparecem como **falhos** (`failed`) | Cada servidor só funciona se estiver configurado. Num cliente com S/4HANA 2023, por exemplo, o `abap-adt` sempre aparece falho. | Nada, se você não usa aquele servidor. Confira quais você **precisa** na etapa 5 dos [primeiros passos](primeiros-passos.md#5-abrir-a-ferramenta-e-conferir-as-conexões). |
| `abap-adt` falho com `ECONNREFUSED` | O servidor do `abap-adt` só existe enquanto o Eclipse ou o VS Code (com o ADT) está aberto e conectado ao DEV. | Abra a IDE, conecte no DEV e reabra a ferramenta de IA. Detalhes na etapa 4.5 dos [primeiros passos](primeiros-passos.md#45-conferir-e-problemas-comuns). |
| O `doctor` mostra **avisos** de "sem valor em naming-conventions.json" ou "placeholders em padrao-desenvolvimento.md" | Os dados do cliente (sigla, variante ATC etc.) ainda não foram preenchidos. Enquanto isso, os agentes perguntam esses valores. | Rode `node scripts/setup.mjs --apenas=cliente`, ou responda quando o agente perguntar. |
| O `doctor` diz que o token está "nas variáveis do usuário", mas não no terminal | A variável foi gravada, mas o terminal já estava aberto antes e não a enxerga. | Feche e abra o terminal **e** a ferramenta de IA. |
| O `setup` mostra um **SHA-256** e pede para você confirmar | O certificado HTTPS do SAP não é de uma autoridade conhecida (comum em DEV). Confirmar sem conferir abriria espaço para alguém se passar pelo SAP. | Mande o valor para o Basis e confirme só se ele bater com o da STRUST. |
| `arc-1-qas` dá *timeout* na primeira vez | Na primeira vez, o ARC-1 é instalado, e isso demora mais que o limite da ferramenta de IA. | Rode uma vez no terminal `node scripts/mcp-launch.mjs arc-1-qas --diagnostico` e reabra a ferramenta. |
| A ferramenta de IA pede **permissão** para rodar um comando ou usar uma ferramenta | É o controle da própria ferramenta: você aprova cada ação até autorizá-la de vez. | Leia o que vai ser executado e aprove se fizer sentido. Na dúvida, recuse e pergunte à IA o que o comando faz. |

## Quando o launcher recusa conectar

| O que você vê | Por que acontece | O que fazer |
|---|---|---|
| `T000 ilegível ... tratado como PRD` ou `recusado: ... é PRD` | O launcher precisa ler a tabela T000 para saber se o sistema é DEV, QAS ou PRD. Se o seu usuário não tem autorização para isso, o sistema é tratado como produtivo, por segurança, e o acesso é negado. | Se o sistema **não** é o PRD, peça ao time de segurança SAP a autorização de *data preview* na T000. Se **é** o PRD, está correto: nenhum agente acessa produção. |
| `vsp recusado: ... é QAS` | O `vsp` só trabalha no DEV. A URL aponta para o QAS, ou o mandante do DEV não está marcado como customizing na SCC4. | Confira a URL no `.env`. Se estiver certa, fale com o Basis sobre a SCC4. |
| `vsp recusado: SAP_BASIS 816 ... é servido pelo abap-adt` | O sistema é S/4HANA 2025+. Nesse caso, o servidor certo é o `abap-adt`, o oficial da SAP. | Use o `abap-adt` (etapa 4 dos [primeiros passos](primeiros-passos.md#4-s4hana-2025-habilitar-o-abap-adt)). |
| `aviso: ... o ARC-1 inicia somente leitura` | O `arc-1` só escreve em casos muito específicos, autorizados pela política. | Normal, se você só quer analisar. Para desenvolver, use o `vsp` (ou o `abap-adt` em 2025+). |

## Durante a conversa com a IA

| O que você vê | Por que acontece | O que fazer |
|---|---|---|
| A IA apresenta um **plano** e espera, em vez de criar logo | Nada é criado ou alterado no SAP sem a sua aprovação. | Leia o plano com o [checklist de revisão](revisar-o-plano.md) e aprove, ou peça ajustes. |
| A IA **pergunta** sigla, pacote, módulo, request ou variante ATC | Ela não inventa dados do cliente. Se o valor não está configurado nem foi informado por você, ela pergunta. | Responda, ou informe tudo já no pedido: "módulo SD, pacote ZSD_FATURAMENTO, request DS4K900123". Para não precisar repetir, peça a quem configurou o projeto que rode `node scripts/setup.mjs --apenas=cliente`. |
| A IA se **recusa a criar** objetos e mostra um SID | Ela só cria e ativa objetos no `sistemaDesenvolvimento` do cliente. O sistema conectado é outro, ou não deu para confirmar. | Confira o SID da mensagem. Se for mesmo o DEV, o `sistemaDesenvolvimento` está errado ou vazio: rode `node scripts/setup.mjs --apenas=dev,cliente`. |
| A IA se recusa a **acessar o PRD**, mesmo só para ler | Regra absoluta: nenhum agente acessa produção, com nenhum servidor. | Para um problema em produção, traga para a conversa o dump, o log ou o código, ou reproduza o problema no QAS ou no DEV. |
| No QAS, a IA não aplica **QuickFix** nem roda **ABAP Unit** | O QAS é sempre somente leitura, e o ABAP Unit só roda no DEV ou no SANDBOX. | Faça as correções no DEV e transporte. |
| A IA pede confirmação para **executar código**, chamar RFC ou rodar um relatório | Essas ações podem mexer em dados, então exigem a sua confirmação a cada vez. | Confirme só se você entende o que vai ser executado. |
| A IA diz que a operação **não existe no `abap-adt`** e pede para usar outro servidor | É o "plano B" (*fallback*) da política. Ela precisa mostrar a evidência (a ferramenta consultada ou o erro literal) e esperar a sua confirmação. | Confira a evidência. Erro de sintaxe, objeto bloqueado, falta de autorização ou timeout **não** justificam trocar de servidor. |
| A entrega **não termina** enquanto o ATC tiver erros | Regra de qualidade: tolerância zero para erros no ATC. | Peça à IA que corrija e rode o ATC de novo. Avisos não bloqueiam, mas leia-os. |
| A IA cria um objeto local com nome começando por **`Y`** | Pelo padrão, objetos locais (pacote `$TMP`) usam o prefixo `Y`, e não `Z`. | Nada. Para um objeto que vai ser transportado, informe o pacote do projeto. |
