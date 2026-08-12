import { getCyanRgb, animSpeedMult } from './utils.js';
import { tocarSom } from './sound.js';
import { notify } from './notifications.js';
import { addEvent } from './events-feed.js';
import { setSubsystem } from './subsystems.js';

const coreStage = document.getElementById('coreStage');
const coreCanvas = document.getElementById('coreParticles');
const coreCtx = coreCanvas.getContext('2d');
const CORE_SIZE = 148;
coreCanvas.width = CORE_SIZE; coreCanvas.height = CORE_SIZE;

let coreMode = 'idle';
export function getCoreMode() { return coreMode; }

let coreParticles = Array.from({ length: 22 }, () => ({
  angle: Math.random() * Math.PI * 2,
  radius: 20 + Math.random() * 50,
  speed: 0.35 + Math.random() * 0.45,
  alpha: 0.5 + Math.random() * 0.4
}));

export function setCoreMode(mode) {
  coreMode = mode;
  coreStage.className = 'core-stage mode-' + mode;
}

function drawCoreParticles() {
  coreCtx.clearRect(0, 0, CORE_SIZE, CORE_SIZE);
  const cx = CORE_SIZE / 2, cy = CORE_SIZE / 2;
  const rgb = coreMode === 'alert' ? getComputedStyle(document.body).getPropertyValue('--warn-rgb').trim() : getCyanRgb();

  coreParticles.forEach(p => {
    const am = animSpeedMult;
    switch (coreMode) {
      case 'thinking':
        p.radius -= p.speed * 1.1 * am;
        if (p.radius < 4) { p.radius = 66 + Math.random() * 6; p.angle = Math.random() * Math.PI * 2; }
        break;
      case 'speaking':
        p.radius += p.speed * 1.3 * am;
        p.alpha = Math.max(0, 1 - p.radius / 70);
        if (p.radius > 70) { p.radius = 2 + Math.random() * 6; p.angle = Math.random() * Math.PI * 2; p.alpha = 0.8; }
        break;
      case 'listening':
        p.angle += 0.006 * am;
        p.radius = 40 + Math.sin(Date.now() / 600 + p.angle * 3) * 12;
        break;
      case 'alert':
        p.angle += (Math.random() - 0.5) * 0.25;
        p.radius += (Math.random() - 0.5) * 5;
        p.radius = Math.max(10, Math.min(68, p.radius));
        break;
      default:
        p.angle += 0.0016;
        p.radius += Math.sin(Date.now() / 2000 + p.angle) * 0.05;
    }
    const x = cx + Math.cos(p.angle) * p.radius;
    const y = cy + Math.sin(p.angle) * p.radius;
    const alpha = coreMode === 'speaking' ? p.alpha : (coreMode === 'idle' ? 0.22 : 0.55);
    coreCtx.fillStyle = `rgba(${rgb}, ${alpha})`;
    coreCtx.beginPath();
    coreCtx.arc(x, y, coreMode === 'thinking' ? 1.6 : 1.3, 0, Math.PI * 2);
    coreCtx.fill();
  });
  requestAnimationFrame(drawCoreParticles);
}
drawCoreParticles();

const ESTADOS = { idle: 'AGUARDANDO COMANDO', thinking: 'PROCESSANDO', speaking: 'FALANDO', listening: 'OUVINDO', alert: 'ALERTA', offline: 'DESCONECTADO' };

export function setEstado(estado) {
  const coreStatus = document.getElementById('coreStatus');
  const micBtn = document.getElementById('micBtn');
  const statusPillText = document.getElementById('statusPillText');

  const label = ESTADOS[estado] || estado.toUpperCase();
  coreStatus.innerHTML = `${label}<b id="dots">.</b>`;
  micBtn.classList.toggle('active', estado === 'speaking' || estado === 'thinking' || estado === 'listening');
  setCoreMode(estado === 'offline' ? 'alert' : estado);

  const jaOffline = document.body.classList.contains('offline');
  if (estado === 'offline' && !jaOffline) {
    document.body.classList.add('offline'); statusPillText.textContent = 'SISTEMA OFFLINE';
    tocarSom('offline'); setSubsystem('websocket', false); addEvent('conexao', 'Conexão perdida com o servidor');
    notify('Conexão perdida. Tentando reconectar…', 'warning');
  } else if (estado !== 'offline' && jaOffline) {
    document.body.classList.remove('offline'); statusPillText.textContent = 'SISTEMA ONLINE';
    tocarSom('online'); setSubsystem('websocket', true, true); addEvent('conexao', 'Conexão restabelecida');
    notify('Conexão estabelecida.', 'success');
  }

  document.querySelectorAll('.log-line.jarvis').forEach(el => el.classList.remove('speaking-now'));
  if (estado === 'speaking') {
    const linhas = document.querySelectorAll('.log-line.jarvis');
    const ultima = linhas[linhas.length - 1];
    if (ultima) ultima.classList.add('speaking-now');
  }
}

let dotCount = 1;
setInterval(() => {
  dotCount = (dotCount % 3) + 1;
  const dots = document.getElementById('dots');
  if (dots) dots.textContent = '.'.repeat(dotCount);
}, 600);
