/**
 * Ícones em SVG de traço (24×24), desenhados com currentColor.
 */

const CAMINHOS = {
  gota: '<path d="M12 3c3.5 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.4 6-11z"/>',
  onda: '<path d="M2 10c2.5-3 4.5-3 7 0s4.5 3 7 0 4.5-3 6 0"/><path d="M2 16c2.5-3 4.5-3 7 0s4.5 3 7 0 4.5-3 6 0" opacity=".6"/>',
  chuva: '<path d="M7 14.5a4.5 4.5 0 1 1 1-8.9A6 6 0 0 1 19 7.5a3.6 3.6 0 0 1-.6 7"/><path d="M8 18l-1 3M12 17l-1 4M16 18l-1 3"/>',
  pincel: '<path d="M18 3l3 3-9.5 9.5-3-3z"/><path d="M8.5 12.5C6 12.5 4 14.5 4 17c0 1.5-1 2.5-2 3 4 1 8-1 8.5-4.5"/>',
  bolha: '<circle cx="10" cy="13" r="6.5"/><circle cx="18" cy="6" r="3"/><path d="M7 11a3.5 3.5 0 0 1 3-2"/>',
  espiral: '<path d="M12 12.5a1.5 1.5 0 1 1 1.5-1.5 3 3 0 0 1-3 3 4.5 4.5 0 0 1-4.5-4.5A6 6 0 0 1 12 3.5a7.5 7.5 0 0 1 7.5 7.5 9 9 0 0 1-9 9"/>',
  lua: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  estrela: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  coroa: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  raio: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  trofeu: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  dado: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor"/>',
  som: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mudo: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  telaCheia: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  sairTelaCheia: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  musica: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  ocultar: '<path d="M6 9l6 6 6-6"/>',
  mostrar: '<path d="M6 15l6-6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  coracao: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z"/>',
  jogar: '<path d="M7 4.5v15l12-7.5z"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  brilho: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  fogos: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M5 19l3.5-3.5M15.5 8.5L19 5"/><circle cx="12" cy="12" r="2"/>',
  corrida: '<path d="M13 5l7 7-7 7M4 5l7 7-7 7"/>',
  particulas: '<circle cx="6" cy="7" r="1.6"/><circle cx="12.5" cy="4.5" r="1.6"/><circle cx="18" cy="9" r="1.6"/><circle cx="8" cy="14" r="1.6"/><circle cx="15" cy="15" r="1.6"/><circle cx="11" cy="20" r="1.6"/>',
  flor: '<circle cx="12" cy="12" r="2.5"/><path d="M12 3a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM12 15a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM3 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0zM15 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0z"/>',
  bolhas: '<circle cx="7" cy="7" r="3.2"/><circle cx="17" cy="7" r="3.2"/><circle cx="7" cy="17" r="3.2"/><circle cx="17" cy="17" r="3.2"/>',
  respirar: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5" opacity=".7"/><circle cx="12" cy="12" r="10" opacity=".4"/>',
  gosma: '<path d="M5 15c0-5 3-10 7-10s7 5 7 10c0 2-1.5 4-3 4-1 0-1.5-1-2.5-1s-1.5 2-3 2-1.5-2-2.5-2S6 19 5 17.5z"/>',
  bussola: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
};

/** Devolve o SVG do ícone como texto, pronto para innerHTML. */
export function icone(nome, classe = 'icone') {
  return `<svg class="${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${CAMINHOS[nome] ?? CAMINHOS.estrela}</svg>`;
}
