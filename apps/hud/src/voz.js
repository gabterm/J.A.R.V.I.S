// Conversa por voz direto com a OpenAI (Realtime API, WebRTC). O servidor só entrega a chave temporária.
const URL_CHAMADA = 'https://api.openai.com/v1/realtime/calls';

function medidor(contexto, stream) {
  const analisador = contexto.createAnalyser();
  analisador.fftSize = 512;
  contexto.createMediaStreamSource(stream).connect(analisador);
  const dados = new Uint8Array(analisador.fftSize);
  return () => {
    analisador.getByteTimeDomainData(dados);
    let soma = 0;
    for (const v of dados) { const x = (v - 128) / 128; soma += x * x; }
    return Math.min(1, Math.sqrt(soma / dados.length) * 4);
  };
}

/**
 * eventos: aoEstado(estado), aoFala(papel, texto), aoParcial(texto), aoErro(mensagem)
 * estados: 'conectando' | 'ouvindo' | 'pensando' | 'falando'
 */
export function criarVoz(eventos) {
  let pc = null; let mic = null; let audio = null; let contexto = null;
  let nivelEntrada = () => 0; let nivelSaida = () => 0;
  let parcial = '';

  function tratar(ev) {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started': eventos.aoEstado('ouvindo'); break;
      case 'input_audio_buffer.speech_stopped': eventos.aoEstado('pensando'); break;
      case 'output_audio_buffer.started': eventos.aoEstado('falando'); break;
      case 'output_audio_buffer.stopped': eventos.aoEstado('ouvindo'); break;
      case 'conversation.item.input_audio_transcription.completed':
        if (ev.transcript?.trim()) eventos.aoFala('user', ev.transcript.trim());
        break;
      case 'response.output_audio_transcript.delta':
        parcial += ev.delta || '';
        eventos.aoParcial(parcial);
        break;
      case 'response.output_audio_transcript.done':
        parcial = '';
        if (ev.transcript?.trim()) eventos.aoFala('jarvis', ev.transcript.trim());
        break;
      case 'error':
        eventos.aoErro(ev.error?.message || 'Erro na sessão de voz.');
        break;
    }
  }

  async function iniciar({ segredo }) {
    eventos.aoEstado('conectando');
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    contexto = new AudioContext();
    nivelEntrada = medidor(contexto, mic);

    pc = new RTCPeerConnection();
    audio = new Audio();
    audio.autoplay = true;
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0];
      nivelSaida = medidor(contexto, e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (pc && ['failed', 'disconnected'].includes(pc.connectionState)) eventos.aoErro('A conexão de voz caiu.');
    };
    for (const trilha of mic.getAudioTracks()) pc.addTrack(trilha, mic);
    const canal = pc.createDataChannel('oai-events');
    canal.onmessage = (m) => { try { tratar(JSON.parse(m.data)); } catch (erro) { console.warn('evento de voz inválido', erro); } };
    canal.onopen = () => eventos.aoEstado('ouvindo');

    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    const resposta = await fetch(URL_CHAMADA, {
      method: 'POST',
      body: oferta.sdp,
      headers: { Authorization: `Bearer ${segredo}`, 'Content-Type': 'application/sdp' },
    });
    if (!resposta.ok) throw new Error(`A OpenAI recusou a chamada (${resposta.status}).`);
    await pc.setRemoteDescription({ type: 'answer', sdp: await resposta.text() });
  }

  function parar() {
    pc?.getSenders().forEach((s) => s.track?.stop());
    pc?.close();
    mic?.getTracks().forEach((t) => t.stop());
    if (audio) audio.srcObject = null;
    contexto?.close().catch((erro) => console.warn('não fechou o áudio', erro));
    pc = null; mic = null; audio = null; contexto = null; parcial = '';
    nivelEntrada = () => 0; nivelSaida = () => 0;
  }

  return { iniciar, parar, nivel: () => Math.max(nivelEntrada(), nivelSaida()), ativa: () => pc !== null };
}
