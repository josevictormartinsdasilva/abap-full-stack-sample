# Como revisar o plano antes de aprovar

Antes de criar ou alterar qualquer objeto no SAP, a IA apresenta um **plano** e espera a sua aprovação. Esse é o momento mais importante da conversa: depois de aprovado, os objetos são criados com o seu usuário e entram na sua request.

Aprovar sem ler é o erro mais comum de quem está começando. A IA erra, e o código entregue é responsabilidade sua. Use este checklist a cada plano. Leva poucos minutos e, com o tempo, vira hábito.

Palavras que você não conhece estão no [glossário](glossario.md).

---

## As 8 perguntas

Para cada pergunta, se a resposta for "não" ou "não sei", **não aprove ainda**: peça a explicação ou o ajuste à IA.

### 1. É o sistema certo?

O plano (ou a mensagem antes dele) informa o **SID** e o **servidor MCP** usados. O SID tem de ser o do DEV do cliente.

> Pergunte: "Em qual sistema e com qual servidor MCP você vai criar esses objetos?"

### 2. Entendi o que vai ser feito?

Leia o plano como se fosse explicá-lo a outra pessoa. Para cada objeto, você precisa saber **para que ele serve**. Se não souber, pergunte antes de aprovar.

> Pergunte: "Explique em uma frase para que serve cada objeto do plano."

### 3. O tipo de solução faz sentido?

- **Novo app Fiori ou novo serviço OData:** em geral, RAP e CDS (`abap-rap-dev`).
- **Manutenção de report, função, BAdI, user exit ou tela Dynpro existente:** em geral, ABAP clássico (`abap-classic-dev`).
- **Só mudança de tela no app Fiori:** em geral, `fiori-elements-dev`, sem mexer no backend.

Se o plano fugir disso, pode haver um bom motivo, mas peça para a IA explicar.

> Pergunte: "Por que RAP (ou ABAP clássico) e não a outra opção neste caso?"

### 4. Os nomes seguem o padrão?

Os nomes vêm do [padrão de nomenclatura](../standards/naming-conventions.json) e do tópico 8 do [padrão de desenvolvimento](../standards/padrao-desenvolvimento.md). Confira:

- o **prefixo** do tipo de objeto (ex.: `ZI_` e `ZC_` para CDS, `ZCL` para classe, `ZT` para tabela);
- o **módulo** certo (`SD`, `MM`, `FI`...);
- objeto local (pacote `$TMP`) começa com **`Y`**;
- a descrição está em **português**.

> Pergunte: "Qual tópico do padrão de desenvolvimento define cada um desses nomes?"

### 5. O pacote e a request estão certos?

- O pacote segue o formato `Z<MD>_<processo>` (tópico 5 do padrão).
- Objeto que outros módulos vão reaproveitar vai no pacote `ZCA_UTILITARIO` (tópico 7).
- A request é a da sua demanda, com o nome `GAP - Descrição` (tópico 6).

> Pergunte: "Em qual pacote e em qual request cada objeto vai ficar?"

### 6. Já não existe algo pronto?

Antes de criar um objeto novo, vale conferir se já existe um objeto standard (de preferência uma API liberada pela SAP) ou um Z do projeto que faz o mesmo.

> Pergunte: "Você verificou se já existe um objeto standard liberado ou um Z do projeto que atenda a isso?"

### 7. Alguma coisa existente vai ser alterada?

Alterar um objeto que já existe é mais arriscado do que criar um novo: outros programas podem depender dele. Se o plano altera algo, peça a lista de onde ele é usado (*where-used*) e o impacto.

Atenção redobrada se o plano **modificar objeto standard da SAP**: isso vai contra o Clean Core e, em geral, não deve ser feito.

> Pergunte: "Quais objetos existentes você vai alterar, onde eles são usados e qual o impacto?"

### 8. O plano termina com qualidade?

O plano deve terminar com o **ATC** (e o ABAP Unit, quando houver testes). Uma entrega só é concluída sem erros no ATC.

> Pergunte: "Como você vai validar a entrega? Vai rodar o ATC e o ABAP Unit?"

---

## Sinais de alerta

Se aparecer algum destes, pare e peça explicação antes de aprovar:

- um SID diferente do DEV do cliente;
- nome de objeto sem prefixo ou com módulo errado;
- objeto num pacote que não tem nada a ver com a demanda;
- um valor do cliente (sigla, pacote, request) que você **não informou** e que não está configurado no projeto: a IA não deveria inventar;
- alteração em objeto standard da SAP;
- muito mais objetos do que a demanda pede;
- um plano que não menciona o ATC;
- uma explicação que você não conseguiria repetir com as suas palavras.

## Depois da entrega

A aprovação não encerra o seu trabalho. Antes de liberar a request:

1. **Abra os objetos no ADT** e leia o código. A IA mostra o resumo; o código é o que vai para produção.
2. **Peça explicações** do que não entendeu: "Explique linha a linha o método `VALIDATE_DATES`." Usar a IA para aprender é tão importante quanto usá-la para produzir.
3. **Confira o ATC** com o `abap-qa-auditor`: zero erros, e os avisos lidos.
4. **Teste** o comportamento, não só a ativação: rode o report, abra o app, tente um caso que deveria dar erro.
5. **Saiba explicar a entrega.** Se o analista funcional ou o revisor perguntar "por que foi feito assim?", a resposta tem de ser sua, não "a IA fez".

## Um exemplo de conversa

```text
Você: Crie uma CDS com os pedidos de venda em aberto, módulo SD, pacote ZSD_PEDIDOS.

IA:   Plano (sistema DS4, servidor vsp):
      1. ZI_SD_PEDIDO_ABERTO  — CDS View Entity básica sobre VBAK/VBAP
      2. ZC_SD_PEDIDO_ABERTO  — CDS de projeção para consumo
      Pacote ZSD_PEDIDOS, request DS4K900123. Depois, ATC.
      Posso seguir?

Você: Antes: por que ler VBAK/VBAP direto e não uma CDS standard liberada,
      como a I_SalesDocument? E qual tópico do padrão define esses nomes?
```

Perguntas como essa última melhoram o resultado e ensinam você ao mesmo tempo.
