# ADR-0011: Fallback de desenvolvimento em S/4HANA 2025+

- **Status:** Proposto
- **Data:** 2026-11-24

## Contexto

O [ADR-0009](0009-selecao-de-mcp-abap-por-versao-e-ambiente.md) define o `abap-adt` (MCP oficial SAP) como único servidor de um sistema S/4HANA 2025+. O launcher reforça isso: o `vsp` recusa iniciar em SAP_BASIS ≥ 816 e o `arc-1` fica somente leitura.

O MCP oficial ainda está em evolução, e a SAP pode não ter entregado alguma operação de desenvolvimento (por exemplo, criar ou ativar um tipo de objeto). Nesse caso, a política não dizia o que fazer: o agente parava ou improvisava, por exemplo gerando o código para criação manual sem regra definida.

## Decisão

1. **Cadeia de fallback, só para desenvolvimento em DEV/SANDBOX 2025+:** `abap-adt` → `vsp` → `arc-1` → execução manual. Para no primeiro que atender, sempre no mesmo sistema.
2. **O fallback vale só quando a operação não existe no servidor**, segundo uma tabela de sinais na política: ferramenta ausente, tipo ou ação fora do esquema, "não suportado" e HTTP 404/501 no endpoint contam. Erro do objeto ou do sistema (sintaxe, bloqueio, autorização, request, pacote, timeout) não conta, e sinal ambíguo também não.
3. **Evidência e confirmação a cada passo da cadeia:** o orquestrador mostra ao usuário a operação, o servidor, a evidência (ferramenta consultada ou erro literal) e o sinal da tabela, e só segue com a confirmação dele.
4. **Só a operação que faltou sai do `abap-adt`.** O restante da entrega, inclusive ATC e ABAP Unit, continua nele.
5. **Execução manual só com autorização do usuário:** o orquestrador informa o que faltou em cada servidor e entrega código e passo a passo para o ADT. Depois, confere o objeto pelo `abap-adt`, e o ATC segue normalmente.
6. **Trava técnica com opt-in explícito**, desligada por padrão:
   - `vsp`: `VSP_FALLBACK_2025=true`;
   - `arc-1`: pela entrada `arc-1-dev`, apontada para o DEV, `ARC1_DEV_FALLBACK_2025=true`, além de `ARC1_DEV_ALLOW_DEV_WRITES=true` e `ARC1_DEV_ALLOWED_PACKAGES`.

   As flags são ignoradas fora de DEV/SANDBOX, exigem SID confirmado e mantêm todas as demais travas. O modo no runtime indica `(fallback do abap-adt)`.
7. Regras completas na seção 4.4 de `standards/politica-mcp-abap.md`.

## Alternativas consideradas

- **Parar e informar, sem fallback.** É a mais segura, mas trava a entrega sempre que o MCP oficial tiver uma lacuna.
- **Ir direto para a execução manual.** Perde a automação que o `vsp` e o `arc-1` já oferecem no mesmo sistema.
- **Liberar `vsp` e `arc-1` em 2025+ sem opt-in.** O launcher não tem como saber se o `abap-adt` atendeu a operação. Com os servidores sempre disponíveis, o agente poderia preferi-los ao oficial. O opt-in torna o uso deliberado.

## Consequências

- (+) Lacunas do MCP oficial não bloqueiam a entrega, e o caminho fica definido e auditável no relatório.
- (+) QAS/PRD não mudam: nenhuma escrita, com qualquer servidor.
- (−) Usar `vsp`/`arc-1` num sistema 2025+ reabre as questões de compliance do ADR-0009 (APIs ADT internas, FAQ Q33, aceite formal do cliente).
- (−) A regra "só quando a operação não existe" é procedural. O launcher só garante que o servidor sobe com opt-in e em DEV/SANDBOX. A tabela de sinais e a evidência mostrada ao usuário reduzem o risco de o agente classificar errado, mas a decisão final é do usuário.
- (−) Ligar o fallback exige reiniciar a sessão da ferramenta de IA.

## Evidências

- `scripts/mcp-politica.mjs` (`decidir`) e testes em `scripts/test/mcp-politica.test.mjs`.
- `standards/politica-mcp-abap.md`, seções 1, 4.2, 4.3, 4.4 e 6.
