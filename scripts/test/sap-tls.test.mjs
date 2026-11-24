// Testes do certificado fixado por conexão (scripts/sap-tls.mjs) e do probe com conn.ca.
// Rodar: node --test scripts/test/
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { caminhoPadrao, descrever, ehErroCertificado, escolherAncora, gravarCertificado, lerCertificado, paraPem } from "../sap-tls.mjs";
import { detectar } from "../sap-probe.mjs";

// Cadeia no formato de getPeerCertificate(true): issuerCertificate aponta para o emissor; na
// raiz autoassinada, para ela mesma.
function cert(cn, fp, emissor) {
  const c = { subject: { CN: cn }, issuer: { CN: emissor?.subject.CN ?? cn }, fingerprint256: fp, raw: Buffer.from(cn), valid_to: "Jan 1 2038" };
  c.issuerCertificate = emissor ?? c;
  return c;
}

describe("escolherAncora", () => {
  test("autoassinado (padrão do STRUST): o próprio certificado", () => {
    const c = cert("*.cliente.com", "AA");
    assert.equal(escolherAncora(c), c);
  });
  test("cadeia com a raiz enviada: a raiz", () => {
    const raiz = cert("CA Raiz", "R1");
    const inter = cert("CA Intermediária", "I1", raiz);
    const folha = cert("sap.cliente.com", "F1", inter);
    assert.equal(escolherAncora(folha), raiz);
  });
  test("cadeia incompleta (raiz não enviada): null", () => {
    const inter = cert("CA Intermediária", "I1");
    inter.issuerCertificate = undefined;
    const folha = cert("sap.cliente.com", "F1", inter);
    assert.equal(escolherAncora(folha), null);
  });
  test("ciclo sem raiz autoassinada não trava", () => {
    const a = cert("A", "A1");
    const b = cert("B", "B1", a);
    a.issuerCertificate = b;
    assert.equal(escolherAncora(b), null);
  });
});

describe("descrever", () => {
  test("sem SAN, autoassinado, com âncora em PEM", () => {
    const c = cert("*.cliente.com", "AA");
    const d = descrever(c, escolherAncora(c));
    assert.equal(d.san, null);
    assert.equal(d.autoassinado, true);
    assert.equal(d.ancora.sha256, "AA");
    assert.match(d.ancora.pem, /^-----BEGIN CERTIFICATE-----\n[\s\S]+\n-----END CERTIFICATE-----\n$/);
  });
});

describe("ehErroCertificado", () => {
  test("códigos de certificado contam; erros de rede não", () => {
    const comCausa = (code) => Object.assign(new Error("fetch failed"), { cause: { code } });
    for (const code of ["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED"])
      assert.ok(ehErroCertificado(comCausa(code)), code);
    assert.ok(ehErroCertificado(Object.assign(new Error("x"), { code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" })));
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"]) assert.ok(!ehErroCertificado(comCausa(code)), code);
    assert.ok(!ehErroCertificado(new Error("logon recusado (401)")));
  });
});

describe("gravarCertificado / lerCertificado", () => {
  let root;
  before(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "sap-tls-")); });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  test("grava em .agents/certs/<servidor>.pem e lê de volta pelo caminho relativo", () => {
    const pem = paraPem(Buffer.from("certificado"));
    const rel = gravarCertificado(root, "vsp", pem);
    assert.equal(rel, caminhoPadrao("vsp"));
    assert.equal(rel, ".agents/certs/vsp.pem");
    const lido = lerCertificado(root, rel);
    assert.equal(lido.pem, pem);
    assert.equal(lido.arquivo, path.join(root, rel));
  });
  test("arquivo ausente ou que não é PEM: erro claro", () => {
    assert.throws(() => lerCertificado(root, "nao-existe.pem"), /não encontrado/);
    fs.writeFileSync(path.join(root, "x.pem"), "lixo");
    assert.throws(() => lerCertificado(root, "x.pem"), /não é um certificado PEM/);
  });
});

// Probe com conn.ca: a requisição vai por node:http(s) em vez de fetch. Servidor local em http
// (aceito para localhost) exercita o adaptador: cookies, token CSRF, corpo do POST e status.
describe("detectar com conn.ca (node:http)", () => {
  let servidor, url;
  const recebido = { cookie: null, csrf: null, sql: null };
  before(async () => {
    servidor = http.createServer((req, res) => {
      const p = new URL(req.url, "http://x").pathname;
      let corpo = "";
      req.on("data", (d) => (corpo += d));
      req.on("end", () => {
        if (p.endsWith("/core/http/systeminformation")) {
          res.writeHead(200, { "set-cookie": ["SAP_SESSIONID=abc; path=/"], "x-csrf-token": "TOKEN1" });
          return res.end(JSON.stringify({ systemID: "ds4", client: "100", userName: "DEV" }));
        }
        if (p.endsWith("/system/components")) {
          recebido.cookie = req.headers.cookie;
          res.writeHead(200);
          return res.end('<feed><entry><id>SAP_BASIS</id><title>758;x</title></entry><entry><id>S4CORE</id><title>108;x</title></entry></feed>');
        }
        if (p.endsWith("/datapreview/freestyle")) {
          recebido.csrf = req.headers["x-csrf-token"];
          recebido.sql = corpo;
          res.writeHead(200);
          return res.end('<columns><metadata name="MANDT"/><dataSet><data>100</data></dataSet></columns><columns><metadata name="CCCATEGORY"/><dataSet><data>C</data></dataSet></columns><columns><metadata name="CCNOCLIIND"/><dataSet><data/></dataSet></columns>');
        }
        res.writeHead(404);
        res.end();
      });
    });
    await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
    url = `http://localhost:${servidor.address().port}`;
  });
  after(() => servidor.close());

  test("detecta, reenvia cookie e token CSRF e manda o corpo do POST", async () => {
    const d = await detectar({ url, client: "100", user: "DEV", password: "x", ca: "-----BEGIN CERTIFICATE-----" });
    assert.equal(d.sid, "DS4");
    assert.equal(d.sapBasis, 758);
    assert.equal(d.ambiente, "DEV");
    assert.match(recebido.cookie, /SAP_SESSIONID=abc/);
    assert.equal(recebido.csrf, "TOKEN1");
    assert.match(recebido.sql, /FROM T000 WHERE MANDT = '100'/);
  });
  test("401 vira erro de logon", async () => {
    const s401 = http.createServer((_q, r) => { r.writeHead(401); r.end(); });
    await new Promise((r) => s401.listen(0, "127.0.0.1", r));
    try {
      await assert.rejects(detectar({ url: `http://localhost:${s401.address().port}`, client: "100", user: "DEV", password: "x", ca: "x" }), /401/);
    } finally {
      s401.close();
    }
  });
});
