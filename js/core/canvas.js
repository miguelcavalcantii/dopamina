/**
 * Mantém um <canvas> no tamanho do seu elemento, respeitando o devicePixelRatio.
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ maxDpr?: number, aoRedimensionar?: (estado: {largura:number, altura:number, dpr:number}) => void }} opcoes
 */
export function criarCanvasResponsivo(canvas, { maxDpr = 2, aoRedimensionar } = {}) {
  const estado = { largura: 0, altura: 0, dpr: 1 };

  const aplicar = () => {
    const caixa = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const largura = Math.max(1, Math.round(caixa.width));
    const altura = Math.max(1, Math.round(caixa.height));
    if (largura === estado.largura && altura === estado.altura && dpr === estado.dpr) return;
    Object.assign(estado, { largura, altura, dpr });
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    aoRedimensionar?.(estado);
  };

  const observador = new ResizeObserver(aplicar);
  observador.observe(canvas);
  // Zoom do navegador muda o devicePixelRatio sem mudar o tamanho do elemento
  window.addEventListener('resize', aplicar);
  aplicar();

  return {
    estado,
    destruir() {
      observador.disconnect();
      window.removeEventListener('resize', aplicar);
    },
  };
}
