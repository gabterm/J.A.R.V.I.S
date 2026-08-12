export function initClock() {
  const minimalClockValue = document.getElementById('minimalClockValue');
  const telSync = document.getElementById('telSync');
  const telNode = document.getElementById('telNode');
  const wordmark = document.getElementById('wordmark');

  setInterval(() => { wordmark.classList.add('glitch'); setTimeout(() => wordmark.classList.remove('glitch'), 400); }, 14000 + Math.random() * 6000);

  setInterval(() => {
    telSync.textContent = (Math.random() * 20 + 80).toFixed(1);
    telNode.textContent = '0x' + Math.floor(Math.random() * 65535).toString(16).padStart(4, '0').toUpperCase();
  }, 1400);

  function tick() {
    const agora = new Date();
    document.getElementById('clock').textContent = agora.toLocaleTimeString('pt-BR');
    minimalClockValue.textContent = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  tick(); setInterval(tick, 1000);

  const start = Date.now();
  function updateUptime() {
    const diff = Math.floor((Date.now() - start) / 1000);
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    document.getElementById('uptime').textContent = `${h}:${m}:${s}`;
  }
  setInterval(updateUptime, 1000);
}
