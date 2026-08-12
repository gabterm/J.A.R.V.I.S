/* ================= modo teste (simula eventos sem depender do servidor) ================= */
import { setEstado } from './core.js';
import { addLogLine } from './log.js';
import { addToolExec, addEvent } from './events-feed.js';
import { renderWeather } from './weather.js';
import { renderReminders } from './reminders.js';
import { setTimelineItems } from './timeline.js';
import { setSubsystem } from './subsystems.js';
import { notify } from './notifications.js';
import { tocarSom } from './sound.js';

let testModeOn = false;
let testModeTimers = [];

export function isTestModeOn() { return testModeOn; }

const TEST_FALAS = [
  { role: 'user', text: 'Jarvis, qual a previsão do tempo pra hoje?' },
  { role: 'jarvis', text: 'Céu limpo em São Paulo, máxima de 26 graus. Recomendo levar um casaco leve pra noite.', confidence: 'alta' },
  { role: 'user', text: 'Me lembra de revisar o parser CNAB 240 às 15h.' },
  { role: 'jarvis', text: 'Lembrete criado para às 15h: revisar o parser CNAB 240.', confidence: 'alta' },
  { role: 'system', text: 'ROTINA DE TESTE EM EXECUÇÃO' },
];
const TEST_FERRAMENTAS = [
  { name: 'get_weather', result: 'São Paulo, SP — 24°C, céu limpo' },
  { name: 'ler_horas', result: '"14:30" → "quatorze e trinta"' },
  { name: 'consultar_memoria', result: '3 registros relevantes encontrados' },
];

function limparTimersTeste() { testModeTimers.forEach(t => clearInterval(t) || clearTimeout(t)); testModeTimers = []; }

function iniciarModoTeste() {
  document.body.classList.add('test-mode');
  addEvent('sistema', 'Modo teste ativado — simulando eventos');
  notify('Modo teste ativado: os dados exibidos são simulados.', 'info');

  // simula ciclo de estados do núcleo
  const estadosCiclo = ['idle', 'listening', 'thinking', 'speaking'];
  let passoEstado = 0;
  testModeTimers.push(setInterval(() => {
    setEstado(estadosCiclo[passoEstado % estadosCiclo.length]);
    passoEstado++;
  }, 3200));

  // simula falas alternadas
  let passoFala = 0;
  testModeTimers.push(setInterval(() => {
    const fala = TEST_FALAS[passoFala % TEST_FALAS.length];
    addLogLine(fala.role, fala.text, fala.confidence);
    passoFala++;
  }, 4200));

  // simula execução de ferramentas
  let passoFerr = 0;
  testModeTimers.push(setInterval(() => {
    const f = TEST_FERRAMENTAS[passoFerr % TEST_FERRAMENTAS.length];
    addToolExec({ name: f.name, status: 'running' });
    setTimeout(() => addToolExec({ name: f.name, status: 'success', result: f.result }), 900);
    passoFerr++;
  }, 6000));

  // dados simulados de clima
  renderWeather({ temp: 24, sensacao: 25, umidade: 58, vento: 12, min: 18, max: 27, local: 'São Paulo, SP (teste)', icone: 'ceu_limpo', condicao: 'céu limpo' });

  // lembretes simulados
  renderReminders([
    { texto: 'Revisar parser CNAB 240', quando: 'hoje às 15h', concluido: false },
    { texto: 'Testar TTS com Fish Audio', quando: 'amanhã', concluido: false },
    { texto: 'Atualizar memória persistente', quando: 'concluído', concluido: true },
  ]);

  // linha do tempo simulada
  setTimelineItems([
    { id: 'tst-1', tipo: 'contexto', text: 'Gabriel está testando a interface do JARVIS.', pinned: true },
    { id: 'tst-2', tipo: 'preferencia', text: 'Prefere respostas objetivas e diretas.', pinned: false },
  ]);

  // subsistemas todos ativos durante o teste
  ['voz', 'memoria', 'websocket', 'ferramentas', 'banco', 'processamento'].forEach(s => setSubsystem(s, true, false));

  // recursos simulados oscilando
  testModeTimers.push(setInterval(() => {
    const cpu = Math.round(10 + Math.random() * 30);
    const mem = Math.round(35 + Math.random() * 25);
    const disk = 62;
    document.getElementById('cpuVal').textContent = cpu + '%'; document.getElementById('cpuBar').style.width = cpu + '%';
    document.getElementById('memVal').textContent = mem + '%'; document.getElementById('memBar').style.width = mem + '%';
    document.getElementById('diskVal').textContent = disk + '%'; document.getElementById('diskBar').style.width = disk + '%';
  }, 2500));
}

function pararModoTeste() {
  document.body.classList.remove('test-mode');
  limparTimersTeste();
  setEstado('idle');
  ['voz', 'memoria', 'ferramentas', 'banco', 'processamento'].forEach(s => setSubsystem(s, false, false));
  addEvent('sistema', 'Modo teste desativado');
  notify('Modo teste desativado.', 'info');
}

export function initTestMode() {
  const testModeSwitch = document.getElementById('testModeSwitch');
  testModeSwitch.addEventListener('click', () => {
    testModeOn = !testModeOn;
    testModeSwitch.classList.toggle('on', testModeOn);
    tocarSom('toggle');
    if (testModeOn) iniciarModoTeste(); else pararModoTeste();
  });
}
