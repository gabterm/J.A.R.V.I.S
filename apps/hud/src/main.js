import { lerToken, salvarToken, apagarToken, lerServidor, salvarServidor, servidorValido, urlDoServidor, CODIGO_NAO_AUTENTICADO } from './conexao.js';
import { desenharNucleo } from './nucleo.js';
import { criarVoz } from './voz.js';

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
function getCyanRgb() { return getComputedStyle(document.body).getPropertyValue('--cyan-rgb').trim() || '127, 217, 255'; }
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

const wordmark = document.getElementById('wordmark');
setInterval(() => { wordmark.classList.add('glitch'); setTimeout(() => wordmark.classList.remove('glitch'), 400); }, 16000 + Math.random() * 6000);

const start = Date.now();
function updateUptime() {
  const diff = Math.floor((Date.now() - start) / 1000);
  const h = String(Math.floor(diff / 3600)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
  const s = String(diff % 60).padStart(2, '0');
  document.getElementById('uptime').textContent = `${h}:${m}:${s}`;
}
setInterval(updateUptime, 1000);

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
    document.body.classList.remove('theme-amber', 'theme-violet', 'theme-red');
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

const mediaFrame = document.getElementById('mediaFrame');
const mediaTopbar = document.getElementById('mediaTopbar');
const mediaIframe = document.getElementById('mediaIframe');
const mediaTitle = document.getElementById('mediaTitle');
const mediaClose = document.getElementById('mediaClose');
const mediaBlocked = document.getElementById('mediaBlocked');
const mediaBlockedOpen = document.getElementById('mediaBlockedOpen');
const mediaOpenExternal = document.getElementById('mediaOpenExternal');
let mediaExternalUrl = null;
let mediaLoadTimeout = null;

function abrirMedia(url, titulo, urlExterno, bloqueado) {
  // recentraliza o painel (desfaz posição arrastada de uma abertura anterior)
  mediaFrame.style.position = '';
  mediaFrame.style.left = '';
  mediaFrame.style.top = '';
  mediaFrame.style.margin = '';

  mediaExternalUrl = urlExterno || url;
  mediaTitle.textContent = titulo || url;
  mediaFrame.classList.add('open');
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
  mediaFrame.classList.remove('open');
  mediaIframe.src = 'about:blank';
  clearTimeout(mediaLoadTimeout);
}

mediaClose.addEventListener('click', fecharMedia);
mediaBlockedOpen.addEventListener('click', () => { if (mediaExternalUrl) window.open(mediaExternalUrl, '_blank'); });
mediaOpenExternal.addEventListener('click', () => { if (mediaExternalUrl) window.open(mediaExternalUrl, '_blank'); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mediaFrame.classList.contains('open')) fecharMedia();
});

tornarPainelArrastavel(mediaFrame, mediaTopbar);


const browserFrame = document.getElementById('browserFrame');
const browserTopbar = document.getElementById('browserTopbar');
const browserTitle = document.getElementById('browserTitle');
const browserUrl = document.getElementById('browserUrl');
const browserScreenshot = document.getElementById('browserScreenshot');
const browserClose = document.getElementById('browserClose');

function atualizarNavegacaoAoVivo(titulo, url, imagemBase64) {
  browserTitle.textContent = titulo || '—';
  browserUrl.textContent = url || '';
  browserScreenshot.src = `data:image/jpeg;base64,${imagemBase64}`;

  if (!browserScreenshot.dataset.interativo) {
    browserScreenshot.dataset.interativo = 'true';

    browserScreenshot.style.cursor = 'pointer';

    browserScreenshot.addEventListener('click', (event) => {
      const rect = browserScreenshot.getBoundingClientRect();

      if (!rect.width || !rect.height) {
        return;
      }

      const x = (event.clientX - rect.left) *
        (1280 / rect.width);

      const y = (event.clientY - rect.top) *
        (800 / rect.height);

      console.log('[BROWSER] Clique:', {
        screenX: event.clientX,
        screenY: event.clientY,
        elementX: event.clientX - rect.left,
        elementY: event.clientY - rect.top,
        browserX: x,
        browserY: y,
      });

      window.dispatchEvent(
        new CustomEvent('jarvis-browser-click', {
          detail: {
            x,
            y,
          },
        })
      );
    });
  }

  if (!browserFrame.classList.contains('open')) {
    browserFrame.style.position = '';
    browserFrame.style.left = '';
    browserFrame.style.top = '';
    browserFrame.style.margin = '';

    browserFrame.classList.add('open');

    tocarSom('toggle');

    addLogEvent(
      'info',
      `Navegação ao vivo: ${titulo || url}`
    );
  }
}

function fecharNavegacaoAoVivo() {
  browserFrame.classList.remove('open');
}

browserClose.addEventListener('click', fecharNavegacaoAoVivo);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && browserFrame.classList.contains('open')) fecharNavegacaoAoVivo();
});

tornarPainelArrastavel(browserFrame, browserTopbar);

const mapFrame = document.getElementById('mapFrame');
const mapTopbar = document.getElementById('mapTopbar');
const mapTitle = document.getElementById('mapTitle');
const mapClose = document.getElementById('mapClose');
const mapCaption = document.getElementById('mapCaption');

let leafletMap = null;
let mapRouteLayer = null;
let mapMarkersLayer = null;

function garantirMapaLeaflet() {
  if (leafletMap) return leafletMap;

  leafletMap = L.map('mapContainer', { zoomControl: true, attributionControl: true });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  }).addTo(leafletMap);

  mapRouteLayer = L.layerGroup().addTo(leafletMap);
  mapMarkersLayer = L.layerGroup().addTo(leafletMap);

  return leafletMap;
}

function criarIconePonto(tipo) {
  return L.divIcon({
    className: '',
    html: `<div class="map-marker-dot${tipo === 'destino' ? ' dest' : ''}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function abrirMapa(dados) {
  // recentraliza o painel (desfaz posição arrastada de uma abertura anterior)
  mapFrame.style.position = '';
  mapFrame.style.left = '';
  mapFrame.style.top = '';
  mapFrame.style.margin = '';

  mapTitle.textContent = `${dados.origem?.nome || 'Origem'} → ${dados.destino?.nome || 'Destino'}`;
  mapFrame.classList.add('open');
  tocarSom('toggle');
  addLogEvent('info', `Rota traçada: ${dados.origem?.nome || ''} → ${dados.destino?.nome || ''}`);

  // O container só tem dimensões reais depois do frame abrir (display
  // muda via classe 'open'), por isso o invalidateSize/desenho espera
  // um frame de animação.
  requestAnimationFrame(() => {
    const map = garantirMapaLeaflet();
    map.invalidateSize();

    mapRouteLayer.clearLayers();
    mapMarkersLayer.clearLayers();

    const corRota = getComputedStyle(document.body).getPropertyValue('--core-ring').trim() || '#5ec8ff';

    if (dados.geometria) {
      L.geoJSON(dados.geometria, {
        style: { color: corRota, weight: 3.5, opacity: 0.85 },
      }).addTo(mapRouteLayer);
    }

    if (dados.origem && dados.origem.lat != null && dados.origem.lon != null) {
      L.marker([dados.origem.lat, dados.origem.lon], { icon: criarIconePonto('origem') })
        .bindTooltip(dados.origem.nome || 'Origem', { direction: 'top' })
        .addTo(mapMarkersLayer);
    }

    if (dados.destino && dados.destino.lat != null && dados.destino.lon != null) {
      L.marker([dados.destino.lat, dados.destino.lon], { icon: criarIconePonto('destino') })
        .bindTooltip(dados.destino.nome || 'Destino', { direction: 'top' })
        .addTo(mapMarkersLayer);
    }

    const todasCamadas = [...mapRouteLayer.getLayers(), ...mapMarkersLayer.getLayers()];
    if (todasCamadas.length) {
      map.fitBounds(L.featureGroup(todasCamadas).getBounds(), { padding: [30, 30] });
    } else if (dados.origem) {
      map.setView([dados.origem.lat, dados.origem.lon], 13);
    }
  });

  const duracaoMin = dados.duracao_min || 0;
  const horas = Math.floor(duracaoMin / 60);
  const minutos = Math.round(duracaoMin % 60);
  const duracaoTexto = horas ? `${horas}h${String(minutos).padStart(2, '0')}` : `${minutos} min`;
  const modoLabel = { driving: 'de carro', walking: 'a pé', cycling: 'de bicicleta' }[dados.modo] || dados.modo || '';

  mapCaption.innerHTML = `<b>${dados.distancia_km ?? '--'} km</b> · ${duracaoTexto} ${modoLabel}`;
}

function fecharMapa() {
  mapFrame.classList.remove('open');
}

mapClose.addEventListener('click', fecharMapa);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mapFrame.classList.contains('open')) fecharMapa();
});

tornarPainelArrastavel(mapFrame, mapTopbar);

const reasoningFrame = document.getElementById('reasoningFrame');
const reasoningTopbar = document.getElementById('reasoningTopbar');
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
  reasoningFrame.style.position = '';
  reasoningFrame.style.left = '';
  reasoningFrame.style.top = '';
  reasoningFrame.style.margin = '';

  reasoningTitle.textContent = titulo || 'Raciocínio';
  reasoningSvg.innerHTML = '';
  reasoningCaption.textContent = '';
  reasoningFrame.classList.add('open');
  tocarSom('toggle');
  addLogEvent('info', `Quadro de raciocínio: ${titulo || ''}`);
}

function fecharQuadroRaciocinio() {
  reasoningFrame.classList.remove('open');
}

reasoningClose.addEventListener('click', fecharQuadroRaciocinio);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && reasoningFrame.classList.contains('open')) fecharQuadroRaciocinio();
});

tornarPainelArrastavel(reasoningFrame, reasoningTopbar);

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
      <circle cx="${n.x}" cy="${n.y}" r="${raio}" fill="rgba(4,12,17,0.85)" stroke="${cor}" stroke-width="${ativo ? 0.6 : 0.35}"/>
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

const newsFrame = document.getElementById('newsFrame');
const newsTitle = document.getElementById('newsTitle');
const newsTopbar = document.getElementById('newsTopbar');
const newsBody = document.getElementById('newsBody');
const newsClose = document.getElementById('newsClose');

function abrirNoticias(titulo, news) {
  // recentraliza o painel (desfaz posição arrastada de uma abertura anterior)
  newsFrame.style.position = '';
  newsFrame.style.left = '';
  newsFrame.style.top = '';
  newsFrame.style.margin = '';

  newsTitle.textContent = titulo || 'Notícias';
  newsBody.innerHTML = (news || []).map(item => {
    const thumb = item.image
      ? `<img class="news-item-thumb" src="${item.image}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;news-item-thumb news-item-thumb-empty&quot;></div>'">`
      : `<div class="news-item-thumb news-item-thumb-empty"></div>`;
    return `
      <div class="news-item" data-url="${item.link || ''}">
        ${thumb}
        <div class="news-item-body">
          <div class="news-item-title">${escapeXml(item.title)}</div>
          <div class="news-item-meta">${escapeXml(item.source || '')} · ${escapeXml(item.published_at || '')}</div>
        </div>
      </div>
    `;
  }).join('') || '<div class="term-empty">Nenhuma notícia encontrada.</div>';

  newsBody.querySelectorAll('.news-item').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.url) window.open(el.dataset.url, '_blank');
    });
  });

  newsFrame.classList.add('open');
  tocarSom('toggle');
  addLogEvent('info', `Painel de notícias: ${titulo || ''}`);
}

function fecharNoticias() {
  newsFrame.classList.remove('open');
}

newsClose.addEventListener('click', fecharNoticias);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && newsFrame.classList.contains('open')) fecharNoticias();
});

// Torna um card flutuante arrastável pela sua barra de título. O clique
// no botão "FECHAR" não inicia o arraste.
function tornarPainelArrastavel(frame, topbar) {
  let arrastando = false;
  let startX = 0, startY = 0, origX = 0, origY = 0;

  topbar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.icon-btn')) return;
    arrastando = true;
    const rect = frame.getBoundingClientRect();
    frame.style.position = 'fixed';
    frame.style.margin = '0';
    frame.style.left = rect.left + 'px';
    frame.style.top = rect.top + 'px';
    frame.style.right = 'auto';
    origX = rect.left; origY = rect.top;
    startX = e.clientX; startY = e.clientY;
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!arrastando) return;
    frame.style.left = (origX + (e.clientX - startX)) + 'px';
    frame.style.top = (origY + (e.clientY - startY)) + 'px';
  });

  window.addEventListener('mouseup', () => {
    arrastando = false;
    document.body.style.userSelect = '';
  });
}

tornarPainelArrastavel(newsFrame, newsTopbar);

// ---- Painel de músicas recentes — lista o histórico e toca do cache ----

const recentFrame = document.getElementById('recentFrame');
const recentTopbar = document.getElementById('recentTopbar');
const recentClose = document.getElementById('recentClose');
const recentBody = document.getElementById('recentBody');

function abrirRecentes(lista) {
  recentFrame.style.position = '';
  recentFrame.style.left = '';
  recentFrame.style.top = '';
  recentFrame.style.margin = '';

  const recentes = (lista || []).slice(0, 20);

  recentBody.innerHTML = recentes.map(item => {
    const thumb = item.thumbnail
      ? `<img class="recent-item-thumb" src="${item.thumbnail}" alt="" loading="lazy">`
      : `<div class="recent-item-thumb recent-item-thumb-empty"></div>`;

    return `
      <div class="recent-item" data-id="${item.video_id}">
        ${thumb}
        <div class="recent-item-body">
          <div class="recent-item-title">${escapeXml(item.titulo)}</div>
          <div class="recent-item-artist">${escapeXml(item.artistas || '')}</div>
        </div>

        <button class="recent-item-play" type="button" title="Tocar" aria-label="Tocar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polygon points="6 3 20 12 6 21 6 3"></polygon>
          </svg>
        </button>
      </div>
    `;
  }).join('') || '<div class="term-empty">Nenhuma música em cache ainda.</div>';

  recentBody.querySelectorAll('.recent-item').forEach(el => {
    el.addEventListener('click', () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setEstado('offline');
        return;
      }

      ws.send(JSON.stringify({
        type: 'tool_call',
        name: 'tocar_do_historico',
        args: { video_id: el.dataset.id },
      }));

      tocarSom('toggle');
    });
  });

  recentFrame.classList.add('open');
  tocarSom('toggle');
  addLogEvent('info', `Painel de recentes: ${(lista || []).length} música(s)`);
}

function fecharRecentes() {
  recentFrame.classList.remove('open');
}

recentClose.addEventListener('click', fecharRecentes);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && recentFrame.classList.contains('open')) fecharRecentes();
});

tornarPainelArrastavel(recentFrame, recentTopbar);

// ---- Painel de clima — mesmo card translúcido, sem overlay ----

const weatherFrame = document.getElementById('weatherFrame');
const weatherTopbar = document.getElementById('weatherTopbar');
const weatherClose = document.getElementById('weatherClose');
const weatherLocal = document.getElementById('weatherLocal');
const weatherTemp = document.getElementById('weatherTemp');
const weatherIcon = document.getElementById('weatherIcon');
const weatherCondicao = document.getElementById('weatherCondicao');
const weatherSensacao = document.getElementById('weatherSensacao');
const weatherUmidade = document.getElementById('weatherUmidade');
const weatherVento = document.getElementById('weatherVento');
const weatherMinMax = document.getElementById('weatherMinMax');

const WEATHER_ICON_LABEL = {
  ceu_limpo: '☀',
  nublado: '☁',
  neblina: '≈',
  chuva: '☂',
  neve: '❄',
  tempestade: '⚡',
};

function abrirClima(dados) {
  weatherFrame.style.position = '';
  weatherFrame.style.left = '';
  weatherFrame.style.top = '';
  weatherFrame.style.margin = '';

  weatherLocal.textContent = dados.local || 'Clima';
  weatherTemp.innerHTML = `${Math.round(dados.temp)}<sup>°C</sup>`;
  weatherIcon.textContent = WEATHER_ICON_LABEL[dados.icone] || '—';
  weatherCondicao.textContent = dados.condicao || '—';
  weatherSensacao.textContent = `${Math.round(dados.sensacao)}°C`;
  weatherUmidade.textContent = `${Math.round(dados.umidade)}%`;
  weatherVento.textContent = `${Math.round(dados.vento)} km/h`;
  weatherMinMax.textContent = `${Math.round(dados.min)}° / ${Math.round(dados.max)}°`;

  weatherFrame.classList.add('open');
  tocarSom('toggle');
  addLogEvent('info', `Painel de clima: ${dados.local || ''}`);
}

function fecharClima() {
  weatherFrame.classList.remove('open');
}

weatherClose.addEventListener('click', fecharClima);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && weatherFrame.classList.contains('open')) fecharClima();
});

tornarPainelArrastavel(weatherFrame, weatherTopbar);

// ---- Player de música — floating panel com visualizador de áudio ----

const musicFrame = document.getElementById('musicFrame');
const musicTopbar = document.getElementById('musicTopbar');
const musicClose = document.getElementById('musicClose');
const musicThumb = document.getElementById('musicThumb');
const musicTitleBar = document.getElementById('musicTitleBar');
const musicTitle = document.getElementById('musicTitle');
const musicArtist = document.getElementById('musicArtist');
const musicSeek = document.getElementById('musicSeek');
const musicTimeAtual = document.getElementById('musicTimeAtual');
const musicTimeTotal = document.getElementById('musicTimeTotal');
const musicPlayPause = document.getElementById('musicPlayPause');
const musicStop = document.getElementById('musicStop');
const musicVisualizer = document.getElementById('musicVisualizer');
const jarvisAudio = document.getElementById('jarvisAudio');

// Permite que o áudio seja roteado pelo AudioContext (visualizador) sem
// ficar "tainted" — o servidor de música já manda
// Access-Control-Allow-Origin: * (ver music_player.py), então isso é
// seguro e evita que o analyser retorne sempre zero.
jarvisAudio.crossOrigin = 'anonymous';

// Barras do visualizador — criadas uma única vez, atualizadas via custom
// property --v (0 a 1), lida pelo CSS (altura/box-shadow de cada barra).
const MUSIC_BANDAS = 24;
for (let i = 0; i < MUSIC_BANDAS; i++) {
  const bar = document.createElement('span');
  bar.className = 'music-bar';
  musicVisualizer.appendChild(bar);
}
const musicBars = musicVisualizer.querySelectorAll('.music-bar');

let musicAudioCtx = null, musicAnalyser = null, musicSource = null;
let musicSeekArrastando = false;

// Fica true sempre que HÁ intenção de que a música esteja tocando
// (aberta pelo backend ou play manual), e false quando o usuário
// pausa/para de propósito. Usado pelo desbloqueio de autoplay abaixo:
// se o navegador bloquear play() por falta de gesto do usuário, a
// próxima interação (clique, tecla) tenta retomar automaticamente.
let musicIntencaoTocar = false;

function formatarTempo(segundos) {
  if (!isFinite(segundos) || segundos < 0) segundos = 0;
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function iniciarAnalyserMusica() {
  if (musicAudioCtx) {
    if (musicAudioCtx.state === 'suspended') {
      musicAudioCtx.resume().catch(() => {});
    }

    return;
  }

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  try {
    musicAudioCtx = new AC();

    musicSource = musicAudioCtx.createMediaElementSource(jarvisAudio);
    musicAnalyser = musicAudioCtx.createAnalyser();
    musicAnalyser.fftSize = 128;

    musicSource.connect(musicAnalyser);
    musicAnalyser.connect(musicAudioCtx.destination);

    requestAnimationFrame(atualizarVisualizadorMusica);

  } catch (error) {
    console.error('[MUSIC] Falha ao iniciar visualizador:', error);

    musicAudioCtx = null;
    musicAnalyser = null;
    musicSource = null;
  }
}

function atualizarVisualizadorMusica() {
  if (musicAnalyser && !jarvisAudio.paused) {
    const dados = new Uint8Array(musicAnalyser.frequencyBinCount);
    musicAnalyser.getByteFrequencyData(dados);
    musicBars.forEach((bar, i) => {
      bar.style.setProperty('--v', ((dados[i] || 0) / 255).toFixed(3));
    });
  } else {
    musicBars.forEach(bar => bar.style.setProperty('--v', '0'));
  }
  requestAnimationFrame(atualizarVisualizadorMusica);
}

// Ponto único que tenta de fato tocar o áudio. Sempre passa por aqui
// (abertura automática via backend OU clique manual no botão de play),
// pra manter musicIntencaoTocar e o AudioContext consistentes.
function tentarTocarMusica() {
  musicIntencaoTocar = true;
  iniciarAnalyserMusica();

  const promessa = jarvisAudio.play();
  if (promessa && typeof promessa.catch === 'function') {
    promessa.catch((error) => {
      // Autoplay bloqueado pelo navegador (comum quando a música é
      // iniciada por voz/comando, sem um clique síncrono do usuário).
      // Não é um erro real — só precisa de uma interação pra liberar.
      // O listener global de desbloqueio abaixo cuida de retomar assim
      // que o usuário clicar ou apertar qualquer tecla na interface.
      console.warn('[MUSIC] Reprodução aguardando interação do usuário:', error);
    });
  }
}

// Desbloqueia o AudioContext (e retenta o play, se necessário) assim
// que o usuário interagir com a página de qualquer forma — clique,
// tecla, toque. Sem isso, música iniciada via voz pode "tocar" (o
// <audio> avança, os logs mostram "Tocando...") mas ficar muda, porque
// o AudioContext do visualizador nasceu suspenso.
function desbloquearAudioMusica() {
  if (musicAudioCtx && musicAudioCtx.state === 'suspended') {
    musicAudioCtx.resume().catch(() => {});
  }
  if (musicIntencaoTocar && jarvisAudio.paused && jarvisAudio.src) {
    jarvisAudio.play().catch(() => {});
  }
}
document.addEventListener('click', desbloquearAudioMusica);
document.addEventListener('keydown', desbloquearAudioMusica);
document.addEventListener('touchstart', desbloquearAudioMusica, { passive: true });

function abrirPlayerMusica(evento) {
  musicFrame.style.position = '';
  musicFrame.style.left = '';
  musicFrame.style.top = '';
  musicFrame.style.margin = '';

  musicTitle.textContent = evento.titulo || '—';
  musicArtist.textContent = evento.artistas || '—';
  musicThumb.style.display = evento.thumbnail ? 'block' : 'none';
  if (evento.thumbnail) musicThumb.src = evento.thumbnail;

  jarvisAudio.src = evento.url;
  jarvisAudio.currentTime = 0;

  musicFrame.classList.add('open');
  tocarSom('toggle');
  addLogEvent('info', `Tocando: ${evento.titulo || ''} - ${evento.artistas || ''}`);

  tentarTocarMusica();
}

function fecharPlayerMusica() {
  musicIntencaoTocar = false;
  jarvisAudio.pause();
  musicFrame.classList.remove('open');
}

musicClose.addEventListener('click', fecharPlayerMusica);
musicStop.addEventListener('click', () => {
  musicIntencaoTocar = false;
  jarvisAudio.pause();
  jarvisAudio.currentTime = 0;
});
musicPlayPause.addEventListener('click', () => {
  if (jarvisAudio.paused) {
    tentarTocarMusica();
  } else {
    musicIntencaoTocar = false;
    jarvisAudio.pause();
  }
});

jarvisAudio.addEventListener('play', () => {
  musicFrame.classList.add('playing');
});

jarvisAudio.addEventListener('pause', () => {
  musicFrame.classList.remove('playing');
});

jarvisAudio.addEventListener('ended', () => {
  musicIntencaoTocar = false;
  musicFrame.classList.remove('playing');
  addLogEvent('info', 'Reprodução concluída');
});
jarvisAudio.addEventListener('loadedmetadata', () => {
  musicSeek.max = jarvisAudio.duration || 0;
  musicTimeTotal.textContent = formatarTempo(jarvisAudio.duration);
});
jarvisAudio.addEventListener('timeupdate', () => {
  if (musicSeekArrastando) return;
  musicSeek.value = jarvisAudio.currentTime;
  musicTimeAtual.textContent = formatarTempo(jarvisAudio.currentTime);
});

musicSeek.addEventListener('mousedown', () => { musicSeekArrastando = true; });
musicSeek.addEventListener('input', () => { musicTimeAtual.textContent = formatarTempo(parseFloat(musicSeek.value)); });
musicSeek.addEventListener('change', () => {
  jarvisAudio.currentTime = parseFloat(musicSeek.value);
  musicSeekArrastando = false;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && musicFrame.classList.contains('open')) fecharPlayerMusica();
});

tornarPainelArrastavel(musicFrame, musicTopbar);

const micBtn = document.getElementById('micBtn');
const clockStage = document.getElementById('clockStage');
const clockStatus = document.getElementById('clockStatus');
const statusPillText = document.getElementById('statusPillText');
const ESTADOS = {
  idle: 'aguardando comando',
  thinking: 'processando',
  speaking: 'falando',
  listening: 'ouvindo',
  alert: 'alerta',
  offline: 'desconectado'
};

// ---- Waveform central (voiceWave) reagindo ao estado do JARVIS ----
const voiceWaveEl = document.getElementById('voiceWave');
const voiceWaveBars = voiceWaveEl.querySelectorAll('span');
let waveRafId = null;
let waveEstadoAtual = 'idle';
let waveT = 0;

const WAVE_PERFIS = {
  idle:      { amp: 0.06, speed: 1.5,  ruido: 0.02 },
  thinking:  { amp: 0.55, speed: 3.0,  ruido: 0.25 },
  speaking:  { amp: 0.95, speed: 4.4,  ruido: 0.35 },
  listening: { amp: 0.75, speed: 3.0,  ruido: 0.4  },
  alert:     { amp: 0.6,  speed: 3.2,  ruido: 0.5  },
  offline:   { amp: 0,    speed: 0,    ruido: 0    },
};

function atualizarWaveformEstado(estado) {
  waveEstadoAtual = WAVE_PERFIS[estado] ? estado : 'idle';
  voiceWaveEl.className = 'voice-wave voice-wave-' + waveEstadoAtual;
  if (!waveRafId) loopWaveform();
}

function loopWaveform() {
  const perfil = WAVE_PERFIS[waveEstadoAtual];
  waveT += 0.05 * (perfil.speed || 0.001);

  voiceWaveBars.forEach((bar, i) => {
    const fase = i * 0.35;
    const onda = Math.sin(waveT + fase) * 0.5 + 0.5;
    const ruido = perfil.ruido ? (Math.random() - 0.5) * perfil.ruido : 0;
    const valor = Math.max(0, Math.min(1, onda * perfil.amp + ruido));
    bar.style.setProperty('--v', valor.toFixed(3));
  });

  waveRafId = requestAnimationFrame(loopWaveform);
}

atualizarWaveformEstado('idle');

function setEstado(estado) {
  const label = ESTADOS[estado] || estado.toUpperCase();
  atualizarLeiturasNucleo(estado, label);
  clockStatus.textContent = label;
  micBtn.classList.toggle('active', estado === 'speaking' || estado === 'thinking' || estado === 'listening');
  clockStage.className = 'clock-stage mode-' + (estado === 'offline' ? 'alert' : estado);
  atualizarWaveformEstado(estado);

  const jaOffline = document.body.classList.contains('offline');
  if (estado === 'offline' && !jaOffline) {
    document.body.classList.add('offline'); statusPillText.textContent = 'OFFLINE';
    document.getElementById('secureLinkLabel').textContent = 'OFFLINE';
    tocarSom('offline'); setSubsystem('websocket', false); addLogEvent('warn', 'Conexão perdida com o servidor');
    notify('Conexão perdida. Tentando reconectar…', 'warning');
  } else if (estado !== 'offline' && jaOffline) {
    document.body.classList.remove('offline'); statusPillText.textContent = 'online';
    document.getElementById('secureLinkLabel').textContent = 'online';
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

const clockTimeEl = document.getElementById('clockTime');
const clockDateEl = document.getElementById('clockDate');
const clockSecondHand = document.getElementById('clockSecondHand');
const clockFormatToggle = document.getElementById('clockFormatToggle');
let formato24h = true;

function atualizarRelogioCentral() {
  const agora = new Date();
  const seg = agora.getSeconds();
  const graus = (seg / 60) * 360;
  clockSecondHand.style.transform = `translate(-50%,0) rotate(${graus}deg)`;

  let horas = agora.getHours();
  let sufixo = '';
  if (!formato24h) {
    sufixo = horas >= 12 ? ' PM' : ' AM';
    horas = horas % 12; if (horas === 0) horas = 12;
  }
  const hh = String(horas).padStart(2, '0');
  const mm = String(agora.getMinutes()).padStart(2, '0');
  const ss = String(seg).padStart(2, '0');
  clockTimeEl.textContent = `${hh}:${mm}:${ss}${sufixo}`;
  clockDateEl.textContent = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
atualizarRelogioCentral();
setInterval(atualizarRelogioCentral, 1000);

clockFormatToggle.addEventListener('click', () => {
  formato24h = !formato24h;
  clockFormatToggle.textContent = formato24h ? '24H' : '12H';
  atualizarRelogioCentral();
  tocarSom('toggle');
});

const terminalBody = document.getElementById('terminalBody');

/* ---- Dock de apps: abre/fecha os painéis Terminal e Logs ---- */
const mainGrid = document.querySelector('.main');
const dockTerminalBtn = document.getElementById('dockTerminalBtn');
const dockLogsBtn = document.getElementById('dockLogsBtn');

function alternarApp(nomeApp, botao, classeOculta) {
  const agoraOculto = mainGrid.classList.toggle(classeOculta);
  botao.classList.toggle('active', !agoraOculto);
  botao.title = agoraOculto ? `Abrir ${nomeApp}` : `Fechar ${nomeApp}`;
  tocarSom('toggle');
  addLogEvent('info', `Painel "${nomeApp}" ${agoraOculto ? 'fechado' : 'aberto'}`);
}

dockTerminalBtn.addEventListener('click', () => {
  alternarApp('Direct Access', dockTerminalBtn, 'hide-terminal');
});

dockLogsBtn.addEventListener('click', () => {
  alternarApp('System Logs', dockLogsBtn, 'hide-logs');
});

function limparTerminal() {
  terminalBody.replaceChildren();

  const empty = document.createElement('div');
  empty.className = 'term-empty';
  empty.id = 'terminalEmpty';

  terminalBody.appendChild(empty);

  terminalBody.scrollTop = 0;

  tocarSom('toggle');
}

function addTermLine(role, text, opts) {
  const empty = document.getElementById('terminalEmpty'); if (empty) empty.remove();
  const div = document.createElement('div');
  const cls = role === 'user' ? 'role-user' : (role === 'system' ? 'role-system' : 'role-jarvis');
  div.className = `term-line ${cls}`;
  const prefix = role === 'user'
    ? 'gabterm@jarvis:~$'
    : role === 'system'
      ? '[sistema]'
      : 'jarvis>';
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  div.innerHTML = `<span class="t-time">${time}</span> <span class="t-prefix">${prefix}</span> <span class="t-text"></span>`;
  div.addEventListener('click', () => {
    navigator.clipboard?.writeText((text || '').trim()).catch(() => {});
    div.classList.add('copied');
    setTimeout(() => div.classList.remove('copied'), 500);
  });
  terminalBody.appendChild(div);
  const textEl = div.querySelector('.t-text');
  typewriter(textEl, text || '');
  terminalBody.scrollTop = terminalBody.scrollHeight;
  while (terminalBody.children.length > 60) terminalBody.removeChild(terminalBody.firstChild);

  if (role === 'user') { tocarSom('envio'); }
  else if (role !== 'system') { tocarSom('recebido'); }
}
function typewriter(el, texto) {
  let i = 0; const speed = 10;
  function passo() { if (i < texto.length) { el.textContent += texto[i]; i++; setTimeout(passo, speed); } }
  passo();
}

const TOOLS_META = {
  perfil:              { params: [] },
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
  lock_screen:          { params: [] },
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
  listar_recentes:       { params: [{ n: 'limite', req: false, tipo: 'int' }] },
  tocar_do_historico:    { params: [{ n: 'video_id', req: true }] },
  abrir_painel_recentes: { params: [{ n: 'limite', req: false, tipo: 'int' }] },
};

function tokenizarArgs(resto) {
  const regex = /(\w+)=("(?:[^"\\]|\\.)*"|\[[^\]]*\]|\{[^}]*\}|\S+)/g;
  const args = {}; let m;
  while ((m = regex.exec(resto)) !== null) {
    let [, chave, valor] = m;
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    else if (valor.startsWith('[') || valor.startsWith('{')) {
      try { valor = JSON.parse(valor); } catch {}
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

let cmdHistory = [];
let cmdHistoryPos = -1;

function tratarSlashCommand(texto) {
  if (!texto.startsWith('/')) return false;

  const semBarra = texto.slice(1).trim();

  const primeiroEspaco = semBarra.search(/\s/);

  const nome = primeiroEspaco === -1
    ? semBarra
    : semBarra.slice(0, primeiroEspaco);

  const resto = primeiroEspaco === -1
    ? ''
    : semBarra.slice(primeiroEspaco + 1);

  // Comandos locais do terminal
  if (nome === 'clear' || nome === 'limpar') {
    resetCmdInput();
    limparTerminal();
    addLogEvent('info', 'Histórico do terminal limpo');
    return true;
  }

  // A partir daqui, comandos normais aparecem no terminal
  addTermLine('user', texto);
  resetCmdInput();

  // Ajuda
  if (nome === 'help' || nome === 'ajuda') {
    listarFerramentas();
    return true;
  }

  if (nome === 'perfil') {
    enviarPerfil({ type: 'perfil_listar' });
    return true;
  }

  // Verifica se a ferramenta existe
  const meta = TOOLS_META[nome];

  if (!meta) {
    addTermLine(
      'system',
      `Ferramenta desconhecida: "${nome}". Digite /help para ver a lista.`
    );

    return true;
  }

  // Processa os argumentos
  const args = tokenizarArgs(resto);

  // Verifica argumentos obrigatórios
  const faltando = meta.params
    .filter(p => p.req && !(p.n in args))
    .map(p => p.n);

  if (faltando.length) {
    addTermLine(
      'system',
      `Faltam argumentos obrigatórios para /${nome}: ${faltando.join(', ')}`
    );

    return true;
  }

  // Verifica conexão com o backend
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addTermLine(
      'system',
      `Sem conexão com o servidor — /${nome} não pôde ser enviado.`
    );

    setEstado('offline');

    return true;
  }

  // Executa a ferramenta
  setEstado('thinking');
  setSubsystem('ferramentas', true, true);

  addLogEvent('info', `Chamando ferramenta: ${nome}`);

  ws.send(JSON.stringify({
    type: 'tool_call',
    name: nome,
    args
  }));

  return true;
}

function formatarResultadoFerramenta(evento) {
  if (evento.message) return evento.message;
  try { return JSON.stringify(evento.data ?? evento, null, 2); } catch { return String(evento.data); }
}

const logsBody = document.getElementById('logsBody');
const logsCount = document.getElementById('logsCount');
const logsToolbar = document.getElementById('logsToolbar');
let totalLogs = 0;
let filtroLogAtivo = 'all';

function addLogEvent(level, texto) {
  const empty = document.getElementById('logsEmpty'); if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = `log-row level-${level}`;
  div.dataset.level = level;
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const label = level === 'info' ? 'INFO' : (level === 'warn' ? 'WARN' : 'ERROR');
  div.innerHTML = `<span class="lg-time">${time}</span><span class="lg-level">${label}</span><span class="lg-text">${texto}</span>`;
  if (filtroLogAtivo !== 'all' && filtroLogAtivo !== level) div.style.display = 'none';
  div.addEventListener('click', () => {
    navigator.clipboard?.writeText(texto).catch(() => {});
    div.classList.add('copied');
    setTimeout(() => div.classList.remove('copied'), 500);
  });
  logsBody.prepend(div);
  while (logsBody.children.length > 50) logsBody.removeChild(logsBody.lastChild);
  totalLogs++; logsCount.textContent = totalLogs;
}

logsToolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('.logs-filter-btn');
  if (!btn) return;
  filtroLogAtivo = btn.dataset.level;
  logsToolbar.querySelectorAll('.logs-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  logsBody.querySelectorAll('.log-row').forEach(row => {
    row.style.display = (filtroLogAtivo === 'all' || row.dataset.level === filtroLogAtivo) ? '' : 'none';
  });
  tocarSom('toggle');
});

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


const cmdInput = document.querySelector('.cmd-input');
const cmdInputBaseHeight = cmdInput.scrollHeight;
const sendBtn = document.getElementById('sendBtn');

function resetCmdInput() { cmdInput.value = ''; cmdInput.style.height = cmdInputBaseHeight + 'px'; cmdHistoryPos = -1; }
function autoResizeCmdInput() { cmdInput.style.height = 'auto'; cmdInput.style.height = Math.min(cmdInput.scrollHeight, 120) + 'px'; }

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

  if (!cmdHistory.length || cmdHistory[cmdHistory.length - 1] !== texto) cmdHistory.push(texto);
  if (cmdHistory.length > 100) cmdHistory.shift();
  cmdHistoryPos = -1;

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
    return;
  }
  if (e.key === 'ArrowUp' && !cmdInput.value.includes('\n')) {
    if (!cmdHistory.length) return;
    e.preventDefault();
    cmdHistoryPos = cmdHistoryPos === -1 ? cmdHistory.length - 1 : Math.max(0, cmdHistoryPos - 1);
    cmdInput.value = cmdHistory[cmdHistoryPos];
    autoResizeCmdInput();
    cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length);
    return;
  }
  if (e.key === 'ArrowDown' && !cmdInput.value.includes('\n')) {
    if (cmdHistoryPos === -1) return;
    e.preventDefault();
    cmdHistoryPos = cmdHistoryPos + 1;
    if (cmdHistoryPos >= cmdHistory.length) { cmdHistoryPos = -1; cmdInput.value = ''; }
    else cmdInput.value = cmdHistory[cmdHistoryPos];
    autoResizeCmdInput();
    cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length);
  }
});

sendBtn.addEventListener('click', () => enviarComando(cmdInput.value));

document.addEventListener('click', (e) => {
  if (cmdAutocomplete.classList.contains('open') && !cmdAutocomplete.contains(e.target) && e.target !== cmdInput) {
    fecharAutocomplete();
  }
});

const simFrame = document.getElementById('simFrame');
const simTopbar = document.getElementById('simTopbar');
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
  simFrame.style.position = '';
  simFrame.style.left = '';
  simFrame.style.top = '';
  simFrame.style.margin = '';

  simSvg.innerHTML = '';
  simCaption.textContent = '';
  simTitle.textContent = titulo || 'Simulação';
  simFrame.classList.add('open');
  tocarSom('toggle');
  addLogEvent('info', `Simulação: ${titulo || ''}`);
}
function fecharSimulacao() {
  simFrame.classList.remove('open');
  cancelAnimationFrame(simState.rafId);
}
simCloseBtn.addEventListener('click', fecharSimulacao);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && simFrame.classList.contains('open')) fecharSimulacao();
});

tornarPainelArrastavel(simFrame, simTopbar);

const SIM_FORMULAS = {
  projetil(p, t) {
    const ang = (p.angulo ?? 45) * Math.PI / 180;
    const v0 = p.v0 ?? 30, g = p.g ?? 20;
    const x = (p.x0 ?? 10) + v0 * Math.cos(ang) * t;
    const h = v0 * Math.sin(ang) * t - 0.5 * g * t * t;
    return { x, y: (p.y0 ?? 90) - Math.max(h, 0), ativo: h >= 0 };
  },
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
  mhs(p, t) {
    const osc = (p.amplitude ?? 20) * Math.sin((2 * Math.PI * t / (p.periodo ?? 2)) + (p.fase ?? 0));
    const eixo = p.eixo || 'x';
    return { x: (p.x0 ?? 50) + (eixo === 'x' ? osc : 0), y: (p.y0 ?? 50) + (eixo === 'y' ? osc : 0), ativo: true };
  },
  pendulo(p, t) {
    const ang = ((p.amplitude ?? 30) * Math.PI / 180) * Math.sin((2 * Math.PI * t / (p.periodo ?? 2)) + (p.fase ?? 0));
    const comp = p.comprimento ?? 35;
    return { x: (p.pivoX ?? 50) + comp * Math.sin(ang), y: (p.pivoY ?? 15) + comp * Math.cos(ang), ativo: true };
  },
  orbital(p, t) {
    const ang = (2 * Math.PI * t / (p.periodo ?? 6)) + (p.fase ?? 0);
    return { x: (p.cx ?? 50) + (p.raio ?? 30) * Math.cos(ang), y: (p.cy ?? 50) + (p.raio ?? 30) * Math.sin(ang), ativo: true };
  },
  mola(p, t) {
    const osc = (p.amplitude ?? 20) * Math.exp(-(p.amortecimento ?? 0.3) * t) * Math.sin(2 * Math.PI * t / (p.periodo ?? 1.2));
    const eixo = p.eixo || 'y';
    return { x: (p.x0 ?? 50) + (eixo === 'x' ? osc : 0), y: (p.y0 ?? 20) + (eixo === 'y' ? osc : 0), ativo: true };
  },
};

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
      el.setAttribute('fill', 'rgba(4,12,17,0.85)');
      el.setAttribute('stroke', cor);
      el.setAttribute('stroke-width', 0.6);
      break;
    case 'retangulo':
      el = document.createElementNS(ns, 'rect');
      el.setAttribute('width', obj.largura ?? 8);
      el.setAttribute('height', obj.altura ?? 8);
      el.setAttribute('fill', 'rgba(4,12,17,0.85)');
      el.setAttribute('stroke', cor);
      el.setAttribute('stroke-width', 0.6);
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

let microfoneAtivo = true;

function aplicarEstadoMicrofone(ativo) {
  microfoneAtivo = ativo;
  micBtn.classList.toggle('active', ativo);
  micBtn.classList.toggle('muted', !ativo);
  micBtn.title = ativo
    ? 'Microfone ligado — clique para desligar'
    : 'Microfone desligado — clique para ligar';
}
aplicarEstadoMicrofone(false);

micBtn.setAttribute('role', 'button');
micBtn.setAttribute('tabindex', '0');
micBtn.setAttribute('aria-label', 'Conversar por voz');
micBtn.addEventListener('click', () => abrirVoz());
micBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirVoz(); } });

let ws = null; let primeiraConexao = true;
// Antes da primeira conexão boa, 3 falhas seguidas voltam para a tela de login (endereço errado, servidor fora).
let jaAutenticou = false; let falhasSeguidas = 0;
function conectar() {
  const token = lerToken();
  if (!token) { pedirToken(); return; }
  const url = urlDoServidor();
  try { ws = new WebSocket(url); } catch { pedirToken(`Endereço inválido: ${url}`); return; }
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
  };
  ws.onclose = (ev) => {
    setEstado('offline');
    if (ev.code === CODIGO_NAO_AUTENTICADO) { apagarToken(); pedirToken('Token recusado pelo servidor.'); return; }
    falhasSeguidas++;
    if (!jaAutenticou && falhasSeguidas >= 3) { pedirToken(`Não consegui conectar em ${url}.`); return; }
    setTimeout(conectar, 2000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (msg) => {
    let evento; try { evento = JSON.parse(msg.data); } catch { return; }
    switch (evento.type) {
      case 'auth_ok':
        jaAutenticou = true; falhasSeguidas = 0;
        perfilSilencioso = true; ws.send(JSON.stringify({ type: 'perfil_listar' }));
        setEstado('idle'); setSubsystem('websocket', true, false);
        if (!primeiraConexao) tocarSom('online');
        primeiraConexao = false;
        break;
      case 'log': addTermLine(evento.role, evento.text); break;
      case 'status': setEstado(evento.state); if (evento.state === 'thinking') setSubsystem('processamento', true, true); break;
      case 'memory': setSubsystem('memoria', true, true); break;
      case 'mic_state':
        aplicarEstadoMicrofone(evento.ativo);
        addLogEvent('info', evento.ativo ? 'Microfone ativado' : 'Microfone desativado');
        break;
      case 'voice_stats':
        setSubsystem('voz', true, true);
        break;
      case 'browser_navigate':
        abrirMedia(evento.url, evento.titulo, evento.url_externo, evento.bloqueado);
        break;
      case 'browser_screenshot':
        atualizarNavegacaoAoVivo(evento.titulo, evento.url, evento.imagem_base64);
        break;
      case 'map':
        abrirMapa(evento);
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
      case 'news_board':
        abrirNoticias(evento.titulo, evento.news);
        break;
      case 'weather':
        abrirClima(evento);
        break;
      case 'play_audio':
        abrirPlayerMusica(evento);
        break;
      case 'perfil':
        atualizarLeituraPerfil(evento.itens);
        if (perfilSilencioso) { perfilSilencioso = false; break; }
        abrirPerfil(evento.itens);
        break;
      case 'voz_sessao':
        iniciarVoz(evento);
        break;
      case 'voz_erro':
        fecharVoz();
        notify(evento.text, 'warning');
        break;
      case 'music_recent':
        abrirRecentes(evento.recentes);
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

/* ==========================================================================
   TELEMETRIA DECORATIVA DAS RÉGUAS LATERAIS (estilo Rainmeter, ref. imgs 1-3)
   Puramente cosmético — não depende do backend. Se um backend real enviar
   métricas reais (evento.type === 'system_stats'), basta preencher
   `atualizarTelemetria(dados)` com os valores recebidos.
   ========================================================================== */

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function setBar(fillId, valId, pct, label) {
  const fill = document.getElementById(fillId);
  const val = document.getElementById(valId);
  if (fill) fill.style.width = pct + '%';
  if (val) val.textContent = label ?? Math.round(pct) + '%';
}

function setRing(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  const circunferencia = 100.5;
  el.style.strokeDashoffset = circunferencia - (circunferencia * clamp(pct, 0, 100) / 100);
}

let telemetria = { cpu: 32, mem: 48, disk: 61, netUp: 18, netDown: 9, pwr: 98, wifi: 99 };

function passoAleatorio(valor, min, max, variacao) {
  const novo = valor + (Math.random() - 0.5) * variacao;
  return clamp(novo, min, max);
}

function atualizarTelemetria() {
  telemetria.cpu = passoAleatorio(telemetria.cpu, 8, 92, 10);
  telemetria.mem = passoAleatorio(telemetria.mem, 20, 85, 4);
  telemetria.disk = passoAleatorio(telemetria.disk, 40, 90, 1.5);
  telemetria.netUp = passoAleatorio(telemetria.netUp, 2, 70, 14);
  telemetria.netDown = passoAleatorio(telemetria.netDown, 2, 55, 10);
  telemetria.pwr = clamp(telemetria.pwr - 0.02, 40, 100);
  telemetria.wifi = passoAleatorio(telemetria.wifi, 88, 100, 3);

  setBar('statCpu', 'statCpuVal', telemetria.cpu);
  setBar('statMem', 'statMemVal', telemetria.mem);
  setBar('statDisk', 'statDiskVal', telemetria.disk);
  setBar('statNetUp', 'statNetUpVal', telemetria.netUp, Math.round(telemetria.netUp * 32) + ' K');
  setBar('statNetDown', 'statNetDownVal', telemetria.netDown, Math.round(telemetria.netDown * 1.8) + ' K');

  setRing('ringPwr', telemetria.pwr);
  setRing('ringWifi', telemetria.wifi);

  const tbPwr = document.getElementById('tbPwr');
  if (tbPwr) tbPwr.textContent = Math.round(telemetria.pwr) + '%';
}

setInterval(atualizarTelemetria, 1800);
atualizarTelemetria();

function popularRadar() {
  const radar = document.getElementById('railRadar');
  if (!radar) return;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const dot = document.createElement('div');
    const ang = Math.random() * Math.PI * 2;
    const raio = 18 + Math.random() * 16;
    dot.style.position = 'absolute';
    dot.style.left = `calc(50% + ${Math.cos(ang) * raio}px)`;
    dot.style.top = `calc(50% + ${Math.sin(ang) * raio}px)`;
    dot.style.width = '3px';
    dot.style.height = '3px';
    dot.style.borderRadius = '50%';
    dot.style.background = 'var(--cyan)';
    dot.style.boxShadow = '0 0 4px rgba(var(--cyan-rgb),.8)';
    dot.style.opacity = String(0.4 + Math.random() * 0.5);
    radar.appendChild(dot);
  }
}
popularRadar();

function popularSpark() {
  const spark = document.getElementById('railSpark');
  if (!spark) return;
  const n = 22;
  for (let i = 0; i < n; i++) {
    const bar = document.createElement('span');
    bar.style.height = (20 + Math.random() * 80) + '%';
    spark.appendChild(bar);
  }
  setInterval(() => {
    spark.querySelectorAll('span').forEach(bar => {
      bar.style.height = (15 + Math.random() * 85) + '%';
      bar.style.transition = 'height .5s ease';
    });
  }, 1200);
}
popularSpark();


function startCoreMorph() {

}

startCoreMorph();
// Tela de login: aparece sem token salvo, com token recusado ou quando não dá para conectar.
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginServidor = document.getElementById('loginServidor');
const loginToken = document.getElementById('loginToken');
const loginErro = document.getElementById('loginErro');
function pedirToken(erro = '') {
  loginErro.textContent = erro;
  loginOverlay.hidden = false;
  loginServidor.value = lerServidor();
  loginToken.value = lerToken();
  (loginToken.value ? loginServidor : loginToken).focus();
}
loginForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const servidor = loginServidor.value.trim().replace(/\/$/, '');
  const token = loginToken.value.trim();
  if (!token) return;
  if (!servidorValido(servidor)) { loginErro.textContent = 'O servidor precisa começar com http:// ou https://'; return; }
  salvarServidor(servidor);
  salvarToken(token);
  jaAutenticou = false; falhasSeguidas = 0;
  loginOverlay.hidden = true;
  conectar();
});

// Painel "o que sei sobre você": lista, corrige, esquece e adiciona itens do perfil.
const perfilFrame = document.getElementById('perfilFrame');
const perfilBody = document.getElementById('perfilBody');
const perfilAdd = document.getElementById('perfilAdd');
const perfilAddCategoria = document.getElementById('perfilAddCategoria');
const perfilAddTexto = document.getElementById('perfilAddTexto');
const TITULOS_PERFIL = {
  estilo: 'Como falar comigo', evitar: 'Evitar', preferencia: 'Preferências', traco: 'Personalidade',
  rotina: 'Rotina', objetivo: 'Objetivos', fato: 'Fatos',
};
const ORIGEM_PERFIL = { inferido: 'percebido', declarado: 'você disse', corrigido: 'você corrigiu' };

function enviarPerfil(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) { setEstado('offline'); return; }
  ws.send(JSON.stringify(msg));
}

function abrirPerfil(itens) {
  const lista = itens || [];
  perfilBody.innerHTML = Object.keys(TITULOS_PERFIL).map(cat => {
    const daCat = lista.filter(i => i.categoria === cat);
    if (!daCat.length) return '';
    return `<section class="perfil-secao"><h3 class="perfil-titulo">${TITULOS_PERFIL[cat]}</h3>${daCat.map(i => `
      <div class="perfil-item" data-id="${escapeXml(i.id)}">
        <div class="perfil-texto">${escapeXml(i.conteudo)}</div>
        <div class="perfil-meta">
          <span class="perfil-barra" title="Confiança ${Math.round(i.confianca * 100)}%"><span style="width:${Math.round(i.confianca * 100)}%"></span></span>
          <span>${ORIGEM_PERFIL[i.origem] || ''}</span>
          <button type="button" class="perfil-acao" data-acao="corrigir">corrigir</button>
          <button type="button" class="perfil-acao" data-acao="esquecer">esquecer</button>
        </div>
      </div>`).join('')}</section>`;
  }).join('') || '<div class="term-empty">Ainda não sei nada sobre você. Converse comigo ou adicione algo abaixo.</div>';

  if (!perfilFrame.classList.contains('open')) {
    perfilFrame.style.position = ''; perfilFrame.style.left = ''; perfilFrame.style.top = ''; perfilFrame.style.margin = '';
    perfilFrame.classList.add('open');
    tocarSom('toggle');
  }
}

perfilBody.addEventListener('click', (ev) => {
  const botao = ev.target.closest('.perfil-acao');
  if (!botao) return;
  const itemEl = botao.closest('.perfil-item');
  const id = itemEl.dataset.id;
  if (botao.dataset.acao === 'esquecer') {
    enviarPerfil({ type: 'perfil_apagar', id });
    return;
  }
  const textoEl = itemEl.querySelector('.perfil-texto');
  const input = document.createElement('input');
  input.className = 'perfil-input'; input.maxLength = 500; input.value = textoEl.textContent;
  input.setAttribute('aria-label', 'Texto corrigido');
  textoEl.replaceWith(input);
  input.focus();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) enviarPerfil({ type: 'perfil_corrigir', id, conteudo: input.value.trim() });
    if (e.key === 'Escape') { e.stopPropagation(); input.replaceWith(textoEl); }
  });
});

perfilAdd.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const conteudo = perfilAddTexto.value.trim();
  if (!conteudo) return;
  enviarPerfil({ type: 'perfil_adicionar', categoria: perfilAddCategoria.value, conteudo });
  perfilAddTexto.value = '';
});

document.getElementById('perfilClose').addEventListener('click', () => perfilFrame.classList.remove('open'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && perfilFrame.classList.contains('open')) perfilFrame.classList.remove('open');
});
tornarPainelArrastavel(perfilFrame, document.getElementById('perfilTopbar'));

// Celular: núcleo de anéis no topo, com leituras nos cantos.
let perfilSilencioso = false;
desenharNucleo(document.getElementById('mobileCoreSvg'));
const mcPerfil = document.getElementById('mcPerfil');
const mcHora = document.getElementById('mcHora');
// Pode ser chamada antes deste trecho rodar (setEstado no início): busca os elementos na hora.
function atualizarLeiturasNucleo(estado, label) {
  const mcLink = document.getElementById('mcLink');
  const mcEstado = document.getElementById('mcEstado');
  if (!mcLink || !mcEstado) return;
  mcLink.textContent = estado === 'offline' ? 'offline' : 'online';
  mcLink.classList.toggle('alerta', estado === 'offline');
  mcEstado.textContent = label.toLowerCase();
}
function atualizarLeituraPerfil(itens) {
  const lista = itens || [];
  const incertos = lista.filter(i => i.confianca < 0.5).length;
  mcPerfil.textContent = `${lista.length} ${lista.length === 1 ? 'item' : 'itens'}${incertos ? ` · ${incertos} incerto${incertos === 1 ? '' : 's'}` : ''}`;
}
function atualizarHora() {
  mcHora.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
atualizarHora();
setInterval(atualizarHora, 15000);

// Modo voz: o servidor dá uma chave temporária e o app fala direto com a OpenAI.
const vozOverlay = document.getElementById('vozOverlay');
const vozEstado = document.getElementById('vozEstado');
const vozFala = document.getElementById('vozFala');
const atualizarOnda = desenharNucleo(document.getElementById('vozSvg'), { onda: true });
atualizarOnda(0);
const ROTULOS_VOZ = { conectando: 'CONECTANDO', ouvindo: 'OUVINDO', pensando: 'PENSANDO', falando: 'FALANDO' };
let quadroVoz = 0;
const voz = criarVoz({
  aoEstado: (estado) => {
    vozEstado.textContent = ROTULOS_VOZ[estado] || estado.toUpperCase();
    vozOverlay.dataset.estado = estado;
  },
  aoParcial: (texto) => { vozFala.textContent = texto; },
  aoFala: (papel, texto) => {
    vozFala.textContent = papel === 'user' ? `"${texto}"` : texto;
    addTermLine(papel, texto);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'voz_transcricao', papel, texto: texto.slice(0, 8000) }));
  },
  aoErro: (mensagem) => { notify(mensagem, 'warning'); addLogEvent('error', `Voz: ${mensagem}`); fecharVoz(); },
});

function animarVoz() {
  atualizarOnda(voz.nivel());
  quadroVoz = requestAnimationFrame(animarVoz);
}

function abrirVoz() {
  if (!vozOverlay.hidden) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) { setEstado('offline'); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    notify('Este navegador não deixa usar o microfone aqui.', 'warning');
    return;
  }
  tocarSom('mic');
  vozFala.textContent = '';
  vozEstado.textContent = 'CONECTANDO';
  vozOverlay.dataset.estado = 'conectando';
  vozOverlay.hidden = false;
  aplicarEstadoMicrofone(true);
  cancelAnimationFrame(quadroVoz);
  animarVoz();
  ws.send(JSON.stringify({ type: 'voz_iniciar' }));
}

function iniciarVoz(sessao) {
  if (vozOverlay.hidden) return;
  voz.iniciar(sessao).catch((erro) => {
    const msg = erro?.name === 'NotAllowedError' ? 'Sem permissão para usar o microfone.' : (erro?.message || 'Não consegui iniciar a voz.');
    notify(msg, 'warning');
    addLogEvent('error', `Voz: ${msg}`);
    fecharVoz();
  });
}

function fecharVoz() {
  voz.parar();
  cancelAnimationFrame(quadroVoz);
  atualizarOnda(0);
  vozOverlay.hidden = true;
  aplicarEstadoMicrofone(false);
}

document.getElementById('vozParar').addEventListener('click', fecharVoz);
document.getElementById('vozSvg').addEventListener('click', fecharVoz);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !vozOverlay.hidden) fecharVoz(); });

conectar();
