// Detecta, lendo o próprio sistema SAP, a identidade, o release e o ambiente de uma conexão.
// Usado por scripts/mcp-launch.mjs (política standards/politica-mcp-abap.md, ADR-0009).
//
//   Diagnóstico: node scripts/mcp-launch.mjs <servidor> --diagnostico
//
// Fontes (somente leitura, endpoints ADT que o Eclipse e os próprios ARC-1/vsp usam):
//   1. GET  /sap/bc/adt/core/http/systeminformation  -> SID, mandante, usuário (releases recentes).
//      O resultado traz sidOrigem: "systeminformation" (confirmado) ou "logsys" (só inferido).
//   2. GET  /sap/bc/adt/system/components            -> SAP_BASIS e S4CORE (release)
//   3. POST /sap/bc/adt/datapreview/freestyle        -> T000 do mandante: papel (CCCATEGORY),
//      alterabilidade (CCCORACTIV) e alterações entre mandantes (CCNOCLIIND); LOGSYS como
//      fallback do SID. É uma linha de configuração do mandante, sem dado de negócio.
//
// Princípio: falha fechada. O que não puder ser lido é tratado como o caso mais restritivo.
// Sem dependências: só Node.js >= 18. TLS nunca é desligado (use NODE_EXTRA_CA_CERTS se
// o certificado do SAP for de CA interna) e a URL precisa ser https:// (exceto localhost),
// porque a autenticação Basic levaria usuário e senha em texto claro.

const TIMEOUT_MS = 20000;

// Ordem de restrição: quanto maior, mais restritivo.
export const RESTRICAO = Object.freeze({ DEV: 0, SANDBOX: 1, QAS: 2, PRD: 3 });
export const ambienteValido = (a) => typeof a === "string" && Object.hasOwn(RESTRICAO, a);
// Falha fechada: um valor fora da enumeração vira PRD.
export const maisRestritivo = (a, b) => {
  if (!ambienteValido(a) || !ambienteValido(b)) return "PRD";
  return RESTRICAO[a] >= RESTRICAO[b] ? a : b;
};

// A autenticação é Basic: fora de https, usuário e senha trafegam em texto claro.
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function validarUrlSap(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`URL do SAP inválida: "${url}"`);
  }
  if (u.protocol === "https:") return;
  if (u.protocol === "http:" && HOSTS_LOCAIS.has(u.hostname.toLowerCase())) return;
  throw new Error(`a URL do SAP precisa ser https:// (recebido ${u.protocol}//${u.host}); http:// só é aceito para localhost, porque a autenticação Basic enviaria usuário e senha em texto claro`);
}

// T000-LOGSYS segue a convenção <SID>CLNT<mandante>. É só convenção: depois de uma cópia de
// mandante costuma vir errado, por isso o SID inferido daqui nunca conta como confirmado.
export const sidDoLogsys = (logsys) =>
  (typeof logsys === "string" ? logsys.trim().toUpperCase() : "").match(/^([A-Z][A-Z0-9]{2})CLNT\d{3}$/)?.[1] ?? null;

const PRODUTO_POR_BASIS = {
  750: "S/4HANA 1511", 751: "S/4HANA 1610", 752: "S/4HANA 1709", 753: "S/4HANA 1809",
  754: "S/4HANA 1909", 755: "S/4HANA 2020", 756: "S/4HANA 2021", 757: "S/4HANA 2022",
  758: "S/4HANA 2023", 816: "S/4HANA 2025",
};

class Sessao {
  constructor({ url, client, user, password }) {
    validarUrlSap(url);
    this.base = url.replace(/\/+$/, "");
    this.client = client;
    this.auth = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
    this.cookies = new Map();
    this.csrf = null;
  }
  url(p) {
    return `${this.base}${p}${p.includes("?") ? "&" : "?"}sap-client=${encodeURIComponent(this.client)}`;
  }
  guardarCookies(res) {
    const lista = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of lista) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      if (i > 0) this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  }
  headers(extra = {}) {
    const h = { Authorization: this.auth, ...extra };
    if (this.cookies.size) h.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return h;
  }
  async req(method, p, { accept, body, contentType } = {}) {
    const h = this.headers({ ...(accept ? { Accept: accept } : {}), ...(contentType ? { "Content-Type": contentType } : {}) });
    if (method === "GET" && !this.csrf) h["x-csrf-token"] = "fetch";
    if (method !== "GET" && this.csrf) h["x-csrf-token"] = this.csrf;
    const res = await fetch(this.url(p), { method, headers: h, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    this.guardarCookies(res);
    const token = res.headers.get("x-csrf-token");
    if (token && token.toLowerCase() !== "required") this.csrf = token;
    return { status: res.status, text: await res.text() };
  }
}

function lerXmlAttr(xml, tag) {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g"))].map((m) => m[1].trim());
}

// Resposta do datapreview: uma <columns> por coluna, com o nome em metadata e os valores em dataSet.
export function lerDataPreview(xml) {
  const linha = {};
  for (const col of xml.matchAll(/<(?:\w+:)?columns>([\s\S]*?)<\/(?:\w+:)?columns>/g)) {
    const nome = col[1].match(/(?:\w+:)?name="([^"]+)"/)?.[1];
    if (!nome) continue;
    const dado = col[1].match(/<(?:\w+:)?data>([\s\S]*?)<\/(?:\w+:)?data>|<(?:\w+:)?data\/>/);
    linha[nome.toUpperCase()] = dado ? (dado[1] ?? "").trim() : "";
  }
  return linha;
}

// Classificação do ambiente a partir da T000 (SCC4):
//   CCCATEGORY: P produção, T teste, C customizing, D demonstração, E treinamento, S referência SAP.
//   CCNOCLIIND: ' ' ou '1' = objetos de repositório alteráveis neste mandante; '2' ou '3' = não.
export function classificar(t000) {
  if (!t000) return { ambiente: "PRD", motivo: "T000 ilegível — tratado como PRD por precaução" };
  const cat = (t000.CCCATEGORY || "").toUpperCase();
  const repoAlteravel = ["", "1"].includes((t000.CCNOCLIIND || "").trim());
  const desc = `CCCATEGORY='${cat}', CCNOCLIIND='${(t000.CCNOCLIIND || "").trim()}'`;
  if (cat === "P") return { ambiente: "PRD", motivo: `mandante produtivo (${desc})` };
  if (cat === "T") return { ambiente: "QAS", motivo: `mandante de teste (${desc})` };
  if (cat === "C" && repoAlteravel) return { ambiente: "DEV", motivo: `mandante de customizing com repositório alterável (${desc})` };
  if (["D", "E"].includes(cat) && repoAlteravel) return { ambiente: "SANDBOX", motivo: `mandante de demo/treinamento com repositório alterável (${desc})` };
  return { ambiente: "QAS", motivo: `repositório não alterável ou papel não reconhecido (${desc}) — somente leitura` };
}

export async function detectar(conn) {
  const s = new Sessao(conn);
  const out = { sid: null, sidOrigem: null, client: null, user: null, sapBasis: null, s4core: null, produto: null, t000: null, avisos: [] };

  // 1. Identidade
  const si = await s.req("GET", "/sap/bc/adt/core/http/systeminformation", {
    accept: "application/vnd.sap.adt.core.http.systeminformation.v1+json, application/json",
  });
  if (si.status === 401) throw new Error("logon recusado (401) — confira usuário e senha");
  if (si.status === 200) {
    try {
      const j = JSON.parse(si.text);
      const f = (...ns) => { for (const [k, v] of Object.entries(j)) if (ns.some((n) => n.toLowerCase() === k.toLowerCase()) && typeof v === "string") return v.trim().toUpperCase(); return null; };
      out.sid = f("systemID", "sid");
      if (out.sid) out.sidOrigem = "systeminformation";
      out.client = f("client");
      out.user = f("userName", "user");
    } catch { /* release sem o recurso em JSON: cai no fallback da T000 */ }
  }

  // 2. Release
  const comp = await s.req("GET", "/sap/bc/adt/system/components", { accept: "application/atom+xml;type=feed" });
  if (comp.status !== 200) throw new Error(`não foi possível ler os componentes instalados (HTTP ${comp.status})`);
  for (const entry of comp.text.matchAll(/<(?:\w+:)?entry>([\s\S]*?)<\/(?:\w+:)?entry>/g)) {
    const id = lerXmlAttr(entry[1], "id")[0];
    const release = (lerXmlAttr(entry[1], "title")[0] || "").split(";")[0].trim();
    if (id === "SAP_BASIS") out.sapBasis = parseInt(release, 10);
    if (id === "S4CORE") out.s4core = release;
  }
  if (!Number.isFinite(out.sapBasis)) throw new Error("SAP_BASIS não encontrado nos componentes instalados");
  out.produto = out.s4core
    ? PRODUTO_POR_BASIS[out.sapBasis] || `S/4HANA (SAP_BASIS ${out.sapBasis})`
    : `NetWeaver/ECC (SAP_BASIS ${out.sapBasis})`;

  // 3. Papel do mandante (T000)
  const mandt = String(conn.client).replace(/\D/g, "").padStart(3, "0");
  const sql = `SELECT MANDT, LOGSYS, CCCATEGORY, CCCORACTIV, CCNOCLIIND FROM T000 WHERE MANDT = '${mandt}'`;
  const dp = await s.req("POST", "/sap/bc/adt/datapreview/freestyle?rowNumber=1", { body: sql, contentType: "text/plain", accept: "application/xml" });
  if (dp.status === 200) {
    const linha = lerDataPreview(dp.text);
    if (linha.MANDT) out.t000 = linha;
    else out.avisos.push("T000 retornou vazia para o mandante");
  } else {
    out.avisos.push(`T000 ilegível (HTTP ${dp.status}; o usuário pode não ter autorização de data preview)`);
  }
  if (!out.sid && out.t000?.LOGSYS) {
    out.sid = sidDoLogsys(out.t000.LOGSYS);
    if (out.sid) out.sidOrigem = "logsys";
    else out.avisos.push(`T000-LOGSYS "${out.t000.LOGSYS}" fora do padrão <SID>CLNT<mandante>; SID não inferido`);
  }
  if (!out.client && out.t000?.MANDT) out.client = out.t000.MANDT;

  Object.assign(out, classificar(out.t000));
  return out;
}
