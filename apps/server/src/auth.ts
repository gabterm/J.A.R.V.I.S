import { createHash, timingSafeEqual } from "node:crypto";

/** Compara o token recebido com o esperado em tempo constante. */
export function tokenValido(recebido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
