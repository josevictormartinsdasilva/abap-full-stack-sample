// Testes do probe (scripts/sap-probe.mjs). Rodar: node --test scripts/test/
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { classificar, maisRestritivo, lerDataPreview, sidDoLogsys, validarUrlSap, detectar } from "../sap-probe.mjs";

describe("classificar — tabela da seção 2 da política", () => {
  const casos = [
    // [CCCATEGORY, CCNOCLIIND, ambiente esperado]
    ["P", "", "PRD"],
    ["P", "1", "PRD"],
    ["T", "", "QAS"],
    ["T", "3", "QAS"],
    ["C", "", "DEV"],
    ["C", "1", "DEV"],
    ["C", "2", "QAS"],
    ["C", "3", "QAS"],
    ["D", "", "SANDBOX"],
    ["E", "1", "SANDBOX"],
    ["D", "2", "QAS"],
    ["E", "3", "QAS"],
    ["S", "", "QAS"],
    ["", "", "QAS"],
    ["X", "1", "QAS"],
  ];
  for (const [cat, noclii, esperado] of casos)
    test(`CCCATEGORY='${cat}', CCNOCLIIND='${noclii}' -> ${esperado}`, () => {
      assert.equal(classificar({ CCCATEGORY: cat, CCNOCLIIND: noclii }).ambiente, esperado);
    });

  test("categoria em minúscula e CCNOCLIIND com espaço", () => {
    assert.equal(classificar({ CCCATEGORY: "c", CCNOCLIIND: " " }).ambiente, "DEV");
  });
  test("T000 ilegível -> PRD", () => {
    assert.equal(classificar(null).ambiente, "PRD");
    assert.equal(classificar(undefined).ambiente, "PRD");
  });
});

describe("maisRestritivo (1.6)", () => {
  test("ordem DEV < SANDBOX < QAS < PRD, nos dois sentidos", () => {
    assert.equal(maisRestritivo("DEV", "SANDBOX"), "SANDBOX");
    assert.equal(maisRestritivo("QAS", "DEV"), "QAS");
    assert.equal(maisRestritivo("PRD", "QAS"), "PRD");
    assert.equal(maisRestritivo("DEV", "DEV"), "DEV");
  });
  test("valor fora da enumeração -> PRD (falha fechada)", () => {
    assert.equal(maisRestritivo("DEV", "HOMOLOG"), "PRD");
    assert.equal(maisRestritivo("HOMOLOG", "DEV"), "PRD");
    assert.equal(maisRestritivo("DEV", undefined), "PRD");
    assert.equal(maisRestritivo("DEV", "dev"), "PRD");
    assert.equal(maisRestritivo("DEV", "toString"), "PRD");
  });
});

describe("sidDoLogsys", () => {
  test("LOGSYS no padrão <SID>CLNT<nnn>", () => {
    assert.equal(sidDoLogsys("DS4CLNT100"), "DS4");
    assert.equal(sidDoLogsys(" ds4clnt100 "), "DS4");
  });
  test("LOGSYS fora do padrão -> null", () => {
    for (const x of ["", "LS_DS4_100", "DS4CLNT10", "DS4CLNT1000", "1S4CLNT100", "DS4XCLNT100", null, undefined, 42])
      assert.equal(sidDoLogsys(x), null, String(x));
  });
});

describe("validarUrlSap (1.4)", () => {
  test("https aceito", () => {
    assert.doesNotThrow(() => validarUrlSap("https://sap.exemplo.com:44300"));
  });
  test("http para localhost aceito", () => {
    for (const u of ["http://localhost:8000", "http://127.0.0.1:50000", "http://[::1]:8000", "http://LOCALHOST"])
      assert.doesNotThrow(() => validarUrlSap(u), u);
  });
  test("http para host remoto recusado", () => {
    for (const u of ["http://sap.exemplo.com:8000", "http://10.0.0.5", "http://localhost.exemplo.com"])
      assert.throws(() => validarUrlSap(u), /https:\/\//, u);
  });
  test("URL inválida ou outro protocolo recusado", () => {
    assert.throws(() => validarUrlSap("sap.exemplo.com"), /inválida/);
    assert.throws(() => validarUrlSap("ftp://sap.exemplo.com"), /https:\/\//);
  });
});

describe("lerDataPreview", () => {
  test("lê colunas com e sem valor", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview">
  <dataPreview:totalRows>1</dataPreview:totalRows>
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="MANDT" dataPreview:type="C"/>
    <dataPreview:dataSet><dataPreview:data>100</dataPreview:data></dataPreview:dataSet>
  </dataPreview:columns>
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="cccategory" dataPreview:type="C"/>
    <dataPreview:dataSet><dataPreview:data> C </dataPreview:data></dataPreview:dataSet>
  </dataPreview:columns>
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="CCNOCLIIND" dataPreview:type="C"/>
    <dataPreview:dataSet><dataPreview:data/></dataPreview:dataSet>
  </dataPreview:columns>
</dataPreview:tableData>`;
    assert.deepEqual(lerDataPreview(xml), { MANDT: "100", CCCATEGORY: "C", CCNOCLIIND: "" });
  });
  test("resposta sem colunas -> objeto vazio", () => {
    assert.deepEqual(lerDataPreview("<dataPreview:tableData/>"), {});
  });
});

// ---------------------------------------------------------------- detectar com SAP simulado
const COMPONENTES = (basis) => `<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
<atom:entry><atom:id>SAP_BASIS</atom:id><atom:title>${basis};SAPK-${basis}03INSAPBASIS;0003;SAP Basis Component</atom:title></atom:entry>
<atom:entry><atom:id>S4CORE</atom:id><atom:title>108;SAPK-10803INS4CORE;0003;S4CORE</atom:title></atom:entry>
</atom:feed>`;
const T000 = ({ logsys, cat = "C", noclii = "" }) => `<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview">
${Object.entries({ MANDT: "100", LOGSYS: logsys, CCCATEGORY: cat, CCCORACTIV: "1", CCNOCLIIND: noclii })
    .map(([k, val]) => `<dataPreview:columns><dataPreview:metadata dataPreview:name="${k}"/><dataPreview:dataSet>${val ? `<dataPreview:data>${val}</dataPreview:data>` : "<dataPreview:data/>"}</dataPreview:dataSet></dataPreview:columns>`).join("\n")}
</dataPreview:tableData>`;

function simularSap({ systeminformation, basis = 758, t000 }) {
  globalThis.fetch = async (url, init = {}) => {
    const p = new URL(url).pathname;
    const accept = new Headers(init.headers).get("accept") ?? "";
    if (p.endsWith("/core/http/systeminformation"))
      return systeminformation ? new Response(JSON.stringify(systeminformation), { status: 200 }) : new Response("", { status: 404 });
    if (p.endsWith("/system/components")) return new Response(COMPONENTES(basis), { status: 200 });
    // Releases ≤ 2023 respondem 406 se o Accept não trouxer o tipo próprio do data preview.
    if (p.endsWith("/datapreview/freestyle") && !accept.includes("application/vnd.sap.adt.datapreview.table.v1+xml"))
      return new Response("", { status: 406 });
    if (p.endsWith("/datapreview/freestyle")) return t000 ? new Response(T000(t000), { status: 200 }) : new Response("", { status: 403 });
    return new Response("", { status: 404 });
  };
}
const fetchOriginal = globalThis.fetch;
const CONN = { url: "https://sap.exemplo.com", client: "100", user: "DEV", password: "x" };

describe("detectar — origem do SID (1.2)", () => {
  afterEach(() => { globalThis.fetch = fetchOriginal; });

  test("SID do systeminformation -> sidOrigem systeminformation", async () => {
    simularSap({ systeminformation: { systemID: "ds4", client: "100", userName: "DEV" }, t000: { logsys: "XXXCLNT100" } });
    const d = await detectar(CONN);
    assert.equal(d.sid, "DS4");
    assert.equal(d.sidOrigem, "systeminformation");
    assert.equal(d.ambiente, "DEV");
    assert.equal(d.sapBasis, 758);
  });
  test("sem systeminformation, LOGSYS válido -> sidOrigem logsys", async () => {
    simularSap({ t000: { logsys: "DS4CLNT100" } });
    const d = await detectar(CONN);
    assert.equal(d.sid, "DS4");
    assert.equal(d.sidOrigem, "logsys");
  });
  test("sem systeminformation, LOGSYS fora do padrão -> sem SID e com aviso", async () => {
    simularSap({ t000: { logsys: "LS_DS4_100" } });
    const d = await detectar(CONN);
    assert.equal(d.sid, null);
    assert.equal(d.sidOrigem, null);
    assert.ok(d.avisos.some((a) => a.includes("LOGSYS")));
  });
  test("T000 ilegível -> PRD e sem SID", async () => {
    simularSap({});
    const d = await detectar(CONN);
    assert.equal(d.ambiente, "PRD");
    assert.equal(d.sid, null);
  });
  test("URL http remota recusada antes de qualquer requisição", async () => {
    let chamou = false;
    globalThis.fetch = async () => { chamou = true; return new Response("", { status: 200 }); };
    await assert.rejects(detectar({ ...CONN, url: "http://sap.exemplo.com" }), /https:\/\//);
    assert.equal(chamou, false);
  });
});
