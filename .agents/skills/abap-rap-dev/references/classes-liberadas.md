# Classes liberadas para ABAP Cloud (resumo curado)

> **Origem.** Resumo de `skills/released-abap-classes/` do repositório [likweitan/abap-skills](https://github.com/likweitan/abap-skills) (commit `b3306be`, licença MIT), que por sua vez reproduz o cheat sheet [22_Released_ABAP_Classes.md](https://github.com/SAP-samples/abap-cheat-sheets/blob/main/22_Released_ABAP_Classes.md) do repositório SAP-samples/abap-cheat-sheets (licença Apache-2.0, © SAP SE ou afiliada). Exemplos reescritos com os prefixos do tópico 12 de [padrao-desenvolvimento.md](../../../../standards/padrao-desenvolvimento.md). Ver [THIRD_PARTY_NOTICES.md](../../../../THIRD_PARTY_NOTICES.md).
>
> **Este é um resumo.** A SAP atualiza o cheat sheet com frequência. Para classes fora desta lista, ou para assinaturas completas, consulte o original no link acima e confirme no sistema (ADT, árvore *Released Objects*) antes de usar.
>
> **Literais nos exemplos** (textos, IDs de objeto, URLs) são ilustrativos. No código real, use constantes ou textos (tópico 17.4 do padrão).

## Quando ler

Ao escrever código em ABAP for Cloud Development (ou código clássico que deva ficar em nível A) e precisar de UUID, data/hora, usuário, e-mail, HTTP, JSON, log, processamento em background, bloqueio, numeração, XLSX ou expressões regulares.

## Por categoria

| Categoria | Classes |
|---|---|
| Saída no console ADT | `IF_OO_ADT_CLASSRUN` |
| UUID | `CL_SYSTEM_UUID`, `XCO_CP=>UUID` |
| Data, hora, usuário | `CL_ABAP_CONTEXT_INFO`, `XCO_CP=>SY`, `XCO_CP_TIME`, `CL_ABAP_TSTMP`, `CL_ABAP_UTCLONG` |
| Texto | `CL_ABAP_CHAR_UTILITIES`, `CL_ABAP_STRING_UTILITIES` |
| Expressões regulares | `CL_ABAP_REGEX`, `CL_ABAP_MATCHER` |
| Codepage e binário | `CL_ABAP_CONV_CODEPAGE`, `CL_ABAP_GZIP`, `CL_WEB_HTTP_UTILITY` |
| JSON e XML | `XCO_CP_JSON`, `/UI2/CL_JSON`, `CL_SXML_*`, `CL_IXML_*` |
| E-mail | `CL_BCS_MAIL_MESSAGE`, `CL_BCS_MAIL_TEXTPART`, `CL_BCS_MAIL_BINARYPART` |
| HTTP | `CL_WEB_HTTP_CLIENT_MANAGER`, `CL_HTTP_DESTINATION_PROVIDER` |
| RAP | `CL_ABAP_BEHAVIOR_HANDLER`, `CL_ABAP_BEHAVIOR_SAVER`, `CL_ABAP_BEHV_AUX`, `CL_ABAP_TX` |
| Log de aplicação | `CL_BALI_LOG`, `CL_BALI_LOG_DB`, `CL_BALI_*_SETTER`, `XCO_CP_BAL` |
| Background (bgPF) | `CL_BGMC_PROCESS_FACTORY` |
| Application Jobs | `CL_APJ_RT_API`, `CL_APJ_DT_CREATE_CONTENT` |
| Bloqueio | `CL_ABAP_LOCK_OBJECT_FACTORY` |
| Numeração | `CL_NUMBERRANGE_RUNTIME`, `CL_NUMBERRANGE_OBJECTS`, `CL_NUMBERRANGE_INTERVALS` |
| Processamento paralelo | `CL_ABAP_PARALLEL` |
| XLSX | `XCO_CP_XLSX` |
| ZIP | `CL_ABAP_ZIP` |
| RTTS | `CL_ABAP_TYPEDESCR` e subclasses |
| Testes | `CL_ABAP_UNIT_ASSERT`, `CL_OSQL_TEST_ENVIRONMENT`, `CL_CDS_TEST_ENVIRONMENT`, `CL_ABAP_TESTDOUBLE` |

## Exemplos

### UUID

```abap
TRY.
    DATA(lv_uuid_x16) = cl_system_uuid=>create_uuid_x16_static( ).
    DATA(lv_uuid_c36) = cl_system_uuid=>create_uuid_c36_static( ).
  CATCH cx_uuid_error INTO DATA(lo_erro_uuid).
ENDTRY.

DATA(lv_uuid_xco) = xco_cp=>uuid( )->value.
```

### Data, hora e usuário (substituem `sy-datum`, `sy-uzeit`, `sy-uname`)

```abap
DATA(lv_data)    = cl_abap_context_info=>get_system_date( ).
DATA(lv_hora)    = cl_abap_context_info=>get_system_time( ).
DATA(lv_usuario) = cl_abap_context_info=>get_user_technical_name( ).
DATA(lv_nome)    = cl_abap_context_info=>get_user_formatted_name( ).

" XCO: data/hora em UTC e formatos
DATA(lv_data_utc)   = xco_cp=>sy->date( xco_cp_time=>time_zone->utc )->as( xco_cp_time=>format->abap )->value.
DATA(lv_moment_iso) = xco_cp=>sy->moment( xco_cp_time=>time_zone->utc )->as( xco_cp_time=>format->iso_8601_extended )->value.
```

### E-mail

```abap
TRY.
    DATA(lo_mail) = cl_bcs_mail_message=>create_instance( ).
    lo_mail->set_sender( 'remetente@empresa.com' ).
    lo_mail->add_recipient( 'destinatario@empresa.com' ).
    lo_mail->set_subject( 'Assunto' ).
    lo_mail->set_main( cl_bcs_mail_textpart=>create_instance(
                         iv_content      = '<p>Corpo da mensagem.</p>'
                         iv_content_type = 'text/html' ) ).
    lo_mail->send( IMPORTING et_status = DATA(lt_status) ).
  CATCH cx_bcs_mail INTO DATA(lo_erro_mail).
ENDTRY.
```

O envio depende da configuração de e-mail do sistema (cenário de comunicação ou SMTP).

### HTTP

Em produção, crie a destination por communication arrangement (ou destination do BTP). `create_by_url` é só para testes e serviços públicos.

```abap
TRY.
    DATA(lo_destino) = cl_http_destination_provider=>create_by_comm_arrangement(
                         comm_scenario = 'ZSD_CS_PARCEIRO'
                         service_id    = 'ZSD_OUT_PARCEIRO_REST' ).
    DATA(lo_cliente) = cl_web_http_client_manager=>create_by_http_destination( lo_destino ).
    DATA(lo_request) = lo_cliente->get_http_request( ).
    lo_request->set_uri_path( '/api/pedidos' ).
    DATA(lo_response) = lo_cliente->execute( if_web_http_client=>get ).
    DATA(lv_status)   = lo_response->get_status( )-code.
    DATA(lv_corpo)    = lo_response->get_text( ).
    lo_cliente->close( ).
  CATCH cx_http_dest_provider_error cx_web_http_client_error INTO DATA(lo_erro_http).
ENDTRY.
```

### JSON

```abap
" ABAP -> JSON
DATA(lv_json) = xco_cp_json=>data->from_abap( ls_pedido )->to_string( ).

" JSON -> ABAP
xco_cp_json=>data->from_string( lv_json )->write_to( REF #( ls_pedido ) ).

" /UI2/CL_JSON (útil para mapear camelCase)
DATA(lv_json2) = /ui2/cl_json=>serialize( data = ls_pedido pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
/ui2/cl_json=>deserialize( EXPORTING json = lv_json2 pretty_name = /ui2/cl_json=>pretty_mode-camel_case
                           CHANGING  data = ls_pedido ).
```

### Log de aplicação (BALI)

Requer objeto/subobjeto de log criados no ADT e autorização `S_APPL_LOG`.

```abap
TRY.
    DATA(lo_log) = cl_bali_log=>create( ).
    lo_log->set_header( header = cl_bali_header_setter=>create(
                                   object      = 'ZSD_LOG'
                                   subobject   = 'ORDEM'
                                   external_id = CONV #( lv_ordem_id ) ) ).
    lo_log->add_item( item = cl_bali_free_text_setter=>create(
                               severity = if_bali_constants=>c_severity_status
                               text     = 'Processamento iniciado' ) ).
    lo_log->add_item( item = cl_bali_exception_setter=>create(
                               severity  = if_bali_constants=>c_severity_error
                               exception = lo_erro ) ).
    cl_bali_log_db=>get_instance( )->save_log( log = lo_log ).
  CATCH cx_bali_runtime INTO DATA(lo_erro_log).
ENDTRY.
```

### Background Processing Framework (bgPF)

A classe da operação implementa `IF_BGMC_OP_SINGLE` (com controle transacional, contexto RAP) ou `IF_BGMC_OP_SINGLE_TX_UNCONTR` (sem controle).

```abap
TRY.
    DATA(lo_processo) = cl_bgmc_process_factory=>get_default( )->create( ).
    lo_processo->set_name( 'Recalcular ordens' ).
    lo_processo->set_operation_tx_uncontrolled( NEW zclsd_op_recalculo( ) ).
    lo_processo->save_for_execution( ).
    " Fora de RAP, o processo só inicia após COMMIT WORK. Em RAP, o framework faz o commit.
  CATCH cx_bgmc INTO DATA(lo_erro_bgmc).
ENDTRY.
```

### Bloqueio (substitui `ENQUEUE_*` / `DEQUEUE_*`)

```abap
TRY.
    DATA(lo_lock) = cl_abap_lock_object_factory=>get_instance( iv_name = 'EZSD_ORDEM' ).
    lo_lock->enqueue( it_parameter = VALUE #( ( name = 'ORDEM_ID' value = REF #( lv_ordem_id ) ) ) ).
    " ...
    lo_lock->dequeue( it_parameter = VALUE #( ( name = 'ORDEM_ID' value = REF #( lv_ordem_id ) ) ) ).
  CATCH cx_abap_lock_failure cx_abap_foreign_lock INTO DATA(lo_erro_lock).
ENDTRY.
```

Em BO RAP, prefira o bloqueio do próprio framework (`lock master`).

### Numeração (substitui `NUMBER_GET_NEXT`)

```abap
TRY.
    cl_numberrange_runtime=>number_get(
      EXPORTING nr_range_nr = '01'
                object      = 'ZSD_ORDEM'
      IMPORTING number      = DATA(lv_numero)
                returncode  = DATA(lv_rc) ).
  CATCH cx_nr_object_not_found cx_number_ranges INTO DATA(lo_erro_nr).
ENDTRY.
```

### Conversões que não precisam de classe

```abap
" Substitui CONVERSION_EXIT_ALPHA_INPUT / _OUTPUT
DATA(lv_com_zeros) = |{ lv_material ALPHA = IN }|.
DATA(lv_sem_zeros) = |{ lv_material ALPHA = OUT }|.
```

## Verificar se um objeto é liberado

| Meio | Como |
|---|---|
| ADT | Árvore *Released Objects* no Project Explorer; propriedades do objeto, aba *API State* |
| Cloudification Repository | Viewer em <https://sap.github.io/abap-atc-cr-cv-s4hc/> (estado `released`, `deprecated`, sucessor) |
| SAP Business Accelerator Hub | <https://api.sap.com/> (APIs remotas e locais liberadas) |
| ATC | Check de uso de APIs (ver [atc-cloudification.md](../../abap-qa-auditor/references/atc-cloudification.md)) |

Se não houver classe liberada: use uma API clássica (nível B) em código clássico ou crie um wrapper liberado. Ver [clean-core-niveis.md](../../abap-qa-auditor/references/clean-core-niveis.md).
