// Testes das decisões do launcher (scripts/mcp-politica.mjs). Rodar: node --test scripts/test/
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  Recusa, valorDeVariavel, verificarTls, filtrarEnvFilho, lerRegistro, aplicarRegistro, resolverSid, decidir, comandoParaSpawn,
  ARC1_NEGADAS_FORA_DEV,
} from "../mcp-politica.mjs";

const REG = "standards/sistemas-sap.json";
const recusa = (re) => (e) => e instanceof Recusa && re.test(e.message);
const registro = (restricoes) => JSON.stringify({ _instrucao: "x", restricoes });

// ---------------------------------------------------------------- 3.5
describe("valorDeVariavel (3.5)", () => {
  test("ausente ou vazia", () => {
    for (const bruto of [undefined, null, ""])
      assert.deepEqual(valorDeVariavel("VSP_SAP_URL", bruto), { valor: undefined, placeholder: false });
  });
  test("placeholder <...> em qualquer variável que não seja senha", () => {
    assert.deepEqual(valorDeVariavel("VSP_SAP_URL", "<https://host:porta>"), { valor: undefined, placeholder: true });
    assert.equal(valorDeVariavel("ARC1_QAS_XXX_SAP_USER", "dev<1>").placeholder, true);
  });
  test("senha: só o valor inteiro <...> é placeholder", () => {
    assert.deepEqual(valorDeVariavel("VSP_SAP_PASSWORD", "<SENHA>"), { valor: undefined, placeholder: true });
    assert.deepEqual(valorDeVariavel("ARC1_QAS_XXX_SAP_PASSWORD", " <SENHA> "), { valor: undefined, placeholder: true });
  });
  test("senha real com < e > é aceita", () => {
    for (const s of ["Ab<12>cd", "x<y>", "<a>b", "a<b>", "<<x>>", "p#ss<w>"])
      assert.deepEqual(valorDeVariavel("VSP_SAP_PASSWORD", s), { valor: s, placeholder: false }, s);
  });
  test("valor comum", () => {
    assert.deepEqual(valorDeVariavel("VSP_ALLOWED_PACKAGES", "$TMP,Z*"), { valor: "$TMP,Z*", placeholder: false });
  });
});

// ---------------------------------------------------------------- 1.1
describe("lerRegistro (1.1)", () => {
  test("arquivo sem restrições", () => {
    assert.deepEqual(lerRegistro(registro([]), REG), { restricoes: [], avisos: [] });
    assert.deepEqual(lerRegistro("{}", REG), { restricoes: [], avisos: [] });
  });
  test("entrada sem mandante vale para o SID todo", () => {
    const { restricoes } = lerRegistro(registro([{ sid: "qs4", ambiente: "qas" }]), REG);
    assert.deepEqual(restricoes, [{ sid: "QS4", mandante: null, ambiente: "QAS" }]);
  });
  test("mandante numérico ou curto é normalizado para 3 dígitos", () => {
    const { restricoes } = lerRegistro(registro([{ sid: "QS4", mandante: 10, ambiente: "PRD" }]), REG);
    assert.equal(restricoes[0].mandante, "010");
  });
  test("observacao com <...> não descarta a entrada", () => {
    const { restricoes, avisos } = lerRegistro(registro([{ sid: "QS4", mandante: "400", ambiente: "QAS", observacao: "mandante <C> na SCC4" }]), REG);
    assert.equal(restricoes.length, 1);
    assert.deepEqual(avisos, []);
  });
  test("entrada-modelo com sid placeholder é ignorada com aviso", () => {
    const { restricoes, avisos } = lerRegistro(registro([{ sid: "<SID>", mandante: "<nnn>", ambiente: "QAS" }]), REG);
    assert.deepEqual(restricoes, []);
    assert.match(avisos[0], /restricoes\[0\] ignorada/);
  });
  test("JSON malformado recusa com mensagem clara", () => {
    assert.throws(() => lerRegistro('{ "restricoes": [ { "sid": "QS4", } ] }', REG), recusa(/não é um JSON válido/));
  });
  test("ambiente fora da enumeração recusa e aponta a entrada", () => {
    assert.throws(() => lerRegistro(registro([{ sid: "QS4", ambiente: "QAS" }, { sid: "HS4", ambiente: "HOMOLOG" }]), REG),
      recusa(/restricoes\[1\].*"ambiente"/));
  });
  test("ambiente ausente ou placeholder recusa", () => {
    assert.throws(() => lerRegistro(registro([{ sid: "QS4" }]), REG), recusa(/"ambiente"/));
    assert.throws(() => lerRegistro(registro([{ sid: "QS4", ambiente: "<QAS|PRD>" }]), REG), recusa(/"ambiente"/));
  });
  test("sid ausente ou inválido recusa", () => {
    assert.throws(() => lerRegistro(registro([{ ambiente: "QAS" }]), REG), recusa(/"sid"/));
    assert.throws(() => lerRegistro(registro([{ sid: "QS40", ambiente: "QAS" }]), REG), recusa(/"sid"/));
  });
  test("mandante inválido recusa", () => {
    assert.throws(() => lerRegistro(registro([{ sid: "QS4", mandante: "4000", ambiente: "QAS" }]), REG), recusa(/"mandante"/));
    assert.throws(() => lerRegistro(registro([{ sid: "QS4", mandante: "<nnn>", ambiente: "QAS" }]), REG), recusa(/"mandante"/));
  });
  test("estrutura inválida recusa", () => {
    assert.throws(() => lerRegistro("[]", REG), recusa(/objeto/));
    assert.throws(() => lerRegistro('{"restricoes": {}}', REG), recusa(/lista/));
    assert.throws(() => lerRegistro(registro(["QS4"]), REG), recusa(/objeto/));
  });
});

describe("aplicarRegistro (1.1)", () => {
  const sistema = { sid: "QS4", mandante: "400", ambiente: "DEV", motivo: "detectado" };
  const aplicar = (restricoes, s = sistema) => aplicarRegistro(s, lerRegistro(registro(restricoes), REG).restricoes, REG);

  test("entrada sem mandante restringe qualquer mandante do SID", () => {
    const r = aplicar([{ sid: "QS4", ambiente: "QAS" }]);
    assert.equal(r.ambiente, "QAS");
    assert.match(r.motivo, /todos os mandantes/);
  });
  test("entrada com mandante só restringe aquele mandante", () => {
    assert.equal(aplicar([{ sid: "QS4", mandante: "400", ambiente: "PRD" }]).ambiente, "PRD");
    assert.equal(aplicar([{ sid: "QS4", mandante: "100", ambiente: "PRD" }]).ambiente, "DEV");
  });
  test("outro SID não afeta", () => {
    assert.equal(aplicar([{ sid: "PS4", ambiente: "PRD" }]).ambiente, "DEV");
  });
  test("nunca libera: declarado menos restritivo gera só aviso", () => {
    const r = aplicar([{ sid: "QS4", ambiente: "DEV" }], { ...sistema, ambiente: "QAS" });
    assert.equal(r.ambiente, "QAS");
    assert.equal(r.motivo, "detectado");
    assert.match(r.avisos[0], /vale o mais restritivo/);
  });
  test("várias entradas casando: vale a mais restritiva", () => {
    const r = aplicar([{ sid: "QS4", ambiente: "SANDBOX" }, { sid: "QS4", mandante: "400", ambiente: "PRD" }, { sid: "QS4", ambiente: "QAS" }]);
    assert.equal(r.ambiente, "PRD");
  });
});

// ---------------------------------------------------------------- 1.2
describe("resolverSid (1.2)", () => {
  test("systeminformation: confirmado", () => {
    const r = resolverSid({ sid: "DS4", sidOrigem: "systeminformation" }, undefined, "VSP");
    assert.equal(r.sid, "DS4");
    assert.equal(r.sidConfirmado, true);
    assert.equal(r.sidPendente, false);
  });
  test("systeminformation divergente do declarado recusa", () => {
    assert.throws(() => resolverSid({ sid: "DS4", sidOrigem: "systeminformation" }, "QS4", "VSP"), recusa(/VSP_SAP_SID diz QS4/));
  });
  test("LOGSYS válido sem declarado: não confirmado e pendente", () => {
    const r = resolverSid({ sid: "DS4", sidOrigem: "logsys" }, undefined, "VSP");
    assert.equal(r.sidConfirmado, false);
    assert.equal(r.sidPendente, true);
    assert.match(r.avisos[0], /VSP_SAP_SID=DS4/);
  });
  test("LOGSYS válido igual ao declarado: não confirmado, mas liberado", () => {
    const r = resolverSid({ sid: "DS4", sidOrigem: "logsys" }, "DS4", "VSP");
    assert.equal(r.sidConfirmado, false);
    assert.equal(r.sidPendente, false);
  });
  test("LOGSYS divergente do declarado recusa", () => {
    assert.throws(() => resolverSid({ sid: "QS4", sidOrigem: "logsys" }, "DS4", "VSP"), recusa(/LOGSYS indica o SID QS4/));
  });
  test("LOGSYS inválido (sem SID) usa o declarado, não confirmado", () => {
    const r = resolverSid({ sid: null, sidOrigem: null }, "DS4", "VSP");
    assert.equal(r.sid, "DS4");
    assert.equal(r.sidOrigem, "declarado");
    assert.equal(r.sidConfirmado, false);
  });
  test("sem SID detectado nem declarado recusa", () => {
    assert.throws(() => resolverSid({ sid: null, sidOrigem: null }, undefined, "VSP"), recusa(/informe VSP_SAP_SID/));
  });
});

// ---------------------------------------------------------------- 1.3
describe("TLS (1.3)", () => {
  test("NODE_TLS_REJECT_UNAUTHORIZED=0 recusa e cita NODE_EXTRA_CA_CERTS", () => {
    assert.throws(() => verificarTls({ NODE_TLS_REJECT_UNAUTHORIZED: "0" }), recusa(/NODE_EXTRA_CA_CERTS/));
    assert.throws(() => verificarTls({ NODE_TLS_REJECT_UNAUTHORIZED: " 0 " }), Recusa);
  });
  test("ausente ou 1 passa", () => {
    assert.doesNotThrow(() => verificarTls({}));
    assert.doesNotThrow(() => verificarTls({ NODE_TLS_REJECT_UNAUTHORIZED: "1" }));
  });
  test("filho não herda NODE_OPTIONS, NODE_TLS_REJECT_UNAUTHORIZED nem credenciais", () => {
    const env = filtrarEnvFilho({
      PATH: "/bin", NODE_OPTIONS: "--require x.js", node_options: "--inspect", NODE_TLS_REJECT_UNAUTHORIZED: "1",
      NODE_EXTRA_CA_CERTS: "/ca.pem", SAP_PASSWORD: "x", ARC1_SAP_USER: "u", VSP_BIN: "vsp", ABAP_ADT_TOKEN: "t",
    });
    assert.deepEqual(env, { PATH: "/bin", NODE_EXTRA_CA_CERTS: "/ca.pem" });
  });
});

// ---------------------------------------------------------------- decisão por ferramenta (1.5 e travas)
const CONN = { url: "https://sap.exemplo.com", client: "100", user: "DEV", password: "segredo" };
const variaveis = (mapa) => (nome) => mapa[nome];
const base = { sid: "DS4", sidPendente: false, mandante: "100", ambiente: "DEV", motivo: "teste", sapBasis: 758, produto: "S/4HANA 2023" };
const ARC1 = { command: "/usr/bin/node", args: ["/cache/arc-1/1.10.1/node_modules/arc-1/bin/arc1.js"] };
const decidirCom = ({ tool, sistema = {}, vars = {}, env = { PATH: "/bin" }, platform = "linux", arc1 = ARC1, caCert, conn = CONN }) =>
  decidir({ tool, prefix: tool === "vsp" ? "VSP" : "ARC1", sistema: { ...base, ...sistema }, conn, v: variaveis(vars), env, platform, arc1, caCert });

describe("decidir — SAP_BASIS mínimo (1.5)", () => {
  for (const tool of ["arc-1", "vsp"])
    test(`${tool} recusa SAP_BASIS 702`, () => {
      assert.throws(() => decidirCom({ tool, sistema: { sapBasis: 702, produto: "NetWeaver/ECC (SAP_BASIS 702)" }, vars: { ALLOWED_PACKAGES: "Z*" } }),
        recusa(/SAP_BASIS 702.*mínimo 750/));
    });
  test("ARC-1 recusa SAP_BASIS 702 também em QAS", () => {
    assert.throws(() => decidirCom({ tool: "arc-1", sistema: { sapBasis: 702, ambiente: "QAS" } }), Recusa);
  });
  test("SAP_BASIS 750 é aceito", () => {
    assert.doesNotThrow(() => decidirCom({ tool: "arc-1", sistema: { sapBasis: 750, ambiente: "QAS" } }));
  });
});

describe("decidir — ARC-1", () => {
  test("QAS: somente leitura, sem pacotes", () => {
    const d = decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" } });
    assert.equal(d.modo, "somente leitura");
    assert.equal(d.childEnv.SAP_ALLOW_WRITES, "false");
    assert.equal(d.childEnv.SAP_ALLOWED_PACKAGES, undefined);
  });
  test("travas fixas sempre presentes", () => {
    for (const ambiente of ["DEV", "SANDBOX", "QAS"]) {
      const { childEnv } = decidirCom({ tool: "arc-1", sistema: { ambiente } });
      for (const k of ["SAP_INSECURE", "SAP_ALLOW_TRANSPORT_WRITES", "SAP_ALLOW_GIT_WRITES", "SAP_ALLOW_DATA_PREVIEW", "SAP_ALLOW_FREE_SQL", "SAP_ALLOW_PLUGIN_EXECUTE"])
        assert.equal(childEnv[k], "false", `${ambiente} ${k}`);
      assert.ok(childEnv.SAP_DENY_ACTIONS.split(",").includes("SAPWrite.delete"), ambiente);
    }
  });
  test("DEV ≤ 2023 com opt-in: escrita restrita aos pacotes (2.1)", () => {
    const d = decidirCom({ tool: "arc-1", vars: { ALLOW_DEV_WRITES: "true", ALLOWED_PACKAGES: "ZMM*" } });
    assert.equal(d.modo, "escrita restrita a pacotes");
    assert.equal(d.childEnv.SAP_ALLOW_WRITES, "true");
    assert.equal(d.childEnv.SAP_ALLOWED_PACKAGES, "ZMM*");
  });
  test("DEV ≤ 2023 sem opt-in: somente leitura e não exige pacotes (2.1)", () => {
    for (const ambiente of ["DEV", "SANDBOX"]) {
      const d = decidirCom({ tool: "arc-1", sistema: { ambiente } });
      assert.equal(d.modo, "somente leitura", ambiente);
      assert.equal(d.childEnv.SAP_ALLOW_WRITES, "false", ambiente);
      assert.equal(d.childEnv.SAP_ALLOWED_PACKAGES, undefined, ambiente);
      assert.match(d.avisos[0], /ARC1_ALLOW_DEV_WRITES=true/, ambiente);
    }
  });
  test("opt-in com valor diferente de true/1/yes não liga a escrita (2.1)", () => {
    for (const val of ["false", "0", "sim", ""])
      assert.equal(decidirCom({ tool: "arc-1", vars: { ALLOW_DEV_WRITES: val, ALLOWED_PACKAGES: "Z*" } }).modo, "somente leitura", val);
  });
  test("DEV ≤ 2023 com opt-in e sem pacotes recusa (2.1)", () => {
    assert.throws(() => decidirCom({ tool: "arc-1", vars: { ALLOW_DEV_WRITES: "true" } }), recusa(/ARC1_ALLOWED_PACKAGES/));
  });
  test("opt-in não libera escrita fora de DEV/SANDBOX nem em 2025+ (2.1)", () => {
    const vars = { ALLOW_DEV_WRITES: "true", ALLOWED_PACKAGES: "Z*" };
    for (const ambiente of ["QAS"]) {
      const d = decidirCom({ tool: "arc-1", sistema: { ambiente }, vars });
      assert.equal(d.childEnv.SAP_ALLOW_WRITES, "false", ambiente);
      assert.match(d.avisos[0], /ALLOW_DEV_WRITES ignorada/, ambiente);
    }
    assert.equal(decidirCom({ tool: "arc-1", sistema: { sapBasis: 816 }, vars }).modo, "somente leitura");
  });
  test("SID só do LOGSYS (pendente): somente leitura mesmo com opt-in (1.2)", () => {
    const d = decidirCom({ tool: "arc-1", sistema: { sidPendente: true }, vars: { ALLOW_DEV_WRITES: "true" } });
    assert.equal(d.modo, "somente leitura");
    assert.equal(d.childEnv.SAP_ALLOW_WRITES, "false");
    assert.match(d.avisos[0], /ARC1_SAP_SID/);
  });
  test("QAS: ABAP Unit negado (2.2)", () => {
    for (const ambiente of ["QAS"]) {
      const d = decidirCom({ tool: "arc-1", sistema: { ambiente } });
      assert.deepEqual(d.acoesNegadas, ["SAPWrite.delete", ...ARC1_NEGADAS_FORA_DEV], ambiente);
      assert.equal(d.childEnv.SAP_DENY_ACTIONS, "SAPWrite.delete,SAPDiagnose.unittest,SAPDiagnose.unittest_ci", ambiente);
    }
  });
  test("DEV e SANDBOX: ABAP Unit permitido, com ou sem escrita (2.2)", () => {
    for (const ambiente of ["DEV", "SANDBOX"]) {
      assert.equal(decidirCom({ tool: "arc-1", sistema: { ambiente } }).childEnv.SAP_DENY_ACTIONS, "SAPWrite.delete", ambiente);
      assert.equal(decidirCom({ tool: "arc-1", sistema: { ambiente, sapBasis: 816 } }).childEnv.SAP_DENY_ACTIONS, "SAPWrite.delete", `${ambiente} 2025+`);
    }
  });
  test("DEV restringido a QAS pelo registro também nega ABAP Unit (2.2)", () => {
    // o ambiente que chega a decidir() já é o efetivo (detectado + registro)
    const r = aplicarRegistro({ sid: "QS4", mandante: "400", ambiente: "DEV", motivo: "x" },
      lerRegistro(registro([{ sid: "QS4", ambiente: "QAS" }]), REG).restricoes, REG);
    const d = decidirCom({ tool: "arc-1", sistema: { ambiente: r.ambiente } });
    assert.ok(d.acoesNegadas.includes("SAPDiagnose.unittest"));
  });
  test("ambiente do filho: credenciais da conexão, sem NODE_OPTIONS nem TLS herdados (1.3)", () => {
    const d = decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" },
      env: { PATH: "/bin", NODE_OPTIONS: "--require x.js", NODE_TLS_REJECT_UNAUTHORIZED: "1", SAP_ALLOW_WRITES: "true" } });
    assert.equal(d.childEnv.NODE_OPTIONS, undefined);
    assert.equal(d.childEnv.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
    assert.equal(d.childEnv.SAP_ALLOW_WRITES, "false");
    assert.equal(d.childEnv.SAP_URL, CONN.url);
  });
  test("comando: Node + bin do ARC-1 gerenciado, sem shell (nem no Windows); ARC1_BIN substitui", () => {
    const linux = decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" } });
    assert.deepEqual([linux.command, linux.args, linux.shell], [ARC1.command, ARC1.args, false]);
    const win = decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" }, platform: "win32", arc1: { command: "C:\\Program Files\\nodejs\\node.exe", args: ["C:\\x\\arc1.js"] } });
    assert.deepEqual([win.command, win.shell], ["C:\\Program Files\\nodejs\\node.exe", false]);
    assert.throws(() => decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" }, arc1: null }), recusa(/ARC-1 não instalado/));
    const bin = decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" }, env: { ARC1_BIN: "/opt/arc1" } });
    assert.deepEqual([bin.command, bin.args], ["/opt/arc1", []]);
  });
  test("ARC1_BIN .cmd no Windows: shell com caminho entre aspas (2.4)", () => {
    const d = decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" }, platform: "win32", env: { ARC1_BIN: "C:\\Program Files\\arc1\\arc-1.cmd" } });
    assert.deepEqual([d.command, d.args, d.shell], ['"C:\\Program Files\\arc1\\arc-1.cmd"', [], true]);
  });
});

describe("decidir — vsp", () => {
  const vars = { ALLOWED_PACKAGES: "ZMM*" };
  test("DEV ≤ 2023: argumentos endurecidos", () => {
    const d = decidirCom({ tool: "vsp", vars });
    assert.equal(d.modo, "desenvolvimento");
    assert.deepEqual(d.args, ["--mode", "hyperfocused", "--expect", "DS4.100/DEV", "--allowed-packages", "ZMM*", "--block-free-sql"]);
    assert.ok(!d.args.includes("--insecure"));
  });
  for (const ambiente of ["QAS"])
    test(`${ambiente} recusa`, () => {
      assert.throws(() => decidirCom({ tool: "vsp", sistema: { ambiente }, vars }), recusa(/vsp só em DEV\/SANDBOX/));
    });
  test("SANDBOX é aceito", () => {
    assert.doesNotThrow(() => decidirCom({ tool: "vsp", sistema: { ambiente: "SANDBOX" }, vars }));
  });
  test("SAP_BASIS 816+ recusa", () => {
    assert.throws(() => decidirCom({ tool: "vsp", sistema: { sapBasis: 816 }, vars }), recusa(/abap-adt/));
  });
  test("SID só do LOGSYS (pendente) recusa (1.2)", () => {
    assert.throws(() => decidirCom({ tool: "vsp", sistema: { sidPendente: true }, vars }), recusa(/VSP_SAP_SID=DS4/));
  });
  test("sem pacotes recusa", () => {
    assert.throws(() => decidirCom({ tool: "vsp" }), recusa(/VSP_ALLOWED_PACKAGES/));
  });
  test("transportes e somente leitura", () => {
    const d = decidirCom({ tool: "vsp", vars: { ...vars, ALLOWED_TRANSPORTS: "DS4K*", ENABLE_TRANSPORTS: "true", READ_ONLY: "1" } });
    assert.equal(d.modo, "somente leitura");
    assert.deepEqual(d.args.slice(7), ["--allow-transportable-edits", "--allowed-transports", "DS4K*", "--enable-transports", "--read-only"]);
  });
  test("VSP_BIN substitui o comando", () => {
    const d = decidirCom({ tool: "vsp", vars, env: { VSP_BIN: "C:/tools/vsp.exe" }, platform: "win32" });
    assert.deepEqual([d.command, d.shell], ["C:/tools/vsp.exe", false]);
  });
  test("VSP_BIN .bat no Windows: shell, caminho e argumentos entre aspas (2.4)", () => {
    const d = decidirCom({ tool: "vsp", vars: { ALLOWED_PACKAGES: "$TMP,Z*" }, env: { VSP_BIN: "C:\\tools\\vsp.bat" }, platform: "win32" });
    assert.equal(d.shell, true);
    assert.equal(d.command, '"C:\\tools\\vsp.bat"');
    assert.ok(d.args.every((a) => a.startsWith('"') && a.endsWith('"')));
    assert.ok(d.args.includes('"$TMP,Z*"'));
  });
  test("VSP_BIN .cmd com argumento perigoso para o cmd.exe recusa (2.4)", () => {
    for (const pacotes of ["Z*%PATH%", 'Z*" & calc', "Z*^", "Z*!x!"])
      assert.throws(() => decidirCom({ tool: "vsp", vars: { ALLOWED_PACKAGES: pacotes }, env: { VSP_BIN: "C:\\tools\\vsp.cmd" }, platform: "win32" }),
        recusa(/cmd\.exe interpretaria/), pacotes);
  });
  test("vsp não informa ações negadas (são do ARC-1)", () => {
    assert.equal(decidirCom({ tool: "vsp", vars }).acoesNegadas, undefined);
  });
});

describe("decidir — fallback do abap-adt em 2025+ (política 4.4)", () => {
  const s2025 = { sapBasis: 816, produto: "S/4HANA 2025" };
  const vsp = { ALLOWED_PACKAGES: "ZMM*" };
  const arc1 = { ALLOW_DEV_WRITES: "true", ALLOWED_PACKAGES: "ZMM*" };

  test("vsp sem opt-in continua recusado e indica a variável", () => {
    assert.throws(() => decidirCom({ tool: "vsp", sistema: s2025, vars: vsp }), recusa(/abap-adt.*VSP_FALLBACK_2025=true/));
  });
  test("vsp com opt-in em DEV/SANDBOX: desenvolvimento endurecido, marcado como fallback", () => {
    for (const ambiente of ["DEV", "SANDBOX"]) {
      const d = decidirCom({ tool: "vsp", sistema: { ...s2025, ambiente }, vars: { ...vsp, FALLBACK_2025: "true" } });
      assert.equal(d.modo, "desenvolvimento (fallback do abap-adt)", ambiente);
      assert.deepEqual(d.args, ["--mode", "hyperfocused", "--expect", "DS4.100/DEV", "--allowed-packages", "ZMM*", "--block-free-sql"], ambiente);
      assert.ok(d.avisos.some((a) => /fallback do abap-adt/.test(a)), ambiente);
    }
  });
  test("vsp com opt-in continua recusado em QAS", () => {
    for (const ambiente of ["QAS"])
      assert.throws(() => decidirCom({ tool: "vsp", sistema: { ...s2025, ambiente }, vars: { ...vsp, FALLBACK_2025: "true" } }), recusa(/vsp só em DEV\/SANDBOX/), ambiente);
  });
  test("vsp com opt-in e SID pendente recusa", () => {
    assert.throws(() => decidirCom({ tool: "vsp", sistema: { ...s2025, sidPendente: true }, vars: { ...vsp, FALLBACK_2025: "true" } }), recusa(/VSP_SAP_SID/));
  });
  test("ARC-1 em DEV 2025+: escrita só com os dois opt-ins", () => {
    const so = decidirCom({ tool: "arc-1", sistema: s2025, vars: arc1 });
    assert.equal(so.modo, "somente leitura");
    assert.ok(so.avisos.some((a) => /ARC1_FALLBACK_2025=true/.test(a)));
    const d = decidirCom({ tool: "arc-1", sistema: s2025, vars: { ...arc1, FALLBACK_2025: "true" } });
    assert.equal(d.modo, "escrita restrita a pacotes (fallback do abap-adt)");
    assert.equal(d.childEnv.SAP_ALLOW_WRITES, "true");
    assert.equal(d.childEnv.SAP_ALLOWED_PACKAGES, "ZMM*");
    const semEscrita = decidirCom({ tool: "arc-1", sistema: s2025, vars: { FALLBACK_2025: "true" } });
    assert.equal(semEscrita.modo, "somente leitura");
  });
  test("ARC-1 com opt-in em QAS 2025+ continua somente leitura", () => {
    for (const ambiente of ["QAS"]) {
      const d = decidirCom({ tool: "arc-1", sistema: { ...s2025, ambiente }, vars: { ...arc1, FALLBACK_2025: "true" } });
      assert.equal(d.childEnv.SAP_ALLOW_WRITES, "false", ambiente);
      assert.ok(d.avisos.some((a) => /ARC1_FALLBACK_2025 ignorada/.test(a)), ambiente);
    }
  });
  test("opt-in não muda nada em ≤ 2023", () => {
    assert.equal(decidirCom({ tool: "vsp", vars: { ...vsp, FALLBACK_2025: "true" } }).modo, "desenvolvimento");
    assert.equal(decidirCom({ tool: "arc-1", vars: { ...arc1, FALLBACK_2025: "true" } }).modo, "escrita restrita a pacotes");
  });
});

describe("comandoParaSpawn (2.4)", () => {
  test(".cmd/.bat só exigem shell no Windows", () => {
    assert.deepEqual(comandoParaSpawn("vsp.cmd", ["-v"], "linux"), { command: "vsp.cmd", args: ["-v"], shell: false });
    assert.deepEqual(comandoParaSpawn("C:\\x\\vsp.exe", ["-v"], "win32"), { command: "C:\\x\\vsp.exe", args: ["-v"], shell: false });
    assert.deepEqual(comandoParaSpawn("C:\\x\\VSP.CMD", ["--version"], "win32"), { command: '"C:\\x\\VSP.CMD"', args: ['"--version"'], shell: true });
    assert.deepEqual(comandoParaSpawn("C:\\x y\\vsp.bat", [], "win32"), { command: '"C:\\x y\\vsp.bat"', args: [], shell: true });
  });
  test("caminho com caractere perigoso recusa", () => {
    assert.throws(() => comandoParaSpawn("C:\\%TEMP%\\vsp.cmd", [], "win32"), Recusa);
  });
});

describe("decidir — TLS: certificado fixado e opt-in insecure do vsp (ADR-0013)", () => {
  const vsp = { ALLOWED_PACKAGES: "Z*" };
  const CA = "/proj/.agents/certs/arc-1-qas.pem";
  test("sem certificado fixado: cadeia do sistema e sem --insecure", () => {
    const a = decidirCom({ tool: "arc-1" });
    assert.equal(a.childEnv.NODE_EXTRA_CA_CERTS, undefined);
    assert.equal(a.childEnv.SAP_INSECURE, "false");
    assert.match(a.tls, /cadeia confiável/);
    assert.ok(!decidirCom({ tool: "vsp", vars: vsp }).args.includes("--insecure"));
  });
  test("ARC-1 com certificado fixado recebe o .pem por NODE_EXTRA_CA_CERTS e continua verificando", () => {
    for (const ambiente of ["DEV", "QAS"]) {
      const d = decidirCom({ tool: "arc-1", sistema: { ambiente }, caCert: CA });
      assert.equal(d.childEnv.NODE_EXTRA_CA_CERTS, CA, ambiente);
      assert.equal(d.childEnv.SAP_INSECURE, "false", ambiente);
      assert.match(d.tls, /certificado fixado \(ARC1_SAP_CA_CERT\)/);
    }
  });
  test("certificado fixado substitui um NODE_EXTRA_CA_CERTS global no filho", () => {
    const d = decidirCom({ tool: "arc-1", env: { PATH: "/bin", NODE_EXTRA_CA_CERTS: "/global.pem" }, caCert: CA });
    assert.equal(d.childEnv.NODE_EXTRA_CA_CERTS, CA);
  });
  test("ARC-1 ignora SAP_INSECURE, com aviso", () => {
    for (const ambiente of ["DEV", "QAS"]) {
      const d = decidirCom({ tool: "arc-1", sistema: { ambiente }, vars: { SAP_INSECURE: "true" } });
      assert.equal(d.childEnv.SAP_INSECURE, "false", ambiente);
      assert.ok(d.avisos.some((a) => /ARC1_SAP_INSECURE ignorada/.test(a)), ambiente);
    }
  });
  test("vsp com opt-in recebe --insecure, mantém as travas e descreve o TLS", () => {
    const d = decidirCom({ tool: "vsp", vars: { ...vsp, SAP_INSECURE: "true" }, caCert: "/proj/.agents/certs/vsp.pem" });
    assert.ok(d.args.includes("--insecure"));
    assert.ok(d.args.includes("--expect") && d.args.includes("--block-free-sql"));
    assert.match(d.tls, /vsp sem verificação TLS.*certificado fixado/);
    assert.ok(d.avisos.some((a) => /VSP_SAP_INSECURE=true/.test(a)));
  });
  test("vsp: opt-in não altera a recusa fora de DEV/SANDBOX", () => {
    assert.throws(() => decidirCom({ tool: "vsp", sistema: { ambiente: "QAS" }, vars: { ...vsp, SAP_INSECURE: "true" } }), recusa(/vsp só em DEV\/SANDBOX/));
  });
  test("vsp: opt-in sem efeito em http://localhost (não há TLS)", () => {
    const d = decidirCom({ tool: "vsp", vars: { ...vsp, SAP_INSECURE: "true" }, conn: { ...CONN, url: "http://localhost:8000" } });
    assert.ok(!d.args.includes("--insecure"));
  });
  test("valores que não ligam o opt-in", () => {
    for (const valor of ["false", "0", "", undefined])
      assert.ok(!decidirCom({ tool: "vsp", vars: { ...vsp, SAP_INSECURE: valor } }).args.includes("--insecure"), String(valor));
  });
});

describe("decidir — PRD recusado para qualquer servidor (ADR-0014)", () => {
  const vars = { ALLOWED_PACKAGES: "Z*", ALLOW_DEV_WRITES: "true", FALLBACK_2025: "true", READ_ONLY: "true" };
  for (const tool of ["arc-1", "vsp"])
    for (const sapBasis of [758, 816])
      test(`${tool} recusa PRD (SAP_BASIS ${sapBasis}), mesmo com opt-ins`, () => {
        assert.throws(() => decidirCom({ tool, sistema: { ambiente: "PRD", sapBasis, motivo: "mandante produtivo" }, vars }),
          recusa(/é PRD — mandante produtivo.*nenhum servidor acessa o ambiente produtivo.*ADR-0014/));
      });
  test("PRD por precaução (T000 ilegível): recusa com a dica da autorização", () => {
    assert.throws(() => decidirCom({ tool: "arc-1", sistema: { ambiente: "PRD", motivo: "T000 ilegível — tratado como PRD por precaução" } }),
      recusa(/autorização de data preview na T000/));
  });
  test("mandante produtivo: recusa sem a dica da T000", () => {
    assert.throws(() => decidirCom({ tool: "arc-1", sistema: { ambiente: "PRD", motivo: "mandante produtivo (CCCATEGORY=P)" } }),
      (e) => e instanceof Recusa && !/data preview/.test(e.message));
  });
  test("registro que restringe um sistema a PRD também recusa", () => {
    const r = aplicarRegistro({ sid: "QS4", mandante: "400", ambiente: "QAS", motivo: "x" },
      lerRegistro(registro([{ sid: "QS4", ambiente: "PRD" }]), REG).restricoes, REG);
    assert.equal(r.ambiente, "PRD");
    assert.throws(() => decidirCom({ tool: "arc-1", sistema: { ambiente: r.ambiente, motivo: r.motivo } }), recusa(/ADR-0014/));
  });
  test("QAS continua aceito, somente leitura", () => {
    assert.equal(decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" } }).modo, "somente leitura");
  });
});
