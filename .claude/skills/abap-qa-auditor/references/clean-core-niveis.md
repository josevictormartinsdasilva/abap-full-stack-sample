# Clean core: níveis A a D

> **Origem.** Adaptado de `skills/abap-cloud/SKILL.md` e `skills/abap-cloud/references/clean-core-levels.md` do repositório [likweitan/abap-skills](https://github.com/likweitan/abap-skills) (commit `b3306be`, licença MIT), que resume o guia da SAP *Extend SAP S/4HANA in the cloud and on premise with ABAP based extensions* (versão 2.3, agosto de 2025) e a SAP Note 3578329. Corrigido e traduzido. Ver [THIRD_PARTY_NOTICES.md](../../../../THIRD_PARTY_NOTICES.md).
>
> **Fonte única no projeto.** Esta é a única cópia da tabela de níveis. Os demais arquivos de referência apontam para cá.
>
> **Precedência.** O [padrao-desenvolvimento.md](../../../../standards/padrao-desenvolvimento.md) prevalece. A classificação clean core é informação para orientar a decisão e o relatório. O critério de aceite continua sendo o do tópico 13 (ATC sem erros na variante do cliente).
>
> **Literais nos exemplos** (textos, IDs de objeto, URLs) são ilustrativos. No código real, use constantes ou textos (tópico 17.4 do padrão).

## Quando ler

Ao classificar um desenvolvimento ou um achado de ATC por nível, ao escolher entre API liberada, clássica ou wrapper, e ao redigir o relatório de qualidade.

## Os quatro níveis

O conceito de níveis substituiu o modelo de 3 tiers em agosto de 2025.

| Nível | Nome | Objetos SAP usados | Estabilidade | Achado ATC |
|---|---|---|---|---|
| **A** | Extensão com SAP Build / ABAP Cloud | **Liberados**: APIs remotas e locais, pontos de extensão | Contrato de estabilidade | Nenhum |
| **B** | APIs clássicas | **Clássicos**: APIs e pontos de extensão nomeados pela SAP | Sem contrato formal, histórico estável | Prioridade 3 (informação) |
| **C** | Objetos internos | **Internos**: tudo que não foi classificado (padrão) | Pode mudar a qualquer momento | Prioridade 2 (aviso) |
| **D** | Não recomendado | **Não recomendados**: objetos `noAPI`, técnicas proibidas | Alto risco | Prioridade 1 (erro) |

Status: A = clean core; B e C = clean core condicional; D = não é clean core.

**Regra do menor nível.** Um desenvolvimento assume o **menor** nível entre os objetos que usa. Um programa nível A com uma chamada a objeto interno é nível C.

## O que cai em cada nível

**Nível A**
- ABAP for Cloud Development usando só APIs liberadas (CDS `I_*` liberadas, classes e interfaces liberadas, BO interfaces, BAdIs liberadas, extension includes liberados).
- Key user extensibility (campos, lógica e CDS customizados pelos apps Fiori).
- Side-by-side no SAP Business AI Platform (evolução do SAP BTP) consumindo APIs remotas liberadas.
- Observação: as APIs liberadas não cobrem todo o escopo funcional do S/4HANA, e a SAP não planeja cobertura total.

**Nível B**
- BAPIs e outras APIs classificadas como `classicAPI`; `CL_GUI_ALV_GRID`; BAdIs não liberadas; user exits e customer exits.
- Código próprio em Standard ABAP que só referencia objetos liberados ou clássicos.
- Wrapper sobre API clássica, liberado para ABAP Cloud.
- Aplicativos SEGW, BOPF ou UI5 próprios (prefira RAP).

**Nível C**
- Chamada a FM, classe ou interface interna da SAP.
- **Leitura** direta de tabela SAP.
- Append clássico em tabela SAP.
- Wrapper sobre objeto interno.

**Nível D**
- Objetos `noAPI` (ex.: `RFC_READ_TABLE`).
- Modificação de objeto SAP (inclusive nota aplicada com correção manual).
- Enhancement implícito e enhancement explícito com código inline (*source code plug-in*).
- **Escrita** direta em tabela SAP.
- Chamada a form routine de programa SAP.
- Instruções críticas: kernel call, system call, editor call, `EXEC SQL`, hints de banco, geração de report/Dynpro, read/insert report, import/export nametab.
- Implementação de BAdI marcada como interna da SAP.

## Mapeamento ATC → nível

| Prioridade | Nível | Achado típico | Ação |
|---|---|---|---|
| 1 (erro) | D | Objeto modificado | Remover; usar BAdI |
| 1 | D | Tecnologia de enhancement não permitida / enhancement implícito ou explícito | Remover; usar BAdI |
| 1 | D | Escrita direta em tabela SAP | API liberada ou clássica |
| 1 | D | Chamada a form routine de programa SAP | API liberada ou clássica |
| 1 | D | Uso de objeto `noAPI` | Sucessor indicado no Cloudification Repository |
| 1 | D | Instrução crítica | API liberada ou clássica |
| 2 (aviso) | C | Leitura direta de tabela/view SAP | CDS liberada ou API clássica |
| 2 | C | Uso de objeto interno | API liberada ou clássica; senão wrapper + uma isenção |
| 3 (info) | B | API depreciada | Adotar o sucessor |
| 3 | B | Uso de API clássica | Nenhuma |

Pelo tópico 13 do padrão, **todo achado de prioridade 1 reprova a entrega**. Prioridades 2 e 3 entram no relatório. Se elas bloqueiam ou não depende da configuração da variante do cliente (`varianteATC`), que deve ser consultada, não suposta.

## Modelos de desenvolvimento

| Aspecto | ABAP Cloud | ABAP clássico |
|---|---|---|
| Nível | A | B (ou C/D se usar internos/não recomendados) |
| Versão de linguagem | ABAP for Cloud Development | Standard ABAP |
| Quando | Padrão para desenvolvimento novo | Quando não houver API liberada ou a UI for clássica |
| Modelo principal | RAP | SAP GUI, ALV, Web Dynpro, SEGW, BOPF |
| Controle | Sintaxe e runtime | ATC |
| Componente de software | Componente com versão ABAP for Cloud Development | `HOME` ou componente clássico existente |

Acessos permitidos:
- **ABAP Cloud**: objetos do mesmo componente, objetos SAP liberados e objetos próprios liberados para ABAP Cloud de um componente clássico.
- **ABAP clássico**: objetos do próprio componente, APIs SAP liberadas e clássicas, objetos próprios clássicos e ABAP Cloud.

O objeto de autorização `S_ABPLNGVS` controla em qual versão de linguagem o desenvolvedor pode criar objetos.

## Restrições do ABAP for Cloud Development

- Só objetos SAP liberados (contrato C1).
- Sem acesso direto a tabelas SAP (use CDS liberadas).
- Sem Dynpro, selection screen, `WRITE` ou listas.
- Sem `CALL TRANSACTION`, `SUBMIT`, `EXEC SQL`, `INCLUDE` de programa.
- Sem BAdI clássica ou user exit (só BAdIs liberadas).
- `AUTHORITY-CHECK` **é permitido**, desde que o objeto de autorização seja liberado ou próprio.

| Clássico | Alternativa em ABAP Cloud |
|---|---|
| `sy-uname` | `cl_abap_context_info=>get_user_technical_name( )` |
| `sy-datum` / `sy-uzeit` | `cl_abap_context_info=>get_system_date( )` / `get_system_time( )` |
| `CONVERSION_EXIT_ALPHA_*` | `|{ lv_valor ALPHA = IN }|` / `ALPHA = OUT` |
| `NUMBER_GET_NEXT` | `cl_numberrange_runtime=>number_get( )` |
| `ENQUEUE_*` / `DEQUEUE_*` | Bloqueio RAP ou `cl_abap_lock_object_factory` |
| `GUID_CREATE` | `cl_system_uuid=>create_uuid_x16_static( )` |
| `JOB_OPEN` / `SUBMIT` | Application Jobs (`cl_apj_rt_api`) ou bgPF |
| `SO_NEW_DOCUMENT_ATT_SEND_API1` | `cl_bcs_mail_message` |
| SELECT em tabela SAP | CDS liberada (`I_*`) |
| `RFC_READ_TABLE` (`noAPI`) | CDS liberada ou API remota liberada |
| `MESSAGE` em lógica de negócio RAP | Mensagens em `reported` |

Mais classes em [classes-liberadas.md](../../abap-rap-dev/references/classes-liberadas.md).

## Padrão wrapper

Quando não existe API liberada, crie um wrapper num componente **clássico** e libere-o para ABAP Cloud (contrato C1). O código ABAP Cloud consome o wrapper e a violação fica isolada num só lugar.

Nível do wrapper:
- sobre API **clássica** → wrapper nível **B**;
- sobre objeto **interno** → wrapper nível **C**;
- sobre objeto **`noAPI`** → nível **D**: não construa.

Regras:
- **Tipos**: não use tipos não liberados na assinatura pública. Declare-os com `TYPES` no próprio wrapper, para que só o wrapper precise ser liberado.
- **Isenção ATC**: wrapper reduz N achados a 1. Crie **uma** isenção granular no wrapper, não uma por chamador.
- **Autorização**: APIs clássicas costumam checar objetos de autorização não liberados. Forneça dados `SU22` para o wrapper e variantes `SU22` por uso.
- **CDS**: wrapper CDS sobre a CDS não liberada da SAP (associações e value helps podem precisar de wrapper próprio). Sem CDS SAP adequada, faça a CDS sobre a tabela.
- **Aposentar**: quando a SAP liberar a API, troque o wrapper por ela.

```abap
" Componente clássico. Wrapper de BAPI (API clássica) => nível B.
" Liberar em ADT: propriedades > API State > Use System-Internally (C1), visibilidade "Use in Cloud Development".
CLASS zclsd_wrp_ordem_venda DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: ty_ordem TYPE c LENGTH 10,
           BEGIN OF ty_retorno,
             tipo     TYPE c LENGTH 1,
             mensagem TYPE c LENGTH 220,
           END OF ty_retorno,
           tt_retorno TYPE STANDARD TABLE OF ty_retorno WITH EMPTY KEY.

    METHODS obter_status
      IMPORTING iv_ordem          TYPE ty_ordem
      RETURNING VALUE(rt_retorno) TYPE tt_retorno.
ENDCLASS.

CLASS zclsd_wrp_ordem_venda IMPLEMENTATION.
  METHOD obter_status.
    DATA lt_status TYPE STANDARD TABLE OF bapisdstat.
    DATA ls_return TYPE bapireturn.

    CALL FUNCTION 'BAPI_SALESORDER_GETSTATUS'
      EXPORTING salesdocument = iv_ordem
      IMPORTING return        = ls_return
      TABLES    statusinfo    = lt_status.

    IF ls_return-type CA 'EA'.
      APPEND VALUE #( tipo = ls_return-type  mensagem = ls_return-message ) TO rt_retorno.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

O `TABLES` acima é exigência da assinatura da BAPI SAP. O padrão proíbe `TABLES` apenas em funções próprias.

## Changelog de objetos SAP (mitigação do nível C)

Lista objetos internos que sofrerão mudança incompatível (exclusão de objeto, parâmetro ou método; mudança de tipo; remoção de campo de CDS). Cobre `FUNC`, `CLAS`, `INTF`, `STOB` e `BDEF`.

1. Baixar o arquivo da Simplification Database no SAP Software Download Center.
2. Importar pela transação `SYCM`.
3. Rodar o check de changelog do ATC no desenvolvimento ou antes do upgrade.

Estar no changelog não rebaixa o objeto para nível D automaticamente, mas é sinal para refatorar.

## Onde descobrir a classificação

| Meio | Uso |
|---|---|
| Cloudification Repository | `objectReleaseInfo*.json` (liberação) e `objectClassifications_SAP.json` (`classicAPI`, `internalAPI`, `noAPI`) |
| Viewer | <https://sap.github.io/abap-atc-cr-cv-s4hc/?version=objectClassifications_SAP.json> (filtrar por `state`) |
| SAP Business Accelerator Hub | APIs remotas e locais liberadas |
| ADT | Árvore *Released Objects*; aba *API State* do objeto |
| SAP Note 3578329 | Classificação de tecnologias clássicas, serviços de reuso e frameworks |

Rótulos do JSON: `remote-enabled` (habilitada para RFC) e `transactional-consistent` (pode ser usada dentro de RAP). Uma API clássica **sem** `transactional-consistent` não deve ser chamada em handler RAP.

Tipos DDIC (elementos de dados, estruturas) não são classificados nem checados quando usados como tipo. Só o acesso SQL a tabelas SAP é checado.

## Fontes

- Guia SAP *Extend SAP S/4HANA in the cloud and on premise with ABAP based extensions*, v2.3 (agosto de 2025)
- SAP Note 3578329 (classificação de tecnologias clássicas) e SAP Note 3565942 (checks ATC de clean core)
- [SAP Cloudification Repository](https://github.com/SAP/abap-atc-cr-cv-s4hc)
- [SAP ABAP Cheat Sheets: ABAP Cloud](https://github.com/SAP-samples/abap-cheat-sheets/blob/main/19_ABAP_for_Cloud_Development.md)
