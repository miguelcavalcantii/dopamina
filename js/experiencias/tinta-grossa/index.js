/**
 * Tinta grossa: pingue montinhos de tinta numa tela de linho e espalhe com a espátula.
 * A espátula arrasta a tinta de verdade (borrar: copia um círculo de onde ela estava
 * para onde ela vai) e deixa cristas nas bordas; o pincel deixa marcas de cerdas.
 * "Raspar a tela" limpa tudo com uma espátula grande. Sons gravados (CC0): massa úmida,
 * espátula e pinceladas, no ritmo do movimento.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { criarBanco } from '../../core/amostras.js?v=202610231621';
import { htmlControlesAsmr, ligarControlesAsmr } from '../../core/asmr.js?v=202610231621';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, eventosCombinados, geradorComSemente } from '../../core/util.js?v=202610231621';

const TAU = Math.PI * 2;
const som = (nome) => new URL(`../../../assets/sons/asmr/${nome}.mp3`, import.meta.url);
const CORES = ['#ff2e63', '#ff8a1a', '#ffd60a', '#3ccf6a', '#1fb4ff', '#5b4bff', '#c04bff', '#ffffff', '#1a1430'];
const FERRAMENTAS = [
  { id: 'pingar', nome: 'Pingar', icone: 'gota' },
  { id: 'espatula', nome: 'Espátula', icone: 'espatula' },
  { id: 'pincel', nome: 'Pincel', icone: 'pincel' },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/tinta-grossa.css?v=202610231621', import.meta.url));

  const config = { ferramenta: 'pingar', cor: CORES[0], ...ler('tinta-config', {}) };
  const salvar = () => gravar('tinta-config', config);
  const plop = criarBanco(audio, [som('tinta-massa')], { recorte: { intervaloMin: 0.08, duracaoMax: 0.35, sensibilidade: 1.5 } });
  const raspada = criarBanco(audio, [som('tinta-espatula')], { recorte: { intervaloMin: 0.03, duracaoMax: 0.3, sensibilidade: 2 } });
  let bufferMassa = null;
  let bufferPincel = null;
  audio.carregarAmostra(som('tinta-massa')).then((b) => { bufferMassa = b; });
  audio.carregarAmostra(som('tinta-pincel')).then((b) => { bufferPincel = b; });

  raiz.classList.add('tinta', 'cena-clara');
  raiz.innerHTML = `
    <div class="tinta__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Tinta grossa. Pingar: toque e segure para fazer um montinho de tinta. Espátula: arraste para espalhar. Pincel: arraste para pintar. Teclado: 1 a 3 trocam a ferramenta, C troca a cor, R raspa a tela.">
      <canvas class="tinta__canvas"></canvas>
    </div>
    <p class="dica-palco" data-dica>Pingue tinta e espalhe<small>segure para um montinho maior · depois use a espátula</small></p>
    <div class="doca vidro-fosco tinta__doca" role="region" aria-label="Ferramentas de pintura">
      <div class="doca__linha">
        <span class="doca__rotulo">USAR</span>
        ${FERRAMENTAS.map((f) => `<button type="button" class="chip" data-ferramenta="${f.id}" aria-pressed="${f.id === config.ferramenta}">${icone(f.icone)}<span>${f.nome}</span></button>`).join('')}
        <button type="button" class="chip" data-raspar>${icone('espatula')}<span>Raspar a tela</span></button>
      </div>
      <div class="doca__linha">
        <span class="doca__rotulo">COR</span>
        ${CORES.map((c) => `<button type="button" class="amostra-tema" data-cor="${c}" aria-pressed="${c === config.cor}" aria-label="Cor ${c}" style="--amostra:radial-gradient(circle at 35% 30%, #ffffffaa, ${c} 45%);--brilho:${c}"></button>`).join('')}
      </div>
      ${htmlControlesAsmr(0.8)}
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.tinta__palco');
  const canvas = $('.tinta__canvas');
  const g = canvas.getContext('2d');
  const dica = $('[data-dica]');

  let tela = { l: 1, a: 1, dpr: 1 };
  let linho = null;
  let camada = null;
  let cs = null;
  const mancha = document.createElement('canvas'); // pedaço copiado pela espátula
  const mc = mancha.getContext('2d');
  let volumeLocal = 0.8;
  const toque = { ativo: false, x: 0, y: 0, velocidade: 0, pingo: null, angulo: 0 };
  const limpeza = { ativa: false, x: 0 };
  let lacoMassa = null;
  let lacoPincel = null;
  let interagiu = false;

  const controles = ligarControlesAsmr(raiz, { chave: 'tinta-grossa', aoMudarVolume: (v) => { volumeLocal = v; } });

  /* ---------- Tela de linho ---------- */

  function criarLinho() {
    const { l, a, dpr } = tela;
    linho = document.createElement('canvas');
    linho.width = Math.round(l * dpr);
    linho.height = Math.round(a * dpr);
    const s = linho.getContext('2d');
    s.scale(dpr, dpr);
    s.fillStyle = '#f3ece0';
    s.fillRect(0, 0, l, a);
    // Trama do linho: fios cruzados finíssimos
    const rnd = geradorComSemente(3);
    s.globalAlpha = 0.07;
    for (let y = 0; y < a; y += 3) {
      s.fillStyle = rnd() > 0.5 ? '#8a7a60' : '#ffffff';
      s.fillRect(0, y, l, 1);
    }
    for (let x = 0; x < l; x += 3) {
      s.fillStyle = rnd() > 0.5 ? '#8a7a60' : '#ffffff';
      s.fillRect(x, 0, 1, a);
    }
    s.globalAlpha = 1;
    // Bordas mais escuras (moldura de chassi)
    const sombra = s.createRadialGradient(l / 2, a / 2, Math.min(l, a) * 0.35, l / 2, a / 2, Math.hypot(l, a) * 0.6);
    sombra.addColorStop(0, 'rgba(0,0,0,0)');
    sombra.addColorStop(1, 'rgba(60,40,20,0.22)');
    s.fillStyle = sombra;
    s.fillRect(0, 0, l, a);
  }

  function criarCamada() {
    const antiga = camada;
    camada = document.createElement('canvas');
    camada.width = Math.round(tela.l * tela.dpr);
    camada.height = Math.round(tela.a * tela.dpr);
    cs = camada.getContext('2d');
    if (antiga) cs.drawImage(antiga, 0, 0, camada.width, camada.height);
    cs.scale(tela.dpr, tela.dpr);
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      criarLinho();
      criarCamada();
    },
  });

  /* ---------- Pinceladas e afins ---------- */

  function tom(hex, quanto) {
    const n = parseInt(hex.slice(1), 16);
    const canal = (c) => Math.round(clamp(quanto >= 0 ? c + (255 - c) * quanto : c * (1 + quanto), 0, 255));
    return `rgb(${canal((n >> 16) & 255)},${canal((n >> 8) & 255)},${canal(n & 255)})`;
  }

  /**
   * Montinho de tinta: borda irregular, volume pelo degradê e brilho molhado em cima.
   * (Sem sombra projetada: a espátula a arrastaria e ela escureceria tudo.)
   */
  function desenharPingo(p) {
    const r = p.raio;
    const pontos = 18;
    const caminho = new Path2D();
    for (let i = 0; i <= pontos; i++) {
      const a = (i / pontos) * TAU;
      const raio = r * (0.88 + 0.12 * Math.sin(a * 3 + p.semente) + 0.06 * Math.sin(a * 7 + p.semente * 2));
      const x = p.x + Math.cos(a) * raio;
      const y = p.y + Math.sin(a) * raio;
      if (i) caminho.lineTo(x, y);
      else caminho.moveTo(x, y);
    }
    caminho.closePath();
    const corpo = cs.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    corpo.addColorStop(0, tom(p.cor, 0.35));
    corpo.addColorStop(0.55, p.cor);
    corpo.addColorStop(1, tom(p.cor, -0.3));
    cs.fillStyle = corpo;
    cs.fill(caminho);
    cs.strokeStyle = tom(p.cor, -0.4);
    cs.lineWidth = 1.4;
    cs.stroke(caminho);
    cs.fillStyle = 'rgba(255,255,255,0.7)';
    cs.beginPath();
    cs.ellipse(p.x - r * 0.32, p.y - r * 0.38, r * 0.22, r * 0.12, -0.6, 0, TAU);
    cs.fill();
  }

  /**
   * Espátula: arrasta um círculo de tinta de onde estava para onde vai.
   * A carga diminui ao longo do arrasto: a mancha vai afinando, como tinta de verdade.
   */
  let carga = 1;
  function espatular(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 0.5) return;
    const largura = clamp(Math.min(tela.l, tela.a) * 0.06, 34, 64);
    const passos = Math.ceil(d / 3);
    const lado = Math.ceil(largura * tela.dpr);
    if (mancha.width !== lado) {
      mancha.width = lado;
      mancha.height = lado;
    }
    let px = x0;
    let py = y0;
    for (let i = 1; i <= passos; i++) {
      const x = x0 + ((x1 - x0) * i) / passos;
      const y = y0 + ((y1 - y0) * i) / passos;
      // Copia o círculo de tinta do ponto anterior (com borda suave) e cola adiante
      mc.globalCompositeOperation = 'copy';
      mc.drawImage(camada, (px - largura / 2) * tela.dpr, (py - largura / 2) * tela.dpr, lado, lado, 0, 0, lado, lado);
      mc.globalCompositeOperation = 'destination-in';
      const mascara = mc.createRadialGradient(lado / 2, lado / 2, lado * 0.2, lado / 2, lado / 2, lado / 2);
      mascara.addColorStop(0, `rgba(0,0,0,${0.92 * carga})`);
      mascara.addColorStop(1, 'rgba(0,0,0,0)');
      mc.fillStyle = mascara;
      mc.fillRect(0, 0, lado, lado);
      cs.drawImage(mancha, x - largura / 2, y - largura / 2, largura, largura);
      px = x;
      py = y;
      carga = Math.max(0.25, carga * 0.996);
    }
    // Cristas nas bordas da espátula e um brilho achatado no meio
    const nx = -(y1 - y0) / d;
    const ny = (x1 - x0) / d;
    cs.save();
    cs.lineCap = 'butt';
    cs.globalCompositeOperation = 'source-atop'; // só onde já existe tinta
    for (const [lado2, cor] of [[-1, 'rgba(255,255,255,0.18)'], [1, 'rgba(30,15,10,0.16)']]) {
      cs.strokeStyle = cor;
      cs.lineWidth = 2;
      cs.beginPath();
      cs.moveTo(x0 + nx * largura * 0.45 * lado2, y0 + ny * largura * 0.45 * lado2);
      cs.lineTo(x1 + nx * largura * 0.45 * lado2, y1 + ny * largura * 0.45 * lado2);
      cs.stroke();
    }
    cs.restore();
    toque.velocidade = Math.min(1, toque.velocidade + d / 40);
    if (Math.random() < d / 400) raspada.tocar({ volume: 0.5 * volumeLocal, variacaoTom: 0.15 });
  }

  /** Pincel: cerdas paralelas com pequenas variações de cor (sorteadas a cada pincelada). */
  let cerdas = 0;
  function pincelar(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 0.5) return;
    const nx = -(y1 - y0) / d;
    const ny = (x1 - x0) / d;
    cs.save();
    cs.lineCap = 'butt';
    for (let k = -6; k <= 6; k++) {
      const variacao = Math.sin(k * 12.9898 + cerdas) * 0.12;
      cs.strokeStyle = tom(config.cor, variacao);
      // Cada cerda com espessura e transparência próprias: aparecem os riscos do pincel
      cs.globalAlpha = 0.55 + Math.abs(Math.sin(k * 5.3 + cerdas)) * 0.4;
      cs.lineWidth = 1.1 + Math.abs(Math.sin(k * 3.7 + cerdas)) * 0.9;
      cs.beginPath();
      cs.moveTo(x0 + nx * k * 2.3, y0 + ny * k * 2.3);
      cs.lineTo(x1 + nx * k * 2.3, y1 + ny * k * 2.3);
      cs.stroke();
    }
    cs.globalAlpha = 0.25;
    cs.strokeStyle = '#ffffff';
    cs.lineWidth = 1;
    cs.beginPath();
    cs.moveTo(x0 - nx * 5, y0 - ny * 5);
    cs.lineTo(x1 - nx * 5, y1 - ny * 5);
    cs.stroke();
    cs.restore();
    toque.velocidade = Math.min(1, toque.velocidade + d / 50);
  }

  /* ---------- Entrada ---------- */

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };
  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || limpeza.ativa) return;
    capturarPonteiro(palco, e.pointerId);
    const { x, y } = posicao(e);
    Object.assign(toque, { ativo: true, x, y });
    carga = 1;
    cerdas = aleatorio(0, 100);
    if (!interagiu) {
      interagiu = true;
      dica.classList.add('dica-palco--oculta');
    }
    if (config.ferramenta === 'pingar') {
      toque.pingo = { x, y, raio: 10, cor: config.cor, semente: aleatorio(0, 10) };
      desenharPingo(toque.pingo);
      plop.tocar({ volume: 0.9 * volumeLocal, tom: aleatorio(0.9, 1.1) });
      progresso.registrar('tinta:pingo', 1, config.cor);
    }
  });
  palco.addEventListener('pointermove', (e) => {
    if (!toque.ativo) return;
    for (const ev of eventosCombinados(e)) {
      const { x, y } = posicao(ev);
      if (config.ferramenta === 'espatula') espatular(toque.x, toque.y, x, y);
      else if (config.ferramenta === 'pincel') pincelar(toque.x, toque.y, x, y);
      else if (toque.pingo && Math.hypot(x - toque.pingo.x, y - toque.pingo.y) > toque.pingo.raio) {
        // Arrastando no modo pingar: vai deixando pinguinhos pelo caminho
        toque.pingo = { x, y, raio: 8, cor: config.cor, semente: aleatorio(0, 10) };
        desenharPingo(toque.pingo);
      }
      if (Math.hypot(x - toque.x, y - toque.y) > 0.5) toque.angulo = Math.atan2(y - toque.y, x - toque.x);
      toque.x = x;
      toque.y = y;
    }
  });
  const soltar = () => {
    if (!toque.ativo) return;
    toque.ativo = false;
    if (config.ferramenta !== 'pingar') progresso.registrar(config.ferramenta === 'espatula' ? 'tinta:espatulada' : 'tinta:pincelada');
    toque.pingo = null;
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  function trocarFerramenta(id) {
    config.ferramenta = id;
    salvar();
    raiz.querySelectorAll('[data-ferramenta]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ferramenta === id)));
  }
  function trocarCor(cor) {
    config.cor = cor;
    salvar();
    raiz.querySelectorAll('[data-cor]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cor === cor)));
  }
  function rasparTela() {
    if (limpeza.ativa) return;
    limpeza.ativa = true;
    limpeza.x = -60;
    for (let i = 0; i < 6; i++) setTimeout(() => raspada.tocar({ volume: 0.9 * volumeLocal, tom: aleatorio(0.8, 1) }), i * 110);
    progresso.registrar('tinta:raspar');
  }

  raiz.addEventListener('keydown', (e) => {
    if (e.target.closest('button, input')) return;
    const tecla = e.key.toLowerCase();
    if (['1', '2', '3'].includes(tecla)) trocarFerramenta(FERRAMENTAS[Number(tecla) - 1].id);
    else if (tecla === 'c') trocarCor(CORES[(CORES.indexOf(config.cor) + 1) % CORES.length]);
    else if (tecla === 'r') rasparTela();
    else if (tecla === ' ' || tecla === 'enter') {
      e.preventDefault();
      const x = aleatorio(tela.l * 0.2, tela.l * 0.8);
      const y = aleatorio(tela.a * 0.25, tela.a * 0.65);
      desenharPingo({ x, y, raio: aleatorio(18, 34), cor: config.cor, semente: aleatorio(0, 10) });
      plop.tocar({ volume: 0.9 * volumeLocal });
    }
  });

  $('.tinta__doca').addEventListener('click', (e) => {
    const ferramenta = e.target.closest('[data-ferramenta]');
    const cor = e.target.closest('[data-cor]');
    if (ferramenta) trocarFerramenta(ferramenta.dataset.ferramenta);
    else if (cor) trocarCor(cor.dataset.cor);
    else if (e.target.closest('[data-raspar]')) rasparTela();
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (!camada) return;
    // Segurando no modo pingar: o montinho cresce
    if (toque.ativo && toque.pingo && toque.pingo.raio < 46) {
      toque.pingo.raio += dt * 26;
      desenharPingo(toque.pingo);
    }
    toque.velocidade = Math.max(0, toque.velocidade - dt * 3);

    if (audio.ativo) {
      if (!lacoMassa && bufferMassa) lacoMassa = audio.iniciarLaco(bufferMassa, { volume: 0 });
      if (!lacoPincel && bufferPincel) lacoPincel = audio.iniciarLaco(bufferPincel, { volume: 0 });
    }
    const espatulando = toque.ativo && config.ferramenta === 'espatula';
    const pincelando = toque.ativo && config.ferramenta === 'pincel';
    lacoMassa?.volume(espatulando ? toque.velocidade * 1.1 * volumeLocal : 0, 0.07);
    lacoPincel?.volume(pincelando ? toque.velocidade * 0.9 * volumeLocal : 0, 0.07);

    if (limpeza.ativa) {
      limpeza.x += dt * tela.l * 0.9;
      cs.save();
      cs.globalCompositeOperation = 'destination-out';
      cs.fillRect(0, 0, Math.max(0, limpeza.x), tela.a);
      cs.restore();
      if (limpeza.x > tela.l + 60) limpeza.ativa = false;
    }

    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(linho, 0, 0, l, a);
    g.drawImage(camada, 0, 0, l, a);

    if (limpeza.ativa) {
      // A espátula grande passando
      const grad = g.createLinearGradient(limpeza.x - 20, 0, limpeza.x + 20, 0);
      grad.addColorStop(0, '#c9cfdc');
      grad.addColorStop(0.5, '#ffffff');
      grad.addColorStop(1, '#8a93a8');
      g.fillStyle = grad;
      g.fillRect(limpeza.x - 16, 0, 32, a);
    }
    // Ferramenta seguindo o dedo
    if (toque.ativo && config.ferramenta === 'espatula') {
      g.save();
      g.translate(toque.x, toque.y);
      g.rotate(toque.angulo + Math.PI / 2);
      const lamina = g.createLinearGradient(-26, 0, 26, 0);
      lamina.addColorStop(0, 'rgba(200,206,220,0.9)');
      lamina.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      lamina.addColorStop(1, 'rgba(140,148,166,0.9)');
      g.fillStyle = lamina;
      g.beginPath();
      g.moveTo(-26, -4);
      g.lineTo(26, -4);
      g.lineTo(18, 14);
      g.lineTo(-18, 14);
      g.closePath();
      g.fill();
      g.fillStyle = '#8a5a3a';
      g.fillRect(-4, 14, 8, 40);
      g.restore();
    }
  });

  raiz.style.setProperty('--c1', '#ff2e63');
  raiz.style.setProperty('--c2', '#1fb4ff');

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      lacoMassa?.parar();
      lacoPincel?.parar();
      controles.destruir();
    },
  };
}
