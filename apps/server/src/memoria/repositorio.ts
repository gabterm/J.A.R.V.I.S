import type pg from "pg";
import { z } from "zod";
import { categoria, type Categoria, type ItemPerfil } from "@jarvis/protocol";
import type { Lembranca, Mudanca } from "./regras.js";

const linhaPerfil = z.object({
  id: z.string(),
  categoria,
  conteudo: z.string(),
  confianca: z.number(),
  origem: z.enum(["inferido", "declarado", "corrigido"]),
  evidencias: z.number(),
});
const linhaMensagem = z.object({ id: z.coerce.number(), papel: z.enum(["user", "jarvis"]), texto: z.string() });
const linhaLembranca = z.object({ resumo: z.string(), criado_em: z.date() });

export type Mensagem = z.infer<typeof linhaMensagem>;

const vetor = (v: readonly number[]): string => `[${v.join(",")}]`;

/** Acesso ao Postgres da memória. */
export class RepositorioMemoria {
  constructor(private readonly pool: pg.Pool) {}

  async listarPerfil(limite = 60): Promise<ItemPerfil[]> {
    const { rows } = await this.pool.query(
      `SELECT id, categoria, conteudo, confianca, origem, evidencias
         FROM perfil WHERE ativo ORDER BY confianca DESC, atualizado_em DESC LIMIT $1`,
      [limite],
    );
    return z.array(linhaPerfil).parse(rows);
  }

  async aplicar(mudancas: readonly Mudanca[]): Promise<void> {
    if (!mudancas.length) return;
    const cliente = await this.pool.connect();
    try {
      await cliente.query("BEGIN");
      for (const m of mudancas) {
        if (m.tipo === "inserir") {
          await cliente.query(
            "INSERT INTO perfil (categoria, conteudo, confianca, origem) VALUES ($1, $2, $3, $4)",
            [m.categoria, m.conteudo, m.confianca, m.origem],
          );
        } else {
          await cliente.query(
            `UPDATE perfil SET confianca = $2, origem = $3, ativo = $4,
                    evidencias = evidencias + $5, atualizado_em = now() WHERE id = $1`,
            [m.id, m.confianca, m.origem, m.ativo, m.somarEvidencia ? 1 : 0],
          );
        }
      }
      await cliente.query("COMMIT");
    } catch (erro) {
      await cliente.query("ROLLBACK");
      throw erro;
    } finally {
      cliente.release();
    }
  }

  /** A pessoa pediu para esquecer: apaga de vez. */
  async apagarItem(id: string): Promise<void> {
    await this.pool.query("DELETE FROM perfil WHERE id = $1", [id]);
  }

  async corrigirItem(id: string, conteudo: string): Promise<void> {
    await this.pool.query(
      `UPDATE perfil SET conteudo = $2, origem = 'corrigido', confianca = 1, ativo = true,
              atualizado_em = now() WHERE id = $1`,
      [id, conteudo],
    );
  }

  async adicionarDeclarado(cat: Categoria, conteudo: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO perfil (categoria, conteudo, confianca, origem) VALUES ($1, $2, 1, 'declarado')",
      [cat, conteudo],
    );
  }

  async registrarMensagem(papel: "user" | "jarvis", texto: string): Promise<void> {
    await this.pool.query("INSERT INTO mensagens (papel, texto) VALUES ($1, $2)", [papel, texto]);
  }

  async mensagensPendentes(limite = 80): Promise<Mensagem[]> {
    const { rows } = await this.pool.query(
      "SELECT id, papel, texto FROM mensagens WHERE NOT refletida ORDER BY id LIMIT $1",
      [limite],
    );
    return z.array(linhaMensagem).parse(rows);
  }

  async marcarRefletidas(ateId: number): Promise<void> {
    await this.pool.query("UPDATE mensagens SET refletida = true WHERE NOT refletida AND id <= $1", [ateId]);
  }

  /** Conversa crua só fica 30 dias depois de refletida; o que importa já virou perfil ou lembrança. */
  async apagarMensagensAntigas(dias = 30): Promise<void> {
    await this.pool.query(
      "DELETE FROM mensagens WHERE refletida AND criado_em < now() - make_interval(days => $1)",
      [dias],
    );
  }

  async salvarEpisodio(resumo: string, embedding: readonly number[]): Promise<void> {
    await this.pool.query("INSERT INTO episodios (resumo, embedding) VALUES ($1, $2)", [resumo, vetor(embedding)]);
  }

  async lembrancasRecentes(limite = 3): Promise<Lembranca[]> {
    const { rows } = await this.pool.query("SELECT resumo, criado_em FROM episodios ORDER BY id DESC LIMIT $1", [limite]);
    return z.array(linhaLembranca).parse(rows).map((r) => ({ resumo: r.resumo, criadoEm: r.criado_em }));
  }

  async buscarLembrancas(embedding: readonly number[], limite = 3, distanciaMaxima = 0.6): Promise<Lembranca[]> {
    const { rows } = await this.pool.query(
      `SELECT resumo, criado_em FROM (
         SELECT resumo, criado_em, embedding <=> $1 AS distancia FROM episodios ORDER BY embedding <=> $1 LIMIT $2
       ) e WHERE distancia <= $3`,
      [vetor(embedding), limite, distanciaMaxima],
    );
    return z.array(linhaLembranca).parse(rows).map((r) => ({ resumo: r.resumo, criadoEm: r.criado_em }));
  }
}
