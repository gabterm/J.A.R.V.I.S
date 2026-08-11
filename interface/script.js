
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

  /* ================= glitch periódico no wordmark ================= */
  const wordmark = document.getElementById('wordmark');
  setInterval(() => { wordmark.classList.add('glitch'); setTimeout(() => wordmark.classList.remove('glitch'), 400); }, 14000 + Math.random() * 6000);

  /* ================= telemetria decorativa ================= */
  const telSync = document.getElementById('telSync');
  const telNode = document.getElementById('telNode');
  setInterval(() => {
    telSync.textContent = (Math.random() * 20 + 80).toFixed(1);
    telNode.textContent = '0x' + Math.floor(Math.random() * 65535).toString(16).padStart(4, '0').toUpperCase();
  }, 1400);

  /* ================= relógio / uptime ================= */
  const minimalClockValue = document.getElementById('minimalClockValue');
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
  let dotCount = 1;
  setInterval(() => { dotCount = (dotCount % 3) + 1; const dots = document.getElementById('dots'); if (dots) dots.textContent = '.'.repeat(dotCount); }, 600);

  /* ================= personalização visual em tempo real ================= */
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsDrawer = document.getElementById('settingsDrawer');
  const minimalSwitch = document.getElementById('minimalSwitch');
  const minimalExitBtn = document.getElementById('minimalExitBtn');
  const testModeSwitch = document.getElementById('testModeSwitch');

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

  // intensidade de animação — controla CSS (--dur-mult) e a velocidade das partículas em canvas
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

  // densidade de informação
  document.getElementById('densitySegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    document.querySelectorAll('#densitySegmented button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.body.classList.remove('density-compact', 'density-detailed');
    const nivel = btn.dataset.density;
    if (nivel !== 'normal') document.body.classList.add('density-' + nivel);
    tocarSom('toggle');
  });

  // modo minimalista
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
  // ícone de engrenagem dentro da barra de comando: sai do modo minimalista com um clique
  minimalExitBtn.addEventListener('click', () => {
    setMinimal(false);
    tocarSom('toggle');
    addEvent('sistema', 'Modo minimalista desativado');
  });

  /* ================= modo teste (simula eventos sem depender do servidor) ================= */
  let testModeOn = false;
  let testModeTimers = [];
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
    timelineItems = [
      { id: 'tst-1', tipo: 'contexto', text: 'Gabriel está testando a interface do JARVIS.', pinned: true },
      { id: 'tst-2', tipo: 'preferencia', text: 'Prefere respostas objetivas e diretas.', pinned: false },
    ];
    renderTimeline();

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

  testModeSwitch.addEventListener('click', () => {
    testModeOn = !testModeOn;
    testModeSwitch.classList.toggle('on', testModeOn);
    tocarSom('toggle');
    if (testModeOn) iniciarModoTeste(); else pararModoTeste();
  });

  /* ================= elementos gerais ================= */
  const micBtn = document.getElementById('micBtn');
  const coreStatus = document.getElementById('coreStatus');
  const log = document.getElementById('log');
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

  /* ================= abas: registro / investigação / tática ================= */
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
  const tacticalCommentaryEl = document.getElementById('tacticalCommentary');
  const tacticalCommentaryTextEl = tacticalCommentaryEl.querySelector('.tc-text');

  // Calcula a escala necessária para mapear as coordenadas cruas recebidas (que podem
  // vir em qualquer unidade: normalizadas 0–1, metros de campo real 0–105x0–68, etc.)
  // para o espaço do viewBox do SVG (0–100 x 0–64). Sem isso, se os dados chegarem numa
  // escala diferente da esperada, jogadores acabam desenhados fora da área visível do campo.
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

    // Se os dados já cabem dentro do espaço esperado do viewBox, não reescalamos —
    // evita distorcer posições que já estão corretas.
    const jaNoEspacoEsperado = minX >= -1 && maxX <= PITCH_W + 1 && minY >= -1 && maxY <= PITCH_H + 1;
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

  // Autoplay manual (botão ▶) — usado só pra revisar a jogada depois que a
  // narração já terminou. Enquanto o servidor está narrando quadro a quadro
  // (evento 'tactical_frame'), é ele quem comanda o avanço, não este timer.
  function playTactical() {
    if (tacticalFrames.length <= 1) return;
    tacticalPlaying = true;
    tacticalPlayBtn.textContent = '⏸';
    tacticalTimer = setInterval(() => {
      tacticalIndex++;
      if (tacticalIndex >= tacticalFrames.length) tacticalIndex = 0;
      renderTacticalFrame(tacticalIndex);
    }, 2000);
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
    tacticalCommentaryEl.style.display = 'none';
    renderTacticalFrame(0);
    // Não inicia autoplay aqui — o servidor vai empurrar 'tactical_frame'
    // em sincronia com a narração de cada instante.
    if (!tacticalPanel.classList.contains('visible')) tacticalAlertDot.style.display = 'inline-block';
    addEvent('tatica', `Novo quadro tático: ${dados.titulo}`);
  }

  // Chamado quando o servidor avança para um quadro específico, em sincronia
  // com o áudio daquele instante (evento 'tactical_frame').
  function avancarQuadroTatico(evento) {
    if (!tacticalFrames.length) return;
    pauseTactical();
    tacticalIndex = Math.max(0, Math.min(tacticalFrames.length - 1, evento.index));
    renderTacticalFrame(tacticalIndex);
    if (evento.anotacao) {
      tacticalCommentaryEl.style.display = 'flex';
      typewriter(tacticalCommentaryTextEl, evento.anotacao);
    } else {
      tacticalCommentaryEl.style.display = 'none';
    }
  }


function typewriter(el, texto) {
  el.innerHTML = '';

  if (texto.includes('```')) {
    el.innerHTML = formatMessage(texto);
    return;
  }

  let i = 0;
  const speed = 16;

  function passo() {
    if (i < texto.length) {
      el.textContent += texto[i];
      i++;
      setTimeout(passo, speed);
    }
  }

  passo();
}



  function addLogLine(role, text, confidence) {
    const empty = document.getElementById('logEmpty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    const cls = role === 'user' ? 'user' : (role === 'system' ? 'system' : 'jarvis');
    div.className = `log-line ${cls}`;
    const tag = role === 'user' ? 'Gabriel' : (role === 'system' ? 'SISTEMA' : 'JARVIS');
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const badge = (cls === 'jarvis' && confidence) ? `<span class="confidence-badge ${confidence}">${confidence}</span>` : '';

   

  if (cls === 'jarvis') {
  div.innerHTML = `
    <div class="tag-row">
      <span class="tag-left">
        <span class="tag">${tag}</span>
        ${badge}
      </span>
      <span class="time">${time}</span>
    </div>
    <span class="msg-text"></span>
  `;

  log.appendChild(div);
  const msgText = div.querySelector('.msg-text');

  if (text.includes('```')) {
    msgText.innerHTML = formatMessage(text);
  } else {
    typewriter(msgText, text);
  }
}else {
      div.innerHTML = `<div class="tag-row"><span class="tag-left"><span class="tag">${tag}</span></span><span class="time">${time}</span></div>${text}`;
      log.appendChild(div);
    }

    log.scrollTop = log.scrollHeight;
    while (log.children.length > 40) log.removeChild(log.firstChild);

    // A voz agora é 100% responsabilidade do servidor (Fish Audio). O
    // navegador só exibe o texto — nada de speechSynthesis aqui, senão
    // as duas vozes ficam disputando ao mesmo tempo.
    if (role === 'user') {
      tocarSom('envio'); addEvent('comando', 'Comando recebido');
    } else if (role !== 'system') {
      tocarSom('recebido'); addEvent('resposta', 'Resposta gerada');
    }
  }

  /* ================= clima ================= */
  const weatherEmpty = document.getElementById('weatherEmpty');
  const weatherBody = document.getElementById('weatherBody');
  const weatherIcon = document.getElementById('weatherIcon');
  const minimalWeatherIcon = document.getElementById('minimalWeatherIcon');
  const minimalWeatherValue = document.getElementById('minimalWeatherValue');
  const WEATHER_ICONS = {
    ceu_limpo: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>',
    nublado: '<path d="M17.5 19H9a5 5 0 1 1 1.6-9.7A6 6 0 0 1 22 12.5 4.5 4.5 0 0 1 17.5 19z"/>',
    chuva: '<path d="M16 13H8a5 5 0 1 1 1.6-9.7A6 6 0 0 1 20.5 6.5 4.5 4.5 0 0 1 16 13z"/><line x1="8" y1="16" x2="8" y2="21"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="16" y1="16" x2="16" y2="21"/>',
    tempestade: '<path d="M16 13H8a5 5 0 1 1 1.6-9.7A6 6 0 0 1 20.5 6.5 4.5 4.5 0 0 1 16 13z"/><polyline points="11 16 8 21 12 21 10 24"/>',
    neve: '<path d="M16 13H8a5 5 0 1 1 1.6-9.7A6 6 0 0 1 20.5 6.5 4.5 4.5 0 0 1 16 13z"/><line x1="8" y1="17" x2="8" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="16" y1="17" x2="16" y2="21"/>',
    neblina: '<line x1="3" y1="8" x2="21" y2="8"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/>'
  };
  function renderWeather(dados) {
    weatherEmpty.style.display = 'none';
    weatherBody.style.display = 'block';
    document.getElementById('weatherTemp').innerHTML = `${Math.round(dados.temp)}<span>°C</span>`;
    document.getElementById('weatherCond').textContent = dados.condicao || '—';
    document.getElementById('weatherFeels').textContent = (dados.sensacao !== undefined ? Math.round(dados.sensacao) : '--') + '°';
    document.getElementById('weatherHumidity').textContent = (dados.umidade !== undefined ? dados.umidade : '--') + '%';
    document.getElementById('weatherWind').textContent = (dados.vento !== undefined ? dados.vento : '--') + ' km/h';
    document.getElementById('weatherMinMax').textContent = `${dados.min !== undefined ? Math.round(dados.min) : '--'}/${dados.max !== undefined ? Math.round(dados.max) : '--'}°`;
    document.getElementById('weatherLoc').textContent = dados.local || '—';
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('weatherUpdated').textContent = hora;
    const iconMarkup = WEATHER_ICONS[dados.icone] || WEATHER_ICONS.ceu_limpo;
    weatherIcon.innerHTML = iconMarkup;
    // espelha no mini círculo de clima do modo minimalista
    minimalWeatherIcon.innerHTML = iconMarkup;
    minimalWeatherValue.textContent = Math.round(dados.temp) + '°';
    addEvent('clima', 'Dados do clima atualizados');
  }

  /* ================= lembretes ================= */
  const remindersList = document.getElementById('remindersList');
  const remindersCount = document.getElementById('remindersCount');
  function renderReminders(items) {
    remindersList.innerHTML = '';
    const lista = items || [];
    if (lista.length === 0) { remindersList.innerHTML = '<div class="reminders-empty">nenhum lembrete ativo</div>'; remindersCount.textContent = 0; return; }
    lista.forEach(item => {
      const div = document.createElement('div');
      div.className = 'reminder-item' + (item.concluido ? ' done' : '');
      div.innerHTML = `<div class="rd-dot"></div><div class="rd-body"><span class="rd-text">${item.texto}</span><span class="rd-time">${item.quando || ''}</span></div>`;
      remindersList.appendChild(div);
    });
    remindersCount.textContent = lista.filter(i => !i.concluido).length;
  }

  /* ================= feed de eventos ================= */
  function addEvent(categoria, texto) {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.debug(`[evento:${categoria}] ${texto} — ${time}`);
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
    if (testModeOn) return; // evita mandar ações do modo teste para o servidor real
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
        case 'timeline':
          timelineItems = evento.items || []; renderTimeline(); break;
        case 'timeline_add':
          timelineItems.push(evento.item); renderTimeline(); addEvent('timeline', 'Novo item de contexto registrado'); break;
        case 'subsystem': setSubsystem(evento.name, evento.active, !evento.persist); break;
      }
    };
  }
  conectar();

function formatMessage(text) {
  if (!text) return '';

  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map(part => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const match = part.match(/^```(\w+)?\n?([\s\S]*?)```$/);
      const language = match && match[1] ? match[1] : 'text';
      const code = match && match[2] ? match[2].trim() : '';

      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return `<pre class="code-block"><code class="language-${language}">${escapedCode}</code></pre>`;
    } else {
      const escapedText = part
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return escapedText.replace(/\n/g, '<br>');
    }
  }).join('');
}

  /* ================= comando (texto) ================= */
  const cmdInput = document.querySelector('.cmd-input');
  const sendBtn = document.getElementById('sendBtn');
  function enviarComando(texto) {
    texto = (texto || '').trim(); if (!texto) return;
    if (testModeOn) { addLogLine('user', texto); cmdInput.value = ''; setTimeout(() => addLogLine('jarvis', 'Isto é uma resposta simulada do modo teste.', 'moderada'), 700); return; }
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
      if (reconhecendo) { recognition.stop(); return; }
      reconhecendo = true; micBtn.classList.add('active');
      try { recognition.start(); } catch { reconhecendo = false; micBtn.classList.remove('active'); }
    });
  } else {
    micBtn.style.opacity = '0.3'; micBtn.style.cursor = 'not-allowed';
    micBtn.title = 'Reconhecimento de voz não suportado neste navegador — use o Chrome, ou digite o comando.';
  }
