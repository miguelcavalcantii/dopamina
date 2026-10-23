/**
 * Utilidades gerais: matemática, aleatoriedade, cores, eventos e preferências do sistema.
 */

export const clamp = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));
export const lerp = (a, b, t) => a + (b - a) * t;
export const aleatorio = (minimo = 0, maximo = 1) => minimo + Math.random() * (maximo - minimo);
export const aleatorioInt = (minimo, maximo) => Math.floor(aleatorio(minimo, maximo + 1));
export const escolher = (lista) => lista[Math.floor(Math.random() * lista.length)];

/** Gerador pseudoaleatório determinístico (mulberry32): mesma semente, mesma sequência. */
export function geradorComSemente(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash simples (FNV-1a) para transformar texto em semente numérica. */
export function hashTexto(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Embaralha uma cópia da lista usando o gerador informado (Fisher–Yates). */
export function embaralhar(lista, gerador = Math.random) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(gerador() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** Data local no formato AAAA-MM-DD (as missões renovam à meia-noite local). */
export function dataHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Converte '#rrggbb' em [r, g, b] com valores de 0 a 1. */
export function hexParaRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Formata segundos como "1min 30s" ou "45s". */
export function formatarTempo(segundos) {
  const s = Math.floor(segundos);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const resto = s % 60;
  return resto ? `${m}min ${resto}s` : `${m}min`;
}

/* ---------- Preferências e capacidades do dispositivo ---------- */

const consultaMovimento = matchMedia('(prefers-reduced-motion: reduce)');
export const movimentoReduzido = () => consultaMovimento.matches;

/** Verdadeiro em telas de toque sem mouse (celulares e tablets). */
export const semHover = () => matchMedia('(hover: none)').matches;

/** Aparelhos modestos recebem resoluções internas menores. */
export const perfilLeve = (() => {
  const nucleos = navigator.hardwareConcurrency || 4;
  const memoria = navigator.deviceMemory || 8;
  return nucleos <= 4 || memoria <= 4;
})();

/** Captura o ponteiro no elemento sem quebrar se o navegador recusar. */
export function capturarPonteiro(elemento, idPonteiro) {
  try {
    elemento.setPointerCapture(idPonteiro);
  } catch {
    /* ponteiro já liberado: segue sem captura */
  }
}

/** Pontos intermediários de um pointermove (o mouse pode andar vários pixels entre eventos). */
export function eventosCombinados(evento) {
  const lista = evento.getCoalescedEvents?.();
  return lista?.length ? lista : [evento];
}

/* ---------- Carregamento de CSS sob demanda ---------- */

const estilosCarregados = new Map();

/** Injeta uma folha de estilo uma única vez e resolve quando ela estiver pronta. */
export function carregarEstilo(url) {
  const href = String(url);
  if (!estilosCarregados.has(href)) {
    estilosCarregados.set(href, new Promise((resolver) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolver;
      link.onerror = resolver;
      document.head.append(link);
    }));
  }
  return estilosCarregados.get(href);
}

/* ---------- Emissor de eventos minimalista ---------- */

export class Emissor {
  #ouvintes = new Map();

  /** Registra um ouvinte e devolve a função que o remove. */
  on(evento, funcao) {
    if (!this.#ouvintes.has(evento)) this.#ouvintes.set(evento, new Set());
    this.#ouvintes.get(evento).add(funcao);
    return () => this.#ouvintes.get(evento)?.delete(funcao);
  }

  emit(evento, dados) {
    this.#ouvintes.get(evento)?.forEach((funcao) => funcao(dados));
  }
}
