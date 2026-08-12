import { tocarSom } from './sound.js';

const tabRegistro = document.getElementById('tabRegistro');
const tabInvestigacao = document.getElementById('tabInvestigacao');
const tabTatica = document.getElementById('tabTatica');
const logPanel = document.getElementById('logPanel');
const investigationPanel = document.getElementById('investigationPanel');
const tacticalPanel = document.getElementById('tacticalPanel');
const invAlertDot = document.getElementById('invAlertDot');
const tacticalAlertDot = document.getElementById('tacticalAlertDot');

export function showTab(tab) {
  tabRegistro.classList.toggle('active', tab === 'registro');
  tabInvestigacao.classList.toggle('active', tab === 'investigacao');
  tabTatica.classList.toggle('active', tab === 'tatica');
  logPanel.classList.toggle('hidden-tab', tab !== 'registro');
  investigationPanel.classList.toggle('visible', tab === 'investigacao');
  tacticalPanel.classList.toggle('visible', tab === 'tatica');
  if (tab === 'investigacao') invAlertDot.style.display = 'none';
  if (tab === 'tatica') tacticalAlertDot.style.display = 'none';
}

export function alertInvestigacao() {
  if (!investigationPanel.classList.contains('visible')) invAlertDot.style.display = 'inline-block';
}

export function alertTatica() {
  if (!tacticalPanel.classList.contains('visible')) tacticalAlertDot.style.display = 'inline-block';
}

export function initTabs() {
  tabRegistro.addEventListener('click', () => { showTab('registro'); tocarSom('toggle'); });
  tabInvestigacao.addEventListener('click', () => { showTab('investigacao'); tocarSom('toggle'); });
  tabTatica.addEventListener('click', () => { showTab('tatica'); tocarSom('toggle'); });
}
