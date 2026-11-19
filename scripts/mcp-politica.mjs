// Decisões do launcher (scripts/mcp-launch.mjs) separadas do I/O, para serem testáveis.
// Política: standards/politica-mcp-abap.md (ADR-0009). Testes: scripts/test/.
//
// Todas as funções são puras: recebem o que foi lido (ambiente do processo, .env, resposta do
// probe, registro de restrições) e devolvem a decisão ou lançam Recusa com a mensagem para o
// usuário. Nenhuma escreve em disco, lê variáveis globais ou acessa a rede.

import { RESTRICAO, ambienteValido, maisRestritivo } from "./sap-probe.mjs";

export class Recusa extends Error {
  constructor(msg) {
    super(msg);
    this.name = "Recusa";
  }
}
const recusar = (msg) => { throw new Recusa(msg); };

export const PLACEHOLDER = /<[^>]*>/;

// Valor de uma variável do ambiente/.env (3.5). Em geral, qualquer <...> indica placeholder do
// .env.example. Na senha, <...> pode ser parte do valor real: só conta como placeholder se o
// valor inteiro for <...> (ex.: <SENHA>), e esse nunca é enviado ao SAP (cada logon errado
// conta para o bloqueio do usuário).
export function valorDeVariavel(nome, bruto) {
  if (bruto === undefined || bruto === null || bruto === "") return { valor: undefined, placeholder: false };
  const placeholder = /(^|_)SAP_PASSWORD$/.test(nome) ? /^<[^<>]*>$/.test(bruto.trim()) : PLACEHOLDER.test(bruto);
  return placeholder ? { valor: undefined, placeholder: true } : { valor: bruto, placeholder: false };
}
const AMBIENTES = Object.keys(RESTRICAO).join(", ");
export const BASIS_MINIMO = 750; // política, regra absoluta 5
export const BASIS_MCP_OFICIAL = 816; // S/4HANA 2025+: abap-adt

// Ações do ARC-1 negadas por SAP_DENY_ACTIONS (nomes conferidos em arc-1@1.10.1,
// dist/authz/policy.js). O ARC-1 roda sempre na última versão estável (scripts/arc1-pacote.mjs):
// se uma versão nova renomear uma ação, o próprio ARC-1 recusa iniciar com o nome desconhecido.
export const ARC1_NEGADAS_SEMPRE = ["SAPWrite.delete"];
// Política 4.2: ABAP Unit só em DEV/SANDBOX. Teste unitário executa código e pode ter efeito
// colateral (gravação, RFC, bloqueio). As ações são do tipo Test, que o modo somente leitura não
// bloqueia; por isso a negação explícita em QAS e PRD.
export const ARC1_NEGADAS_FORA_DEV = ["SAPDiagnose.unittest", "SAPDiagnose.unittest_ci"];

// ---------------------------------------------------------------- comando (2.4)
// No Windows, .cmd/.bat só rodam via cmd.exe (spawn sem shell falha com EINVAL no Node >=
// 18.20.2/20.12.2). Com shell, o cmd.exe interpreta a linha: o caminho e cada argumento vão
// entre aspas, e qualquer caractere que o cmd.exe ainda interpretaria dentro de aspas (%, !, ^,
// aspas) ou que quebraria a linha é recusado.
const SEGURO_NO_CMD = /^[^"%!^\r\n]*$/;
export function precisaShell(command, platform) {
  return platform === "win32" && /\.(cmd|bat)$/i.test(command);
}
export function comandoParaSpawn(command, args, platform) {
  if (!precisaShell(command, platform)) return { command, args, shell: false };
  for (const x of [command, ...args])
    if (!SEGURO_NO_CMD.test(x))
      recusar(`${command} é um script .cmd/.bat e precisa do cmd.exe, mas ${JSON.stringify(x)} contém caractere que o cmd.exe interpretaria (% ! ^ ou aspas). Use o executável (.exe) ou remova o caractere.`);
  const q = (x) => `"${x}"`;
  return { command: q(command), args: args.map(q), shell: true };
}

// ---------------------------------------------------------------- TLS (1.3)
// NODE_TLS_REJECT_UNAUTHORIZED=0 desliga a verificação de certificado do probe e do ARC-1.
export function verificarTls(env) {
  if (String(env.NODE_TLS_REJECT_UNAUTHORIZED ?? "").trim() === "0")
    recusar("NODE_TLS_REJECT_UNAUTHORIZED=0 desliga a verificação TLS, o que a política proíbe. "
      + "Remova a variável; se o certificado do SAP for de uma CA interna, aponte NODE_EXTRA_CA_CERTS para o arquivo .pem da CA.");
}

// Variáveis que não passam ao processo filho: credenciais e configurações do usuário (o filho
// recebe só as que o launcher define) e opções do Node que poderiam desligar o TLS ou injetar código.
const NAO_HERDAR = /^(SAP_|ARC1_|VSP_|ABAP_ADT_TOKEN$|NODE_OPTIONS$|NODE_TLS_REJECT_UNAUTHORIZED$)/i;
export function filtrarEnvFilho(env) {
  const out = {};
  for (const [k, val] of Object.entries(env)) if (!NAO_HERDAR.test(k)) out[k] = val;
  return out;
}

// ---------------------------------------------------------------- registro de restrições (1.1)
// standards/sistemas-sap.json: { "restricoes": [ { sid, mandante?, ambiente, observacao? } ] }
// - sid e ambiente obrigatórios; ambiente em DEV/SANDBOX/QAS/PRD;
// - sem mandante, a restrição vale para todos os mandantes do SID;
// - entrada com sid ainda placeholder (<...>) é modelo e é ignorada, com aviso;
// - qualquer outra entrada inválida, ou JSON malformado, recusa iniciar.
export function lerRegistro(texto, origem) {
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    recusar(`${origem} não é um JSON válido (${e.message}). Corrija o arquivo ou remova-o.`);
  }
  if (dados === null || typeof dados !== "object" || Array.isArray(dados))
    recusar(`${origem}: o conteúdo precisa ser um objeto com a lista "restricoes".`);
  const lista = dados.restricoes ?? [];
  if (!Array.isArray(lista)) recusar(`${origem}: "restricoes" precisa ser uma lista.`);

  const restricoes = [];
  const avisos = [];
  lista.forEach((r, i) => {
    const onde = `${origem}, restricoes[${i}]`;
    if (r === null || typeof r !== "object" || Array.isArray(r)) recusar(`${onde}: cada entrada precisa ser um objeto.`);
    if (typeof r.sid === "string" && PLACEHOLDER.test(r.sid)) {
      avisos.push(`${onde} ignorada: "sid" ainda é placeholder (${r.sid})`);
      return;
    }
    const sid = typeof r.sid === "string" ? r.sid.trim().toUpperCase() : "";
    if (!/^[A-Z][A-Z0-9]{2}$/.test(sid))
      recusar(`${onde}: "sid" é obrigatório e tem 3 caracteres (ex.: "QS4"); recebido ${JSON.stringify(r.sid)}.`);
    const ambiente = typeof r.ambiente === "string" ? r.ambiente.trim().toUpperCase() : "";
    if (!ambienteValido(ambiente))
      recusar(`${onde}: "ambiente" é obrigatório e deve ser um de ${AMBIENTES}; recebido ${JSON.stringify(r.ambiente)}.`);
    let mandante = null;
    if (r.mandante !== undefined && r.mandante !== null && r.mandante !== "") {
      const m = String(r.mandante).trim();
      if (!/^\d{1,3}$/.test(m))
        recusar(`${onde}: "mandante", se informado, tem até 3 dígitos (ex.: "400"); recebido ${JSON.stringify(r.mandante)}. Omita-o para restringir todos os mandantes do SID.`);
      mandante = m.padStart(3, "0");
    }
    restricoes.push({ sid, mandante, ambiente });
  });
  return { restricoes, avisos };
}

// Aplica todas as restrições que casam com o sistema; vale sempre o mais restritivo.
export function aplicarRegistro({ sid, mandante, ambiente, motivo }, restricoes, origem) {
  const detectado = ambiente;
  const avisos = [];
  for (const r of restricoes) {
    if (r.sid !== sid || (r.mandante !== null && r.mandante !== mandante)) continue;
    const alvo = r.mandante ? `${sid}/${mandante}` : `${sid} (todos os mandantes)`;
    const efetivo = maisRestritivo(ambiente, r.ambiente);
    if (efetivo !== ambiente) motivo = `${origem} restringe ${alvo} a ${r.ambiente} (detectado: ${detectado})`;
    else if (r.ambiente !== ambiente) avisos.push(`${origem} declara ${alvo} como ${r.ambiente}, mas o sistema é ${ambiente}; vale o mais restritivo (${ambiente})`);
    ambiente = efetivo;
  }
  return { ambiente, motivo, avisos };
}

// ---------------------------------------------------------------- SID (1.2)
// Só o SID lido do systeminformation conta como confirmado. O do T000-LOGSYS é convenção:
// precisa de <P>_SAP_SID igual; sem ele, o vsp recusa e o ARC-1 fica somente leitura
// (sidPendente). SID divergente do declarado recusa, venha de onde vier.
export function resolverSid({ sid, sidOrigem }, sidDeclarado, prefix) {
  const variavel = `${prefix}_SAP_SID`;
  if (sid && sidOrigem === "systeminformation") {
    if (sidDeclarado && sidDeclarado !== sid)
      recusar(`o sistema conectado é ${sid}, mas ${variavel} diz ${sidDeclarado} — confira a URL`);
    return { sid, sidOrigem, sidConfirmado: true, sidPendente: false, avisos: [] };
  }
  if (sid && sidOrigem === "logsys") {
    if (!sidDeclarado)
      return {
        sid, sidOrigem, sidConfirmado: false, sidPendente: true,
        avisos: [`SID ${sid} inferido do T000-LOGSYS, sem confirmação do sistema; se estiver correto, defina ${variavel}=${sid}`],
      };
    if (sidDeclarado !== sid)
      recusar(`o T000-LOGSYS indica o SID ${sid}, mas ${variavel} diz ${sidDeclarado}. Confira a URL; se o LOGSYS estiver errado (comum depois de cópia de mandante), corrija-o no SAP (BD54/SCC4).`);
    return { sid, sidOrigem, sidConfirmado: false, sidPendente: false, avisos: [`SID ${sid} inferido do T000-LOGSYS e conferido com ${variavel}`] };
  }
  if (!sidDeclarado)
    recusar(`SID não detectado (sistema sem systeminformation e sem T000-LOGSYS legível) — informe ${variavel}`);
  return { sid: sidDeclarado, sidOrigem: "declarado", sidConfirmado: false, sidPendente: false, avisos: [`SID não confirmado pelo sistema; usando o declarado ${sidDeclarado}`] };
}

// ---------------------------------------------------------------- decisão por ferramenta (1.5 e travas)
// Entrada:
//   tool        "arc-1" | "vsp"
//   prefix      prefixo das variáveis (ARC1, VSP_SANDBOX...)
//   sistema     { sid, sidPendente, mandante, ambiente, motivo, sapBasis, produto }
//   conn        { url, client, user, password }
//   v(nome)     valor da variável <prefix>_<nome> (undefined se ausente ou placeholder)
//   env         ambiente do processo (base do ambiente do filho; ARC1_BIN/VSP_BIN)
//   arc1        { command, args } do ARC-1 gerenciado (scripts/arc1-pacote.mjs); ignorado com ARC1_BIN
//   platform    process.platform
// Saída: { command, args, shell, modo, acoesNegadas, childEnv, avisos } ou Recusa.
export function decidir({ tool, prefix, sistema, conn, v, env, platform, arc1 }) {
  const { sid, sidPendente, mandante, ambiente, motivo, sapBasis, produto } = sistema;
  const req = (nome) => v(nome) ?? recusar(`variável ${prefix}_${nome} não definida ou ainda com placeholder <...> (ambiente ou .env)`);
  const flag = (nome) => /^(true|1|yes)$/i.test(v(nome) ?? "");
  const avisos = [];

  // Regra absoluta 5: SAP_BASIS < 750 está fora do escopo, para qualquer servidor.
  if (!Number.isFinite(sapBasis) || sapBasis < BASIS_MINIMO)
    recusar(`${tool} recusado: SAP_BASIS ${sapBasis} (${produto}) está fora do escopo da política (mínimo ${BASIS_MINIMO}).`);

  const isDev = ambiente === "DEV" || ambiente === "SANDBOX";
  const childEnv = filtrarEnvFilho(env);
  Object.assign(childEnv, { SAP_URL: conn.url, SAP_CLIENT: conn.client, SAP_USER: conn.user, SAP_PASSWORD: conn.password });

  let command, args, modo, acoesNegadas;

  if (tool === "arc-1") {
    // Exceção controlada da política 4.2: escrita em DEV só com opt-in explícito (2.1).
    const podeEscrever = isDev && sapBasis < BASIS_MCP_OFICIAL;
    const pediuEscrita = flag("ALLOW_DEV_WRITES");
    const writes = podeEscrever && pediuEscrita && !sidPendente;
    if (podeEscrever && pediuEscrita && sidPendente)
      avisos.push(`ARC-1 em somente leitura até o SID ser confirmado (defina ${prefix}_SAP_SID)`);
    if (podeEscrever && !pediuEscrita)
      avisos.push(`${sid} é ${ambiente}, mas o ARC-1 inicia somente leitura; para a exceção controlada (política 4.2), defina ${prefix}_ALLOW_DEV_WRITES=true e ${prefix}_ALLOWED_PACKAGES`);
    if (!isDev && pediuEscrita)
      avisos.push(`${prefix}_ALLOW_DEV_WRITES ignorada: ${sid} é ${ambiente}`);
    modo = writes ? "escrita restrita a pacotes" : "somente leitura";
    acoesNegadas = [...ARC1_NEGADAS_SEMPRE, ...(isDev ? [] : ARC1_NEGADAS_FORA_DEV)];
    Object.assign(childEnv, {
      SAP_TRANSPORT: "stdio",
      SAP_INSECURE: "false",
      SAP_ALLOW_WRITES: String(writes),
      SAP_ALLOW_TRANSPORT_WRITES: "false",
      SAP_ALLOW_GIT_WRITES: "false",
      SAP_ALLOW_DATA_PREVIEW: "false",
      SAP_ALLOW_FREE_SQL: "false",
      SAP_ALLOW_PLUGIN_EXECUTE: "false",
      SAP_DENY_ACTIONS: acoesNegadas.join(","),
    });
    if (writes) childEnv.SAP_ALLOWED_PACKAGES = req("ALLOWED_PACKAGES");
    if (v("BLOCKED_DATA_SOURCES")) childEnv.SAP_BLOCKED_DATA_SOURCES = v("BLOCKED_DATA_SOURCES");
    if (env.ARC1_BIN) {
      command = env.ARC1_BIN;
      args = [];
    } else if (arc1) {
      ({ command, args } = arc1);
    } else {
      recusar("ARC-1 não instalado: defina ARC1_BIN ou deixe o launcher instalá-lo (scripts/arc1-pacote.mjs).");
    }
  } else if (tool === "vsp") {
    if (!isDev) recusar(`vsp recusado: ${sid}/${mandante} é ${ambiente} — ${motivo}. Política MCP: vsp só em DEV/SANDBOX.`);
    if (sapBasis >= BASIS_MCP_OFICIAL) recusar(`vsp recusado: SAP_BASIS ${sapBasis} (${produto}); permitido só ${BASIS_MINIMO}–${BASIS_MCP_OFICIAL - 1}. Use o abap-adt.`);
    if (sidPendente)
      recusar(`vsp recusado: o SID ${sid} veio do T000-LOGSYS e não foi confirmado pelo sistema. Se estiver correto, defina ${prefix}_SAP_SID=${sid}.`);
    modo = flag("READ_ONLY") ? "somente leitura" : "desenvolvimento";
    command = env.VSP_BIN || "vsp";
    args = ["--mode", "hyperfocused", "--expect", `${sid}.${mandante}/${conn.user}`,
      "--allowed-packages", req("ALLOWED_PACKAGES"), "--block-free-sql"];
    if (v("ALLOWED_TRANSPORTS")) args.push("--allow-transportable-edits", "--allowed-transports", v("ALLOWED_TRANSPORTS"));
    if (flag("ENABLE_TRANSPORTS")) args.push("--enable-transports");
    if (flag("READ_ONLY")) args.push("--read-only");
  } else {
    recusar(`ferramenta desconhecida: ${tool}`);
  }

  return { ...comandoParaSpawn(command, args, platform), modo, acoesNegadas, childEnv, avisos };
}
