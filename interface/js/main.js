/* ================= boot ================= */
const bootLines = ['INICIALIZANDO NÚCLEO...', 'CARREGANDO PROTOCOLOS DE VOZ...', 'ESTABELECENDO CANAL SEGURO...', 'SINCRONIZANDO TELEMETRIA...', 'J.A.R.V.I.S PRONTO.'];
const bootTextEl = document.getElementById('bootText');
const bootBarFill = document.getElementById('bootBarFill');
const bootOverlay = document.getElementById('bootOverlay');
async function runBoot() {
  let progress = 0;
  for (let i = 0; i < bootLines.length; i++) {
    const linha = bootLines[i];
    bootTextEl.textContent = '';
    for (let c = 0; c < linha.length; c++) { bootTextEl.textContent += linha[c]; await new Promise(r => setTimeout(r, 14)); }
    progress = ((i + 1) / bootLines.length) * 100;
    bootBarFill.style.width = progress + '%';
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => setTimeout(r, 200));
  bootOverlay.classList.add('hidden');
  tocarSom('boot');
  addLogEvent('info', 'Interface inicializada');
}
runBoot();

let animSpeedMult = 1;

/* ================= partículas de fundo ================= */
const canvas = document.getElementById('bgCanvas');
const ctx2d = canvas.getContext('2d');
let particles = [];
function resizeCanvas() {
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const count = Math.floor((canvas.width * canvas.height) / 30000);
  particles = Array.from({ length: count }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.1 + 0.3, vy: Math.random() * 0.1 + 0.03, a: Math.random() * 0.4 + 0.12 }));
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
function getCyanRgb() { return getComputedStyle(document.body).getPropertyValue('--cyan-rgb').trim() || '91, 227, 255'; }
function drawBg() {
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  const rgb = getCyanRgb();
  particles.forEach(p => {
    p.y -= p.vy * animSpeedMult;
    if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
    ctx2d.fillStyle = `rgba(${rgb}, ${p.a})`;
    ctx2d.beginPath(); ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx2d.fill();
  });
  requestAnimationFrame(drawBg);
}
drawBg();

/* ================= glitch periódico no wordmark ================= */
const wordmark = document.getElementById('wordmark');
setInterval(() => { wordmark.classList.add('glitch'); setTimeout(() => wordmark.classList.remove('glitch'), 400); }, 16000 + Math.random() * 6000);

/* ================= telemetria (tags do núcleo) ================= */
const tagLink = document.getElementById('tagLink');
const tagNode = document.getElementById('tagNode');
const tagCtx = document.getElementById('tagCtx');
const tagConf = document.getElementById('tagConf');
const tagSys = document.getElementById('tagSys');
let lastPingSent = 0;
setInterval(() => {
  // NODE é decorativo (identificador de sessão); os demais refletem estado real quando disponível
  tagNode.textContent = '0x' + Math.floor(Math.random() * 65535).toString(16).padStart(4, '0').toUpperCase();
}, 4000);

/* ================= relógio / uptime ================= */
function tick() {
  const agora = new Date();
  document.getElementById('clock').textContent = agora.toLocaleTimeString('pt-BR');
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
let dotCount = 1;
setInterval(() => { dotCount = (dotCount % 3) + 1; const dots = document.getElementById('dots'); if (dots) dots.textContent = '.'.repeat(dotCount); }, 600);

/* ================= settings drawer (tema + som) ================= */
const settingsToggle = document.getElementById('settingsToggle');
const settingsDrawer = document.getElementById('settingsDrawer');
const soundSwitch = document.getElementById('soundSwitch');

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
document.querySelectorAll('.swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
    document.body.classList.remove('theme-amber', 'theme-green', 'theme-red');
    const tema = sw.dataset.theme;
    if (tema !== 'cyan') document.body.classList.add('theme-' + tema);
    tocarSom('toggle');
    addLogEvent('info', `Tema visual alterado para ${sw.title.toLowerCase()}`);
  });
});
let somAtivo = true;
soundSwitch.addEventListener('click', () => {
  somAtivo = !somAtivo;
  soundSwitch.classList.toggle('on', somAtivo);
  if (somAtivo) tocarSom('toggle');
});

const mediaOverlay = document.getElementById('mediaOverlay');
const mediaIframe = document.getElementById('mediaIframe');
const mediaTitle = document.getElementById('mediaTitle');
const mediaClose = document.getElementById('mediaClose');
const mediaBlocked = document.getElementById('mediaBlocked');
const mediaBlockedOpen = document.getElementById('mediaBlockedOpen');
const mediaOpenExternal = document.getElementById('mediaOpenExternal');
let mediaExternalUrl = null;
let mediaLoadTimeout = null;

function abrirMedia(url, titulo, urlExterno, bloqueado) {
  mediaExternalUrl = urlExterno || url;
  mediaTitle.textContent = titulo || url;
  mediaOverlay.classList.add('open');
  tocarSom('toggle');
  addLogEvent('info', `Painel de mídia: ${titulo || url}`);

  if (bloqueado) {
    mediaIframe.style.display = 'none';
    mediaIframe.src = 'about:blank';
    mostrarMediaBloqueada();
    return;
  }

  mediaBlocked.style.display = 'none';
  mediaIframe.style.display = 'block';
  mediaIframe.src = url;

  clearTimeout(mediaLoadTimeout);
  mediaLoadTimeout = setTimeout(() => { mostrarMediaBloqueada(); }, 4000);
}

mediaIframe.addEventListener('load', () => { clearTimeout(mediaLoadTimeout); });

function mostrarMediaBloqueada() {
  mediaIframe.style.display = 'none';
  mediaBlocked.style.display = 'flex';
}

function fecharMedia() {
  mediaOverlay.classList.remove('open');
  mediaIframe.src = 'about:blank';
  clearTimeout(mediaLoadTimeout);
}

mediaClose.addEventListener('click', fecharMedia);
mediaBlockedOpen.addEventListener('click', () => { if (mediaExternalUrl) window.open(mediaExternalUrl, '_blank'); });
mediaOpenExternal.addEventListener('click', () => { if (mediaExternalUrl) window.open(mediaExternalUrl, '_blank'); });
mediaOverlay.addEventListener('click', (e) => { if (e.target === mediaOverlay) fecharMedia(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mediaOverlay.classList.contains('open')) fecharMedia();
});

/* ================= navegação ao vivo (browser_open/click/type/...) =================
   Cada ação de navegação do backend (Playwright, tools/web_agent.py) manda
   um screenshot em base64 via 'browser_screenshot'. Aqui só trocamos a
   imagem exibida — não há iframe nem controle de clique no navegador do
   usuário, a navegação real acontece inteira no backend. */
const browserOverlay = document.getElementById('browserOverlay');
const browserTitle = document.getElementById('browserTitle');
const browserUrl = document.getElementById('browserUrl');
const browserScreenshot = document.getElementById('browserScreenshot');
const browserClose = document.getElementById('browserClose');

function atualizarNavegacaoAoVivo(titulo, url, imagemBase64) {
  browserTitle.textContent = titulo || '—';
  browserUrl.textContent = url || '';
  browserScreenshot.src = `data:image/jpeg;base64,${imagemBase64}`;
  if (!browserOverlay.classList.contains('open')) {
    browserOverlay.classList.add('open');
    tocarSom('toggle');
    addLogEvent('info', `Navegação ao vivo: ${titulo || url}`);
  }
}

function fecharNavegacaoAoVivo() {
  browserOverlay.classList.remove('open');
}

browserClose.addEventListener('click', fecharNavegacaoAoVivo);
browserOverlay.addEventListener('click', (e) => { if (e.target === browserOverlay) fecharNavegacaoAoVivo(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && browserOverlay.classList.contains('open')) fecharNavegacaoAoVivo();
});

/* ================= quadro de raciocínio (show_reasoning_board) =================
   Recebe 'reasoning_board' (abre o overlay) seguido de um ou mais 'reasoning_frame'
   (cada um é o ESTADO COMPLETO do quadro naquele instante — nós + conexões).
   O backend já narra cada quadro em voz alta de forma bloqueante e sincronizada,
   então aqui é só desenhar o SVG de novo a cada frame recebido. */
const reasoningOverlay = document.getElementById('reasoningOverlay');
const reasoningTitle = document.getElementById('reasoningTitle');
const reasoningSvg = document.getElementById('reasoningSvg');
const reasoningCaption = document.getElementById('reasoningCaption');
const reasoningClose = document.getElementById('reasoningClose');

const REASONING_TIPO_COR = {
  ideia: 'var(--cyan)',
  pergunta: 'var(--amber)',
  dado: '#8aa0ff',
  conclusao: 'var(--ok)',
  alerta: 'var(--warn)',
};

function abrirQuadroRaciocinio(titulo) {
  reasoningTitle.textContent = titulo || 'Raciocínio';
  reasoningSvg.innerHTML = '';
  reasoningCaption.textContent = '';
  reasoningOverlay.classList.add('open');
  tocarSom('toggle');
  addLogEvent('info', `Quadro de raciocínio: ${titulo || ''}`);
}

function fecharQuadroRaciocinio() {
  reasoningOverlay.classList.remove('open');
}

reasoningClose.addEventListener('click', fecharQuadroRaciocinio);
reasoningOverlay.addEventListener('click', (e) => { if (e.target === reasoningOverlay) fecharQuadroRaciocinio(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && reasoningOverlay.classList.contains('open')) fecharQuadroRaciocinio();
});

function escapeXml(str) {
  return (str || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

function quebrarTextoNo(texto, maxChars) {
  const palavras = (texto || '').split(' ');
  const linhas = []; let atual = '';
  palavras.forEach(p => {
    if ((atual + ' ' + p).trim().length > maxChars) { linhas.push(atual.trim()); atual = p; }
    else { atual = (atual + ' ' + p).trim(); }
  });
  if (atual) linhas.push(atual);
  return linhas.slice(0, 3);
}

function renderQuadroRaciocinio(nos, conexoes, anotacao) {
  const porId = {};
  (nos || []).forEach(n => { porId[n.id] = n; });

  const partes = [];

  // conexões primeiro, pra ficarem atrás dos nós
  (conexoes || []).forEach(c => {
    const de = porId[c.de], para = porId[c.para];
    if (!de || !para) return;
    const cor = c.tipo === 'contradiz' ? 'var(--warn)' : c.tipo === 'suporta' ? 'var(--ok)' : 'var(--cyan-dim)';
    const dash = c.tipo === 'contradiz' ? '2,2' : 'none';
    partes.push(`<line x1="${de.x}" y1="${de.y}" x2="${para.x}" y2="${para.y}" stroke="${cor}" stroke-width="0.4" stroke-dasharray="${dash}" marker-end="url(#reasoningArrow)" opacity="0.8"/>`);
  });

  (nos || []).forEach(n => {
    const cor = REASONING_TIPO_COR[n.tipo] || 'var(--cyan)';
    const ativo = n.estado === 'ativo';
    const descartado = n.estado === 'descartado';
    const opacidade = descartado ? 0.35 : 1;
    const raio = ativo ? 5.4 : 4.6;
    const linhas = quebrarTextoNo(n.texto, 16);

    partes.push(`<g class="reasoning-node${ativo ? ' active' : ''}" opacity="${opacidade}">
      <circle cx="${n.x}" cy="${n.y}" r="${raio}" fill="rgba(5,12,16,0.85)" stroke="${cor}" stroke-width="${ativo ? 0.6 : 0.35}"/>
      ${linhas.map((linha, i) => `<text x="${n.x}" y="${n.y - (linhas.length - 1) * 1.6 + i * 3.2}" text-anchor="middle" font-size="2.4" fill="${cor}" font-family="var(--mono)">${escapeXml(linha)}</text>`).join('')}
    </g>`);
  });

  reasoningSvg.innerHTML = `
    <defs>
      <marker id="reasoningArrow" markerWidth="4" markerHeight="4" refX="3.4" refY="2" orient="auto">
        <path d="M0,0 L4,2 L0,4 Z" fill="var(--cyan-dim)"/>
      </marker>
    </defs>
    ${partes.join('')}
  `;
  reasoningCaption.textContent = anotacao || '';
}

/* ================= núcleo: estados ================= */
const micBtn = document.getElementById('micBtn');
const coreStage = document.getElementById('coreStage');
const coreStatus = document.getElementById('coreStatus');
const statusPillText = document.getElementById('statusPillText');
const ESTADOS = { idle: 'AGUARDANDO COMANDO', thinking: 'PROCESSANDO', speaking: 'FALANDO', listening: 'OUVINDO', alert: 'ALERTA', offline: 'DESCONECTADO' };

function setEstado(estado) {
  const label = ESTADOS[estado] || estado.toUpperCase();
  coreStatus.innerHTML = `${label}<b id="dots">.</b>`;
  micBtn.classList.toggle('active', estado === 'speaking' || estado === 'thinking' || estado === 'listening');
  coreStage.className = 'core-stage mode-' + (estado === 'offline' ? 'alert' : estado);
  tagSys.textContent = estado === 'offline' ? 'ERR' : 'OK';

  const jaOffline = document.body.classList.contains('offline');
  if (estado === 'offline' && !jaOffline) {
    document.body.classList.add('offline'); statusPillText.textContent = 'SISTEMA OFFLINE';
    document.getElementById('secureLinkLabel').textContent = 'OFFLINE';
    tocarSom('offline'); setSubsystem('websocket', false); addLogEvent('warn', 'Conexão perdida com o servidor');
    notify('Conexão perdida. Tentando reconectar…', 'warning');
  } else if (estado !== 'offline' && jaOffline) {
    document.body.classList.remove('offline'); statusPillText.textContent = 'SISTEMA ONLINE';
    document.getElementById('secureLinkLabel').textContent = 'ONLINE';
    tocarSom('online'); setSubsystem('websocket', true, true); addLogEvent('info', 'Conexão restabelecida');
    notify('Conexão estabelecida.', 'success');
  }
}

const subsysEls = {};
document.querySelectorAll('.subsys').forEach(el => { subsysEls[el.dataset.sys] = el; });
function setSubsystem(nome, active, pulseOnly) {
  const el = subsysEls[nome]; if (!el) return;
  el.classList.toggle('active', active);
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 900);
  if (pulseOnly) setTimeout(() => { if (nome !== 'websocket') el.classList.remove('active'); }, 2200);
}

/* ================= terminal (registro de interação) ================= */
const terminalBody = document.getElementById('terminalBody');
function addTermLine(role, text, opts) {
  const empty = document.getElementById('terminalEmpty'); if (empty) empty.remove();
  const div = document.createElement('div');
  const cls = role === 'user' ? 'role-user' : (role === 'system' ? 'role-system' : 'role-jarvis');
  div.className = `term-line ${cls}`;
  const prefix = role === 'user'
  ? 'araujo@jarvis:~$'
  : role === 'system'
    ? '[sistema]'
    : 'jarvis>';
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  div.innerHTML = `<span class="t-time">${time}</span> <span class="t-prefix">${prefix}</span> <span class="t-text"></span>`;
  terminalBody.appendChild(div);
  const textEl = div.querySelector('.t-text');
  typewriter(textEl, text || '');
  terminalBody.scrollTop = terminalBody.scrollHeight;
  while (terminalBody.children.length > 60) terminalBody.removeChild(terminalBody.firstChild);

  registrarAtividade(role);
  if (role === 'user') { tocarSom('envio'); }
  else if (role !== 'system') { tocarSom('recebido'); }
}
function typewriter(el, texto) {
  let i = 0; const speed = 10;
  function passo() { if (i < texto.length) { el.textContent += texto[i]; i++; setTimeout(passo, speed); } }
  passo();
}

/* ================= execução manual de ferramentas (slash commands) =================
   Espelha 1:1 as funções de tools.py (TOOL_FUNCTIONS). Digitar "/nome chave=valor ..."
   no terminal chama a ferramenta DIRETO no backend, sem passar pelo modelo — ideal
   pra testar. Texto sem "/" continua indo pro fluxo normal de chat (LLM).

   IMPORTANTE: pra isso realmente executar algo, o servidor por trás do WebSocket
   precisa tratar mensagens { type: "tool_call", name, args } e responder com
   "tool_exec"/"tool_result". Se o seu backend só trata { type: "command" } (o
   texto solto que vai pro LLM), o comando aparece no terminal mas nunca roda —
   é a causa mais provável de "/help" ou "/get_weather ..." parecerem não fazer
   nada. Vale conferir o handler do WebSocket no servidor. */
const TOOLS_META = {
  get_current_time:    { params: [{ n: 'timezone', req: false }] },
  get_current_date:    { params: [{ n: 'timezone', req: false }] },
  open_website:        { params: [{ n: 'url', req: true }] },
  search_web:          { params: [{ n: 'query', req: true }] },
  open_application:    { params: [{ n: 'application', req: true }] },
  close_application:   { params: [{ n: 'application', req: true }] },
  open_folder:         { params: [{ n: 'path', req: true }] },
  list_files:          { params: [{ n: 'path', req: true }] },
  run_terminal:        { params: [{ n: 'command', req: true }] },
  take_screenshot:     { params: [{ n: 'save_path', req: false }] },
  lock_screen:         { params: [] },
  set_volume:          { params: [{ n: 'level', req: true, tipo: 'int' }] },
  get_battery_status:  { params: [] },
  add_reminder:        { params: [{ n: 'texto', req: true }, { n: 'quando', req: false }] },
  list_reminders:      { params: [] },
  complete_reminder:   { params: [{ n: 'texto', req: true }] },
  remove_reminder:     { params: [{ n: 'texto', req: true }] },
  show_notification:   { params: [{ n: 'title', req: true }, { n: 'message', req: true }] },
  get_weather:         { params: [{ n: 'local', req: false }] },
  get_daily_news:      { params: [{ n: 'query', req: false }, { n: 'limit', req: false, tipo: 'int' }] },
  get_distance:        { params: [{ n: 'origem', req: true }, { n: 'destino', req: true }, { n: 'modo', req: false }] },
  find_nearest_place:  { params: [{ n: 'origem', req: true }, { n: 'categoria', req: true }, { n: 'tags', req: true, tipo: 'json' }, { n: 'modo', req: false }] },
  show_tactical_board: { params: [{ n: 'titulo', req: true }, { n: 'quadros', req: true, tipo: 'json' }, { n: 'formacao_casa', req: false }, { n: 'formacao_visitante', req: false }] },
  show_reasoning_board:{ params: [{ n: 'titulo', req: true }, { n: 'quadros', req: true, tipo: 'json' }] },
  show_simulation:     { params: [{ n: 'titulo', req: true }, { n: 'objetos', req: true, tipo: 'json' }, { n: 'modo', req: false }, { n: 'duracao', req: false }, { n: 'loop', req: false }, { n: 'velocidade', req: false }, { n: 'anotacao', req: false }] },
};

// tokeniza "chave=valor" respeitando aspas ("...") e colchetes/chaves ([...] / {...})
function tokenizarArgs(resto) {
  const regex = /(\w+)=("(?:[^"\\]|\\.)*"|\[[^\]]*\]|\{[^}]*\}|\S+)/g;
  const args = {}; let m;
  while ((m = regex.exec(resto)) !== null) {
    let [, chave, valor] = m;
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    else if (valor.startsWith('[') || valor.startsWith('{')) {
      try { valor = JSON.parse(valor); } catch { /* mantém como string se o JSON for inválido */ }
    } else if (/^-?\d+$/.test(valor)) valor = parseInt(valor, 10);
    args[chave] = valor;
  }
  return args;
}

function listarFerramentas() {
  const linhas = Object.entries(TOOLS_META).map(([nome, meta]) => {
    const params = meta.params.map(p => p.req ? p.n : `[${p.n}]`).join(' ');
    return `  /${nome} ${params}`;
  });
  addTermLine('system', `FERRAMENTAS DISPONÍVEIS:\n${linhas.join('\n')}\n\nSintaxe: /ferramenta chave="valor" chave2=valor2`);
}

// retorna true se tratou o input como slash-command (não deve seguir pro chat normal)
function tratarSlashCommand(texto) {
  if (!texto.startsWith('/')) return false;
  const semBarra = texto.slice(1).trim();
  const primeiroEspaco = semBarra.search(/\s/);
  const nome = primeiroEspaco === -1 ? semBarra : semBarra.slice(0, primeiroEspaco);
  const resto = primeiroEspaco === -1 ? '' : semBarra.slice(primeiroEspaco + 1);

  addTermLine('user', texto);
  resetCmdInput();

  if (nome === 'help' || nome === 'ajuda') { listarFerramentas(); return true; }
  if (nome === 'clear' || nome === 'limpar') { terminalBody.innerHTML = '<div class="term-empty" id="terminalEmpty">t</div>'; return true; }

  const meta = TOOLS_META[nome];
  if (!meta) {
    addTermLine('system', `Ferramenta desconhecida: "${nome}". Digite /help para ver a lista.`);
    return true;
  }

  const args = tokenizarArgs(resto);
  const faltando = meta.params.filter(p => p.req && !(p.n in args)).map(p => p.n);
  if (faltando.length) {
    addTermLine('system', `Faltam argumentos obrigatórios para /${nome}: ${faltando.join(', ')}`);
    return true;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addTermLine('system', `Sem conexão com o servidor — /${nome} não pôde ser enviado.`);
    setEstado('offline');
    return true;
  }
  setEstado('thinking'); setSubsystem('ferramentas', true, true);
  addLogEvent('info', `Chamando ferramenta: ${nome}`);
  ws.send(JSON.stringify({ type: 'tool_call', name: nome, args }));
  return true;
}

function formatarResultadoFerramenta(evento) {
  if (evento.message) return evento.message;
  try { return JSON.stringify(evento.data ?? evento, null, 2); } catch { return String(evento.data); }
}

/* ================= system logs ================= */
const logsBody = document.getElementById('logsBody');
const logsCount = document.getElementById('logsCount');
let totalLogs = 0;
function addLogEvent(level, texto) {
  const empty = document.getElementById('logsEmpty'); if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = `log-row level-${level}`;
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const label = level === 'info' ? 'INFO' : (level === 'warn' ? 'WARN' : 'ERROR');
  div.innerHTML = `<span class="lg-time">${time}</span><span class="lg-level">${label}</span><span class="lg-text">${texto}</span>`;
  logsBody.prepend(div);
  while (logsBody.children.length > 50) logsBody.removeChild(logsBody.lastChild);
  totalLogs++; logsCount.textContent = totalLogs;
}

/* ================= atividade (mensagens / min) ================= */
let activityTimestamps = { user: [], jarvis: [] };
const activityValueEl = document.getElementById('activityValue');
const activitySvg = document.getElementById('activitySvg');
function registrarAtividade(role) {
  const key = role === 'user' ? 'user' : 'jarvis';
  if (!activityTimestamps[key]) return;
  activityTimestamps[key].push(Date.now());
  renderActivity();
}
function renderActivity() {
  const now = Date.now();
  const janela = 60000; // 1 min
  ['user', 'jarvis'].forEach(k => { activityTimestamps[k] = activityTimestamps[k].filter(t => now - t <= janela); });
  const total = activityTimestamps.user.length + activityTimestamps.jarvis.length;
  activityValueEl.textContent = total;

  // agrupa em 12 baldes de 5s para desenhar a linha
  const buckets = 12; const bucketMs = janela / buckets;
  function toPoints(arr) {
    const counts = new Array(buckets).fill(0);
    arr.forEach(t => { const idx = Math.min(buckets - 1, Math.floor((now - t) / bucketMs)); counts[buckets - 1 - idx]++; });
    const max = Math.max(1, ...counts);
    return counts.map((c, i) => `${(i / (buckets - 1)) * 100},${40 - (c / max) * 34 - 2}`).join(' ');
  }
  const ptsDown = toPoints(activityTimestamps.user);
  const ptsUp = toPoints(activityTimestamps.jarvis);
  activitySvg.innerHTML = `
    <polyline class="activity-line" points="${ptsDown}"/>
    <polyline class="activity-line up" points="${ptsUp}"/>
  `;
}
setInterval(renderActivity, 4000);
renderActivity();

/* ================= notificações ================= */
const notifBox = document.getElementById('notifications');
function notify(texto, level = 'info') {
  const div = document.createElement('div');
  div.className = `toast level-${level}`;
  div.innerHTML = `<div class="t-dot"></div><div>${texto}</div>`;
  notifBox.appendChild(div);
  requestAnimationFrame(() => div.classList.add('show'));
  tocarSom(level === 'warning' ? 'alert' : 'notify');
  setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 400); }, 5000);
}

/* ================= som ================= */
let audioCtx = null;
function getAudioCtx() { if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); } return audioCtx; }
function beep({ freq = 880, dur = 0.08, type = 'sine', vol = 0.08, delay = 0, glideTo = null }) {
  const ctx = getAudioCtx(); if (!ctx || !somAtivo) return;
  if (ctx.state === 'suspended') ctx.resume();
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, t0 + dur);
  gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(vol, t0 + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function tocarSom(tipo) {
  if (!somAtivo) return;
  switch (tipo) {
    case 'boot': beep({ freq: 220, dur: 0.12, type: 'sine', glideTo: 660, vol: 0.06 }); beep({ freq: 660, dur: 0.09, type: 'sine', delay: 0.13, vol: 0.06 }); break;
    case 'online': beep({ freq: 440, dur: 0.07, type: 'triangle', vol: 0.07 }); beep({ freq: 880, dur: 0.09, type: 'triangle', delay: 0.08, vol: 0.07 }); break;
    case 'offline': beep({ freq: 320, dur: 0.16, type: 'sawtooth', glideTo: 140, vol: 0.09 }); break;
    case 'envio': beep({ freq: 700, dur: 0.045, type: 'square', vol: 0.04 }); break;
    case 'recebido': beep({ freq: 1200, dur: 0.05, type: 'sine', vol: 0.05 }); beep({ freq: 1500, dur: 0.05, type: 'sine', delay: 0.05, vol: 0.04 }); break;
    case 'mic': beep({ freq: 500, dur: 0.05, type: 'sine', glideTo: 900, vol: 0.05 }); break;
    case 'toggle': beep({ freq: 950, dur: 0.03, type: 'square', vol: 0.03 }); break;
    case 'notify': beep({ freq: 1100, dur: 0.06, type: 'triangle', vol: 0.045 }); break;
    case 'alert': beep({ freq: 500, dur: 0.09, type: 'square', glideTo: 380, vol: 0.07 }); break;
  }
}
document.addEventListener('click', () => { getAudioCtx(); }, { once: true });

/* ================= exportar registro ================= */
document.getElementById('exportBtn').addEventListener('click', () => {
  tocarSom('toggle');
  const linhas = Array.from(document.querySelectorAll('.term-line')).map(el => el.textContent.trim());
  const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `jarvis-registro-${Date.now()}.txt`; a.click(); URL.revokeObjectURL(url);
});

/* ================= nav lateral (foco visual) ================= */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    tocarSom('toggle');
  });
});

/* ================= clima (autônomo — busca direto no navegador, sem passar pela tool get_weather) ================= */
/* ================= clima ================= */

const WMO_MAP_JS = {
  0:  ['céu limpo', 'sun'],
  1:  ['poucas nuvens', 'cloud-sun'],
  2:  ['parcialmente nublado', 'cloud-sun'],
  3:  ['nublado', 'cloud'],

  45: ['neblina', 'cloud-fog'],
  48: ['neblina com geada', 'cloud-fog'],

  51: ['garoa fraca', 'cloud-drizzle'],
  53: ['garoa', 'cloud-drizzle'],
  55: ['garoa forte', 'cloud-rain'],

  56: ['garoa congelante', 'cloud-rain'],
  57: ['garoa congelante forte', 'cloud-rain'],

  61: ['chuva fraca', 'cloud-drizzle'],
  63: ['chuva', 'cloud-rain'],
  65: ['chuva forte', 'cloud-rain'],

  66: ['chuva congelante', 'cloud-rain'],
  67: ['chuva congelante forte', 'cloud-rain'],

  71: ['neve fraca', 'cloud-snow'],
  73: ['neve', 'cloud-snow'],
  75: ['neve forte', 'snowflake'],
  77: ['grãos de neve', 'cloud-snow'],

  80: ['pancadas fracas', 'cloud-sun-rain'],
  81: ['pancadas de chuva', 'cloud-rain'],
  82: ['pancadas fortes', 'cloud-lightning'],

  85: ['pancadas de neve fracas', 'cloud-snow'],
  86: ['pancadas de neve fortes', 'snowflake'],

  95: ['tempestade', 'cloud-lightning'],
  96: ['tempestade com granizo', 'cloud-lightning'],
  99: ['tempestade forte', 'cloud-lightning'],
};

const ICON_POR_CATEGORIA = {
  ceu_limpo: 'sun',
  nublado: 'cloud',
  chuva: 'cloud-rain',
  neve: 'snowflake',
  tempestade: 'cloud-lightning',
  neblina: 'cloud-fog',
};
const WEATHER_DEFAULT_LOCAL = 'Curitiba, BR'; // usado só se a geolocalização do navegador falhar/for negada
const WEATHER_REFRESH_MS = 15 * 60 * 1000; // atualiza sozinho a cada 15 minutos

function aplicarClima({ temp, sensacao, umidade, vento, min, max, condTexto, icone, local }) {
  document.getElementById('weatherIcon').innerHTML = `
  <i data-lucide="${icone}"></i>
`;

lucide.createIcons();
  document.getElementById('weatherTemp').textContent = Math.round(temp) + '°';
  document.getElementById('weatherCond').textContent = condTexto;
  document.getElementById('weatherLoc').textContent = local;
  document.getElementById('weatherFeels').textContent = Math.round(sensacao) + '°';
  document.getElementById('weatherMinMax').textContent = Math.round(min) + '° / ' + Math.round(max) + '°';
  document.getElementById('weatherHumidity').textContent = Math.round(umidade) + '%';
  document.getElementById('weatherWind').textContent = Math.round(vento) + ' km/h';
  document.getElementById('weatherAccent').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function buscarClimaPorCoordenadas(lat, lon, nomeLocal) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_min,temperature_2m_max&timezone=auto`;
    const resp = await fetch(url);
    const data = await resp.json();
   const [condTexto, icone] =
  WMO_MAP_JS[data.current.weather_code] ||
  ['indefinido', 'thermometer'];
    aplicarClima({
      temp: data.current.temperature_2m,
      sensacao: data.current.apparent_temperature,
      umidade: data.current.relative_humidity_2m,
      vento: data.current.wind_speed_10m,
      min: data.daily.temperature_2m_min[0],
      max: data.daily.temperature_2m_max[0],
      condTexto, icone,
      local: nomeLocal,
    });
  } catch (error) {
    document.getElementById('weatherCond').textContent = 'indisponível';
  }
}

async function buscarClimaPorNome(local) {
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(local)}&count=1&language=pt&format=json`;
    const geoResp = await fetch(geoUrl);
    const geoData = await geoResp.json();
    const item = (geoData.results || [])[0];
    if (!item) { document.getElementById('weatherCond').textContent = 'local não encontrado'; return; }
    const nomeLocal = [item.name, item.admin1, item.country].filter(Boolean).join(', ');
    await buscarClimaPorCoordenadas(item.latitude, item.longitude, nomeLocal);
  } catch (error) {
    document.getElementById('weatherCond').textContent = 'indisponível';
  }
}

function atualizarClima() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => buscarClimaPorCoordenadas(pos.coords.latitude, pos.coords.longitude, 'localização atual'),
      () => buscarClimaPorNome(WEATHER_DEFAULT_LOCAL),
      { timeout: 4000 }
    );
  } else {
    buscarClimaPorNome(WEATHER_DEFAULT_LOCAL);
  }
}
atualizarClima();
setInterval(atualizarClima, WEATHER_REFRESH_MS);

/* ================= terra 3d (three.js, textura procedural — sem depender de imagem externa) ================= */
/* ================= TERRA 3D — TERRA HOLOGRÁFICA ================= */
function initEarth() {
  const container = document.getElementById('earthStage');
  if (!container || !window.THREE) return;

  const width = container.clientWidth || 300;
  const height = container.clientHeight || 300;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    38,
    width / height,
    0.1,
    100
  );

  camera.position.set(0, 0, 4.2);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 2)
  );

  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);

  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  /* ================= GRUPO DA TERRA ================= */

  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  /* ================= TEXTURA REAL DA TERRA ================= */

  const textureLoader = new THREE.TextureLoader();

  const earthTexture = textureLoader.load(
    '/static/assets/earth-map.jpg'
  );

  earthTexture.colorSpace = THREE.SRGBColorSpace;

  /*
   * Esfera principal.
   *
   * A textura mantém os continentes reconhecíveis,
   * enquanto a transparência transforma a aparência
   * em uma projeção holográfica.
   */
  const earthGeometry = new THREE.SphereGeometry(
    1.28,
    64,
    64
  );

  const earthMaterial = new THREE.MeshBasicMaterial({
    map: earthTexture,
    transparent: true,
    opacity: 0.72
  });

  const earth = new THREE.Mesh(
    earthGeometry,
    earthMaterial
  );

  earthGroup.add(earth);

  /* ================= CAMADA AZUL HOLOGRÁFICA ================= */

  const holoGeometry = new THREE.SphereGeometry(
    1.285,
    64,
    64
  );

  const holoMaterial = new THREE.MeshBasicMaterial({
    color: 0x5be3ff,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const holoEarth = new THREE.Mesh(
    holoGeometry,
    holoMaterial
  );

  earthGroup.add(holoEarth);

  /* ================= WIREFRAME ================= */

  const wireGeometry = new THREE.SphereGeometry(
    1.30,
    32,
    20
  );

  const wireMaterial = new THREE.MeshBasicMaterial({
    color: 0x5be3ff,
    wireframe: true,
    transparent: true,
    opacity: 0.20,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const wireEarth = new THREE.Mesh(
    wireGeometry,
    wireMaterial
  );

  earthGroup.add(wireEarth);

  /* ================= LATITUDE / LONGITUDE ================= */

  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0x5be3ff,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending
  });

  function criarLatitude(latitude) {
    const points = [];

    const lat = THREE.MathUtils.degToRad(latitude);

    const radius =
      Math.cos(lat) * 1.305;

    const y =
      Math.sin(lat) * 1.305;

    for (let i = 0; i <= 128; i++) {
      const angle =
        (i / 128) * Math.PI * 2;

      points.push(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          y,
          Math.sin(angle) * radius
        )
      );
    }

    const geometry =
      new THREE.BufferGeometry()
        .setFromPoints(points);

    return new THREE.Line(
      geometry,
      gridMaterial
    );
  }

  function criarLongitude(longitude) {
    const points = [];

    const lon =
      THREE.MathUtils.degToRad(longitude);

    for (let i = 0; i <= 64; i++) {
      const lat =
        -Math.PI / 2 +
        (i / 64) * Math.PI;

      const radius =
        Math.cos(lat);

      points.push(
        new THREE.Vector3(
          Math.cos(lon) *
            radius *
            1.305,

          Math.sin(lat) *
            1.305,

          Math.sin(lon) *
            radius *
            1.305
        )
      );
    }

    const geometry =
      new THREE.BufferGeometry()
        .setFromPoints(points);

    return new THREE.Line(
      geometry,
      gridMaterial
    );
  }

  /*
   * Linhas horizontais.
   */
  for (
    let lat = -75;
    lat <= 75;
    lat += 15
  ) {
    earthGroup.add(
      criarLatitude(lat)
    );
  }

  /*
   * Linhas verticais.
   */
  for (
    let lon = 0;
    lon < 180;
    lon += 15
  ) {
    earthGroup.add(
      criarLongitude(lon)
    );
  }

  /* ================= PONTOS HOLOGRÁFICOS ================= */

  /*
   * Pequenos pontos luminosos espalhados pela superfície.
   * Eles dão a sensação de que a Terra está sendo
   * reconstruída por dados.
   */

  const pointCount = 1200;

  const positions =
    new Float32Array(
      pointCount * 3
    );

  const pointColors =
    new Float32Array(
      pointCount * 3
    );

  for (
    let i = 0;
    i < pointCount;
    i++
  ) {
    const phi =
      Math.acos(
        1 - 2 * Math.random()
      );

    const theta =
      Math.random() *
      Math.PI *
      2;

    const radius = 1.315;

    const x =
      radius *
      Math.sin(phi) *
      Math.cos(theta);

    const y =
      radius *
      Math.cos(phi);

    const z =
      radius *
      Math.sin(phi) *
      Math.sin(theta);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const intensity =
      0.35 +
      Math.random() * 0.65;

    pointColors[i * 3] =
      0.36 * intensity;

    pointColors[i * 3 + 1] =
      0.89 * intensity;

    pointColors[i * 3 + 2] =
      1.0 * intensity;
  }

  const pointsGeometry =
    new THREE.BufferGeometry();

  pointsGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      positions,
      3
    )
  );

  pointsGeometry.setAttribute(
    'color',
    new THREE.BufferAttribute(
      pointColors,
      3
    )
  );

  const pointsMaterial =
    new THREE.PointsMaterial({
      size: 0.014,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

  const earthPoints =
    new THREE.Points(
      pointsGeometry,
      pointsMaterial
    );

  earthGroup.add(
    earthPoints
  );

  /* ================= ATMOSFERA ================= */

  const atmosphereGeometry =
    new THREE.SphereGeometry(
      1.39,
      64,
      64
    );

  const atmosphereMaterial =
    new THREE.MeshBasicMaterial({
      color: 0x5be3ff,
      transparent: true,
      opacity: 0.10,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

  const atmosphere =
    new THREE.Mesh(
      atmosphereGeometry,
      atmosphereMaterial
    );

  earthGroup.add(
    atmosphere
  );

  /* ================= ANÉIS ORBITAIS ================= */

  function criarAnel(
    radius,
    rotationX,
    rotationY,
    opacity
  ) {
    const geometry =
      new THREE.RingGeometry(
        radius,
        radius + 0.006,
        128
      );

    const material =
      new THREE.MeshBasicMaterial({
        color: 0x5be3ff,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

    const ring =
      new THREE.Mesh(
        geometry,
        material
      );

    ring.rotation.x =
      rotationX;

    ring.rotation.y =
      rotationY;

    earthGroup.add(ring);

    return ring;
  }

  const ring1 =
    criarAnel(
      1.63,
      Math.PI * 0.32,
      0.2,
      0.32
    );

  const ring2 =
    criarAnel(
      1.78,
      Math.PI * 0.68,
      -0.3,
      0.15
    );

  /* ================= PONTOS DE TELEMETRIA ================= */

  const markerGeometry =
    new THREE.SphereGeometry(
      0.024,
      12,
      12
    );

  const markerMaterial =
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

  const markers = [];

  for (
    let i = 0;
    i < 8;
    i++
  ) {
    const marker =
      new THREE.Mesh(
        markerGeometry,
        markerMaterial
      );

    const angle =
      (i / 8) *
      Math.PI *
      2;

    marker.position.set(
      Math.cos(angle) * 1.63,
      Math.sin(angle) * 0.45,
      Math.sin(angle) * 1.63
    );

    earthGroup.add(
      marker
    );

    markers.push(marker);
  }

  /* ================= CAMPO DE PARTÍCULAS ================= */

  const starCount = 350;

  const starPositions =
    new Float32Array(
      starCount * 3
    );

  for (
    let i = 0;
    i < starCount * 3;
    i += 3
  ) {
    const radius =
      2.1 +
      Math.random() * 2.8;

    const theta =
      Math.random() *
      Math.PI *
      2;

    const phi =
      Math.acos(
        2 * Math.random() - 1
      );

    starPositions[i] =
      radius *
      Math.sin(phi) *
      Math.cos(theta);

    starPositions[i + 1] =
      radius *
      Math.cos(phi);

    starPositions[i + 2] =
      radius *
      Math.sin(phi) *
      Math.sin(theta);
  }

  const starsGeometry =
    new THREE.BufferGeometry();

  starsGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      starPositions,
      3
    )
  );

  const starsMaterial =
    new THREE.PointsMaterial({
      color: 0x5be3ff,
      size: 0.012,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending
    });

  const stars =
    new THREE.Points(
      starsGeometry,
      starsMaterial
    );

  scene.add(stars);

  /* ================= ANEL DE SCAN ================= */

  const scanGeometry =
    new THREE.RingGeometry(
      1.315,
      1.335,
      128
    );

  const scanMaterial =
    new THREE.MeshBasicMaterial({
      color: 0x5be3ff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

  const scanRing =
    new THREE.Mesh(
      scanGeometry,
      scanMaterial
    );

  scanRing.rotation.x =
    Math.PI / 2;

  earthGroup.add(
    scanRing
  );

  /* ================= PULSO ================= */

  let pulse = 0;

  /* ================= VISIBILIDADE ================= */

  let ativo = true;

  document.addEventListener(
    'visibilitychange',
    () => {
      ativo = !document.hidden;
    }
  );

  /* ================= ANIMAÇÃO ================= */

  function animar() {
    requestAnimationFrame(
      animar
    );

    if (!ativo) return;

    const speed =
      0.0018 *
      animSpeedMult;

    /*
     * Rotação da Terra.
     */
    earthGroup.rotation.y +=
      speed;

    /*
     * Pequena rotação independente
     * da malha holográfica.
     */
    wireEarth.rotation.y +=
      speed * 0.35;

    holoEarth.rotation.y -=
      speed * 0.15;

    earthPoints.rotation.y +=
      speed * 0.5;

    /*
     * Anéis orbitais.
     */
    ring1.rotation.z +=
      0.0025 *
      animSpeedMult;

    ring2.rotation.z -=
      0.0012 *
      animSpeedMult;

    /*
     * Partículas.
     */
    stars.rotation.y -=
      0.0002 *
      animSpeedMult;

    /*
     * Scan.
     */
    scanRing.rotation.z +=
      0.008 *
      animSpeedMult;

    /*
     * Pulso da atmosfera.
     */
    pulse +=
      0.025 *
      animSpeedMult;

    atmosphereMaterial.opacity =
      0.075 +
      Math.sin(pulse) *
      0.025;

    /*
     * Pulso dos pontos.
     */
    pointsMaterial.opacity =
      0.48 +
      Math.sin(pulse * 0.7) *
      0.10;

    /*
     * Pequena oscilação nos marcadores.
     */
    markers.forEach(
      (marker, index) => {
        marker.scale.setScalar(
          1 +
            Math.sin(
              pulse * 2 +
              index
            ) *
            0.25
        );
      }
    );

    renderer.render(
      scene,
      camera
    );
  }

  animar();

  /* ================= RESIZE ================= */

  window.addEventListener(
    'resize',
    () => {
      const w =
        container.clientWidth ||
        300;

      const h =
        container.clientHeight ||
        300;

      camera.aspect =
        w / h;

      camera.updateProjectionMatrix();

      renderer.setSize(
        w,
        h
      );
    }
  );
}

/* ================= INICIALIZAÇÃO ================= */

if (window.THREE) {
  initEarth();
} else {
  window.addEventListener(
    'load',
    () => {
      if (window.THREE) {
        initEarth();
      } else {
        console.warn(
          'Three.js não carregou.'
        );
      }
    }
  );
}

if (window.THREE) initEarth();
else window.addEventListener('load', () => { if (window.THREE) initEarth(); else console.warn('three.js não carregou — verifique a conexão/CDN para exibir o globo 3D.'); });

/* ================= comando (texto) ================= */
const cmdInput = document.querySelector('.cmd-input');
const cmdInputBaseHeight = cmdInput.scrollHeight;
const sendBtn = document.getElementById('sendBtn');

function resetCmdInput() { cmdInput.value = ''; cmdInput.style.height = cmdInputBaseHeight + 'px'; }
function autoResizeCmdInput() { cmdInput.style.height = 'auto'; cmdInput.style.height = Math.min(cmdInput.scrollHeight, 120) + 'px'; }

/* -- autocomplete de slash commands -- */
const cmdAutocomplete = document.getElementById('cmdAutocomplete');
let acItens = [];
let acSelecionado = -1;

function fecharAutocomplete() {
  cmdAutocomplete.classList.remove('open');
  cmdAutocomplete.innerHTML = '';
  acItens = []; acSelecionado = -1;
}

function abrirAutocomplete(filtro) {
  const nomes = Object.keys(TOOLS_META).filter(n => n.startsWith(filtro));
  if (!nomes.length) { fecharAutocomplete(); return; }
  acItens = nomes;
  acSelecionado = 0;
  cmdAutocomplete.innerHTML = nomes.map((nome, i) => {
    const params = TOOLS_META[nome].params.map(p => p.req ? p.n : `[${p.n}]`).join(' ');
    return `<div class="cmd-ac-item${i === 0 ? ' selected' : ''}" data-nome="${nome}"><span class="ac-name">/${nome}</span><span class="ac-params">${params}</span></div>`;
  }).join('');
  cmdAutocomplete.classList.add('open');
  cmdAutocomplete.querySelectorAll('.cmd-ac-item').forEach(el => {
    el.addEventListener('mousedown', (e) => { e.preventDefault(); selecionarAutocomplete(el.dataset.nome); });
  });
}

function selecionarAutocomplete(nome) {
  const meta = TOOLS_META[nome];
  if (!meta) return;
  const params = meta.params.map(p => `${p.n}=`).join(' ');
  cmdInput.value = params ? `/${nome} ${params}` : `/${nome} `;
  fecharAutocomplete();
  autoResizeCmdInput();
  cmdInput.focus();
  const posIgual = cmdInput.value.indexOf('=');
  const posCursor = posIgual !== -1 ? posIgual + 1 : cmdInput.value.length;
  cmdInput.setSelectionRange(posCursor, posCursor);
}

function moverSelecaoAutocomplete(delta) {
  if (!acItens.length) return;
  acSelecionado = (acSelecionado + delta + acItens.length) % acItens.length;
  cmdAutocomplete.querySelectorAll('.cmd-ac-item').forEach((el, i) => el.classList.toggle('selected', i === acSelecionado));
  const ativo = cmdAutocomplete.children[acSelecionado];
  if (ativo) ativo.scrollIntoView({ block: 'nearest' });
}

function enviarComando(texto) {
  texto = (texto || '').trim();
  if (!texto) return;

  fecharAutocomplete();

  if (tratarSlashCommand(texto)) return;

  addTermLine('user', texto);
  resetCmdInput();

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    setEstado('offline');
    return;
  }

  ws.send(JSON.stringify({
    type: 'command',
    text: texto
  }));
}

cmdInput.addEventListener('input', () => {
  autoResizeCmdInput();
  const texto = cmdInput.value;
  if (texto.startsWith('/') && !texto.slice(1).includes(' ')) {
    abrirAutocomplete(texto.slice(1));
  } else {
    fecharAutocomplete();
  }
});

cmdInput.addEventListener('keydown', (e) => {
  if (cmdAutocomplete.classList.contains('open')) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moverSelecaoAutocomplete(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moverSelecaoAutocomplete(-1); return; }
    if (e.key === 'Tab') { e.preventDefault(); selecionarAutocomplete(acItens[acSelecionado]); return; }
    if (e.key === 'Escape') { e.preventDefault(); fecharAutocomplete(); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviarComando(cmdInput.value);
  }
});

sendBtn.addEventListener('click', () => enviarComando(cmdInput.value));

document.addEventListener('click', (e) => {
  if (cmdAutocomplete.classList.contains('open') && !cmdAutocomplete.contains(e.target) && e.target !== cmdInput) {
    fecharAutocomplete();
  }
});

/* ================= simulação visual (show_simulation) =================
   Recebe 'simulation_board' (abre o overlay), depois OU:
     - 'simulation_scene' (modo física — cena única, o navegador anima
       sozinho via requestAnimationFrame, calculando a posição de cada
       objeto a partir do seu `movimento`), OU
     - um ou mais 'simulation_frame' (modo cenas — igual ao quadro de
       raciocínio: cada frame é o estado completo daquele instante,
       narrado em sequência pelo backend). */
const simOverlay = document.getElementById('simOverlay');
const simTitle = document.getElementById('simTitle');
const simSvg = document.getElementById('simSvg');
const simCaption = document.getElementById('simCaption');
const simCloseBtn = document.getElementById('simClose');
const simPlayBtn = document.getElementById('simPlayBtn');
const simRestartBtn = document.getElementById('simRestartBtn');
const simSpeedRange = document.getElementById('simSpeedRange');

let simState = {
  objetos: [],
  duracao: 8,
  loop: true,
  velocidade: 1,
  t0: 0,
  pausadoEm: null,
  rafId: null,
  trilhas: {},
};

function abrirSimulacao(titulo) {
  simSvg.innerHTML = '';
  simCaption.textContent = '';
  simTitle.textContent = titulo || 'Simulação';
  simOverlay.classList.add('open');
  tocarSom('toggle');
  addLogEvent('info', `Simulação: ${titulo || ''}`);
}
function fecharSimulacao() {
  simOverlay.classList.remove('open');
  cancelAnimationFrame(simState.rafId);
}
simCloseBtn.addEventListener('click', fecharSimulacao);
simOverlay.addEventListener('click', (e) => { if (e.target === simOverlay) fecharSimulacao(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && simOverlay.classList.contains('open')) fecharSimulacao();
});

/* ---- fórmulas de movimento (espaço normalizado 0-100, t em segundos) ---- */
const SIM_FORMULAS = {
  // params: x0, y0, v0, angulo (graus), g
  projetil(p, t) {
    const ang = (p.angulo ?? 45) * Math.PI / 180;
    const v0 = p.v0 ?? 30, g = p.g ?? 20;
    const x = (p.x0 ?? 10) + v0 * Math.cos(ang) * t;
    const h = v0 * Math.sin(ang) * t - 0.5 * g * t * t;
    return { x, y: (p.y0 ?? 90) - Math.max(h, 0), ativo: h >= 0 };
  },
  // params: x0, y0, vx, vy, quicar(bool), min, max
  linear(p, t) {
    let x = (p.x0 ?? 10) + (p.vx ?? 5) * t;
    const y = (p.y0 ?? 50) + (p.vy ?? 0) * t;
    if (p.quicar) {
      const lo = p.min ?? 0, hi = p.max ?? 100, range = hi - lo;
      const rel = Math.abs(((x - lo) % (2 * range) + 2 * range) % (2 * range));
      x = lo + (rel > range ? 2 * range - rel : rel);
    }
    return { x, y, ativo: true };
  },
  // movimento harmônico simples — params: x0, y0, amplitude, periodo, fase, eixo('x'|'y')
  mhs(p, t) {
    const osc = (p.amplitude ?? 20) * Math.sin((2 * Math.PI * t / (p.periodo ?? 2)) + (p.fase ?? 0));
    const eixo = p.eixo || 'x';
    return { x: (p.x0 ?? 50) + (eixo === 'x' ? osc : 0), y: (p.y0 ?? 50) + (eixo === 'y' ? osc : 0), ativo: true };
  },
  // pêndulo — params: pivoX, pivoY, comprimento, amplitude(graus), periodo, fase
  pendulo(p, t) {
    const ang = ((p.amplitude ?? 30) * Math.PI / 180) * Math.sin((2 * Math.PI * t / (p.periodo ?? 2)) + (p.fase ?? 0));
    const comp = p.comprimento ?? 35;
    return { x: (p.pivoX ?? 50) + comp * Math.sin(ang), y: (p.pivoY ?? 15) + comp * Math.cos(ang), ativo: true };
  },
  // órbita circular — params: cx, cy, raio, periodo, fase
  orbital(p, t) {
    const ang = (2 * Math.PI * t / (p.periodo ?? 6)) + (p.fase ?? 0);
    return { x: (p.cx ?? 50) + (p.raio ?? 30) * Math.cos(ang), y: (p.cy ?? 50) + (p.raio ?? 30) * Math.sin(ang), ativo: true };
  },
  // oscilação amortecida (mola) — params: x0, y0, amplitude, periodo, amortecimento, eixo
  mola(p, t) {
    const osc = (p.amplitude ?? 20) * Math.exp(-(p.amortecimento ?? 0.3) * t) * Math.sin(2 * Math.PI * t / (p.periodo ?? 1.2));
    const eixo = p.eixo || 'y';
    return { x: (p.x0 ?? 50) + (eixo === 'x' ? osc : 0), y: (p.y0 ?? 20) + (eixo === 'y' ? osc : 0), ativo: true };
  },
};

// onda: gera uma polyline inteira (não é um ponto só) — params: x_inicio, x_fim, y_base,
// amplitude, comprimento_onda, periodo, n_pontos
function calcularOnda(p, t) {
  const n = p.n_pontos ?? 40;
  const xi = p.x_inicio ?? 5, xf = p.x_fim ?? 95;
  const amp = p.amplitude ?? 12, comp = p.comprimento_onda ?? 20, T = p.periodo ?? 2;
  const yBase = p.y_base ?? 50;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = xi + (xf - xi) * (i / n);
    const y = yBase + amp * Math.sin((2 * Math.PI * (x - xi) / comp) - (2 * Math.PI * t / T));
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

function calcularPosicao(obj, t) {
  const mov = obj.movimento;
  if (!mov) return { x: obj.x, y: obj.y, ativo: true };
  const fn = SIM_FORMULAS[mov.tipo];
  return fn ? fn(mov.params || {}, t) : { x: obj.x, y: obj.y, ativo: true };
}

const SIM_COR_PADRAO = { circulo: 'var(--cyan)', retangulo: 'var(--amber)', texto: 'var(--cyan)', onda: 'var(--cyan)', linha: 'var(--cyan-dim)' };

function construirElementoSVG(obj) {
  const ns = 'http://www.w3.org/2000/svg';
  const cor = obj.cor || SIM_COR_PADRAO[obj.tipo] || 'var(--cyan)';
  let el;
  switch (obj.tipo) {
    case 'circulo':
      el = document.createElementNS(ns, 'circle');
      el.setAttribute('r', obj.raio ?? 3);
      el.setAttribute('fill', 'rgba(5,12,16,0.85)');
      el.setAttribute('stroke', cor);
      el.setAttribute('stroke-width', 0.6);
      break;
    case 'retangulo':
      el = document.createElementNS(ns, 'rect');
      el.setAttribute('width', obj.largura ?? 8);
      el.setAttribute('height', obj.altura ?? 8);
      el.setAttribute('fill', 'rgba(5,12,16,0.85)');
      el.setAttribute('stroke', cor);
      el.setAttribute('stroke-width', 0.6);
      break;
    case 'browser_screenshot':
        atualizarNavegacaoAoVivo(evento.titulo, evento.url, evento.imagem_base64);
        break;
      case 'texto':
      el = document.createElementNS(ns, 'text');
      el.setAttribute('text-anchor', 'middle');
      el.setAttribute('font-size', obj.tamanhoFonte ?? 3);
      el.setAttribute('fill', cor);
      el.setAttribute('font-family', 'var(--mono)');
      el.textContent = obj.rotulo || '';
      break;
    case 'onda':
      el = document.createElementNS(ns, 'polyline');
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', cor);
      el.setAttribute('stroke-width', 0.6);
      break;
    case 'linha':
      el = document.createElementNS(ns, 'line');
      el.setAttribute('stroke', cor);
      el.setAttribute('stroke-width', 0.5);
      el.setAttribute('x1', obj.x1 ?? obj.x); el.setAttribute('y1', obj.y1 ?? obj.y);
      el.setAttribute('x2', obj.x2 ?? obj.x); el.setAttribute('y2', obj.y2 ?? obj.y);
      break;
    default:
      el = document.createElementNS(ns, 'circle');
      el.setAttribute('r', 3);
      el.setAttribute('fill', cor);
  }
  el.dataset.id = obj.id;
  return el;
}

function posicionarElementoEstatico(el, obj) {
  if (el.tagName === 'circle') { el.setAttribute('cx', obj.x); el.setAttribute('cy', obj.y); }
  else if (el.tagName === 'rect') { el.setAttribute('x', obj.x - (obj.largura ?? 8) / 2); el.setAttribute('y', obj.y - (obj.altura ?? 8) / 2); }
  else if (el.tagName === 'text') { el.setAttribute('x', obj.x); el.setAttribute('y', obj.y); }
}

/* ---- MODO CENAS: um frame estático por vez (backend narra e manda cada passo) ---- */
function renderQuadroSimEstatico(objetos, anotacao) {
  cancelAnimationFrame(simState.rafId);
  simSvg.innerHTML = '';
  simCaption.textContent = anotacao || '';
  (objetos || []).forEach(obj => {
    const el = construirElementoSVG(obj);
    posicionarElementoEstatico(el, obj);
    simSvg.appendChild(el);
  });
}

/* ---- MODO FÍSICA: animação contínua calculada no navegador ---- */
function iniciarCenaFisica(dados) {
  cancelAnimationFrame(simState.rafId);
  simSvg.innerHTML = '';
  simCaption.textContent = dados.anotacao || '';

  simState = {
    objetos: dados.objetos || [],
    duracao: dados.duracao ?? 8,
    loop: dados.loop !== false,
    velocidade: dados.velocidade ?? 1,
    t0: performance.now(),
    pausadoEm: null,
    rafId: null,
    trilhas: {},
  };

  // rastros primeiro, pra ficarem atrás dos objetos
  simState.objetos.forEach(obj => {
    if (obj.rastro) {
      const trilha = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      trilha.setAttribute('fill', 'none');
      trilha.setAttribute('stroke', obj.cor || 'var(--cyan)');
      trilha.setAttribute('stroke-width', 0.3);
      trilha.setAttribute('opacity', 0.4);
      trilha.dataset.trilhaDe = obj.id;
      simSvg.appendChild(trilha);
      simState.trilhas[obj.id] = [];
    }
  });

  simState.objetos.forEach(obj => simSvg.appendChild(construirElementoSVG(obj)));
  simPlayBtn.textContent = 'PAUSAR';
  loopSimulacao();
}

function loopSimulacao(agora) {
  agora = agora ?? performance.now();
  let t = ((agora - simState.t0) / 1000) * simState.velocidade;
  if (simState.duracao > 0) {
    t = simState.loop ? (t % simState.duracao) : Math.min(t, simState.duracao);
  }

  simState.objetos.forEach(obj => {
    const el = simSvg.querySelector(`[data-id="${obj.id}"]`);
    if (!el) return;

    if (obj.movimento?.tipo === 'onda') {
      el.setAttribute('points', calcularOnda(obj.movimento.params || {}, t));
      return;
    }

    const { x, y, ativo } = calcularPosicao(obj, t);
    el.style.opacity = ativo ? 1 : 0.25;
    if (el.tagName === 'circle') { el.setAttribute('cx', x); el.setAttribute('cy', y); }
    else if (el.tagName === 'rect') { el.setAttribute('x', x - (obj.largura ?? 8) / 2); el.setAttribute('y', y - (obj.altura ?? 8) / 2); }
    else if (el.tagName === 'text') { el.setAttribute('x', x); el.setAttribute('y', y); }

    if (obj.rastro) {
      const trilha = simState.trilhas[obj.id];
      trilha.push({ x, y });
      if (trilha.length > (obj.rastroTamanho ?? 40)) trilha.shift();
      const trilhaEl = simSvg.querySelector(`[data-trilha-de="${obj.id}"]`);
      if (trilhaEl) trilhaEl.setAttribute('points', trilha.map(p => `${p.x},${p.y}`).join(' '));
    }
  });

  if (simState.pausadoEm === null) simState.rafId = requestAnimationFrame(loopSimulacao);
}

/* ---- controles ---- */
simPlayBtn.addEventListener('click', () => {
  if (simState.pausadoEm === null) {
    simState.pausadoEm = performance.now();
    cancelAnimationFrame(simState.rafId);
    simPlayBtn.textContent = 'RETOMAR';
  } else {
    simState.t0 += performance.now() - simState.pausadoEm;
    simState.pausadoEm = null;
    simPlayBtn.textContent = 'PAUSAR';
    loopSimulacao();
  }
});
simRestartBtn.addEventListener('click', () => {
  simState.t0 = performance.now();
  if (simState.pausadoEm !== null) simState.pausadoEm = performance.now();
});
simSpeedRange.addEventListener('input', () => { simState.velocidade = parseFloat(simSpeedRange.value); });

/* ================= microfone real (sincronizado com o backend) =================
   O botão não usa mais a SpeechRecognition do navegador — ele liga/desliga
   o microfone FÍSICO que o backend escuta continuamente (mic_listener.py +
   Whisper). O visual só muda quando o servidor confirma via 'mic_state'
   (seja por clique no botão, por outra aba, ou pela tool toggle_microphone
   chamada por voz/texto), então nunca fica dessincronizado do hardware. */
let microfoneAtivo = true; // valor otimista até chegar o primeiro 'mic_state'

function aplicarEstadoMicrofone(ativo) {
  microfoneAtivo = ativo;
  micBtn.classList.toggle('active', ativo);
  micBtn.classList.toggle('muted', !ativo);
  micBtn.title = ativo
    ? 'Microfone ligado — clique para desligar'
    : 'Microfone desligado — clique para ligar';
}
aplicarEstadoMicrofone(true);

micBtn.addEventListener('click', () => {
  tocarSom('mic');
  if (!ws || ws.readyState !== WebSocket.OPEN) { setEstado('offline'); return; }
  ws.send(JSON.stringify({ type: 'mic_toggle', ativo: !microfoneAtivo }));
});
/* ================= websocket ================= */
let ws = null; let primeiraConexao = true;
function conectar() {
  const t0 = Date.now();
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => {
    tagLink.textContent = (Date.now() - t0) + 'ms';
    setEstado('idle'); setSubsystem('websocket', true, false);
    if (!primeiraConexao) tocarSom('online');
    primeiraConexao = false;
  };
  ws.onclose = () => { setEstado('offline'); setTimeout(conectar, 2000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (msg) => {
    let evento; try { evento = JSON.parse(msg.data); } catch { return; }
    switch (evento.type) {
      case 'log': addTermLine(evento.role, evento.text); if (evento.confidence) tagConf.textContent = evento.confidence.toUpperCase(); break;
      case 'status': setEstado(evento.state); if (evento.state === 'thinking') setSubsystem('processamento', true, true); break;
      case 'memory': setSubsystem('memoria', true, true); break;
      case 'stats':
        if (evento.ctx_pct !== undefined) tagCtx.textContent = Math.round(evento.ctx_pct) + '%';
        break;
      
        case 'mic_state':
        aplicarEstadoMicrofone(evento.ativo);
        addLogEvent('info', evento.ativo ? 'Microfone ativado' : 'Microfone desativado');
        break;
      case 'voice_stats':
        setSubsystem('voz', true, true);
        break;
      case 'weather':
        // opcional: se o backend também chamar get_weather (ex: via comando de voz),
        // o painel de clima é atualizado com o resultado dela também.
        aplicarClima({
          temp: evento.temp,
          sensacao: evento.sensacao,
          umidade: evento.umidade,
          vento: evento.vento,
          min: evento.min,
          max: evento.max,
          condTexto: evento.condicao,
          icone: ICON_POR_CATEGORIA[evento.icone] || 'thermometer',
          local: evento.local,
        });
        break;
      case 'browser_navigate':
        abrirMedia(evento.url, evento.titulo, evento.url_externo, evento.bloqueado);
        break;
      case 'reasoning_board':
        abrirQuadroRaciocinio(evento.titulo);
        break;
      case 'reasoning_frame':
        renderQuadroRaciocinio(evento.nos, evento.conexoes, evento.anotacao);
        break;
      case 'simulation_board':
        abrirSimulacao(evento.titulo);
        break;
      case 'simulation_scene':
        iniciarCenaFisica(evento);
        break;
      case 'simulation_frame':
        renderQuadroSimEstatico(evento.objetos, evento.anotacao);
        break;
      case 'event': addLogEvent(evento.level || 'info', evento.text); break;
      case 'notification': notify(evento.text, evento.level || 'info'); break;
      case 'subsystem': setSubsystem(evento.name, evento.active, !evento.persist); break;
      case 'tool_exec':
        setSubsystem('ferramentas', true, true);
        addLogEvent(evento.status === 'error' ? 'error' : 'info', `${evento.name}: ${evento.status || 'em curso'}`);
        if (evento.status === 'error') { tocarSom('alert'); notify(`Falha na ferramenta "${evento.name}"`, 'warning'); }
        break;
      case 'tool_result':
        setEstado('idle');
        addTermLine('system', `[${evento.name}] ${formatarResultadoFerramenta(evento)}`);
        addLogEvent(evento.success === false ? 'error' : 'info', `${evento.name} concluída`);
        if (evento.success === false) { tocarSom('alert'); notify(`"${evento.name}" falhou`, 'warning'); }
        break;
    }
  };
}
conectar();