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

/** VITE_SERVER_URL (ex.: https://jarvis.exemplo.app) no build do app; no dev, o próprio host (o Vite faz proxy). */
export function urlDoServidor() {
  const base = import.meta.env.VITE_SERVER_URL;
  if (base) return base.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
  const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocolo}://${location.host}/ws`;
}
