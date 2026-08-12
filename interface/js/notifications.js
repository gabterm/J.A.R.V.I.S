import { tocarSom } from './sound.js';

export function notify(texto, level = 'info') {
  const notifBox = document.getElementById('notifications');
  const div = document.createElement('div');
  div.className = `toast level-${level}`;
  div.innerHTML = `<div class="t-dot"></div><div>${texto}</div>`;
  notifBox.appendChild(div);
  requestAnimationFrame(() => div.classList.add('show'));
  tocarSom(level === 'warning' ? 'alert' : 'notify');
  setTimeout(() => {
    div.classList.remove('show');
    setTimeout(() => div.remove(), 400);
  }, 5000);
}
