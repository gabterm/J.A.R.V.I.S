import { z } from "zod";

const esquema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY não configurada"),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL não configurada"),
  TZ_PESSOA: z.string().min(1).default("America/Sao_Paulo"),
  JARVIS_TOKEN: z.string().min(32, "JARVIS_TOKEN precisa de pelo menos 32 caracteres"),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
});

export type Config = z.infer<typeof esquema>;

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida:\n${problemas}`);
  }
  return resultado.data;
}
