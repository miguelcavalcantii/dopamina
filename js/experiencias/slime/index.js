/**
 * Slime: corpos macios feitos de um anel de pontos ligados por molas, com pressão interna
 * e memória de forma. Agarre e estique (vários dedos ao mesmo tempo), cutuque com toques
 * rápidos e veja voltar balançando. Integração de Verlet com passo fixo.
 * Novidades: o modo Camaleão muda a cor com a energia do movimento; com dois slimes,
 * arrastar um para dentro do outro funde os dois num só, marmorizado, que vai se
 * misturando conforme é amassado. "Separar" divide de novo (já com as cores misturadas).
 * Sons: squish gravado de verdade (CC0) e bolhinhas quando o slime é espremido.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { criarBanco } from '../../core/amostras.js?v=202610231621';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, movimentoReduzido } from '../../core/util.js?v=202610231621';

const TAU = Math.PI * 2;
const PONTOS = 44;
const PASSO = 1 / 120;
const ITERACOES = 4;
const som = (nome) => new URL(`../../../assets/sons/jogos/${nome}.mp3`, import.meta.url);

const PALETAS = [
  { id: 'lima', nome: 'Lima', cores: ['#efffd0', '#7bff4a', '#00a35c'], brilho: '#7bff4a' },
  { id: 'chiclete', nome: 'Chiclete', cores: ['#ffe3f3', '#ff70c0', '#b0106a'], brilho: '#ff70c0' },
  { id: 'galaxia', nome: 'Galáxia', cores: ['#efe4ff', '#8b5cff', '#2a0b8e'], brilho: '#a87bff' },
  { id: 'oceano', nome: 'Oceano', cores: ['#dbfcff', '#22c4ff', '#0048b0'], brilho: '#22c4ff' },
  { id: 'lava', nome: 'Lava', cores: ['#fff3b8', '#ff7a18', '#c2180a'], brilho: '#ff7a18' },
];

/* ---------- Cores: hex ↔ números, mistura e giro de matiz ---------- */

const hexParaRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbParaHex = (rgb) => `#${rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
const misturar = (a, b, t) => rgbParaHex(hexParaRgb(a).map((v, i) => v + (hexParaRgb(b)[i] - v) * t));

/** Gira a matiz de uma cor (graus), mantendo brilho e saturação. */
function girarMatiz(hex, graus) {
  if (!graus) return hex;
  const [r, g, b] = hexParaRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return hex;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + graus + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbParaHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/slime.css?v=202610231621', import.meta.url));

  const config = { paleta: 'lima', rosto: true, glitter: true, camaleao: true, dois: false, ...ler('slime-config', {}) };
  const salvar = () => gravar('slime-config', config);
  const squish = criarBanco(audio, [som('slime-squish'), som('slime-2'), som('slime-gel')], { recorte: { intervaloMin: 0.08, duracaoMax: 0.35, sensibilidade: 1.4 }, canal: 'efeitos' });

  raiz.classList.add('slime');
  raiz.innerHTML = `
    <div class="slime__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Slime. Agarre e estique com o mouse ou os dedos, toque rápido para cutucar. Com dois slimes, arraste um para dentro do outro para misturar. Teclado: setas esticam, espaço cutuca.">
      <canvas class="slime__canvas"></canvas>
    </div>
    <p class="dica-palco" data-dica>Agarre e estique<small>toque rápido para cutucar · use vários dedos</small></p>
    <div class="doca vidro-fosco slime__doca" role="region" aria-label="Controles do slime">
      <div class="doca__linha">
        <span class="doca__rotulo">COR</span>
        ${PALETAS.map((p) => `<button type="button" class="amostra-tema" data-paleta="${p.id}" style="--amostra:radial-gradient(circle at 35% 30%, ${p.cores[0]}, ${p.cores[1]} 45%, ${p.cores[2]});--brilho:${p.brilho}" aria-pressed="${p.id === config.paleta}" aria-label="${p.nome}" title="${p.nome}"></button>`).join('')}
      </div>
      <div class="doca__linha">
        <button type="button" class="chip" data-dois aria-pressed="${config.dois}">${icone('gosma')}<span data-texto-dois>Dois slimes</span></button>
        <button type="button" class="chip" data-separar hidden>${icone('espiral')}<span>Separar</span></button>
        <button type="button" class="chip" data-camaleao aria-pressed="${config.camaleao}">${icone('brilho')}<span>Camaleão</span></button>
        <button type="button" class="chip" data-rosto aria-pressed="${config.rosto}">${icone('estrela')}<span>Rostinho</span></button>
        <button type="button" class="chip" data-glitter aria-pressed="${config.glitter}">${icone('particulas')}<span>Glitter</span></button>
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.slime__palco');
  const canvas = $('.slime__canvas');
  const g = canvas.getContext('2d');

  let tela = { l: 1, a: 1, dpr: 1 };
  let raioBase = 100;
  let corpos = [];
  let acumulador = 0;
  let tempo = 0;
  let textura = null;
  let olhar = { x: 0, y: 0 };
  let ultimoTocado = null;
  const pegadas = new Map(); // ponteiro → { corpo, alvos: [{ indice, peso, dx, dy }], x, y, inicio, moveu }

  /* ---------- Corpos ---------- */

  function criarCorpo(cores, x, y, raio, cores2 = null) {
    const corpo = {
      cores: [...cores],
      cores2: cores2 ? [...cores2] : null, // segunda cor ainda não misturada (marmorizado)
      mistura: cores2 ? 0 : 1,
      raio,
      casa: { x, y },
      energia: 0,
      matiz: 0,
      giroMarmore: aleatorio(0, TAU),
      pontos: Array.from({ length: PONTOS }, (_, i) => {
        const ang = (i / PONTOS) * TAU;
        const px = x + Math.cos(ang) * raio;
        const py = y + Math.sin(ang) * raio;
        return { x: px, y: py, px, py };
      }),
      glitter: Array.from({ length: Math.round(46 * (raio / 100)) }, () => ({ angulo: aleatorio(0, TAU), fracao: Math.sqrt(Math.random()) * 0.85, fase: aleatorio(0, TAU), tamanho: aleatorio(1, 2.6) })),
    };
    return corpo;
  }

  const paletaAtual = () => PALETAS.find((p) => p.id === config.paleta) ?? PALETAS[0];
  const proximaPaleta = () => PALETAS[(PALETAS.indexOf(paletaAtual()) + 2) % PALETAS.length];

  function casas(quantidade) {
    const cy = tela.a / 2 - 20;
    if (quantidade === 1) return [{ x: tela.l / 2, y: cy }];
    const separacao = Math.min(tela.l * 0.25, raioBase * 1.9);
    return [{ x: tela.l / 2 - separacao, y: cy }, { x: tela.l / 2 + separacao, y: cy }];
  }

  function montarCorpos() {
    pegadas.clear();
    if (config.dois) {
      const raio = raioBase * 0.72;
      const [a, b] = casas(2);
      corpos = [criarCorpo(paletaAtual().cores, a.x, a.y, raio), criarCorpo(proximaPaleta().cores, b.x, b.y, raio)];
    } else {
      const [c] = casas(1);
      corpos = [criarCorpo(paletaAtual().cores, c.x, c.y, raioBase)];
    }
    ultimoTocado = corpos[0];
    atualizarBotoes();
  }

  function atualizarBotoes() {
    const fundido = corpos.length === 1 && config.dois;
    $('[data-separar]').hidden = !fundido;
    $('[data-texto-dois]').textContent = config.dois ? (fundido ? 'Novos slimes' : 'Um slime') : 'Dois slimes';
    $('[data-dois]').setAttribute('aria-pressed', String(config.dois));
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      const primeiro = tela.l === 1;
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      raioBase = Math.min(tela.l, tela.a - 140) * 0.24;
      if (primeiro) montarCorpos();
      else {
        const lista = casas(corpos.length);
        corpos.forEach((c, i) => { c.casa = lista[i]; });
      }
    },
  });

  /* ---------- Física ---------- */

  function centroide(corpo) {
    let x = 0;
    let y = 0;
    for (const p of corpo.pontos) {
      x += p.x;
      y += p.y;
    }
    return { x: x / PONTOS, y: y / PONTOS };
  }

  function area(corpo) {
    let soma = 0;
    const pts = corpo.pontos;
    for (let i = 0; i < PONTOS; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % PONTOS];
      soma += a.x * b.y - b.x * a.y;
    }
    return soma / 2;
  }

  function restringirDistancia(a, b, repouso, rigidez) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    const correcao = ((d - repouso) / d) * 0.5 * rigidez;
    a.x += dx * correcao;
    a.y += dy * correcao;
    b.x -= dx * correcao;
    b.y -= dy * correcao;
  }

  const pegadasDo = (corpo) => [...pegadas.values()].filter((p) => p.corpo === corpo);

  function passoCorpo(corpo) {
    const { pontos, raio } = corpo;
    let energia = 0;
    for (const p of pontos) {
      const vx = (p.x - p.px) * 0.985;
      const vy = (p.y - p.py) * 0.985;
      energia += vx * vx + vy * vy;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;
    }
    corpo.energia = corpo.energia * 0.9 + (Math.sqrt(energia / PONTOS) / 6) * 0.1;

    const segurado = pegadasDo(corpo);
    const c = centroide(corpo);
    // O corpo volta devagar para a sua "casa"; segurado, estica em vez de deslizar.
    // Com dois slimes, quem está sendo segurado é carregado junto (para dar para misturar)
    let destino = corpo.casa;
    if (segurado.length && corpos.length > 1) {
      destino = {
        x: segurado.reduce((soma, p) => soma + p.x, 0) / segurado.length,
        y: segurado.reduce((soma, p) => soma + p.y, 0) / segurado.length,
      };
    }
    const ancora = segurado.length ? (corpos.length > 1 ? 0.035 : 0.02) : 0.004;
    const puxaX = (destino.x - c.x) * ancora;
    const puxaY = (destino.y - c.y) * ancora;
    pontos.forEach((p, i) => {
      p.x += puxaX;
      p.y += puxaY;
      const ang = (i / PONTOS) * TAU;
      const memoria = segurado.length ? 0.005 : 0.012;
      p.x += (c.x + Math.cos(ang) * raio - p.x) * memoria;
      p.y += (c.y + Math.sin(ang) * raio - p.y) * memoria;
    });
    for (const pegada of segurado) {
      for (const alvo of pegada.alvos) {
        const p = pontos[alvo.indice];
        p.x += (pegada.x + alvo.dx - p.x) * 0.35 * alvo.peso;
        p.y += (pegada.y + alvo.dy - p.y) * 0.35 * alvo.peso;
      }
    }

    const repouso1 = 2 * raio * Math.sin(Math.PI / PONTOS);
    const repouso2 = 2 * raio * Math.sin((2 * Math.PI) / PONTOS);
    const areaAlvo = Math.PI * raio * raio;
    for (let k = 0; k < ITERACOES; k++) {
      for (let i = 0; i < PONTOS; i++) {
        restringirDistancia(pontos[i], pontos[(i + 1) % PONTOS], repouso1, 0.9);
        restringirDistancia(pontos[i], pontos[(i + 2) % PONTOS], repouso2, 0.12);
      }
      const diferenca = (areaAlvo - area(corpo)) / (PONTOS * repouso1);
      const empurrao = clamp(diferenca * 0.5, -6, 6);
      for (let i = 0; i < PONTOS; i++) {
        const antes = pontos[(i - 1 + PONTOS) % PONTOS];
        const depois = pontos[(i + 1) % PONTOS];
        let nx = depois.y - antes.y;
        let ny = -(depois.x - antes.x);
        const d = Math.hypot(nx, ny) || 1;
        nx /= d;
        ny /= d;
        pontos[i].x += nx * empurrao;
        pontos[i].y += ny * empurrao;
      }
    }
  }

  /** Dois slimes se encostam (empurrão suave) e, se um é arrastado para dentro do outro, fundem. */
  function interagirCorpos() {
    if (corpos.length < 2) return;
    const [a, b] = corpos;
    const ca = centroide(a);
    const cb = centroide(b);
    const d = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
    const segurando = pegadas.size > 0;
    if (segurando && d < (a.raio + b.raio) * 0.62) {
      fundir();
      return;
    }
    for (const [corpo, outro, co] of [[a, b, cb], [b, a, ca]]) {
      for (const p of corpo.pontos) {
        const dx = p.x - co.x;
        const dy = p.y - co.y;
        const dist = Math.hypot(dx, dy) || 1;
        const limite = outro.raio * 0.92;
        if (dist < limite) {
          const empurra = (limite - dist) * 0.25;
          p.x += (dx / dist) * empurra;
          p.y += (dy / dist) * empurra;
        }
      }
    }
  }

  function fundir() {
    const [a, b] = corpos;
    const ca = centroide(a);
    const cb = centroide(b);
    const raio = Math.min(Math.hypot(a.raio, b.raio), raioBase * 1.15);
    const [casa] = casas(1);
    const novo = criarCorpo(a.cores, (ca.x + cb.x) / 2, (ca.y + cb.y) / 2, raio, b.cores);
    novo.casa = casa;
    corpos = [novo];
    pegadas.clear();
    ultimoTocado = novo;
    if (!squish.tocar({ tom: 0.7, volume: 1.2 })) audio.tocar('squish', { tom: 0.6, volume: 1.2 });
    audio.tocar('tema');
    progresso.registrar('slime:mistura');
    atualizarBotoes();
  }

  function separar() {
    if (corpos.length !== 1) return;
    const [c] = corpos;
    const t = c.cores2 ? c.mistura * 0.5 : 0;
    const coresA = c.cores2 ? c.cores.map((cor, i) => misturar(cor, c.cores2[i], t)) : c.cores;
    const coresB = c.cores2 ? c.cores2.map((cor, i) => misturar(cor, c.cores[i], t)) : c.cores;
    const raio = raioBase * 0.72;
    const [ca, cb] = casas(2);
    const centro = centroide(c);
    corpos = [criarCorpo(coresA, centro.x - raio * 0.5, centro.y, raio), criarCorpo(coresB, centro.x + raio * 0.5, centro.y, raio)];
    corpos[0].casa = ca;
    corpos[1].casa = cb;
    pegadas.clear();
    if (!squish.tocar({ tom: 1.2, volume: 1.1 })) audio.tocar('squish', { tom: 1.3 });
    atualizarBotoes();
  }

  /** Quanto o corpo está esticado (0 = redondo). */
  function esticamento(corpo) {
    const c = centroide(corpo);
    let maior = 0;
    for (const p of corpo.pontos) maior = Math.max(maior, Math.hypot(p.x - c.x, p.y - c.y));
    return clamp(maior / corpo.raio - 1, 0, 2);
  }

  /* ---------- Interação ---------- */

  function tocarSquish(opcoes) {
    if (!squish.tocar({ variacaoTom: 0.1, ...opcoes })) audio.tocar('squish', { intervaloMin: 0.05, ...opcoes });
  }

  function corpoEm(x, y) {
    let melhor = null;
    let menor = Infinity;
    for (const corpo of corpos) {
      const c = centroide(corpo);
      const d = Math.hypot(x - c.x, y - c.y) / corpo.raio;
      if (d < 1.6 && d < menor) {
        menor = d;
        melhor = corpo;
      }
    }
    return melhor;
  }

  function agarrar(id, x, y) {
    const corpo = corpoEm(x, y);
    if (!corpo) return false;
    const { pontos, raio } = corpo;
    const alvos = [];
    pontos.forEach((p, indice) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < raio * 0.75) alvos.push({ indice, peso: 1 - d / (raio * 0.75), dx: p.x - x, dy: p.y - y });
    });
    if (!alvos.length) {
      let melhor = 0;
      pontos.forEach((p, i) => {
        if (Math.hypot(p.x - x, p.y - y) < Math.hypot(pontos[melhor].x - x, pontos[melhor].y - y)) melhor = i;
      });
      alvos.push({ indice: melhor, peso: 1, dx: pontos[melhor].x - x, dy: pontos[melhor].y - y });
    }
    pegadas.set(id, { corpo, alvos, x, y, inicio: performance.now(), moveu: false, origemX: x, origemY: y });
    ultimoTocado = corpo;
    tocarSquish({ tom: aleatorio(0.9, 1.15), volume: 0.7 });
    progresso.registrar('slime:aperto');
    return true;
  }

  function cutucar(corpo, x, y, forca = 1) {
    const { pontos, raio } = corpo;
    for (const p of pontos) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > raio * 1.2) continue;
      const impulso = (1 - d / (raio * 1.2)) * 22 * forca;
      // Afunda a borda: empurra os pontos na direção do toque (cria a covinha)
      p.px -= (dx / d) * -impulso * 0.5;
      p.py -= (dy / d) * -impulso * 0.5;
      p.x += (x - p.x) * 0.15 * (1 - d / (raio * 1.2)) * forca;
      p.y += (y - p.y) * 0.15 * (1 - d / (raio * 1.2)) * forca;
    }
    tocarSquish({ tom: aleatorio(1.1, 1.4), volume: 0.9 });
    progresso.registrar('slime:aperto');
  }

  function soltar(id) {
    const pegada = pegadas.get(id);
    if (!pegada) return;
    pegadas.delete(id);
    if (!corpos.includes(pegada.corpo)) return;
    const estica = esticamento(pegada.corpo);
    if (!pegada.moveu && performance.now() - pegada.inicio < 220) {
      cutucar(pegada.corpo, pegada.x, pegada.y);
    } else {
      tocarSquish({ tom: 0.75 + estica * 0.2, volume: clamp(0.5 + estica, 0.5, 1.3) });
      // Espremido com força: solta bolhinhas de ar
      if (estica > 0.7) {
        for (let i = 0; i < 3; i++) setTimeout(() => audio.tocar('gota', { tom: aleatorio(1.4, 2.2), volume: 0.35, intervaloMin: 0.01 }), 60 + i * aleatorio(50, 90));
      }
    }
  }

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const { x, y } = posicao(e);
    if (agarrar(e.pointerId, x, y)) {
      capturarPonteiro(palco, e.pointerId);
      $('[data-dica]').classList.add('dica-palco--oculta');
    }
  });
  palco.addEventListener('pointermove', (e) => {
    const { x, y } = posicao(e);
    olhar = { x, y };
    const pegada = pegadas.get(e.pointerId);
    if (!pegada) return;
    pegada.x = x;
    pegada.y = y;
    if (Math.hypot(x - pegada.origemX, y - pegada.origemY) > 8) pegada.moveu = true;
  });
  palco.addEventListener('pointerup', (e) => soltar(e.pointerId));
  palco.addEventListener('pointercancel', (e) => soltar(e.pointerId));

  // Teclado: setas esticam o último slime tocado; espaço cutuca
  const DIRECOES = { ArrowLeft: Math.PI, ArrowRight: 0, ArrowUp: -Math.PI / 2, ArrowDown: Math.PI / 2 };
  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button')) return;
    const corpo = corpos.includes(ultimoTocado) ? ultimoTocado : corpos[0];
    if (e.key in DIRECOES) {
      e.preventDefault();
      if (e.repeat || pegadas.has(e.key)) return;
      const c = centroide(corpo);
      const ang = DIRECOES[e.key];
      agarrar(e.key, c.x + Math.cos(ang) * corpo.raio, c.y + Math.sin(ang) * corpo.raio);
      const pegada = pegadas.get(e.key);
      if (!pegada) return;
      pegada.x = c.x + Math.cos(ang) * corpo.raio * 1.9;
      pegada.y = c.y + Math.sin(ang) * corpo.raio * 1.9;
      pegada.moveu = true;
      $('[data-dica]').classList.add('dica-palco--oculta');
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (e.target !== palco) return;
      e.preventDefault();
      const c = centroide(corpo);
      cutucar(corpo, c.x + aleatorio(-corpo.raio * 0.5, corpo.raio * 0.5), c.y - corpo.raio * 0.6, 1.4);
    }
  });
  raiz.addEventListener('keyup', (e) => {
    if (e.key in DIRECOES) soltar(e.key);
  });

  /* ---------- Desenho ---------- */

  function caminhoSuave(pontos) {
    g.beginPath();
    const ultimo = pontos[PONTOS - 1];
    const primeiro = pontos[0];
    g.moveTo((ultimo.x + primeiro.x) / 2, (ultimo.y + primeiro.y) / 2);
    for (let i = 0; i < PONTOS; i++) {
      const a = pontos[i];
      const b = pontos[(i + 1) % PONTOS];
      g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    g.closePath();
  }

  /** Distância do centro até a borda numa direção (para posicionar glitter e brilho). */
  function raioNaDirecao(corpo, c, angulo) {
    let melhor = corpo.raio;
    let menorDiferenca = Infinity;
    for (const p of corpo.pontos) {
      const diferenca = Math.abs(((Math.atan2(p.y - c.y, p.x - c.x) - angulo + Math.PI * 3) % TAU) - Math.PI);
      if (diferenca < menorDiferenca) {
        menorDiferenca = diferenca;
        melhor = Math.hypot(p.x - c.x, p.y - c.y);
      }
    }
    return melhor;
  }

  function desenharCorpo(corpo) {
    const c = centroide(corpo);
    const raio = corpo.raio;
    // Camaleão: a matiz desliza com a energia do movimento (e volta devagar)
    const cores = corpo.cores.map((cor) => girarMatiz(cor, corpo.matiz));
    const [claro, medio, escuro] = cores;

    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(c.x, corpo.casa.y + raio * 1.15, raio * 0.95, raio * 0.18, 0, 0, TAU);
    g.fill();

    const corpoGrad = g.createRadialGradient(c.x - raio * 0.35, c.y - raio * 0.45, raio * 0.1, c.x, c.y, raio * 1.4);
    corpoGrad.addColorStop(0, claro);
    corpoGrad.addColorStop(0.4, medio);
    corpoGrad.addColorStop(1, escuro);
    g.save();
    g.shadowColor = medio;
    g.shadowBlur = 40;
    g.fillStyle = corpoGrad;
    caminhoSuave(corpo.pontos);
    g.fill();
    g.restore();

    // Marmorizado: listras da segunda cor que somem conforme a mistura avança
    if (corpo.cores2) {
      const cores2 = corpo.cores2.map((cor) => girarMatiz(cor, corpo.matiz));
      g.save();
      caminhoSuave(corpo.pontos);
      g.clip();
      g.translate(c.x, c.y);
      g.rotate(corpo.giroMarmore);
      g.globalAlpha = 1 - corpo.mistura;
      g.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const y = (k - 2) * raio * 0.42;
        g.strokeStyle = k % 2 ? cores2[1] : cores2[0];
        g.lineWidth = raio * (0.2 + (k % 3) * 0.08);
        g.beginPath();
        g.moveTo(-raio * 1.3, y);
        g.bezierCurveTo(-raio * 0.4, y - raio * 0.5 * Math.sin(corpo.giroMarmore * 2 + k), raio * 0.4, y + raio * 0.5 * Math.cos(corpo.giroMarmore + k), raio * 1.3, y);
        g.stroke();
      }
      // A cor misturada vai tomando conta por cima
      g.globalAlpha = corpo.mistura * 0.85;
      g.fillStyle = misturar(medio, cores2[1], 0.5);
      g.fillRect(-raio * 2, -raio * 2, raio * 4, raio * 4);
      g.restore();
    }

    if (config.glitter) {
      g.save();
      caminhoSuave(corpo.pontos);
      g.clip();
      for (const b of corpo.glitter) {
        const r = raioNaDirecao(corpo, c, b.angulo) * b.fracao;
        const brilha = movimentoReduzido() ? 0.7 : 0.45 + 0.55 * Math.abs(Math.sin(tempo * 2 + b.fase));
        g.fillStyle = `rgba(255,255,255,${brilha})`;
        g.beginPath();
        g.arc(c.x + Math.cos(b.angulo) * r, c.y + Math.sin(b.angulo) * r, b.tamanho, 0, TAU);
        g.fill();
      }
      g.restore();
    }

    const rTopo = raioNaDirecao(corpo, c, -Math.PI * 0.72);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(c.x - rTopo * 0.42, c.y - rTopo * 0.5, raio * 0.22, raio * 0.1, -0.6, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(c.x - rTopo * 0.15, c.y - rTopo * 0.66, raio * 0.04, 0, TAU);
    g.fill();

    if (config.rosto) desenharRosto(corpo, c);
  }

  function desenharRosto(corpo, c) {
    const raio = corpo.raio;
    const estica = esticamento(corpo);
    const piscando = (tempo + corpo.giroMarmore) % 4.2 < 0.13;
    const dx = clamp((olhar.x - c.x) / tela.l, -0.5, 0.5) * raio * 0.12;
    const dy = clamp((olhar.y - c.y) / tela.a, -0.5, 0.5) * raio * 0.12;
    g.fillStyle = '#1a0b3a';
    for (const lado of [-1, 1]) {
      const ox = c.x + lado * raio * 0.28;
      const oy = c.y - raio * 0.12;
      g.beginPath();
      g.ellipse(ox + dx, oy + dy, raio * 0.085, piscando ? raio * 0.012 : raio * (0.12 + estica * 0.05), 0, 0, TAU);
      g.fill();
      if (!piscando) {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(ox + dx - raio * 0.025, oy + dy - raio * 0.04, raio * 0.028, 0, TAU);
        g.fill();
        g.fillStyle = '#1a0b3a';
      }
    }
    g.strokeStyle = '#1a0b3a';
    g.lineWidth = Math.max(2, raio * 0.035);
    g.lineCap = 'round';
    g.beginPath();
    if (estica > 0.35) {
      g.ellipse(c.x, c.y + raio * 0.2, raio * 0.06, raio * (0.06 + estica * 0.05), 0, 0, TAU);
      g.fill();
    } else {
      g.arc(c.x, c.y + raio * 0.12, raio * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,90,170,0.35)';
    for (const lado of [-1, 1]) {
      g.beginPath();
      g.ellipse(c.x + lado * raio * 0.45, c.y + raio * 0.1, raio * 0.09, raio * 0.05, 0, 0, TAU);
      g.fill();
    }
  }

  function desenhar() {
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fundo = g.createRadialGradient(l / 2, a / 2, 0, l / 2, a / 2, Math.max(l, a) * 0.7);
    fundo.addColorStop(0, '#2a1060');
    fundo.addColorStop(1, '#0d0628');
    g.fillStyle = fundo;
    g.fillRect(0, 0, l, a);
    for (const corpo of corpos) desenharCorpo(corpo);
  }

  /* ---------- Loop ---------- */

  const esticamentoAnterior = new WeakMap();
  const pararLoop = aoQuadro((dt) => {
    if (!corpos.length) return;
    tempo += dt;
    acumulador += dt;
    let passos = 0;
    while (acumulador >= PASSO && passos < 6) {
      for (const corpo of corpos) passoCorpo(corpo);
      interagirCorpos();
      acumulador -= PASSO;
      passos++;
    }
    if (acumulador > PASSO) acumulador = 0;

    let deformacao = 0;
    for (const corpo of corpos) {
      // Camaleão e mistura andam com a energia do movimento
      const alvoMatiz = config.camaleao && !movimentoReduzido() ? clamp(corpo.energia * 120, 0, 150) : 0;
      corpo.matiz += (alvoMatiz - corpo.matiz) * Math.min(1, dt * (alvoMatiz > corpo.matiz ? 4 : 0.8));
      if (corpo.cores2) {
        corpo.mistura = Math.min(1, corpo.mistura + dt * (0.015 + corpo.energia * 0.25));
        corpo.giroMarmore += dt * corpo.energia * 0.8;
        if (corpo.mistura >= 1) {
          corpo.cores = corpo.cores.map((cor, i) => misturar(cor, corpo.cores2[i], 0.5));
          corpo.cores2 = null;
          progresso.registrar('slime:mistura-completa');
        }
      }
      const estica = esticamento(corpo);
      deformacao = Math.max(deformacao, Math.abs(estica - (esticamentoAnterior.get(corpo) ?? estica)));
      esticamentoAnterior.set(corpo, estica);
    }

    // Som contínuo de massa sendo esticada + squishes gravados conforme deforma
    if (!textura && audio.ativo) textura = audio.iniciarTextura({ filtro: 'bandpass', freq: 380, q: 2.5, volumeMaximo: 0.1 });
    textura?.atualizar(pegadas.size ? clamp(deformacao * 40, 0, 1) : 0, 250 + deformacao * 4000);
    if (pegadas.size && deformacao > 0.012 && Math.random() < dt * 6) tocarSquish({ volume: clamp(deformacao * 30, 0.2, 0.7), tom: aleatorio(0.85, 1.2) });

    desenhar();
  });

  /* ---------- Controles ---------- */

  $('.doca').addEventListener('click', (e) => {
    const botao = e.target.closest('button');
    if (!botao) return;
    if (botao.dataset.paleta) {
      config.paleta = botao.dataset.paleta;
      raiz.querySelectorAll('[data-paleta]').forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));
      // A cor vai para o último slime tocado
      const corpo = corpos.includes(ultimoTocado) ? ultimoTocado : corpos[0];
      corpo.cores = [...paletaAtual().cores];
      corpo.cores2 = null;
      corpo.mistura = 1;
      const c = centroide(corpo);
      cutucar(corpo, c.x, c.y - corpo.raio * 0.8, 0.8);
    } else if ('dois' in botao.dataset) {
      const fundido = corpos.length === 1 && config.dois;
      if (!fundido) config.dois = !config.dois;
      montarCorpos();
      tocarSquish({ tom: 1.1, volume: 1 });
    } else if ('separar' in botao.dataset) {
      separar();
    } else if ('rosto' in botao.dataset || 'glitter' in botao.dataset || 'camaleao' in botao.dataset) {
      const chave = ['rosto', 'glitter', 'camaleao'].find((k) => k in botao.dataset);
      config[chave] = !config[chave];
      botao.setAttribute('aria-pressed', String(config[chave]));
    }
    salvar();
  });

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      textura?.parar();
    },
  };
}
