import type { Categoria, ItemPerfil, Origem } from "@jarvis/protocol";

/** Quanto cada sinal mexe na confiança de um item do perfil. */
export const CONFIANCA = {
  inicialInferido: 0.5,
  declarado: 1,
  reforco: 0.15,
  tetoInferido: 0.95,
  enfraquecimento: 0.25,
  minimaParaFicarAtivo: 0.2,
} as const;

export type Acao = "adicionar" | "reforcar" | "enfraquecer" | "remover";

export interface Operacao {
  acao: Acao;
  id: string | null;
  categoria: Categoria | null;
  conteudo: string | null;
  /** A própria pessoa disse isso explicitamente. */
  declarado: boolean;
}

export type Mudanca =
  | { tipo: "inserir"; categoria: Categoria; conteudo: string; confianca: number; origem: Origem }
  | { tipo: "atualizar"; id: string; confianca: number; origem: Origem; ativo: boolean; somarEvidencia: boolean };

const arred = (n: number): number => Math.round(n * 100) / 100;

/**
 * Converte as operações sugeridas pela reflexão em mudanças concretas.
 * O que a pessoa declarou ou corrigiu só muda com outra declaração dela; ids desconhecidos são ignorados.
 */
export function planejarMudancas(itens: readonly ItemPerfil[], operacoes: readonly Operacao[]): Mudanca[] {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const mudancas: Mudanca[] = [];
  const jaTocados = new Set<string>();

  for (const op of operacoes) {
    if (op.acao === "adicionar") {
      const conteudo = op.conteudo?.trim();
      if (!op.categoria || !conteudo) continue;
      const repetido = itens.some((i) => i.conteudo.toLowerCase() === conteudo.toLowerCase());
      if (repetido) continue;
      mudancas.push({
        tipo: "inserir",
        categoria: op.categoria,
        conteudo: conteudo.slice(0, 500),
        confianca: op.declarado ? CONFIANCA.declarado : CONFIANCA.inicialInferido,
        origem: op.declarado ? "declarado" : "inferido",
      });
      continue;
    }

    const item = op.id ? porId.get(op.id) : undefined;
    if (!item || jaTocados.has(item.id)) continue;
    const protegido = item.origem !== "inferido";
    if (protegido && !op.declarado && op.acao !== "reforcar") continue;
    jaTocados.add(item.id);

    if (op.acao === "reforcar") {
      if (op.declarado && item.origem === "inferido") {
        mudancas.push({ tipo: "atualizar", id: item.id, confianca: CONFIANCA.declarado, origem: "declarado", ativo: true, somarEvidencia: true });
      } else {
        const confianca = protegido ? item.confianca : Math.min(CONFIANCA.tetoInferido, arred(item.confianca + CONFIANCA.reforco));
        mudancas.push({ tipo: "atualizar", id: item.id, confianca, origem: item.origem, ativo: true, somarEvidencia: true });
      }
    } else if (op.acao === "enfraquecer" && !op.declarado) {
      const confianca = Math.max(0, arred(item.confianca - CONFIANCA.enfraquecimento));
      mudancas.push({ tipo: "atualizar", id: item.id, confianca, origem: item.origem, ativo: confianca >= CONFIANCA.minimaParaFicarAtivo, somarEvidencia: false });
    } else {
      // remover, ou a pessoa contradisse explicitamente: sai do perfil ativo.
      mudancas.push({ tipo: "atualizar", id: item.id, confianca: item.confianca, origem: item.origem, ativo: false, somarEvidencia: false });
    }
  }
  return mudancas;
}

const TITULOS: Record<Categoria, string> = {
  estilo: "Como falar com a pessoa",
  traco: "Personalidade",
  preferencia: "Preferências",
  rotina: "Rotina",
  objetivo: "Objetivos",
  fato: "Fatos",
  evitar: "Evitar",
};

export interface Lembranca {
  resumo: string;
  criadoEm: Date;
}

const BASE = `Você é o JARVIS, assistente pessoal de uma única pessoa. Responda em português do Brasil.
Seu diferencial é se adaptar a ela: siga "Como falar com a pessoa" e "Evitar" à risca, use o resto para
personalizar sem recitar o que sabe. Itens marcados (incerto) são palpites: não os trate como certeza; se
for relevante, confirme de forma natural. Se a pessoa corrigir algo sobre ela, aceite sem discutir.`;

/** Monta as instruções do modelo com o perfil e as lembranças relevantes. */
export function montarInstrucoes(itens: readonly ItemPerfil[], lembrancas: readonly Lembranca[], agora: Date, fuso: string): string {
  const partes = [BASE];
  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: fuso }).format(agora);
  partes.push(`Agora: ${quando}.`);

  if (itens.length) {
    const secoes: string[] = [];
    for (const cat of Object.keys(TITULOS) as Categoria[]) {
      const daCategoria = itens.filter((i) => i.categoria === cat);
      if (!daCategoria.length) continue;
      const linhas = daCategoria.map((i) => `- ${i.conteudo}${i.confianca < 0.5 ? " (incerto)" : ""}`);
      secoes.push(`### ${TITULOS[cat]}\n${linhas.join("\n")}`);
    }
    partes.push(`## O que você sabe sobre a pessoa\n${secoes.join("\n\n")}`);
  } else {
    partes.push("Você ainda não sabe nada sobre a pessoa: vá conhecendo-a com naturalidade, sem interrogatório.");
  }

  if (lembrancas.length) {
    const dia = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: fuso });
    const linhas = lembrancas.map((l) => `- (${dia.format(l.criadoEm)}) ${l.resumo}`);
    partes.push(`## Lembranças que podem ser relevantes\n${linhas.join("\n")}`);
  }
  return partes.join("\n\n");
}
