import { tocarSom } from './sound.js';
import { addEvent } from './events-feed.js';
import { formatMessage, typewriter } from './utils.js';

export function addLogLine(role, text, confidence) {
  const log = document.getElementById('log');
  const empty = document.getElementById('logEmpty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  const cls = role === 'user' ? 'user' : (role === 'system' ? 'system' : 'jarvis');
  div.className = `log-line ${cls}`;
  const tag = role === 'user' ? 'Gabriel' : (role === 'system' ? 'SISTEMA' : 'JARVIS');
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const badge = (cls === 'jarvis' && confidence) ? `<span class="confidence-badge ${confidence}">${confidence}</span>` : '';

  if (cls === 'jarvis') {
    div.innerHTML = `
      <div class="tag-row">
        <span class="tag-left">
          <span class="tag">${tag}</span>
          ${badge}
        </span>
        <span class="time">${time}</span>
      </div>
      <span class="msg-text"></span>
    `;

    log.appendChild(div);
    const msgText = div.querySelector('.msg-text');

    if (text.includes('```')) {
      msgText.innerHTML = formatMessage(text);
    } else {
      typewriter(msgText, text);
    }
  } else {
    div.innerHTML = `<div class="tag-row"><span class="tag-left"><span class="tag">${tag}</span></span><span class="time">${time}</span></div>${text}`;
    log.appendChild(div);
  }

  log.scrollTop = log.scrollHeight;
  while (log.children.length > 40) log.removeChild(log.firstChild);

  // A voz agora é 100% responsabilidade do servidor (Fish Audio). O
  // navegador só exibe o texto — nada de speechSynthesis aqui, senão
  // as duas vozes ficam disputando ao mesmo tempo.
  if (role === 'user') {
    tocarSom('envio'); addEvent('comando', 'Comando recebido');
  } else if (role !== 'system') {
    tocarSom('recebido'); addEvent('resposta', 'Resposta gerada');
  }
}
