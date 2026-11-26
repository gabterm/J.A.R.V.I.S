import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const PASTA_MIGRACOES = fileURLToPath(new URL("../migrations/", import.meta.url));

export function criarPool(url: string): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 5 });
}

/** Aplica, em ordem, os arquivos de migrations/ que ainda não rodaram. */
export async function migrar(pool: pg.Pool): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS migracoes (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())`);
  const feitas = new Set((await pool.query<{ nome: string }>("SELECT nome FROM migracoes")).rows.map((r) => r.nome));
  const arquivos = (await readdir(PASTA_MIGRACOES)).filter((a) => a.endsWith(".sql")).sort();
  const aplicadas: string[] = [];
  for (const arquivo of arquivos) {
    if (feitas.has(arquivo)) continue;
    const sql = await readFile(PASTA_MIGRACOES + arquivo, "utf8");
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query(sql);
      await cliente.query("INSERT INTO migracoes (nome) VALUES ($1)", [arquivo]);
      await cliente.query("COMMIT");
      aplicadas.push(arquivo);
    } catch (erro) {
      await cliente.query("ROLLBACK");
      throw erro;
    } finally {
      cliente.release();
    }
  }
  return aplicadas;
}
