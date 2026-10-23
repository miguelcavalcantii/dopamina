/**
 * Fidget Spinner: gire arrastando. Agarre o spinner para segurá-lo e solte com
 * impulso, ou passe o dedo por fora dele como num peteleco. Física de inércia com
 * atrito de rolamento (constante + viscoso), contador de RPM e recorde.
 * Desenho: o corpo é pré-desenhado num sprite; em alta velocidade, várias cópias
 * giradas fazem o desfoque de movimento. O reflexo do metal fica parado no mundo
 * (como num metal de verdade) e, rápido, as pontas deixam um rastro de luz.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js';
import { icone } from '../../core/icones.js';
import { ler, gravar } from '../../core/armazenamento.js';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, eventosCombinados, movimentoReduzido } from '../../core/util.js';

const TAU = Math.PI * 2;
const OMEGA_MAX = 270; // rad/s ≈ 2.580 RPM
const ATRITO_FIXO = 0.22; // rad/s²
const ATRITO_VISCOSO = 0.011; // 1/s
const SOM_GIRO = new URL('../../../assets/sons/fidget/spinner.mp3', import.meta.url);
const SOM_CLIQUE = new URL('../../../assets/sons/fidget/toggle.mp3', import.meta.url);

const MODELOS = [
  { id: 'tri', nome: 'Tri', bracos: 3, distancia: 0.62, raioPonta: 0.31, raioCentro: 0.36 },
  { id: 'duo', nome: 'Duplo', bracos: 2, distancia: 0.66, raioPonta: 0.33, raioCentro: 0.34 },
  { id: 'hexa', nome: 'Hexa', bracos: 6, distancia: 0.68, raioPonta: 0.2, raioCentro: 0.42 },
  { id: 'anel', nome: 'Anel', bracos: 3, distancia: 0.74, raioPonta: 0.22, raioCentro: 0.32, anel: true },
];

/** base: [claro, médio, escuro] do corpo; rastro: cor da luz nas pontas. */
const MATERIAIS = [
  { id: 'cromo', nome: 'Cromado', base: ['#f4f7ff', '#9aa6bd', '#3c465c'], metal: 1, rastro: '#bfe4ff' },
  { id: 'arco', nome: 'Arco-íris', arcoIris: true, base: ['#ffffff', '#8b5cff', '#1d1440'], metal: 0.85, rastro: '#ff5dc8' },
  { id: 'neon', nome: 'Neon', base: ['#c8fff0', '#22e4ff', '#08304a'], metal: 0.3, neon: '#22e4ff', rastro: '#22e4ff' },
  { id: 'ouro', nome: 'Ouro', base: ['#fff3c4', '#e0a92e', '#6b4210'], metal: 1, rastro: '#ffd60a' },
  { id: 'obsidiana', nome: 'Obsidiana', base: ['#6a6a7a', '#25252e', '#08080c'], metal: 0.6, rastro: '#ff7a18' },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/fidget-spinner.css', import.meta.url));

  const config = { modelo: 'tri', material: 'cromo', rastro: true, ...ler('spinner-config', {}) };
  const salvar = () => gravar('spinner-config', config);
  let modelo = MODELOS.find((m) => m.id === config.modelo) ?? MODELOS[0];
  let material = MATERIAIS.find((m) => m.id === config.material) ?? MATERIAIS[0];

  raiz.classList.add('spinner');
  raiz.innerHTML = `
    <div class="spinner__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Fidget spinner. Arraste para girar, segure para frear. Teclado: espaço dá um peteleco, setas giram, M troca o modelo, C troca a cor.">
      <canvas class="spinner__canvas"></canvas>
    </div>
    <div class="spinner__painel" aria-live="off">
      <span class="spinner__rpm" data-rpm>0</span>
      <span class="spinner__rotulo">RPM</span>
      <div class="spinner__medidor" aria-hidden="true"><span data-medidor></span></div>
      <div class="spinner__dados">
        <span><strong data-voltas>0</strong> voltas</span>
        <span>${icone('trofeu')}<strong data-recorde>0</strong> RPM</span>
      </div>
    </div>
    <p class="dica-palco" data-dica>Arraste para girar<small>segure para frear · passe o dedo por fora para um peteleco</small></p>
    <div class="doca vidro-fosco spinner__doca" role="region" aria-label="Opções do spinner">
      <div class="doca__linha">
        <span class="doca__rotulo">MODELO</span>
        ${MODELOS.map((m) => `<button type="button" class="chip" data-modelo="${m.id}" aria-pressed="${m.id === modelo.id}">${m.nome}</button>`).join('')}
        <button type="button" class="chip" data-rastro aria-pressed="${config.rastro}">${icone('brilho')}<span>Rastro de luz</span></button>
      </div>
      <div class="doca__linha">
        <span class="doca__rotulo">COR</span>
        ${MATERIAIS.map((m) => `<button type="button" class="amostra-tema" data-material="${m.id}" aria-pressed="${m.id === material.id}" aria-label="${m.nome}" title="${m.nome}"
          style="--amostra:${m.arcoIris ? 'conic-gradient(#ff2e97,#ffd60a,#3cffb4,#22e4ff,#8b5cff,#ff2e97)' : `radial-gradient(circle at 35% 30%, ${m.base[0]}, ${m.base[1]} 50%, ${m.base[2]})`};--brilho:${m.rastro}"></button>`).join('')}
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.spinner__palco');
  const canvas = $('.spinner__canvas');
  const g = canvas.getContext('2d');
  const dica = $('[data-dica]');

  let tela = { l: 1, a: 1, dpr: 1 };
  let raio = 150;
  let centro = { x: 0, y: 0 };
  let sprite = null;
  let buffer = null;

  const fisica = { angulo: 0, omega: 0, voltas: 0, anguloAcumulado: 0 };
  let rpmMostrado = 0;
  let recordeSessao = 0;
  let tempo = 0;
  let interagiu = false;

  /* ---------- Som: gravação em laço + zumbido do rolamento ---------- */

  let laco = null;
  let zumbido = null;
  let bufferGiro = null;
  let bufferClique = null;
  audio.carregarAmostra(SOM_GIRO).then((b) => { bufferGiro = b; });
  audio.carregarAmostra(SOM_CLIQUE).then((b) => { bufferClique = b; });

  function garantirSom() {
    if (!audio.ativo) return;
    if (!laco && bufferGiro) laco = audio.iniciarLaco(bufferGiro, { volume: 0, canal: 'efeitos', filtro: { tipo: 'lowpass', freq: 3000 } });
    zumbido ??= audio.iniciarTom({ tipo: 'triangle', freq: 60, filtro: 900 });
  }

  function atualizarSom() {
    const v = clamp(Math.abs(fisica.omega) / OMEGA_MAX, 0, 1);
    if (laco) {
      laco.volume(v < 0.01 ? 0 : 0.25 + Math.sqrt(v) * 0.9, 0.12);
      laco.tom(0.55 + v * 1.25);
      laco.filtro(1200 + v * 7000);
    }
    if (zumbido) {
      // Frequência de passagem das pontas: voltas por segundo × braços
      const hz = (Math.abs(fisica.omega) / TAU) * modelo.bracos;
      zumbido.freq(clamp(hz, 20, 900));
      zumbido.volume(hz > 25 ? Math.min(0.05, v * 0.08) : 0, 0.15);
    }
  }

  function clique(volume = 0.7, tom = 1) {
    if (bufferClique) audio.tocarAmostra(bufferClique, { volume, tom: tom * aleatorio(0.92, 1.08), canal: 'efeitos' });
    else audio.tocar('tique', { tom });
  }

  /* ---------- Desenho do spinner (sprite em coordenadas locais) ---------- */

  function caminhoCorpo(r) {
    const caminho = new Path2D();
    const circulo = (x, y, raioCirculo) => {
      caminho.moveTo(x + raioCirculo, y);
      caminho.arc(x, y, raioCirculo, 0, TAU);
    };
    circulo(0, 0, modelo.raioCentro * r);
    for (let i = 0; i < modelo.bracos; i++) {
      const ang = (i / modelo.bracos) * TAU - Math.PI / 2;
      const x = Math.cos(ang) * modelo.distancia * r;
      const y = Math.sin(ang) * modelo.distancia * r;
      circulo(x, y, modelo.raioPonta * r);
      // Braço: retângulo arredondado entre o centro e a ponta
      const largura = (modelo.bracos > 3 ? 0.16 : 0.3) * r;
      const nx = -Math.sin(ang) * largura / 2;
      const ny = Math.cos(ang) * largura / 2;
      // Mesmo sentido dos arcos: com sentidos opostos, as sobreposições virariam buracos
      caminho.moveTo(nx, ny);
      caminho.lineTo(-nx, -ny);
      caminho.lineTo(x - nx, y - ny);
      caminho.lineTo(x + nx, y + ny);
      caminho.closePath();
    }
    // O anel é uma forma à parte (preenchida em par-ímpar), senão o furo apagaria os braços
    let anel = null;
    if (modelo.anel) {
      anel = new Path2D();
      anel.arc(0, 0, (modelo.distancia + 0.12) * r, 0, TAU);
      anel.moveTo((modelo.distancia - 0.1) * r, 0);
      anel.arc(0, 0, (modelo.distancia - 0.1) * r, 0, TAU);
    }
    return { caminho, anel };
  }

  function desenharRolamento(c, x, y, rr, giro) {
    // Pista externa
    const pista = c.createRadialGradient(x - rr * 0.3, y - rr * 0.3, rr * 0.1, x, y, rr);
    pista.addColorStop(0, '#ffffff');
    pista.addColorStop(0.5, '#b9c2d3');
    pista.addColorStop(1, '#4a5368');
    c.fillStyle = pista;
    c.beginPath();
    c.arc(x, y, rr, 0, TAU);
    c.fill();
    c.fillStyle = '#20242e';
    c.beginPath();
    c.arc(x, y, rr * 0.8, 0, TAU);
    c.fill();
    // Esferas
    const n = 8;
    for (let i = 0; i < n; i++) {
      const ang = giro + (i / n) * TAU;
      const bx = x + Math.cos(ang) * rr * 0.62;
      const by = y + Math.sin(ang) * rr * 0.62;
      const esfera = c.createRadialGradient(bx - rr * 0.06, by - rr * 0.06, 0, bx, by, rr * 0.16);
      esfera.addColorStop(0, '#ffffff');
      esfera.addColorStop(0.5, '#c7cfdc');
      esfera.addColorStop(1, '#4b5162');
      c.fillStyle = esfera;
      c.beginPath();
      c.arc(bx, by, rr * 0.15, 0, TAU);
      c.fill();
    }
    // Pista interna
    const interna = c.createRadialGradient(x - rr * 0.1, y - rr * 0.1, 0, x, y, rr * 0.45);
    interna.addColorStop(0, '#f2f5fb');
    interna.addColorStop(1, '#69738a');
    c.fillStyle = interna;
    c.beginPath();
    c.arc(x, y, rr * 0.42, 0, TAU);
    c.fill();
    c.fillStyle = '#2a2f3a';
    c.beginPath();
    c.arc(x, y, rr * 0.22, 0, TAU);
    c.fill();
  }

  function criarSprite() {
    const r = raio;
    const lado = Math.ceil(r * 2.3);
    const c = document.createElement('canvas');
    c.width = Math.ceil(lado * tela.dpr);
    c.height = c.width;
    const s = c.getContext('2d');
    s.scale(tela.dpr, tela.dpr);
    s.translate(lado / 2, lado / 2);
    const { caminho: corpo, anel } = caminhoCorpo(r);
    const [claro, medio, escuro] = material.base;

    // Silhueta (corpo + anel) e, por cima dela, o degradê e o anodizado arco-íris
    s.save();
    s.fillStyle = '#000';
    s.fill(corpo);
    if (anel) s.fill(anel, 'evenodd');
    s.globalCompositeOperation = 'source-in';
    const base = s.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r * 1.05);
    base.addColorStop(0, claro);
    base.addColorStop(0.45, medio);
    base.addColorStop(1, escuro);
    s.fillStyle = base;
    s.fillRect(-lado, -lado, lado * 2, lado * 2);
    if (material.arcoIris) {
      // O degradê é recortado na silhueta antes do 'overlay' (senão pintaria o fundo transparente)
      const mascara = document.createElement('canvas');
      mascara.width = c.width;
      mascara.height = c.height;
      const m = mascara.getContext('2d');
      m.drawImage(c, 0, 0);
      m.globalCompositeOperation = 'source-in';
      m.setTransform(tela.dpr, 0, 0, tela.dpr, 0, 0);
      m.translate(lado / 2, lado / 2);
      const arco = m.createConicGradient(0, 0, 0);
      ['#ff2e97', '#ffd60a', '#3cffb4', '#22e4ff', '#8b5cff', '#ff2e97'].forEach((cor, i) => arco.addColorStop(i / 5, cor));
      m.fillStyle = arco;
      m.fillRect(-lado, -lado, lado * 2, lado * 2);
      s.save();
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.globalCompositeOperation = 'overlay';
      s.drawImage(mascara, 0, 0);
      s.restore();
    }
    // Escovado: anéis concêntricos finíssimos
    s.globalCompositeOperation = 'source-atop';
    s.globalAlpha = 0.08 * material.metal;
    s.strokeStyle = '#ffffff';
    s.lineWidth = 0.6;
    for (let rr = 4; rr < r; rr += 2.2) {
      s.beginPath();
      s.arc(0, 0, rr, 0, TAU);
      s.stroke();
    }
    s.globalAlpha = 1;
    s.restore();

    // Chanfro só na borda externa: cópias da silhueta deslocadas, por baixo do corpo
    // (contornar cada forma marcaria também as emendas internas entre braço, anel e pontas)
    const tingida = (cor) => {
      const t = document.createElement('canvas');
      t.width = c.width;
      t.height = c.height;
      const tc = t.getContext('2d');
      tc.drawImage(c, 0, 0);
      tc.globalCompositeOperation = 'source-in';
      tc.fillStyle = cor;
      tc.fillRect(0, 0, t.width, t.height);
      return t;
    };
    const luz = tingida('rgba(255,255,255,0.7)');
    const sombraBorda = tingida('rgba(0,0,0,0.6)');
    const brilhoNeon = material.neon ? tingida(material.neon) : null;
    const desloca = Math.max(1.2, r * 0.012) * tela.dpr;
    s.save();
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'destination-over';
    s.drawImage(luz, -desloca, -desloca);
    s.drawImage(sombraBorda, desloca, desloca);
    if (brilhoNeon) {
      s.shadowColor = material.neon;
      s.shadowBlur = r * 0.1 * tela.dpr;
      s.drawImage(brilhoNeon, 0, 0);
      s.drawImage(brilhoNeon, 0, 0);
    }
    s.restore();

    // Pesos/rolamentos nas pontas
    for (let i = 0; i < modelo.bracos; i++) {
      const ang = (i / modelo.bracos) * TAU - Math.PI / 2;
      const x = Math.cos(ang) * modelo.distancia * r;
      const y = Math.sin(ang) * modelo.distancia * r;
      desenharRolamento(s, x, y, modelo.raioPonta * r * 0.72, i * 0.7);
    }
    // Tampa central com ranhuras para os dedos
    const rc = modelo.raioCentro * r * 0.72;
    const tampa = s.createRadialGradient(-rc * 0.35, -rc * 0.4, rc * 0.05, 0, 0, rc);
    tampa.addColorStop(0, claro);
    tampa.addColorStop(0.6, medio);
    tampa.addColorStop(1, escuro);
    s.fillStyle = tampa;
    s.shadowColor = 'rgba(0,0,0,0.5)';
    s.shadowBlur = rc * 0.3;
    s.beginPath();
    s.arc(0, 0, rc, 0, TAU);
    s.fill();
    s.shadowBlur = 0;
    s.strokeStyle = 'rgba(0,0,0,0.25)';
    s.lineWidth = 1;
    for (let k = 0.35; k < 1; k += 0.18) {
      s.beginPath();
      s.arc(0, 0, rc * k, 0, TAU);
      s.stroke();
    }
    s.fillStyle = 'rgba(255,255,255,0.75)';
    s.beginPath();
    s.ellipse(-rc * 0.38, -rc * 0.42, rc * 0.28, rc * 0.12, -0.7, 0, TAU);
    s.fill();

    sprite = { canvas: c, lado };
    buffer = document.createElement('canvas');
    buffer.width = c.width;
    buffer.height = c.height;
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      raio = Math.min(tela.l * 0.4, (tela.a - 260) * 0.48, 260);
      raio = Math.max(90, raio);
      centro = { x: tela.l / 2, y: (tela.a - 120) / 2 + 40 };
      criarSprite();
    },
  });

  /* ---------- Entrada: agarrar, soltar e peteleco ---------- */

  const toque = { ativo: false, agarrou: false, id: 0, ultimoAngulo: 0, amostras: [] };
  const anguloPonteiro = (x, y) => Math.atan2(y - centro.y, x - centro.x);
  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };
  const diferencaAngulo = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  };

  function primeiraInteracao() {
    garantirSom();
    if (interagiu) return;
    interagiu = true;
    dica.classList.add('dica-palco--oculta');
  }

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || toque.ativo) return;
    capturarPonteiro(palco, e.pointerId);
    primeiraInteracao();
    const { x, y } = posicao(e);
    const distancia = Math.hypot(x - centro.x, y - centro.y);
    toque.ativo = true;
    toque.id = e.pointerId;
    toque.agarrou = distancia < raio * 0.98;
    toque.ultimoAngulo = anguloPonteiro(x, y);
    toque.amostras = [{ t: performance.now(), angulo: fisica.anguloAcumulado }];
    toque.anterior = { x, y };
    if (toque.agarrou) {
      // Segurar é frear: o spinner para na mão
      clique(Math.abs(fisica.omega) > 20 ? 0.9 : 0.5, 0.9);
      fisica.omega = 0;
    }
  });

  palco.addEventListener('pointermove', (e) => {
    if (!toque.ativo || e.pointerId !== toque.id) return;
    for (const ev of eventosCombinados(e)) {
      const { x, y } = posicao(ev);
      if (toque.agarrou) {
        // Segurando: o spinner acompanha o dedo
        const angulo = anguloPonteiro(x, y);
        const delta = diferencaAngulo(angulo, toque.ultimoAngulo);
        toque.ultimoAngulo = angulo;
        girar(delta);
        fisica.omega = 0;
      } else {
        // Peteleco por fora: a componente tangencial do movimento vira torque
        const rx = toque.anterior.x - centro.x;
        const ry = toque.anterior.y - centro.y;
        const dx = x - toque.anterior.x;
        const dy = y - toque.anterior.y;
        const r2 = Math.max(rx * rx + ry * ry, (raio * 0.8) ** 2);
        const deltaAngulo = (rx * dy - ry * dx) / r2;
        fisica.omega = clamp(fisica.omega + deltaAngulo * 34, -OMEGA_MAX, OMEGA_MAX);
      }
      toque.anterior = { x, y };
    }
    const agora = performance.now();
    toque.amostras.push({ t: agora, angulo: fisica.anguloAcumulado });
    while (toque.amostras.length > 2 && agora - toque.amostras[0].t > 90) toque.amostras.shift();
  });

  function soltar(e) {
    if (!toque.ativo || e.pointerId !== toque.id) return;
    toque.ativo = false;
    if (!toque.agarrou) return;
    // Velocidade de saída: média do giro nos últimos ~90 ms
    const [primeira] = toque.amostras;
    const ultima = toque.amostras[toque.amostras.length - 1];
    const dt = (ultima.t - primeira.t) / 1000;
    if (dt > 0.008 && performance.now() - ultima.t < 80) {
      fisica.omega = clamp(((ultima.angulo - primeira.angulo) / dt) * 1.15, -OMEGA_MAX, OMEGA_MAX);
    }
  }
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  function girar(delta) {
    fisica.angulo += delta;
    fisica.anguloAcumulado += delta;
    const voltas = Math.floor(Math.abs(fisica.anguloAcumulado) / TAU);
    if (voltas > fisica.voltas) {
      progresso.registrar('spinner:volta', voltas - fisica.voltas);
      fisica.voltas = voltas;
    }
  }

  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button')) return;
    const tecla = e.key.toLowerCase();
    if (tecla === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      primeiraInteracao();
      const sentido = e.key === 'ArrowLeft' ? -1 : 1;
      fisica.omega = clamp(fisica.omega + sentido * (tecla === ' ' ? 45 : 18), -OMEGA_MAX, OMEGA_MAX);
      clique(0.5, 1.1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      fisica.omega *= 0.6;
    } else if (tecla === 'm') {
      trocarModelo(MODELOS[(MODELOS.indexOf(modelo) + 1) % MODELOS.length].id);
    } else if (tecla === 'c') {
      trocarMaterial(MATERIAIS[(MATERIAIS.indexOf(material) + 1) % MATERIAIS.length].id);
    }
  });

  /* ---------- Opções ---------- */

  function trocarModelo(id) {
    modelo = MODELOS.find((m) => m.id === id);
    config.modelo = id;
    salvar();
    for (const b of raiz.querySelectorAll('[data-modelo]')) b.setAttribute('aria-pressed', String(b.dataset.modelo === id));
    criarSprite();
    clique(0.8, 0.8);
  }

  function trocarMaterial(id) {
    material = MATERIAIS.find((m) => m.id === id);
    config.material = id;
    salvar();
    for (const b of raiz.querySelectorAll('[data-material]')) b.setAttribute('aria-pressed', String(b.dataset.material === id));
    raiz.style.setProperty('--c1', material.rastro);
    criarSprite();
    audio.tocar('tema');
  }

  raiz.querySelector('.spinner__doca').addEventListener('click', (e) => {
    const botaoModelo = e.target.closest('[data-modelo]');
    if (botaoModelo) return trocarModelo(botaoModelo.dataset.modelo);
    const botaoMaterial = e.target.closest('[data-material]');
    if (botaoMaterial) return trocarMaterial(botaoMaterial.dataset.material);
    const botaoRastro = e.target.closest('[data-rastro]');
    if (botaoRastro) {
      config.rastro = !config.rastro;
      botaoRastro.setAttribute('aria-pressed', String(config.rastro));
      salvar();
    }
    return undefined;
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (!sprite) return;
    tempo += dt;
    const anguloAntes = fisica.angulo;

    if (!(toque.ativo && toque.agarrou)) {
      const w = fisica.omega;
      const desaceleracao = (ATRITO_FIXO + ATRITO_VISCOSO * Math.abs(w)) * dt;
      fisica.omega = Math.abs(w) <= desaceleracao ? 0 : w - Math.sign(w) * desaceleracao;
      girar(fisica.omega * dt);
    }
    const deltaQuadro = fisica.angulo - anguloAntes;
    const omegaVisivel = toque.ativo && toque.agarrou ? deltaQuadro / Math.max(dt, 0.001) : fisica.omega;
    const rpm = Math.abs(omegaVisivel) * 60 / TAU;

    // Painel: número com inércia para não tremer
    rpmMostrado += (rpm - rpmMostrado) * Math.min(1, dt * 8);
    if (Math.round(rpm) > recordeSessao && !toque.agarrou) {
      recordeSessao = Math.round(rpm);
      if (progresso.definirRecorde('fidget-spinner', 'rpm', recordeSessao) && recordeSessao > 300) {
        raiz.querySelector('.spinner__painel').classList.add('spinner__painel--recorde');
      }
    }
    atualizarPainel();
    atualizarSom();

    // Desenho
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fundo = g.createRadialGradient(centro.x, centro.y, raio * 0.2, centro.x, centro.y, Math.hypot(l, a) * 0.7);
    fundo.addColorStop(0, '#1d1638');
    fundo.addColorStop(1, '#07060f');
    g.fillStyle = fundo;
    g.fillRect(0, 0, l, a);

    // Sombra no "chão"
    const sombra = g.createRadialGradient(centro.x + raio * 0.08, centro.y + raio * 0.12, raio * 0.2, centro.x + raio * 0.08, centro.y + raio * 0.12, raio * 1.15);
    sombra.addColorStop(0, 'rgba(0,0,0,0.55)');
    sombra.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sombra;
    g.fillRect(centro.x - raio * 1.5, centro.y - raio * 1.5, raio * 3, raio * 3);

    // Rastro de luz nas pontas (só rápido)
    const velocidade01 = clamp(Math.abs(omegaVisivel) / OMEGA_MAX, 0, 1);
    if (config.rastro && velocidade01 > 0.12 && !movimentoReduzido()) {
      const comprimento = Math.min(TAU * 0.9, 0.3 + velocidade01 * 4);
      const sentido = Math.sign(omegaVisivel) || 1;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (let i = 0; i < modelo.bracos; i++) {
        const ang = fisica.angulo + (i / modelo.bracos) * TAU - Math.PI / 2;
        const rr = modelo.distancia * raio;
        const passos = 18;
        for (let k = 0; k < passos; k++) {
          const t0 = k / passos;
          const a0 = ang - sentido * comprimento * t0;
          const a1 = ang - sentido * comprimento * (t0 + 1 / passos);
          g.strokeStyle = material.rastro;
          g.globalAlpha = (1 - t0) * 0.55 * (velocidade01 + 0.2);
          g.lineWidth = modelo.raioPonta * raio * (1.3 - t0) * 0.9;
          g.beginPath();
          g.arc(centro.x, centro.y, rr, Math.min(a0, a1), Math.max(a0, a1));
          g.stroke();
        }
      }
      g.restore();
    }

    // Corpo com desfoque de movimento: média de cópias giradas entre o quadro anterior e o atual
    const b = buffer.getContext('2d');
    const meio = sprite.lado / 2;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, buffer.width, buffer.height);
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    const copias = movimentoReduzido() ? 1 : clamp(Math.ceil(Math.abs(deltaQuadro) / 0.05), 1, 18);
    for (let k = 0; k < copias; k++) {
      const angulo = fisica.angulo - deltaQuadro * (k / copias);
      b.globalAlpha = 1 / (k + 1);
      b.save();
      b.translate(meio, meio);
      b.rotate(angulo);
      b.drawImage(sprite.canvas, -meio, -meio, sprite.lado, sprite.lado);
      b.restore();
    }
    b.globalAlpha = 1;
    // Reflexo do ambiente: parado no mundo, só onde existe metal
    b.globalCompositeOperation = 'source-atop';
    const reflexo = b.createLinearGradient(meio - raio, meio - raio, meio + raio, meio + raio);
    reflexo.addColorStop(0, `rgba(255,255,255,${0.28 * material.metal})`);
    reflexo.addColorStop(0.32, 'rgba(255,255,255,0)');
    reflexo.addColorStop(0.55, `rgba(255,255,255,${0.12 * material.metal})`);
    reflexo.addColorStop(0.7, 'rgba(0,0,0,0)');
    reflexo.addColorStop(1, `rgba(0,0,0,${0.25 * material.metal})`);
    b.fillStyle = reflexo;
    b.fillRect(0, 0, sprite.lado, sprite.lado);
    b.globalCompositeOperation = 'source-over';
    g.drawImage(buffer, centro.x - meio, centro.y - meio, sprite.lado, sprite.lado);

    // Em velocidade muito alta, um brilho de "disco" sutil
    if (velocidade01 > 0.55 && !movimentoReduzido()) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (velocidade01 - 0.55) * 0.5;
      const disco = g.createRadialGradient(centro.x, centro.y, raio * 0.4, centro.x, centro.y, raio * 1.02);
      disco.addColorStop(0, 'rgba(255,255,255,0)');
      disco.addColorStop(0.8, material.rastro);
      disco.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = disco;
      g.beginPath();
      g.arc(centro.x, centro.y, raio * 1.02, 0, TAU);
      g.fill();
      g.restore();
    }
  });

  let ultimoPainel = '';
  function atualizarPainel() {
    const rpm = Math.round(rpmMostrado);
    const texto = `${rpm}|${fisica.voltas}|${recordeSessao}`;
    if (texto === ultimoPainel) return;
    ultimoPainel = texto;
    $('[data-rpm]').textContent = rpm.toLocaleString('pt-BR');
    $('[data-voltas]').textContent = fisica.voltas.toLocaleString('pt-BR');
    $('[data-recorde]').textContent = Math.max(progresso.recorde('fidget-spinner', 'rpm') ?? 0, recordeSessao).toLocaleString('pt-BR');
    $('[data-medidor]').style.setProperty('--p', `${clamp(rpm / 2500, 0, 1) * 100}%`);
  }

  raiz.style.setProperty('--c1', material.rastro);

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      laco?.parar();
      zumbido?.parar();
    },
  };
}
