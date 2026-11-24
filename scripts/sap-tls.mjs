// Certificado TLS fixado por conexão SAP (política standards/politica-mcp-abap.md, seção 2;
// ADR-0013).
//
// Para SAP com certificado autoassinado (padrão do STRUST) ou de CA interna, o setup baixa o
// certificado do servidor (só o handshake TLS, sem usuário nem senha), mostra o SHA-256 para o
// usuário conferir e salva o .pem em .agents/certs/<servidor>.pem. A variável
// <P>_SAP_CA_CERT aponta para ele. O launcher passa a confiar só nesse certificado para essa
// conexão: no probe (opção `ca`) e no ARC-1 (NODE_EXTRA_CA_CERTS do processo filho).
// A verificação TLS nunca é desligada no Node.
//
// Sem dependências: só Node.js >= 18.

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

export const PASTA_CERTS = ".agents/certs";

// Códigos do Node/OpenSSL que indicam certificado não confiável (e não erro de rede).
export const ERRO_CERTIFICADO = /DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|CERT_UNTRUSTED|CERT_SIGNATURE_FAILURE|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED|CERT_NOT_YET_VALID/;
export const ehErroCertificado = (e) => ERRO_CERTIFICADO.test(`${e?.code ?? ""} ${e?.cause?.code ?? ""} ${e?.message ?? ""}`);

export function paraPem(der) {
  return `-----BEGIN CERTIFICATE-----\n${der.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
}

const nome = (dn) => dn?.CN ?? (dn ? Object.values(dn).flat().join(", ") : "?");
const autoassinado = (c) => Boolean(c?.issuerCertificate) && c.issuerCertificate.fingerprint256 === c.fingerprint256;

// Escolhe a âncora a fixar a partir da cadeia apresentada pelo servidor (getPeerCertificate(true)):
//   - certificado autoassinado (padrão do STRUST): ele mesmo;
//   - cadeia que termina numa raiz autoassinada enviada pelo servidor: a raiz;
//   - cadeia incompleta (raiz não enviada): null; é preciso pedir a CA raiz ao Basis.
export function escolherAncora(folha) {
  const vistos = new Set();
  let c = folha;
  while (c && !vistos.has(c.fingerprint256)) {
    if (autoassinado(c)) return c;
    vistos.add(c.fingerprint256);
    c = c.issuerCertificate;
  }
  return null;
}

export function descrever(folha, ancora) {
  return {
    assunto: nome(folha.subject),
    emissor: nome(folha.issuer),
    san: folha.subjectaltname ?? null,
    validoAte: folha.valid_to,
    sha256Folha: folha.fingerprint256,
    autoassinado: autoassinado(folha),
    ancora: ancora ? { assunto: nome(ancora.subject), sha256: ancora.fingerprint256, pem: paraPem(ancora.raw) } : null,
  };
}

// Lê a cadeia que o servidor apresenta, sem validá-la e sem enviar credencial nenhuma.
export function obterCertificado(url, { timeoutMs = 15000 } = {}) {
  const u = new URL(url);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const port = Number(u.port || 443);
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: false }, () => {
      const folha = s.getPeerCertificate(true);
      s.end();
      if (!folha?.raw) return reject(new Error("o servidor não apresentou certificado"));
      resolve(descrever(folha, escolherAncora(folha)));
    });
    s.setTimeout(timeoutMs, () => s.destroy(new Error(`sem resposta de ${host}:${port} em ${timeoutMs / 1000}s`)));
    s.on("error", reject);
  });
}

export const caminhoPadrao = (servidor) => `${PASTA_CERTS}/${servidor}.pem`;
export const resolverCaminho = (root, valor) => (path.isAbsolute(valor) ? valor : path.join(root, valor));

// Lê o .pem de <P>_SAP_CA_CERT. Erro claro se não existir ou não for PEM.
export function lerCertificado(root, valor) {
  const arquivo = resolverCaminho(root, valor);
  if (!fs.existsSync(arquivo)) throw new Error(`arquivo de certificado não encontrado: ${arquivo}`);
  const pem = fs.readFileSync(arquivo, "utf8");
  if (!/-----BEGIN CERTIFICATE-----/.test(pem)) throw new Error(`${arquivo} não é um certificado PEM`);
  return { arquivo, pem };
}

export function gravarCertificado(root, servidor, pem) {
  const rel = caminhoPadrao(servidor);
  const arquivo = resolverCaminho(root, rel);
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, pem);
  return rel;
}
