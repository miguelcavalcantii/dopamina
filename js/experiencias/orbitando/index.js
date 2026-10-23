/**
 * Orbitando: caixa de areia espacial com gravidade de verdade (N corpos).
 * Arraste para lançar (a prévia pontilhada mostra a trajetória); um clique rápido
 * coloca o corpo em órbita circular em volta do que mais o atrai.
 * Ferramentas: planeta, estrela, buraco negro e cometa. Colisões fundem os corpos
 * com uma explosão; buracos negros engolem tudo. Planetas recebem luz do lado da
 * estrela mais forte; cometas ganham cauda apontando para longe dela.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, escolher, movimentoReduzido, perfilLeve } from '../../core/util.js?v=202610231621';

const TAU = Math.PI * 2;
const G = 4500;
const SUAVIZACAO = 12;
const SUBPASSOS = 4;
const MAX_CORPOS = 70;
const TAMANHO_RASTRO = 70;

const FERRAMENTAS = [
  { id: 'planeta', nome: 'Planeta', icone: 'planeta' },
  { id: 'estrela', nome: 'Estrela', icone: 'brilho' },
  { id: 'buraco', nome: 'Buraco negro', icone: 'espiral' },
  { id: 'cometa', nome: 'Cometa', icone: 'raio' },
];
const CORES_PLANETA = [
  ['#7fd4ff', '#2a5fd6'], ['#ffb37a', '#c2410c'], ['#a8ff9e', '#1f8a4c'], ['#e0b3ff', '#6d28d9'],
  ['#ffe28a', '#b45309'], ['#ff9ec7', '#be185d'], ['#9ef7ef', '#0e7490'],
];
const CORES_ESTRELA = [['#fff7d6', '#ffb020'], ['#e8f4ff', '#5b9bff'], ['#ffe2d6', '#ff5a36']];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/orbitando.css?v=202610231621', import.meta.url));

  const config = { ferramenta: 'planeta', musica: true, rastros: true, ...ler('orbitando-config', {}) };
  const salvar = () => gravar('orbitando-config', config);

  raiz.classList.add('orbita');
  raiz.innerHTML = `
    <div class="orbita__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Orbitando. Arraste para lançar um corpo celeste; clique para colocar em órbita. Teclado: espaço coloca um planeta em órbita num lugar sorteado.">
      <canvas class="orbita__canvas"></canvas>
    </div>
    <div class="hud-jogo">
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-corpos>0</span><span class="hud-jogo__rotulo">corpos</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-orbitas>0</span><span class="hud-jogo__rotulo">em órbita</span></div>
    </div>
    <p class="dica-palco" data-dica>Arraste para lançar<small>clique rápido = órbita perfeita</small></p>
    <div class="doca vidro-fosco orbita__doca" role="region" aria-label="Ferramentas do espaço">
      <div class="doca__linha">
        <span class="doca__rotulo">CRIAR</span>
        ${FERRAMENTAS.map((f) => `<button type="button" class="chip" data-ferramenta="${f.id}" aria-pressed="${f.id === config.ferramenta}">${icone(f.icone)}<span>${f.nome}</span></button>`).join('')}
      </div>
      <div class="doca__linha">
        <button type="button" class="chip" data-rastros aria-pressed="${config.rastros}">${icone('onda')}<span>Rastros</span></button>
        <button type="button" class="chip" data-musica aria-pressed="${config.musica}">${icone('musica')}<span>Trilha espacial</span></button>
        <button type="button" class="chip" data-limpar>${icone('chuva')}<span>Recomeçar</span></button>
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.orbita__palco');
  const canvas = $('.orbita__canvas');
  const g = canvas.getContext('2d');
  const dica = $('[data-dica]');

  let tela = { l: 1, a: 1, dpr: 1 };
  let fundo = null;
  let brilho = null;
  let corpos = [];
  const particulas = [];
  const arrasto = { ativo: false, x0: 0, y0: 0, x: 0, y: 0, inicio: 0 };
  let tempo = 0;
  let interagiu = false;
  let proximoId = 1;
  let contagemOrbitas = 0;
  let tempoSistema = 0;

  /* ---------- Corpos ---------- */

  function criarCorpo(tipo, x, y, vx = 0, vy = 0) {
    const base = { id: proximoId++, tipo, x, y, vx, vy, rastro: [], nascimento: tempo, giro: aleatorio(0, TAU) };
    if (tipo === 'estrela') {
      const [c1, c2] = escolher(CORES_ESTRELA);
      return { ...base, massa: 600, raio: 24, cores: [c1, c2] };
    }
    if (tipo === 'buraco') return { ...base, massa: 2600, raio: 14, cores: ['#000000', '#ff9a3c'], engolidos: 0 };
    if (tipo === 'cometa') return { ...base, massa: 0.4, raio: 4, cores: ['#e8fbff', '#7fd4ff'] };
    const massa = aleatorio(2, 6);
    return { ...base, massa, raio: 5 + Math.cbrt(massa) * 3.4, cores: escolher(CORES_PLANETA), faixas: Math.random() < 0.5 };
  }

  const raioPelaMassa = (corpo) => {
    if (corpo.tipo === 'estrela') return 18 + Math.cbrt(corpo.massa) * 0.75;
    if (corpo.tipo === 'buraco') return 10 + Math.cbrt(corpo.massa) * 0.3;
    if (corpo.tipo === 'cometa') return 4;
    return 5 + Math.cbrt(corpo.massa) * 3.4;
  };

  function adicionar(corpo) {
    corpos.push(corpo);
    if (corpos.length > MAX_CORPOS) {
      // Some o planeta ou cometa mais antigo (estrelas e buracos ficam)
      const indice = corpos.findIndex((c) => c.tipo === 'planeta' || c.tipo === 'cometa');
      if (indice >= 0) corpos.splice(indice, 1);
    }
    atualizarHud();
  }

  /** O corpo que mais puxa um ponto (para órbitas automáticas, luz e cauda dos cometas). */
  function atrator(x, y, ignorar = null) {
    let melhor = null;
    let maior = 0;
    for (const c of corpos) {
      if (c === ignorar || c.massa < 100) continue;
      const forca = c.massa / ((c.x - x) ** 2 + (c.y - y) ** 2 + 1);
      if (forca > maior) {
        maior = forca;
        melhor = c;
      }
    }
    return melhor;
  }

  function cenaInicial() {
    corpos = [];
    const sol = criarCorpo('estrela', tela.l / 2, tela.a / 2 - 30);
    sol.cores = CORES_ESTRELA[0];
    corpos.push(sol);
    for (const [r, angulo] of [[140, 0.4], [230, 2.6], [330, 4.4]]) {
      const x = sol.x + Math.cos(angulo) * r;
      const y = sol.y + Math.sin(angulo) * r;
      corpos.push(emOrbita(criarCorpo('planeta', x, y), sol));
    }
    atualizarHud();
  }

  function emOrbita(corpo, centro, sentido = 1) {
    const dx = corpo.x - centro.x;
    const dy = corpo.y - centro.y;
    const r = Math.hypot(dx, dy) || 1;
    const v = Math.sqrt((G * centro.massa) / Math.sqrt(r * r + SUAVIZACAO * SUAVIZACAO));
    corpo.vx = centro.vx + (-dy / r) * v * sentido;
    corpo.vy = centro.vy + (dx / r) * v * sentido;
    return corpo;
  }

  /* ---------- Física ---------- */

  function aceleracoes(lista) {
    const ax = new Float64Array(lista.length);
    const ay = new Float64Array(lista.length);
    for (let i = 0; i < lista.length; i++) {
      const a = lista[i];
      for (let k = i + 1; k < lista.length; k++) {
        const b = lista[k];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + SUAVIZACAO * SUAVIZACAO;
        const inv = G / (d2 * Math.sqrt(d2));
        ax[i] += dx * inv * b.massa;
        ay[i] += dy * inv * b.massa;
        ax[k] -= dx * inv * a.massa;
        ay[k] -= dy * inv * a.massa;
      }
    }
    return [ax, ay];
  }

  function passoFisica(dt) {
    const [ax, ay] = aceleracoes(corpos);
    corpos.forEach((c, i) => {
      c.vx += ax[i] * dt;
      c.vy += ay[i] * dt;
    });
    for (const c of corpos) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    colisoes();
  }

  function colisoes() {
    for (let i = 0; i < corpos.length; i++) {
      for (let k = i + 1; k < corpos.length; k++) {
        const a = corpos[i];
        const b = corpos[k];
        if (!a || !b) continue;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d > (a.raio + b.raio) * 0.85) continue;
        const [maior, menor] = a.massa >= b.massa ? [a, b] : [b, a];
        // Conserva o momento: o maior absorve o menor
        const massa = maior.massa + menor.massa;
        maior.vx = (maior.vx * maior.massa + menor.vx * menor.massa) / massa;
        maior.vy = (maior.vy * maior.massa + menor.vy * menor.massa) / massa;
        maior.x = (maior.x * maior.massa + menor.x * menor.massa) / massa;
        maior.y = (maior.y * maior.massa + menor.y * menor.massa) / massa;
        maior.massa = massa;
        maior.raio = raioPelaMassa(maior);
        corpos.splice(corpos.indexOf(menor), 1);
        if (maior.tipo === 'buraco') engolido(maior, menor);
        else explosao(menor, maior);
        atualizarHud();
        return colisoes(); // a lista mudou: recomeça
      }
    }
    return undefined;
  }

  function explosao(menor, maior) {
    const n = movimentoReduzido() ? 10 : clamp(Math.round(menor.raio * 4), 10, 60);
    for (let i = 0; i < n; i++) {
      const a = aleatorio(0, TAU);
      const v = aleatorio(40, 220);
      particulas.push({ x: menor.x, y: menor.y, vx: maior.vx + Math.cos(a) * v, vy: maior.vy + Math.sin(a) * v, vida: aleatorio(0.6, 1.4), cor: escolher([menor.cores[0], menor.cores[1], '#ffffff', '#ffd27a']), tam: aleatorio(1.5, 3.5) });
    }
    particulas.push({ anel: true, x: menor.x, y: menor.y, vida: 1, raio: maior.raio, cor: menor.cores[0] });
    audio.tocar('explosao', { tamanho: clamp(menor.raio / 12, 0.3, 1.2), pan: clamp((menor.x / tela.l) * 2 - 1, -1, 1) * 0.7 });
    progresso.registrar('orbita:colisao');
  }

  function engolido(buraco, corpo) {
    buraco.engolidos++;
    for (let i = 0; i < 26; i++) {
      const a = aleatorio(0, TAU);
      const r = aleatorio(buraco.raio * 2, buraco.raio * 5);
      particulas.push({ espiral: true, alvo: buraco, angulo: a, distancia: r, vida: 1, cor: escolher(corpo.cores), tam: aleatorio(1, 2.5) });
    }
    audio.tocar('whoosh', { descendo: true });
    audio.tocar('explosao', { tamanho: 0.4 });
    progresso.registrar('orbita:engolido');
    progresso.definirRecorde('orbitando', 'engolidos', buraco.engolidos);
  }

  /* ---------- Prévia da trajetória ---------- */

  function preverTrajetoria(x, y, vx, vy) {
    // Simula só o corpo de teste contra os corpos atuais (que andam junto, simplificado: parados)
    const pontos = [];
    let px = x;
    let py = y;
    let pvx = vx;
    let pvy = vy;
    const dt = 1 / 60;
    for (let passo = 0; passo < 240; passo++) {
      let ax = 0;
      let ay = 0;
      for (const c of corpos) {
        const dx = c.x - px;
        const dy = c.y - py;
        const d2 = dx * dx + dy * dy + SUAVIZACAO * SUAVIZACAO;
        if (d2 < (c.raio + 4) ** 2) return pontos;
        const inv = (G * c.massa) / (d2 * Math.sqrt(d2));
        ax += dx * inv;
        ay += dy * inv;
      }
      pvx += ax * dt;
      pvy += ay * dt;
      px += pvx * dt;
      py += pvy * dt;
      if (passo % 3 === 0) pontos.push([px, py]);
    }
    return pontos;
  }

  /* ---------- Desenho ---------- */

  function criarFundo() {
    const { l, a, dpr } = tela;
    const c = document.createElement('canvas');
    c.width = Math.round(l * dpr);
    c.height = Math.round(a * dpr);
    const s = c.getContext('2d');
    s.scale(dpr, dpr);
    s.fillStyle = '#03020c';
    s.fillRect(0, 0, l, a);
    // Nebulosas
    for (const [x, y, r, cor] of [[0.2, 0.3, 0.5, 'rgba(139,92,255,0.18)'], [0.8, 0.7, 0.55, 'rgba(255,46,151,0.12)'], [0.65, 0.15, 0.4, 'rgba(34,228,255,0.1)']]) {
      const grad = s.createRadialGradient(l * x, a * y, 0, l * x, a * y, Math.max(l, a) * r);
      grad.addColorStop(0, cor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      s.fillStyle = grad;
      s.fillRect(0, 0, l, a);
    }
    // Estrelas fixas
    for (let i = 0; i < (l * a) / 2200; i++) {
      const brilhoEstrela = Math.random();
      s.fillStyle = `rgba(${200 + Math.random() * 55},${210 + Math.random() * 45},255,${0.2 + brilhoEstrela * 0.7})`;
      const t = brilhoEstrela > 0.95 ? 2 : 1;
      s.fillRect(Math.random() * l, Math.random() * a, t, t);
    }
    fundo = c;
  }

  function criarBrilho() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const s = c.getContext('2d');
    const grad = s.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    s.fillStyle = grad;
    s.fillRect(0, 0, 128, 128);
    brilho = c;
  }

  function desenharRastro(c) {
    if (!config.rastros || c.rastro.length < 2) return;
    const cor = c.tipo === 'estrela' ? c.cores[1] : c.tipo === 'buraco' ? '#ff9a3c' : c.cores[0];
    g.strokeStyle = cor;
    g.lineCap = 'round';
    for (let i = 1; i < c.rastro.length; i++) {
      g.globalAlpha = (i / c.rastro.length) * 0.5;
      g.lineWidth = Math.max(1, c.raio * 0.5 * (i / c.rastro.length));
      g.beginPath();
      g.moveTo(...c.rastro[i - 1]);
      g.lineTo(...c.rastro[i]);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function desenharCorpo(c) {
    if (c.tipo === 'estrela') {
      g.globalCompositeOperation = 'lighter';
      const pulso = 1 + Math.sin(tempo * 2 + c.giro) * 0.04;
      g.globalAlpha = 0.55;
      g.drawImage(brilho, c.x - c.raio * 5 * pulso, c.y - c.raio * 5 * pulso, c.raio * 10 * pulso, c.raio * 10 * pulso);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      const nucleo = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.raio);
      nucleo.addColorStop(0, '#ffffff');
      nucleo.addColorStop(0.5, c.cores[0]);
      nucleo.addColorStop(1, c.cores[1]);
      g.fillStyle = nucleo;
      g.beginPath();
      g.arc(c.x, c.y, c.raio, 0, TAU);
      g.fill();
      return;
    }
    if (c.tipo === 'buraco') {
      // Disco de acreção girando, achatado, por trás e pela frente do horizonte
      g.save();
      g.translate(c.x, c.y);
      g.rotate(0.35);
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const r = c.raio * (2.2 + k * 0.7);
        g.strokeStyle = k === 0 ? 'rgba(255,240,200,0.8)' : `rgba(255,${150 - k * 30},60,${0.5 - k * 0.12})`;
        g.lineWidth = c.raio * (0.5 - k * 0.1);
        g.beginPath();
        g.ellipse(0, 0, r, r * 0.32, 0, tempo * (1.5 - k * 0.3), tempo * (1.5 - k * 0.3) + TAU * 0.92);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      g.restore();
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(c.x, c.y, c.raio, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,220,170,0.85)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(c.x, c.y, c.raio * 1.15, 0, TAU);
      g.stroke();
      return;
    }
    const sol = atrator(c.x, c.y, c);
    if (c.tipo === 'cometa') {
      // Cauda aponta para longe da estrela e cresce quando passa perto
      const dx = sol ? c.x - sol.x : -c.vx;
      const dy = sol ? c.y - sol.y : -c.vy;
      const d = Math.hypot(dx, dy) || 1;
      const comprimento = clamp(9000 / d, 20, 160);
      const cauda = g.createLinearGradient(c.x, c.y, c.x + (dx / d) * comprimento, c.y + (dy / d) * comprimento);
      cauda.addColorStop(0, 'rgba(200,240,255,0.7)');
      cauda.addColorStop(1, 'rgba(120,200,255,0)');
      g.strokeStyle = cauda;
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(c.x, c.y);
      g.lineTo(c.x + (dx / d) * comprimento, c.y + (dy / d) * comprimento);
      g.stroke();
      g.globalCompositeOperation = 'lighter';
      g.drawImage(brilho, c.x - 12, c.y - 12, 24, 24);
      g.globalCompositeOperation = 'source-over';
      return;
    }
    // Planeta: iluminado do lado da estrela que mais puxa
    const lx = sol ? sol.x - c.x : -1;
    const ly = sol ? sol.y - c.y : -1;
    const ld = Math.hypot(lx, ly) || 1;
    const corpo = g.createRadialGradient(c.x + (lx / ld) * c.raio * 0.45, c.y + (ly / ld) * c.raio * 0.45, c.raio * 0.1, c.x, c.y, c.raio * 1.1);
    corpo.addColorStop(0, '#ffffff');
    corpo.addColorStop(0.25, c.cores[0]);
    corpo.addColorStop(0.75, c.cores[1]);
    corpo.addColorStop(1, '#05030f');
    g.fillStyle = corpo;
    g.beginPath();
    g.arc(c.x, c.y, c.raio, 0, TAU);
    g.fill();
    if (c.faixas && c.raio > 7) {
      g.save();
      g.beginPath();
      g.arc(c.x, c.y, c.raio, 0, TAU);
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = c.raio * 0.18;
      for (const k of [-0.4, 0.1, 0.5]) {
        g.beginPath();
        g.moveTo(c.x - c.raio, c.y + c.raio * k);
        g.quadraticCurveTo(c.x, c.y + c.raio * (k + 0.12), c.x + c.raio, c.y + c.raio * k);
        g.stroke();
      }
      g.restore();
    }
    // Atmosfera fina no lado iluminado
    g.strokeStyle = c.cores[0];
    g.globalAlpha = 0.5;
    g.lineWidth = 1.5;
    const ang = Math.atan2(ly, lx);
    g.beginPath();
    g.arc(c.x, c.y, c.raio + 1, ang - 1.2, ang + 1.2);
    g.stroke();
    g.globalAlpha = 1;
  }

  function desenhar() {
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(fundo, 0, 0, l, a);
    for (const c of corpos) desenharRastro(c);
    for (const c of corpos) desenharCorpo(c);

    g.globalCompositeOperation = 'lighter';
    for (const p of particulas) {
      if (p.anel) {
        g.strokeStyle = p.cor;
        g.globalAlpha = p.vida * 0.8;
        g.lineWidth = 3 * p.vida;
        g.beginPath();
        g.arc(p.x, p.y, p.raio * (1 + (1 - p.vida) * 3), 0, TAU);
        g.stroke();
        continue;
      }
      g.globalAlpha = clamp(p.vida, 0, 1);
      g.fillStyle = p.cor;
      g.beginPath();
      g.arc(p.x, p.y, p.tam, 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    // Lançamento em andamento: corpo fantasma, seta e prévia pontilhada
    if (arrasto.ativo) {
      const vx = (arrasto.x - arrasto.x0) * 1.6;
      const vy = (arrasto.y - arrasto.y0) * 1.6;
      const fantasma = criarCorpoPrevia();
      g.globalAlpha = 0.7;
      desenharCorpo({ ...fantasma, x: arrasto.x0, y: arrasto.y0, rastro: [] });
      g.globalAlpha = 1;
      if (Math.hypot(vx, vy) > 10) {
        const trilha = preverTrajetoria(arrasto.x0, arrasto.y0, vx, vy);
        g.fillStyle = 'rgba(255,255,255,0.7)';
        trilha.forEach(([x, y], i) => {
          g.globalAlpha = 1 - i / trilha.length;
          g.beginPath();
          g.arc(x, y, 1.8, 0, TAU);
          g.fill();
        });
        g.globalAlpha = 1;
        g.strokeStyle = '#ffd60a';
        g.lineWidth = 2;
        g.setLineDash([6, 6]);
        g.beginPath();
        g.moveTo(arrasto.x0, arrasto.y0);
        g.lineTo(arrasto.x, arrasto.y);
        g.stroke();
        g.setLineDash([]);
      }
    }
  }

  let previaCache = null;
  function criarCorpoPrevia() {
    if (!previaCache || previaCache.tipo !== config.ferramenta) previaCache = criarCorpo(config.ferramenta, 0, 0);
    return previaCache;
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: perfilLeve ? 1.5 : 2,
    aoRedimensionar: (e) => {
      const primeiro = tela.l === 1;
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      if (!brilho) criarBrilho();
      criarFundo();
      if (primeiro) cenaInicial();
    },
  });

  /* ---------- Entrada ---------- */

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };
  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    const { x, y } = posicao(e);
    Object.assign(arrasto, { ativo: true, x0: x, y0: y, x, y, inicio: performance.now() });
    if (!interagiu) {
      interagiu = true;
      dica.classList.add('dica-palco--oculta');
    }
  });
  palco.addEventListener('pointermove', (e) => {
    if (!arrasto.ativo) return;
    const { x, y } = posicao(e);
    arrasto.x = x;
    arrasto.y = y;
  });
  function soltar() {
    if (!arrasto.ativo) return;
    arrasto.ativo = false;
    const vx = (arrasto.x - arrasto.x0) * 1.6;
    const vy = (arrasto.y - arrasto.y0) * 1.6;
    const corpo = criarCorpo(config.ferramenta, arrasto.x0, arrasto.y0, vx, vy);
    if (Math.hypot(vx, vy) < 15) {
      // Clique: órbita circular em volta do que mais puxa (se houver)
      const centro = atrator(corpo.x, corpo.y);
      if (centro && corpo.tipo !== 'estrela' && corpo.tipo !== 'buraco') emOrbita(corpo, centro, Math.random() < 0.85 ? 1 : -1);
      else if (centro) emOrbita(corpo, centro);
    }
    adicionar(corpo);
    const tons = { planeta: 1, cometa: 1.6, estrela: 0.6, buraco: 0.4 };
    audio.nota(corpo.tipo === 'buraco' ? 40 : 72 - Math.round(corpo.raio), { timbre: 'sino', volume: 0.08, pan: clamp((corpo.x / tela.l) * 2 - 1, -1, 1) * 0.6 });
    audio.tocar('whoosh', { descendo: tons[corpo.tipo] < 1 });
    progresso.registrar('orbita:lancamento', 1, corpo.tipo);
  }
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  raiz.addEventListener('keydown', (e) => {
    if ((e.key !== ' ' && e.key !== 'Enter') || e.target.closest('button')) return;
    e.preventDefault();
    const centro = atrator(tela.l / 2, tela.a / 2);
    const angulo = aleatorio(0, TAU);
    const r = aleatorio(100, Math.min(tela.l, tela.a) * 0.42);
    const base = centro ?? { x: tela.l / 2, y: tela.a / 2 };
    const corpo = criarCorpo('planeta', base.x + Math.cos(angulo) * r, base.y + Math.sin(angulo) * r);
    if (centro) emOrbita(corpo, centro);
    adicionar(corpo);
    audio.tocar('whoosh');
  });

  $('.orbita__doca').addEventListener('click', (e) => {
    const ferramenta = e.target.closest('[data-ferramenta]');
    if (ferramenta) {
      config.ferramenta = ferramenta.dataset.ferramenta;
      for (const b of raiz.querySelectorAll('[data-ferramenta]')) b.setAttribute('aria-pressed', String(b === ferramenta));
    } else if (e.target.closest('[data-rastros]')) {
      config.rastros = !config.rastros;
      $('[data-rastros]').setAttribute('aria-pressed', String(config.rastros));
    } else if (e.target.closest('[data-musica]')) {
      config.musica = !config.musica;
      $('[data-musica]').setAttribute('aria-pressed', String(config.musica));
      if (config.musica) audio.iniciarAmbiente('cosmico');
      else audio.pararAmbiente();
    } else if (e.target.closest('[data-limpar]')) {
      particulas.length = 0;
      cenaInicial();
      audio.tocar('whoosh', { descendo: true });
    }
    salvar();
  });

  /* ---------- HUD e "sistema solar" ---------- */

  function emOrbitaEstavel(c) {
    if (c.tipo !== 'planeta' || tempo - c.nascimento < 6) return false;
    const centro = atrator(c.x, c.y, c);
    if (!centro) return false;
    const dx = c.x - centro.x;
    const dy = c.y - centro.y;
    const r = Math.hypot(dx, dy);
    const v2 = (c.vx - centro.vx) ** 2 + (c.vy - centro.vy) ** 2;
    return v2 / 2 - (G * centro.massa) / r < 0; // energia negativa = preso na órbita
  }
  function atualizarHud() {
    $('[data-corpos]').textContent = String(corpos.length);
    $('[data-orbitas]').textContent = String(contagemOrbitas);
  }

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (!fundo) return;
    tempo += dt;
    const passo = dt / SUBPASSOS;
    for (let i = 0; i < SUBPASSOS; i++) passoFisica(passo);

    // Rastros e limpeza do que fugiu para muito longe
    for (const c of corpos) {
      c.rastro.push([c.x, c.y]);
      if (c.rastro.length > (c.tipo === 'cometa' ? TAMANHO_RASTRO * 1.5 : TAMANHO_RASTRO)) c.rastro.shift();
    }
    const margem = Math.max(tela.l, tela.a) * 1.5;
    const antes = corpos.length;
    corpos = corpos.filter((c) => c.x > -margem && c.x < tela.l + margem && c.y > -margem && c.y < tela.a + margem);
    if (corpos.length !== antes) atualizarHud();

    for (const p of particulas) {
      p.vida -= dt * (p.anel ? 1.4 : p.espiral ? 0.9 : 0.7);
      if (p.espiral) {
        p.angulo += dt * (6 + (1 - p.vida) * 10);
        p.distancia *= 1 - dt * 1.6;
        p.x = p.alvo.x + Math.cos(p.angulo) * p.distancia;
        p.y = p.alvo.y + Math.sin(p.angulo) * p.distancia * 0.4;
      } else if (!p.anel) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    for (let i = particulas.length - 1; i >= 0; i--) if (particulas[i].vida <= 0) particulas.splice(i, 1);

    tempoSistema += dt;
    if (tempoSistema > 1) {
      tempoSistema = 0;
      contagemOrbitas = corpos.filter(emOrbitaEstavel).length;
      progresso.definirRecorde('orbitando', 'orbitas', contagemOrbitas);
      atualizarHud();
    }
    desenhar();
  });

  if (config.musica) audio.iniciarAmbiente('cosmico');
  raiz.style.setProperty('--c1', '#ffb020');
  raiz.style.setProperty('--c2', '#8b5cff');

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      audio.pararAmbiente();
    },
  };
}
