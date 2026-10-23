/**
 * Cubo infinito: 8 cubinhos presos por dobradiças que dobram e desdobram sem fim.
 * Cada dobra divide o bloco 2×2×2 em duas metades que giram 180° em volta de uma
 * dobradiça na borda e se juntam de novo do outro lado. As dobras alternam os três
 * eixos: no Clássico cada lado do bloco muda de cor; nas outras paletas cada cubinho
 * tem a sua cor e dá para ver as metades trocando de lugar.
 * Arraste para dobrar (o quanto arrasta = o quanto dobra), solte para encaixar,
 * ou ligue o modo automático. 3D próprio: projeção em perspectiva, pintor por cubo.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js';
import { icone } from '../../core/icones.js';
import { ler, gravar } from '../../core/armazenamento.js';
import { criarBanco } from '../../core/amostras.js';
import { capturarPonteiro, carregarEstilo, clamp, movimentoReduzido } from '../../core/util.js';

const PI = Math.PI;
const SOM_ENCAIXE = new URL('../../../assets/sons/fidget/toggle.mp3', import.meta.url);

/**
 * `faces`: cor pela direção original da face (+x, −x, +y, −y, +z, −z).
 * `porCubo`: uma cor para cada um dos 8 cubinhos (substitui `faces`).
 */
const PALETAS = [
  { id: 'classico', nome: 'Clássico', faces: ['#e8343a', '#ff8a1a', '#f4f4f0', '#ffd60a', '#2e7bff', '#22c25a'], corpo: '#121318' },
  { id: 'neon', nome: 'Neon', porCubo: ['#ff2e97', '#ff7a18', '#ffd60a', '#a3ff12', '#3cffb4', '#22e4ff', '#8b5cff', '#ff5dc8'], corpo: '#0a0a12' },
  { id: 'pastel', nome: 'Pastel', porCubo: ['#ffadc8', '#ffcf9e', '#fff6c2', '#c2f5d6', '#b8f0ff', '#b8dcff', '#d9c2ff', '#f5c2ff'], corpo: '#f4f0fa' },
  { id: 'aluminio', nome: 'Alumínio', porCubo: ['#d14a5a', '#d98a3a', '#d6c04a', '#5fb86a', '#4ab8c8', '#4a7ad6', '#8a5ad6', '#c85aa8'], corpo: '#2c313d', metal: true },
];
const coresDaPaleta = (p) => p.porCubo ?? p.faces;

/** Sequência de dobras: eixo que divide (a), eixo "para cima" da dobradiça (b). */
const DOBRAS = [
  { a: 0, b: 1 },
  { a: 2, b: 0 },
  { a: 1, b: 2 },
  { a: 2, b: 1 },
  { a: 0, b: 2 },
  { a: 1, b: 0 },
];

const FACES = [
  { n: [1, 0, 0], v: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
  { n: [0, 1, 0], v: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
  { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

const identidade = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; // colunas = eixos locais

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/cubo-infinito.css', import.meta.url));

  const config = { paleta: 'classico', automatico: false, ...ler('cubo-config', {}) };
  const salvar = () => gravar('cubo-config', config);
  let paleta = PALETAS.find((p) => p.id === config.paleta) ?? PALETAS[0];
  const banco = criarBanco(audio, [SOM_ENCAIXE], { recorte: { intervaloMin: 0.04, duracaoMax: 0.2 }, canal: 'efeitos' });

  raiz.classList.add('cubo');
  raiz.innerHTML = `
    <div class="cubo__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Cubo infinito. Arraste para dobrar. Teclado: espaço dobra, A liga o automático.">
      <canvas class="cubo__canvas"></canvas>
    </div>
    <div class="hud-jogo">
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-dobras>0</span><span class="hud-jogo__rotulo">dobras</span></div>
    </div>
    <p class="dica-palco" data-dica>Arraste para dobrar<small>o cubo nunca acaba</small></p>
    <div class="doca vidro-fosco cubo__doca" role="region" aria-label="Opções do cubo">
      <div class="doca__linha">
        <span class="doca__rotulo">CORES</span>
        ${PALETAS.map((p) => `<button type="button" class="amostra-tema" data-paleta="${p.id}" aria-pressed="${p.id === paleta.id}" aria-label="${p.nome}" title="${p.nome}"
          style="--amostra:conic-gradient(${coresDaPaleta(p).join(',')},${coresDaPaleta(p)[0]});--brilho:${coresDaPaleta(p)[0]}"></button>`).join('')}
        <button type="button" class="chip" data-automatico aria-pressed="${config.automatico}">${icone('jogar')}<span>Automático</span></button>
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.cubo__palco');
  const canvas = $('.cubo__canvas');
  const g = canvas.getContext('2d');
  const dica = $('[data-dica]');

  let tela = { l: 1, a: 1, dpr: 1 };

  /* ---------- Estado dos 8 cubinhos ---------- */

  let cubos = [];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) cubos.push({ id: cubos.length, c: [x, y, z], m: identidade() });

  const dobra = { indice: 0, angulo: 0, alvo: null, velocidade: 0 };
  let dobrasFeitas = 0;
  let passouMeio = false;

  /** Gira (da, db) no plano a-b: metade "baixa" no sentido horário, a "alta" no anti-horário. */
  function girarNoPlano(vetor, a, b, angulo, lado) {
    const resultado = [...vetor];
    const cos = Math.cos(angulo);
    const sen = Math.sin(angulo) * lado;
    resultado[a] = vetor[a] * cos + vetor[b] * sen;
    resultado[b] = -vetor[a] * sen + vetor[b] * cos;
    return resultado;
  }

  /** Posições e orientações dos cubos no ângulo atual da dobra (sem alterar o estado). */
  function poseAtual(angulo = dobra.angulo) {
    const { a, b } = DOBRAS[dobra.indice % DOBRAS.length];
    const meio = cubos.reduce((soma, k) => soma + k.c[a], 0) / cubos.length;
    const topo = Math.max(...cubos.map((k) => k.c[b])) + 0.5;
    return cubos.map((k) => {
      const lado = k.c[a] < meio ? 1 : -1;
      const dobradica = [...k.c];
      dobradica[a] = meio;
      dobradica[b] = topo;
      const relativo = k.c.map((v, i) => v - dobradica[i]);
      const girado = girarNoPlano(relativo, a, b, angulo, lado);
      const c = girado.map((v, i) => v + dobradica[i]);
      const m = k.m.map((coluna) => girarNoPlano(coluna, a, b, angulo, lado));
      return { id: k.id, c, m };
    });
  }

  function concluirDobra() {
    cubos = poseAtual(PI).map((k) => ({ id: k.id, c: k.c.map((v) => Math.round(v * 2) / 2), m: k.m.map((col) => col.map((v) => Math.round(v))) }));
    // Recentraliza o bloco na origem
    const centro = [0, 1, 2].map((i) => cubos.reduce((s, k) => s + k.c[i], 0) / cubos.length);
    for (const k of cubos) k.c = k.c.map((v, i) => v - centro[i]);
    dobra.indice++;
    dobra.angulo -= PI;
    passouMeio = false;
    dobrasFeitas++;
    $('[data-dobras]').textContent = dobrasFeitas.toLocaleString('pt-BR');
    progresso.registrar('cubo:dobra');
    if (!banco.tocar({ tom: 0.72, volume: 1 })) audio.tocar('tique', { tom: 0.6 });
  }

  /* ---------- Câmera e desenho ---------- */

  const camera = { guinada: 0.65, arfagem: 0.5, distancia: 9 };
  let tempo = 0;

  function projetar(p, escala) {
    // Gira o mundo pela câmera (guinada em y, arfagem em x) e projeta em perspectiva
    const cg = Math.cos(camera.guinada);
    const sg = Math.sin(camera.guinada);
    let x = p[0] * cg - p[2] * sg;
    let z = p[0] * sg + p[2] * cg;
    const ca = Math.cos(camera.arfagem);
    const sa = Math.sin(camera.arfagem);
    const y = p[1] * ca - z * sa;
    z = p[1] * sa + z * ca;
    const profundidade = camera.distancia - z;
    const f = escala / profundidade;
    x = tela.l / 2 + x * f;
    return { x, y: tela.a / 2 - 20 - y * f, z: profundidade };
  }

  const luz = (() => {
    const v = [-0.45, 0.8, 0.55];
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  })();

  function tom(hex, fator) {
    const n = parseInt(hex.slice(1), 16);
    const canal = (c) => Math.round(clamp(c * fator, 0, 255));
    return `rgb(${canal((n >> 16) & 255)},${canal((n >> 8) & 255)},${canal(n & 255)})`;
  }

  function desenhar() {
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fundo = g.createRadialGradient(l / 2, a * 0.45, 0, l / 2, a * 0.45, Math.hypot(l, a) * 0.7);
    fundo.addColorStop(0, '#26214a');
    fundo.addColorStop(1, '#09081a');
    g.fillStyle = fundo;
    g.fillRect(0, 0, l, a);

    const escala = Math.min(l, a - 160) * 1.55;
    const pose = poseAtual();
    const centro = [0, 1, 2].map((i) => pose.reduce((s, k) => s + k.c[i], 0) / pose.length);
    const visao = (() => {
      // Direção da câmera no mundo (para descartar faces de costas)
      const cg = Math.cos(camera.guinada);
      const sg = Math.sin(camera.guinada);
      const ca = Math.cos(camera.arfagem);
      const sa = Math.sin(camera.arfagem);
      return [sg * ca, sa, cg * ca];
    })();

    // Sombra no chão
    const chao = projetar([0, -2.1, 0], escala);
    const sombra = g.createRadialGradient(chao.x, chao.y, 0, chao.x, chao.y, escala * 0.13);
    sombra.addColorStop(0, 'rgba(0,0,0,0.5)');
    sombra.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sombra;
    g.beginPath();
    g.ellipse(chao.x, chao.y, escala * 0.14, escala * 0.045, 0, 0, PI * 2);
    g.fill();

    // Pintor: cubos de trás para frente
    const ordenados = pose.map((k) => {
      const c = k.c.map((v, i) => v - centro[i]);
      return { ...k, c, prof: projetar(c, escala).z };
    }).sort((p, q) => q.prof - p.prof);

    g.lineJoin = 'round';
    for (const k of ordenados) {
      FACES.forEach((face, i) => {
        // Normal no mundo = matriz × normal local
        const nm = [0, 1, 2].map((eixo) => k.m[0][eixo] * face.n[0] + k.m[1][eixo] * face.n[1] + k.m[2][eixo] * face.n[2]);
        if (nm[0] * visao[0] + nm[1] * visao[1] + nm[2] * visao[2] <= 0.02) return;
        const pontos = face.v.map((v) => {
          const mundo = [0, 1, 2].map((eixo) => k.c[eixo] + (k.m[0][eixo] * v[0] + k.m[1][eixo] * v[1] + k.m[2][eixo] * v[2]) * 0.5);
          return projetar(mundo, escala);
        });
        const brilho = 0.55 + 0.5 * Math.max(0, nm[0] * luz[0] + nm[1] * luz[1] + nm[2] * luz[2]);
        // Corpo do cubinho (aparece como bisel entre as faces coloridas)
        g.fillStyle = tom(paleta.corpo, 0.8 + brilho * 0.3);
        g.beginPath();
        pontos.forEach((p, j) => (j ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
        g.fill();
        // Face colorida um pouco recuada, com cantos arredondados
        const cx = pontos.reduce((s, p) => s + p.x, 0) / 4;
        const cy = pontos.reduce((s, p) => s + p.y, 0) / 4;
        const recuo = pontos.map((p) => ({ x: cx + (p.x - cx) * 0.86, y: cy + (p.y - cy) * 0.86 }));
        const cor = paleta.porCubo ? paleta.porCubo[k.id] : paleta.faces[i];
        const grad = g.createLinearGradient(recuo[0].x, recuo[0].y, recuo[2].x, recuo[2].y);
        grad.addColorStop(0, tom(cor, brilho * 1.12));
        if (paleta.metal) grad.addColorStop(0.5, tom(cor, brilho * 1.45)); // faixa de reflexo do anodizado
        grad.addColorStop(1, tom(cor, brilho * 0.86));
        g.fillStyle = grad;
        g.strokeStyle = grad;
        g.lineWidth = Math.max(2, escala * 0.004);
        g.beginPath();
        recuo.forEach((p, j) => (j ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
        g.fill();
        g.stroke();
        // Reflexo suave no canto de cima
        g.fillStyle = `rgba(255,255,255,${0.1 * brilho})`;
        g.beginPath();
        g.moveTo(recuo[0].x, recuo[0].y);
        g.lineTo((recuo[0].x + recuo[1].x) / 2, (recuo[0].y + recuo[1].y) / 2);
        g.lineTo(cx, cy);
        g.lineTo((recuo[0].x + recuo[3].x) / 2, (recuo[0].y + recuo[3].y) / 2);
        g.closePath();
        g.fill();
      });
    }
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
    },
  });

  /* ---------- Entrada ---------- */

  const arrasto = { ativo: false, ultimo: 0, ultimoT: 0 };
  let interagiu = false;

  function primeiraInteracao() {
    if (interagiu) return;
    interagiu = true;
    dica.classList.add('dica-palco--oculta');
  }

  function avancar(delta) {
    dobra.angulo += delta;
    if (dobra.angulo < 0) dobra.angulo = 0; // não desdobra além do encaixe
    if (!passouMeio && dobra.angulo > PI / 2) {
      passouMeio = true;
      audio.tocar('tique', { tom: 1.4 });
    }
    while (dobra.angulo >= PI) concluirDobra();
  }

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    primeiraInteracao();
    arrasto.ativo = true;
    arrasto.ultimo = e.clientX + e.clientY * 0.5;
    arrasto.ultimoT = performance.now();
    dobra.alvo = null;
    dobra.velocidade = 0;
  });
  palco.addEventListener('pointermove', (e) => {
    if (!arrasto.ativo) return;
    const posicao = e.clientX + e.clientY * 0.5;
    const delta = posicao - arrasto.ultimo;
    arrasto.ultimo = posicao;
    const agora = performance.now();
    const passo = (Math.abs(delta) / Math.max(200, tela.l * 0.35)) * PI;
    avancar(passo);
    dobra.velocidade = passo / Math.max(0.008, (agora - arrasto.ultimoT) / 1000);
    arrasto.ultimoT = agora;
  });
  const soltar = () => {
    if (!arrasto.ativo) return;
    arrasto.ativo = false;
    // Com impulso, segue dobrando; devagar, encaixa no lado mais perto
    if (dobra.velocidade < 4 || performance.now() - arrasto.ultimoT > 120) {
      dobra.velocidade = 0;
      dobra.alvo = dobra.angulo > PI * 0.42 ? PI : 0;
    }
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  palco.addEventListener('wheel', (e) => {
    e.preventDefault();
    primeiraInteracao();
    dobra.alvo = null;
    avancar(Math.abs(e.deltaY) * 0.004);
    dobra.alvo = dobra.angulo > PI * 0.42 ? PI : 0;
  }, { passive: false });

  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button')) return;
    const tecla = e.key.toLowerCase();
    if (tecla === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      primeiraInteracao();
      dobra.alvo = PI;
    } else if (tecla === 'a') {
      alternarAutomatico();
    }
  });

  function alternarAutomatico() {
    config.automatico = !config.automatico;
    salvar();
    $('[data-automatico]').setAttribute('aria-pressed', String(config.automatico));
    primeiraInteracao();
  }

  $('.cubo__doca').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-paleta]');
    if (botao) {
      paleta = PALETAS.find((p) => p.id === botao.dataset.paleta);
      config.paleta = paleta.id;
      salvar();
      for (const b of raiz.querySelectorAll('[data-paleta]')) b.setAttribute('aria-pressed', String(b === botao));
      raiz.style.setProperty('--c1', coresDaPaleta(paleta)[0]);
      audio.tocar('tema');
    } else if (e.target.closest('[data-automatico]')) {
      alternarAutomatico();
    }
  });

  /* ---------- Loop ---------- */

  let pausaAutomatica = 0;

  const pararLoop = aoQuadro((dt) => {
    tempo += dt;
    if (!movimentoReduzido()) {
      camera.guinada = 0.65 + Math.sin(tempo * 0.25) * 0.35;
      camera.arfagem = 0.48 + Math.sin(tempo * 0.18) * 0.08;
    }

    if (!arrasto.ativo) {
      if (dobra.velocidade > 0) {
        // Impulso do arrasto: desacelera e encaixa
        avancar(dobra.velocidade * dt);
        dobra.velocidade *= Math.exp(-dt * 3.2);
        if (dobra.velocidade < 1.2) {
          dobra.velocidade = 0;
          dobra.alvo = dobra.angulo > PI * 0.42 ? PI : 0;
        }
      } else if (dobra.alvo !== null) {
        const restante = dobra.alvo - dobra.angulo;
        const passo = Math.sign(restante) * Math.min(Math.abs(restante), dt * (2.2 + Math.abs(restante) * 5));
        if (dobra.alvo === PI) avancar(passo);
        else dobra.angulo += passo;
        if (Math.abs(dobra.alvo - dobra.angulo) < 0.002 || (dobra.alvo === PI && dobra.angulo < 0.002)) {
          dobra.angulo = dobra.alvo === PI ? 0 : dobra.alvo;
          dobra.alvo = null;
        }
      } else if (config.automatico) {
        pausaAutomatica -= dt;
        if (pausaAutomatica <= 0) {
          dobra.alvo = PI;
          pausaAutomatica = 0.55;
        }
      }
    }
    desenhar();
  });

  raiz.style.setProperty('--c1', coresDaPaleta(paleta)[0]);

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
    },
  };
}
