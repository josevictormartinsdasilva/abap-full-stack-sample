// Testes das decisões do launcher (scripts/mcp-politica.mjs). Rodar: node --test scripts/test/
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  Recusa, verificarTls, filtrarEnvFilho, lerRegistro, aplicarRegistro, resolverSid, decidir, ARC1_PACKAGE,
} from "../mcp-politica.mjs";

const REG = "standards/sistemas-sap.json";
const recusa = (re) => (e) => e instanceof Recusa && re.test(e.message);
const registro = (restricoes) => JSON.stringify({ _instrucao: "x", restricoes });

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
const decidirCom = ({ tool, sistema = {}, vars = {}, env = { PATH: "/bin" }, platform = "linux" }) =>
  decidir({ tool, prefix: tool === "vsp" ? "VSP" : "ARC1", sistema: { ...base, ...sistema }, conn: CONN, v: variaveis(vars), env, platform });

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
    const { childEnv } = decidirCom({ tool: "arc-1", sistema: { ambiente: "PRD" } });
    for (const k of ["SAP_INSECURE", "SAP_ALLOW_TRANSPORT_WRITES", "SAP_ALLOW_GIT_WRITES", "SAP_ALLOW_DATA_PREVIEW", "SAP_ALLOW_FREE_SQL", "SAP_ALLOW_PLUGIN_EXECUTE"])
      assert.equal(childEnv[k], "false", k);
    assert.equal(childEnv.SAP_DENY_ACTIONS, "SAPWrite.delete");
  });
  test("DEV ≤ 2023: escrita restrita aos pacotes", () => {
    const d = decidirCom({ tool: "arc-1", vars: { ALLOWED_PACKAGES: "ZMM*" } });
    assert.equal(d.modo, "escrita restrita a pacotes");
    assert.equal(d.childEnv.SAP_ALLOW_WRITES, "true");
    assert.equal(d.childEnv.SAP_ALLOWED_PACKAGES, "ZMM*");
  });
  test("DEV ≤ 2023 sem pacotes recusa", () => {
    assert.throws(() => decidirCom({ tool: "arc-1" }), recusa(/ARC1_ALLOWED_PACKAGES/));
  });
  test("DEV 2025+: somente leitura", () => {
    assert.equal(decidirCom({ tool: "arc-1", sistema: { sapBasis: 816 } }).modo, "somente leitura");
  });
  test("SID só do LOGSYS (pendente): somente leitura, sem exigir pacotes (1.2)", () => {
    const d = decidirCom({ tool: "arc-1", sistema: { sidPendente: true } });
    assert.equal(d.modo, "somente leitura");
    assert.equal(d.childEnv.SAP_ALLOW_WRITES, "false");
    assert.match(d.avisos[0], /ARC1_SAP_SID/);
  });
  test("ambiente do filho: credenciais da conexão, sem NODE_OPTIONS nem TLS herdados (1.3)", () => {
    const d = decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" },
      env: { PATH: "/bin", NODE_OPTIONS: "--require x.js", NODE_TLS_REJECT_UNAUTHORIZED: "1", SAP_ALLOW_WRITES: "true" } });
    assert.equal(d.childEnv.NODE_OPTIONS, undefined);
    assert.equal(d.childEnv.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
    assert.equal(d.childEnv.SAP_ALLOW_WRITES, "false");
    assert.equal(d.childEnv.SAP_URL, CONN.url);
  });
  test("comando: npx com versão fixada; shell só no Windows; ARC1_BIN substitui", () => {
    const linux = decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" } });
    assert.deepEqual([linux.command, linux.args, linux.shell], ["npx", ["--yes", ARC1_PACKAGE], false]);
    const win = decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" }, platform: "win32" });
    assert.deepEqual([win.command, win.shell], ["npx.cmd", true]);
    const bin = decidirCom({ tool: "arc-1", sistema: { ambiente: "QAS" }, env: { ARC1_BIN: "/opt/arc1" } });
    assert.deepEqual([bin.command, bin.args], ["/opt/arc1", []]);
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
  for (const ambiente of ["QAS", "PRD"])
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
    assert.equal(decidirCom({ tool: "vsp", vars, env: { VSP_BIN: "C:/tools/vsp.exe" } }).command, "C:/tools/vsp.exe");
  });
});
