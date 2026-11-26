import type OpenAI from "openai";
import type { FastifyBaseLogger } from "fastify";
import type { Categoria, ItemPerfil } from "@jarvis/protocol";
import { RepositorioMemoria } from "./repositorio.js";
import { montarInstrucoes, planejarMudancas } from "./regras.js";
import { refletir } from "./reflexao.js";

export interface OpcoesMemoria {
  modelo: string;
  modeloEmbedding: string;
  fuso: string;
  /** Reflete depois desse tempo sem mensagens novas. */
  ociosoMs?: number;
  /** Ou assim que juntar essa quantidade de mensagens. */
  lote?: number;
}

/** Junta perfil, lembranças e reflexão. Uma instância por servidor (uso pessoal, um processo). */
export class Memoria {
  private timer: NodeJS.Timeout | undefined;
  private refletindo = false;
  private readonly ociosoMs: number;
  private readonly lote: number;

  constructor(
    private readonly repo: RepositorioMemoria,
    private readonly openai: OpenAI,
    private readonly opcoes: OpcoesMemoria,
    private readonly log: FastifyBaseLogger,
  ) {
    this.ociosoMs = opcoes.ociosoMs ?? 120_000;
    this.lote = opcoes.lote ?? 20;
  }

  private async embedding(texto: string): Promise<number[]> {
    const r = await this.openai.embeddings.create({ model: this.opcoes.modeloEmbedding, input: texto.slice(0, 8000) });
    const vetor = r.data[0]?.embedding;
    if (!vetor) throw new Error("embedding vazio");
    return vetor;
  }

  async instrucoesPara(texto: string): Promise<string> {
    // Sem lembranças a resposta sai pior, mas sai: falha aqui só vai para o log.
    const [itens, lembrancas] = await Promise.all([
      this.repo.listarPerfil(),
      this.embedding(texto)
        .then((v) => this.repo.buscarLembrancas(v))
        .catch((erro: unknown) => {
          this.log.warn({ tipo: nomeDoErro(erro) }, "sem lembranças nesta resposta");
          return [];
        }),
    ]);
    return montarInstrucoes(itens, lembrancas, new Date(), this.opcoes.fuso);
  }

  /** Guarda a troca para a reflexão. Não derruba a resposta já dada: falha só vai para o log. */
  /** Para a voz não há a mensagem antes da sessão: vão o perfil e as lembranças mais recentes. */
  async instrucoesParaVoz(): Promise<string> {
    const [itens, lembrancas] = await Promise.all([this.repo.listarPerfil(), this.repo.lembrancasRecentes(3)]);
    return montarInstrucoes(itens, lembrancas, new Date(), this.opcoes.fuso, "voz");
  }

  /** Uma fala da conversa por voz (transcrita no app). */
  async registrarFala(papel: "user" | "jarvis", texto: string): Promise<void> {
    await this.repo.registrarMensagem(papel, texto);
    this.agendarReflexao();
  }

  async registrarTroca(pergunta: string, resposta: string): Promise<void> {
    try {
      await this.repo.registrarMensagem("user", pergunta);
      await this.repo.registrarMensagem("jarvis", resposta);
      this.agendarReflexao();
    } catch (erro) {
      this.log.error({ tipo: nomeDoErro(erro) }, "falha ao guardar a conversa");
    }
  }

  perfil(): Promise<ItemPerfil[]> {
    return this.repo.listarPerfil(200);
  }
  apagar(id: string): Promise<void> {
    return this.repo.apagarItem(id);
  }
  corrigir(id: string, conteudo: string): Promise<void> {
    return this.repo.corrigirItem(id, conteudo);
  }
  adicionar(cat: Categoria, conteudo: string): Promise<void> {
    return this.repo.adicionarDeclarado(cat, conteudo);
  }

  agendarReflexao(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refletirPendentes(), this.ociosoMs);
    this.repo
      .mensagensPendentes(this.lote)
      .then((p) => {
        if (p.length >= this.lote) this.refletirPendentes();
      })
      .catch((erro: unknown) => this.log.error({ tipo: nomeDoErro(erro) }, "falha ao contar pendentes"));
  }

  /** Dispara a reflexão sem bloquear quem chamou; erros só vão para o log. */
  refletirPendentes(): void {
    this.refletirAgora().catch((erro: unknown) => this.log.error({ tipo: nomeDoErro(erro) }, "falha na reflexão"));
  }

  async refletirAgora(): Promise<void> {
    if (this.refletindo) return;
    this.refletindo = true;
    clearTimeout(this.timer);
    try {
      const mensagens = await this.repo.mensagensPendentes(80);
      const ultima = mensagens.at(-1);
      if (!ultima) return;
      const itens = await this.repo.listarPerfil(200);
      const { operacoes, episodio } = await refletir(this.openai, this.opcoes.modelo, itens, mensagens);
      const mudancas = planejarMudancas(itens, operacoes);
      await this.repo.aplicar(mudancas);
      if (episodio?.trim()) await this.repo.salvarEpisodio(episodio.trim(), await this.embedding(episodio));
      await this.repo.marcarRefletidas(ultima.id);
      await this.repo.apagarMensagensAntigas();
      this.log.info({ mensagens: mensagens.length, mudancas: mudancas.length, episodio: Boolean(episodio) }, "reflexão feita");
    } finally {
      this.refletindo = false;
    }
  }
}

export function nomeDoErro(erro: unknown): string {
  if (erro && typeof erro === "object" && "status" in erro) return `api ${String(erro.status)}`;
  return erro instanceof Error ? erro.name : typeof erro;
}
