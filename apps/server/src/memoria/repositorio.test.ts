import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { criarPool, migrar } from "../db.js";
import { RepositorioMemoria } from "./repositorio.js";

// Roda só com um banco descartável: TEST_DATABASE_URL=postgres://… npm test
const url = process.env.TEST_DATABASE_URL;
const pool = url ? criarPool(url) : undefined;
const repo = pool ? new RepositorioMemoria(pool) : undefined;
const opcoes = { skip: !url && "sem TEST_DATABASE_URL" };

const vetor = (i: number): number[] => Array.from({ length: 1536 }, (_, k) => (k === i ? 1 : 0));

before(async () => {
  if (!pool) return;
  await migrar(pool);
  await pool.query("TRUNCATE perfil, mensagens, episodios");
});
after(async () => {
  await pool?.end();
});

test("perfil: adicionar, corrigir, aplicar mudanças e apagar", opcoes, async () => {
  assert.ok(repo);
  await repo.adicionarDeclarado("estilo", "Prefere respostas curtas");
  const [item] = await repo.listarPerfil();
  assert.ok(item);
  assert.equal(item.origem, "declarado");

  await repo.corrigirItem(item.id, "Prefere respostas curtas, sem emoji");
  await repo.aplicar([
    { tipo: "inserir", categoria: "rotina", conteudo: "Treina de manhã", confianca: 0.5, origem: "inferido" },
    { tipo: "atualizar", id: item.id, confianca: 1, origem: "corrigido", ativo: true, somarEvidencia: true },
  ]);
  const itens = await repo.listarPerfil();
  assert.equal(itens.length, 2);
  assert.deepEqual(itens[0], { ...item, conteudo: "Prefere respostas curtas, sem emoji", origem: "corrigido", evidencias: 2 });

  await repo.apagarItem(item.id);
  assert.equal((await repo.listarPerfil()).length, 1);
});

test("mensagens pendentes e marcação de refletidas", opcoes, async () => {
  assert.ok(repo);
  await repo.registrarMensagem("user", "oi");
  await repo.registrarMensagem("jarvis", "olá");
  const pendentes = await repo.mensagensPendentes();
  assert.deepEqual(pendentes.map((m) => m.papel), ["user", "jarvis"]);
  await repo.marcarRefletidas(pendentes.at(-1)?.id ?? 0);
  assert.equal((await repo.mensagensPendentes()).length, 0);
});

test("lembranças: só volta o que é parecido", opcoes, async () => {
  assert.ok(repo);
  await repo.salvarEpisodio("Combinou de revisar o currículo", vetor(0));
  await repo.salvarEpisodio("Falou da viagem a Floripa", vetor(1));
  const achadas = await repo.buscarLembrancas(vetor(0));
  assert.deepEqual(achadas.map((l) => l.resumo), ["Combinou de revisar o currículo"]);
});
