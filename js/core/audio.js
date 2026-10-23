/**
 * Motor de áudio: sons sintetizados com a Web Audio API e gravações reais (amostras).
 * O AudioContext só nasce no primeiro gesto do usuário (regra dos navegadores).
 *
 * Cadeia: fontes → canal (efeitos | música | asmr) → ganho mestre → compressor → saída
 *                     └──────── envio de reverberação ────────┘
 *
 * Cada canal tem volume próprio (tela de Configurações). Os sons da interface
 * (clique, hover, transições, nível, conquista, missão) mudam com o pacote escolhido.
 */
import { ler, gravar } from './armazenamento.js';
import { aleatorio, clamp, escolher } from './util.js';

const midiParaHz = (nota) => 440 * 2 ** ((nota - 69) / 12);

/** Climas da música ambiente: acordes (MIDI) e notas para os sininhos. */
const HUMORES = {
  calmo: { acordes: [[48, 55, 64, 71], [45, 52, 60, 67], [41, 52, 57, 64], [43, 50, 59, 66]], escala: [72, 74, 76, 79, 81, 84, 86] },
  crepusculo: { acordes: [[41, 48, 57, 64], [40, 47, 55, 62], [38, 45, 53, 60], [36, 43, 52, 59]], escala: [69, 72, 74, 76, 79, 81] },
  cosmico: { acordes: [[45, 52, 59, 64], [41, 48, 55, 64], [43, 50, 57, 62], [40, 47, 55, 59]], escala: [69, 71, 72, 76, 79, 81, 84] },
  aurora: { acordes: [[50, 57, 64, 69], [47, 54, 62, 66], [43, 50, 59, 66], [45, 52, 61, 64]], escala: [74, 76, 78, 81, 83, 86] },
  neon: { acordes: [[45, 52, 57, 64], [41, 48, 57, 60], [48, 55, 60, 67], [43, 50, 55, 62]], escala: [69, 72, 74, 76, 79, 81] },
};

/** Pacotes de sons da interface. */
export const PACOTES_SOM = [
  { id: 'suave', nome: 'Suave', descricao: 'Plim macio e redondo' },
  { id: 'arcade', nome: 'Arcade', descricao: 'Bipes de 8 bits' },
  { id: 'bolhas', nome: 'Bolhas', descricao: 'Bloop, bloop' },
  { id: 'cristal', nome: 'Cristal', descricao: 'Sininhos de vidro' },
  { id: 'natureza', nome: 'Natureza', descricao: 'Madeira, folhas e passarinhos' },
];

const SONS_INTERFACE = new Set(['clique', 'hover', 'whoosh', 'nivel', 'conquista', 'missao', 'alternar']);

/** Ganho máximo de cada canal (o controle vai de 0 a 1 em curva quadrática). */
const GANHO_CANAL = { efeitos: 1, musica: 0.6, asmr: 1.1 };

/** Decodificador fora da tela: prepara amostras antes mesmo do primeiro gesto. */
let decodificador = null;
const cacheAmostras = new Map();

class MotorAudio {
  ctx = null;
  #mestre = null;
  #efeitos = null;
  #musica = null;
  #asmr = null;
  #canal = null;
  #reverb = null;
  #bufferRuido = null;
  #config = { volume: 0.7, mudo: false, efeitos: 1, musica: 1, asmr: 1, pacote: 'suave', ...ler('audio', {}) };
  #ouvintes = new Set();
  #ultimoPorSom = new Map();
  #ambiente = null;
  #humorDesejado = null;

  get volume() { return this.#config.volume; }
  get mudo() { return this.#config.mudo; }
  get pacote() { return this.#config.pacote; }

  /** Volume de um canal: 'efeitos', 'musica' ou 'asmr' (0 a 1). */
  volumeCanal(canal) {
    return this.#config[canal] ?? 1;
  }
  get ativo() { return Boolean(this.ctx) && this.ctx.state === 'running'; }

  /** Cria (ou retoma) o contexto de áudio. Chamar dentro de um gesto do usuário. */
  desbloquear() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
      return;
    }
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;

    const c = (this.ctx = new Contexto({ latencyHint: 'interactive' }));
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    compressor.connect(c.destination);

    this.#mestre = c.createGain();
    this.#mestre.gain.value = 0;
    this.#mestre.connect(compressor);

    this.#efeitos = c.createGain();
    this.#efeitos.connect(this.#mestre);
    this.#musica = c.createGain();
    this.#musica.connect(this.#mestre);
    this.#asmr = c.createGain();
    this.#asmr.connect(this.#mestre);
    this.#canal = this.#efeitos;

    this.#reverb = c.createConvolver();
    this.#reverb.buffer = this.#criarImpulso(2.8, 2.6);
    const retorno = c.createGain();
    retorno.gain.value = 0.4;
    this.#reverb.connect(retorno).connect(this.#mestre);

    this.#bufferRuido = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const dados = this.#bufferRuido.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;

    this.#aplicarVolume();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) c.suspend();
      else c.resume();
    });
    if (this.#humorDesejado) this.iniciarAmbiente(this.#humorDesejado);
  }

  /* ---------- Volume e mudo ---------- */

  definirVolume(valor) {
    this.#config.volume = clamp(valor, 0, 1);
    this.#salvarConfig();
  }

  definirMudo(mudo) {
    this.#config.mudo = mudo;
    this.#salvarConfig();
  }

  alternarMudo() {
    this.definirMudo(!this.#config.mudo);
  }

  definirVolumeCanal(canal, valor) {
    if (!(canal in GANHO_CANAL)) return;
    this.#config[canal] = clamp(valor, 0, 1);
    this.#salvarConfig();
  }

  definirPacote(id) {
    if (!PACOTES_SOM.some((p) => p.id === id)) return;
    this.#config.pacote = id;
    this.#salvarConfig();
  }

  /** Amostra do pacote atual: clique, um "ok" e a fanfarra de conquista. */
  previaPacote() {
    if (!this.ativo || this.#config.mudo) return;
    this.#somInterface('clique', {});
    setTimeout(() => this.#somInterface('missao', {}), 200);
    setTimeout(() => this.#somInterface('conquista', {}), 700);
  }

  /** Avisa sempre que volume ou mudo mudarem. */
  aoMudar(funcao) {
    this.#ouvintes.add(funcao);
    return () => this.#ouvintes.delete(funcao);
  }

  #salvarConfig() {
    gravar('audio', this.#config);
    this.#aplicarVolume();
    this.#ouvintes.forEach((funcao) => funcao(this.#config));
  }

  #aplicarVolume() {
    if (!this.ctx) return;
    // Curva quadrática: o controle soa mais natural ao ouvido
    const alvo = this.#config.mudo ? 0 : this.#config.volume ** 2 * 0.9;
    const t = this.ctx.currentTime;
    this.#mestre.gain.setTargetAtTime(alvo, t, 0.03);
    this.#efeitos.gain.setTargetAtTime(this.volumeCanal('efeitos') ** 2 * GANHO_CANAL.efeitos, t, 0.03);
    this.#musica.gain.setTargetAtTime(this.volumeCanal('musica') ** 2 * GANHO_CANAL.musica, t, 0.03);
    this.#asmr.gain.setTargetAtTime(this.volumeCanal('asmr') ** 2 * GANHO_CANAL.asmr, t, 0.03);
  }

  /* ---------- Efeitos sonoros ---------- */

  /**
   * Toca um efeito pelo nome. Opções comuns: pan (-1 a 1), tom, volume, intervaloMin.
   * `canal: 'asmr'` manda o som para o canal de ASMR em vez do de efeitos.
   * Sons repetidos rápido demais são ignorados para não embolar.
   */
  tocar(nome, opcoes = {}) {
    if (!this.ativo || this.#config.mudo) return;
    const agora = this.ctx.currentTime;
    const ultimo = this.#ultimoPorSom.get(nome) ?? -1;
    if (agora - ultimo < (opcoes.intervaloMin ?? 0.025)) return;
    this.#ultimoPorSom.set(nome, agora);
    this.#canal = opcoes.canal === 'asmr' ? this.#asmr : this.#efeitos;
    if (SONS_INTERFACE.has(nome)) this.#somInterface(nome, opcoes);
    else this.#sintetizar(nome, opcoes);
    this.#canal = this.#efeitos;
  }

  /* ---------- Sons da interface, por pacote ---------- */

  #somInterface(nome, o) {
    const pan = o.pan ?? 0;
    const pacote = this.#config.pacote;
    const descendo = Boolean(o.descendo);

    if (pacote === 'arcade') {
      const quadrada = (notas, passo, volume = 0.045, duracao = passo * 0.9) =>
        notas.forEach((nota, i) => this.#tom({ freq: midiParaHz(nota), tipo: 'square', inicio: i * passo, duracao, volume, pan, filtro: { freq: 3800 } }));
      if (nome === 'clique') quadrada([81, 88], 0.035, 0.04);
      else if (nome === 'hover') quadrada([93], 0.03, 0.014);
      else if (nome === 'alternar') quadrada([76, 83], 0.04, 0.04);
      else if (nome === 'whoosh') quadrada(descendo ? [84, 79, 76, 72, 67] : [67, 72, 76, 79, 84], 0.035, 0.03);
      else if (nome === 'nivel') quadrada([60, 64, 67, 72, 76, 79, 84, 88], 0.06, 0.05, 0.08);
      else if (nome === 'conquista') {
        quadrada([72, 76, 79, 84], 0.07, 0.05);
        this.#tom({ freq: midiParaHz(88), tipo: 'square', inicio: 0.3, duracao: 0.35, volume: 0.045, filtro: { freq: 3000 } });
      } else if (nome === 'missao') quadrada([79, 84, 91], 0.06, 0.045);
      return;
    }

    if (pacote === 'bolhas') {
      if (nome === 'clique') this.#bloop(420, 0, 0.16, pan);
      else if (nome === 'hover') this.#bloop(900, 0, 0.035, pan);
      else if (nome === 'alternar') this.#bloop(560, 0, 0.14, pan);
      else if (nome === 'whoosh') {
        for (let i = 0; i < 6; i++) this.#bloop(aleatorio(300, 900) * (descendo ? 1 - i * 0.08 : 1 + i * 0.12), i * 0.05, 0.08, aleatorio(-0.6, 0.6));
      } else if (nome === 'nivel') [300, 380, 480, 600, 760].forEach((f, i) => this.#bloop(f, i * 0.08, 0.15));
      else if (nome === 'conquista') {
        [500, 640, 820].forEach((f, i) => this.#bloop(f, i * 0.07, 0.14));
        this.#sino(midiParaHz(91), 0.25, 1.2, 0.05, 0);
      } else if (nome === 'missao') [440, 560, 700].forEach((f, i) => this.#bloop(f, i * 0.07, 0.13));
      return;
    }

    if (pacote === 'cristal') {
      if (nome === 'clique') this.#sino(2100, 0, 0.45, 0.05, pan);
      else if (nome === 'hover') this.#sino(3300, 0, 0.25, 0.014, pan);
      else if (nome === 'alternar') this.#sino(1760, 0, 0.5, 0.05, pan);
      else if (nome === 'whoosh') {
        this.#ruido({ duracao: 0.45, filtro: 'highpass', freq: descendo ? 7000 : 2500, freqFinal: descendo ? 2500 : 7000, q: 0.7, volume: 0.03 });
        [96, 100, 103].forEach((n, i) => this.#sino(midiParaHz(descendo ? n - 12 : n), 0.08 + i * 0.06, 0.7, 0.025, aleatorio(-0.5, 0.5)));
      } else if (nome === 'nivel') [84, 88, 91, 96, 100].forEach((n, i) => this.#sino(midiParaHz(n), i * 0.08, 1.6, 0.06, 0));
      else if (nome === 'conquista') [96, 100, 103, 108, 103, 108].forEach((n, i) => this.#sino(midiParaHz(n), i * 0.06, 1.8, 0.045, aleatorio(-0.5, 0.5)));
      else if (nome === 'missao') [91, 96, 100].forEach((n, i) => this.#sino(midiParaHz(n), i * 0.07, 1.2, 0.05, 0));
      return;
    }

    if (pacote === 'natureza') {
      if (nome === 'clique') this.#madeira(620, 0, 0.12, pan);
      else if (nome === 'hover') this.#ruido({ duracao: 0.04, filtro: 'bandpass', freq: 3200, q: 2, volume: 0.025, pan, reverb: 0 });
      else if (nome === 'alternar') this.#madeira(480, 0, 0.12, pan);
      else if (nome === 'whoosh') this.#ruido({ duracao: 0.6, filtro: 'bandpass', freq: descendo ? 1400 : 500, freqFinal: descendo ? 500 : 1400, q: 0.6, volume: 0.09 });
      else if (nome === 'nivel') [67, 69, 72, 74, 76, 79].forEach((n, i) => this.#madeira(midiParaHz(n), i * 0.08, 0.13));
      else if (nome === 'conquista') {
        this.#passarinho(0, 0.3);
        this.#passarinho(0.22, -0.3);
        this.#passarinho(0.46, 0.1);
      } else if (nome === 'missao') [72, 76, 79].forEach((n, i) => this.#madeira(midiParaHz(n), i * 0.08, 0.13));
      return;
    }

    // Suave (padrão)
    switch (nome) {
      case 'clique':
        this.#tom({ freq: 900, freqFinal: 1300, tipo: 'triangle', duracao: 0.07, volume: 0.08, pan });
        break;
      case 'hover':
        this.#tom({ freq: 1700, freqFinal: 1950, duracao: 0.05, volume: 0.022, pan });
        break;
      case 'alternar':
        this.#tom({ freq: 700, freqFinal: 1050, tipo: 'triangle', duracao: 0.09, volume: 0.09, pan });
        break;
      case 'whoosh':
        this.#ruido({ duracao: 0.5, filtro: 'bandpass', freq: descendo ? 2600 : 380, freqFinal: descendo ? 380 : 2600, q: 1.3, volume: 0.1 });
        break;
      case 'nivel':
        [72, 76, 79, 84].forEach((nota, i) => {
          const final = i === 3;
          this.#tom({ freq: midiParaHz(nota), tipo: 'triangle', inicio: i * 0.09, duracao: final ? 0.7 : 0.18, volume: 0.12, reverb: 0.4 });
          this.#tom({ freq: midiParaHz(nota + 12), inicio: i * 0.09, duracao: final ? 0.6 : 0.15, volume: 0.05, reverb: 0.4 });
        });
        break;
      case 'conquista':
        [84, 88, 91, 96].forEach((nota, i) => this.#sino(midiParaHz(nota), i * 0.07, 1.4, 0.08, 0));
        break;
      case 'missao':
        [79, 84, 88].forEach((nota, i) => this.#tom({ freq: midiParaHz(nota), tipo: 'triangle', inicio: i * 0.07, duracao: 0.25, volume: 0.11, reverb: 0.35 }));
        break;
      default:
        break;
    }
  }

  /** Bolha: seno que sobe rápido de tom. */
  #bloop(freq, inicio, volume, pan = 0) {
    this.#tom({ freq, freqFinal: freq * 2.6, inicio, duracao: 0.09, ataque: 0.003, volume, pan, reverb: 0.15 });
  }

  /** Batida de madeira (marimba curta): triângulo + harmônico agudo que some logo. */
  #madeira(freq, inicio, volume, pan = 0) {
    this.#tom({ freq, tipo: 'triangle', inicio, duracao: 0.28, ataque: 0.002, volume, pan, reverb: 0.2 });
    this.#tom({ freq: freq * 3.9, inicio, duracao: 0.05, ataque: 0.001, volume: volume * 0.35, pan });
    this.#ruido({ inicio, duracao: 0.018, filtro: 'bandpass', freq: 2400, q: 1.5, volume: volume * 0.3, pan, reverb: 0 });
  }

  /** Piado curto de passarinho: duas varreduras rápidas. */
  #passarinho(inicio, pan) {
    const base = aleatorio(2600, 3300);
    this.#tom({ freq: base, freqFinal: base * 1.45, inicio, duracao: 0.07, volume: 0.05, pan, reverb: 0.3 });
    this.#tom({ freq: base * 1.3, freqFinal: base * 0.9, inicio: inicio + 0.08, duracao: 0.09, volume: 0.045, pan, reverb: 0.3 });
  }

  #sintetizar(nome, o) {
    const pan = o.pan ?? 0;
    switch (nome) {
      case 'gota': {
        // "plink" de gota: varredura rápida para cima
        const tom = o.tom ?? 1;
        this.#tom({ freq: 420 * tom, freqFinal: 1500 * tom, duracao: 0.11, volume: 0.2 * (o.volume ?? 1), pan, reverb: 0.3 });
        break;
      }
      case 'gotaGrande': {
        const tom = o.tom ?? 1;
        this.#tom({ freq: 150 * tom, freqFinal: 600 * tom, duracao: 0.22, volume: 0.36, pan, reverb: 0.4 });
        this.#ruido({ duracao: 0.35, filtro: 'bandpass', freq: 1700, q: 0.9, volume: 0.09, pan, inicio: 0.01 });
        this.#tom({ freq: 900 * tom, freqFinal: 2300 * tom, inicio: 0.05, duracao: 0.08, volume: 0.07, pan, reverb: 0.35 });
        break;
      }
      case 'estouro': {
        const t = clamp(o.tamanho ?? 0.5, 0, 1);
        this.#ruido({ duracao: 0.06, filtro: 'highpass', freq: 1400 + (1 - t) * 2200, q: 0.7, volume: 0.26, pan });
        this.#tom({ freq: 480 + (1 - t) * 700, freqFinal: 1100 + (1 - t) * 1400, duracao: 0.06, volume: 0.18, pan });
        break;
      }
      case 'acerto':
        this.#tom({ freq: 784, tipo: 'triangle', duracao: 0.12, volume: 0.13, pan });
        this.#tom({ freq: 1175, tipo: 'triangle', inicio: 0.06, duracao: 0.18, volume: 0.11, pan, reverb: 0.2 });
        break;
      case 'erro':
        // Erro suave, nada estridente
        this.#tom({ freq: 300, freqFinal: 190, tipo: 'triangle', duracao: 0.25, volume: 0.15, pan, filtro: { freq: 900 } });
        break;
      case 'combo': {
        const passo = Math.max(0, (o.n ?? 1) - 1);
        const escala = [0, 2, 4, 7, 9];
        const nota = 72 + escala[passo % 5] + 12 * Math.min(2, Math.floor(passo / 5));
        this.#sino(midiParaHz(nota), 0, 0.6, 0.12, pan);
        this.#tom({ freq: midiParaHz(nota + 12), tipo: 'triangle', inicio: 0.03, duracao: 0.15, volume: 0.05, pan });
        break;
      }
      case 'inicio':
        this.#tom({ freq: 660, tipo: 'triangle', duracao: 0.07, volume: 0.1 });
        this.#tom({ freq: 990, tipo: 'triangle', inicio: 0.07, duracao: 0.1, volume: 0.1 });
        break;
      case 'tique':
        this.#tom({ freq: 1000 * (o.tom ?? 1), freqFinal: 760 * (o.tom ?? 1), tipo: 'triangle', duracao: 0.05, volume: 0.08 });
        break;
      case 'acelerar':
        this.#tom({ freq: 280, freqFinal: 1200, tipo: 'triangle', duracao: 0.4, volume: 0.1, reverb: 0.3 });
        this.#ruido({ duracao: 0.45, filtro: 'bandpass', freq: 500, freqFinal: 4000, q: 1.4, volume: 0.07 });
        break;
      case 'corte':
        this.#ruido({ duracao: 0.13, filtro: 'highpass', freq: 2200, freqFinal: 7000, q: 0.8, volume: 0.14, pan });
        break;
      case 'fim':
        [72, 76, 79, 84].forEach((nota, i) => this.#sino(midiParaHz(nota), i * 0.12, 1.1, 0.08, 0));
        break;
      case 'foguete':
        this.#tom({ freq: 500, freqFinal: 1900, duracao: 0.55, volume: 0.04, pan });
        this.#ruido({ duracao: 0.5, filtro: 'highpass', freq: 2500, q: 0.6, volume: 0.04, pan });
        break;
      case 'explosao': {
        const t = clamp(o.tamanho ?? 1, 0.3, 2);
        this.#ruido({ duracao: 0.9 * t, filtro: 'lowpass', freq: 500 + 300 * t, q: 0.6, volume: 0.22 * Math.min(1.4, t), pan, reverb: 0.5 });
        this.#tom({ freq: 90, freqFinal: 38, duracao: 0.45, volume: 0.25 * Math.min(1.3, t), pan });
        break;
      }
      case 'estalos':
        for (let i = 0; i < 16; i++) {
          this.#ruido({ inicio: 0.25 + Math.random() * 0.8, duracao: 0.02, filtro: 'highpass', freq: 3000 + Math.random() * 3000, q: 0.5, volume: 0.05, pan: pan + (Math.random() - 0.5) * 0.4, reverb: 0.2 });
        }
        break;
      case 'coleta': {
        const passo = Math.max(0, (o.n ?? 1) - 1);
        const nota = 76 + [0, 2, 4, 7, 9][passo % 5] + 12 * Math.min(1, Math.floor(passo / 5));
        this.#tom({ freq: midiParaHz(nota), tipo: 'triangle', duracao: 0.12, volume: 0.1, pan, reverb: 0.2 });
        break;
      }
      case 'pulo':
        this.#tom({ freq: 300, freqFinal: 760, tipo: 'triangle', duracao: 0.16, volume: 0.11, pan });
        break;
      case 'escudo':
        [79, 83, 86].forEach((nota, i) => this.#sino(midiParaHz(nota), i * 0.04, 0.9, 0.07, pan));
        break;
      case 'squish': {
        const tom = o.tom ?? 1;
        this.#ruido({ duracao: 0.22, filtro: 'bandpass', freq: 650 * tom, freqFinal: 260 * tom, q: 3, volume: 0.14 * (o.volume ?? 1), pan, reverb: 0.1 });
        this.#tom({ freq: 220 * tom, freqFinal: 120 * tom, duracao: 0.16, volume: 0.09 * (o.volume ?? 1), pan });
        break;
      }
      case 'fase':
        this.#sino(midiParaHz(o.nota ?? 76), 0, 2.2, 0.06, 0);
        break;
      case 'bumper': {
        // Batedor de pinball: estalo grave + "tóin" metálico
        const tom = o.tom ?? 1;
        this.#ruido({ duracao: 0.08, filtro: 'bandpass', freq: 900, q: 1.2, volume: 0.22, pan, reverb: 0.1 });
        this.#tom({ freq: 520 * tom, freqFinal: 240 * tom, tipo: 'square', duracao: 0.16, volume: 0.07, pan, filtro: { freq: 2600 } });
        this.#tom({ freq: 1040 * tom, duracao: 0.25, volume: 0.05, pan, reverb: 0.3 });
        break;
      }
      case 'flipper':
        this.#ruido({ duracao: 0.05, filtro: 'lowpass', freq: 600, q: 0.8, volume: 0.25, pan, reverb: 0 });
        this.#tom({ freq: 140, freqFinal: 70, duracao: 0.07, volume: 0.18, pan });
        break;
      case 'quique':
        this.#tom({ freq: 260 * (o.tom ?? 1), freqFinal: 180 * (o.tom ?? 1), tipo: 'triangle', duracao: 0.06, volume: 0.1 * (o.volume ?? 1), pan });
        break;
      case 'mola':
        this.#ruido({ duracao: 0.25, filtro: 'bandpass', freq: 300, freqFinal: 1800, q: 2, volume: 0.15, pan });
        this.#tom({ freq: 120, freqFinal: 420, tipo: 'sawtooth', duracao: 0.2, volume: 0.05, pan, filtro: { freq: 1200 } });
        break;
      case 'rampa':
        this.#tom({ freq: 300, freqFinal: 1500, tipo: 'sawtooth', duracao: 0.55, volume: 0.06, filtro: { freq: 2500 }, reverb: 0.3 });
        this.#ruido({ duracao: 0.6, filtro: 'bandpass', freq: 400, freqFinal: 3000, q: 1.5, volume: 0.06 });
        break;
      case 'trava':
        [60, 67, 72].forEach((n, i) => this.#tom({ freq: midiParaHz(n), tipo: 'square', inicio: i * 0.06, duracao: 0.12, volume: 0.05, filtro: { freq: 3000 } }));
        break;
      case 'tema':
        for (let i = 0; i < 5; i++) this.#sino(midiParaHz(escolher([79, 81, 84, 86, 88, 91])), i * 0.06, 0.8, 0.045, aleatorio(-0.6, 0.6));
        break;
      default:
        break;
    }
  }

  /* ---------- Notas e bateria (jogos musicais) ---------- */

  /** Tempo do relógio de áudio (ou do relógio da página, se o áudio ainda não existe). */
  get agora() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  /** Atraso aproximado entre agendar um som e ele sair na caixa de som. */
  get latencia() {
    return this.ctx ? (this.ctx.outputLatency || this.ctx.baseLatency || 0) : 0;
  }

  /**
   * Toca uma nota MIDI. `quando` é o tempo absoluto do AudioContext (padrão: já).
   * `canal: 'musica'` para trilhas (respeita o volume de Música).
   */
  nota(midi, { quando, duracao = 0.35, timbre = 'sino', volume = 0.12, pan = 0, canal = 'efeitos' } = {}) {
    if (!this.ativo || this.#config.mudo) return;
    this.#canal = this.#destinoCanal(canal);
    try {
      this.#notaNoCanal(midi, { quando, duracao, timbre, volume, pan });
    } finally {
      this.#canal = this.#efeitos;
    }
  }

  #notaNoCanal(midi, { quando, duracao, timbre, volume, pan }) {
    const inicio = Math.max(0, (quando ?? this.ctx.currentTime) - this.ctx.currentTime);
    const freq = midiParaHz(midi);
    if (timbre === 'sino') {
      this.#sino(freq, inicio, duracao * 2.5, volume, pan);
    } else if (timbre === 'pluck') {
      this.#tom({ freq, tipo: 'triangle', inicio, duracao, volume, pan, reverb: 0.25 });
      this.#tom({ freq: freq * 2, inicio, duracao: duracao * 0.5, volume: volume * 0.3, pan });
    } else if (timbre === 'synth') {
      this.#tom({ freq, tipo: 'sawtooth', inicio, duracao, volume: volume * 0.55, pan, reverb: 0.2, filtro: { freq: 2400 } });
      this.#tom({ freq: freq * 1.006, tipo: 'square', inicio, duracao, volume: volume * 0.22, pan, filtro: { freq: 1600 } });
    } else if (timbre === 'baixo') {
      this.#tom({ freq, tipo: 'triangle', inicio, duracao, volume, pan, filtro: { freq: 700 } });
      this.#tom({ freq: freq / 2, inicio, duracao, volume: volume * 0.6, pan });
    } else if (timbre === 'pad') {
      this.#tom({ freq, tipo: 'triangle', inicio, duracao, ataque: Math.min(0.3, duracao / 3), volume, pan, reverb: 0.5, filtro: { freq: 1200 } });
    }
  }

  /** Bateria sintetizada: 'bumbo', 'caixa', 'chimbal' ou 'palma'. */
  batida(tipo, quando, canal = 'efeitos') {
    if (!this.ativo || this.#config.mudo) return;
    this.#canal = this.#destinoCanal(canal);
    try {
      this.#batidaNoCanal(tipo, quando);
    } finally {
      this.#canal = this.#efeitos;
    }
  }

  #batidaNoCanal(tipo, quando) {
    const inicio = Math.max(0, (quando ?? this.ctx.currentTime) - this.ctx.currentTime);
    if (tipo === 'bumbo') {
      this.#tom({ freq: 150, freqFinal: 42, inicio, duracao: 0.3, volume: 0.45, ataque: 0.002 });
    } else if (tipo === 'caixa') {
      this.#ruido({ inicio, duracao: 0.18, filtro: 'bandpass', freq: 1800, q: 0.7, volume: 0.18, reverb: 0.2 });
      this.#tom({ freq: 230, freqFinal: 160, inicio, duracao: 0.1, volume: 0.12 });
    } else if (tipo === 'chimbal') {
      this.#ruido({ inicio, duracao: 0.045, filtro: 'highpass', freq: 7500, q: 0.5, volume: 0.06, reverb: 0 });
    } else if (tipo === 'palma') {
      for (let i = 0; i < 3; i++) this.#ruido({ inicio: inicio + i * 0.012, duracao: 0.08, filtro: 'bandpass', freq: 1300, q: 1.2, volume: 0.1, reverb: 0.3 });
    }
  }

  /** Ruído filtrado contínuo (areia, respiração...). Devolve { atualizar(intensidade, freq), parar() }. */
  iniciarTextura({ filtro = 'bandpass', freq = 1200, q = 1, volumeMaximo = 0.18, canal = 'efeitos' } = {}) {
    if (!this.ativo) return { atualizar() {}, parar() {} };
    const c = this.ctx;
    const fonte = this.#fonteRuido();
    const f = c.createBiquadFilter();
    f.type = filtro;
    f.frequency.value = freq;
    f.Q.value = q;
    const ganho = c.createGain();
    ganho.gain.value = 0;
    fonte.connect(f).connect(ganho).connect(canal === 'asmr' ? this.#asmr : this.#efeitos);
    fonte.start();
    let parado = false;
    return {
      atualizar: (intensidade, novaFreq) => {
        if (parado) return;
        const t = c.currentTime;
        ganho.gain.setTargetAtTime(clamp(intensidade, 0, 1) * volumeMaximo, t, 0.08);
        if (novaFreq) f.frequency.setTargetAtTime(novaFreq, t, 0.1);
      },
      parar: () => {
        if (parado) return;
        parado = true;
        const t = c.currentTime;
        ganho.gain.cancelScheduledValues(t);
        ganho.gain.setTargetAtTime(0, t, 0.1);
        fonte.stop(t + 0.6);
      },
    };
  }

  /* ---------- Amostras: gravações reais ---------- */

  /**
   * Baixa e decodifica um arquivo de som (com cache). Funciona antes do primeiro gesto.
   * Resolve com o AudioBuffer, ou `null` se o arquivo não existir ou não decodificar.
   */
  carregarAmostra(url) {
    const chave = String(url);
    if (!cacheAmostras.has(chave)) {
      cacheAmostras.set(chave, (async () => {
        try {
          const resposta = await fetch(chave);
          if (!resposta.ok) return null;
          const bytes = await resposta.arrayBuffer();
          decodificador ??= new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 44100, 44100);
          return await decodificador.decodeAudioData(bytes);
        } catch (erro) {
          console.warn('Não deu para carregar o som', chave, erro);
          return null;
        }
      })());
    }
    return cacheAmostras.get(chave);
  }

  /**
   * Toca um trecho de uma amostra. `inicio`/`duracao` em segundos dentro do arquivo;
   * `tom` muda a velocidade (e a altura); `canal` padrão: 'asmr'.
   */
  tocarAmostra(buffer, { inicio = 0, duracao, tom = 1, volume = 1, pan = 0, reverb = 0, canal = 'asmr', ataque = 0.004, soltura = 0.03 } = {}) {
    if (!buffer || !this.ativo || this.#config.mudo) return;
    const c = this.ctx;
    const fonte = c.createBufferSource();
    fonte.buffer = buffer;
    fonte.playbackRate.value = tom;
    const trecho = Math.min(duracao ?? buffer.duration - inicio, buffer.duration - inicio);
    const real = trecho / tom;
    const t0 = c.currentTime;
    const envelope = c.createGain();
    envelope.gain.setValueAtTime(0, t0);
    envelope.gain.linearRampToValueAtTime(volume, t0 + ataque);
    envelope.gain.setValueAtTime(volume, t0 + Math.max(ataque, real - soltura));
    envelope.gain.linearRampToValueAtTime(0, t0 + real);
    fonte.connect(envelope);
    this.#rotear(envelope, pan, reverb, this.#destinoCanal(canal));
    fonte.start(t0, inicio, trecho + 0.01);
  }

  /**
   * Toca uma amostra em laço contínuo (chuva, fogueira...). Devolve
   * { volume(v, suavidade), parar() }. Começa em silêncio e sobe até `volume`.
   */
  iniciarLaco(buffer, { volume = 1, canal = 'asmr', tom = 1, filtro } = {}) {
    if (!buffer || !this.ctx) return { volume() {}, parar() {}, tom() {} };
    const c = this.ctx;
    const fonte = c.createBufferSource();
    fonte.buffer = buffer;
    fonte.loop = true;
    fonte.playbackRate.value = tom;
    const ganho = c.createGain();
    ganho.gain.value = 0;
    let no = fonte;
    let f = null;
    if (filtro) {
      f = c.createBiquadFilter();
      f.type = filtro.tipo ?? 'lowpass';
      f.frequency.value = filtro.freq;
      no = no.connect(f);
    }
    no.connect(ganho).connect(this.#destinoCanal(canal));
    // Começa num ponto aleatório para dois laços iguais não soarem em fase
    fonte.start(c.currentTime, Math.random() * buffer.duration);
    ganho.gain.setTargetAtTime(volume, c.currentTime, 0.4);
    let parado = false;
    return {
      volume: (v, suavidade = 0.15) => {
        if (!parado) ganho.gain.setTargetAtTime(Math.max(0, v), c.currentTime, suavidade);
      },
      tom: (v) => {
        if (!parado) fonte.playbackRate.setTargetAtTime(v, c.currentTime, 0.2);
      },
      filtro: (freq) => {
        if (!parado && f) f.frequency.setTargetAtTime(freq, c.currentTime, 0.15);
      },
      parar: (suavidade = 0.3) => {
        if (parado) return;
        parado = true;
        const t = c.currentTime;
        ganho.gain.cancelScheduledValues(t);
        ganho.gain.setTargetAtTime(0, t, suavidade);
        fonte.stop(t + suavidade * 6);
      },
    };
  }

  #destinoCanal(canal) {
    if (canal === 'musica') return this.#musica;
    if (canal === 'efeitos') return this.#efeitos;
    return this.#asmr;
  }

  /**
   * Tom contínuo controlável (zumbido de rolamento, motor, vento cantando...).
   * Devolve { freq(hz), volume(v), parar() }. Começa em silêncio.
   */
  iniciarTom({ tipo = 'triangle', freq = 110, filtro = 1800, canal = 'efeitos' } = {}) {
    if (!this.ativo) return { freq() {}, volume() {}, parar() {} };
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = tipo;
    osc.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filtro;
    const ganho = c.createGain();
    ganho.gain.value = 0;
    osc.connect(f).connect(ganho).connect(this.#destinoCanal(canal));
    osc.start();
    let parado = false;
    return {
      freq: (hz, suavidade = 0.08) => {
        if (!parado) osc.frequency.setTargetAtTime(Math.max(1, hz), c.currentTime, suavidade);
      },
      volume: (v, suavidade = 0.08) => {
        if (!parado) ganho.gain.setTargetAtTime(Math.max(0, v), c.currentTime, suavidade);
      },
      parar: () => {
        if (parado) return;
        parado = true;
        const t = c.currentTime;
        ganho.gain.cancelScheduledValues(t);
        ganho.gain.setTargetAtTime(0, t, 0.1);
        osc.stop(t + 0.6);
      },
    };
  }

  /* ---------- Som contínuo do redemoinho ---------- */

  /** Zumbido grave que cresce com a força. Devolve { atualizar(forca), parar() }. */
  iniciarZumbido() {
    if (!this.ativo) return { atualizar() {}, parar() {} };
    const c = this.ctx;
    const grave = c.createOscillator();
    grave.type = 'sawtooth';
    grave.frequency.value = 55;
    const medio = c.createOscillator();
    medio.frequency.value = 110;
    const ruido = this.#fonteRuido();
    const ganhoRuido = c.createGain();
    ganhoRuido.gain.value = 0.3;
    const filtro = c.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 200;
    filtro.Q.value = 6;
    const ganho = c.createGain();
    ganho.gain.value = 0;

    grave.connect(filtro);
    medio.connect(filtro);
    ruido.connect(ganhoRuido).connect(filtro);
    filtro.connect(ganho).connect(this.#efeitos);
    const envio = c.createGain();
    envio.gain.value = 0.3;
    ganho.connect(envio).connect(this.#reverb);
    [grave, medio, ruido].forEach((no) => no.start());

    return {
      atualizar: (forca) => {
        const t = c.currentTime;
        filtro.frequency.setTargetAtTime(180 + forca * 1400, t, 0.1);
        ganho.gain.setTargetAtTime(0.03 + forca * 0.11, t, 0.1);
        grave.frequency.setTargetAtTime(50 + forca * 40, t, 0.2);
        medio.frequency.setTargetAtTime(100 + forca * 80, t, 0.2);
      },
      parar: () => {
        const t = c.currentTime;
        ganho.gain.cancelScheduledValues(t);
        ganho.gain.setTargetAtTime(0, t, 0.12);
        [grave, medio, ruido].forEach((no) => no.stop(t + 0.7));
      },
    };
  }

  /* ---------- Música ambiente generativa ---------- */

  /** Liga a música no clima indicado. Se o áudio ainda não foi liberado, liga depois. */
  iniciarAmbiente(humor = 'calmo') {
    this.#humorDesejado = humor;
    if (!this.ctx) return;
    if (this.#ambiente?.humor === humor) return;
    this.#encerrarAmbiente();

    const c = this.ctx;
    const saida = c.createGain();
    saida.gain.setValueAtTime(0, c.currentTime);
    saida.gain.linearRampToValueAtTime(1, c.currentTime + 2.5);
    saida.connect(this.#musica);
    const envio = c.createGain();
    envio.gain.value = 0.8;
    saida.connect(envio).connect(this.#reverb);

    const ambiente = {
      humor,
      saida,
      indice: 0,
      proximoAcorde: c.currentTime + 0.1,
      proximoSino: c.currentTime + 2,
    };
    ambiente.timer = setInterval(() => this.#agendarAmbiente(ambiente), 250);
    this.#ambiente = ambiente;
    this.#agendarAmbiente(ambiente);
  }

  pararAmbiente() {
    this.#humorDesejado = null;
    this.#encerrarAmbiente();
  }

  #encerrarAmbiente() {
    const ambiente = this.#ambiente;
    if (!ambiente) return;
    this.#ambiente = null;
    clearInterval(ambiente.timer);
    const t = this.ctx.currentTime;
    ambiente.saida.gain.cancelScheduledValues(t);
    ambiente.saida.gain.setValueAtTime(ambiente.saida.gain.value, t);
    ambiente.saida.gain.linearRampToValueAtTime(0, t + 1.5);
    setTimeout(() => ambiente.saida.disconnect(), 1800);
  }

  #agendarAmbiente(ambiente) {
    const c = this.ctx;
    if (c.state !== 'running' || document.hidden) return;
    const agora = c.currentTime;
    const { acordes, escala } = HUMORES[ambiente.humor] ?? HUMORES.calmo;
    if (ambiente.proximoAcorde < agora) ambiente.proximoAcorde = agora + 0.05;
    while (ambiente.proximoAcorde < agora + 0.6) {
      this.#tocarPad(acordes[ambiente.indice % acordes.length], ambiente.proximoAcorde, 9, ambiente.saida);
      ambiente.indice++;
      ambiente.proximoAcorde += 7.5;
    }
    if (agora >= ambiente.proximoSino) {
      this.#sino(midiParaHz(escolher(escala)), 0.05, 2.4, 0.045, aleatorio(-0.5, 0.5), ambiente.saida);
      ambiente.proximoSino = agora + aleatorio(1.4, 4);
    }
  }

  /** Acorde longo e macio (osciladores levemente desafinados num filtro passa-baixa). */
  #tocarPad(notas, inicio, duracao, destino) {
    const c = this.ctx;
    const filtro = c.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.Q.value = 0.7;
    filtro.frequency.setValueAtTime(500, inicio);
    filtro.frequency.linearRampToValueAtTime(1400, inicio + duracao * 0.5);
    filtro.frequency.linearRampToValueAtTime(600, inicio + duracao);
    const envelope = c.createGain();
    envelope.gain.setValueAtTime(0, inicio);
    envelope.gain.linearRampToValueAtTime(0.11, inicio + 2.5);
    envelope.gain.setValueAtTime(0.11, inicio + duracao - 3);
    envelope.gain.linearRampToValueAtTime(0, inicio + duracao);
    filtro.connect(envelope).connect(destino);

    for (const nota of notas) {
      for (const [tipo, desafinacao] of [['triangle', -6], ['sine', 7]]) {
        const osc = c.createOscillator();
        osc.type = tipo;
        osc.frequency.value = midiParaHz(nota);
        osc.detune.value = desafinacao;
        const ganho = c.createGain();
        ganho.gain.value = 0.22;
        osc.connect(ganho).connect(filtro);
        osc.start(inicio);
        osc.stop(inicio + duracao + 0.1);
      }
    }
  }

  /* ---------- Primitivas de síntese ---------- */

  #tom({ freq, freqFinal, tipo = 'sine', inicio = 0, duracao = 0.2, ataque = 0.005, volume = 0.2, reverb = 0, pan = 0, filtro }) {
    const c = this.ctx;
    const t0 = c.currentTime + inicio;
    const osc = c.createOscillator();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqFinal) osc.frequency.exponentialRampToValueAtTime(freqFinal, t0 + duracao);
    const envelope = c.createGain();
    envelope.gain.setValueAtTime(0.0001, t0);
    envelope.gain.exponentialRampToValueAtTime(volume, t0 + ataque);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);

    let no = osc;
    if (filtro) {
      const f = c.createBiquadFilter();
      f.type = filtro.tipo ?? 'lowpass';
      f.frequency.value = filtro.freq;
      no = no.connect(f);
    }
    no.connect(envelope);
    this.#rotear(envelope, pan, reverb, this.#canal);
    osc.start(t0);
    osc.stop(t0 + duracao + 0.05);
  }

  #ruido({ duracao = 0.2, inicio = 0, filtro = 'bandpass', freq = 1000, freqFinal, q = 1, volume = 0.1, pan = 0, reverb = 0.15 }) {
    const c = this.ctx;
    const t0 = c.currentTime + inicio;
    const fonte = this.#fonteRuido();
    const f = c.createBiquadFilter();
    f.type = filtro;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (freqFinal) f.frequency.exponentialRampToValueAtTime(freqFinal, t0 + duracao);
    const envelope = c.createGain();
    envelope.gain.setValueAtTime(0.0001, t0);
    envelope.gain.exponentialRampToValueAtTime(volume, t0 + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);
    fonte.connect(f).connect(envelope);
    this.#rotear(envelope, pan, reverb, this.#canal);
    fonte.start(t0, Math.random());
    fonte.stop(t0 + duracao + 0.05);
  }

  /** Sino: parcial fundamental + parcial inarmônico (soa metálico e brilhante). */
  #sino(freq, inicio, duracao, volume, pan = 0, destino = this.#canal) {
    const c = this.ctx;
    const t0 = c.currentTime + inicio;
    for (const [razao, peso] of [[1, 1], [2.76, 0.3], [5.4, 0.08]]) {
      const osc = c.createOscillator();
      osc.frequency.value = freq * razao;
      const envelope = c.createGain();
      envelope.gain.setValueAtTime(0.0001, t0);
      envelope.gain.exponentialRampToValueAtTime(volume * peso, t0 + 0.004);
      envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao / razao ** 0.5);
      osc.connect(envelope);
      this.#rotear(envelope, pan, 0.5, destino);
      osc.start(t0);
      osc.stop(t0 + duracao + 0.05);
    }
  }

  #rotear(no, pan, reverb, destino) {
    let saida = no;
    if (pan && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      saida = no.connect(panner);
    }
    saida.connect(destino);
    if (reverb) {
      const envio = this.ctx.createGain();
      envio.gain.value = reverb;
      saida.connect(envio).connect(this.#reverb);
    }
  }

  #fonteRuido() {
    const fonte = this.ctx.createBufferSource();
    fonte.buffer = this.#bufferRuido;
    fonte.loop = true;
    return fonte;
  }

  #criarImpulso(duracao, decaimento) {
    const c = this.ctx;
    const tamanho = Math.floor(c.sampleRate * duracao);
    const impulso = c.createBuffer(2, tamanho, c.sampleRate);
    for (let canal = 0; canal < 2; canal++) {
      const dados = impulso.getChannelData(canal);
      for (let i = 0; i < tamanho; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / tamanho) ** decaimento;
    }
    return impulso;
  }
}

export const audio = new MotorAudio();
