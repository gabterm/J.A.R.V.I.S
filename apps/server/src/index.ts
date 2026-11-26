import Fastify from "fastify";
import websocket from "@fastify/websocket";
import OpenAI from "openai";
import type { WebSocket } from "ws";
import { mensagemDoCliente, type EventoDoServidor } from "@jarvis/protocol";
import { lerConfig } from "./config.js";
import { tokenValido } from "./auth.js";
import { Conversa } from "./assistente.js";

const PRAZO_AUTH_MS = 5_000;

const config = lerConfig();
const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
const app = Fastify({ logger: { level: "info" } });

await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

app.get("/health", async () => ({ ok: true }));

function enviar(socket: WebSocket, evento: EventoDoServidor): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(evento));
}

app.get("/ws", { websocket: true }, (socket, req) => {
  let autenticado = false;
  let ocupado = false;
  const conversa = new Conversa(openai, config.OPENAI_MODEL);

  const prazo = setTimeout(() => {
    if (!autenticado) socket.close(4401, "não autenticado");
  }, PRAZO_AUTH_MS);
  socket.on("close", () => clearTimeout(prazo));

  socket.on("message", (bruto) => {
    let json: unknown;
    try {
      json = JSON.parse(bruto.toString());
    } catch {
      req.log.warn("mensagem que não é JSON");
      return;
    }
    const lido = mensagemDoCliente.safeParse(json);
    if (!lido.success) {
      req.log.warn({ problemas: lido.error.issues.length }, "mensagem fora do protocolo");
      return;
    }
    const msg = lido.data;

    if (!autenticado) {
      if (msg.type === "auth" && tokenValido(msg.token, config.JARVIS_TOKEN)) {
        autenticado = true;
        clearTimeout(prazo);
        enviar(socket, { type: "auth_ok" });
        enviar(socket, { type: "status", state: "idle" });
      } else {
        socket.close(4401, "não autenticado");
      }
      return;
    }

    switch (msg.type) {
      case "command": {
        if (ocupado) {
          enviar(socket, { type: "notification", level: "warning", text: "Ainda estou respondendo a anterior." });
          return;
        }
        ocupado = true;
        enviar(socket, { type: "status", state: "thinking" });
        conversa
          .responder(msg.text)
          .then((texto) => enviar(socket, { type: "log", role: "jarvis", text: texto }))
          .catch((erro: unknown) => {
            // Só status e código: a mensagem da OpenAI pode ecoar parte da chave.
            const detalhe = erro instanceof OpenAI.APIError ? { status: erro.status, codigo: erro.code } : { tipo: erro instanceof Error ? erro.name : typeof erro };
            req.log.error(detalhe, "falha ao responder");
            enviar(socket, { type: "notification", level: "error", text: "Não consegui responder agora." });
          })
          .finally(() => {
            ocupado = false;
            enviar(socket, { type: "status", state: "idle" });
          });
        return;
      }
      case "mic_toggle":
      case "tool_call":
        enviar(socket, { type: "event", level: "info", text: `"${msg.type}" ainda não existe na versão nova.` });
        return;
      case "auth":
        return;
    }
  });
});

await app.listen({ port: config.PORT, host: config.HOST });
