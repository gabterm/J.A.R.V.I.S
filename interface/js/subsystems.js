const subsysEls = {};

export function initSubsystems() {
  document.querySelectorAll('.subsys').forEach(el => { subsysEls[el.dataset.sys] = el; });
}

export function setSubsystem(nome, active, pulseOnly) {
  const el = subsysEls[nome];
  if (!el) return;
  el.classList.toggle('active', active);
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 900);
  if (pulseOnly) setTimeout(() => { if (nome !== 'websocket') el.classList.remove('active'); }, 2200);
}
