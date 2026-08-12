/* ================= utilitários compartilhados ================= */

export let animSpeedMult = 1;
export function setAnimSpeedMult(v) { animSpeedMult = v; }

export function getCyanRgb() {
  return getComputedStyle(document.body).getPropertyValue('--cyan-rgb').trim() || '70, 230, 255';
}

export function formatMessage(text) {
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

export function typewriter(el, texto) {
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
