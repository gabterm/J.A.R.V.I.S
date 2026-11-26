import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { categoria, type ItemPerfil } from "@jarvis/protocol";
import type { Mensagem } from "./repositorio.js";
import type { Operacao } from "./regras.js";

const resultado = z.object({
  operacoes: z.array(
    z.object({
      acao: z.enum(["adicionar", "reforcar", "enfraquecer", "remover"]),
      id: z.string().nullable(),
      categoria: categoria.nullable(),
      conteudo: z.string().nullable(),
      declarado: z.boolean(),
    }),
  ),
  episodio: z.string().nullable(),
});

const INSTRUCOES = `Você analisa conversas entre uma pessoa e o assistente JARVIS para que ele se adapte a ela.
Recebe o perfil atual (cada item com id) e as mensagens novas. Devolva:

operacoes — mudanças no perfil:
- adicionar: algo novo e duradouro que ajuda o assistente a se adaptar. Frase curta, 3ª pessoa ("Prefere respostas curtas"). Informe a categoria:
  estilo (como quer que falem com ela: tom, tamanho, humor, formalidade), traco (personalidade), preferencia,
  rotina, objetivo, fato (estável sobre a vida dela), evitar (o que a incomoda).
- reforcar: a conversa confirma um item existente (informe o id).
- enfraquecer: a conversa põe em dúvida um item existente (informe o id).
- remover: o item está errado ou ela pediu para esquecer (informe o id).
- declarado = true só quando ela mesma disse explicitamente ("prefiro…", "lembra que…", "não gosto de…"); inferência sua = false.
Regras: não duplique (se já existe algo parecido, reforce); não registre o assunto do momento nem trivialidades;
não infira saúde, religião, política, sexualidade ou finanças (só registre se ela declarar). Reações dela às
respostas ("resume", "mais detalhes", irritação, elogio) são sinais fortes de estilo.

episodio — 1 a 3 frases do que vale lembrar no futuro (decisões, planos, acontecimentos, pendências), ou null se nada.
Se nada mudar, devolva operacoes vazia.`;

export interface ResultadoReflexao {
  operacoes: Operacao[];
  episodio: string | null;
}

export async function refletir(
  cliente: OpenAI,
  modelo: string,
  perfil: readonly ItemPerfil[],
  mensagens: readonly Mensagem[],
): Promise<ResultadoReflexao> {
  const perfilTexto = perfil.length
    ? perfil.map((i) => `[${i.id}] (${i.categoria}, ${i.origem}, confiança ${i.confianca}) ${i.conteudo}`).join("\n")
    : "(vazio)";
  const conversa = mensagens.map((m) => `${m.papel === "user" ? "PESSOA" : "JARVIS"}: ${m.texto}`).join("\n");

  const resposta = await cliente.responses.parse({
    model: modelo,
    instructions: INSTRUCOES,
    input: `## Perfil atual\n${perfilTexto}\n\n## Mensagens novas\n${conversa}`,
    text: { format: zodTextFormat(resultado, "reflexao") },
    store: false,
  });
  const lido = resposta.output_parsed;
  if (!lido) throw new Error("reflexão sem resultado estruturado");
  return lido;
}
