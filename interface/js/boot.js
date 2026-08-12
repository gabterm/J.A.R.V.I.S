import { tocarSom } from './sound.js';
import { addEvent } from './events-feed.js';

const bootLines = ['INICIALIZANDO NÚCLEO..', 'CARREGANDO PROTOCOLOS DE VOZ..', 'ESTABELECENDO CANAL SEGURO..', 'SINCRONIZANDO TELEMETRIA..', 'J.A.R.V.I.S PRONTO.'];

export async function runBoot() {
  const bootTextEl = document.getElementById('bootText');
  const bootBarFill = document.getElementById('bootBarFill');
  const bootOverlay = document.getElementById('bootOverlay');

  let progress = 0;
  for (let i = 0; i < bootLines.length; i++) {
    const linha = bootLines[i];
    bootTextEl.textContent = '';
    for (let c = 0; c < linha.length; c++) { bootTextEl.textContent += linha[c]; await new Promise(r => setTimeout(r, 14)); }
    progress = ((i + 1) / bootLines.length) * 100;
    bootBarFill.style.width = progress + '%';
    await new Promise(r => setTimeout(r, 220));
  }
  await new Promise(r => setTimeout(r, 250));
  bootOverlay.classList.add('hidden');
  tocarSom('boot');
  addEvent('sistema', 'Interface inicializada');
}
