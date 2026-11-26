import { z } from "zod";

/** Perfil: o que o JARVIS sabe sobre a pessoa. */
export const CATEGORIAS = ["estilo", "traco", "preferencia", "rotina", "objetivo", "fato", "evitar"] as const;
export const categoria = z.enum(CATEGORIAS);
export type Categoria = z.infer<typeof categoria>;
export type Origem = "inferido" | "declarado" | "corrigido";

export interface ItemPerfil {
  id: string;
  categoria: Categoria;
  conteudo: string;
  /** 0 a 1. */
  confianca: number;
  origem: Origem;
  evidencias: number;
}

export const mensagemDePerfil = z.discriminatedUnion("type", [
  z.object({ type: z.literal("perfil_listar") }),
  z.object({ type: z.literal("perfil_apagar"), id: z.uuid() }),
  z.object({ type: z.literal("perfil_corrigir"), id: z.uuid(), conteudo: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal("perfil_adicionar"), categoria, conteudo: z.string().trim().min(1).max(500) }),
]);
export type MensagemDePerfil = z.infer<typeof mensagemDePerfil>;


/** Mensagens que o app (HUD) manda ao servidor pelo WebSocket. */
export const mensagemDoCliente = z.discriminatedUnion("type", [
  ...mensagemDePerfil.options,
  z.object({ type: z.literal("auth"), token: z.string().min(1).max(512) }),
  z.object({ type: z.literal("command"), text: z.string().trim().min(1).max(8000) }),
  z.object({ type: z.literal("mic_toggle"), ativo: z.boolean() }),
  z.object({
    type: z.literal("tool_call"),
    name: z.string().min(1).max(100),
    args: z.record(z.string(), z.unknown()).default({}),
  }),
]);
export type MensagemDoCliente = z.infer<typeof mensagemDoCliente>;

export type Estado = "idle" | "thinking" | "speaking" | "listening";
export type Papel = "user" | "jarvis" | "system";
export type Nivel = "info" | "success" | "warning" | "error";

/** Eventos que o servidor manda ao HUD. O HUD já sabe tratar outros (mapa, clima…), que voltam aos poucos. */
export type EventoDoServidor =
  | { type: "auth_ok" }
  | { type: "status"; state: Estado }
  | { type: "log"; role: Papel; text: string }
  | { type: "event"; level: Nivel; text: string }
  | { type: "notification"; level: Nivel; text: string }
  | { type: "subsystem"; name: string; active: boolean; persist?: boolean }
  | { type: "perfil"; itens: ItemPerfil[] };
