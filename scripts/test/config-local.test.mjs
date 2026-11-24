// Testes das funções de configuração local (scripts/config-local.mjs), usadas pelo setup, pelo
// doctor e pelo launcher. Só texto: não toca em arquivo nem em SAP.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  NAO_SE_APLICA_CTS, atualizarCliente, atualizarDotEnv, atualizarProjetoCTS, camposPendentes, formatarValorEnv,
  lerDiagnostico, lerDotEnv, situacaoProjetoCTS,
  placeholdersPadrao, preencherPadrao, prefixoDoServidor, recusaEsperada2025, situacaoConexao,
} from "../config-local.mjs";

describe("prefixoDoServidor", () => {
  test("nome da entrada define ferramenta e prefixo", () => {
    assert.deepEqual(prefixoDoServidor("vsp"), { tool: "vsp", prefix: "VSP" });
    assert.deepEqual(prefixoDoServidor("vsp-sandbox"), { tool: "vsp", prefix: "VSP_SANDBOX" });
    assert.deepEqual(prefixoDoServidor("arc-1-qas"), { tool: "arc-1", prefix: "ARC1_QAS" });
    assert.deepEqual(prefixoDoServidor("arc-1"), { tool: "arc-1", prefix: "ARC1" });
  });
  test("outros servidores não têm prefixo", () => {
    assert.equal(prefixoDoServidor("abap-adt"), null);
    assert.equal(prefixoDoServidor("fiori-mcp"), null);
  });
});

describe("lerDotEnv / formatarValorEnv", () => {
  test("comentário só em linha própria; # no valor faz parte dele", () => {
    assert.deepEqual(lerDotEnv("# X=1\nA=abc # x\n  export B = 'q'\n"), { A: "abc # x", B: "q" });
  });
  test("valor escrito é lido de volta igual", () => {
    for (const v of ["simples", "com # e = e <x>", " espaço ", "'aspas'", '"duplas"', "$TMP,Z*", "a'b\"c"]) {
      const lido = lerDotEnv(`V=${formatarValorEnv(v)}`).V;
      assert.equal(lido, v, `ida e volta de ${JSON.stringify(v)}`);
    }
  });
  test("quebra de linha é recusada", () => {
    assert.throws(() => formatarValorEnv("a\nb"), /quebra de linha/);
  });
});

describe("atualizarDotEnv", () => {
  const modelo = [
    "# cabeçalho",
    "VSP_SAP_URL=<https://host:porta>",
    "# VSP_SAP_SID=<SID>    (opcional)",
    "VSP_SAP_PASSWORD=<SENHA>",
    "",
  ].join("\n");
  test("troca a linha ativa e preserva comentários", () => {
    const out = atualizarDotEnv(modelo, { VSP_SAP_URL: "https://ds4:44300" });
    assert.match(out, /^# cabeçalho$/m);
    assert.match(out, /^VSP_SAP_URL=https:\/\/ds4:44300$/m);
    assert.doesNotMatch(out, /<https/);
  });
  test("ativa a linha comentada do modelo em vez de duplicar", () => {
    const out = atualizarDotEnv(modelo, { VSP_SAP_SID: "DS4" });
    assert.match(out, /^VSP_SAP_SID=DS4$/m);
    assert.doesNotMatch(out, /# VSP_SAP_SID/);
    assert.equal(out.split("\n").length, modelo.split("\n").length);
  });
  test("variável nova vai para o fim, antes da última linha vazia", () => {
    const out = atualizarDotEnv(modelo, { NOVA: "1" });
    assert.ok(out.endsWith("NOVA=1\n"));
  });
  test("senha com caracteres especiais é lida de volta igual", () => {
    const senha = " Ab#1<x>'\" ";
    assert.equal(lerDotEnv(atualizarDotEnv(modelo, { VSP_SAP_PASSWORD: senha })).VSP_SAP_PASSWORD, senha);
  });
  test("null remove a linha ativa", () => {
    assert.doesNotMatch(atualizarDotEnv(modelo, { VSP_SAP_URL: null }), /VSP_SAP_URL/);
  });
  test("preserva CRLF", () => {
    const out = atualizarDotEnv("A=1\r\nB=2\r\n", { A: "3" });
    assert.equal(out, "A=3\r\nB=2\r\n");
  });
});

describe("situacaoConexao", () => {
  const ler = (env) => (n) => env[n];
  test("nada preenchido ou só placeholders: vazia", () => {
    assert.equal(situacaoConexao("VSP", ler({})).situacao, "vazia");
    assert.equal(situacaoConexao("VSP", ler({ VSP_SAP_URL: "<https://host:porta>", VSP_SAP_PASSWORD: "<SENHA>" })).situacao, "vazia");
  });
  test("parcial: incompleta, com as variáveis que faltam", () => {
    const r = situacaoConexao("VSP", ler({ VSP_SAP_URL: "https://x", VSP_SAP_CLIENT: "100" }));
    assert.equal(r.situacao, "incompleta");
    assert.deepEqual(r.faltando, ["VSP_SAP_USER", "VSP_SAP_PASSWORD"]);
  });
  test("senha real com <...> no meio conta como preenchida", () => {
    const r = situacaoConexao("VSP", ler({ VSP_SAP_URL: "https://x", VSP_SAP_CLIENT: "100", VSP_SAP_USER: "U", VSP_SAP_PASSWORD: "a<1>b" }));
    assert.equal(r.situacao, "completa");
  });
});

describe("bloco cliente", () => {
  const json = `{
  "x": { "cliente": "não é este" },
  "cliente": {
    "_instrucao": "Preencha <...>",
    "empresa": "<EMPRESA>",
    "sigla": "<SIGLA>",
    "sistemaDesenvolvimento": "<SID_DEV> (texto)"
  },
  "outros": [1, 2]
}`;
  test("camposPendentes ignora _instrucao", () => {
    assert.deepEqual(camposPendentes(JSON.parse(json).cliente), ["empresa", "sigla", "sistemaDesenvolvimento"]);
  });
  test("atualiza só o bloco cliente e preserva a formatação", () => {
    const out = atualizarCliente(json, { empresa: 'ACME "SA"', sistemaDesenvolvimento: "DS4" });
    const c = JSON.parse(out).cliente;
    assert.equal(c.empresa, 'ACME "SA"');
    assert.equal(c.sistemaDesenvolvimento, "DS4");
    assert.equal(c.sigla, "<SIGLA>");
    assert.match(out, /"outros": \[1, 2\]/);
    assert.equal(JSON.parse(out).x.cliente, "não é este");
  });
  test("campo inexistente é erro", () => {
    assert.throws(() => atualizarCliente(json, { inventado: "x" }), /não existe/);
  });
});

describe("projeto CTS (requests.projetoCTS)", () => {
  const json = `{
  "cliente": { "empresa": "X" },
  "requests": {
    "escopo": "texto",
    "projetoCTS": {
      "projeto": "<PROJETO_CTS>",
      "identificador": "<ID_PROJETO_CTS>",
      "descricao": "<DESCRICAO_PROJETO_CTS>"
    }
  },
  "depois": [1, 2]
}`;
  test("três estados: pendente, definido, não se aplica", () => {
    assert.equal(situacaoProjetoCTS(JSON.parse(json).requests), "pendente");
    const definido = atualizarProjetoCTS(json, { projeto: "ZS4", identificador: "S4", descricao: 'Rollout "1"' });
    assert.equal(situacaoProjetoCTS(JSON.parse(definido).requests), "definido");
    assert.equal(JSON.parse(definido).requests.projetoCTS.descricao, 'Rollout "1"');
    const sem = atualizarProjetoCTS(definido, null);
    assert.equal(situacaoProjetoCTS(JSON.parse(sem).requests), "nao-se-aplica");
    assert.equal(JSON.parse(sem).requests.projetoCTS, NAO_SE_APLICA_CTS);
  });
  test("ida e volta preserva o resto do arquivo e a indentação", () => {
    const valor = { projeto: "<PROJETO_CTS>", identificador: "<ID_PROJETO_CTS>", descricao: "<DESCRICAO_PROJETO_CTS>" };
    const volta = atualizarProjetoCTS(atualizarProjetoCTS(json, null), valor);
    assert.equal(volta, json);
  });
  test("sem projeto CTS, a linha da tabela vira 'não se aplica'", () => {
    const md = "| Projeto CTS | Id | Desc |\n|---|---|---|\n| <PROJETO_CTS> | <ID_PROJETO_CTS> | <DESCRICAO_PROJETO_CTS> |\nfim";
    const out = preencherPadrao(md, { semProjetoCTS: true });
    assert.deepEqual(placeholdersPadrao(out), []);
    assert.match(out, /^\| Não se aplica: .* \| — \| — \|$/m);
    assert.ok(out.endsWith("\nfim"));
  });
});

describe("padrao-desenvolvimento.md", () => {
  const md = "variante **\"<VARIANTE_ATC>\"** e de novo <VARIANTE_ATC>; © [EMPRESA]; | <PROJETO_CTS> |";
  test("lista e preenche placeholders com os valores do cliente", () => {
    assert.deepEqual(placeholdersPadrao(md), ["<VARIANTE_ATC>", "<PROJETO_CTS>", "[EMPRESA]"]);
    const out = preencherPadrao(md, { varianteATC: "Z_ATC", empresa: "ACME", projetoCTS: "<PROJETO_CTS>" });
    assert.equal(out, "variante **\"Z_ATC\"** e de novo Z_ATC; © ACME; | <PROJETO_CTS> |");
  });
  test("caixa de comentário ABAP continua alinhada", () => {
    const caixa = "***********\n***   © [EMPRESA]        ***\n***********";
    const largura = caixa.split("\n")[1].length;
    for (const empresa of ["ACME", "ACME Indústr"]) {
      const linha = preencherPadrao(caixa, { empresa }).split("\n")[1];
      assert.equal(linha.length, largura, empresa);
      assert.match(linha, new RegExp(`© ${empresa} +\\*\\*\\*$`));
    }
    // Nome maior que a caixa: mantém um espaço antes do "***" (a caixa cresce).
    assert.match(preencherPadrao(caixa, { empresa: "ACME Indústria Ltda" }), /© ACME Indústria Ltda \*\*\*$/m);
  });
});

describe("lerDiagnostico", () => {
  test("sucesso: estado do JSON e avisos", () => {
    const stderr = [
      "mcp-launch: vsp encontrado: vsp 2.62.1",
      "mcp-launch: aviso: T000 vazia",
      "mcp-launch: vsp -> DS4/100 · S/4HANA 2023 · DEV (x) · desenvolvimento",
      "{",
      '  "servidor": "vsp",',
      '  "sid": "DS4"',
      "}",
    ].join("\n");
    const r = lerDiagnostico(stderr);
    assert.equal(r.estado.sid, "DS4");
    assert.deepEqual(r.avisos, ["T000 vazia"]);
    assert.equal(r.erro, null);
  });
  test("recusa: última mensagem vira o erro", () => {
    const r = lerDiagnostico("mcp-launch: vsp encontrado: x\nmcp-launch: vsp recusado: SAP_BASIS 816 (S/4HANA 2025) é servido pelo abap-adt. ...\n");
    assert.equal(r.estado, null);
    assert.match(r.erro, /^vsp recusado/);
    assert.ok(recusaEsperada2025(r.erro));
    assert.ok(!recusaEsperada2025("vsp recusado: DS4/100 é QAS"));
  });
});
