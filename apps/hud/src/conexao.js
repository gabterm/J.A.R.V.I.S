// Onde fica o servidor e como guardar o token do app.
export const CODIGO_NAO_AUTENTICADO = 4401;
const CHAVE_TOKEN = 'jarvis.token';

export function lerToken() {
  try { return localStorage.getItem(CHAVE_TOKEN) || ''; } catch { return ''; }
}
export function salvarToken(token) {
  try { localStorage.setItem(CHAVE_TOKEN, token); } catch (erro) { console.warn('Não deu para salvar o token', erro); }
}
export function apagarToken() {
  try { localStorage.removeItem(CHAVE_TOKEN); } catch (erro) { console.warn('Não deu para apagar o token', erro); }
}

const CHAVE_SERVIDOR = 'jarvis.servidor';

/** Endereço salvo na tela de login; senão o do build (VITE_SERVER_URL); senão vazio (o próprio host). */
export function lerServidor() {
  try { return localStorage.getItem(CHAVE_SERVIDOR) || import.meta.env.VITE_SERVER_URL || ''; } catch { return import.meta.env.VITE_SERVER_URL || ''; }
}
export function salvarServidor(url) {
  try {
    if (url) localStorage.setItem(CHAVE_SERVIDOR, url); else localStorage.removeItem(CHAVE_SERVIDOR);
  } catch (erro) { console.warn('Não deu para salvar o servidor', erro); }
}
export function servidorValido(url) {
  if (!url) return true;
  try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
}

/** URL do WebSocket. Sem servidor configurado, usa o próprio host (no dev, o Vite faz proxy). */
export function urlDoServidor() {
  const base = lerServidor();
  if (base) return base.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
  const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocolo}://${location.host}/ws`;
}
