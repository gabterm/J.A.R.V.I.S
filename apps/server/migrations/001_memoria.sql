-- Memória do assistente: perfil adaptativo, mensagens a refletir e lembranças (episódios).
-- Reverter: DROP TABLE episodios, mensagens, perfil;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE perfil (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria     text NOT NULL CHECK (categoria IN ('estilo', 'traco', 'preferencia', 'rotina', 'objetivo', 'fato', 'evitar')),
  conteudo      text NOT NULL CHECK (length(conteudo) BETWEEN 1 AND 500),
  confianca     real NOT NULL CHECK (confianca BETWEEN 0 AND 1),
  origem        text NOT NULL CHECK (origem IN ('inferido', 'declarado', 'corrigido')),
  evidencias    integer NOT NULL DEFAULT 1 CHECK (evidencias >= 0),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX perfil_ativo_confianca ON perfil (confianca DESC) WHERE ativo;

-- Conversa crua: só até ser refletida; depois é apagada pela retenção.
CREATE TABLE mensagens (
  id        bigserial PRIMARY KEY,
  papel     text NOT NULL CHECK (papel IN ('user', 'jarvis')),
  texto     text NOT NULL,
  refletida boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mensagens_pendentes ON mensagens (id) WHERE NOT refletida;
CREATE INDEX mensagens_criado_em ON mensagens (criado_em);

CREATE TABLE episodios (
  id        bigserial PRIMARY KEY,
  resumo    text NOT NULL CHECK (length(resumo) BETWEEN 1 AND 2000),
  embedding vector(1536) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX episodios_embedding ON episodios USING hnsw (embedding vector_cosine_ops);
