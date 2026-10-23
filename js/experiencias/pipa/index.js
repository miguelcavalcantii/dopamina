/**
 * Empinar Pipa: céu com nuvens em parallax e vento que muda de direção e força.
 * Física: a pipa sofre arrasto e sustentação do vento aparente, gravidade e a linha
 * (que só puxa quando está esticada). Puxar a linha encurta e aumenta o vento aparente
 * (a pipa sobe); soltar dá linha. O ponteiro (ou as setas) inclina a pipa para os lados.
 * A rabiola é uma corrente de pontos (Verlet) levada pelo vento.
 * Modos: Livre (só curtir) e Desafio (estrelas para pegar; pássaros e pipas para desviar).
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { criarBanco } from '../../core/amostras.js?v=202610231621';
import { criarPainelJogo } from '../../core/painel-jogo.js?v=202610231621';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, escolher, geradorComSemente, movimentoReduzido } from '../../core/util.js?v=202610231621';

const TAU = Math.PI * 2;
const SOM_VENTO = new URL('../../../assets/sons/jogos/vento.mp3', import.meta.url);
const SOM_TECIDO = new URL('../../../assets/sons/jogos/pipa-tecido.mp3', import.meta.url);
const ELOS_RABIOLA = 16;
const DURACAO_DESAFIO = 90;

const FORMATOS = [
  { id: 'losango', nome: 'Losango' },
  { id: 'arraia', nome: 'Arraia' },
  { id: 'delta', nome: 'Delta' },
];
const CORES = [
  { id: 'fogo', nome: 'Fogo', cores: ['#ff2e5e', '#ffd60a', '#ff7a18'] },
  { id: 'oceano', nome: 'Oceano', cores: ['#22a8ff', '#ffffff', '#1d4ed8'] },
  { id: 'arco', nome: 'Arco-íris', cores: ['#8b5cff', '#3cffb4', '#ff5dc8'] },
  { id: 'lima', nome: 'Lima', cores: ['#a3ff12', '#0a7a4a', '#ffffff'] },
];
const RABIOLAS = [
  { id: 'lacos', nome: 'Laços' },
  { id: 'fitas', nome: 'Fitas' },
  { id: 'nenhuma', nome: 'Sem rabiola' },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/pipa.css?v=202610231621', import.meta.url));

  const config = { formato: 'losango', cor: 'fogo', rabiola: 'lacos', ...ler('pipa-config', {}) };
  const salvar = () => gravar('pipa-config', config);
  const tecido = criarBanco(audio, [SOM_TECIDO], { recorte: { intervaloMin: 0.08, duracaoMax: 0.3 }, canal: 'efeitos' });
  let bufferVento = null;
  audio.carregarAmostra(SOM_VENTO).then((b) => { bufferVento = b; });

  raiz.classList.add('pipa');
  raiz.innerHTML = `
    <div class="pipa__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Empinar pipa. Segure para puxar a linha e solte para dar linha. Mova o ponteiro para os lados para guiar. Teclado: seta para cima puxa, para baixo solta, esquerda e direita guiam.">
      <canvas class="pipa__canvas"></canvas>
    </div>
    <div class="pipa__vento" aria-live="off">
      <span class="pipa__seta" data-seta>${icone('seta')}</span>
      <span><strong data-forca>0</strong> km/h</span>
    </div>
    <div class="hud-jogo" data-hud hidden>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-estrelas>0</span><span class="hud-jogo__rotulo">estrelas</span></div>
      <div class="hud-jogo__vidas" data-vidas></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-tempo>90</span><span class="hud-jogo__rotulo">segundos</span></div>
    </div>
    <p class="dica-palco" data-dica>Segure para puxar a linha<small>solte para dar linha · mova para os lados para guiar</small></p>
    <div class="doca vidro-fosco pipa__doca" role="region" aria-label="Opções da pipa">
      <div class="doca__linha">
        <span class="doca__rotulo">MODO</span>
        <button type="button" class="chip" data-modo="livre" aria-pressed="true">${icone('lua')}<span>Livre</span></button>
        <button type="button" class="chip" data-modo="desafio" aria-pressed="false">${icone('estrela')}<span>Desafio</span></button>
        <span class="doca__rotulo">PIPA</span>
        ${FORMATOS.map((f) => `<button type="button" class="chip" data-formato="${f.id}" aria-pressed="${f.id === config.formato}">${f.nome}</button>`).join('')}
      </div>
      <div class="doca__linha">
        <span class="doca__rotulo">COR</span>
        ${CORES.map((c) => `<button type="button" class="amostra-tema" data-cor="${c.id}" aria-pressed="${c.id === config.cor}" aria-label="${c.nome}" title="${c.nome}"
          style="--amostra:conic-gradient(${c.cores[0]} 0 25%, ${c.cores[1]} 0 50%, ${c.cores[2]} 0 75%, ${c.cores[0]} 0);--brilho:${c.cores[0]}"></button>`).join('')}
        <span class="doca__rotulo">RABIOLA</span>
        ${RABIOLAS.map((r) => `<button type="button" class="chip" data-rabiola="${r.id}" aria-pressed="${r.id === config.rabiola}">${r.nome}</button>`).join('')}
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.pipa__palco');
  const canvas = $('.pipa__canvas');
  const g = canvas.getContext('2d');
  const dica = $('[data-dica]');
  const painel = criarPainelJogo(raiz);

  let tela = { l: 1, a: 1, dpr: 1 };
  let ancora = { x: 0, y: 0 };
  let nuvens = null;
  let cenario = null;

  /* ---------- Estado ---------- */

  const pipa = { x: 0, y: 0, vx: 0, vy: 0, angulo: 0, linha: 300, linhaMax: 600, iniciada: false };
  const rabiola = Array.from({ length: ELOS_RABIOLA }, () => ({ x: 0, y: 0, px: 0, py: 0 }));
  const vento = { x: 70, y: 0, forca: 0.5, direcao: 1, alvoForca: 0.5, alvoDirecao: 1, rajada: 0, mudanca: 6 };
  const controle = { puxando: false, alvoX: null, guia: 0 };
  const desafio = { ativo: false, estrelas: 0, vidas: 3, tempo: DURACAO_DESAFIO, itens: [], inimigos: [], proximaEstrela: 0, proximoInimigo: 3, invulneravel: 0 };
  const passaros = []; // decorativos no modo livre
  let tempo = 0;
  let interagiu = false;
  let modo = 'livre';

  /* ---------- Cenário (pré-desenhado) ---------- */

  function criarNuvens() {
    const rnd = geradorComSemente(42);
    const camadas = [0.25, 0.5, 1].map((profundidade, indice) => {
      const lista = [];
      const quantidade = 4 + indice * 2;
      for (let i = 0; i < quantidade; i++) {
        const largura = (90 + rnd() * 160) * (0.6 + profundidade * 0.6);
        const c = document.createElement('canvas');
        c.width = Math.ceil(largura * 1.6);
        c.height = Math.ceil(largura * 0.8);
        const n = c.getContext('2d');
        // Nuvem fofa: vários círculos com sombreado por baixo
        for (let k = 0; k < 9; k++) {
          const cx = c.width * (0.2 + rnd() * 0.6);
          const cy = c.height * (0.45 + rnd() * 0.2);
          const r = largura * (0.18 + rnd() * 0.14);
          const grad = n.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
          grad.addColorStop(0, `rgba(255,255,255,${0.75 + profundidade * 0.25})`);
          grad.addColorStop(0.7, `rgba(255,246,250,${0.55 + profundidade * 0.3})`);
          grad.addColorStop(1, 'rgba(255,230,240,0)');
          n.fillStyle = grad;
          n.beginPath();
          n.arc(cx, cy, r, 0, TAU);
          n.fill();
        }
        lista.push({ sprite: c, x: rnd(), y: 0.08 + rnd() * (0.45 + indice * 0.05), vel: 0.5 + rnd() * 0.5 });
      }
      return { profundidade, lista };
    });
    return camadas;
  }

  function criarCenario() {
    const { l, a, dpr } = tela;
    const c = document.createElement('canvas');
    c.width = Math.round(l * dpr);
    c.height = Math.round(a * dpr);
    const s = c.getContext('2d');
    s.scale(dpr, dpr);
    // Céu de fim de tarde: azul no alto, pêssego no horizonte
    const ceu = s.createLinearGradient(0, 0, 0, a);
    ceu.addColorStop(0, '#3a6df0');
    ceu.addColorStop(0.45, '#7fb2ff');
    ceu.addColorStop(0.75, '#ffc2c9');
    ceu.addColorStop(1, '#ffdca8');
    s.fillStyle = ceu;
    s.fillRect(0, 0, l, a);
    // Sol com halo
    const sx = l * 0.78;
    const sy = a * 0.24;
    const halo = s.createRadialGradient(sx, sy, 0, sx, sy, Math.min(l, a) * 0.35);
    halo.addColorStop(0, 'rgba(255,248,214,0.95)');
    halo.addColorStop(0.12, 'rgba(255,236,170,0.8)');
    halo.addColorStop(1, 'rgba(255,236,170,0)');
    s.fillStyle = halo;
    s.fillRect(0, 0, l, a);
    // Morros em camadas
    const morros = [
      { base: a * 0.82, amp: 40, cor: '#7cc9a2', freq: 0.004, fase: 1 },
      { base: a * 0.88, amp: 34, cor: '#4fae7e', freq: 0.006, fase: 3 },
      { base: a * 0.94, amp: 22, cor: '#2f8a5e', freq: 0.009, fase: 5 },
    ];
    for (const m of morros) {
      s.fillStyle = m.cor;
      s.beginPath();
      s.moveTo(0, a);
      for (let x = 0; x <= l; x += 8) s.lineTo(x, m.base - Math.sin(x * m.freq + m.fase) * m.amp - Math.sin(x * m.freq * 2.7) * m.amp * 0.3);
      s.lineTo(l, a);
      s.closePath();
      s.fill();
    }
    // Quem segura a linha: silhueta pequena no morro da frente
    s.fillStyle = '#1f5e40';
    s.beginPath();
    s.arc(ancora.x - 4, ancora.y - 30, 8, 0, TAU);
    s.fill();
    s.beginPath();
    s.roundRect(ancora.x - 12, ancora.y - 22, 16, 28, 6);
    s.fill();
    s.strokeStyle = '#1f5e40';
    s.lineWidth = 5;
    s.lineCap = 'round';
    s.beginPath();
    s.moveTo(ancora.x - 2, ancora.y - 16);
    s.lineTo(ancora.x + 6, ancora.y - 6);
    s.stroke();
    cenario = c;
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      ancora = { x: tela.l * 0.5, y: tela.a * 0.94 - 6 };
      pipa.linhaMax = Math.hypot(tela.l * 0.48, tela.a * 0.82);
      if (!pipa.iniciada) {
        pipa.x = ancora.x + tela.l * 0.12;
        pipa.y = tela.a * 0.35;
        pipa.linha = Math.hypot(pipa.x - ancora.x, pipa.y - ancora.y);
        rabiola.forEach((p) => { p.x = p.px = pipa.x; p.y = p.py = pipa.y; });
        pipa.iniciada = true;
      }
      nuvens ??= criarNuvens();
      criarCenario();
    },
  });

  /* ---------- Física ---------- */

  function atualizarVento(dt) {
    vento.mudanca -= dt;
    if (vento.mudanca <= 0) {
      vento.mudanca = aleatorio(5, 11);
      vento.alvoForca = aleatorio(0.25, 1);
      if (Math.random() < 0.35) vento.alvoDirecao *= -1;
    }
    if (Math.random() < dt * 0.12) vento.rajada = aleatorio(0.4, 0.9); // rajada
    vento.rajada = Math.max(0, vento.rajada - dt * 0.5);
    vento.forca += (vento.alvoForca - vento.forca) * Math.min(1, dt * 0.4);
    vento.direcao += (vento.alvoDirecao - vento.direcao) * Math.min(1, dt * 0.35);
    const intensidade = vento.forca + vento.rajada * 0.5 + Math.sin(tempo * 1.7) * 0.05;
    vento.x = vento.direcao * intensidade * 150;
    vento.y = Math.sin(tempo * 0.9) * 12 - intensidade * 8;
  }

  function passoPipa(dt) {
    const dx = pipa.x - ancora.x;
    const dy = pipa.y - ancora.y;
    const distancia = Math.hypot(dx, dy) || 1;
    const ux = dx / distancia;
    const uy = dy / distancia;

    // Linha: puxar encurta; solta, a linha sai se o vento estiver puxando
    // (puxar recolhe pouca linha: o efeito principal é ganhar vento aparente)
    if (controle.puxando) pipa.linha = Math.max(tela.a * 0.3, pipa.linha - 45 * dt);
    else if (distancia >= pipa.linha - 4) pipa.linha = Math.min(pipa.linhaMax, pipa.linha + (20 + Math.abs(vento.x) * 0.3) * dt);

    // Vento aparente = vento − velocidade da pipa. Puxar a linha move a pipa na direção
    // da mão (−u), então o vento aparente ganha +u: mais sustentação, a pipa sobe
    const puxada = controle.puxando ? 150 : 0;
    const ax = vento.x - pipa.vx + ux * puxada;
    const ay = vento.y - pipa.vy + uy * puxada;
    const v2 = ax * ax + ay * ay;
    const va = Math.sqrt(v2) || 1;
    // Sustentação perpendicular ao vento aparente, sempre para cima, inclinada pela guia
    let lx = -ay / va;
    let ly = ax / va;
    if (ly > 0) {
      lx = -lx;
      ly = -ly;
    }
    const guia = controle.guia * 0.7;
    const cos = Math.cos(guia);
    const sen = Math.sin(guia);
    const glx = lx * cos - ly * sen;
    const gly = lx * sen + ly * cos;
    const sustentacao = v2 * 0.0062;
    const arrasto = v2 * 0.0032;
    pipa.vx += (glx * sustentacao + (ax / va) * arrasto) * dt;
    pipa.vy += (gly * sustentacao + (ay / va) * arrasto + 140) * dt;
    pipa.vx *= Math.exp(-dt * 0.6);
    pipa.vy *= Math.exp(-dt * 0.6);
    pipa.x += pipa.vx * dt;
    pipa.y += pipa.vy * dt;

    // Linha esticada: segura a pipa no raio e tira a velocidade para fora
    const nx = pipa.x - ancora.x;
    const ny = pipa.y - ancora.y;
    const d = Math.hypot(nx, ny);
    if (d > pipa.linha) {
      pipa.x = ancora.x + (nx / d) * pipa.linha;
      pipa.y = ancora.y + (ny / d) * pipa.linha;
      const radial = pipa.vx * (nx / d) + pipa.vy * (ny / d);
      if (radial > 0) {
        pipa.vx -= radial * (nx / d);
        pipa.vy -= radial * (ny / d);
      }
    }
    // Chão e bordas
    const chao = tela.a * 0.8;
    if (pipa.y > chao) {
      pipa.y = chao;
      pipa.vy = Math.min(0, pipa.vy);
      pipa.vx *= 0.9;
    }
    pipa.x = clamp(pipa.x, 30, tela.l - 30);
    pipa.y = Math.max(tela.a * 0.06, pipa.y);

    // Ângulo: aponta para longe da âncora, balança com o vento e a guia
    const alvoAngulo = Math.atan2(pipa.y - ancora.y, pipa.x - ancora.x) + Math.PI / 2 + controle.guia * 0.35 + Math.sin(tempo * 3.1) * 0.06 * (0.5 + vento.forca);
    let diferenca = alvoAngulo - pipa.angulo;
    while (diferenca > Math.PI) diferenca -= TAU;
    while (diferenca < -Math.PI) diferenca += TAU;
    pipa.angulo += diferenca * Math.min(1, dt * 5);

    // Tecido batendo nas rajadas e em velocidade alta
    if (va > 230 && Math.random() < dt * 3) tecido.tocar({ volume: clamp((va - 200) / 300, 0.15, 0.7), variacaoTom: 0.1, pan: clamp((pipa.x / tela.l) * 2 - 1, -1, 1) * 0.6 });
  }

  function passoRabiola(dt) {
    if (config.rabiola === 'nenhuma') return;
    const base = pontoDaPipa(0, 0.55);
    rabiola[0].x = base.x;
    rabiola[0].y = base.y;
    const comprimento = 11;
    for (let i = 1; i < rabiola.length; i++) {
      const p = rabiola[i];
      const vx = (p.x - p.px) * 0.96 + vento.x * dt * dt * 6;
      const vy = (p.y - p.py) * 0.96 + (260 + vento.y) * dt * dt;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 1; i < rabiola.length; i++) {
        const a = rabiola[i - 1];
        const b = rabiola[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const corr = (d - comprimento) / d;
        if (i > 1) {
          a.x += dx * corr * 0.5;
          a.y += dy * corr * 0.5;
          b.x -= dx * corr * 0.5;
          b.y -= dy * corr * 0.5;
        } else {
          b.x -= dx * corr;
          b.y -= dy * corr;
        }
      }
    }
  }

  /** Ponto em coordenadas locais da pipa (x para os lados, y para baixo, em tamanhos de pipa). */
  function pontoDaPipa(lx, ly) {
    const t = tamanhoPipa();
    const c = Math.cos(pipa.angulo);
    const s = Math.sin(pipa.angulo);
    return { x: pipa.x + (lx * c - ly * s) * t, y: pipa.y + (lx * s + ly * c) * t };
  }

  const tamanhoPipa = () => clamp(Math.min(tela.l, tela.a) * 0.06, 34, 62);

  /* ---------- Desafio ---------- */

  function iniciarDesafio() {
    Object.assign(desafio, { ativo: true, estrelas: 0, vidas: 3, tempo: DURACAO_DESAFIO, itens: [], inimigos: [], proximaEstrela: 0.5, proximoInimigo: 4, invulneravel: 0 });
    painel.esconder();
    $('[data-hud]').hidden = false;
    atualizarHud();
    audio.tocar('inicio');
    palco.focus({ preventScroll: true });
  }

  function encerrarDesafio() {
    desafio.ativo = false;
    $('[data-hud]').hidden = true;
    const recorde = progresso.definirRecorde('pipa', 'estrelas', desafio.estrelas);
    progresso.registrar('pipa:desafio');
    progresso.ganharXp(Math.round(desafio.estrelas * 1.5));
    audio.tocar(recorde && desafio.estrelas > 0 ? 'conquista' : 'fim');
    painel.resumo({
      selo: `${icone(recorde && desafio.estrelas > 0 ? 'trofeu' : 'estrela')}${recorde && desafio.estrelas > 0 ? 'Novo recorde!' : 'Que voo!'}`,
      titulo: `${desafio.estrelas} <small>estrelas</small>`,
      estatisticas: [
        ['Tempo voado', `${Math.round(DURACAO_DESAFIO - desafio.tempo)} s`],
        ['Recorde', `${progresso.recorde('pipa', 'estrelas') ?? desafio.estrelas}`],
      ],
    }, iniciarDesafio);
  }

  function mostrarInicioDesafio() {
    const recorde = progresso.recorde('pipa', 'estrelas');
    painel.inicio({
      titulo: 'Desafio da Pipa',
      texto: 'Pegue as estrelas com a pipa e desvie dos pássaros e das outras pipas.',
      regras: [['estrela', 'Estrela dourada vale 1, a rosa vale 3'], ['coracao', '3 batidas e o voo acaba'], ['relogio', `${DURACAO_DESAFIO} segundos`]],
      recorde: recorde ? `Recorde: ${recorde} estrelas` : '',
    }, iniciarDesafio);
  }

  function passoDesafio(dt) {
    desafio.tempo -= dt;
    desafio.invulneravel = Math.max(0, desafio.invulneravel - dt);
    desafio.proximaEstrela -= dt;
    desafio.proximoInimigo -= dt;
    if (desafio.proximaEstrela <= 0) {
      desafio.proximaEstrela = aleatorio(0.9, 1.8);
      const rara = Math.random() < 0.15;
      desafio.itens.push({ x: aleatorio(tela.l * 0.08, tela.l * 0.92), y: aleatorio(tela.a * 0.1, tela.a * 0.62), vida: 9, rara, fase: aleatorio(0, TAU) });
    }
    if (desafio.proximoInimigo <= 0) {
      const progressoTempo = 1 - desafio.tempo / DURACAO_DESAFIO;
      desafio.proximoInimigo = aleatorio(2.6, 4.2) - progressoTempo * 1.4;
      const daEsquerda = Math.random() < 0.5;
      const tipo = Math.random() < 0.65 ? 'passaro' : 'pipa';
      desafio.inimigos.push({
        tipo,
        x: daEsquerda ? -40 : tela.l + 40,
        y: aleatorio(tela.a * 0.12, tela.a * 0.6),
        vx: (daEsquerda ? 1 : -1) * aleatorio(110, 190) * (1 + progressoTempo * 0.6),
        fase: aleatorio(0, TAU),
        cor: escolher(['#ff7a18', '#8b5cff', '#22c4ff', '#ff2e97']),
      });
    }
    const r = tamanhoPipa() * 0.75;
    for (const item of desafio.itens) {
      item.vida -= dt;
      item.fase += dt * 3;
      if (Math.hypot(item.x - pipa.x, item.y - pipa.y) < r + 18) {
        item.vida = 0;
        item.pego = true;
        const valor = item.rara ? 3 : 1;
        desafio.estrelas += valor;
        progresso.registrar('pipa:estrela', valor);
        audio.tocar('coleta', { n: desafio.estrelas % 10, pan: clamp((item.x / tela.l) * 2 - 1, -1, 1) * 0.6 });
        efeitos.push({ x: item.x, y: item.y, vida: 1, cor: item.rara ? '#ff5dc8' : '#ffd60a' });
        atualizarHud();
      }
    }
    desafio.itens = desafio.itens.filter((i) => i.vida > 0);
    for (const inimigo of desafio.inimigos) {
      inimigo.x += inimigo.vx * dt;
      inimigo.fase += dt * (inimigo.tipo === 'passaro' ? 12 : 3);
      inimigo.y += Math.sin(inimigo.fase * 0.3) * 20 * dt;
      if (!desafio.invulneravel && Math.hypot(inimigo.x - pipa.x, inimigo.y - pipa.y) < r + 16) {
        desafio.vidas--;
        desafio.invulneravel = 1.6;
        pipa.vx += Math.sign(inimigo.vx) * 240;
        pipa.vy += 120;
        audio.tocar('erro');
        tecido.tocar({ volume: 0.9 });
        atualizarHud();
        if (desafio.vidas <= 0) {
          encerrarDesafio();
          return;
        }
      }
    }
    desafio.inimigos = desafio.inimigos.filter((i) => i.x > -80 && i.x < tela.l + 80);
    if (desafio.tempo <= 0) encerrarDesafio();
    else if (Math.ceil(desafio.tempo) !== Math.ceil(desafio.tempo + dt)) atualizarHud();
  }

  function atualizarHud() {
    $('[data-estrelas]').textContent = String(desafio.estrelas);
    $('[data-tempo]').textContent = String(Math.max(0, Math.ceil(desafio.tempo)));
    $('[data-vidas]').innerHTML = Array.from({ length: 3 }, (_, i) => `<span class="${i < desafio.vidas ? '' : 'perdida'}">${icone('coracao')}</span>`).join('');
  }

  const efeitos = [];

  /* ---------- Desenho ---------- */

  function desenharPipa(x, y, angulo, tamanho, cores, formato, alfa = 1) {
    g.save();
    g.globalAlpha = alfa;
    g.translate(x, y);
    g.rotate(angulo);
    const t = tamanho;
    const [c1, c2, c3] = cores;
    const caminho = new Path2D();
    if (formato === 'delta') {
      caminho.moveTo(0, -t * 0.55);
      caminho.lineTo(t * 0.95, t * 0.45);
      caminho.lineTo(0, t * 0.3);
      caminho.lineTo(-t * 0.95, t * 0.45);
    } else if (formato === 'arraia') {
      caminho.moveTo(0, -t * 0.75);
      caminho.lineTo(t * 0.62, -t * 0.25);
      caminho.lineTo(t * 0.62, t * 0.25);
      caminho.lineTo(0, t * 0.75);
      caminho.lineTo(-t * 0.62, t * 0.25);
      caminho.lineTo(-t * 0.62, -t * 0.25);
    } else {
      caminho.moveTo(0, -t * 0.8);
      caminho.lineTo(t * 0.55, -t * 0.15);
      caminho.lineTo(0, t * 0.75);
      caminho.lineTo(-t * 0.55, -t * 0.15);
    }
    caminho.closePath();
    // Sombra suave no céu
    g.save();
    g.translate(t * 0.12, t * 0.2);
    g.fillStyle = 'rgba(30,40,90,0.18)';
    g.fill(caminho);
    g.restore();
    // Papel de seda em quatro gomos, com transparência contra o sol
    g.save();
    g.clip(caminho);
    const gomos = [[c1, -1, -1], [c2, 1, -1], [c3, -1, 1], [c1, 1, 1]];
    for (const [cor, sx, sy] of gomos) {
      g.fillStyle = cor;
      g.fillRect(sx < 0 ? -t : 0, sy < 0 ? -t : 0, t, t);
    }
    const luz = g.createLinearGradient(-t, -t, t, t);
    luz.addColorStop(0, 'rgba(255,255,255,0.35)');
    luz.addColorStop(0.5, 'rgba(255,255,255,0)');
    luz.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = luz;
    g.fillRect(-t, -t, t * 2, t * 2);
    g.restore();
    // Varetas e contorno
    g.strokeStyle = 'rgba(80,50,20,0.75)';
    g.lineWidth = Math.max(1.5, t * 0.04);
    g.beginPath();
    g.moveTo(0, formato === 'delta' ? -t * 0.55 : -t * 0.78);
    g.lineTo(0, formato === 'delta' ? t * 0.3 : t * 0.74);
    g.moveTo(formato === 'arraia' ? -t * 0.62 : -t * 0.55, formato === 'delta' ? t * 0.1 : -t * 0.15);
    g.lineTo(formato === 'arraia' ? t * 0.62 : t * 0.55, formato === 'delta' ? t * 0.1 : -t * 0.15);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1.2;
    g.stroke(caminho);
    g.restore();
  }

  function desenharRabiola(cores) {
    if (config.rabiola === 'nenhuma') return;
    g.save();
    g.strokeStyle = 'rgba(60,40,30,0.6)';
    g.lineWidth = 1.2;
    g.beginPath();
    rabiola.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
    for (let i = 2; i < rabiola.length; i += config.rabiola === 'lacos' ? 2 : 1) {
      const p = rabiola[i];
      const anterior = rabiola[i - 1];
      const ang = Math.atan2(p.y - anterior.y, p.x - anterior.x);
      const cor = cores[i % cores.length];
      g.fillStyle = cor;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(ang + Math.PI / 2);
      if (config.rabiola === 'lacos') {
        // Laço: dois triângulos de papel
        const s = 7 + Math.sin(tempo * 8 + i) * 1.2;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(-s * 1.4, -s * 0.8);
        g.lineTo(-s * 1.4, s * 0.8);
        g.closePath();
        g.moveTo(0, 0);
        g.lineTo(s * 1.4, -s * 0.8);
        g.lineTo(s * 1.4, s * 0.8);
        g.closePath();
        g.fill();
      } else {
        g.globalAlpha = 0.9;
        g.fillRect(-2.5, -6, 5, 12);
      }
      g.restore();
    }
    g.restore();
  }

  function desenharLinha() {
    // A linha faz barriga quando está frouxa e é empurrada pelo vento
    const d = Math.hypot(pipa.x - ancora.x, pipa.y - ancora.y);
    const folga = clamp((pipa.linha - d) / 60, 0, 1);
    const mx = (pipa.x + ancora.x) / 2 + vento.x * 0.12 * (0.3 + folga);
    const my = (pipa.y + ancora.y) / 2 + 30 + folga * 60;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(ancora.x + 6, ancora.y - 8);
    g.quadraticCurveTo(mx, my, pipa.x, pipa.y + tamanhoPipa() * 0.1);
    g.stroke();
  }

  function desenharPassaro(x, y, fase, escala = 1, cor = '#2a2f4a') {
    const asa = Math.sin(fase) * 8 * escala;
    g.strokeStyle = cor;
    g.lineWidth = 2.4 * escala;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - 12 * escala, y - asa);
    g.quadraticCurveTo(x - 5 * escala, y - 4 * escala, x, y);
    g.quadraticCurveTo(x + 5 * escala, y - 4 * escala, x + 12 * escala, y - asa);
    g.stroke();
  }

  function desenharEstrela(x, y, r, cor, giro) {
    g.save();
    g.translate(x, y);
    g.rotate(giro);
    g.shadowColor = cor;
    g.shadowBlur = 18;
    g.fillStyle = cor;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const raio = i % 2 ? r * 0.45 : r;
      const a = -Math.PI / 2 + (i / 10) * TAU;
      g.lineTo(Math.cos(a) * raio, Math.sin(a) * raio);
    }
    g.closePath();
    g.fill();
    g.restore();
  }

  function desenhar() {
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(cenario, 0, 0, l, a);

    // Nuvens: camadas mais próximas andam mais rápido (parallax), levadas pelo vento
    for (const camada of nuvens) {
      for (const n of camada.lista) {
        const largura = n.sprite.width;
        const x = (((n.x * (l + largura * 2)) % (l + largura * 2)) + (l + largura * 2)) % (l + largura * 2) - largura;
        g.globalAlpha = 0.65 + camada.profundidade * 0.35;
        g.drawImage(n.sprite, x, n.y * a);
      }
    }
    g.globalAlpha = 1;

    // Pássaros decorativos (modo livre)
    for (const p of passaros) desenharPassaro(p.x, p.y, p.fase, p.escala, 'rgba(42,47,74,0.7)');

    if (desafio.ativo) {
      for (const item of desafio.itens) {
        const piscar = item.vida < 2 ? (Math.sin(tempo * 20) > 0 ? 1 : 0.35) : 1;
        g.globalAlpha = piscar;
        desenharEstrela(item.x, item.y + Math.sin(item.fase) * 5, item.rara ? 17 : 13, item.rara ? '#ff5dc8' : '#ffd60a', item.fase * 0.3);
      }
      g.globalAlpha = 1;
      for (const inimigo of desafio.inimigos) {
        if (inimigo.tipo === 'passaro') desenharPassaro(inimigo.x, inimigo.y, inimigo.fase, 1.4, '#1d2240');
        else desenharPipa(inimigo.x, inimigo.y, Math.sin(inimigo.fase) * 0.4, tamanhoPipa() * 0.7, [inimigo.cor, '#ffffff', inimigo.cor], 'losango', 0.9);
      }
    }

    const cores = (CORES.find((c) => c.id === config.cor) ?? CORES[0]).cores;
    desenharLinha();
    desenharRabiola(cores);
    const piscando = desafio.invulneravel > 0 && Math.sin(tempo * 30) > 0;
    desenharPipa(pipa.x, pipa.y, pipa.angulo, tamanhoPipa(), cores, config.formato, piscando ? 0.45 : 1);

    for (const e of efeitos) {
      g.globalAlpha = e.vida;
      g.strokeStyle = e.cor;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(e.x, e.y, 14 + (1 - e.vida) * 40, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /* ---------- Entrada ---------- */

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };
  function primeiraInteracao() {
    if (interagiu) return;
    interagiu = true;
    dica.classList.add('dica-palco--oculta');
  }
  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    primeiraInteracao();
    controle.puxando = true;
    controle.alvoX = posicao(e).x;
  });
  palco.addEventListener('pointermove', (e) => {
    controle.alvoX = posicao(e).x;
  });
  const soltar = () => { controle.puxando = false; };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);
  palco.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') controle.alvoX = null;
  });

  const teclas = new Set();
  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
      primeiraInteracao();
      teclas.add(e.key);
      controle.alvoX = null;
    }
  });
  raiz.addEventListener('keyup', (e) => teclas.delete(e.key));

  /* ---------- Opções ---------- */

  $('.pipa__doca').addEventListener('click', (e) => {
    const botaoModo = e.target.closest('[data-modo]');
    if (botaoModo) {
      modo = botaoModo.dataset.modo;
      for (const b of raiz.querySelectorAll('[data-modo]')) b.setAttribute('aria-pressed', String(b === botaoModo));
      if (modo === 'desafio') mostrarInicioDesafio();
      else {
        desafio.ativo = false;
        $('[data-hud]').hidden = true;
        painel.esconder();
      }
      return;
    }
    const alvo = e.target.closest('[data-formato], [data-cor], [data-rabiola]');
    if (!alvo) return;
    const [chave, valor] = alvo.dataset.formato ? ['formato', alvo.dataset.formato]
      : alvo.dataset.cor ? ['cor', alvo.dataset.cor] : ['rabiola', alvo.dataset.rabiola];
    config[chave] = valor;
    salvar();
    for (const b of raiz.querySelectorAll(`[data-${chave}]`)) b.setAttribute('aria-pressed', String(b.dataset[chave] === valor));
    if (chave === 'rabiola') rabiola.forEach((p) => { p.x = p.px = pipa.x; p.y = p.py = pipa.y; });
    progresso.registrar('pipa:personalizar', 1, `${config.formato}-${config.cor}`);
    audio.tocar('tema');
  });

  /* ---------- Loop ---------- */

  let laco = null;

  const pararLoop = aoQuadro((dt) => {
    if (!cenario) return;
    tempo += dt;
    atualizarVento(dt);

    // Controles: teclado tem prioridade; senão, o ponteiro guia
    let guiaAlvo = 0;
    if (teclas.has('ArrowLeft')) guiaAlvo -= 1;
    if (teclas.has('ArrowRight')) guiaAlvo += 1;
    if (!teclas.size && controle.alvoX !== null) guiaAlvo = clamp((controle.alvoX - pipa.x) / (tela.l * 0.25), -1, 1);
    controle.guia += (guiaAlvo - controle.guia) * Math.min(1, dt * 4);
    if (teclas.size) controle.puxando = teclas.has('ArrowUp') || teclas.has(' ');
    if (teclas.has('ArrowDown')) pipa.linha = Math.min(pipa.linhaMax, pipa.linha + 120 * dt);

    passoPipa(dt);
    passoRabiola(dt);

    for (const camada of nuvens) {
      for (const n of camada.lista) n.x += (vento.x / 4000) * camada.profundidade * n.vel * dt * 3;
    }
    if (modo === 'livre' && Math.random() < dt * 0.08 && passaros.length < 6) {
      const daEsquerda = vento.x > 0;
      const grupo = 1 + Math.floor(Math.random() * 3);
      const y = aleatorio(tela.a * 0.12, tela.a * 0.45);
      for (let i = 0; i < grupo; i++) passaros.push({ x: daEsquerda ? -30 - i * 26 : tela.l + 30 + i * 26, y: y + i * 12, vx: (daEsquerda ? 1 : -1) * aleatorio(60, 100), fase: aleatorio(0, TAU), escala: aleatorio(0.6, 1) });
    }
    for (const p of passaros) {
      p.x += p.vx * dt;
      p.fase += dt * 9;
    }
    for (let i = passaros.length - 1; i >= 0; i--) if (passaros[i].x < -80 || passaros[i].x > tela.l + 80) passaros.splice(i, 1);

    if (desafio.ativo) passoDesafio(dt);
    for (const e of efeitos) e.vida -= dt * 2;
    for (let i = efeitos.length - 1; i >= 0; i--) if (efeitos[i].vida <= 0) efeitos.splice(i, 1);

    // Som do vento: mais forte com o vento e com a velocidade da pipa
    if (!laco && bufferVento && audio.ativo) laco = audio.iniciarLaco(bufferVento, { volume: 0, canal: 'efeitos', filtro: { tipo: 'lowpass', freq: 1200 } });
    if (laco) {
      const intensidade = clamp(Math.abs(vento.x) / 150 + Math.hypot(pipa.vx, pipa.vy) / 600, 0, 1.4);
      laco.volume(0.15 + intensidade * 0.55, 0.3);
      laco.filtro(500 + intensidade * 2400);
    }

    // Indicador de vento
    $('[data-seta]').style.transform = `rotate(${vento.x >= 0 ? 0 : 180}deg) scale(${0.7 + Math.min(1, Math.abs(vento.x) / 150) * 0.5})`;
    $('[data-forca]').textContent = String(Math.round(Math.abs(vento.x) / 6));

    desenhar();
  });

  if (movimentoReduzido()) vento.alvoForca = 0.4;
  raiz.style.setProperty('--c1', '#ff7a18');
  raiz.style.setProperty('--c2', '#22a8ff');

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      laco?.parar();
    },
  };
}
