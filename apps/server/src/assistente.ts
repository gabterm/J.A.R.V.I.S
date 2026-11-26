import OpenAI from "openai";

const INSTRUCOES = `Você é o JARVIS, assistente pessoal de uma única pessoa.
Responda em português do Brasil, de forma direta e natural, sem floreio.
Ainda não há memória de longo prazo: se precisar de algo que não sabe sobre a pessoa, pergunte.`;

/** Uma conversa: guarda o id da última resposta para a OpenAI manter o contexto. */
export class Conversa {
  private ultimaResposta: string | undefined;

  constructor(
    private readonly cliente: OpenAI,
    private readonly modelo: string,
  ) {}

  async responder(texto: string): Promise<string> {
    const resposta = await this.cliente.responses.create({
      model: this.modelo,
      instructions: INSTRUCOES,
      input: texto,
      previous_response_id: this.ultimaResposta,
    });
    this.ultimaResposta = resposta.id;
    return resposta.output_text;
  }
}
