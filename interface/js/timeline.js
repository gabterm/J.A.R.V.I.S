/* ================= timeline de contexto ================= */
import { tocarSom } from './sound.js';
import { isTestModeOn } from './test-mode.js';
import { getWs } from './websocket.js';

let timelineItems = [];

export function renderTimeline() {
  const timelineList = document.getElementById('timelineList');
  const timelineCount = document.getElementById('timelineCount');
  timelineList.innerHTML = '';
  if (timelineItems.length === 0) {
    timelineList.innerHTML = '<div class="feed-empty">sem eventos de contexto</div>';
    timelineCount.textContent = 0;
    return;
  }
  const ordenado = [...timelineItems].sort((a, b) => (b.pinned === true) - (a.pinned === true));
  ordenado.forEach(item => {
    const div = document.createElement('div');
    div.className = 'tl-item' + (item.pinned ? ' pinned' : '');
    div.innerHTML = `
      <div class="tl-top">
        <span class="tl-tag">${item.tipo || 'evento'}</span>
        <div class="tl-actions">
          <button class="pin-btn${item.pinned ? ' active' : ''}" title="Fixar">📌</button>
          <button class="del-btn" title="Remover">✕</button>
        </div>
      </div>
      <div class="tl-text">${item.text}</div>`;
    div.querySelector('.pin-btn').addEventListener('click', () => { item.pinned = !item.pinned; renderTimeline(); sendTimelineAction(item.id, item.pinned ? 'pin' : 'unpin'); tocarSom('toggle'); });
    div.querySelector('.del-btn').addEventListener('click', () => { timelineItems = timelineItems.filter(i => i.id !== item.id); renderTimeline(); sendTimelineAction(item.id, 'remove'); tocarSom('toggle'); });
    timelineList.appendChild(div);
  });
  timelineCount.textContent = timelineItems.length;
}

export function setTimelineItems(items) {
  timelineItems = items || [];
  renderTimeline();
}

export function addTimelineItem(item) {
  timelineItems.push(item);
  renderTimeline();
}

export function sendTimelineAction(id, action) {
  if (isTestModeOn()) return; // evita mandar ações do modo teste para o servidor real
  const ws = getWs();
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'timeline_action', id, action }));
}
