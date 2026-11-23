# Avisos de terceiros

Partes do material de referência das skills (`.agents/skills/*/references/`) foram adaptadas de projetos de terceiros. Cada arquivo adaptado indica a origem no cabeçalho. A decisão está registrada no [ADR-0010](docs/adr/0010-material-de-referencia-de-terceiros-nas-skills.md).

## likweitan/abap-skills

- Repositório: <https://github.com/likweitan/abap-skills>
- Versão usada: commit `b3306be` (3 de novembro de 2026)
- Licença: MIT

```
MIT License

Copyright (c) 2026 Lik Wei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Arquivos derivados:

| Arquivo neste projeto | Origem |
|---|---|
| `.agents/skills/abap-rap-dev/references/rap-bdl-eml.md` | `skills/rap/` |
| `.agents/skills/abap-rap-dev/references/cds-view-entities.md` | `skills/cds-view-entities/` |
| `.agents/skills/abap-rap-dev/references/classes-liberadas.md` | `skills/released-abap-classes/` |
| `.agents/skills/abap-rap-dev/references/abap-sql-amdp.md` | `skills/abap-sql-amdp/` |
| `.agents/skills/abap-qa-auditor/references/clean-core-niveis.md` | `skills/abap-cloud/` |
| `.agents/skills/abap-qa-auditor/references/atc-cloudification.md` | `skills/atc-cloudification/` |
| `.agents/skills/abap-qa-auditor/references/abap-unit-testing.md` | `skills/abap-unit-testing/` |
| `.agents/skills/abap-classic-dev/references/badi-enhancements.md` | `skills/badi-enhancement/` |
| `.agents/skills/abap-classic-dev/references/migracao-clean-core.md` | `skills/abap-cloud-migration/` |

Os textos foram traduzidos, resumidos e corrigidos. Os exemplos de código foram reescritos com a nomenclatura deste projeto.

## SAP-samples/abap-cheat-sheets

- Repositório: <https://github.com/SAP-samples/abap-cheat-sheets>
- Licença: Apache License 2.0 (<https://www.apache.org/licenses/LICENSE-2.0>)
- Copyright: SAP SE ou empresa afiliada da SAP e colaboradores do projeto

`classes-liberadas.md` resume o cheat sheet `22_Released_ABAP_Classes.md`, que o repositório `likweitan/abap-skills` reproduz. O resumo lista classes e reescreve exemplos de uso com base nesse material. Os demais arquivos citam os cheat sheets como fonte, sem reproduzi-los.

## Material da SAP citado

Os arquivos de clean core resumem conceitos do guia da SAP *Extend SAP S/4HANA in the cloud and on premise with ABAP based extensions* (v2.3, agosto de 2025) e das SAP Notes 3565942 e 3578329. Esse material é citado como referência; nenhum trecho foi reproduzido.
