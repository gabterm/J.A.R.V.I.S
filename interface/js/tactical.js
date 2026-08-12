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

  export function abrirQuadroTatico(dados) {
  tacticalFrames = dados.quadros || [];
  tacticalIndex = 0;
  tacticalScale = computeTacticalScale(tacticalFrames);

  document.getElementById('tacticalTitle').textContent = dados.titulo || '';

  document.getElementById('tacticalFormacoes').textContent =
    [dados.formacao_casa, dados.formacao_visitante]
      .filter(Boolean)
      .join(' vs ');

  document.getElementById('tacticalEmpty').style.display = 'none';
  document.getElementById('tacticalBoard').style.display = 'flex';

  tacticalPlayersGroup.innerHTML = '';
  tacticalCommentaryEl.style.display = 'none';

  renderTacticalFrame(0);

  if (!tacticalPanel.classList.contains('visible')) {
    tacticalAlertDot.style.display = 'inline-block';
  }

  addEvent('tatica', `Novo quadro tático: ${dados.titulo}`);
}

export function avancarQuadroTatico(evento) {
  if (!tacticalFrames.length) return;

  pauseTactical();

  tacticalIndex = Math.max(
    0,
    Math.min(tacticalFrames.length - 1, evento.index)
  );

  renderTacticalFrame(tacticalIndex);

  if (evento.anotacao) {
    tacticalCommentaryEl.style.display = 'flex';
    typewriter(tacticalCommentaryTextEl, evento.anotacao);
  } else {
    tacticalCommentaryEl.style.display = 'none';
  }
}
