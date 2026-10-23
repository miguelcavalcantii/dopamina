/**
 * Sequenciador em semicolcheias com agendamento antecipado no relógio do AudioContext.
 * Chama `aoPasso(passo, quando)` para cada semicolcheia, um pouco antes de ela tocar.
 */
export function criarSequenciador(audio, { bpm = 120, aoPasso }) {
  let ativo = false;
  let passo = 0;
  let proximo = 0;
  let timer = 0;
  const duracaoPasso = () => 60 / bpm / 4;

  function agendar() {
    if (!audio.ativo || document.hidden) return;
    const agora = audio.ctx.currentTime;
    if (proximo < agora - 0.2) proximo = agora + 0.05; // voltou de uma pausa longa
    while (proximo < agora + 0.15) {
      aoPasso(passo, proximo);
      passo++;
      proximo += duracaoPasso();
    }
  }

  return {
    /** Começa no instante absoluto `inicio` (padrão: daqui a 0,1 s). */
    iniciar(inicio) {
      if (ativo) return;
      ativo = true;
      passo = 0;
      proximo = inicio ?? audio.agora + 0.1;
      timer = setInterval(agendar, 25);
      agendar();
    },
    parar() {
      ativo = false;
      clearInterval(timer);
    },
    definirBpm(novo) {
      bpm = novo;
    },
    get ativo() {
      return ativo;
    },
  };
}
