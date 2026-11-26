import { z } from "zod";

/** Mensagens que o app (HUD) manda ao servidor pelo WebSocket. */
export const mensagemDoCliente = z.discriminatedUnion("type", [
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
  | { type: "subsystem"; name: string; active: boolean; persist?: boolean };
