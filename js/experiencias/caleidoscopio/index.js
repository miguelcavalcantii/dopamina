/**
 * Caleidoscópio: cada traço é repetido em N eixos de simetria (com espelho opcional),
 * em degradê de cores com brilho. Desenhar toca notas: perto do centro é agudo, longe é grave.
 * Extras: desenho automático, desvanecer, girar a tela, limpar e salvar como imagem.
 */
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, movimentoReduzido } from '../../core/util.js';
import { icone } from '../../core/icones.js';
import { ler, gravar } from '../../core/armazenamento.js';
import { atualizarDeslizador } from '../../core/ui.js';

const TAU = Math.PI * 2;
const FUNDO = [10, 6, 24];
const SIMETRIAS = [4, 6, 8, 12, 16];
const ESCALA_NOTAS = [84, 81, 79, 76, 74, 72, 69, 67, 64, 62, 60];

const PALETAS = [
  { id: 'arco-iris', nome: 'Arco-íris', matiz: [0, 360], sat: 100, luz: 62, amostra: 'conic-gradient(#ff2e97, #ffd60a, #a3ff12, #22e4ff, #8b5cff, #ff2e97)' },
  { id: 'fogo', nome: 'Fogo', matiz: [-15, 55], sat: 100, luz: 58, amostra: 'linear-gradient(135deg, #ff2e60, #ffd60a)' },
  { id: 'oceano', nome: 'Oceano', matiz: [165, 250], sat: 100, luz: 60, amostra: 'linear-gradient(135deg, #00f0ff, #3a5bff)' },
  { id: 'neon', nome: 'Neon', matiz: [280, 470], sat: 100, luz: 60, amostra: 'linear-gradient(135deg, #ff2bd6, #00f0ff, #a3ff12)' },
  { id: 'pastel', nome: 'Pastel', matiz: [0, 360], sat: 100, luz: 80, amostra: 'linear-gradient(135deg, #ff9ad5, #a0e7ff, #fff0a8)' },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/caleidoscopio.css', import.meta.url));

  const config = { simetria: 8, espelho: true, paleta: 'arco-iris', pincel: 6, desvanecer: false, ...ler('caleido-config', {}) };
  const salvar = () => gravar('caleido-config', config);

  raiz.classList.add('caleido');
  raiz.innerHTML = `
    <div class="caleido__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Caleidoscópio. Desenhe com o mouse ou o dedo. Teclado: setas desenham, A liga o desenho automático, L limpa, D desvanece.">
      <canvas class="caleido__tela"></canvas>
      <canvas class="caleido__guias"></canvas>
    </div>
    <p class="dica-palco" data-dica>Desenhe livremente<small>tudo se espelha sozinho · experimente o automático</small></p>
    <div class="doca vidro-fosco" role="region" aria-label="Controles do caleidoscópio">
      <div class="doca__linha">
        <span class="doca__rotulo">EIXOS</span>
        ${SIMETRIAS.map((n) => `<button type="button" class="chip" data-simetria="${n}" aria-pressed="${n === config.simetria}">${n}</button>`).join('')}
        <button type="button" class="chip" data-espelho aria-pressed="${config.espelho}">${icone('flor')}<span>Espelho</span></button>
        <span class="doca__rotulo">CORES</span>
        ${PALETAS.map((p) => `<button type="button" class="amostra-tema" data-paleta="${p.id}" style="--amostra:${p.amostra};--brilho:#fff" aria-pressed="${p.id === config.paleta}" aria-label="${p.nome}" title="${p.nome}"></button>`).join('')}
      </div>
      <div class="doca__linha">
        <label class="doca__ajuste"><span class="doca__rotulo">PINCEL</span>
          <input type="range" class="deslizador" min="2" max="26" value="${config.pincel}" data-pincel aria-label="Espessura do pincel"></label>
        <button type="button" class="chip" data-auto aria-pressed="false">${icone('espiral')}<span>Automático</span></button>
        <button type="button" class="chip" data-desvanecer aria-pressed="${config.desvanecer}">${icone('lua')}<span>Desvanecer</span></button>
        <button type="button" class="chip" data-girar aria-pressed="false">${icone('onda')}<span>Girar</span></button>
        <button type="button" class="chip" data-limpar>${icone('brilho')}<span>Limpar</span></button>
        <button type="button" class="chip" data-salvar>${icone('estrela')}<span>Salvar</span></button>
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.caleido__palco');
  const canvas = $('.caleido__tela');
  const guias = $('.caleido__guias');
  const ctx = canvas.getContext('2d');
  const ctxGuias = guias.getContext('2d');
  atualizarDeslizador($('[data-pincel]'));

  // O canvas é um quadrado do tamanho da diagonal: assim, girando, nunca sobram cantos vazios
  const tela = { lado: 1, dpr: 1, l: 1, a: 1 };
  let paleta = PALETAS.find((p) => p.id === config.paleta) ?? PALETAS[0];
  let fase = 0;
  let angulo = 0;
  let girando = false;
  let automatico = false;
  let tempoAuto = 0;
  let parametrosAuto = novosParametrosAuto();
  let anteriorAuto = null;
  let limpando = 0;
  let distanciaNota = 0;
  let segundosDesenho = 0;
  let desenhando = false;

  /* ---------- Tamanho ---------- */

  function redimensionar() {
    const caixa = palco.getBoundingClientRect();
    if (caixa.width < 2) return;
    const lado = Math.ceil(Math.hypot(caixa.width, caixa.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const mudou = lado !== tela.lado;
    // Guarda o desenho ao redimensionar
    let copia = null;
    if (mudou && tela.lado > 1) {
      copia = document.createElement('canvas');
      copia.width = canvas.width;
      copia.height = canvas.height;
      copia.getContext('2d').drawImage(canvas, 0, 0);
    }
    Object.assign(tela, { lado, dpr, l: caixa.width, a: caixa.height });
    for (const c of [canvas, guias]) {
      c.width = Math.round(lado * dpr);
      c.height = Math.round(lado * dpr);
      c.style.width = `${lado}px`;
      c.style.height = `${lado}px`;
      c.style.left = `${(caixa.width - lado) / 2}px`;
      c.style.top = `${(caixa.height - lado) / 2}px`;
    }
    pintarFundo(1);
    if (copia) ctx.drawImage(copia, (canvas.width - copia.width) / 2, (canvas.height - copia.height) / 2);
    desenharGuias();
  }

  function pintarFundo(alfa) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${FUNDO.join(',')},${alfa})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function desenharGuias() {
    const c = ctxGuias;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, guias.width, guias.height);
    c.setTransform(tela.dpr, 0, 0, tela.dpr, tela.lado * tela.dpr / 2, tela.lado * tela.dpr / 2);
    c.strokeStyle = 'rgba(255,255,255,0.06)';
    c.lineWidth = 1;
    c.beginPath();
    for (let k = 0; k < config.simetria; k++) {
      const ang = (k / config.simetria) * TAU;
      c.moveTo(0, 0);
      c.lineTo(Math.cos(ang) * tela.lado, Math.sin(ang) * tela.lado);
    }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath();
    c.arc(0, 0, 3, 0, TAU);
    c.fill();
  }

  const observador = new ResizeObserver(() => redimensionar());
  observador.observe(palco);

  /* ---------- Desenho simétrico ---------- */

  function corAtual() {
    const [m0, m1] = paleta.matiz;
    const vaiVolta = paleta.matiz[1] - paleta.matiz[0] >= 360 ? fase % 1 : 1 - Math.abs(((fase * 0.5) % 1) * 2 - 1);
    const matiz = (m0 + (m1 - m0) * vaiVolta + 720) % 360;
    return `hsl(${matiz}, ${paleta.sat}%, ${paleta.luz}%)`;
  }

  /** Converte coordenadas da tela para o sistema centrado (desfazendo o giro). */
  function paraCentro(px, py) {
    const dx = px - tela.l / 2;
    const dy = py - tela.a / 2;
    const c = Math.cos(-angulo);
    const s = Math.sin(-angulo);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  function tracar(a, b, largura) {
    const n = config.simetria;
    const centro = (tela.lado * tela.dpr) / 2;
    ctx.setTransform(tela.dpr, 0, 0, tela.dpr, centro, centro);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * TAU;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      ctx.moveTo(a.x * c - a.y * s, a.x * s + a.y * c);
      ctx.lineTo(b.x * c - b.y * s, b.x * s + b.y * c);
      if (config.espelho) {
        ctx.moveTo(a.x * c + a.y * s, a.x * s - a.y * c);
        ctx.lineTo(b.x * c + b.y * s, b.x * s - b.y * c);
      }
    }
    const cor = corAtual();
    ctx.strokeStyle = cor;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = largura * 3.4;
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = largura;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const distancia = Math.hypot(b.x - a.x, b.y - a.y);
    fase += distancia / 900;
    distanciaNota += distancia;
    if (distanciaNota > 46) {
      distanciaNota = 0;
      const raio = Math.hypot(b.x, b.y) / (Math.min(tela.l, tela.a) / 2);
      const indice = clamp(Math.floor(raio * ESCALA_NOTAS.length), 0, ESCALA_NOTAS.length - 1);
      audio.nota(ESCALA_NOTAS[indice], { timbre: 'sino', volume: 0.045, pan: clamp(b.x / tela.l, -0.8, 0.8) });
    }
  }

  /* ---------- Desenho automático (curvas de Lissajous) ---------- */

  function novosParametrosAuto() {
    return { a: Math.floor(aleatorio(1, 5)), b: Math.floor(aleatorio(2, 7)), defasagem: aleatorio(0, TAU), raio: aleatorio(0.25, 0.42), duracao: aleatorio(7, 11) };
  }

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (tela.lado < 2) return;

    if (girando && !movimentoReduzido()) {
      angulo += dt * 0.12;
      canvas.style.transform = guias.style.transform = `rotate(${angulo}rad)`;
    }

    if (limpando > 0) {
      limpando -= dt;
      pintarFundo(limpando > 0 ? 0.22 : 1);
    } else if (config.desvanecer) {
      pintarFundo(0.012);
    }

    if (automatico) {
      tempoAuto += dt;
      if (tempoAuto > parametrosAuto.duracao) {
        tempoAuto = 0;
        parametrosAuto = novosParametrosAuto();
        anteriorAuto = null;
      }
      const p = parametrosAuto;
      const r = Math.min(tela.l, tela.a) * p.raio;
      const t = tempoAuto * 0.45;
      const ponto = {
        x: r * Math.sin(p.a * t + p.defasagem) * (0.6 + 0.4 * Math.cos(t * 0.3)),
        y: r * Math.sin(p.b * t),
      };
      if (anteriorAuto) tracar(anteriorAuto, ponto, config.pincel * 0.8);
      anteriorAuto = ponto;
    }

    if (desenhando || automatico) {
      segundosDesenho += dt;
      if (segundosDesenho >= 1) {
        segundosDesenho -= 1;
        progresso.registrar('caleido:segundos');
      }
    }
  });

  /* ---------- Entrada ---------- */

  let ultimo = null;
  let ultimaPosicaoTela = null;
  const esconderDica = () => $('[data-dica]').classList.add('dica-palco--oculta');
  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    const p = posicao(e);
    ultimaPosicaoTela = p;
    ultimo = paraCentro(p.x, p.y);
    desenhando = true;
    tracar(ultimo, { x: ultimo.x + 0.1, y: ultimo.y }, config.pincel);
    esconderDica();
  });
  palco.addEventListener('pointermove', (e) => {
    if (!desenhando) return;
    const eventos = e.getCoalescedEvents?.() ?? [e];
    for (const ev of eventos) {
      const p = posicao(ev);
      const atual = paraCentro(p.x, p.y);
      // Mais rápido = traço um pouco mais fino
      const velocidade = Math.hypot(p.x - ultimaPosicaoTela.x, p.y - ultimaPosicaoTela.y);
      tracar(ultimo, atual, config.pincel * clamp(1.2 - velocidade / 80, 0.55, 1.2));
      ultimo = atual;
      ultimaPosicaoTela = p;
    }
  });
  const parar = () => {
    desenhando = false;
    ultimo = null;
  };
  palco.addEventListener('pointerup', parar);
  palco.addEventListener('pointercancel', parar);

  // Teclado: as setas desenham a partir do centro
  const cursorTeclado = { x: 60, y: 0 };
  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input')) return;
    const passos = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key];
    if (passos) {
      e.preventDefault();
      const novo = { x: cursorTeclado.x + passos[0], y: cursorTeclado.y + passos[1] };
      tracar({ ...cursorTeclado }, novo, config.pincel);
      Object.assign(cursorTeclado, novo);
      esconderDica();
      return;
    }
    const tecla = e.key.toLowerCase();
    if (tecla === 'a') alternarAuto();
    else if (tecla === 'l') limpar();
    else if (tecla === 'd') alternar('desvanecer');
  });

  /* ---------- Controles ---------- */

  function alternarAuto() {
    automatico = !automatico;
    anteriorAuto = null;
    tempoAuto = 0;
    $('[data-auto]').setAttribute('aria-pressed', String(automatico));
    if (automatico) esconderDica();
  }

  function alternar(chave) {
    config[chave] = !config[chave];
    salvar();
    $(`[data-${chave}]`).setAttribute('aria-pressed', String(config[chave]));
  }

  function limpar() {
    limpando = 0.5;
    audio.tocar('whoosh', { descendo: true });
  }

  function salvarImagem() {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `caleidoscopio-${Date.now()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      audio.tocar('conquista');
      progresso.registrar('caleido:salvo');
    });
  }

  $('[data-pincel]').addEventListener('input', (e) => {
    config.pincel = Number(e.target.value);
    salvar();
  });

  $('.doca').addEventListener('click', (e) => {
    const botao = e.target.closest('button');
    if (!botao) return;
    if (botao.dataset.simetria) {
      config.simetria = Number(botao.dataset.simetria);
      raiz.querySelectorAll('[data-simetria]').forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));
      salvar();
      desenharGuias();
    } else if (botao.dataset.paleta) {
      config.paleta = botao.dataset.paleta;
      paleta = PALETAS.find((p) => p.id === config.paleta);
      raiz.querySelectorAll('[data-paleta]').forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));
      salvar();
    } else if ('espelho' in botao.dataset) alternar('espelho');
    else if ('desvanecer' in botao.dataset) alternar('desvanecer');
    else if ('auto' in botao.dataset) alternarAuto();
    else if ('girar' in botao.dataset) {
      girando = !girando;
      botao.setAttribute('aria-pressed', String(girando));
    } else if ('limpar' in botao.dataset) limpar();
    else if ('salvar' in botao.dataset) salvarImagem();
  });

  redimensionar();

  return {
    destruir() {
      pararLoop();
      observador.disconnect();
    },
  };
}
