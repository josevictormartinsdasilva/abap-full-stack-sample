# ADR-0015: ARC-1 como complemento do vsp para tipos não suportados em S/4HANA ≤ 2023

- **Status:** Aceito (2026-11-25)
- **Data:** 2026-11-25

## Contexto

O [ADR-0009](0009-selecao-de-mcp-abap-por-versao-e-ambiente.md) define o `vsp` como o servidor de desenvolvimento de um DEV/SANDBOX S/4HANA ≤ 2023. Pela seção 4.2 da política, o `arc-1` só grava nesse DEV quando o cliente **não autoriza o `vsp`**. A cadeia de fallback `vsp` → `arc-1` do [ADR-0011](0011-fallback-de-desenvolvimento-em-s4hana-2025.md) vale só para 2025+.

Numa POC de app RAP + Fiori Elements (S/4HANA 2023, SAP_BASIS 758, `vsp` v2.62.1), o `vsp` recusou dois tipos de objeto RAP comuns:

| Tipo | Mensagem literal do `vsp` |
|---|---|
| Controle de acesso (DCLS) | `Failed to create object: unsupported object type: DCLS/DL` |
| Metadata extension (DDLX) | `unsupported object type: DDLX/EX` / `No handler found for action="edit" target="DDLX"` |

O ARC-1 1.11.0 lista DCLS e DDLX entre os tipos do `SAPWrite` (README do pacote instalado). Hoje esses objetos viram execução manual no ADT, e em todo app RAP com Fiori Elements haverá pelo menos um DCL e um DDLX. A automação para justamente na camada de autorização e de UI, e o desenvolvedor precisa colar fontes à mão.

Nenhum dos dois servidores cria objeto de autorização (SU20/SU21: `vsp` "unsupported object type: SUSO/B" e "AUTH"; no ARC-1 o tipo `AUTH` é só leitura) nem publica service binding em mandante de customizing (recusa do próprio SAP). Esses casos continuam manuais e ficam fora desta decisão.

## Decisão

1. **Complemento restrito ao `vsp`, só em DEV/SANDBOX S/4HANA ≤ 2023:** quando o `vsp` não oferecer a criação ou a edição de um tipo de objeto, o `arc-1` pode executar essa operação no mesmo sistema, pela entrada `arc-1-dev`.
2. **Só conta como operação ausente o sinal da tabela da seção 4.4 da política**: tipo fora do esquema, "unsupported object type", "no handler found" e HTTP 404/501. Erro do objeto ou do sistema (sintaxe, bloqueio, autorização, request, pacote, timeout) não conta.
3. **Escopo por operação, não por entrega.** Só o objeto do tipo não suportado sai do `vsp`: ativação do restante, ATC e ABAP Unit continuam no `vsp`. A lista de tipos conhecidos fica na política (hoje DCLS e DDLX). Um tipo novo entra na lista só com evidência literal do `vsp` e confirmação do usuário.
4. **Evidência e confirmação:** a cada uso, o orquestrador mostra ao usuário o tipo, a mensagem literal do `vsp` e o objeto, e só segue com a confirmação dele. Para os tipos já listados na política, a confirmação pode ser dada uma vez por entrega (GAP).
5. **Trava técnica, opt-in explícito e desligado por padrão:**
   - `ARC1_DEV_ALLOW_DEV_WRITES=true`;
   - `ARC1_DEV_ALLOWED_PACKAGES` com o **pacote do GAP**, nunca `Z*`;
   - SID do `arc-1-dev` igual ao do `vsp` e ao `cliente.sistemaDesenvolvimento` (`ARC1_DEV_SAP_SID` preenchido);
   - as travas fixas da seção 4.2 continuam (`SAPWrite.delete` negado, sem escrita de transporte nem Git, sem prévia de dados nem SQL livre).

   **Ao terminar a entrega, o desenvolvedor comenta as duas flags e reinicia a sessão.**
6. **Nada muda fora de DEV/SANDBOX ≤ 2023:** QAS segue somente leitura com qualquer servidor, PRD segue fora de alcance ([ADR-0014](0014-ambiente-produtivo-fora-do-alcance-dos-agentes.md)) e 2025+ segue o ADR-0011.

## Alternativas consideradas

- **Manter manual no ADT.** É o caminho mais restritivo e não muda a política. A desvantagem é que todo app RAP fica com passos manuais recorrentes, justamente nos objetos que garantem autorização (DCL) e UI (DDLX), e um DCL esquecido deixa o app aberto a todos os usuários sem erro visível.
- **Trocar o `vsp` pelo `arc-1` em todo o desenvolvimento ≤ 2023.** Inverte a escolha do ADR-0009 sem avaliação própria e amplia a superfície de escrita do ARC-1 sem necessidade.
- **Anotações `@UI` direto na CDS de consumo ou anotações locais no app Fiori**, para dispensar o DDLX. Fere o tópico 8.31 do padrão e não resolve o DCL.
- **Gerar os objetos por RFC ou por um programa** que grave as tabelas do repositório. Fica fora do registro normal em request e pacote e da validação do editor. Descartado.

## Consequências

- (+) O app RAP sai completo pelos agentes, com DCL ativo desde o desenvolvimento, sem colar fontes à mão.
- (+) O uso fica rastreável: tipo, evidência e servidor aparecem no relatório do orquestrador.
- (−) **A restrição a DCLS/DDLX é procedural.** O `SAP_DENY_ACTIONS` do ARC-1 nega por ação (`SAPWrite.create`, `SAPWrite.delete`…), não por tipo de objeto, então com a escrita ligada o ARC-1 consegue gravar qualquer tipo do `SAPWrite` no pacote permitido. As travas técnicas são o pacote único e o opt-in desligado por padrão.
- (−) Usar o ARC-1 com escrita num sistema de cliente reabre as questões de compliance do ADR-0009 (APIs ADT internas, aceite formal do cliente). Registre o aceite do cliente antes de ligar o opt-in num sistema dele.
- (+) **Gravação em request existente confirmada.** O launcher passa `SAP_ALLOW_TRANSPORT_WRITES=false`, e havia o risco de o ARC-1 não conseguir gravar num pacote transportável. Na POC, o ARC-1 1.11.0 gravou o objeto na request já existente (`corrNr`) com `SAP_ALLOW_TRANSPORT_WRITES=false`, então a decisão vale para pacote transportável sem ajuste no launcher.
- (−) Ligar e desligar o opt-in exige reiniciar a sessão da ferramenta de IA.

## Evidências

- Mensagens literais do `vsp` na POC (S/4HANA 2023, SAP_BASIS 758, DEV, 25/11/2026), na tabela do Contexto.
- Mesma POC: o `arc-1-dev` (ARC-1 1.11.0) gravou na request existente com `SAP_ALLOW_TRANSPORT_WRITES=false` (risco da gravação em request, fechado na seção Consequências).
- `arc-1@1.11.0`, README: `SAPWrite` "(PROG, CLAS, INTF, FUNC, FUGR, INCL, DDLS, DCLS, DDLX, BDEF, SRVD, SRVB, SKTD/KTD, TABL, DOMA, DTEL, MSAG …)"; `AUTH` só no `SAPRead`.
- `arc-1@1.11.0`, `dist/server/config.js`: `SAP_DENY_ACTIONS` por ação; `SAP_ALLOWED_OPS` removido.
- `scripts/mcp-politica.mjs`: `ALLOW_DEV_WRITES` já é aceito em DEV/SANDBOX ≤ 2023 (seção 4.2). Não é preciso mudar o launcher.
- `standards/politica-mcp-abap.md`, seções 4.2, 4.3 e 4.4.
