import { setSubsystem } from './subsystems.js';
import { tocarSom } from './sound.js';
import { notify } from './notifications.js';

export function addEvent(categoria, texto) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.debug(`[evento:${categoria}] ${texto} — ${time}`);
}

let totalTools = 0;

export function addToolExec({ name, status = 'running', result = '', time }) {
  const toolsList = document.getElementById('toolsList');
  const toolsCount = document.getElementById('toolsCount');
  const empty = toolsList.querySelector('.feed-empty');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = `feed-item tool status-${status}`;
  const hora = time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const statusLabel = status === 'running' ? 'EM CURSO' : (status === 'success' ? 'OK' : 'ERRO');
  div.innerHTML = `<div class="fi-top"><span class="fi-label">${name}</span><span class="fi-status">${statusLabel}</span></div>${result ? `<div class="fi-result">${result}</div>` : ''}<div class="fi-time">${hora}</div>`;
  toolsList.prepend(div);
  while (toolsList.children.length > 30) toolsList.removeChild(toolsList.lastChild);
  totalTools++;
  toolsCount.textContent = totalTools;
  setSubsystem('ferramentas', true, true);
  if (status === 'error') { tocarSom('alert'); notify(`Falha na ferramenta "${name}"`, 'warning'); }
}
