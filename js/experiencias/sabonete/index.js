/**
 * Sabonete e espuma: uma barra de sabonete numa bandeja, vista de cima.
 * Ferramentas: Faca (corta sulcos limpos), Raspar (tira lascas que se enrolam em
 * cachinhos e caem na bandeja), Espuma (segure para juntar bolhas; arraste para
 * espalhar) e Apertar (a barra amassa e solta espuma pelos lados).
 * Sons gravados (CC0): faca na manteiga, faca raspando, espuma de barbear.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231820';
import { icone } from '../../core/icones.js?v=202610231820';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231820';
import { criarBanco } from '../../core/amostras.js?v=202610231820';
import { htmlControlesAsmr, ligarControlesAsmr } from '../../core/asmr.js?v=202610231820';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, eventosCombinados, geradorComSemente, movimentoReduzido } from '../../core/util.js?v=202610231820';

const TAU = Math.PI * 2;
const som = (nome) => new URL(`../../../assets/sons/asmr/${nome}.mp3`, import.meta.url);
const MAX_BOLHAS = 700;

const SABONETES = [
  { id: 'lavanda', nome: 'Lavanda', cores: ['#e9dcff', '#c7b0f5', '#9c7fe0'] },
  { id: 'rosa', nome: 'Rosa', cores: ['#ffe0ec', '#ffb6d0', '#f08ab0'] },
  { id: 'menta', nome: 'Menta', cores: ['#dcfff1', '#a8f0d4', '#6fd6b0'] },
  { id: 'mel', nome: 'Mel', cores: ['#fff0c2', '#ffcf70', '#e8a23a'], glicerina: true },
  { id: 'ceu', nome: 'Céu', cores: ['#e0f4ff', '#a9dcff', '#6fbcf0'] },
];
const FERRAMENTAS = [
  { id: 'faca', nome: 'Cortar', icone: 'faca' },
  { id: 'raspar', nome: 'Raspar', icone: 'espatula' },
  { id: 'espuma', nome: 'Espuma', icone: 'bolha' },
  { id: 'apertar', nome: 'Apertar', icone: 'mao' },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/sabonete.css?v=202610231820', import.meta.url));

  const config = { sabonete: 'lavanda', ferramenta: 'faca', ...ler('sabonete-config', {}) };
  const salvar = () => gravar('sabonete-config', config);
  let sabonete = SABONETES.find((s) => s.id === config.sabonete) ?? SABONETES[0];
  const somCorte = criarBanco(audio, [som('manteiga')], { recorte: { intervaloMin: 0.06, duracaoMax: 0.35, sensibilidade: 1.6 } });
  const somEspuma = criarBanco(audio, [som('espuma-mao'), som('espuma')], { recorte: { intervaloMin: 0.08, duracaoMax: 0.45, sensibilidade: 1.6 } });
  let bufferRaspar = null;
  let bufferEspuma = null;
  audio.carregarAmostra(som('faca-raspando')).then((b) => { bufferRaspar = b; });
  audio.carregarAmostra(som('espuma-mao')).then((b) => { bufferEspuma = b; });

  raiz.classList.add('sabao', 'cena-clara');
  raiz.innerHTML = `
    <div class="sabao__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Sabonete. Escolha uma ferramenta e arraste sobre o sabonete. Teclado: 1 a 4 trocam a ferramenta, espaço faz um gesto sorteado, N troca o sabonete.">
      <canvas class="sabao__canvas"></canvas>
    </div>
    <p class="dica-palco" data-dica>Corte, raspe, faça espuma<small>arraste sobre o sabonete</small></p>
    <div class="doca vidro-fosco sabao__doca" role="region" aria-label="Ferramentas do sabonete">
      <div class="doca__linha">
        <span class="doca__rotulo">USAR</span>
        ${FERRAMENTAS.map((f) => `<button type="button" class="chip" data-ferramenta="${f.id}" aria-pressed="${f.id === config.ferramenta}">${icone(f.icone)}<span>${f.nome}</span></button>`).join('')}
      </div>
      <div class="doca__linha">
        <span class="doca__rotulo">SABONETE</span>
        ${SABONETES.map((s) => `<button type="button" class="amostra-tema" data-sabonete="${s.id}" aria-pressed="${s.id === sabonete.id}" aria-label="${s.nome}" title="${s.nome}"
          style="--amostra:radial-gradient(circle at 35% 30%, ${s.cores[0]}, ${s.cores[1]} 55%, ${s.cores[2]});--brilho:${s.cores[2]}"></button>`).join('')}
        <button type="button" class="chip" data-novo>${icone('sabonete')}<span>Novo sabonete</span></button>
      </div>
      ${htmlControlesAsmr(0.8)}
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.sabao__palco');
  const canvas = $('.sabao__canvas');
  const g = canvas.getContext('2d');
  const dica = $('[data-dica]');

  let tela = { l: 1, a: 1, dpr: 1 };
  const barra = { x: 0, y: 0, l: 0, a: 0, r: 0 };
  let camada = null;
  let cs = null;
  let volumeLocal = 0.8;
  const bolhas = [];
  const lascas = [];
  const toque = { ativo: false, x: 0, y: 0, ax: 0, ay: 0, velocidade: 0, segurando: 0 };
  const aperto = { valor: 0, alvo: 0 };
  let lacoRaspar = null;
  let lacoEspuma = null;
  let interagiu = false;
  let tempo = 0;
  let acumulado = 0;

  const controles = ligarControlesAsmr(raiz, { chave: 'sabonete', aoMudarVolume: (v) => { volumeLocal = v; } });

  /* ---------- A barra ---------- */

  const caminhoBarra = () => {
    const p = new Path2D();
    p.roundRect(barra.x, barra.y, barra.l, barra.a, barra.r);
    return p;
  };
  const naBarra = (x, y) => x > barra.x + 4 && x < barra.x + barra.l - 4 && y > barra.y + 4 && y < barra.y + barra.a - 4;

  function desenharSabonete() {
    camada = document.createElement('canvas');
    camada.width = Math.round(tela.l * tela.dpr);
    camada.height = Math.round(tela.a * tela.dpr);
    cs = camada.getContext('2d');
    cs.scale(tela.dpr, tela.dpr);
    const [claro, medio, escuro] = sabonete.cores;
    const forma = caminhoBarra();
    // Lateral (espessura) aparecendo embaixo
    cs.save();
    cs.translate(0, 14);
    cs.fillStyle = escuro;
    cs.fill(forma);
    cs.restore();
    // Topo: degradê suave, mais claro no meio (sabonete é levemente abaulado)
    const topo = cs.createRadialGradient(barra.x + barra.l * 0.4, barra.y + barra.a * 0.35, 10, barra.x + barra.l / 2, barra.y + barra.a / 2, Math.max(barra.l, barra.a) * 0.7);
    topo.addColorStop(0, claro);
    topo.addColorStop(0.65, medio);
    topo.addColorStop(1, escuro);
    cs.fillStyle = topo;
    cs.fill(forma);
    cs.save();
    cs.clip(forma);
    if (sabonete.glicerina) {
      // Glicerina: brilho interno translúcido
      const brilho = cs.createRadialGradient(barra.x + barra.l * 0.3, barra.y + barra.a * 0.3, 0, barra.x + barra.l * 0.3, barra.y + barra.a * 0.3, barra.l * 0.5);
      brilho.addColorStop(0, 'rgba(255,255,255,0.55)');
      brilho.addColorStop(1, 'rgba(255,255,255,0)');
      cs.fillStyle = brilho;
      cs.fillRect(barra.x, barra.y, barra.l, barra.a);
    }
    // Textura macia (sabão tem um fosco bem fino)
    const rnd = geradorComSemente(5);
    for (let i = 0; i < (barra.l * barra.a) / 30; i++) {
      cs.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(80,40,90,0.05)';
      cs.fillRect(barra.x + rnd() * barra.l, barra.y + rnd() * barra.a, 1.4, 1.4);
    }
    // Logo em alto-relevo
    const tamanho = Math.round(barra.a * 0.16);
    cs.font = `${tamanho}px Bungee, sans-serif`;
    cs.textAlign = 'center';
    cs.textBaseline = 'middle';
    cs.fillStyle = 'rgba(255,255,255,0.7)';
    cs.fillText('DOPAMINA', barra.x + barra.l / 2 - 1.5, barra.y + barra.a / 2 - 1.5);
    cs.fillStyle = 'rgba(70,30,90,0.18)';
    cs.fillText('DOPAMINA', barra.x + barra.l / 2 + 1.5, barra.y + barra.a / 2 + 1.5);
    cs.fillStyle = medio;
    cs.fillText('DOPAMINA', barra.x + barra.l / 2, barra.y + barra.a / 2);
    cs.restore();
    // Borda iluminada
    cs.strokeStyle = 'rgba(255,255,255,0.65)';
    cs.lineWidth = 2;
    cs.stroke(forma);
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      barra.l = Math.min(tela.l * 0.7, 640);
      barra.a = Math.min((tela.a - 300) * 0.9, barra.l * 0.58);
      barra.x = (tela.l - barra.l) / 2;
      barra.y = Math.max(120, (tela.a - 180 - barra.a) / 2 + 30);
      barra.r = Math.min(barra.a, barra.l) * 0.18;
      desenharSabonete();
    },
  });

  /* ---------- Ferramentas ---------- */

  let emendaCorte = null;

  function cortar(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 0.5) return;
    const nx = -(y1 - y0) / d;
    const ny = (x1 - x0) / d;
    const emenda = emendaCorte ?? { x: x0, y: y0 };
    const escuro = sabonete.cores[2];
    cs.save();
    cs.clip(caminhoBarra());
    // Linhas translúcidas com ponta reta: pontas redondas se sobrepõem e marcam "contas"
    cs.lineCap = 'butt';
    cs.lineJoin = 'round';
    cs.strokeStyle = 'rgba(60,30,80,0.32)';
    cs.lineWidth = 5;
    cs.beginPath();
    cs.moveTo(x0, y0);
    cs.lineTo(x1, y1);
    cs.stroke();
    cs.strokeStyle = escuro;
    cs.lineWidth = 2;
    cs.lineCap = 'round';
    cs.beginPath();
    cs.moveTo(emenda.x, emenda.y);
    cs.lineTo(x0, y0);
    cs.lineTo(x1, y1);
    cs.stroke();
    cs.strokeStyle = 'rgba(255,255,255,0.8)';
    cs.lineWidth = 1.2;
    cs.lineCap = 'butt';
    cs.beginPath();
    cs.moveTo(x0 - nx * 3, y0 - ny * 3);
    cs.lineTo(x1 - nx * 3, y1 - ny * 3);
    cs.stroke();
    cs.restore();
    emendaCorte = { x: x0, y: y0 };
    acumulado += d;
    if (acumulado > 40) {
      acumulado = 0;
      somCorte.tocar({ volume: 0.9 * volumeLocal, variacaoTom: 0.12 });
    }
  }

  function raspar(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 0.5) return;
    cs.save();
    cs.clip(caminhoBarra());
    cs.lineCap = 'round';
    // Faixa raspada: mais clara e fosca, com risquinhos na direção da raspagem
    cs.strokeStyle = 'rgba(255,255,255,0.22)';
    cs.lineWidth = 26;
    cs.beginPath();
    cs.moveTo(x0, y0);
    cs.lineTo(x1, y1);
    cs.stroke();
    const nx = -(y1 - y0) / d;
    const ny = (x1 - x0) / d;
    for (let k = -3; k <= 3; k++) {
      cs.strokeStyle = k % 2 ? 'rgba(255,255,255,0.3)' : 'rgba(80,40,90,0.08)';
      cs.lineWidth = 1;
      cs.beginPath();
      cs.moveTo(x0 + nx * k * 3.5, y0 + ny * k * 3.5);
      cs.lineTo(x1 + nx * k * 3.5, y1 + ny * k * 3.5);
      cs.stroke();
    }
    cs.restore();
    acumulado += d;
    // A cada tanto, uma lasca se enrola e cai
    if (acumulado > 34) {
      acumulado = 0;
      if (lascas.length > 140) lascas.shift();
      lascas.push({ x: x1, y: y1, vx: (x1 - x0) / d * aleatorio(40, 90) + aleatorio(-20, 20), vy: (y1 - y0) / d * aleatorio(40, 90) + aleatorio(-20, 20), giro: aleatorio(0, TAU), tamanho: aleatorio(7, 13), enrolado: 0, vida: 1, cor: sabonete.cores[1] });
      progresso.registrar('sabonete:lasca');
    }
  }

  function espumar(x, y, quantidade = 3) {
    for (let i = 0; i < quantidade && bolhas.length < MAX_BOLHAS; i++) {
      const r = aleatorio(3, 13) * (Math.random() < 0.1 ? 1.8 : 1);
      bolhas.push({ x: x + aleatorio(-16, 16), y: y + aleatorio(-16, 16), r, alvo: r, crescer: 0, vida: aleatorio(6, 14), fase: aleatorio(0, TAU) });
    }
  }

  function apertar(forca) {
    aperto.alvo = forca;
    if (forca > 0 && Math.random() < 0.3) {
      // Espuma sai pelas laterais
      const lado = Math.random() < 0.5 ? -1 : 1;
      espumar(barra.x + (lado < 0 ? 0 : barra.l), barra.y + barra.a * aleatorio(0.3, 0.7), 2);
    }
  }

  /* ---------- Entrada ---------- */

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  function gesto(x0, y0, x1, y1) {
    const f = config.ferramenta;
    if (f === 'faca' && naBarra(x0, y0) && naBarra(x1, y1)) cortar(x0, y0, x1, y1);
    else if (f === 'raspar' && naBarra(x1, y1)) raspar(x0, y0, x1, y1);
    else if (f === 'espuma') espumar(x1, y1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8) + 1);
    toque.velocidade = Math.min(1, toque.velocidade + Math.hypot(x1 - x0, y1 - y0) / 50);
  }

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    const { x, y } = posicao(e);
    Object.assign(toque, { ativo: true, x, y, ax: x, ay: y, segurando: 0 });
    emendaCorte = null;
    if (!interagiu) {
      interagiu = true;
      dica.classList.add('dica-palco--oculta');
    }
    if (config.ferramenta === 'apertar' && naBarra(x, y)) {
      apertar(1);
      somEspuma.tocar({ volume: volumeLocal, tom: 0.85 });
      progresso.registrar('sabonete:aperto');
    } else if (config.ferramenta === 'espuma') {
      espumar(x, y, 6);
      somEspuma.tocar({ volume: 0.7 * volumeLocal });
    }
  });
  palco.addEventListener('pointermove', (e) => {
    if (!toque.ativo) return;
    for (const ev of eventosCombinados(e)) {
      const { x, y } = posicao(ev);
      gesto(toque.x, toque.y, x, y);
      toque.x = x;
      toque.y = y;
    }
  });
  const soltar = () => {
    if (!toque.ativo) return;
    toque.ativo = false;
    if (config.ferramenta === 'apertar') {
      apertar(0);
      somEspuma.tocar({ volume: 0.6 * volumeLocal, tom: 1.15 });
    }
    if (config.ferramenta === 'faca' && Math.hypot(toque.x - toque.ax, toque.y - toque.ay) > 60) progresso.registrar('sabonete:corte');
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  raiz.addEventListener('keydown', (e) => {
    if (e.target.closest('button, input')) return;
    const tecla = e.key.toLowerCase();
    if (['1', '2', '3', '4'].includes(tecla)) trocarFerramenta(FERRAMENTAS[Number(tecla) - 1].id);
    else if (tecla === 'n') novoSabonete();
    else if (tecla === ' ' || tecla === 'enter') {
      e.preventDefault();
      // Um gesto automático, em passinhos, com a ferramenta atual
      const y = aleatorio(barra.y + 20, barra.y + barra.a - 20);
      let x = barra.x + 10;
      emendaCorte = null;
      if (config.ferramenta === 'apertar') {
        apertar(1);
        setTimeout(() => apertar(0), 500);
        return;
      }
      const passo = () => {
        if (x > barra.x + barra.l - 10) return;
        gesto(x, y, x + 7, y);
        x += 7;
        setTimeout(passo, 16);
      };
      passo();
    }
  });

  function trocarFerramenta(id) {
    config.ferramenta = id;
    salvar();
    raiz.querySelectorAll('[data-ferramenta]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ferramenta === id)));
  }

  function novoSabonete() {
    bolhas.length = 0;
    lascas.length = 0;
    desenharSabonete();
    audio.tocar('whoosh');
  }

  $('.sabao__doca').addEventListener('click', (e) => {
    const ferramenta = e.target.closest('[data-ferramenta]');
    const tipo = e.target.closest('[data-sabonete]');
    if (ferramenta) trocarFerramenta(ferramenta.dataset.ferramenta);
    else if (tipo) {
      sabonete = SABONETES.find((s) => s.id === tipo.dataset.sabonete);
      config.sabonete = sabonete.id;
      salvar();
      raiz.querySelectorAll('[data-sabonete]').forEach((b) => b.setAttribute('aria-pressed', String(b === tipo)));
      novoSabonete();
    } else if (e.target.closest('[data-novo]')) novoSabonete();
  });

  /* ---------- Loop ---------- */

  function desenharBolha(b) {
    const r = b.r * Math.min(1, b.crescer);
    if (r < 0.5) return;
    // Película fina: quase transparente, borda clara e reflexos irisados
    g.fillStyle = 'rgba(255,255,255,0.32)';
    g.beginPath();
    g.arc(b.x, b.y, r, 0, TAU);
    g.fill();
    g.strokeStyle = `hsla(${(b.fase * 60 + tempo * 30) % 360},80%,85%,0.7)`;
    g.lineWidth = Math.max(0.8, r * 0.12);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(b.x - r * 0.35, b.y - r * 0.38, r * 0.22, 0, TAU);
    g.fill();
  }

  function desenharLasca(l) {
    // Cachinho: espiral de sabão enrolando
    g.save();
    g.translate(l.x, l.y);
    g.rotate(l.giro);
    g.strokeStyle = l.cor;
    g.lineWidth = 3.4;
    g.lineCap = 'round';
    g.beginPath();
    const voltas = 0.6 + l.enrolado * 1.4;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const a = t * voltas * TAU;
      const raio = l.tamanho * (1 - t * 0.7);
      if (i) g.lineTo(Math.cos(a) * raio, Math.sin(a) * raio * 0.7);
      else g.moveTo(Math.cos(a) * raio, Math.sin(a) * raio * 0.7);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  const pararLoop = aoQuadro((dt) => {
    if (!camada) return;
    tempo += dt;
    if (toque.ativo) toque.segurando += dt;
    toque.velocidade = Math.max(0, toque.velocidade - dt * 3);

    // Segurando a espuma no lugar: ela vai crescendo
    if (toque.ativo && config.ferramenta === 'espuma' && Math.random() < dt * 30) espumar(toque.x, toque.y, 1);
    if (toque.ativo && config.ferramenta === 'apertar') apertar(1);

    // Sons contínuos
    if (audio.ativo) {
      if (!lacoRaspar && bufferRaspar) lacoRaspar = audio.iniciarLaco(bufferRaspar, { volume: 0 });
      if (!lacoEspuma && bufferEspuma) lacoEspuma = audio.iniciarLaco(bufferEspuma, { volume: 0 });
    }
    const raspando = toque.ativo && config.ferramenta === 'raspar';
    lacoRaspar?.volume(raspando ? (0.2 + toque.velocidade) * volumeLocal : 0, 0.06);
    const espumando = toque.ativo && (config.ferramenta === 'espuma' || config.ferramenta === 'apertar');
    lacoEspuma?.volume(espumando ? (0.3 + toque.velocidade * 0.7) * volumeLocal : 0, 0.1);

    for (const b of bolhas) {
      b.crescer = Math.min(1, b.crescer + dt * 4);
      b.vida -= dt;
      b.y -= dt * 2;
    }
    for (let i = bolhas.length - 1; i >= 0; i--) {
      if (bolhas[i].vida <= 0) {
        // Bolhinhas estouram em silêncio, uma de vez em quando faz "plic"
        if (Math.random() < 0.05) audio.tocar('gota', { tom: aleatorio(2.4, 3.2), volume: 0.2 * volumeLocal, canal: 'asmr', intervaloMin: 0.05 });
        bolhas.splice(i, 1);
      }
    }
    for (const l of lascas) {
      if (l.vida <= 0) continue;
      l.enrolado = Math.min(1, l.enrolado + dt * 2.5);
      l.x += l.vx * dt;
      l.y += l.vy * dt + 30 * dt;
      l.vx *= 0.93;
      l.vy *= 0.93;
      l.giro += dt * 2 * (1 - l.enrolado);
    }
    aperto.valor += (aperto.alvo - aperto.valor) * Math.min(1, dt * 10);

    /* Desenho */
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Azulejos claros do banheiro
    g.fillStyle = '#e6f3f8';
    g.fillRect(0, 0, l, a);
    g.strokeStyle = 'rgba(120,170,190,0.25)';
    g.lineWidth = 2;
    const azulejo = 90;
    g.beginPath();
    for (let x = 0; x <= l; x += azulejo) {
      g.moveTo(x, 0);
      g.lineTo(x, a);
    }
    for (let y = 0; y <= a; y += azulejo) {
      g.moveTo(0, y);
      g.lineTo(l, y);
    }
    g.stroke();
    // Saboneteira
    g.fillStyle = 'rgba(60,90,120,0.15)';
    g.beginPath();
    g.roundRect(barra.x - 44, barra.y - 34, barra.l + 88, barra.a + 84, 46);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(barra.x - 38, barra.y - 30, barra.l + 76, barra.a + 72, 42);
    g.fill();

    // Barra (amassa quando apertada)
    const s = aperto.valor;
    g.save();
    g.translate(barra.x + barra.l / 2, barra.y + barra.a);
    g.scale(1 + s * 0.06, 1 - s * 0.08);
    g.translate(-(barra.x + barra.l / 2), -(barra.y + barra.a));
    g.drawImage(camada, 0, 0, l, a);
    g.restore();

    for (const lasca of lascas) desenharLasca(lasca);
    for (const b of bolhas) desenharBolha(b);
  });

  raiz.style.setProperty('--c1', '#9c7fe0');
  raiz.style.setProperty('--c2', '#6fd6b0');

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      lacoRaspar?.parar();
      lacoEspuma?.parar();
      controles.destruir();
    },
  };
}
