// Leitura e escrita da configuração local de um projeto (clone por cliente): .env, bloco
// "cliente" de standards/naming-conventions.json e placeholders de
// standards/padrao-desenvolvimento.md. Usado por scripts/setup.mjs, scripts/doctor.mjs e
// scripts/mcp-launch.mjs.
//
// Só funções puras (texto entra, texto sai), para os testes não tocarem em arquivo nem em SAP.
// Sem dependências: só Node.js >= 18.

import { PLACEHOLDER, valorDeVariavel } from "./mcp-politica.mjs";

// ---------------------------------------------------------------- servidores
// O nome da entrada em .agents/mcp.servers.json define a ferramenta e o prefixo das variáveis:
//   vsp -> VSP_*   vsp-sandbox -> VSP_SANDBOX_*   arc-1-qas -> ARC1_QAS_*
export function prefixoDoServidor(servidor) {
  const tool = servidor.startsWith("arc-1") ? "arc-1" : servidor.startsWith("vsp") ? "vsp" : null;
  if (!tool) return null;
  const prefix = (tool === "arc-1" ? "ARC1" : "VSP") + servidor.slice(tool.length).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return { tool, prefix };
}

// ---------------------------------------------------------------- .env
// Uma variável por linha (NOME=valor); linhas iniciadas por # são comentário. Não há comentário
// no fim da linha: o # faz parte do valor (senhas podem conter #). Aspas simples ou duplas
// envolvendo o valor inteiro são removidas.
const LINHA_ENV = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
export function lerDotEnv(texto) {
  const out = {};
  for (const line of texto.split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(LINHA_ENV);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

// Escreve o valor de forma que lerDotEnv o leia de volta igual: aspas envolvem o valor quando
// ele tem espaço nas pontas (que a leitura apararia) ou já começa e termina com a mesma aspa.
export function formatarValorEnv(valor) {
  const s = String(valor);
  if (/[\r\n]/.test(s)) throw new Error("valor com quebra de linha não cabe no .env");
  if (s !== s.trim() || /^(['"]).*\1$/s.test(s)) return s.includes('"') ? `'${s}'` : `"${s}"`;
  return s;
}

// Atualiza variáveis num .env preservando comentários e ordem:
//   - linha ativa NOME=... existente: troca o valor (todas as ocorrências);
//   - senão, linha comentada "# NOME=..." (modelo do .env.example): vira a linha ativa;
//   - senão, acrescenta no fim.
// valor null remove a linha ativa (volta a valer o padrão).
export function atualizarDotEnv(texto, valores) {
  const eol = texto.includes("\r\n") ? "\r\n" : "\n";
  let linhas = texto.split(/\r?\n/);
  for (const [nome, valor] of Object.entries(valores)) {
    const ativa = (l) => l.match(LINHA_ENV)?.[1] === nome && !l.trim().startsWith("#");
    if (valor === null) {
      linhas = linhas.filter((l) => !ativa(l));
      continue;
    }
    const nova = `${nome}=${formatarValorEnv(valor)}`;
    if (linhas.some(ativa)) {
      linhas = linhas.map((l) => (ativa(l) ? nova : l));
      continue;
    }
    const comentada = linhas.findIndex((l) => new RegExp(`^\\s*#\\s*${nome}\\s*=`).test(l));
    if (comentada >= 0) {
      linhas[comentada] = nova;
      continue;
    }
    if (linhas.length && linhas[linhas.length - 1] === "") linhas.splice(linhas.length - 1, 0, nova);
    else linhas.push(nova);
  }
  return linhas.join(eol);
}

// Situação da conexão de um servidor: "vazia" (nada preenchido, o servidor não é usado),
// "incompleta" (faltam variáveis) ou "completa".
export const VARIAVEIS_CONEXAO = ["SAP_URL", "SAP_CLIENT", "SAP_USER", "SAP_PASSWORD"];
export function situacaoConexao(prefix, ler) {
  const faltando = VARIAVEIS_CONEXAO.filter((n) => valorDeVariavel(`${prefix}_${n}`, ler(`${prefix}_${n}`)).valor === undefined);
  if (faltando.length === VARIAVEIS_CONEXAO.length) return { situacao: "vazia", faltando };
  return { situacao: faltando.length ? "incompleta" : "completa", faltando: faltando.map((n) => `${prefix}_${n}`) };
}

// ---------------------------------------------------------------- bloco "cliente"
export const ehPlaceholder = (valor) => typeof valor !== "string" || valor.trim() === "" || PLACEHOLDER.test(valor);

// Campos do bloco "cliente" ainda com <...> (ignora os que começam com _, como _instrucao).
export function camposPendentes(cliente) {
  return Object.entries(cliente || {}).filter(([k, v]) => !k.startsWith("_") && ehPlaceholder(v)).map(([k]) => k);
}

// Troca valores dentro do bloco "cliente" preservando a formatação do resto do arquivo
// (reescrever o JSON inteiro mudaria o estilo de todo o arquivo e poluiria o diff).
export function atualizarCliente(texto, valores) {
  const inicio = texto.search(/"cliente"\s*:\s*\{/);
  if (inicio < 0) throw new Error('bloco "cliente" não encontrado');
  const abre = texto.indexOf("{", inicio);
  const fecha = texto.indexOf("}", abre);
  let bloco = texto.slice(abre, fecha);
  for (const [campo, valor] of Object.entries(valores)) {
    const re = new RegExp(`("${campo}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`);
    if (!re.test(bloco)) throw new Error(`campo "${campo}" não existe no bloco "cliente"`);
    bloco = bloco.replace(re, (_, chave) => chave + JSON.stringify(String(valor)));
  }
  const novo = texto.slice(0, abre) + bloco + texto.slice(fecha);
  JSON.parse(novo); // garante que o arquivo continua válido
  return novo;
}

// ---------------------------------------------------------------- padrao-desenvolvimento.md
// Placeholders do documento mestre que vêm dos parâmetros do cliente.
export const PLACEHOLDERS_PADRAO = {
  "<VARIANTE_ATC>": "varianteATC",
  "<PROJETO_CTS>": "projetoCTS",
  "<ID_PROJETO_CTS>": "idProjetoCTS",
  "<DESCRICAO_PROJETO_CTS>": "descricaoProjetoCTS",
  "[EMPRESA]": "empresa",
};
export const placeholdersPadrao = (texto) => Object.keys(PLACEHOLDERS_PADRAO).filter((p) => texto.includes(p));
// Numa caixa de comentário ABAP ("***   © [EMPRESA]      ***"), compensa a diferença de tamanho
// nos espaços antes do "***" final, para a caixa não desalinhar.
export function preencherPadrao(texto, valores) {
  let out = texto;
  for (const [marca, campo] of Object.entries(PLACEHOLDERS_PADRAO)) {
    const valor = valores[campo];
    if (!valor || ehPlaceholder(valor)) continue;
    const delta = valor.length - marca.length;
    out = out.split("\n").map((l) => {
      const caixa = l.match(/^(.*?)(\s+)(\*+\r?)$/);
      if (caixa && caixa[1].includes(marca) && caixa[1].split(marca).length === 2) {
        const espacos = Math.max(1, caixa[2].length - delta);
        return caixa[1].replace(marca, valor) + " ".repeat(espacos) + caixa[3];
      }
      return l.split(marca).join(valor);
    }).join("\n");
  }
  return out;
}

// ---------------------------------------------------------------- saída do --diagnostico
// O launcher escreve em stderr linhas "mcp-launch: ..." e, com sucesso, um JSON no fim.
export function lerDiagnostico(stderr) {
  const linhas = stderr.split(/\r?\n/);
  const i = linhas.findIndex((l) => l === "{");
  let estado = null;
  if (i >= 0) {
    try {
      estado = JSON.parse(linhas.slice(i).join("\n"));
    } catch { /* saída truncada: fica sem estado */ }
  }
  const mensagens = linhas.slice(0, i >= 0 ? i : undefined).filter((l) => l.startsWith("mcp-launch: ")).map((l) => l.slice(12));
  return {
    estado,
    avisos: mensagens.filter((m) => m.startsWith("aviso: ")).map((m) => m.slice(7)),
    erro: estado ? null : mensagens.filter((m) => !m.startsWith("aviso: ")).at(-1) ?? null,
  };
}

// O vsp recusa um sistema 2025+ sem fallback ligado: é o esperado (o servidor dele é o abap-adt).
export const recusaEsperada2025 = (erro) => typeof erro === "string" && /é servido pelo abap-adt/.test(erro);
