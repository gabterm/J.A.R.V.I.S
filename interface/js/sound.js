let somAtivo = true;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}

function beep({ freq = 880, dur = 0.08, type = 'sine', vol = 0.08, delay = 0, glideTo = null }) {
  const ctx = getAudioCtx();
  if (!ctx || !somAtivo) return;
  if (ctx.state === 'suspended') ctx.resume();
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function tocarSom(tipo) {
  if (!somAtivo) return;
  switch (tipo) {
    case 'boot':
      beep({ freq: 220, dur: 0.12, type: 'sine', glideTo: 660, vol: 0.06 });
      beep({ freq: 660, dur: 0.09, type: 'sine', delay: 0.13, vol: 0.06 });
      break;
    case 'online':
      beep({ freq: 440, dur: 0.07, type: 'triangle', vol: 0.07 });
      beep({ freq: 880, dur: 0.09, type: 'triangle', delay: 0.08, vol: 0.07 });
      break;
    case 'offline':
      beep({ freq: 320, dur: 0.16, type: 'sawtooth', glideTo: 140, vol: 0.09 });
      beep({ freq: 300, dur: 0.16, type: 'sawtooth', glideTo: 130, vol: 0.09, delay: 0.22 });
      break;
    case 'envio':
      beep({ freq: 700, dur: 0.045, type: 'square', vol: 0.04 });
      break;
    case 'recebido':
      beep({ freq: 1200, dur: 0.05, type: 'sine', vol: 0.05 });
      beep({ freq: 1500, dur: 0.05, type: 'sine', delay: 0.05, vol: 0.04 });
      break;
    case 'mic':
      beep({ freq: 500, dur: 0.05, type: 'sine', glideTo: 900, vol: 0.05 });
      break;
    case 'toggle':
      beep({ freq: 950, dur: 0.03, type: 'square', vol: 0.03 });
      break;
    case 'notify':
      beep({ freq: 1100, dur: 0.06, type: 'triangle', vol: 0.045 });
      break;
    case 'alert':
      beep({ freq: 500, dur: 0.09, type: 'square', glideTo: 380, vol: 0.07 });
      beep({ freq: 500, dur: 0.09, type: 'square', glideTo: 380, vol: 0.07, delay: 0.16 });
      break;
  }
}

export function initSound() {
  const soundToggle = document.getElementById('soundToggle');
  const soundValue = document.getElementById('soundValue');
  soundToggle.addEventListener('click', () => {
    somAtivo = !somAtivo;
    soundValue.textContent = somAtivo ? 'ON' : 'OFF';
    soundToggle.classList.toggle('on', somAtivo);
    soundToggle.classList.toggle('sound-off', !somAtivo);
    if (somAtivo) tocarSom('toggle');
  });
  document.addEventListener('click', () => { getAudioCtx(); }, { once: true });
}
