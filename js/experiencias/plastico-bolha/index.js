/**
 * Plástico-Bolha realista: uma folha de plástico transparente sobre uma superfície.
 * Cada bolha é uma lente (amplia a textura de baixo), com borda de Fresnel, brilho
 * especular que acompanha o ponteiro, sombra com foco de luz e, depois do estouro,
 * plástico achatado, amassado e fosco. Sons: gravações reais (CC0) recortadas em
 * dezenas de estouros diferentes, com pequena variação de tom.
 * Toque ou arraste para estourar. Quando a folha acaba, uma nova desliza para a tela.
 */
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, eventosCombinados, geradorComSemente, movimentoReduzido, semHover } from '../../core/util.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { criarBanco } from '../../core/amostras.js?v=202610231621';
import { mostrarToast } from '../../core/ui.js?v=202610231621';

const TAU = Math.PI * 2;
const VARIANTES = 4;
const SONS = [1, 2, 3, 4, 5].map((n) => new URL(`../../../assets/sons/plastico-bolha/estouros-${n}.mp3`, import.meta.url));
const SOM_AMASSAR = new URL('../../../assets/sons/plastico-bolha/amassar.mp3', import.meta.url);

/** `fundo`: superfície embaixo do plástico. `tinta`: cor do plástico (RGB). */
const FOLHAS = [
  { nome: 'Cristal', fundo: ['#2b3650', '#141a2b'], tinta: [205, 228, 255], cores: ['#9fd8ff', '#7b8cff'] },
  { nome: 'Menta', fundo: ['#0f4a40', '#06241f'], tinta: [140, 255, 214], cores: ['#3cffb4', '#00b4ff'] },
  { nome: 'Chiclete', fundo: ['#561a45', '#2a0b24'], tinta: [255, 168, 220], cores: ['#ff9ad5', '#c77dff'] },
  { nome: 'Oceano', fundo: ['#13306b', '#081736'], tinta: [140, 196, 255], cores: ['#22c4ff', '#3a6bff'] },
  { nome: 'Âmbar', fundo: ['#58380f', '#2a1806'], tinta: [255, 214, 150], cores: ['#ffd60a', '#ff7a18'] },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/plastico-bolha.css?v=202610231621', import.meta.url));

  const config = { folha: 0, ...ler('bolha-config', {}) };
  const banco = criarBanco(audio, SONS, { recorte: { duracaoMax: 0.22 } });
  let somAmassar = null;
  audio.carregarAmostra(SOM_AMASSAR).then((b) => { somAmassar = b; });

  raiz.classList.add('bolha');
  raiz.innerHTML = `
    <div class="bolha__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Plástico-bolha. Toque ou arraste para estourar. Teclado: setas escolhem a bolha, espaço estoura, N troca a folha.">
      <canvas class="bolha__canvas"></canvas>
    </div>
    <div class="hud-jogo">
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-folha>0/0</span><span class="hud-jogo__rotulo">nesta folha</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-combo>x0</span><span class="hud-jogo__rotulo">sequência</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-total>0</span><span class="hud-jogo__rotulo">no total</span></div>
    </div>
    <p class="dica-palco" data-dica>Pop!<small>toque ou arraste por cima das bolhas</small></p>
    <div class="cantos-jogo">
      <button type="button" class="chip" data-nova-folha>${icone('bolhas')}<span>Nova folha</span></button>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.bolha__palco');
  const canvas = $('.bolha__canvas');
  const ctx = canvas.getContext('2d');
  const dica = $('[data-dica]');

  const tela = { l: 1, a: 1, dpr: 1 };
  const ponteiro = { x: 0.5, y: 0.3 }; // normalizado: move o reflexo como se a folha inclinasse
  const brilhoAlvo = { x: 0.5, y: 0.3 };
  let bolhas = [];
  let lado = 64;
  let raio = 26;
  let sprites = null;
  let camadaFundo = null;
  let folha = FOLHAS[config.folha % FOLHAS.length];
  const efeitos = []; // anéis de ar que escapam
  const textos = [];
  const combo = { quantidade: 0, ultimo: 0 };
  let selecionada = -1;
  let tempo = 0;
  let interagiu = false;
  // Troca de folha: a atual sai pela esquerda e a nova entra pela direita
  const troca = { fase: 'parada', t: 0 };

  /* ---------- Texturas e sprites (pré-desenhados: o quadro só cola imagens) ---------- */

  /** Textura fina da superfície (fibras e grão), em ladrilho. */
  function criarTextura(tamanho, semente) {
    const c = document.createElement('canvas');
    c.width = tamanho;
    c.height = tamanho;
    const g = c.getContext('2d');
    const rnd = geradorComSemente(semente);
    const img = g.createImageData(tamanho, tamanho);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rnd() - 0.5) * 46;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // Fibras: traços longos e finos em direções quase iguais
    g.globalAlpha = 0.16;
    for (let i = 0; i < tamanho * 0.9; i++) {
      const x = rnd() * tamanho;
      const y = rnd() * tamanho;
      const ang = 0.5 + (rnd() - 0.5) * 0.7;
      const comp = 6 + rnd() * 22;
      g.strokeStyle = rnd() > 0.5 ? '#fff' : '#000';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * comp, y + Math.sin(ang) * comp);
      g.stroke();
    }
    return c;
  }

  let textura = null;

  function criarCamadaFundo() {
    const { l, a, dpr } = tela;
    const c = document.createElement('canvas');
    c.width = Math.round(l * dpr);
    c.height = Math.round(a * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const [f1, f2] = folha.fundo;
    const base = g.createRadialGradient(l * 0.3, a * 0.2, 0, l * 0.5, a * 0.5, Math.hypot(l, a) * 0.75);
    base.addColorStop(0, f1);
    base.addColorStop(1, f2);
    g.fillStyle = base;
    g.fillRect(0, 0, l, a);
    // Grão da superfície em modo de sobreposição suave
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.5;
    g.fillStyle = g.createPattern(textura, 'repeat');
    g.fillRect(0, 0, l, a);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    // O filme plástico entre as bolhas: levemente leitoso, com ondulações largas de brilho
    const [r, gg, b] = folha.tinta;
    g.fillStyle = `rgba(${r},${gg},${b},0.07)`;
    g.fillRect(0, 0, l, a);
    for (let i = 0; i < 4; i++) {
      const x = l * (0.1 + i * 0.3);
      const faixa = g.createLinearGradient(x - 160, 0, x + 160, a * 0.4);
      faixa.addColorStop(0, 'rgba(255,255,255,0)');
      faixa.addColorStop(0.5, `rgba(255,255,255,${0.035 + (i % 2) * 0.02})`);
      faixa.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = faixa;
      g.fillRect(0, 0, l, a);
    }
    // Vinheta: luz concentrada no meio da mesa
    const vinheta = g.createRadialGradient(l / 2, a / 2, Math.min(l, a) * 0.35, l / 2, a / 2, Math.hypot(l, a) * 0.62);
    vinheta.addColorStop(0, 'rgba(0,0,0,0)');
    vinheta.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vinheta;
    g.fillRect(0, 0, l, a);
    camadaFundo = c;
  }

  /** Pré-desenha, para cada bolha, o fundo ampliado 1,3x e levemente deslocado, recortado num círculo. */
  let camadaLentes = null;
  function criarCamadaLentes() {
    const { l, a, dpr } = tela;
    const c = document.createElement('canvas');
    c.width = Math.round(l * dpr);
    c.height = Math.round(a * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const fonte = raio / 1.3;
    for (const b of bolhas) {
      g.save();
      g.beginPath();
      g.arc(b.x, b.y, raio, 0, TAU);
      g.clip();
      g.drawImage(camadaFundo,
        (b.x - fonte - raio * 0.08) * dpr, (b.y - fonte - raio * 0.1) * dpr, fonte * 2 * dpr, fonte * 2 * dpr,
        b.x - raio, b.y - raio, raio * 2, raio * 2);
      g.restore();
    }
    camadaLentes = c;
  }

  function criarSprites() {
    const margem = raio * 0.55;
    const tamanhoCss = raio * 2 + margem * 2;
    const tamanho = Math.ceil(tamanhoCss * tela.dpr);
    const centro = tamanhoCss / 2;
    const fazer = (desenho) => {
      const c = document.createElement('canvas');
      c.width = tamanho;
      c.height = tamanho;
      const g = c.getContext('2d');
      g.scale(tela.dpr, tela.dpr);
      g.translate(centro, centro);
      desenho(g);
      return c;
    };
    const [tr, tg, tb] = folha.tinta;
    const tinta = (alfa) => `rgba(${tr},${tg},${tb},${alfa})`;
    const r = raio;

    const cheia = (variante) => fazer((g) => {
      // Sombra projetada (luz no alto à esquerda) com um foco de luz dentro: a bolha é uma lente
      const sombra = g.createRadialGradient(r * 0.2, r * 0.3, r * 0.2, r * 0.2, r * 0.3, r * 1.12);
      sombra.addColorStop(0, 'rgba(0,0,0,0.42)');
      sombra.addColorStop(0.7, 'rgba(0,0,0,0.22)');
      sombra.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sombra;
      g.beginPath();
      g.ellipse(r * 0.2, r * 0.3, r * 1.12, r * 1.06, 0.3, 0, TAU);
      g.fill();
      const foco = g.createRadialGradient(r * 0.38, r * 0.5, 0, r * 0.38, r * 0.5, r * 0.42);
      foco.addColorStop(0, tinta(0.32));
      foco.addColorStop(1, tinta(0));
      g.fillStyle = foco;
      g.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
      // A luz atravessa a cúpula: embaixo dela não há sombra (a lente aparece por baixo deste sprite)
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
      g.globalCompositeOperation = 'source-over';

      g.save();
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.clip();
      // Corpo transparente: claro no centro, escurecendo para a borda (Fresnel)
      const corpo = g.createRadialGradient(-r * 0.15, -r * 0.2, r * 0.1, 0, 0, r);
      corpo.addColorStop(0, tinta(0.08 + variante * 0.01));
      corpo.addColorStop(0.6, tinta(0.04));
      corpo.addColorStop(0.84, 'rgba(6,12,30,0.1)');
      corpo.addColorStop(0.96, 'rgba(6,12,30,0.3)');
      corpo.addColorStop(1, tinta(0.55));
      g.fillStyle = corpo;
      g.fillRect(-r, -r, r * 2, r * 2);
      // Reflexo interno no lado da sombra (lua crescente embaixo à direita)
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = tinta(0.22);
      g.lineWidth = r * 0.16;
      g.filter = `blur(${Math.max(1, r * 0.06)}px)`;
      g.beginPath();
      g.arc(0, 0, r * 0.8, -0.15, Math.PI * 0.62);
      g.stroke();
      g.filter = 'none';
      g.restore();
      // Aro: onde a cúpula encontra o filme plano
      g.strokeStyle = 'rgba(0,0,0,0.22)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(0, 0, r - 0.4, 0, TAU);
      g.stroke();
      g.strokeStyle = tinta(0.38);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(0, 0, r - 1.6, Math.PI * 0.95, Math.PI * 1.75);
      g.stroke();
    });

    // Brilho especular separado: desenhado por cima com deslocamento que segue o ponteiro
    const brilho = fazer((g) => {
      g.save();
      g.rotate(-0.72);
      const principal = g.createRadialGradient(0, -r * 0.5, 0, 0, -r * 0.5, r * 0.34);
      principal.addColorStop(0, 'rgba(255,255,255,0.95)');
      principal.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      principal.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = principal;
      g.beginPath();
      g.ellipse(0, -r * 0.5, r * 0.36, r * 0.17, 0, 0, TAU);
      g.fill();
      g.restore();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(-r * 0.43, -r * 0.47, r * 0.055, 0, TAU);
      g.fill();
      // Reflexo de "janela" mais fraco do outro lado
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = r * 0.07;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(0, 0, r * 0.66, Math.PI * 0.12, Math.PI * 0.36);
      g.stroke();
    });

    const estourada = (semente) => fazer((g) => {
      const rnd = geradorComSemente(semente);
      // Sombra baixa: o plástico achatou
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.beginPath();
      g.ellipse(r * 0.08, r * 0.12, r * 0.92, r * 0.86, 0, 0, TAU);
      g.fill();
      // Contorno amassado e irregular
      const pontos = [];
      const n = 15;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + (rnd() - 0.5) * 0.25;
        const raioPonto = r * (0.8 + rnd() * 0.16);
        pontos.push([Math.cos(ang) * raioPonto, Math.sin(ang) * raioPonto * (0.9 + rnd() * 0.1)]);
      }
      const centro = [(rnd() - 0.5) * r * 0.3, (rnd() - 0.5) * r * 0.3];
      g.beginPath();
      pontos.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = 'rgba(232,240,255,0.12)'; // leitoso
      g.fill();
      g.fillStyle = tinta(0.1);
      g.fill();
      // Facetas: cada triângulo pega a luz de um jeito
      for (let i = 0; i < n; i++) {
        const [ax, ay] = pontos[i];
        const [bx, by] = pontos[(i + 1) % n];
        const normal = Math.cos(Math.atan2((ay + by) / 2, (ax + bx) / 2) + 2.3);
        g.fillStyle = normal > 0 ? `rgba(255,255,255,${0.04 + normal * 0.16 * rnd()})` : `rgba(0,0,10,${-normal * 0.14 * rnd()})`;
        g.beginPath();
        g.moveTo(centro[0], centro[1]);
        g.lineTo(ax, ay);
        g.lineTo(bx, by);
        g.closePath();
        g.fill();
      }
      // Vincos: linhas claras e escuras saindo do miolo
      for (let i = 0; i < 7; i++) {
        const [px, py] = pontos[Math.floor(rnd() * n)];
        const meio = 0.3 + rnd() * 0.5;
        const clara = rnd() > 0.45;
        g.strokeStyle = clara ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
        g.lineWidth = clara ? 0.9 : 1.1;
        g.beginPath();
        g.moveTo(centro[0] + (rnd() - 0.5) * 4, centro[1] + (rnd() - 0.5) * 4);
        g.lineTo(centro[0] + (px - centro[0]) * meio + (rnd() - 0.5) * r * 0.2, centro[1] + (py - centro[1]) * meio + (rnd() - 0.5) * r * 0.2);
        g.lineTo(px * 0.96, py * 0.96);
        g.stroke();
      }
      g.beginPath();
      pontos.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.strokeStyle = 'rgba(255,255,255,0.3)';
      g.lineWidth = 1;
      g.stroke();
      // Pequenos brilhos presos nos vincos
      for (let i = 0; i < 3; i++) {
        const ang = rnd() * TAU;
        const d = r * (0.2 + rnd() * 0.5);
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.beginPath();
        g.ellipse(Math.cos(ang) * d, Math.sin(ang) * d, 2.2, 0.9, ang, 0, TAU);
        g.fill();
      }
    });

    sprites = {
      tamanho: tamanhoCss,
      cheias: Array.from({ length: VARIANTES }, (_, i) => cheia(i)),
      brilho,
      estouradas: Array.from({ length: VARIANTES * 2 }, (_, i) => estourada(1000 + i * 77 + config.folha * 13)),
    };
  }

  /* ---------- Folha ---------- */

  function montarFolha({ manterEstado = false } = {}) {
    const caixa = palco.getBoundingClientRect();
    if (caixa.width < 2) return;
    tela.l = caixa.width;
    tela.a = caixa.height;
    tela.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(tela.l * tela.dpr);
    canvas.height = Math.round(tela.a * tela.dpr);

    lado = semHover() ? 60 : 70;
    raio = lado * 0.42;
    const topo = 140;
    const base = 84;
    const colunas = Math.max(3, Math.floor((tela.l - 24) / lado));
    const linhas = Math.max(3, Math.floor((tela.a - topo - base) / (lado * 0.87)));
    const x0 = (tela.l - colunas * lado) / 2 + lado / 2;
    const y0 = topo + (tela.a - topo - base - linhas * lado * 0.87) / 2 + lado / 2;
    const anteriores = manterEstado ? bolhas : [];
    bolhas = [];
    for (let linha = 0; linha < linhas; linha++) {
      const deslocada = linha % 2 === 1;
      for (let coluna = 0; coluna < colunas - (deslocada ? 1 : 0); coluna++) {
        const antiga = anteriores.find((b) => b.linha === linha && b.coluna === coluna);
        bolhas.push({
          x: x0 + coluna * lado + (deslocada ? lado / 2 : 0),
          y: y0 + linha * lado * 0.87,
          linha,
          coluna,
          cheia: antiga ? antiga.cheia : true,
          estouro: 0, // tempo desde o estouro (anima o achatamento)
          variante: Math.floor(Math.random() * VARIANTES),
          amassado: Math.floor(Math.random() * VARIANTES * 2),
          escala: 1,
        });
      }
    }
    selecionada = clamp(selecionada, -1, bolhas.length - 1);
    textura ??= criarTextura(192, 7);
    criarCamadaFundo();
    criarCamadaLentes();
    criarSprites();
    atualizarHud();
  }

  const observador = new ResizeObserver(() => montarFolha({ manterEstado: true }));
  observador.observe(palco);

  function trocarFolha() {
    if (troca.fase !== 'parada') return;
    troca.fase = movimentoReduzido() ? 'entrando' : 'saindo';
    troca.t = movimentoReduzido() ? 1 : 0;
    if (somAmassar) audio.tocarAmostra(somAmassar, { inicio: aleatorio(0, Math.max(0, somAmassar.duration - 1.6)), duracao: 1.3, volume: 0.9, soltura: 0.4 });
    else audio.tocar('whoosh');
    if (troca.fase === 'entrando') proximaFolha();
  }

  function proximaFolha() {
    config.folha = (config.folha + 1) % FOLHAS.length;
    gravar('bolha-config', config);
    folha = FOLHAS[config.folha];
    raiz.style.setProperty('--c1', folha.cores[0]);
    raiz.style.setProperty('--c2', folha.cores[1]);
    montarFolha();
  }

  /* ---------- Estourar ---------- */

  function estourar(bolha) {
    if (!bolha.cheia || troca.fase !== 'parada') return;
    bolha.cheia = false;
    bolha.estouro = 0;
    if (!interagiu) {
      interagiu = true;
      dica.classList.add('dica-palco--oculta');
    }
    const agora = performance.now();
    combo.quantidade = agora - combo.ultimo < 320 ? combo.quantidade + 1 : 1;
    combo.ultimo = agora;
    const pan = clamp((bolha.x / tela.l) * 2 - 1, -1, 1) * 0.6;
    // Bolhas um pouco menores (no celular) soam um tiquinho mais agudas
    if (!banco.tocar({ tom: semHover() ? 1.06 : 1, variacaoTom: 0.09, pan })) {
      audio.tocar('estouro', { tamanho: aleatorio(0.25, 0.75), pan, intervaloMin: 0.012 });
    }
    efeitos.push({ x: bolha.x, y: bolha.y, vida: 1 });
    if (combo.quantidade > 0 && combo.quantidade % 10 === 0) {
      textos.push({ x: bolha.x, y: bolha.y - 20, texto: `x${combo.quantidade}!`, vida: 1 });
      audio.tocar('combo', { n: combo.quantidade / 10 });
    }
    progresso.registrar('bolha:estouro');
    progresso.definirRecorde('plastico-bolha', 'sequencia', combo.quantidade);
    atualizarHud();

    if (bolhas.every((b) => !b.cheia)) {
      progresso.registrar('bolha:folha');
      audio.tocar('conquista');
      mostrarToast({ titulo: 'Folha completa!', texto: `${bolhas.length} bolhas estouradas. Lá vem outra!`, icone: 'bolhas', cor: folha.cores[0] });
      setTimeout(trocarFolha, 900);
    }
  }

  function bolhaEm(x, y) {
    for (const b of bolhas) if ((b.x - x) ** 2 + (b.y - y) ** 2 < raio * raio * 1.15) return b;
    return null;
  }

  function atualizarHud() {
    const estouradas = bolhas.filter((b) => !b.cheia).length;
    $('[data-folha]').textContent = `${estouradas}/${bolhas.length}`;
    $('[data-combo]').textContent = `x${combo.quantidade}`;
    $('[data-total]').textContent = progresso.contador('bolha:estouro').toLocaleString('pt-BR');
  }

  /* ---------- Loop ---------- */

  const suavizar = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  const pararLoop = aoQuadro((dt) => {
    if (!sprites) return;
    tempo += dt;
    if (performance.now() - combo.ultimo > 900 && combo.quantidade) {
      combo.quantidade = 0;
      atualizarHud();
    }

    // Troca de folha
    let deslocamento = 0;
    if (troca.fase === 'saindo') {
      troca.t = Math.min(1, troca.t + dt * 1.9);
      deslocamento = -suavizar(troca.t) * tela.l;
      if (troca.t >= 1) {
        proximaFolha();
        troca.fase = 'entrando';
        troca.t = 0;
      }
    } else if (troca.fase === 'entrando') {
      troca.t = Math.min(1, troca.t + dt * 1.9);
      deslocamento = (1 - suavizar(troca.t)) * tela.l;
      if (troca.t >= 1) troca.fase = 'parada';
    }

    // O brilho persegue o ponteiro devagar, como uma folha sendo inclinada
    const seguir = Math.min(1, dt * 4);
    ponteiro.x += (brilhoAlvo.x - ponteiro.x) * seguir;
    ponteiro.y += (brilhoAlvo.y - ponteiro.y) * seguir;

    const { l, a, dpr } = tela;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(camadaFundo, 0, 0, l, a);
    ctx.save();
    ctx.translate(deslocamento, 0);

    const metade = sprites.tamanho / 2;
    const parado = movimentoReduzido();
    for (let i = 0; i < bolhas.length; i++) {
      const b = bolhas[i];
      if (b.x + deslocamento < -lado || b.x + deslocamento > l + lado) continue;
      if (b.cheia) {
        const respiro = parado ? 1 : 1 + Math.sin(tempo * 1.6 + b.x * 0.04 + b.y * 0.03) * 0.008;
        const s = b.escala * respiro;
        const d = raio * s;
        ctx.drawImage(camadaLentes, (b.x - raio) * dpr, (b.y - raio) * dpr, raio * 2 * dpr, raio * 2 * dpr, b.x - d, b.y - d, d * 2, d * 2);
        ctx.drawImage(sprites.cheias[b.variante], b.x - metade * s, b.y - metade * s, sprites.tamanho * s, sprites.tamanho * s);
        // Reflexo: anda um pouco conforme o ponteiro (e um tiquinho conforme a posição da bolha)
        const dx = (ponteiro.x - b.x / l) * raio * 0.28;
        const dy = (ponteiro.y - b.y / a) * raio * 0.22;
        ctx.globalAlpha = 0.85 + Math.sin(tempo * 0.7 + b.x * 0.01) * 0.08;
        ctx.drawImage(sprites.brilho, b.x - metade * s + dx, b.y - metade * s + dy, sprites.tamanho * s, sprites.tamanho * s);
        ctx.globalAlpha = 1;
      } else {
        b.estouro += dt;
        const t = Math.min(1, b.estouro / 0.14);
        if (t < 1 && !parado) {
          // Achatando: a cúpula desce e alarga antes de virar plástico amassado
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.scale(1 + t * 0.12, 1 - t * 0.45);
          ctx.globalAlpha = 1 - t;
          ctx.drawImage(sprites.cheias[b.variante], -metade, -metade, sprites.tamanho, sprites.tamanho);
          ctx.restore();
          ctx.globalAlpha = t;
        }
        // Já assentada: cola a imagem direto (sem transformações, que custam caro em folhas grandes)
        const assentar = parado ? 1 : 1 + Math.max(0, 0.14 - b.estouro) * 0.6;
        const m = metade * assentar;
        ctx.drawImage(sprites.estouradas[b.amassado], b.x - m, b.y - m, m * 2, m * 2);
        ctx.globalAlpha = 1;
      }
      if (i === selecionada) {
        ctx.strokeStyle = '#ffd60a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, raio + 5, 0, TAU);
        ctx.stroke();
      }
    }

    // Ar escapando: um anel fino e rápido
    for (const e of efeitos) {
      e.vida -= dt * 4.5;
      if (e.vida <= 0) continue;
      ctx.globalAlpha = e.vida * 0.35;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, raio * (1 + (1 - e.vida) * 0.7), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = '26px Bungee, sans-serif';
    for (const t of textos) {
      t.y -= 50 * dt;
      t.vida -= dt;
      ctx.globalAlpha = clamp(t.vida * 1.6, 0, 1);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = folha.cores[0];
      ctx.shadowBlur = 16;
      ctx.fillText(t.texto, t.x, t.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    for (let i = efeitos.length - 1; i >= 0; i--) if (efeitos[i].vida <= 0) efeitos.splice(i, 1);
    for (let i = textos.length - 1; i >= 0; i--) if (textos[i].vida <= 0) textos.splice(i, 1);
  });

  /* ---------- Entrada ---------- */

  let pressionado = false;
  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    pressionado = true;
    selecionada = -1;
    const { x, y } = posicao(e);
    const bolha = bolhaEm(x, y);
    if (bolha) estourar(bolha);
  });
  palco.addEventListener('pointermove', (e) => {
    const { x, y } = posicao(e);
    brilhoAlvo.x = x / tela.l;
    brilhoAlvo.y = y / tela.a;
    if (!pressionado) return;
    // Arrastar: estoura tudo pelo caminho (inclusive entre dois eventos do mouse)
    for (const ev of eventosCombinados(e)) {
      const p = posicao(ev);
      const bolha = bolhaEm(p.x, p.y);
      if (bolha) estourar(bolha);
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
    if (tecla === 'n') {
      trocarFolha();
      return;
    }
    if (!bolhas.length) return;
    if (selecionada < 0) selecionada = Math.floor(bolhas.length / 2);
    const atual = bolhas[selecionada];
    const vizinha = (dLinha, dColuna) => {
      let melhor = selecionada;
      let menor = Infinity;
      bolhas.forEach((b, i) => {
        if (b.linha !== atual.linha + dLinha) return;
        const distancia = Math.abs(b.x - (atual.x + dColuna * lado));
        if (distancia < menor) {
          menor = distancia;
          melhor = i;
        }
      });
      return melhor;
    };
    if (e.key === 'ArrowLeft') selecionada = vizinha(0, -1);
    else if (e.key === 'ArrowRight') selecionada = vizinha(0, 1);
    else if (e.key === 'ArrowUp') selecionada = vizinha(-1, 0);
    else if (e.key === 'ArrowDown') selecionada = vizinha(1, 0);
    else if (tecla === ' ' || tecla === 'enter') estourar(atual);
    else return;
    e.preventDefault();
  });

  $('[data-nova-folha]').addEventListener('click', trocarFolha);

  raiz.style.setProperty('--c1', folha.cores[0]);
  raiz.style.setProperty('--c2', folha.cores[1]);
  montarFolha();

  return {
    destruir() {
      pararLoop();
      observador.disconnect();
    },
  };
}
