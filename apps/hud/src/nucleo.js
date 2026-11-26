// Núcleo de anéis (estilo HUD holográfico): usado no celular (tela principal) e no modo voz.
const NS = 'http://www.w3.org/2000/svg';

function anel(r, largura, traco, cor, opacidade, giro) {
  const g = document.createElementNS(NS, 'g');
  if (giro) g.setAttribute('class', giro);
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('r', r);
  c.setAttribute('class', `nc-anel ${cor}`);
  c.setAttribute('stroke-width', largura);
  if (traco) c.setAttribute('stroke-dasharray', traco);
  c.setAttribute('opacity', opacidade);
  g.appendChild(c);
  return g;
}

/** Desenha o núcleo dentro de um <svg viewBox="-100 -100 200 200">. Com `onda`, devolve um atualizador de nível. */
export function desenharNucleo(svg, { onda = false, rotulo = 'JARVIS' } = {}) {
  svg.replaceChildren(
    anel(97, 0.5, '', 'ciano', 0.3),
    anel(91, 4, '0.6 2.54', 'ciano', 0.45, 'nc-rev'),
    anel(80, 3, '60 10 30 10 90 14 20 40', 'ciano', 0.9, 'nc-gira'),
    anel(68, 1.5, '120 30 40 30', 'ambar', 0.9, 'nc-rev'),
    anel(57, 7, '1.5 2.5', 'ciano', 0.3, 'nc-gira'),
    anel(44, 1.2, '', 'ciano', 0.8),
  );
  const miolo = document.createElementNS(NS, 'circle');
  miolo.setAttribute('r', '30');
  miolo.setAttribute('class', 'nc-miolo');
  const texto = document.createElementNS(NS, 'text');
  texto.setAttribute('y', '3');
  texto.setAttribute('text-anchor', 'middle');
  texto.setAttribute('class', 'nc-rotulo');
  texto.textContent = rotulo;
  svg.append(miolo, texto);
  if (!onda) return () => {};

  // Onda na borda: 120 traços cuja altura acompanha o nível do áudio (0 a 1).
  const grupo = document.createElementNS(NS, 'g');
  grupo.setAttribute('class', 'nc-onda');
  const tracos = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', (Math.cos(a) * 84).toFixed(1));
    l.setAttribute('y1', (Math.sin(a) * 84).toFixed(1));
    l.setAttribute('class', i % 9 ? 'ciano' : 'ambar');
    grupo.appendChild(l);
    tracos.push({ l, cos: Math.cos(a), sin: Math.sin(a), fase: i * 0.7 });
  }
  svg.insertBefore(grupo, svg.firstChild);
  let t = 0;
  return (nivel) => {
    t += 0.08;
    for (const { l, cos, sin, fase } of tracos) {
      const h = 2 + nivel * 18 * (0.5 + 0.5 * Math.abs(Math.sin(fase + t)));
      l.setAttribute('x2', (cos * (84 + h)).toFixed(1));
      l.setAttribute('y2', (sin * (84 + h)).toFixed(1));
    }
  };
}
