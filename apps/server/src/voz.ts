import type OpenAI from "openai";

export interface SessaoDeVoz {
  segredo: string;
  expiraEm: number;
  modelo: string;
}

/**
 * Cria uma chave temporária para o app falar direto com a OpenAI por WebRTC.
 * A chave vale 2 minutos para abrir a sessão; a configuração (voz, instruções, transcrição) fica presa nela.
 */
export async function criarSessaoDeVoz(
  cliente: OpenAI,
  opcoes: { modelo: string; voz: string; instrucoes: string },
): Promise<SessaoDeVoz> {
  const r = await cliente.realtime.clientSecrets.create({
    expires_after: { anchor: "created_at", seconds: 120 },
    session: {
      type: "realtime",
      model: opcoes.modelo,
      instructions: opcoes.instrucoes,
      output_modalities: ["audio"],
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe", language: "pt" },
          turn_detection: { type: "semantic_vad" },
          noise_reduction: { type: "near_field" },
        },
        output: { voice: opcoes.voz },
      },
    },
  });
  return { segredo: r.value, expiraEm: r.expires_at, modelo: opcoes.modelo };
}
