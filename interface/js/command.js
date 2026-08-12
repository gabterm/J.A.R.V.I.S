import { isTestModeOn } from './test-mode.js';
import { getWs } from './websocket.js';
import { addLogLine } from './log.js';
import { setEstado, getCoreMode } from './core.js';
import { tocarSom } from './sound.js';

export function initCommand() {
  const cmdInput = document.querySelector('.cmd-input');
  const sendBtn = document.getElementById('sendBtn');
  const micBtn = document.getElementById('micBtn');

  function enviarComando(texto) {
    texto = (texto || '').trim(); if (!texto) return;
    if (isTestModeOn()) {
      addLogLine('user', texto);
      cmdInput.value = '';
      setTimeout(() => addLogLine('jarvis', 'Isto é uma resposta simulada do modo teste.', 'moderada'), 700);
      return;
    }
    const ws = getWs();
    if (!ws || ws.readyState !== WebSocket.OPEN) { setEstado('offline'); return; }
    ws.send(JSON.stringify({ type: 'command', text: texto }));
    cmdInput.value = '';
  }

  sendBtn.addEventListener('click', () => enviarComando(cmdInput.value));
  cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviarComando(cmdInput.value); } });

  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  let reconhecendo = false; let recognition = null;
  if (SpeechRecognitionAPI) {
    recognition = new SpeechRecognitionAPI();
    recognition.lang = 'pt-BR'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = (event) => enviarComando(event.results[0][0].transcript);
    recognition.onstart = () => setEstado('listening');
    recognition.onend = () => { reconhecendo = false; micBtn.classList.remove('active'); if (getCoreMode() === 'listening') setEstado('idle'); };
    recognition.onerror = () => { reconhecendo = false; micBtn.classList.remove('active'); };
    micBtn.addEventListener('click', () => {
      tocarSom('mic');
      if (reconhecendo) { recognition.stop(); return; }
      reconhecendo = true; micBtn.classList.add('active');
      try { recognition.start(); } catch { reconhecendo = false; micBtn.classList.remove('active'); }
    });
  } else {
    micBtn.style.opacity = '0.3'; micBtn.style.cursor = 'not-allowed';
    micBtn.title = 'Reconhecimento de voz não suportado neste navegador — use o Chrome, ou digite o comando.';
  }
}
