import { getCyanRgb, animSpeedMult } from './utils.js';

const canvas = document.getElementById('bgCanvas');
const ctx2d = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const count = Math.floor((canvas.width * canvas.height) / 26000);
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    r: Math.random() * 1.2 + 0.3, vy: Math.random() * 0.12 + 0.03, a: Math.random() * 0.5 + 0.15
  }));
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawBg() {
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  const rgb = getCyanRgb();
  const gap = 46;
  ctx2d.strokeStyle = `rgba(${rgb}, 0.035)`; ctx2d.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += gap) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, canvas.height); ctx2d.stroke(); }
  for (let y = 0; y < canvas.height; y += gap) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(canvas.width, y); ctx2d.stroke(); }
  particles.forEach(p => {
    p.y -= p.vy * animSpeedMult;
    if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
    ctx2d.fillStyle = `rgba(${rgb}, ${p.a})`;
    ctx2d.beginPath(); ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx2d.fill();
  });
  requestAnimationFrame(drawBg);
}
drawBg();
