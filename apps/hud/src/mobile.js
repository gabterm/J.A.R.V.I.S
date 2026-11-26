// Interface do celular (até 640 px), no estilo do NEXUS. O main.js continua dono da conexão,
// da voz e do perfil; aqui só se desenha e se repassam os toques.
import './mobile.css';

const NS = 'http://www.w3.org/2000/svg';
const CELULAR = window.matchMedia('(max-width: 640px)');
const TEMAS = ['tron', 'cyberpunk', 'ambar'];
const NOMES_TEMA = { tron: 'Tron', cyberpunk: 'Cyberpunk', ambar: 'Âmbar' };
const CHAVE_TEMA = 'jarvis.tema';
const TITULOS = {
  estilo: 'Como falar comigo', evitar: 'Evitar', preferencia: 'Preferências', traco: 'Personalidade',
  rotina: 'Rotina', objetivo: 'Objetivos', fato: 'Fatos',
};
const ORIGEM = { inferido: 'percebido', declarado: 'você disse', corrigido: 'você corrigiu' };
const ESTADOS = { idle: 'pronto', thinking: 'pensando', speaking: 'falando', listening: 'ouvindo', offline: 'offline' };
const VOZ = { conectando: 'CONECTANDO', ouvindo: 'OUVINDO', pensando: 'PENSANDO', falando: 'FALANDO' };
const MAX_MSGS = 80;

const $ = (id) => document.getElementById(id);
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// ---------- Núcleo do JARVIS ----------
function el(tag, attrs, pai) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  pai?.append(e);
  return e;
}
const pt = (r, g) => { const a = (g - 90) * Math.PI / 180; return [(Math.cos(a) * r).toFixed(2), (Math.sin(a) * r).toFixed(2)]; };
function arco(r, g0, g1) {
  const [x0, y0] = pt(r, g0), [x1, y1] = pt(r, g1);
  return `M${x0} ${y0}A${r} ${r} 0 ${g1 - g0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}
function setor(r0, r1, g0, g1) {
  const [a, b] = pt(r1, g0), [c, d] = pt(r1, g1), [e, f] = pt(r0, g1), [g, h] = pt(r0, g0);
  return `M${a} ${b}A${r1} ${r1} 0 0 1 ${c} ${d}L${e} ${f}A${r0} ${r0} 0 0 0 ${g} ${h}Z`;
}
const linha = (pai, r0, r1, g, cls) => { const [x0, y0] = pt(r0, g), [x1, y1] = pt(r1, g); el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: cls }, pai); };

/** Desenha o núcleo e devolve os blocos da faixa (para acender com o áudio). */
function montarNucleo(svg) {
  svg.replaceChildren();
  const planta = el('g', { class: 'g-planta' }, svg);
  el('circle', { r: 30, class: 'planta', 'stroke-dasharray': '3 2' }, planta);
  el('circle', { r: 22, class: 'planta' }, planta);
  for (let k = 0; k < 6; k++) linha(planta, 0, 30, k * 60, 'planta');
  el('rect', { x: -14, y: 18, width: 28, height: 9, class: 'planta' }, planta);

  const ext = el('g', { class: 'entra' }, svg);
  for (const [g0, g1] of [[8, 128], [134, 250], [256, 362]]) el('path', { d: arco(92, g0, g1), class: 'forte', 'stroke-width': 4.2 }, ext);
  el('path', { d: arco(97, 28, 58), class: 'forte', 'stroke-width': 1.6 }, ext);
  el('path', { d: arco(97, 206, 226), class: 'forte', 'stroke-width': 1.6 }, ext);
  for (let k = 0; k < 4; k++) linha(ext, 86, 89, 262 + k * 3.2, 'tk');

  const tick = el('g', { class: 'g-tick' }, el('g', { class: 'entra e1' }, svg));
  for (let i = 0; i < 48; i++) linha(tick, 78, 86, i * 7.5, 'tk');

  const faixa = el('g', { class: 'g-faixa' }, el('g', { class: 'entra e2' }, svg));
  const de = 228, ate = 492, total = 22, passo = (ate - de) / total;
  const blocos = [];
  for (let i = 0; i < total; i++) blocos.push(el('path', { d: setor(58.5, 75, de + i * passo + 0.4, de + (i + 1) * passo - 0.4), class: 'bloco' }, faixa));
  el('path', { d: arco(75.6, de, ate), class: 'fino', 'stroke-width': 0.7 }, faixa);
  el('path', { d: arco(57.9, de, ate), class: 'fino', 'stroke-width': 0.7 }, faixa);

  const amb = el('g', { class: 'g-ambar' }, el('g', { class: 'entra e3' }, svg));
  el('path', { d: arco(55, 222, 300), class: 'ambar', 'stroke-width': 1.3 }, amb);
  const [bx, by] = pt(55, 218);
  el('rect', { x: bx - 2.2, y: by - 9, width: 4.4, height: 12, rx: 2.2, class: 'ambar', 'stroke-width': 1.1, transform: `rotate(-40 ${bx} ${by})` }, amb);
  const pontos = el('g', { class: 'pontos entra e3' }, svg);
  for (let k = 0; k < 5; k++) { const [x, y] = pt(56.5, -14 + k * 7); el('circle', { cx: x, cy: y, r: 1.25 }, pontos); }
  el('path', { d: arco(56.5, -26, -18), class: 'fino', 'stroke-width': 1.2 }, svg);

  const interno = el('g', { class: 'interno' }, el('g', { class: 'entra e4' }, svg));
  el('path', { d: arco(48, 210, 560), class: 'forte', 'stroke-width': 5 }, interno);
  el('circle', { r: 42.5, class: 'fino', 'stroke-width': 0.6 }, interno);
  el('text', { y: 0, class: 'nome entra e4' }, svg).textContent = 'J.A.R.V.I.S.';
  return blocos;
}

/** Com som, os blocos acendem conforme o nível; parado, um brilho percorre a faixa. */
function acender(blocos, nivel, fase) {
  const qtd = Math.round(Math.min(1, nivel) * blocos.length);
  blocos.forEach((b, i) => b.classList.toggle('on', qtd > 1 ? i < qtd : Math.abs(i - (fase % (blocos.length + 6)) + 3) < 2));
}

// ---------- Interface ----------
/**
 * @param {{ enviarTexto(t: string): void, abrirVoz(): void, fecharVoz(): void, enviar(msg: object): void }} acoes
 */
export function criarMobile(acoes) {
  const app = $('mApp');
  const blocosPainel = montarNucleo($('mCore'));
  const blocosVoz = montarNucleo($('mCoreVoz'));
  let fase = 0; let vozAberta = false; let ultimoPerfil = [];

  // Boot (linha de CRT) e relógio
  setTimeout(() => $('mBoot').classList.add('fim'), 700);
  setTimeout(() => $('mBoot').remove(), 1300);
  function relogio() {
    const d = new Date();
    $('mClock').textContent = d.toLocaleTimeString('pt-BR');
    $('mHora').textContent = hora();
    $('mAno').textContent = String(d.getFullYear());
    $('mData').textContent = `${d.getDate()} ${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}`;
  }
  relogio();
  setInterval(relogio, 1000);
  setInterval(() => { fase = (fase + 1) % 1000; if (!vozAberta) acender(blocosPainel, 0, fase); }, 110);

  // Tema (guardado no aparelho)
  function aplicarTema(tema) {
    app.dataset.tema = tema;
    $('mBtnTema').textContent = `Tema: ${NOMES_TEMA[tema]}`;
  }
  try { const salvo = localStorage.getItem(CHAVE_TEMA); if (TEMAS.includes(salvo)) aplicarTema(salvo); } catch { /* sem armazenamento: fica no padrão */ }
  $('mBtnTema').addEventListener('click', () => {
    const prox = TEMAS[(TEMAS.indexOf(app.dataset.tema) + 1) % TEMAS.length];
    aplicarTema(prox);
    try { localStorage.setItem(CHAVE_TEMA, prox); } catch { /* sem armazenamento: vale só nesta sessão */ }
  });

  // Telas
  function mostrar(id) {
    for (const t of app.querySelectorAll('.m-tela')) t.classList.toggle('on', t.id === id);
  }
  $('mBtnPerfil').addEventListener('click', () => { acoes.enviar({ type: 'perfil_listar' }); renderPerfil(ultimoPerfil); mostrar('mPerfil'); });
  $('mBtnVoltar').addEventListener('click', () => { $('mPerfilAdd').hidden = true; mostrar('mPainel'); });
  $('mBtnVoz').addEventListener('click', () => acoes.abrirVoz());
  $('mBtnEncerrar').addEventListener('click', () => acoes.fecharVoz());

  // Conversa
  function escrever(div, texto) {
    // Resposta aparece letra a letra, sem passar de ~1,2 s.
    const passo = Math.max(1, Math.ceil(texto.length / 80));
    let i = 0;
    div.classList.add('digitando');
    const t = div.querySelector('.t');
    const alvo = document.createTextNode('');
    div.insertBefore(alvo, t);
    const tique = () => {
      i = Math.min(texto.length, i + passo);
      alvo.textContent = texto.slice(0, i);
      $('mMsgs').scrollTop = $('mMsgs').scrollHeight;
      if (i < texto.length) setTimeout(tique, 15); else div.classList.remove('digitando');
    };
    tique();
  }
  function adicionar(caixa, papel, texto, animar) {
    caixa.querySelector('.m-vazio')?.remove();
    const div = document.createElement('div');
    div.className = `m-m ${papel === 'user' ? 'u' : papel === 'system' ? 's' : 'j'}`;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = hora();
    div.append(t);
    caixa.append(div);
    if (animar) escrever(div, texto); else div.insertBefore(document.createTextNode(texto), t);
    while (caixa.children.length > MAX_MSGS) caixa.firstChild.remove();
    caixa.scrollTop = caixa.scrollHeight;
  }
  $('mForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = $('mInput').value.trim();
    if (!texto) return;
    $('mInput').value = '';
    acoes.enviarTexto(texto);
  });

  // Perfil
  function renderPerfil(itens) {
    const lista = itens || [];
    const disse = lista.filter((i) => i.origem !== 'inferido').length;
    $('mPerfilTotal').textContent = String(lista.length);
    $('mPerfilDisse').textContent = String(disse);
    $('mPerfilPercebido').textContent = String(lista.length - disse);
    $('mPerfilIncertos').textContent = String(lista.filter((i) => i.confianca < 0.5).length);
    const caixa = $('mPerfilLista');
    caixa.replaceChildren();
    if (!lista.length) {
      const v = document.createElement('div');
      v.className = 'm-vazio';
      v.textContent = 'Ainda não sei nada sobre você. Converse comigo ou toque em “+ Adicionar”.';
      caixa.append(v);
      return;
    }
    for (const cat of Object.keys(TITULOS)) {
      const daCat = lista.filter((i) => i.categoria === cat);
      if (!daCat.length) continue;
      const h = document.createElement('div');
      h.className = 'm-cat';
      h.textContent = TITULOS[cat];
      caixa.append(h);
      for (const item of daCat) caixa.append(itemPerfil(item));
    }
  }
  function itemPerfil(item) {
    const pct = Math.round(item.confianca * 100);
    const div = document.createElement('div');
    div.className = 'm-item';
    const txt = document.createElement('button');
    txt.type = 'button';
    txt.className = 'txt';
    txt.textContent = item.conteudo;
    txt.setAttribute('aria-expanded', 'false');
    const p = document.createElement('span');
    p.className = 'pct';
    p.textContent = `${pct}%`;
    const bar = document.createElement('div');
    bar.className = 'm-bar';
    const fill = document.createElement('div');
    fill.style.width = `${pct}%`;
    if (item.confianca < 0.5) fill.className = 'baixa';
    bar.append(fill);
    const src = document.createElement('span');
    src.className = 'src';
    src.textContent = `${ORIGEM[item.origem] || ''}${item.confianca < 0.5 ? ' · incerto' : ''}`;
    const acoesEl = document.createElement('span');
    acoesEl.className = 'acoes';
    acoesEl.hidden = true;
    const corrigir = document.createElement('button');
    corrigir.type = 'button'; corrigir.className = 'm-btn'; corrigir.textContent = 'Corrigir';
    const esquecer = document.createElement('button');
    esquecer.type = 'button'; esquecer.className = 'm-btn'; esquecer.textContent = 'Esquecer';
    acoesEl.append(corrigir, esquecer);
    txt.addEventListener('click', () => {
      acoesEl.hidden = !acoesEl.hidden;
      txt.setAttribute('aria-expanded', String(!acoesEl.hidden));
    });
    esquecer.addEventListener('click', () => acoes.enviar({ type: 'perfil_apagar', id: item.id }));
    corrigir.addEventListener('click', () => {
      const input = document.createElement('input');
      input.value = item.conteudo; input.maxLength = 500;
      input.setAttribute('aria-label', 'Texto corrigido');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) acoes.enviar({ type: 'perfil_corrigir', id: item.id, conteudo: input.value.trim() });
        if (e.key === 'Escape') input.remove();
      });
      div.append(input);
      input.focus();
    });
    div.append(txt, p, bar, src, acoesEl);
    return div;
  }
  $('mBtnAdicionar').addEventListener('click', () => {
    $('mPerfilAdd').hidden = !$('mPerfilAdd').hidden;
    if (!$('mPerfilAdd').hidden) $('mAddTexto').focus();
  });
  $('mPerfilAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const conteudo = $('mAddTexto').value.trim();
    if (!conteudo) return;
    acoes.enviar({ type: 'perfil_adicionar', categoria: $('mAddCat').value, conteudo });
    $('mAddTexto').value = '';
    $('mPerfilAdd').hidden = true;
  });

  // Voz: gráfico de linha (como o "Uso da CPU" do NEXUS) e faixa do núcleo
  const N = 120; const historico = new Array(N).fill(0);
  let ultimaAmostra = 0; let inicioVoz = 0; let falas = 0;
  function desenharGrafico() {
    const c = $('mGrafico');
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    const estilo = getComputedStyle(app);
    const rgb = estilo.getPropertyValue('--rgb').trim(), acc = estilo.getPropertyValue('--accent-rgb').trim();
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = `rgba(${rgb},.10)`; ctx.lineWidth = 1;
    for (const f of [0.33, 0.66]) { ctx.beginPath(); ctx.moveTo(0, h * f); ctx.lineTo(w, h * f); ctx.stroke(); }
    const passo = w / (N - 1), ys = historico.map((v) => h - 5 * dpr - Math.min(1, v) * (h - 12 * dpr));
    const tracar = () => {
      ctx.beginPath(); ctx.moveTo(0, ys[0]);
      for (let x = 0; x < N - 1; x++) ctx.quadraticCurveTo(x * passo, ys[x], (x + 0.5) * passo, (ys[x] + ys[x + 1]) / 2);
      ctx.lineTo(w, ys[N - 1]);
    };
    tracar(); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(${rgb},.22)`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fill();
    tracar();
    ctx.strokeStyle = `rgba(${rgb},.95)`; ctx.lineWidth = 1.4 * dpr;
    ctx.shadowColor = `rgba(${rgb},.8)`; ctx.shadowBlur = 6 * dpr; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = `rgb(${acc})`; ctx.beginPath(); ctx.arc(w - 2 * dpr, ys[N - 1], 2.5 * dpr, 0, Math.PI * 2); ctx.fill();
  }

  return {
    ativo: () => CELULAR.matches,
    mensagem(papel, texto) { adicionar($('mMsgs'), papel, texto || '', papel === 'jarvis'); },
    estado(estado) {
      const b = $('mEstado');
      b.textContent = ESTADOS[estado] || estado;
      $('mLink').textContent = estado === 'offline' ? 'offline' : 'online';
      $('mLink').className = estado === 'offline' ? 'alerta' : 'ok';
      if (estado === 'thinking') app.dataset.estado = 'pensando'; else delete app.dataset.estado;
    },
    perfil(itens) {
      ultimoPerfil = itens || [];
      $('mPerfilQtd').textContent = `${ultimoPerfil.length} ${ultimoPerfil.length === 1 ? 'item' : 'itens'}`;
      renderPerfil(ultimoPerfil);
    },
    abrirPerfil() { mostrar('mPerfil'); },
    mostrarVoz() {
      vozAberta = true; falas = 0; inicioVoz = performance.now(); historico.fill(0);
      $('mVozFalas').textContent = '0'; $('mVozModelo').textContent = '—'; $('mVozTempo').textContent = '00:00';
      $('mVozFala').replaceChildren();
      const v = document.createElement('div'); v.className = 'm-vazio'; v.textContent = 'aguardando você falar…';
      $('mVozFala').append(v);
      this.vozEstado('conectando');
      mostrar('mVoz');
      requestAnimationFrame(desenharGrafico);
    },
    esconderVoz() { vozAberta = false; delete app.dataset.estado; acender(blocosVoz, 0, 0); mostrar('mPainel'); },
    vozModelo(modelo) { $('mVozModelo').textContent = (modelo || '—').replace(/^gpt-realtime-?/, 'rt-') || '—'; },
    vozEstado(estado) {
      $('mVozEstado').textContent = VOZ[estado] || estado.toUpperCase();
      if (estado === 'pensando') app.dataset.estado = 'pensando'; else delete app.dataset.estado;
    },
    vozParcial(texto) {
      const caixa = $('mVozFala');
      let p = caixa.querySelector('.m-parcial');
      if (!p) { caixa.querySelector('.m-vazio')?.remove(); p = document.createElement('div'); p.className = 'm-m j m-parcial'; caixa.append(p); }
      p.textContent = texto;
      caixa.scrollTop = caixa.scrollHeight;
    },
    vozFala(papel, texto) {
      $('mVozFala').querySelector('.m-parcial')?.remove();
      adicionar($('mVozFala'), papel, texto, false);
      falas++; $('mVozFalas').textContent = String(falas);
    },
    vozNivel(nivel) {
      if (!vozAberta) return;
      acender(blocosVoz, nivel * 1.6, fase);
      const agora = performance.now();
      if (agora - ultimaAmostra > 80) {
        ultimaAmostra = agora;
        historico.push(historico[N - 1] * 0.5 + nivel * 0.5); historico.shift();
        $('mVozNivel').textContent = `${Math.round(Math.min(1, nivel) * 100)}%`;
        const s = Math.floor((agora - inicioVoz) / 1000);
        $('mVozTempo').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        desenharGrafico();
      }
    },
  };
}
