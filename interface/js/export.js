import { tocarSom } from './sound.js';

export function initExport() {
  const exportBtn = document.getElementById('exportBtn');
  exportBtn.addEventListener('click', () => {
    tocarSom('toggle');
    const linhas = Array.from(document.querySelectorAll('.log-line')).map(el => {
      const tag = el.querySelector('.tag')?.textContent || ''; const time = el.querySelector('.time')?.textContent || '';
      const corpo = el.cloneNode(true); corpo.querySelector('.tag-row')?.remove();
      return `[${time}] ${tag}: ${corpo.textContent.trim()}`;
    });
    const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `jarvis-registro-${Date.now()}.txt`; a.click(); URL.revokeObjectURL(url);
  });
}
