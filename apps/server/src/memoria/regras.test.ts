import { test } from "node:test";
import assert from "node:assert/strict";
import type { ItemPerfil } from "@jarvis/protocol";
import { CONFIANCA, montarInstrucoes, planejarMudancas, type Operacao } from "./regras.js";

const item = (p: Partial<ItemPerfil> & { id: string }): ItemPerfil => ({
  categoria: "estilo", conteudo: "Prefere respostas curtas", confianca: 0.5, origem: "inferido", evidencias: 1, ...p,
});
const op = (p: Partial<Operacao> & Pick<Operacao, "acao">): Operacao => ({
  id: null, categoria: null, conteudo: null, declarado: false, ...p,
});

test("adicionar inferido entra com confiança inicial; declarado entra com 1", () => {
  const m = planejarMudancas([], [
    op({ acao: "adicionar", categoria: "rotina", conteudo: "Treina de manhã" }),
    op({ acao: "adicionar", categoria: "evitar", conteudo: "Não gosta de emoji", declarado: true }),
  ]);
  assert.deepEqual(m, [
    { tipo: "inserir", categoria: "rotina", conteudo: "Treina de manhã", confianca: CONFIANCA.inicialInferido, origem: "inferido" },
    { tipo: "inserir", categoria: "evitar", conteudo: "Não gosta de emoji", confianca: 1, origem: "declarado" },
  ]);
});

test("não duplica item com o mesmo texto", () => {
  const m = planejarMudancas([item({ id: "a" })], [op({ acao: "adicionar", categoria: "estilo", conteudo: "prefere respostas CURTAS" })]);
  assert.deepEqual(m, []);
});

test("reforçar soma confiança até o teto", () => {
  const [m] = planejarMudancas([item({ id: "a", confianca: 0.9 })], [op({ acao: "reforcar", id: "a" })]);
  assert.deepEqual(m, { tipo: "atualizar", id: "a", confianca: CONFIANCA.tetoInferido, origem: "inferido", ativo: true, somarEvidencia: true });
});

test("enfraquecer abaixo do mínimo desativa", () => {
  const [m] = planejarMudancas([item({ id: "a", confianca: 0.4 })], [op({ acao: "enfraquecer", id: "a" })]);
  assert.equal(m?.tipo === "atualizar" && m.ativo, false);
});

test("inferência não mexe no que a pessoa declarou ou corrigiu", () => {
  const itens = [item({ id: "a", origem: "declarado", confianca: 1 }), item({ id: "b", origem: "corrigido", confianca: 1, conteudo: "x" })];
  const m = planejarMudancas(itens, [op({ acao: "enfraquecer", id: "a" }), op({ acao: "remover", id: "b" })]);
  assert.deepEqual(m, []);
});

test("contradição declarada tira do perfil até item declarado", () => {
  const [m] = planejarMudancas([item({ id: "a", origem: "declarado", confianca: 1 })], [op({ acao: "enfraquecer", id: "a", declarado: true })]);
  assert.equal(m?.tipo === "atualizar" && m.ativo, false);
});

test("id desconhecido é ignorado e o mesmo item só muda uma vez", () => {
  const m = planejarMudancas([item({ id: "a" })], [op({ acao: "reforcar", id: "zzz" }), op({ acao: "reforcar", id: "a" }), op({ acao: "remover", id: "a" })]);
  assert.equal(m.length, 1);
});

test("instruções agrupam por categoria e marcam o incerto", () => {
  const texto = montarInstrucoes(
    [item({ id: "a", confianca: 0.9 }), item({ id: "b", categoria: "objetivo", conteudo: "Quer correr 10 km", confianca: 0.3 })],
    [{ resumo: "Combinou de revisar o currículo", criadoEm: new Date("2026-11-20T12:00:00Z") }],
    new Date("2026-11-26T12:00:00Z"),
    "America/Sao_Paulo",
  );
  assert.match(texto, /### Como falar com a pessoa\n- Prefere respostas curtas\n/);
  assert.match(texto, /- Quer correr 10 km \(incerto\)/);
  assert.match(texto, /20\/11\/2026\) Combinou de revisar o currículo/);
});

test("instruções de voz pedem fala curta e sem markdown", () => {
  const texto = montarInstrucoes([], [], new Date("2026-11-26T12:00:00Z"), "America/Sao_Paulo", "voz");
  assert.match(texto, /conversa é por voz/);
  assert.doesNotMatch(montarInstrucoes([], [], new Date(), "America/Sao_Paulo"), /conversa é por voz/);
});
