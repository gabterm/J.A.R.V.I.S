import type OpenAI from "openai";
import type { Memoria } from "./memoria/memoria.js";

/** Uma conversa: a OpenAI guarda o fio pelo id da última resposta; a memória entra nas instruções a cada vez. */
export class Conversa {
  private ultimaResposta: string | undefined;

  constructor(
    private readonly cliente: OpenAI,
    private readonly modelo: string,
    private readonly memoria: Memoria,
  ) {}

  async responder(texto: string): Promise<string> {
    const instrucoes = await this.memoria.instrucoesPara(texto);
    const resposta = await this.cliente.responses.create({
      model: this.modelo,
      instructions: instrucoes,
      input: texto,
      previous_response_id: this.ultimaResposta,
    });
    this.ultimaResposta = resposta.id;
    const saida = resposta.output_text;
    await this.memoria.registrarTroca(texto, saida);
    return saida;
  }
}
