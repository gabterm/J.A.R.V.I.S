import { tocarSom } from './sound.js';
import { addEvent } from './events-feed.js';
import { setAnimSpeedMult } from './utils.js';

export function initSettings() {
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsDrawer = document.getElementById('settingsDrawer');
  const minimalSwitch = document.getElementById('minimalSwitch');
  const minimalExitBtn = document.getElementById('minimalExitBtn');

  settingsToggle.addEventListener('click', () => {
    settingsDrawer.classList.toggle('open');
    settingsToggle.classList.toggle('on');
    tocarSom('toggle');
  });
  document.addEventListener('click', (e) => {
    if (!settingsDrawer.contains(e.target) && !settingsToggle.contains(e.target)) {
      settingsDrawer.classList.remove('open'); settingsToggle.classList.remove('on');
    }
  });

  // tema
  document.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      document.body.classList.remove('theme-amber', 'theme-violet', 'theme-red');
      const tema = sw.dataset.theme;
      if (tema !== 'cyan') document.body.classList.add('theme-' + tema);
      tocarSom('toggle');
      addEvent('sistema', `Tema visual alterado para ${sw.title.toLowerCase()}`);
    });
  });

  document.getElementById('animSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    document.querySelectorAll('#animSegmented button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const nivel = btn.dataset.anim;
    const mult = nivel === 'low' ? 1.7 : (nivel === 'high' ? 0.55 : 1);
    setAnimSpeedMult(nivel === 'low' ? 0.5 : (nivel === 'high' ? 1.8 : 1));
    document.documentElement.style.setProperty('--dur-mult', mult);
    tocarSom('toggle');
  });


  document.getElementById('densitySegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    document.querySelectorAll('#densitySegmented button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.body.classList.remove('density-compact', 'density-detailed');
    const nivel = btn.dataset.density;
    if (nivel !== 'normal') document.body.classList.add('density-' + nivel);
    tocarSom('toggle');
  });

  let minimalOn = false;
  function setMinimal(ativo) {
    minimalOn = ativo;
    minimalSwitch.classList.toggle('on', minimalOn);
    document.body.classList.toggle('minimal', minimalOn);
  }
  minimalSwitch.addEventListener('click', () => {
    setMinimal(!minimalOn);
    tocarSom('toggle');
    addEvent('sistema', minimalOn ? 'Modo minimalista ativado' : 'Modo minimalista desativado');
  });
  
  minimalExitBtn.addEventListener('click', () => {
    setMinimal(false);
    tocarSom('toggle');
    addEvent('sistema', 'Modo minimalista desativado');
  });
}
