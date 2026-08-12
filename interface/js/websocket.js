import { setEstado } from './core.js';
import { setSubsystem } from './subsystems.js';
import { addEvent, addToolExec } from './events-feed.js';
import { notify } from './notifications.js';
import { addLogLine } from './log.js';
import { renderWeather } from './weather.js';
import { renderReminders } from './reminders.js';
import { setTimelineItems, addTimelineItem } from './timeline.js';
import { abrirInvestigacao } from './investigation.js';
import { abrirQuadroTatico, avancarQuadroTatico } from './tactical.js';
import { showTab } from './tabs.js';
import { tocarSom } from './sound.js';

let ws = null;
let primeiraConexao = true;

export function getWs() { return ws; }

export function conectar() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => { setEstado('idle'); setSubsystem('websocket', true, false); if (!primeiraConexao) tocarSom('online'); primeiraConexao = false; };
  ws.onclose = () => { setEstado('offline'); setTimeout(conectar, 2000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (msg) => {
    let evento; try { evento = JSON.parse(msg.data); } catch { return; }
    switch (evento.type) {
      case 'log': addLogLine(evento.role, evento.text, evento.confidence); break;
      case 'status': setEstado(evento.state); if (evento.state === 'thinking') setSubsystem('processamento', true, true); break;
      case 'memory': setSubsystem('memoria', true, true); break;
      case 'stats':
        if (evento.cpu !== undefined) { document.getElementById('cpuVal').textContent = evento.cpu + '%'; document.getElementById('cpuBar').style.width = evento.cpu + '%'; }
        if (evento.mem !== undefined) { document.getElementById('memVal').textContent = evento.mem + '%'; document.getElementById('memBar').style.width = evento.mem + '%'; }
        if (evento.disk !== undefined) { document.getElementById('diskVal').textContent = evento.disk + '%'; document.getElementById('diskBar').style.width = evento.disk + '%'; }
        break;
      case 'event': addEvent(evento.category, evento.text); break;
      case 'tool_exec': addToolExec(evento); break;
      case 'notification': notify(evento.text, evento.level || 'info'); break;
      case 'investigation': abrirInvestigacao(evento); showTab('investigacao'); break;
      case 'tactical_board': abrirQuadroTatico(evento); showTab('tatica'); break;
      case 'tactical_frame': avancarQuadroTatico(evento); break;
      case 'weather': renderWeather(evento); break;
      case 'reminders': renderReminders(evento.items); break;
      case 'timeline': setTimelineItems(evento.items); break;
      case 'timeline_add': addTimelineItem(evento.item); addEvent('timeline', 'Novo item de contexto registrado'); break;
      case 'subsystem': setSubsystem(evento.name, evento.active, !evento.persist); break;
    }
  };
}
