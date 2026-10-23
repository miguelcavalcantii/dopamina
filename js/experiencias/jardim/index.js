/**
 * Jardim Bioluminescente: à noite, cada clique planta algo que brilha e cresce
 * (cogumelos, flores-sino, margaridas e samambaias). Clicar no céu solta uma semente
 * que cai e germina no chão. Passar o ponteiro perto faz as plantas pulsarem e
 * soltarem esporos de luz; vaga-lumes seguem o cursor. Cada planta toca uma nota
 * suave ao crescer (escala pentatônica: mais grave à esquerda, mais aguda à direita).
 */
import { criarCanvasResponsivo } from '../../core/canvas.js';
import { icone } from '../../core/icones.js';
import { ler, gravar } from '../../core/armazenamento.js';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, escolher, geradorComSemente, movimentoReduzido, perfilLeve } from '../../core/util.js';

const TAU = Math.PI * 2;
const MAX_PLANTAS = 90;
const ESCALA_NOTAS = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
const CORES = ['#22e4ff', '#ff5dc8', '#a3ff12', '#b18cff', '#ffb347', '#3cffb4'];
const TIPOS = [
  { id: 'aleatoria', nome: 'Surpresa' },
  { id: 'cogumelo', nome: 'Cogumelo' },
  { id: 'sino', nome: 'Flor-sino' },
  { id: 'margarida', nome: 'Margarida' },
  { id: 'samambaia', nome: 'Samambaia' },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/jardim.css', import.meta.url));

  const config = { tipo: 'aleatoria', musica: true, ...ler('jardim-config', {}) };
  const salvar = () => gravar('jardim-config', config);

  raiz.classList.add('jardim');
  raiz.innerHTML = `
    <div class="jardim__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Jardim bioluminescente. Clique para plantar. Passe o ponteiro perto das plantas para elas pulsarem. Teclado: espaço planta num lugar sorteado.">
      <canvas class="jardim__canvas"></canvas>
    </div>
    <p class="dica-palco" data-dica>Toque para plantar<small>passe perto das plantas para elas brilharem</small></p>
    <div class="doca vidro-fosco jardim__doca" role="region" aria-label="Opções do jardim">
      <div class="doca__linha">
        <span class="doca__rotulo">PLANTAR</span>
        ${TIPOS.map((t) => `<button type="button" class="chip" data-tipo="${t.id}" aria-pressed="${t.id === config.tipo}">${t.nome}</button>`).join('')}
        <button type="button" class="chip" data-musica aria-pressed="${config.musica}">${icone('musica')}<span>Música</span></button>
        <button type="button" class="chip" data-limpar>${icone('chuva')}<span>Recomeçar</span></button>
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.jardim__palco');
  const canvas = $('.jardim__canvas');
  const g = canvas.getContext('2d');
  const dica = $('[data-dica]');

  let tela = { l: 1, a: 1, dpr: 1 };
  let fundo = null;
  let brilho = null; // sprite de luz radial branca (tingida com 'lighter' + globalAlpha)
  const plantas = [];
  const sementes = [];
  const esporos = [];
  const vagalumes = [];
  const ponteiro = { x: -999, y: -999, ativo: false };
  let tempo = 0;
  let interagiu = false;

  const chao = (x) => tela.a * 0.66 + Math.sin(x * 0.006 + 1.2) * tela.a * 0.035 + Math.sin(x * 0.017) * tela.a * 0.012;

  /* ---------- Cenário pré-desenhado ---------- */

  function criarFundo() {
    const { l, a, dpr } = tela;
    const c = document.createElement('canvas');
    c.width = Math.round(l * dpr);
    c.height = Math.round(a * dpr);
    const s = c.getContext('2d');
    s.scale(dpr, dpr);
    const ceu = s.createLinearGradient(0, 0, 0, a);
    ceu.addColorStop(0, '#040619');
    ceu.addColorStop(0.55, '#0a1838');
    ceu.addColorStop(1, '#03110f');
    s.fillStyle = ceu;
    s.fillRect(0, 0, l, a);
    // Lua cheia baixa
    const lua = s.createRadialGradient(l * 0.18, a * 0.2, 0, l * 0.18, a * 0.2, a * 0.22);
    lua.addColorStop(0, 'rgba(220,240,255,0.95)');
    lua.addColorStop(0.12, 'rgba(200,225,255,0.55)');
    lua.addColorStop(1, 'rgba(120,160,255,0)');
    s.fillStyle = lua;
    s.fillRect(0, 0, l, a);
    // Árvores ao longe
    const rnd = geradorComSemente(9);
    s.fillStyle = '#06142a';
    for (let x = -40; x < l + 40; x += 28 + rnd() * 40) {
      const altura = a * (0.18 + rnd() * 0.16);
      const base = chao(x) - 4;
      s.beginPath();
      s.moveTo(x - 26, base);
      s.lineTo(x, base - altura);
      s.lineTo(x + 26, base);
      s.closePath();
      s.fill();
    }
    // Terreno com musgo
    const terra = s.createLinearGradient(0, a * 0.6, 0, a);
    terra.addColorStop(0, '#0b2a26');
    terra.addColorStop(1, '#020807');
    s.fillStyle = terra;
    s.beginPath();
    s.moveTo(0, a);
    for (let x = 0; x <= l; x += 6) s.lineTo(x, chao(x));
    s.lineTo(l, a);
    s.closePath();
    s.fill();
    // Pontinhos de musgo luminoso no chão
    for (let i = 0; i < l * 0.4; i++) {
      const x = rnd() * l;
      const y = chao(x) + rnd() * (a - chao(x));
      s.fillStyle = `rgba(${rnd() > 0.5 ? '60,255,180' : '34,228,255'},${0.05 + rnd() * 0.12})`;
      s.fillRect(x, y, 1.6, 1.6);
    }
    fundo = c;
  }

  function criarBrilho() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const s = c.getContext('2d');
    const grad = s.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    s.fillStyle = grad;
    s.fillRect(0, 0, 128, 128);
    brilho = c;
  }

  /** Brilho colorido: cópia tingida do sprite branco (cacheada por cor). */
  const brilhosTingidos = new Map();
  function brilhoDe(cor) {
    if (!brilhosTingidos.has(cor)) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const s = c.getContext('2d');
      s.drawImage(brilho, 0, 0);
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = cor;
      s.fillRect(0, 0, 128, 128);
      brilhosTingidos.set(cor, c);
    }
    return brilhosTingidos.get(cor);
  }

  const estrelas = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.5, fase: aleatorio(0, TAU), r: aleatorio(0.4, 1.4) }));

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: perfilLeve ? 1.5 : 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      if (!brilho) criarBrilho();
      criarFundo();
      for (const p of plantas) p.y = Math.max(p.y, chao(p.x));
      if (!vagalumes.length) {
        for (let i = 0; i < (perfilLeve ? 10 : 16); i++) vagalumes.push({ x: aleatorio(0, tela.l), y: aleatorio(tela.a * 0.3, tela.a * 0.7), vx: 0, vy: 0, fase: aleatorio(0, TAU), deslocamento: [aleatorio(-60, 60), aleatorio(-50, 50)] });
      }
    },
  });

  /* ---------- Plantar ---------- */

  function nota(x, volume = 0.1) {
    if (!config.musica && volume < 0.05) return;
    const i = clamp(Math.floor((x / tela.l) * ESCALA_NOTAS.length), 0, ESCALA_NOTAS.length - 1);
    audio.nota(ESCALA_NOTAS[i], { timbre: 'sino', volume, duracao: 0.6, pan: clamp((x / tela.l) * 2 - 1, -1, 1) * 0.6 });
  }

  function plantar(x, y) {
    const base = chao(x);
    if (y < base) {
      // Clique no céu: a semente cai até o chão e germina lá
      sementes.push({ x, y, vy: 0, cor: escolher(CORES) });
      audio.tocar('gota', { tom: 1.6, volume: 0.6 });
      return;
    }
    criarPlanta(x, y);
  }

  function criarPlanta(x, y, cor = escolher(CORES)) {
    const tipo = config.tipo === 'aleatoria' ? escolher(['cogumelo', 'sino', 'margarida', 'samambaia']) : config.tipo;
    const profundidade = clamp((y - chao(x)) / (tela.a - chao(x) + 1), 0, 1);
    const escala = (0.55 + profundidade * 0.75) * clamp(tela.a / 900, 0.6, 1.3);
    plantas.push({
      tipo,
      x,
      y,
      cor,
      cor2: escolher(CORES.filter((c) => c !== cor)),
      escala,
      crescimento: 0,
      duracao: aleatorio(1.6, 2.6),
      altura: tipo === 'cogumelo' ? aleatorio(50, 90) : aleatorio(90, 160),
      pulso: 0,
      fase: aleatorio(0, TAU),
      tocouFlor: false,
      petalas: 6 + Math.floor(Math.random() * 5),
      curva: aleatorio(-0.35, 0.35),
    });
    plantas.sort((p, q) => p.y - q.y);
    if (plantas.length > MAX_PLANTAS) {
      // A mais antiga murcha (some aos poucos)
      const antiga = plantas.reduce((m, p) => (p.nascimento ?? 0) < (m.nascimento ?? 0) ? p : m, plantas[0]);
      antiga.murchar = 1;
    }
    plantas[plantas.length - 1].nascimento = tempo;
    nota(x, 0.11);
    progresso.registrar('jardim:planta', 1, tipo);
    if (!interagiu) {
      interagiu = true;
      dica.classList.add('dica-palco--oculta');
    }
  }

  /* ---------- Desenho das plantas ---------- */

  function suavizar(t) {
    return 1 - (1 - clamp(t, 0, 1)) ** 3;
  }

  function desenharPlanta(p) {
    const cresc = suavizar(p.crescimento);
    const vento = Math.sin(tempo * 0.9 + p.fase) * 0.06 + Math.sin(tempo * 2.3 + p.fase * 2) * 0.015;
    const luz = 0.55 + p.pulso * 0.9 + Math.sin(tempo * 1.6 + p.fase) * 0.08;
    const alfa = p.murchar ? p.murchar : 1;
    const e = p.escala;
    g.save();
    g.globalAlpha = alfa;
    g.translate(p.x, p.y);

    if (p.tipo === 'cogumelo') {
      const h = p.altura * e * cresc;
      const largura = 22 * e;
      // Haste
      g.rotate(vento * 0.5);
      const haste = g.createLinearGradient(-largura * 0.3, 0, largura * 0.3, 0);
      haste.addColorStop(0, 'rgba(200,230,255,0.35)');
      haste.addColorStop(0.5, 'rgba(230,245,255,0.75)');
      haste.addColorStop(1, 'rgba(200,230,255,0.35)');
      g.fillStyle = haste;
      g.beginPath();
      g.moveTo(-largura * 0.28, 0);
      g.quadraticCurveTo(-largura * 0.18, -h * 0.5, -largura * 0.22, -h);
      g.lineTo(largura * 0.22, -h);
      g.quadraticCurveTo(largura * 0.18, -h * 0.5, largura * 0.28, 0);
      g.closePath();
      g.fill();
      // Chapéu: abre depois que a haste cresce
      const abertura = suavizar((p.crescimento - 0.35) / 0.65);
      if (abertura > 0) {
        const r = largura * 1.6 * abertura;
        const chapeu = g.createRadialGradient(-r * 0.3, -h - r * 0.5, r * 0.1, 0, -h, r * 1.2);
        chapeu.addColorStop(0, '#ffffff');
        chapeu.addColorStop(0.35, p.cor);
        chapeu.addColorStop(1, 'rgba(10,20,40,0.9)');
        g.fillStyle = chapeu;
        g.beginPath();
        g.ellipse(0, -h, r, r * 0.62, 0, Math.PI, 0);
        g.quadraticCurveTo(0, -h + r * 0.22, -r, -h);
        g.fill();
        // Pintinhas que brilham
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(255,255,255,${0.35 * luz})`;
        for (let k = 0; k < 5; k++) {
          const a = Math.PI + 0.4 + k * 0.5;
          g.beginPath();
          g.arc(Math.cos(a) * r * 0.55, -h + Math.sin(a) * r * 0.35, r * 0.07, 0, TAU);
          g.fill();
        }
        g.drawImage(brilhoDe(p.cor), -r * 2.2, -h - r * 1.9, r * 4.4, r * 3.6);
        g.globalAlpha = alfa * clamp(luz * 0.6, 0, 1);
        g.drawImage(brilhoDe(p.cor), -r * 1.2, -h - r * 0.9, r * 2.4, r * 1.8);
        g.globalCompositeOperation = 'source-over';
      }
    } else {
      // Caule curvo que cresce
      const h = p.altura * e * cresc;
      const curva = p.curva + vento;
      const topo = { x: Math.sin(curva) * h * 0.5, y: -h };
      g.strokeStyle = 'rgba(120,255,200,0.55)';
      g.lineWidth = Math.max(1.4, 3 * e);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(Math.sin(curva) * h * 0.1, -h * 0.55, topo.x, topo.y);
      g.stroke();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(60,255,180,${0.18 * luz})`;
      g.lineWidth = Math.max(3, 7 * e);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
      // Folhinhas no caule
      for (let k = 1; k <= 2; k++) {
        const t = k * 0.3;
        const fx = Math.sin(curva) * h * 0.1 * t * 2;
        const fy = -h * t;
        g.fillStyle = 'rgba(80,220,170,0.6)';
        g.beginPath();
        g.ellipse(fx + (k % 2 ? 8 : -8) * e, fy, 9 * e * cresc, 3.5 * e * cresc, k % 2 ? -0.5 : 0.5, 0, TAU);
        g.fill();
      }
      const flor = suavizar((p.crescimento - 0.45) / 0.55);
      if (flor > 0) {
        g.translate(topo.x, topo.y);
        g.rotate(curva * 0.6);
        const r = 16 * e * flor;
        if (p.tipo === 'sino') {
          // Flor-sino pendurada, aberta para baixo
          const sino = g.createRadialGradient(0, -r * 0.2, r * 0.1, 0, r * 0.4, r * 1.3);
          sino.addColorStop(0, '#ffffff');
          sino.addColorStop(0.4, p.cor);
          sino.addColorStop(1, 'rgba(10,10,40,0.6)');
          g.fillStyle = sino;
          g.beginPath();
          g.moveTo(-r * 0.4, -r * 0.4);
          g.quadraticCurveTo(-r * 1.1, r * 0.2, -r * 0.9, r * 0.9);
          g.quadraticCurveTo(-r * 0.45, r * 0.65, 0, r * 0.95);
          g.quadraticCurveTo(r * 0.45, r * 0.65, r * 0.9, r * 0.9);
          g.quadraticCurveTo(r * 1.1, r * 0.2, r * 0.4, -r * 0.4);
          g.closePath();
          g.fill();
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = `rgba(255,255,255,${0.6 * luz})`;
          g.beginPath();
          g.arc(0, r * 0.95, r * 0.12, 0, TAU);
          g.fill();
        } else if (p.tipo === 'margarida') {
          for (let k = 0; k < p.petalas; k++) {
            const a = (k / p.petalas) * TAU + tempo * 0.05;
            g.save();
            g.rotate(a);
            const petala = g.createLinearGradient(0, 0, r * 1.2, 0);
            petala.addColorStop(0, p.cor2);
            petala.addColorStop(1, p.cor);
            g.fillStyle = petala;
            g.beginPath();
            g.ellipse(r * 0.7, 0, r * 0.75, r * 0.26, 0, 0, TAU);
            g.fill();
            g.restore();
          }
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = `rgba(255,240,180,${0.7 * luz})`;
          g.beginPath();
          g.arc(0, 0, r * 0.32, 0, TAU);
          g.fill();
        } else {
          // Samambaia: espiral que desenrola
          g.strokeStyle = p.cor;
          g.lineWidth = Math.max(1.5, 3 * e);
          g.beginPath();
          const voltas = 2.4 * (1 - flor * 0.6);
          for (let k = 0; k <= 40; k++) {
            const t = k / 40;
            const a = t * voltas * TAU;
            const raio = r * 1.2 * (1 - t * 0.85);
            const x = Math.cos(a) * raio;
            const y = Math.sin(a) * raio;
            if (k) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.stroke();
          g.globalCompositeOperation = 'lighter';
        }
        g.globalAlpha = alfa * clamp(0.5 + luz * 0.5, 0, 1);
        g.drawImage(brilhoDe(p.cor), -r * 3, -r * 3, r * 6, r * 6);
        g.globalCompositeOperation = 'source-over';
      }
    }
    g.restore();
  }

  /* ---------- Entrada ---------- */

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };
  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    const { x, y } = posicao(e);
    Object.assign(ponteiro, { x, y, ativo: true });
    plantar(x, y);
  });
  palco.addEventListener('pointermove', (e) => {
    const { x, y } = posicao(e);
    Object.assign(ponteiro, { x, y, ativo: true });
  });
  palco.addEventListener('pointerleave', () => { ponteiro.ativo = false; });
  raiz.addEventListener('keydown', (e) => {
    if ((e.key !== ' ' && e.key !== 'Enter') || e.target.closest('button')) return;
    e.preventDefault();
    const x = aleatorio(tela.l * 0.08, tela.l * 0.92);
    plantar(x, aleatorio(chao(x) + 10, tela.a * 0.92));
  });

  $('.jardim__doca').addEventListener('click', (e) => {
    const tipo = e.target.closest('[data-tipo]');
    if (tipo) {
      config.tipo = tipo.dataset.tipo;
      salvar();
      for (const b of raiz.querySelectorAll('[data-tipo]')) b.setAttribute('aria-pressed', String(b === tipo));
    } else if (e.target.closest('[data-musica]')) {
      config.musica = !config.musica;
      salvar();
      $('[data-musica]').setAttribute('aria-pressed', String(config.musica));
      if (config.musica) audio.iniciarAmbiente('cosmico');
      else audio.pararAmbiente();
    } else if (e.target.closest('[data-limpar]')) {
      for (const p of plantas) p.murchar = 1;
      audio.tocar('whoosh', { descendo: true });
    }
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (!fundo) return;
    tempo += dt;
    const { l, a, dpr } = tela;
    const parado = movimentoReduzido();

    // Sementes caindo
    for (const s of sementes) {
      s.vy += 380 * dt;
      s.y += s.vy * dt;
      s.x += Math.sin(tempo * 4 + s.y * 0.02) * 20 * dt;
      if (s.y >= chao(s.x) + 6) {
        s.plantada = true;
        criarPlanta(s.x, chao(s.x) + aleatorio(4, 26), s.cor);
      }
    }
    for (let i = sementes.length - 1; i >= 0; i--) if (sementes[i].plantada) sementes.splice(i, 1);

    // Plantas: crescer, pulsar perto do ponteiro, soltar esporos, murchar
    for (const p of plantas) {
      if (p.crescimento < 1) {
        p.crescimento = Math.min(1, p.crescimento + dt / p.duracao);
        if (!p.tocouFlor && p.crescimento > 0.75) {
          p.tocouFlor = true;
          nota(p.x + 40, config.musica ? 0.06 : 0.04);
        }
      }
      const perto = ponteiro.ativo ? Math.hypot(ponteiro.x - p.x, ponteiro.y - (p.y - p.altura * p.escala * 0.8)) : 9999;
      const alvo = perto < 130 * p.escala + 30 ? 1 - perto / (130 * p.escala + 30) : 0;
      p.pulso += (alvo - p.pulso) * Math.min(1, dt * 6);
      if (p.pulso > 0.3 && !parado && Math.random() < dt * p.pulso * 10 && esporos.length < 260) {
        esporos.push({ x: p.x + aleatorio(-14, 14) * p.escala, y: p.y - p.altura * p.escala * aleatorio(0.6, 1), vx: aleatorio(-12, 12), vy: aleatorio(-40, -18), vida: 1, cor: p.cor, fase: aleatorio(0, TAU) });
      }
      if (p.pulso > 0.6 && !p.cantou) {
        p.cantou = true;
        nota(p.x, 0.045);
      } else if (p.pulso < 0.2) {
        p.cantou = false;
      }
      if (p.murchar) p.murchar = Math.max(0, p.murchar - dt * 0.8);
    }
    for (let i = plantas.length - 1; i >= 0; i--) if (plantas[i].murchar === 0) plantas.splice(i, 1);

    // Esporos sobem dançando
    for (const s of esporos) {
      s.vida -= dt * 0.35;
      s.x += (s.vx + Math.sin(tempo * 2 + s.fase) * 14) * dt;
      s.y += s.vy * dt;
    }
    for (let i = esporos.length - 1; i >= 0; i--) if (esporos[i].vida <= 0) esporos.splice(i, 1);

    // Vaga-lumes: seguem o ponteiro com um deslocamento próprio; sem ponteiro, passeiam
    for (const v of vagalumes) {
      v.fase += dt;
      const alvoX = ponteiro.ativo ? ponteiro.x + v.deslocamento[0] : l / 2 + Math.sin(v.fase * 0.3 + v.deslocamento[0]) * l * 0.4;
      const alvoY = ponteiro.ativo ? ponteiro.y + v.deslocamento[1] : a * 0.45 + Math.cos(v.fase * 0.37 + v.deslocamento[1]) * a * 0.2;
      v.vx += ((alvoX - v.x) * 1.4 - v.vx) * dt * 1.6 + Math.sin(v.fase * 3.1) * 30 * dt;
      v.vy += ((alvoY - v.y) * 1.4 - v.vy) * dt * 1.6 + Math.cos(v.fase * 2.7) * 30 * dt;
      v.x += v.vx * dt;
      v.y += v.vy * dt;
    }

    /* Desenho */
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(fundo, 0, 0, l, a);
    for (const e of estrelas) {
      g.fillStyle = `rgba(220,235,255,${0.25 + Math.sin(tempo * 0.8 + e.fase) * 0.2 + 0.2})`;
      g.fillRect(e.x * l, e.y * a, e.r, e.r);
    }
    // Névoa baixa que passa devagar
    if (!parado) {
      for (let k = 0; k < 2; k++) {
        const y = a * (0.62 + k * 0.08);
        const n = g.createLinearGradient(0, y - 40, 0, y + 40);
        n.addColorStop(0, 'rgba(120,200,255,0)');
        n.addColorStop(0.5, `rgba(120,200,255,${0.05 + Math.sin(tempo * 0.2 + k) * 0.02})`);
        n.addColorStop(1, 'rgba(120,200,255,0)');
        g.fillStyle = n;
        g.fillRect(0, y - 40, l, 80);
      }
    }

    for (const p of plantas) desenharPlanta(p);

    g.globalCompositeOperation = 'lighter';
    for (const s of sementes) {
      g.globalAlpha = 0.9;
      g.drawImage(brilhoDe(s.cor), s.x - 16, s.y - 16, 32, 32);
    }
    for (const s of esporos) {
      g.globalAlpha = s.vida * 0.8;
      g.drawImage(brilhoDe(s.cor), s.x - 6, s.y - 6, 12, 12);
    }
    for (const v of vagalumes) {
      const piscar = 0.35 + Math.max(0, Math.sin(v.fase * 2.2 + v.deslocamento[0])) * 0.65;
      g.globalAlpha = piscar;
      g.drawImage(brilhoDe('#d8ff6a'), v.x - 14, v.y - 14, 28, 28);
      g.globalAlpha = 1;
      g.fillStyle = '#f4ffcf';
      g.fillRect(v.x - 1.2, v.y - 1.2, 2.4, 2.4);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  });

  if (config.musica) audio.iniciarAmbiente('cosmico');
  raiz.style.setProperty('--c1', '#3cffb4');
  raiz.style.setProperty('--c2', '#b18cff');

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      audio.pararAmbiente();
    },
  };
}
