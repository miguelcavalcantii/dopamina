/**
 * Preferências do jogador: tema da interface, cor de destaque e favoritos.
 * Os volumes e o pacote de sons ficam no próprio motor de áudio (audio.js).
 * O tema salvo já é aplicado por um script no <head> antes da primeira pintura;
 * aqui ele é reaplicado e passa a reagir às mudanças. Emite 'mudou'.
 */
import { ler, gravar } from './armazenamento.js?v=202610231621';
import { Emissor, movimentoReduzido } from './util.js?v=202610231621';

const CHAVE = 'preferencias';

/** `amostra`: cores do cartão de escolha do tema. `fundo`: cor da barra do navegador. */
export const TEMAS = [
  { id: 'neon', nome: 'Neon', fundo: '#070718', amostra: ['#ff2e97', '#8b5cff', '#22e4ff'] },
  { id: 'aurora', nome: 'Aurora', fundo: '#03131a', amostra: ['#3cffb4', '#22e4ff', '#a06bff'] },
  { id: 'tropical', nome: 'Tropical', fundo: '#04201a', amostra: ['#ffc93c', '#ff5e78', '#00dca8'] },
  { id: 'por-do-sol', nome: 'Pôr do sol', fundo: '#1a0716', amostra: ['#ffd166', '#ff7a18', '#ff3d7f'] },
  { id: 'galaxia', nome: 'Galáxia', fundo: '#04030d', amostra: ['#4d8bff', '#8b5cff', '#ff5dc8'] },
  { id: 'oceano', nome: 'Oceano', fundo: '#021126', amostra: ['#00e0d0', '#00b4ff', '#3a6bff'] },
  { id: 'doce', nome: 'Doce', fundo: '#fff0f8', amostra: ['#ff9ccf', '#c9a8ff', '#8fdcff'], claro: true },
  { id: 'escuro-vibrante', nome: 'Escuro vibrante', fundo: '#000000', amostra: ['#a3ff12', '#ff2e97', '#ffd60a'] },
];

/** Sugestões rápidas ao lado do seletor de cor livre. */
export const DESTAQUES_SUGERIDOS = ['#ff2e97', '#ff7a18', '#ffd60a', '#a3ff12', '#3cffb4', '#22e4ff', '#8b5cff', '#ff5dc8'];

/** Texto legível sobre uma cor de fundo qualquer (escuro em cores claras, branco nas escuras). */
export function textoSobre(hex) {
  const n = parseInt(hex.slice(1), 16);
  const canal = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return luminancia > 0.28 ? '#14082e' : '#ffffff';
}

class Preferencias extends Emissor {
  #p;

  constructor() {
    super();
    const salvo = ler(CHAVE, {});
    this.#p = { tema: 'neon', destaque: null, favoritos: [], ...(salvo && typeof salvo === 'object' ? salvo : {}) };
    if (!TEMAS.some((t) => t.id === this.#p.tema)) this.#p.tema = 'neon';
    this.#aplicar();
  }

  get tema() { return this.#p.tema; }
  get destaque() { return this.#p.destaque; }
  get favoritos() { return [...this.#p.favoritos]; }

  definirTema(id) {
    if (id === this.#p.tema || !TEMAS.some((t) => t.id === id)) return;
    this.#p.tema = id;
    this.#salvar(true);
  }

  /** `null` volta à cor de destaque do próprio tema. */
  definirDestaque(hex) {
    this.#p.destaque = /^#[0-9a-f]{6}$/i.test(hex ?? '') ? hex.toLowerCase() : null;
    this.#salvar(false);
  }

  ehFavorito(id) {
    return this.#p.favoritos.includes(id);
  }

  alternarFavorito(id) {
    const lista = this.#p.favoritos;
    const indice = lista.indexOf(id);
    if (indice >= 0) lista.splice(indice, 1);
    else lista.push(id);
    this.#salvar(false);
    return indice < 0;
  }

  #salvar(comTransicao) {
    gravar(CHAVE, this.#p);
    // Troca de tema com cruzamento suave da tela inteira, quando o navegador permite
    if (comTransicao && document.startViewTransition && !movimentoReduzido()) {
      document.startViewTransition(() => this.#aplicar());
    } else {
      this.#aplicar();
    }
    this.emit('mudou', this.#p);
  }

  #aplicar() {
    const html = document.documentElement;
    const tema = TEMAS.find((t) => t.id === this.#p.tema);
    html.dataset.tema = tema.id;
    if (this.#p.destaque) {
      html.style.setProperty('--destaque', this.#p.destaque);
      html.style.setProperty('--destaque-texto', textoSobre(this.#p.destaque));
    } else {
      html.style.removeProperty('--destaque');
      html.style.removeProperty('--destaque-texto');
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema.fundo);
  }
}

export const preferencias = new Preferencias();
