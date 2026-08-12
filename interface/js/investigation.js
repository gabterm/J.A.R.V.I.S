import { alertInvestigacao } from './tabs.js';
import { addEvent } from './events-feed.js';

function renderList(html) {
  if (Array.isArray(html)) return '<ul>' + html.map(i => `<li>${i}</li>`).join('') + '</ul>';
  return `<p style="margin:0">${html || '—'}</p>`;
}

export function abrirInvestigacao(dados) {
  document.getElementById('invEmpty').style.display = 'none';
  document.getElementById('invGrid').style.display = 'grid';
  document.getElementById('invQuestao').innerHTML = renderList(dados.questao);
  document.getElementById('invEvidencias').innerHTML = renderList(dados.evidencias);
  document.getElementById('invHipoteses').innerHTML = renderList(dados.hipoteses);
  document.getElementById('invConclusao').innerHTML = renderList(dados.conclusao);
  document.getElementById('invMeta').textContent = dados.meta || '';
  alertInvestigacao();
  addEvent('investigacao', 'Nova investigação registrada');
}
