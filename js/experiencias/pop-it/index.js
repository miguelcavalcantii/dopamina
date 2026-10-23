/**
 * Pop It: placa de silicone com bolinhas para apertar. Cada bolinha é uma cúpula que
 * afunda com um "pop" gravado de verdade (CC0). Quando todas estão apertadas, a
 * placa vira e todas voltam a ficar de pé (é o outro lado). Formatos: arco-íris,
 * coração, estrela e polvo. Arraste para apertar várias de uma vez.
 * Desenho: base de silicone e as bolinhas são pré-desenhadas; o quadro só cola imagens.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js';
import { icone } from '../../core/icones.js';
import { ler, gravar } from '../../core/armazenamento.js';
import { criarBanco } from '../../core/amostras.js';
import { capturarPonteiro, carregarEstilo, clamp, eventosCombinados, geradorComSemente, movimentoReduzido } from '../../core/util.js';

const TAU = Math.PI * 2;
const SOM_POP = new URL('../../../assets/sons/fidget/pop-it.mp3', import.meta.url);

const ARCO_IRIS = ['#ff4d6d', '#ff8c42', '#ffd23f', '#5ddc5a', '#2ec4f0', '#5b6cff', '#a05cff'];

/** `cores`: faixas de cor de cima para baixo. `olhos`: decoração do polvo. */
const FORMATOS = [
  { id: 'arco', nome: 'Arco-íris', cores: ARCO_IRIS },
  { id: 'coracao', nome: 'Coração', cores: ['#ff8fc1', '#ff5fa2', '#ff3d7f', '#e8195e', '#c10f4f'] },
  { id: 'estrela', nome: 'Estrela', cores: ['#fff07a', '#ffd23f', '#ffb020', '#ff8c1a', '#ff6a1a'] },
  { id: 'polvo', nome: 'Polvo', cores: ['#c79bff', '#b07bff', '#9b5cff', '#ff7ac8', '#ff5fae', '#ff4d9a'], olhos: true },
];

/** Contorno de cada formato, centrado em (0,0), com "raio" t. */
function caminhoFormato(id, t) {
  const p = new Path2D();
  if (id === 'arco') {
    p.roundRect(-t, -t * 0.92, t * 2, t * 1.84, t * 0.3);
  } else if (id === 'coracao') {
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * TAU;
      const x = 16 * Math.sin(a) ** 3;
      const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
      const px = (x / 16.5) * t;
      const py = (y / 16.5) * t + t * 0.08;
      if (i) p.lineTo(px, py);
      else p.moveTo(px, py);
    }
    p.closePath();
  } else if (id === 'estrela') {
    // Estrela gordinha: pontas arredondadas por curvas
    const pontas = 5;
    const externo = t * 1.05;
    const interno = t * 0.6;
    const vertices = [];
    for (let i = 0; i < pontas * 2; i++) {
      const raio = i % 2 ? interno : externo;
      const a = -Math.PI / 2 + (i / (pontas * 2)) * TAU;
      vertices.push([Math.cos(a) * raio, Math.sin(a) * raio + t * 0.06]);
    }
    const meio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const inicio = meio(vertices[vertices.length - 1], vertices[0]);
    p.moveTo(...inicio);
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const m = meio(v, vertices[(i + 1) % vertices.length]);
      p.quadraticCurveTo(v[0], v[1], m[0], m[1]);
    }
    p.closePath();
  } else {
    // Polvo: cabeça + quatro tentáculos que nascem por baixo da cabeça e se curvam para fora.
    // Todos os pedaços giram no mesmo sentido, para as sobreposições não virarem buracos.
    p.ellipse(0, -t * 0.3, t * 0.86, t * 0.7, 0, 0, TAU);
    for (const x of [-0.6, -0.2, 0.2, 0.6]) {
      const curva = Math.sign(x) * (Math.abs(x) > 0.4 ? 0.26 : 0.12);
      const w = t * 0.17;
      const cx = x * t;
      const ponta = { x: cx + curva * t, y: t * 0.86 };
      p.moveTo(cx - w, -t * 0.4);
      p.lineTo(cx + w, -t * 0.4);
      p.bezierCurveTo(cx + w, t * 0.25, ponta.x + w * 0.7, t * 0.5, ponta.x + w * 0.62, ponta.y);
      p.arc(ponta.x, ponta.y, w * 0.62, 0, Math.PI);
      p.bezierCurveTo(ponta.x - w * 0.7, t * 0.5, cx - w, t * 0.25, cx - w, -t * 0.4);
      p.closePath();
    }
  }
  return p;
}

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/pop-it.css', import.meta.url));

  const config = { formato: 'arco', ...ler('popit-config', {}) };
  let formato = FORMATOS.find((f) => f.id === config.formato) ?? FORMATOS[0];
  const banco = criarBanco(audio, [SOM_POP], { recorte: { intervaloMin: 0.06, duracaoMax: 0.2 }, canal: 'efeitos' });

  raiz.classList.add('popit');
  raiz.innerHTML = `
    <div class="popit__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Pop It. Toque ou arraste para apertar as bolinhas. Teclado: espaço aperta a próxima, V vira a placa, F troca o formato.">
      <canvas class="popit__canvas"></canvas>
    </div>
    <div class="hud-jogo">
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-restam>0</span><span class="hud-jogo__rotulo">para virar</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-viradas>0</span><span class="hud-jogo__rotulo">viradas</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-total>0</span><span class="hud-jogo__rotulo">pops no total</span></div>
    </div>
    <div class="doca vidro-fosco popit__doca" role="region" aria-label="Formatos do Pop It">
      <div class="doca__linha">
        <span class="doca__rotulo">FORMATO</span>
        ${FORMATOS.map((f) => `<button type="button" class="chip" data-formato="${f.id}" aria-pressed="${f.id === formato.id}"
          style="--c1:${f.cores[1]};--c2:${f.cores[f.cores.length - 2]}"><span class="popit__amostra" style="--a:${f.cores.join(',')}"></span>${f.nome}</button>`).join('')}
        <button type="button" class="chip" data-virar>${icone('voltar')}<span>Virar</span></button>
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.popit__palco');
  const canvas = $('.popit__canvas');
  const g = canvas.getContext('2d');
  const teste = document.createElement('canvas').getContext('2d');

  let tela = { l: 1, a: 1, dpr: 1 };
  let centro = { x: 0, y: 0 };
  let tamanho = 200;
  let raioBolha = 20;
  let bolhas = [];
  let base = null;
  let sprites = null;
  let lado = 0; // 0 ou 1: qual face da placa está para cima
  let viradas = 0;
  const virada = { ativa: false, t: 0, trocou: false };
  let pressionado = false;

  /* ---------- Pré-desenho ---------- */

  /** Faixas de cor: uma por fileira de bolinhas, com a divisa no meio entre fileiras. */
  let faixas = [];

  /** Mistura uma cor hex com branco (+) ou preto (−). */
  function tom(hex, quanto) {
    const n = parseInt(hex.slice(1), 16);
    const canal = (c) => Math.round(quanto >= 0 ? c + (255 - c) * quanto : c * (1 + quanto));
    return `rgb(${canal((n >> 16) & 255)},${canal((n >> 8) & 255)},${canal(n & 255)})`;
  }

  function criarBase() {
    const caminho = caminhoFormato(formato.id, tamanho);
    const margem = tamanho * 0.25;
    const ladoCss = (tamanho + margem) * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(ladoCss * tela.dpr);
    c.height = c.width;
    const s = c.getContext('2d');
    s.scale(tela.dpr, tela.dpr);
    s.translate(ladoCss / 2, ladoCss / 2);

    // Sombra no chão
    s.save();
    s.shadowColor = 'rgba(0,0,0,0.55)';
    s.shadowBlur = tamanho * 0.12;
    s.shadowOffsetY = tamanho * 0.05;
    s.fillStyle = '#000';
    s.fill(caminho);
    s.restore();

    // Faixas de cor, uma por fileira (o lado de trás é um pouco mais escuro)
    s.save();
    s.clip(caminho);
    for (const f of faixas) {
      s.fillStyle = tom(f.cor, lado ? -0.12 : 0);
      s.fillRect(-ladoCss, f.y0 - 0.5, ladoCss * 2, f.y1 - f.y0 + 1);
    }
    // Silicone fosco: luz suave no alto, grão fino
    const luz = s.createLinearGradient(-tamanho, -tamanho, tamanho, tamanho);
    luz.addColorStop(0, 'rgba(255,255,255,0.22)');
    luz.addColorStop(0.5, 'rgba(255,255,255,0)');
    luz.addColorStop(1, 'rgba(0,0,0,0.18)');
    s.fillStyle = luz;
    s.fillRect(-ladoCss, -ladoCss, ladoCss * 2, ladoCss * 2);
    const rnd = geradorComSemente(11);
    for (let i = 0; i < tamanho * 14; i++) {
      s.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      s.fillRect((rnd() - 0.5) * tamanho * 2.2, (rnd() - 0.5) * tamanho * 2.2, 1.2, 1.2);
    }
    // Borda: o silicone é mais grosso na beirada. Sombra e luz internas feitas com a
    // silhueta invertida (assim só a borda de fora conta, nunca as emendas entre as partes)
    const inverso = document.createElement('canvas');
    inverso.width = c.width;
    inverso.height = c.height;
    const ic = inverso.getContext('2d');
    ic.fillRect(0, 0, inverso.width, inverso.height);
    ic.globalCompositeOperation = 'destination-out';
    ic.setTransform(tela.dpr, 0, 0, tela.dpr, (ladoCss / 2) * tela.dpr, (ladoCss / 2) * tela.dpr);
    ic.fill(caminho);
    const desenharBorda = (cor, desfoque, dx, dy) => {
      s.save();
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.shadowColor = cor;
      s.shadowBlur = desfoque * tela.dpr;
      s.shadowOffsetX = dx * tela.dpr;
      s.shadowOffsetY = dy * tela.dpr;
      s.drawImage(inverso, 0, 0);
      s.restore();
    };
    desenharBorda('rgba(255,255,255,0.55)', tamanho * 0.03, tamanho * 0.012, tamanho * 0.016);
    desenharBorda('rgba(0,0,0,0.4)', tamanho * 0.05, -tamanho * 0.012, -tamanho * 0.018);
    s.restore();

    // Olhos do polvo
    if (formato.olhos) {
      for (const lx of [-1, 1]) {
        const x = lx * tamanho * 0.3;
        const y = -tamanho * 0.36;
        s.fillStyle = '#fff';
        s.beginPath();
        s.ellipse(x, y, tamanho * 0.12, tamanho * 0.14, 0, 0, TAU);
        s.fill();
        s.fillStyle = '#2a1048';
        s.beginPath();
        s.arc(x + tamanho * 0.02, y + tamanho * 0.02, tamanho * 0.065, 0, TAU);
        s.fill();
        s.fillStyle = '#fff';
        s.beginPath();
        s.arc(x + tamanho * 0.045, y - tamanho * 0.01, tamanho * 0.022, 0, TAU);
        s.fill();
      }
      s.strokeStyle = '#7a2e7a';
      s.lineWidth = tamanho * 0.025;
      s.lineCap = 'round';
      s.beginPath();
      s.arc(0, -tamanho * 0.2, tamanho * 0.1, 0.2 * Math.PI, 0.8 * Math.PI);
      s.stroke();
    }
    base = { canvas: c, lado: ladoCss, caminho };
  }

  function criarSprites() {
    const r = raioBolha;
    const ladoCss = r * 2.6;
    const fazer = (cor, cima) => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(ladoCss * tela.dpr);
      c.height = c.width;
      const s = c.getContext('2d');
      s.scale(tela.dpr, tela.dpr);
      s.translate(ladoCss / 2, ladoCss / 2);
      const corBase = tom(cor, lado ? -0.12 : 0);
      if (cima) {
        // Sombra de contato em volta da base da cúpula
        const contato = s.createRadialGradient(r * 0.08, r * 0.12, r * 0.8, r * 0.08, r * 0.12, r * 1.25);
        contato.addColorStop(0, 'rgba(0,0,0,0.35)');
        contato.addColorStop(1, 'rgba(0,0,0,0)');
        s.fillStyle = contato;
        s.beginPath();
        s.arc(r * 0.08, r * 0.12, r * 1.25, 0, TAU);
        s.fill();
        // Cúpula
        const cupula = s.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
        cupula.addColorStop(0, tom(cor, 0.45));
        cupula.addColorStop(0.45, corBase);
        cupula.addColorStop(1, tom(cor, -0.35));
        s.fillStyle = cupula;
        s.beginPath();
        s.arc(0, 0, r, 0, TAU);
        s.fill();
        // Brilho acetinado (silicone não espelha: é largo e suave)
        const brilho = s.createRadialGradient(-r * 0.32, -r * 0.38, 0, -r * 0.32, -r * 0.38, r * 0.5);
        brilho.addColorStop(0, 'rgba(255,255,255,0.55)');
        brilho.addColorStop(1, 'rgba(255,255,255,0)');
        s.fillStyle = brilho;
        s.beginPath();
        s.arc(0, 0, r, 0, TAU);
        s.fill();
      } else {
        // Côncava: o lado de cima da cavidade fica na sombra, o de baixo pega luz
        const cavidade = s.createRadialGradient(r * 0.25, r * 0.3, r * 0.1, 0, 0, r * 1.02);
        cavidade.addColorStop(0, tom(cor, 0.12));
        cavidade.addColorStop(0.6, tom(cor, -0.12));
        cavidade.addColorStop(1, tom(cor, -0.4));
        s.fillStyle = cavidade;
        s.beginPath();
        s.arc(0, 0, r, 0, TAU);
        s.fill();
        s.strokeStyle = 'rgba(255,255,255,0.4)';
        s.lineWidth = Math.max(1, r * 0.08);
        s.beginPath();
        s.arc(0, 0, r * 0.94, 0.15 * Math.PI, 0.85 * Math.PI);
        s.stroke();
        s.strokeStyle = 'rgba(0,0,0,0.3)';
        s.beginPath();
        s.arc(0, 0, r * 0.94, 1.1 * Math.PI, 1.9 * Math.PI);
        s.stroke();
      }
      return c;
    };
    sprites = { lado: ladoCss, cima: new Map(), baixo: new Map() };
    for (const cor of formato.cores) {
      sprites.cima.set(cor, fazer(cor, true));
      sprites.baixo.set(cor, fazer(cor, false));
    }
  }

  function montarPlaca() {
    tamanho = Math.max(110, Math.min(tela.l * 0.42, (tela.a - 250) * 0.5, 330));
    centro = { x: tela.l / 2, y: (tela.a - 110) / 2 + 40 };
    raioBolha = tamanho * (formato.id === 'arco' ? 0.112 : 0.1);
    // Grade hexagonal: só entram bolinhas inteiras dentro do formato (e longe dos olhos do polvo)
    const caminho = caminhoFormato(formato.id, tamanho);
    const passo = raioBolha * 2.22;
    const novas = [];
    teste.lineWidth = raioBolha * 1.6;
    for (let y = -tamanho; y <= tamanho; y += passo * 0.87) {
      const linha = Math.round((y + tamanho) / (passo * 0.87));
      for (let x = -tamanho; x <= tamanho; x += passo) {
        const px = x + (linha % 2 ? passo / 2 : 0);
        const dentro = [0, 1, 2, 3, 4, 5].every((k) => {
          const a = (k / 6) * TAU;
          const folga = raioBolha * (formato.olhos ? 1.06 : 1.25);
          return teste.isPointInPath(caminho, px + Math.cos(a) * folga, y + Math.sin(a) * folga);
        }) && teste.isPointInPath(caminho, px, y);
        if (!dentro) continue;
        if (formato.olhos && Math.abs(Math.abs(px) - tamanho * 0.3) < tamanho * 0.2 && Math.abs(y + tamanho * 0.36) < tamanho * 0.2) continue;
        if (formato.olhos && Math.abs(px) < tamanho * 0.2 && Math.abs(y + tamanho * 0.17) < tamanho * 0.15) continue;
        novas.push({ x: px, y, linha, cima: true, anim: 1 });
      }
    }
    // Cada fileira ganha uma cor da paleta, distribuídas de cima a baixo
    const linhas = [...new Set(novas.map((b) => b.linha))].sort((x, y) => x - y);
    const yDaLinha = (linha) => novas.find((b) => b.linha === linha).y;
    faixas = linhas.map((linha, i) => {
      const y = yDaLinha(linha);
      const anterior = i ? yDaLinha(linhas[i - 1]) : y - passo;
      const seguinte = i < linhas.length - 1 ? yDaLinha(linhas[i + 1]) : y;
      return {
        linha,
        cor: formato.cores[Math.min(formato.cores.length - 1, Math.floor((i * formato.cores.length) / linhas.length))],
        y0: i ? (anterior + y) / 2 : -tamanho * 2,
        y1: i < linhas.length - 1 ? (y + seguinte) / 2 : tamanho * 2,
      };
    });
    for (const b of novas) b.cor = faixas.find((f) => f.linha === b.linha).cor;
    bolhas = novas;
    criarBase();
    criarSprites();
    atualizarHud();
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      montarPlaca();
    },
  });

  /* ---------- Apertar e virar ---------- */

  function apertar(b) {
    if (!b.cima || virada.ativa) return;
    b.cima = false;
    b.anim = 0;
    const pan = clamp((centro.x + b.x - tela.l / 2) / (tela.l / 2), -1, 1) * 0.5;
    // Bolinhas de baixo (mais escuras) soam um tiquinho mais graves
    const tomPop = 1.08 - ((b.y + tamanho) / (tamanho * 2)) * 0.16;
    if (!banco.tocar({ tom: tomPop, variacaoTom: 0.06, pan, volume: 1.1 })) audio.tocar('squish', { tom: 1.6 * tomPop, pan });
    progresso.registrar('popit:aperto');
    atualizarHud();
    if (bolhas.every((x) => !x.cima)) setTimeout(virar, 380);
  }

  function virar() {
    if (virada.ativa) return;
    virada.ativa = true;
    virada.t = movimentoReduzido() ? 0.5 : 0;
    virada.trocou = false;
    audio.tocar('whoosh');
  }

  function completarVirada() {
    lado = 1 - lado;
    viradas++;
    progresso.registrar('popit:virada');
    criarBase();
    criarSprites();
    for (const b of bolhas) {
      b.cima = true;
      b.anim = 1;
    }
    audio.tocar('squish', { tom: 0.7, volume: 0.8 });
    atualizarHud();
  }

  function bolhaEm(x, y) {
    const lx = x - centro.x;
    const ly = y - centro.y;
    for (const b of bolhas) if ((b.x - lx) ** 2 + (b.y - ly) ** 2 < raioBolha * raioBolha * 1.1) return b;
    return null;
  }

  function atualizarHud() {
    $('[data-restam]').textContent = String(bolhas.filter((b) => b.cima).length);
    $('[data-viradas]').textContent = String(viradas);
    $('[data-total]').textContent = progresso.contador('popit:aperto').toLocaleString('pt-BR');
  }

  function trocarFormato(id) {
    formato = FORMATOS.find((f) => f.id === id);
    config.formato = id;
    gravar('popit-config', config);
    lado = 0;
    for (const b of raiz.querySelectorAll('[data-formato]')) b.setAttribute('aria-pressed', String(b.dataset.formato === id));
    montarPlaca();
    audio.tocar('tema');
  }

  /* ---------- Entrada ---------- */

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };
  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    pressionado = true;
    const { x, y } = posicao(e);
    const b = bolhaEm(x, y);
    if (b) apertar(b);
  });
  palco.addEventListener('pointermove', (e) => {
    if (!pressionado) return;
    for (const ev of eventosCombinados(e)) {
      const { x, y } = posicao(ev);
      const b = bolhaEm(x, y);
      if (b) apertar(b);
    }
  });
  const soltar = () => {
    pressionado = false;
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button')) return;
    const tecla = e.key.toLowerCase();
    if (tecla === ' ' || tecla === 'enter') {
      e.preventDefault();
      const proxima = bolhas.find((b) => b.cima);
      if (proxima) apertar(proxima);
    } else if (tecla === 'v') virar();
    else if (tecla === 'f') trocarFormato(FORMATOS[(FORMATOS.indexOf(formato) + 1) % FORMATOS.length].id);
  });

  $('.popit__doca').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-formato]');
    if (botao) trocarFormato(botao.dataset.formato);
    else if (e.target.closest('[data-virar]')) virar();
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (!base || !sprites) return;
    for (const b of bolhas) b.anim = Math.min(1, b.anim + dt * 14);

    let escalaX = 1;
    let inclinacao = 0;
    if (virada.ativa) {
      virada.t = Math.min(1, virada.t + dt * 1.8);
      escalaX = Math.cos(virada.t * Math.PI);
      inclinacao = Math.sin(virada.t * Math.PI) * 0.12;
      if (!virada.trocou && virada.t >= 0.5) {
        virada.trocou = true;
        completarVirada();
      }
      if (virada.t >= 1) virada.ativa = false;
    }

    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fundo = g.createRadialGradient(l / 2, a * 0.45, 0, l / 2, a * 0.45, Math.hypot(l, a) * 0.7);
    fundo.addColorStop(0, '#2b1f4a');
    fundo.addColorStop(1, '#0c0818');
    g.fillStyle = fundo;
    g.fillRect(0, 0, l, a);

    g.save();
    g.translate(centro.x, centro.y);
    g.rotate(inclinacao);
    g.scale(Math.max(0.02, Math.abs(escalaX)), 1 + Math.abs(inclinacao) * 0.4);
    g.drawImage(base.canvas, -base.lado / 2, -base.lado / 2, base.lado, base.lado);
    const meio = sprites.lado / 2;
    for (const b of bolhas) {
      const sprite = (b.cima ? sprites.cima : sprites.baixo).get(b.cor);
      if (b.anim < 1) {
        // Afundando: a cúpula achata e a cavidade aparece
        const t = b.anim;
        const anterior = (b.cima ? sprites.baixo : sprites.cima).get(b.cor);
        g.globalAlpha = 1 - t;
        g.drawImage(anterior, b.x - meio, b.y - meio * (1 - t * 0.3), sprites.lado, sprites.lado * (1 - t * 0.3));
        g.globalAlpha = t;
        const s = 0.9 + t * 0.1;
        g.drawImage(sprite, b.x - meio * s, b.y - meio * s, sprites.lado * s, sprites.lado * s);
        g.globalAlpha = 1;
      } else {
        g.drawImage(sprite, b.x - meio, b.y - meio, sprites.lado, sprites.lado);
      }
    }
    g.restore();
  });

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
    },
  };
}
