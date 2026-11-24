# ADR-0010: Material de referência de terceiros nas skills

- **Status:** Proposto
- **Data:** 2026-11-23

## Contexto

As skills do projeto (`.agents/skills/`) descrevem **processo**: nomenclatura, política de MCP, ATC obrigatório. Faltava material **técnico** de apoio: sintaxe de BDL/EML, CDS, classes liberadas, níveis de clean core, ATC de clean core, ABAP Unit, BAdIs e remediação de código clássico.

O repositório comunitário [likweitan/abap-skills](https://github.com/likweitan/abap-skills) (commit `b3306be`, licença MIT, versão `0.1.0-alpha`, um mantenedor) tem 17 skills com esse tipo de conteúdo. A revisão de 2026-11-23 encontrou:

- conteúdo útil e atual sobre clean core (níveis A–D, que substituíram os 3 tiers em agosto de 2025), classes liberadas, ATC e testes;
- **erros de sintaxe nos exemplos centrais**, por exemplo:
  - BDEF com `late numbering` junto de `numbering : managed`;
  - associações sem `with draft` em BO draft;
  - handler de autorização incompatível com o BDEF;
  - alias duplicado na CDS raiz;
  - `GET BADI` com variável do tipo da interface;
  - `cl_abap_format=>alpha_input( )`, que não existe;
- **erros conceituais** em algumas skills:
  - a afirmação de que `AUTHORITY-CHECK` não é permitido em ABAP Cloud;
  - `RAISE ENTITY EVENT` em handler da fase de interação;
- nomenclatura genérica (`ZR_*`, `ZC_*`, `zbp_r_*`) e estilo Clean ABAP sem prefixos, em conflito com `standards/`;
- cópias literais de material da SAP sem atribuição (`Released_ABAP_Classes.md`, `CleanABAP.md`).

## Decisão

1. **Incorporar seletivamente, como material de referência, não como skills.** O conteúdo vai para `.agents/skills/<skill>/references/` das skills existentes, e cada `SKILL.md` ganha uma tabela "Referências" dizendo **quando** ler cada arquivo. Nenhuma skill nova é criada, para não haver gatilhos concorrentes com `abap-rap-dev`, `abap-classic-dev` e `abap-qa-auditor`.
2. **O que entra:**

   | Origem | Destino |
   |---|---|
   | `rap` | `abap-rap-dev/references/rap-bdl-eml.md` |
   | `cds-view-entities` | `abap-rap-dev/references/cds-view-entities.md` |
   | `released-abap-classes` | `abap-rap-dev/references/classes-liberadas.md` (resumo curado, não a cópia de 9.781 linhas) |
   | `abap-sql-amdp` | `abap-rap-dev/references/abap-sql-amdp.md` (**opcional**) |
   | `abap-cloud` | `abap-qa-auditor/references/clean-core-niveis.md` |
   | `atc-cloudification` | `abap-qa-auditor/references/atc-cloudification.md` |
   | `abap-unit-testing` | `abap-qa-auditor/references/abap-unit-testing.md` |
   | `badi-enhancement` | `abap-classic-dev/references/badi-enhancements.md` |
   | `abap-cloud-migration` | `abap-classic-dev/references/migracao-clean-core.md` |

3. **O que fica de fora, e por quê:**

   | Skill | Motivo |
   |---|---|
   | `authorization-iam` | Erro de base: substitui `AUTHORITY-CHECK` por uma API (`CL_ABAP_AUTHORIZATION=>check_authorization`) que não encontramos documentada; o exemplo de autorização RAP depende dela |
   | `rap-business-events` | Eventos disparados fora da sequência de save; sintaxe errada do handler de evento local; namespace SAP para eventos próprios |
   | `odata` | Superficial e sobreposta a `abap-rap-dev` e `fiori-elements-dev`; nomenclatura contrária à do projeto |
   | `abap` (abaplint + Clean ABAP) | Estilo sem prefixos conflita com o tópico 12; o gate de qualidade é o ATC |
   | `abapgit` | O fluxo do projeto é por request e transporte |
   | `btp-abap-environment` | O projeto mira S/4HANA; reavaliar se houver cliente em BTP ABAP Environment |
   | `sap-fiori-url-generator` | Depende de um catálogo estático de 4,8 MB que envelhece |
   | `btp-diagram-generator` | Fora do escopo |

4. **Regras para o material incorporado:**
   - `standards/` prevalece. As referências **apontam** para as regras do padrão em vez de copiá-las; os exemplos seguem a nomenclatura de `naming-conventions.json` e os prefixos do tópico 12.
   - Erros conhecidos da origem são corrigidos. O que não foi confirmado em documentação pública fica marcado *(a confirmar)* ou sai do texto (por exemplo, o nome técnico `SYCM_ALLOWED_ENH_TECHNOLOGY` e o ID de app Fiori `F5865`).
   - A tabela de níveis A–D existe **uma vez** (`clean-core-niveis.md`); os outros arquivos apontam para ela.
   - Cada arquivo traz no cabeçalho a origem, o commit e a licença. As licenças ficam em `THIRD_PARTY_NOTICES.md`.

## Alternativas consideradas

- **Instalar as 17 skills como estão** (`npx skills add` ou cópia para `.claude/skills/`). Rejeitada: gatilhos concorrentes, exemplos com erro copiados pelos agentes, nomenclatura divergente e uma segunda fonte de verdade fora de `.agents/`.
- **Referenciar o repositório por link, sem incorporar.** Rejeitada: os agentes leriam os exemplos com erro e com a nomenclatura errada.
- **Escrever o material do zero.** Mais caro, sem ganho de qualidade em relação a adaptar e corrigir.
- **Copiar `Released_ABAP_Classes.md` inteiro.** Rejeitada: congela uma versão de um material que a SAP atualiza com frequência. O resumo aponta para o original.

## Consequências

- (+) Os especialistas passam a ter referência técnica corrigida e alinhada à nomenclatura, carregada só quando a tarefa pede.
- (+) O relatório do `abap-qa-auditor` pode classificar achados por nível de clean core, sem mudar o critério de aceite (ATC sem erros, [ADR-0006](0006-atc-tolerancia-zero-como-criterio-de-entrega.md)).
- (−) **As correções não foram validadas num sistema SAP.** Os servidores MCP não estavam conectados na sessão de criação. Os exemplos de BDEF, CDS e classes devem passar por syntax check no DEV quando houver acesso (sem criar objetos, ou em pacote `$TMP`).
- (−) **Manutenção:** o material envelhece com novos releases e novas versões do cheat sheet da SAP. Não há sincronização automática com a origem.
- (−) **Divergência encontrada no padrão:** o nome de método AMDP é `GET_*` no tópico 11.1 do `padrao-desenvolvimento.md` e `AMDP_<ACAO>` em `naming-conventions.json`. As referências seguem o JSON. A divergência precisa ser resolvida no `standards/`.

## Evidências

- Revisão de `likweitan/abap-skills` em 2026-11-23, commit `b3306be`.
- Nomes de arquivos dos cheat sheets conferidos em `SAP-samples/abap-cheat-sheets` (commit `01fc2d0`).
- SAP Notes 3565942 e 3578329 e KBA 3786507, citadas em fontes públicas da comunidade SAP; textos das notas não consultados.
- `THIRD_PARTY_NOTICES.md`, `.agents/skills/*/references/`.
