/**
 * Loop de animação único do site. Todas as animações se inscrevem aqui,
 * e tudo pausa automaticamente quando a aba fica oculta.
 */

const assinantes = new Set();
let idQuadro = 0;
let ultimoInstante = 0;
let pausado = document.hidden;

function quadro(agora) {
  idQuadro = 0;
  // Delta em segundos, limitado para evitar saltos depois de travadas
  const dt = ultimoInstante ? Math.min((agora - ultimoInstante) / 1000, 0.05) : 1 / 60;
  ultimoInstante = agora;
  for (const funcao of assinantes) {
    // Um erro numa animação não pode parar todas as outras (nem o próximo quadro)
    try {
      funcao(dt, agora / 1000);
    } catch (erro) {
      console.error('Erro num quadro de animação:', erro);
    }
  }
  if (!assinantes.size) ultimoInstante = 0;
  agendar();
}

function agendar() {
  if (idQuadro || pausado || !assinantes.size) return;
  idQuadro = requestAnimationFrame(quadro);
}

/**
 * Inscreve uma função chamada a cada quadro com (dt, tempoEmSegundos).
 * Devolve a função que cancela a inscrição.
 */
export function aoQuadro(funcao) {
  assinantes.add(funcao);
  agendar();
  return () => assinantes.delete(funcao);
}

document.addEventListener('visibilitychange', () => {
  pausado = document.hidden;
  if (pausado) {
    cancelAnimationFrame(idQuadro);
    idQuadro = 0;
  } else {
    ultimoInstante = 0;
    agendar();
  }
});
