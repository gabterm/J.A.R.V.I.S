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
      await new Promise(r => setTimeout(r, 220));
    }
    await new Promise(r => setTimeout(r, 250));
    bootOverlay.classList.add('hidden');
    tocarSom('boot');
    addEvent('sistema', 'Interface inicializada');
  }
  runBoot();

  let animSpeedMult = 1;

  const canvas = document.getElementById('bgCanvas');
  const ctx2d = canvas.getContext('2d');
  let particles = [];
  function resizeCanvas() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const count = Math.floor((canvas.width * canvas.height) / 26000);
    particles = Array.from({ length: count }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.2 + 0.3, vy: Math.random() * 0.12 + 0.03, a: Math.random() * 0.5 + 0.15 }));
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  function getCyanRgb() { return getComputedStyle(document.body).getPropertyValue('--cyan-rgb').trim() || '70, 230, 255'; }
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

  const coreStage = document.getElementById('coreStage');
  const coreCanvas = document.getElementById('coreParticles');
  const coreCtx = coreCanvas.getContext('2d');
  const CORE_SIZE = 148;
  coreCanvas.width = CORE_SIZE; coreCanvas.height = CORE_SIZE;
  let coreMode = 'idle';
  let coreParticles = Array.from({ length: 22 }, () => ({ angle: Math.random() * Math.PI * 2, radius: 20 + Math.random() * 50, speed: 0.35 + Math.random() * 0.45, alpha: 0.5 + Math.random() * 0.4 }));

  function setCoreMode(mode) {
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


  const wordmark = document.getElementById('wordmark');
  setInterval(() => { wordmark.classList.add('glitch'); setTimeout(() => wordmark.classList.remove('glitch'), 400); }, 14000 + Math.random() * 6000);

  const telSync = document.getElementById('telSync');
  const telNode = document.getElementById('telNode');
  setInterval(() => {
    telSync.textContent = (Math.random() * 20 + 80).toFixed(1);
    telNode.textContent = '0x' + Math.floor(Math.random() * 65535).toString(16).padStart(4, '0').toUpperCase();
  }, 1400);

  function tick() { document.getElementById('clock').textContent = new Date().toLocaleTimeString('pt-BR'); }
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

  const settingsToggle = document.getElementById('settingsToggle');
  const settingsDrawer = document.getElementById('settingsDrawer');
  const minimalSwitch = document.getElementById('minimalSwitch');

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
    animSpeedMult = nivel === 'low' ? 0.5 : (nivel === 'high' ? 1.8 : 1);
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
  minimalSwitch.addEventListener('click', () => {
    minimalOn = !minimalOn;
    minimalSwitch.classList.toggle('on', minimalOn);
    document.body.classList.toggle('minimal', minimalOn);
    tocarSom('toggle');
    addEvent('sistema', minimalOn ? 'Modo minimalista ativado' : 'Modo minimalista desativado');
  });

  const micBtn = document.getElementById('micBtn');
  const coreStatus = document.getElementById('coreStatus');
  const log = document.getElementById('log');
  const voiceToggle = document.getElementById('voiceToggle');
  const voiceValue = document.getElementById('voiceValue');
  const soundToggle = document.getElementById('soundToggle');
  const soundValue = document.getElementById('soundValue');
  const exportBtn = document.getElementById('exportBtn');
  const statusPillText = document.getElementById('statusPillText');

  const ESTADOS = { idle: 'AGUARDANDO COMANDO', thinking: 'PROCESSANDO', speaking: 'FALANDO', listening: 'OUVINDO', alert: 'ALERTA', offline: 'DESCONECTADO' };

  function setEstado(estado) {
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

  const tabRegistro = document.getElementById('tabRegistro');
  const tabInvestigacao = document.getElementById('tabInvestigacao');
  const tabTatica = document.getElementById('tabTatica');
  const logPanel = document.getElementById('logPanel');
  const investigationPanel = document.getElementById('investigationPanel');
  const tacticalPanel = document.getElementById('tacticalPanel');
  const invAlertDot = document.getElementById('invAlertDot');
  const tacticalAlertDot = document.getElementById('tacticalAlertDot');

  function showTab(tab) {
    tabRegistro.classList.toggle('active', tab === 'registro');
    tabInvestigacao.classList.toggle('active', tab === 'investigacao');
    tabTatica.classList.toggle('active', tab === 'tatica');
    logPanel.classList.toggle('hidden-tab', tab !== 'registro');
    investigationPanel.classList.toggle('visible', tab === 'investigacao');
    tacticalPanel.classList.toggle('visible', tab === 'tatica');
    if (tab === 'investigacao') invAlertDot.style.display = 'none';
    if (tab === 'tatica') tacticalAlertDot.style.display = 'none';
  }
  tabRegistro.addEventListener('click', () => { showTab('registro'); tocarSom('toggle'); });
  tabInvestigacao.addEventListener('click', () => { showTab('investigacao'); tocarSom('toggle'); });
  tabTatica.addEventListener('click', () => { showTab('tatica'); tocarSom('toggle'); });

  function renderList(html) {
    if (Array.isArray(html)) return '<ul>' + html.map(i => `<li>${i}</li>`).join('') + '</ul>';
    return `<p style="margin:0">${html || '—'}</p>`;
  }

  function abrirInvestigacao(dados) {
    document.getElementById('invEmpty').style.display = 'none';
    document.getElementById('invGrid').style.display = 'grid';
    document.getElementById('invQuestao').innerHTML = renderList(dados.questao);
    document.getElementById('invEvidencias').innerHTML = renderList(dados.evidencias);
    document.getElementById('invHipoteses').innerHTML = renderList(dados.hipoteses);
    document.getElementById('invConclusao').innerHTML = renderList(dados.conclusao);
    document.getElementById('invMeta').textContent = dados.meta || '';
    if (!investigationPanel.classList.contains('visible')) invAlertDot.style.display = 'inline-block';
    addEvent('investigacao', 'Nova investigação registrada');
  }

  /* ================= quadro tático de futebol ================= */
  let tacticalFrames = [];
  let tacticalIndex = 0;
  let tacticalPlaying = false;
  let tacticalTimer = null;
  let tacticalScale = null; // { minX, minY, sx, sy } — mapeia coordenadas recebidas para o viewBox do campo

  const PITCH_W = 100, PITCH_H = 64;
  const PITCH_PAD_X = 4, PITCH_PAD_Y = 4; // margem interna para não colar jogadores na borda

  const tacticalPlayersGroup = document.getElementById('tacticalPlayers');
  const tacticalArrowsGroup = document.getElementById('tacticalArrows');
  const tacticalBallEl = document.getElementById('tacticalBall');
  const tacticalAnnotationEl = document.getElementById('tacticalAnnotation');
  const tacticalFrameCounterEl = document.getElementById('tacticalFrameCounter');
  const tacticalPrevBtn = document.getElementById('tacticalPrevBtn');
  const tacticalPlayBtn = document.getElementById('tacticalPlayBtn');
  const tacticalNextBtn = document.getElementById('tacticalNextBtn');

  function computeTacticalScale(frames) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    frames.forEach(frame => {
      (frame.jogadores || []).forEach(j => {
        if (typeof j.x === 'number' && typeof j.y === 'number') {
          minX = Math.min(minX, j.x); maxX = Math.max(maxX, j.x);
          minY = Math.min(minY, j.y); maxY = Math.max(maxY, j.y);
        }
      });
      if (frame.bola && typeof frame.bola.x === 'number' && typeof frame.bola.y === 'number') {
        minX = Math.min(minX, frame.bola.x); maxX = Math.max(maxX, frame.bola.x);
        minY = Math.min(minY, frame.bola.y); maxY = Math.max(maxY, frame.bola.y);
      }
    });

    if (!isFinite(minX) || !isFinite(minY)) return null;

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const jaNoEspacoEsperado = minX >= -1 && maxX <= PITCH_W + 1 && minY >= -1 && maxY <= PITCH_H + 1 && (rangeX > PITCH_W * 0.3 || rangeY > PITCH_H * 0.3);
    if (jaNoEspacoEsperado) return null;

    return {
      minX, minY,
      sx: (PITCH_W - PITCH_PAD_X * 2) / rangeX,
      sy: (PITCH_H - PITCH_PAD_Y * 2) / rangeY
    };
  }

  function mapTacticalCoord(x, y) {
    if (!tacticalScale) return { x, y };
    return {
      x: PITCH_PAD_X + (x - tacticalScale.minX) * tacticalScale.sx,
      y: PITCH_PAD_Y + (y - tacticalScale.minY) * tacticalScale.sy
    };
  }

  function renderTacticalFrame(idx) {
    const frame = tacticalFrames[idx];
    if (!frame) return;

    const existentes = {};
    tacticalPlayersGroup.querySelectorAll('.tp-player').forEach(el => existentes[el.dataset.key] = el);
    const vistos = new Set();

    (frame.jogadores || []).forEach(j => {
      const key = `${j.time}-${j.num}`;
      vistos.add(key);
      const pos = mapTacticalCoord(j.x, j.y);
      let el = existentes[key];
      if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        el.classList.add('tp-player', j.time === 'casa' ? 'tp-casa' : 'tp-visitante');
        el.dataset.key = key;
        el.innerHTML = `<circle></circle><text>${j.num}</text>`;
        tacticalPlayersGroup.appendChild(el);
      }
      el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    });

    Object.entries(existentes).forEach(([key, el]) => { if (!vistos.has(key)) el.remove(); });

    if (frame.bola) {
      const bolaPos = mapTacticalCoord(frame.bola.x, frame.bola.y);
      tacticalBallEl.style.transform = `translate(${bolaPos.x}px, ${bolaPos.y}px)`;
    }

    tacticalArrowsGroup.innerHTML = '';
    (frame.setas || []).forEach(s => {
      const de = mapTacticalCoord(s.de.x, s.de.y);
      const para = mapTacticalCoord(s.para.x, s.para.y);
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      arrow.setAttribute('x1', de.x); arrow.setAttribute('y1', de.y);
      arrow.setAttribute('x2', para.x); arrow.setAttribute('y2', para.y);
      arrow.setAttribute('marker-end', 'url(#arrowHead)');
      arrow.classList.add('tp-arrow', 'arrow-' + (s.tipo || 'passe'));
      tacticalArrowsGroup.appendChild(arrow);
    });

    tacticalAnnotationEl.textContent = frame.anotacao || '';
    tacticalFrameCounterEl.textContent = `${idx + 1} / ${tacticalFrames.length}`;
    tacticalPrevBtn.disabled = idx === 0;
    tacticalNextBtn.disabled = idx === tacticalFrames.length - 1;
  }

  function pauseTactical() {
    tacticalPlaying = false;
    clearInterval(tacticalTimer);
    tacticalPlayBtn.textContent = '▶';
  }

  function playTactical() {
    if (tacticalFrames.length <= 1) return;
    tacticalPlaying = true;
    tacticalPlayBtn.textContent = '⏸';
    tacticalTimer = setInterval(() => {
      tacticalIndex++;
      if (tacticalIndex >= tacticalFrames.length) { pauseTactical(); tacticalIndex = tacticalFrames.length - 1; return; }
      renderTacticalFrame(tacticalIndex);
    }, 1500);
  }

  tacticalPlayBtn.addEventListener('click', () => { tacticalPlaying ? pauseTactical() : playTactical(); tocarSom('toggle'); });
  tacticalPrevBtn.addEventListener('click', () => { pauseTactical(); tacticalIndex = Math.max(0, tacticalIndex - 1); renderTacticalFrame(tacticalIndex); });
  tacticalNextBtn.addEventListener('click', () => { pauseTactical(); tacticalIndex = Math.min(tacticalFrames.length - 1, tacticalIndex + 1); renderTacticalFrame(tacticalIndex); });

  function abrirQuadroTatico(dados) {
    tacticalFrames = dados.quadros || [];
    tacticalIndex = 0;
    tacticalScale = computeTacticalScale(tacticalFrames);
    document.getElementById('tacticalTitle').textContent = dados.titulo || '';
    document.getElementById('tacticalFormacoes').textContent =
      [dados.formacao_casa, dados.formacao_visitante].filter(Boolean).join(' vs ');
    document.getElementById('tacticalEmpty').style.display = 'none';
    document.getElementById('tacticalBoard').style.display = 'flex';
    tacticalPlayersGroup.innerHTML = '';
    renderTacticalFrame(0);
    pauseTactical();
    if (!tacticalPanel.classList.contains('visible')) tacticalAlertDot.style.display = 'inline-block';
    addEvent('tatica', `Novo quadro tático: ${dados.titulo}`);
  }

  function typewriter(el, textoHtml) {
    const tmp = document.createElement('div'); tmp.innerHTML = textoHtml;
    const textoLimpo = tmp.textContent;
    el.textContent = '';
    const cursor = document.createElement('span'); cursor.className = 'type-cursor';
    el.appendChild(cursor);
    let i = 0; const speed = 16;
    (function passo() {
      if (i < textoLimpo.length) { cursor.insertAdjacentText('beforebegin', textoLimpo[i]); i++; setTimeout(passo, speed); }
      else cursor.remove();
    })();
  }

  function addLogLine(role, text, speech, confidence) {
    const empty = document.getElementById('logEmpty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    const cls = role === 'user' ? 'user' : (role === 'system' ? 'system' : 'jarvis');
    div.className = `log-line ${cls}`;
    const tag = role === 'user' ? 'Gabriel' : (role === 'system' ? 'SISTEMA' : 'JARVIS');
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const badge = (cls === 'jarvis' && confidence) ? `<span class="confidence-badge ${confidence}">${confidence}</span>` : '';

    if (cls === 'jarvis') {
      div.innerHTML = `<div class="tag-row"><span class="tag-left"><span class="tag">${tag}</span>${badge}</span><span class="time">${time}</span></div><span class="msg-text"></span>`;
      log.appendChild(div);
      typewriter(div.querySelector('.msg-text'), text);
    } else {
      div.innerHTML = `<div class="tag-row"><span class="tag-left"><span class="tag">${tag}</span></span><span class="time">${time}</span></div>${text}`;
      log.appendChild(div);
    }

    log.scrollTop = log.scrollHeight;
    while (log.children.length > 40) log.removeChild(log.firstChild);

    if (role === 'user') {
      tocarSom('envio'); addEvent('comando', 'Comando recebido');
    } else if (role !== 'system') {
      tocarSom('recebido'); addEvent('resposta', 'Resposta gerada');
      falar(speech || text);
    }
  }

  const eventsList = document.getElementById('eventsList');
  const eventsCount = document.getElementById('eventsCount');
  let totalEventos = 0;
  function addEvent(categoria, texto) {
    const empty = eventsList.querySelector('.feed-empty'); if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'feed-item';
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    div.innerHTML = `<div class="fi-top"><span class="fi-label">${texto}</span><span class="fi-time">${time}</span></div>`;
    eventsList.prepend(div);
    while (eventsList.children.length > 30) eventsList.removeChild(eventsList.lastChild);
    totalEventos++; eventsCount.textContent = totalEventos;
  }

  const toolsList = document.getElementById('toolsList');
  const toolsCount = document.getElementById('toolsCount');
  let totalTools = 0;
  function addToolExec({ name, status = 'running', result = '', time }) {
    const empty = toolsList.querySelector('.feed-empty'); if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = `feed-item tool status-${status}`;
    const hora = time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const statusLabel = status === 'running' ? 'EM CURSO' : (status === 'success' ? 'OK' : 'ERRO');
    div.innerHTML = `<div class="fi-top"><span class="fi-label">${name}</span><span class="fi-status">${statusLabel}</span></div>${result ? `<div class="fi-result">${result}</div>` : ''}<div class="fi-time">${hora}</div>`;
    toolsList.prepend(div);
    while (toolsList.children.length > 30) toolsList.removeChild(toolsList.lastChild);
    totalTools++; toolsCount.textContent = totalTools;
    setSubsystem('ferramentas', true, true);
    if (status === 'error') { tocarSom('alert'); notify(`Falha na ferramenta "${name}"`, 'warning'); }
  }

  /* ================= timeline de contexto ================= */
  const timelineList = document.getElementById('timelineList');
  const timelineCount = document.getElementById('timelineCount');
  let timelineItems = [];
  function renderTimeline() {
    timelineList.innerHTML = '';
    if (timelineItems.length === 0) { timelineList.innerHTML = '<div class="feed-empty">sem eventos de contexto</div>'; timelineCount.textContent = 0; return; }
    const ordenado = [...timelineItems].sort((a, b) => (b.pinned === true) - (a.pinned === true));
    ordenado.forEach(item => {
      const div = document.createElement('div');
      div.className = 'tl-item' + (item.pinned ? ' pinned' : '');
      div.innerHTML = `
        <div class="tl-top">
          <span class="tl-tag">${item.tipo || 'evento'}</span>
          <div class="tl-actions">
            <button class="pin-btn${item.pinned ? ' active' : ''}" title="Fixar">📌</button>
            <button class="del-btn" title="Remover">✕</button>
          </div>
        </div>
        <div class="tl-text">${item.text}</div>`;
      div.querySelector('.pin-btn').addEventListener('click', () => { item.pinned = !item.pinned; renderTimeline(); sendTimelineAction(item.id, item.pinned ? 'pin' : 'unpin'); tocarSom('toggle'); });
      div.querySelector('.del-btn').addEventListener('click', () => { timelineItems = timelineItems.filter(i => i.id !== item.id); renderTimeline(); sendTimelineAction(item.id, 'remove'); tocarSom('toggle'); });
      timelineList.appendChild(div);
    });
    timelineCount.textContent = timelineItems.length;
  }
  function sendTimelineAction(id, action) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'timeline_action', id, action }));
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

  let somAtivo = true; let audioCtx = null;
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
      case 'offline': beep({ freq: 320, dur: 0.16, type: 'sawtooth', glideTo: 140, vol: 0.09 }); beep({ freq: 300, dur: 0.16, type: 'sawtooth', glideTo: 130, vol: 0.09, delay: 0.22 }); break;
      case 'envio': beep({ freq: 700, dur: 0.045, type: 'square', vol: 0.04 }); break;
      case 'recebido': beep({ freq: 1200, dur: 0.05, type: 'sine', vol: 0.05 }); beep({ freq: 1500, dur: 0.05, type: 'sine', delay: 0.05, vol: 0.04 }); break;
      case 'mic': beep({ freq: 500, dur: 0.05, type: 'sine', glideTo: 900, vol: 0.05 }); break;
      case 'toggle': beep({ freq: 950, dur: 0.03, type: 'square', vol: 0.03 }); break;
      case 'notify': beep({ freq: 1100, dur: 0.06, type: 'triangle', vol: 0.045 }); break;
      case 'alert': beep({ freq: 500, dur: 0.09, type: 'square', glideTo: 380, vol: 0.07 }); beep({ freq: 500, dur: 0.09, type: 'square', glideTo: 380, vol: 0.07, delay: 0.16 }); break;
    }
  }
  soundToggle.addEventListener('click', () => {
    somAtivo = !somAtivo; soundValue.textContent = somAtivo ? 'ON' : 'OFF';
    soundToggle.classList.toggle('on', somAtivo); soundToggle.classList.toggle('sound-off', !somAtivo);
    if (somAtivo) tocarSom('toggle');
  });
  document.addEventListener('click', () => { getAudioCtx(); }, { once: true });

  /* ================= voz ================= */
  let vozAtiva = true;
  voiceToggle.addEventListener('click', () => {
    vozAtiva = !vozAtiva; voiceValue.textContent = vozAtiva ? 'ON' : 'OFF'; voiceToggle.classList.toggle('on', vozAtiva); tocarSom('toggle');
    if (!vozAtiva && window.speechSynthesis) { speechSynthesis.cancel(); setEstado('idle'); }
  });
  function falar(textoHtml) {
    if (!vozAtiva || !window.speechSynthesis) return;
    const tmp = document.createElement('div'); tmp.innerHTML = textoHtml;
    const textoLimpo = tmp.textContent.trim(); if (!textoLimpo) return;
    const utter = new SpeechSynthesisUtterance(textoLimpo);
    utter.lang = 'pt-BR'; utter.rate = 1.02; utter.pitch = 0.85;
    utter.onstart = () => { setEstado('speaking'); setSubsystem('voz', true); };
    utter.onend = () => { setEstado('idle'); setSubsystem('voz', false); };
    utter.onerror = () => setEstado('idle');
    speechSynthesis.cancel(); speechSynthesis.speak(utter);
  }

  /* ================= exportar registro ================= */
  exportBtn.addEventListener('click', () => {
    tocarSom('toggle');
    const linhas = Array.from(document.querySelectorAll('.log-line')).map(el => {
      const tag = el.querySelector('.tag')?.textContent || ''; const time = el.querySelector('.time')?.textContent || '';
      const corpo = el.cloneNode(true); corpo.querySelector('.tag-row')?.remove();
      return `[${time}] ${tag}: ${corpo.textContent.trim()}`;
    });
    const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `jarvis-registro-${Date.now()}.txt`; a.click(); URL.revokeObjectURL(url);
  });

  let ws = null; let primeiraConexao = true;
  function conectar() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => { setEstado('idle'); setSubsystem('websocket', true, false); if (!primeiraConexao) tocarSom('online'); primeiraConexao = false; };
    ws.onclose = () => { setEstado('offline'); setTimeout(conectar, 2000); };
    ws.onerror = () => ws.close();
    ws.onmessage = (msg) => {
      let evento; try { evento = JSON.parse(msg.data); } catch { return; }
      switch (evento.type) {
        case 'log': addLogLine(evento.role, evento.text, evento.speech, evento.confidence); break;
        case 'status':
          if (!speechSynthesis || !speechSynthesis.speaking) setEstado(evento.state);
          if (evento.state === 'thinking') setSubsystem('processamento', true, true);
          break;
        case 'memory':
          setSubsystem('memoria', true, true);
          break;
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
        case 'timeline':
          timelineItems = evento.items || []; renderTimeline(); break;
        case 'timeline_add':
          timelineItems.push(evento.item); renderTimeline(); addEvent('timeline', 'Novo item de contexto registrado'); break;
        case 'subsystem': setSubsystem(evento.name, evento.active, !evento.persist); break;
      }
    };
  }
  conectar();

  /* ================= comando (texto) ================= */
  const cmdInput = document.querySelector('.cmd-input');
  const sendBtn = document.getElementById('sendBtn');
  function enviarComando(texto) {
    texto = (texto || '').trim(); if (!texto) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) { setEstado('offline'); return; }
    ws.send(JSON.stringify({ type: 'command', text: texto })); cmdInput.value = '';
  }
  sendBtn.addEventListener('click', () => enviarComando(cmdInput.value));
  cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviarComando(cmdInput.value); } });

  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  let reconhecendo = false; let recognition = null;
  if (SpeechRecognitionAPI) {
    recognition = new SpeechRecognitionAPI();
    recognition.lang = 'pt-BR'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = (event) => enviarComando(event.results[0][0].transcript);
    recognition.onstart = () => setEstado('listening');
    recognition.onend = () => { reconhecendo = false; micBtn.classList.remove('active'); if (coreMode === 'listening') setEstado('idle'); };
    recognition.onerror = () => { reconhecendo = false; micBtn.classList.remove('active'); };
    micBtn.addEventListener('click', () => {
      tocarSom('mic');
      if (window.speechSynthesis && speechSynthesis.speaking) { speechSynthesis.cancel(); setEstado('idle'); }
      if (reconhecendo) { recognition.stop(); return; }
      reconhecendo = true; micBtn.classList.add('active');
      try { recognition.start(); } catch { reconhecendo = false; micBtn.classList.remove('active'); }
    });
  } else {
    micBtn.style.opacity = '0.3'; micBtn.style.cursor = 'not-allowed';
    micBtn.title = 'Reconhecimento de voz não suportado neste navegador — use o Chrome, ou digite o comando.';
  }