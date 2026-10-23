/**
 * Fogos: clique lança, segurar carrega um fogo maior, arrastar solta uma rajada.
 * Sete formas de explosão, cinco paletas, show automático e grand finale,
 * com a cidade refletida na água. Brilhos contidos para evitar flashes fortes.
 */
import { geradorComSemente, aleatorio, capturarPonteiro, carregarEstilo, clamp, escolher, movimentoReduzido, perfilLeve } from '../../core/util.js?v=202610231820';
import { icone } from '../../core/icones.js?v=202610231820';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231820';

const TAU = Math.PI * 2;
const GRAVIDADE_FOGUETE = 300;
const MAX_PARTICULAS = perfilLeve ? 2500 : 4500;

const FORMAS = [
  { id: 'surpresa', nome: 'Surpresa', icone: 'dado' },
  { id: 'peonia', nome: 'Peônia', icone: 'fogos' },
  { id: 'anel', nome: 'Anel', icone: 'alvo' },
  { id: 'coracao', nome: 'Coração', icone: 'coracao' },
  { id: 'estrela', nome: 'Estrela', icone: 'estrela' },
  { id: 'salgueiro', nome: 'Salgueiro', icone: 'chuva' },
  { id: 'crepitante', nome: 'Crepitante', icone: 'brilho' },
  { id: 'duplo', nome: 'Duplo', icone: 'respirar' },
];

const PALETAS = [
  { id: 'arco-iris', nome: 'Arco-íris', cores: null, amostra: 'conic-gradient(#ff2e97, #ffd60a, #a3ff12, #22e4ff, #8b5cff, #ff2e97)' },
  { id: 'dourado', nome: 'Dourado', cores: ['#ffd60a', '#ffb703', '#fff3b0', '#ff9e00'], amostra: 'linear-gradient(135deg, #fff3b0, #ffb703)' },
  { id: 'neon', nome: 'Neon', cores: ['#ff2bd6', '#00f0ff', '#a3ff12', '#ffd60a'], amostra: 'linear-gradient(135deg, #ff2bd6, #00f0ff)' },
  { id: 'algodao', nome: 'Algodão-doce', cores: ['#ff9ad5', '#a0e7ff', '#c7a0ff', '#fff0a8'], amostra: 'linear-gradient(135deg, #ff9ad5, #a0e7ff)' },
  { id: 'fogo', nome: 'Fogo', cores: ['#ff4d00', '#ff9e00', '#ffd60a', '#ff2e60'], amostra: 'linear-gradient(135deg, #ff2e60, #ffd60a)' },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/fogos.css?v=202610231820', import.meta.url));

  const config = { forma: 'surpresa', paleta: 'arco-iris', ...ler('fogos-config', {}) };
  const salvar = () => gravar('fogos-config', { forma: config.forma, paleta: config.paleta });

  raiz.classList.add('fogos');
  raiz.innerHTML = `
    <div class="fogos__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Fogos de artifício. Clique para lançar, segure para um fogo maior, arraste para uma rajada. Espaço lança, S liga o show automático, G faz o grand finale.">
      <canvas class="fogos__camada fogos__fundo"></canvas>
      <canvas class="fogos__camada fogos__reflexo"></canvas>
      <canvas class="fogos__camada fogos__ceu"></canvas>
    </div>
    <p class="fogos__dica" data-dica>Toque no céu para lançar<small>segure para um fogo maior · arraste para uma rajada</small></p>
    <div class="doca vidro-fosco" role="region" aria-label="Controles dos fogos">
      <div class="doca__linha" role="group" aria-label="Forma">
        <span class="doca__rotulo">FORMA</span>
        ${FORMAS.map((f) => `<button type="button" class="chip" data-forma="${f.id}" aria-pressed="${f.id === config.forma}">${icone(f.icone)}<span>${f.nome}</span></button>`).join('')}
      </div>
      <div class="doca__linha">
        <span class="doca__rotulo">CORES</span>
        ${PALETAS.map((p) => `<button type="button" class="amostra-tema" data-paleta="${p.id}" style="--amostra:${p.amostra};--brilho:#fff" aria-pressed="${p.id === config.paleta}" aria-label="${p.nome}" title="${p.nome}"></button>`).join('')}
        <button type="button" class="chip" data-show aria-pressed="false">${icone('jogar')}<span>Show</span></button>
        <button type="button" class="chip" data-finale>${icone('coroa')}<span>Grand finale</span></button>
        <button type="button" class="chip" data-musica aria-pressed="false">${icone('musica')}<span>Música</span></button>
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.fogos__palco');
  const canvasFundo = $('.fogos__fundo');
  const canvasReflexo = $('.fogos__reflexo');
  const canvasCeu = $('.fogos__ceu');
  const ctxFundo = canvasFundo.getContext('2d');
  const ctxReflexo = canvasReflexo.getContext('2d');
  const ctx = canvasCeu.getContext('2d');

  const tela = { l: 1, a: 1, dpr: 1, agua: 1 };
  const foguetes = [];
  const particulas = [];
  let brilhoCeu = 0;
  let corBrilho = '255,200,150';
  let show = false;
  let relogioShow = 0;
  let finaleRestante = 0;
  let relogioFinale = 0;
  let musica = false;

  /* ---------- Cenário ---------- */

  function redimensionar() {
    const caixa = palco.getBoundingClientRect();
    if (caixa.width < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, perfilLeve ? 1.25 : 1.75);
    Object.assign(tela, { l: caixa.width, a: caixa.height, dpr, agua: caixa.height * 0.78 });
    for (const c of [canvasFundo, canvasReflexo, canvasCeu]) {
      c.width = Math.round(caixa.width * dpr);
      c.height = Math.round(caixa.height * dpr);
    }
    pintarCenario();
  }

  function pintarCenario() {
    const { l, a, dpr, agua } = tela;
    const g = ctxFundo;
    const rnd = geradorComSemente(77);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ceu = g.createLinearGradient(0, 0, 0, agua);
    ceu.addColorStop(0, '#05021a');
    ceu.addColorStop(0.6, '#160a46');
    ceu.addColorStop(1, '#3b1266');
    g.fillStyle = ceu;
    g.fillRect(0, 0, l, agua);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6})`;
      const t = rnd() * 1.6 + 0.5;
      g.fillRect(rnd() * l, rnd() * agua * 0.85, t, t);
    }
    // Lua
    const lua = g.createRadialGradient(l * 0.84, a * 0.14, 0, l * 0.84, a * 0.14, 60);
    lua.addColorStop(0, 'rgba(255,250,220,1)');
    lua.addColorStop(0.45, 'rgba(255,240,200,0.9)');
    lua.addColorStop(0.5, 'rgba(255,220,180,0.25)');
    lua.addColorStop(1, 'rgba(255,220,180,0)');
    g.fillStyle = lua;
    g.fillRect(l * 0.84 - 60, a * 0.14 - 60, 120, 120);

    // Cidade com janelas acesas
    let x = -10;
    while (x < l + 10) {
      const largura = 26 + rnd() * 60;
      const altura = a * (0.05 + rnd() * 0.17);
      g.fillStyle = rnd() > 0.5 ? '#0d0726' : '#120a32';
      g.fillRect(x, agua - altura, largura, altura);
      for (let wy = agua - altura + 8; wy < agua - 6; wy += 11) {
        for (let wx = x + 5; wx < x + largura - 6; wx += 9) {
          if (rnd() > 0.62) {
            g.fillStyle = escolher(['rgba(255,214,10,0.85)', 'rgba(255,120,200,0.8)', 'rgba(120,240,255,0.8)', 'rgba(255,240,200,0.75)']);
            g.fillRect(wx, wy, 4, 5);
          }
        }
      }
      x += largura + rnd() * 6;
    }

    const rio = g.createLinearGradient(0, agua, 0, a);
    rio.addColorStop(0, '#1a0b45');
    rio.addColorStop(1, '#040212');
    g.fillStyle = rio;
    g.fillRect(0, agua, l, a - agua);
    g.strokeStyle = 'rgba(160,140,255,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 40; i++) {
      const y = agua + 6 + rnd() * (a - agua);
      const x0 = rnd() * l;
      g.moveTo(x0, y);
      g.lineTo(x0 + 30 + rnd() * 120, y);
    }
    g.stroke();
  }

  const observador = new ResizeObserver(() => redimensionar());
  observador.observe(palco);

  /* ---------- Foguetes e explosões ---------- */

  const coresDaPaleta = () => PALETAS.find((p) => p.id === config.paleta)?.cores ?? null;
  const pan = (x) => clamp((x / tela.l) * 2 - 1, -1, 1) * 0.7;

  function lancar(alvoX, alvoY, { escala = 1, forma = config.forma, cores = coresDaPaleta() } = {}) {
    const ty = Math.min(alvoY, tela.agua - 80);
    const x0 = clamp(alvoX + aleatorio(-80, 80), 20, tela.l - 20);
    const duracao = aleatorio(0.85, 1.15);
    const y0 = tela.agua;
    foguetes.push({
      x: x0,
      y: y0,
      vx: (alvoX - x0) / duracao,
      vy: (ty - y0 - 0.5 * GRAVIDADE_FOGUETE * duracao * duracao) / duracao,
      t: 0,
      duracao,
      escala,
      forma: forma === 'surpresa' ? escolher(FORMAS.slice(1)).id : forma,
      cores,
      matiz: aleatorio(0, 360),
    });
    audio.tocar('foguete', { pan: pan(x0), intervaloMin: 0.05 });
    progresso.registrar('fogos:lancado');
  }

  function adicionar(p) {
    if (particulas.length >= MAX_PARTICULAS) return;
    p.vidaTotal = p.vida;
    particulas.push(p);
  }

  function explodir(f) {
    const { x, y, escala } = f;
    const fator = (perfilLeve ? 0.65 : 1) * (movimentoReduzido() ? 0.5 : 1);
    const quantidade = Math.round(110 * escala * fator);
    const vel = Math.min(tela.l, tela.a) * 0.42 * Math.sqrt(escala) * aleatorio(0.85, 1.15);
    const cor = f.cores
      ? () => escolher(f.cores)
      : () => `hsl(${(f.matiz + aleatorio(-30, 30) + 360) % 360}, 100%, ${aleatorio(60, 72)}%)`;
    const base = { arrasto: 0.975, gravidade: 1, rastro: false, crepita: false };
    const giro = aleatorio(0, TAU);

    const emitir = (vx, vy, extra = {}) => adicionar({
      ...base, x, y, vx, vy, cor: cor(), tam: aleatorio(2.2, 3.6) * Math.min(1.4, escala), vida: aleatorio(1.2, 1.9), ...extra,
    });

    switch (f.forma) {
      case 'anel': {
        const inclinacao = aleatorio(0.35, 1);
        for (let i = 0; i < quantidade; i++) {
          const ang = (i / quantidade) * TAU;
          let vx = Math.cos(ang) * vel;
          let vy = Math.sin(ang) * vel * inclinacao;
          [vx, vy] = [vx * Math.cos(giro) - vy * Math.sin(giro), vx * Math.sin(giro) + vy * Math.cos(giro)];
          emitir(vx, vy);
        }
        break;
      }
      case 'coracao':
        for (let i = 0; i < quantidade; i++) {
          const t = (i / quantidade) * TAU;
          const hx = 16 * Math.sin(t) ** 3;
          const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          emitir((hx / 17) * vel, (-hy / 17) * vel, { gravidade: 0.5, cor: f.cores ? cor() : `hsl(${330 + aleatorio(-15, 15)}, 100%, 66%)` });
        }
        break;
      case 'estrela':
        for (let i = 0; i < quantidade; i++) {
          const t = i / quantidade;
          const segmento = Math.floor(t * 10);
          const fracao = t * 10 - segmento;
          const r1 = segmento % 2 ? 0.45 : 1;
          const r2 = segmento % 2 ? 1 : 0.45;
          const a1 = giro + (segmento / 10) * TAU;
          const a2 = giro + ((segmento + 1) / 10) * TAU;
          const px = Math.cos(a1) * r1 + (Math.cos(a2) * r2 - Math.cos(a1) * r1) * fracao;
          const py = Math.sin(a1) * r1 + (Math.sin(a2) * r2 - Math.sin(a1) * r1) * fracao;
          emitir(px * vel, py * vel, { gravidade: 0.5 });
        }
        break;
      case 'salgueiro':
        for (let i = 0; i < quantidade * 0.8; i++) {
          const ang = aleatorio(0, TAU);
          const v = vel * 0.75 * Math.sqrt(Math.random());
          emitir(Math.cos(ang) * v, Math.sin(ang) * v, {
            arrasto: 0.955, gravidade: 1.4, vida: aleatorio(2, 2.8), rastro: true,
            cor: f.cores ? cor() : escolher(['#ffd27a', '#ffc04d', '#fff0c4']),
          });
        }
        break;
      case 'crepitante':
        for (let i = 0; i < quantidade * 0.8; i++) {
          const ang = aleatorio(0, TAU);
          const v = vel * Math.sqrt(Math.random());
          emitir(Math.cos(ang) * v, Math.sin(ang) * v, { crepita: Math.random() < 0.5, vida: aleatorio(0.8, 1.2) });
        }
        audio.tocar('estalos', { pan: pan(x) });
        break;
      case 'duplo': {
        const outra = f.cores ? () => escolher(f.cores) : () => `hsl(${(f.matiz + 180) % 360}, 100%, 70%)`;
        for (let i = 0; i < quantidade; i++) {
          const ang = aleatorio(0, TAU);
          const interno = i % 2 === 0;
          const v = vel * (interno ? 0.45 : 1) * aleatorio(0.9, 1.05);
          emitir(Math.cos(ang) * v, Math.sin(ang) * v, interno ? { cor: outra() } : {});
        }
        break;
      }
      default:
        for (let i = 0; i < quantidade; i++) {
          const ang = aleatorio(0, TAU);
          const v = vel * Math.sqrt(Math.random());
          emitir(Math.cos(ang) * v, Math.sin(ang) * v, { rastro: Math.random() < 0.15 });
        }
    }

    // Miolo luminoso curto e um leve clarão no céu (bem contido)
    adicionar({ ...base, x, y, vx: 0, vy: 0, cor: '#ffffff', tam: 14 * Math.min(1.5, escala), vida: 0.18, gravidade: 0, nucleo: true });
    brilhoCeu = Math.min(0.08, brilhoCeu + 0.035 * escala);
    corBrilho = f.cores ? '255,220,200' : `${Math.round(200 + Math.random() * 55)},${Math.round(150 + Math.random() * 80)},${Math.round(180 + Math.random() * 75)}`;
    audio.tocar('explosao', { tamanho: escala, pan: pan(x), intervaloMin: 0.03 });
  }

  /* ---------- Show e finale ---------- */

  function lancarAleatorio(escala = aleatorio(0.8, 1.3)) {
    lancar(aleatorio(0.12, 0.88) * tela.l, aleatorio(0.15, 0.45) * tela.a, { escala, forma: 'surpresa' });
  }

  function finale() {
    esconderDica();
    finaleRestante = 14;
    relogioFinale = 0;
    progresso.registrar('fogos:finale');
  }

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (tela.l < 2) return;

    if (show) {
      relogioShow -= dt;
      if (relogioShow <= 0) {
        relogioShow = aleatorio(0.5, 1.3);
        lancarAleatorio();
      }
    }
    if (finaleRestante > 0) {
      relogioFinale -= dt;
      if (relogioFinale <= 0) {
        relogioFinale = 0.14;
        finaleRestante--;
        lancarAleatorio(finaleRestante === 0 ? 2 : aleatorio(0.9, 1.4));
      }
    }

    for (const f of foguetes) {
      f.t += dt;
      f.vy += GRAVIDADE_FOGUETE * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (Math.random() < 0.8) {
        adicionar({ x: f.x, y: f.y, vx: aleatorio(-20, 20), vy: aleatorio(20, 60), cor: '#ffd9a0', tam: 1.6, vida: 0.4, arrasto: 0.95, gravidade: 0.3 });
      }
      if (f.t >= f.duracao) {
        f.morto = true;
        explodir(f);
      }
    }
    for (let i = foguetes.length - 1; i >= 0; i--) if (foguetes[i].morto) foguetes.splice(i, 1);

    for (const p of particulas) {
      const arrasto = p.arrasto ** (dt * 60);
      p.vx *= arrasto;
      p.vy = p.vy * arrasto + 140 * p.gravidade * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= dt;
      if (p.rastro && Math.random() < 0.35) {
        adicionar({ x: p.x, y: p.y, vx: 0, vy: 10, cor: p.cor, tam: p.tam * 0.6, vida: 0.35, arrasto: 0.9, gravidade: 0.2 });
      }
      if (p.crepita && p.vida <= 0) {
        for (let k = 0; k < 3; k++) {
          adicionar({ x: p.x, y: p.y, vx: aleatorio(-60, 60), vy: aleatorio(-60, 60), cor: '#ffffff', tam: 1.3, vida: 0.15, arrasto: 0.9, gravidade: 0 });
        }
      }
    }
    for (let i = particulas.length - 1; i >= 0; i--) if (particulas[i].vida <= 0) particulas.splice(i, 1);
    brilhoCeu = Math.max(0, brilhoCeu - dt * 0.25);

    desenhar();
  });

  function desenhar() {
    const { l, a, dpr, agua } = tela;

    // Rastro: apaga só um pouco do quadro anterior
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${movimentoReduzido() ? 0.5 : 0.22})`;
    ctx.fillRect(0, 0, canvasCeu.width, canvasCeu.height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particulas) {
      const vida = p.vida / p.vidaTotal;
      ctx.globalAlpha = p.nucleo ? vida * 0.6 : Math.min(1, vida * 1.6);
      ctx.fillStyle = p.cor;
      const tam = p.nucleo ? p.tam * (1.5 - vida) : p.tam * (0.5 + vida * 0.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, tam, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of foguetes) {
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      ctx.arc(f.x, f.y, 2.4, 0, TAU);
      ctx.fill();
    }
    // Anel de carga enquanto segura
    if (carga.ativa) {
      const forca = Math.min(1, (performance.now() - carga.inicio) / 1000);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + forca * 0.5})`;
      ctx.lineWidth = 2 + forca * 3;
      ctx.beginPath();
      ctx.arc(carga.x, carga.y, 14 + forca * 30, 0, TAU * forca);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Clarão sutil no céu (camada de tela por cima, no máximo 8%)
    palco.style.setProperty('--brilho-ceu', `rgba(${corBrilho},${brilhoCeu.toFixed(3)})`);

    // Reflexo na água: o céu espelhado abaixo da linha d'água
    ctxReflexo.setTransform(1, 0, 0, 1, 0, 0);
    ctxReflexo.clearRect(0, 0, canvasReflexo.width, canvasReflexo.height);
    ctxReflexo.setTransform(1, 0, 0, -1, 0, Math.round(agua * dpr) * 2);
    ctxReflexo.drawImage(canvasCeu, 0, 0);
    ctxReflexo.setTransform(1, 0, 0, 1, 0, 0);
    ctxReflexo.clearRect(0, 0, canvasReflexo.width, Math.round(agua * dpr));
  }

  /* ---------- Entrada ---------- */

  const carga = { ativa: false, x: 0, y: 0, inicio: 0, arrastou: false, ultimoX: 0, ultimoY: 0, ultimoLancamento: 0 };
  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  function esconderDica() {
    $('[data-dica]').classList.add('fogos__dica--oculta');
  }

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    const { x, y } = posicao(e);
    Object.assign(carga, { ativa: true, x, y, inicio: performance.now(), arrastou: false, ultimoX: x, ultimoY: y, ultimoLancamento: 0 });
    esconderDica();
  });

  palco.addEventListener('pointermove', (e) => {
    if (!carga.ativa) return;
    const { x, y } = posicao(e);
    carga.x = x;
    carga.y = y;
    const agora = performance.now();
    if (Math.hypot(x - carga.ultimoX, y - carga.ultimoY) > 70 && agora - carga.ultimoLancamento > 120) {
      carga.arrastou = true;
      carga.ultimoX = x;
      carga.ultimoY = y;
      carga.ultimoLancamento = agora;
      lancar(x, y, { escala: 0.6 });
    }
  });

  const soltar = () => {
    if (!carga.ativa) return;
    carga.ativa = false;
    if (carga.arrastou) return;
    const segurou = (performance.now() - carga.inicio) / 1000;
    lancar(carga.x, carga.y, { escala: 1 + Math.min(1.2, Math.max(0, segurou - 0.15) * 1.3) });
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', () => {
    carga.ativa = false;
  });

  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input')) return;
    const tecla = e.key.toLowerCase();
    if ((tecla === ' ' || tecla === 'enter') && e.target === palco) {
      e.preventDefault();
      esconderDica();
      lancarAleatorio();
    } else if (tecla === 's') alternarShow();
    else if (tecla === 'g') finale();
  });

  function alternarShow() {
    show = !show;
    relogioShow = 0;
    $('[data-show]').setAttribute('aria-pressed', String(show));
    if (show) esconderDica();
  }

  $('.doca').addEventListener('click', (e) => {
    const botao = e.target.closest('button');
    if (!botao) return;
    if (botao.dataset.forma) {
      config.forma = botao.dataset.forma;
      raiz.querySelectorAll('[data-forma]').forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));
      salvar();
    } else if (botao.dataset.paleta) {
      config.paleta = botao.dataset.paleta;
      raiz.querySelectorAll('[data-paleta]').forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));
      salvar();
    } else if ('show' in botao.dataset) alternarShow();
    else if ('finale' in botao.dataset) finale();
    else if ('musica' in botao.dataset) {
      musica = !musica;
      botao.setAttribute('aria-pressed', String(musica));
      if (musica) audio.iniciarAmbiente('cosmico');
      else audio.pararAmbiente();
    }
  });

  redimensionar();

  return {
    destruir() {
      pararLoop();
      observador.disconnect();
      audio.pararAmbiente();
    },
  };
}
