/**
 * Areia Mágica: milhares de partículas num campo de fluxo suave.
 * Passar o cursor atrai, clicar explode, segurar cria um redemoinho,
 * "Formar" desenha figuras com as partículas e "Gravidade" faz a areia cair e acumular.
 */
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, escolher, movimentoReduzido, perfilLeve, semHover } from '../../core/util.js?v=202610231820';
import { icone } from '../../core/icones.js?v=202610231820';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231820';

const TAU = Math.PI * 2;
const RAIO_INFLUENCIA = 220;
const RAIO_EXPLOSAO = 280;

const PALETAS = [
  { id: 'areia', nome: 'Areia dourada', fundo: [26, 11, 46], cores: ['#a34a00', '#d97a00', '#ff9e00', '#ffc94d', '#ffe8a3', '#fff8e0'], amostra: 'linear-gradient(135deg, #ff9e00, #ffe8a3)' },
  { id: 'lava', nome: 'Lava', fundo: [26, 4, 8], cores: ['#a31a00', '#e03000', '#ff4d00', '#ff9e00', '#ffd60a', '#fff3b0'], amostra: 'linear-gradient(135deg, #ff2e00, #ffd60a)' },
  { id: 'oceano', nome: 'Oceano', fundo: [2, 12, 40], cores: ['#0060b0', '#0090d0', '#00b4d8', '#48cae4', '#90e0ef', '#e0fbff'], amostra: 'linear-gradient(135deg, #0077b6, #90e0ef)' },
  { id: 'algodao', nome: 'Algodão-doce', fundo: [27, 10, 46], cores: ['#9d4edd', '#c77dff', '#ff70a6', '#ff9ad5', '#ffd6e8', '#ffffff'], amostra: 'linear-gradient(135deg, #c77dff, #ff9ad5)' },
  { id: 'neon', nome: 'Neon', fundo: [7, 0, 26], cores: ['#8b5cff', '#ff2bd6', '#00f0ff', '#a3ff12', '#ffd60a', '#ffffff'], amostra: 'linear-gradient(135deg, #ff2bd6, #00f0ff, #a3ff12)' },
];

const FORMAS = ['coracao', 'estrela', 'UAU!', 'espiral', 'OI!'];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/areia-magica.css?v=202610231820', import.meta.url));

  const config = { paleta: 'areia', gravidade: false, ...ler('areia-config', {}) };
  const salvar = () => gravar('areia-config', config);
  const quantidade = semHover() ? 2600 : perfilLeve ? 4200 : 7000;

  raiz.classList.add('areia');
  raiz.innerHTML = `
    <div class="areia__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Areia mágica. Mova o cursor para atrair as partículas, clique para explodir, segure para um redemoinho. Teclado: setas movem, espaço explode, F forma figuras, E espalha, G liga a gravidade.">
      <canvas class="areia__canvas"></canvas>
    </div>
    <p class="dica-palco" data-dica>Mexa o cursor<small>clique para explodir · segure para um redemoinho</small></p>
    <div class="doca vidro-fosco" role="region" aria-label="Controles da areia">
      <div class="doca__linha">
        <span class="doca__rotulo">CORES</span>
        ${PALETAS.map((p) => `<button type="button" class="amostra-tema" data-paleta="${p.id}" style="--amostra:${p.amostra};--brilho:${p.cores[3]}" aria-pressed="${p.id === config.paleta}" aria-label="${p.nome}" title="${p.nome}"></button>`).join('')}
        <span class="doca__nome" data-nome-paleta></span>
      </div>
      <div class="doca__linha">
        <button type="button" class="chip" data-formar>${icone('coracao')}<span>Formar</span></button>
        <button type="button" class="chip" data-espalhar>${icone('fogos')}<span>Espalhar</span></button>
        <button type="button" class="chip" data-gravidade aria-pressed="${config.gravidade}">${icone('ocultar')}<span>Gravidade</span></button>
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.areia__palco');
  const canvas = $('.areia__canvas');
  const ctx = canvas.getContext('2d');

  const x = new Float32Array(quantidade);
  const y = new Float32Array(quantidade);
  const vx = new Float32Array(quantidade);
  const vy = new Float32Array(quantidade);
  const alvoX = new Float32Array(quantidade);
  const alvoY = new Float32Array(quantidade);
  const faixa = new Uint8Array(quantidade);

  const tela = { l: 1, a: 1, dpr: 1 };
  const cursor = { x: 0, y: 0, ativo: false, pressionado: false, inicio: 0, moveu: false };
  const setas = new Set();
  let paleta = PALETAS.find((p) => p.id === config.paleta) ?? PALETAS[0];
  let formando = 0;
  let indiceForma = 0;
  let tempo = 0;
  let textura = null;
  let segundosInteragindo = 0;

  /* ---------- Tamanho ---------- */

  function redimensionar() {
    const caixa = palco.getBoundingClientRect();
    if (caixa.width < 2) return;
    const primeiro = tela.l === 1;
    const escalaX = caixa.width / tela.l;
    const escalaY = caixa.height / tela.a;
    tela.l = caixa.width;
    tela.a = caixa.height;
    tela.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(tela.l * tela.dpr);
    canvas.height = Math.round(tela.a * tela.dpr);
    for (let i = 0; i < quantidade; i++) {
      if (primeiro) {
        x[i] = Math.random() * tela.l;
        y[i] = Math.random() * tela.a;
      } else {
        x[i] *= escalaX;
        y[i] *= escalaY;
      }
    }
    pintarFundo(1);
  }

  function pintarFundo(alfa) {
    const [r, g, b] = paleta.fundo;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${r},${g},${b},${alfa})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const observador = new ResizeObserver(() => redimensionar());
  observador.observe(palco);

  /* ---------- Ações ---------- */

  function explodir(cx, cy, forca = 1) {
    for (let i = 0; i < quantidade; i++) {
      const dx = x[i] - cx;
      const dy = y[i] - cy;
      const d = Math.hypot(dx, dy);
      if (d > RAIO_EXPLOSAO || d < 0.1) continue;
      const impulso = 950 * forca * (1 - d / RAIO_EXPLOSAO);
      vx[i] += (dx / d) * impulso;
      vy[i] += (dy / d) * impulso;
    }
    audio.tocar('whoosh');
    audio.tocar('estouro', { tamanho: 1, pan: (cx / tela.l) * 2 - 1 });
    progresso.registrar('areia:explosao');
  }

  function espalhar() {
    for (let i = 0; i < quantidade; i++) {
      const ang = aleatorio(0, TAU);
      const v = aleatorio(200, 700);
      vx[i] += Math.cos(ang) * v;
      vy[i] += Math.sin(ang) * v;
    }
    formando = 0;
    audio.tocar('whoosh');
  }

  /** Desenha a figura num canvas escondido e usa os pixels acesos como alvos das partículas. */
  function formar() {
    const forma = FORMAS[indiceForma % FORMAS.length];
    indiceForma++;
    const largura = 360;
    const altura = 240;
    const oculto = document.createElement('canvas');
    oculto.width = largura;
    oculto.height = altura;
    const g = oculto.getContext('2d');
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.translate(largura / 2, altura / 2);
    if (forma === 'coracao') {
      g.beginPath();
      for (let t = 0; t <= TAU; t += 0.02) {
        g.lineTo(16 * Math.sin(t) ** 3 * 6.5, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 6.5);
      }
      g.fill();
    } else if (forma === 'estrela') {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 48 : 115;
        const ang = -Math.PI / 2 + (i / 10) * TAU;
        g.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      g.fill();
    } else if (forma === 'espiral') {
      g.lineWidth = 16;
      g.lineCap = 'round';
      g.beginPath();
      for (let t = 0; t < 6 * Math.PI; t += 0.05) g.lineTo(Math.cos(t) * t * 6, Math.sin(t) * t * 6);
      g.stroke();
    } else {
      g.font = '120px Bungee, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(forma, 0, 6);
    }
    const dados = g.getImageData(0, 0, largura, altura).data;
    const pontos = [];
    for (let py = 0; py < altura; py += 2) {
      for (let px = 0; px < largura; px += 2) if (dados[(py * largura + px) * 4 + 3] > 128) pontos.push([px, py]);
    }
    if (!pontos.length) return;
    const escala = Math.min(tela.l / largura, (tela.a - 220) / altura) * 0.8;
    const ox = tela.l / 2 - (largura / 2) * escala;
    const oy = tela.a / 2 - 40 - (altura / 2) * escala;
    for (let i = 0; i < quantidade; i++) {
      const [px, py] = pontos[Math.floor(Math.random() * pontos.length)];
      alvoX[i] = ox + (px + Math.random() * 2) * escala;
      alvoY[i] = oy + (py + Math.random() * 2) * escala;
    }
    formando = 4.5;
    audio.tocar('tema');
    progresso.registrar('areia:forma', 1, forma);
  }

  function aplicarPaleta(id) {
    paleta = PALETAS.find((p) => p.id === id) ?? PALETAS[0];
    config.paleta = paleta.id;
    salvar();
    raiz.querySelectorAll('[data-paleta]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.paleta === id)));
    $('[data-nome-paleta]').textContent = paleta.nome;
    raiz.style.setProperty('--c1', paleta.cores[3]);
    raiz.style.setProperty('--c2', paleta.cores[1]);
  }

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (tela.l < 2) return;
    tempo += dt;

    if (setas.size) {
      const passo = 520 * dt;
      if (setas.has('ArrowLeft')) cursor.x -= passo;
      if (setas.has('ArrowRight')) cursor.x += passo;
      if (setas.has('ArrowUp')) cursor.y -= passo;
      if (setas.has('ArrowDown')) cursor.y += passo;
      cursor.x = clamp(cursor.x, 0, tela.l);
      cursor.y = clamp(cursor.y, 0, tela.a);
    }

    const amortecimento = (formando > 0 ? 0.9 : 0.975) ** (dt * 60);
    const fluxo = (movimentoReduzido() ? 35 : 95) * dt;
    const segurando = cursor.pressionado && performance.now() - cursor.inicio > 300;
    const raio2 = RAIO_INFLUENCIA * RAIO_INFLUENCIA;
    let somaVelocidade = 0;

    for (let i = 0; i < quantidade; i++) {
      let px = x[i];
      let py = y[i];
      // Campo de fluxo suave e lento
      const ang = Math.sin(px * 0.0035 + tempo * 0.25) * 2.2 + Math.cos(py * 0.004 - tempo * 0.2) * 2.2;
      vx[i] += Math.cos(ang) * fluxo;
      vy[i] += Math.sin(ang) * fluxo;
      if (config.gravidade) vy[i] += 520 * dt;

      if (cursor.ativo) {
        const dx = cursor.x - px;
        const dy = cursor.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < raio2 && d2 > 1) {
          const d = Math.sqrt(d2);
          const f = 1 - d / RAIO_INFLUENCIA;
          if (segurando) {
            // Redemoinho: gira em volta do cursor e puxa de leve para dentro
            vx[i] += ((-dy / d) * 1500 + (dx / d) * 350) * f * dt;
            vy[i] += ((dx / d) * 1500 + (dy / d) * 350) * f * dt;
          } else {
            const atracao = (cursor.pressionado ? 1700 : 650) * f * dt;
            vx[i] += (dx / d) * atracao;
            vy[i] += (dy / d) * atracao;
          }
        }
      }

      if (formando > 0) {
        vx[i] += (alvoX[i] - px) * 5 * dt;
        vy[i] += (alvoY[i] - py) * 5 * dt;
      }

      vx[i] *= amortecimento;
      vy[i] *= amortecimento;
      px += vx[i] * dt;
      py += vy[i] * dt;

      // Bordas: atravessa dos lados; com gravidade, o chão segura a areia
      if (px < 0) px += tela.l;
      else if (px > tela.l) px -= tela.l;
      if (config.gravidade) {
        const chao = tela.a - 3 - (i % 40) * 0.6;
        if (py > chao) {
          py = chao;
          vy[i] *= -0.25;
          vx[i] *= 0.85;
        }
        if (py < 0) py = 0;
      } else if (py < 0) py += tela.a;
      else if (py > tela.a) py -= tela.a;

      x[i] = px;
      y[i] = py;
      const velocidade = Math.abs(vx[i]) + Math.abs(vy[i]);
      somaVelocidade += velocidade;
      faixa[i] = Math.min(5, 1 + ((velocidade / 90) | 0));
    }

    if (formando > 0) {
      formando -= dt;
      if (formando <= 0) espalharSuave();
    }

    // Som de areia acompanha a agitação média
    const media = somaVelocidade / quantidade;
    if (!textura && audio.ativo) textura = audio.iniciarTextura({ filtro: 'bandpass', freq: 1800, q: 0.8, volumeMaximo: 0.12 });
    textura?.atualizar(clamp((media - 60) / 300, 0, 1), 1200 + media * 5);

    if (cursor.pressionado || setas.size) {
      segundosInteragindo += dt;
      if (segundosInteragindo >= 1) {
        segundosInteragindo -= 1;
        progresso.registrar('areia:segundos');
      }
    }

    desenhar();
  });

  function espalharSuave() {
    for (let i = 0; i < quantidade; i++) {
      vx[i] += aleatorio(-120, 120);
      vy[i] += aleatorio(-120, 120);
    }
  }

  function desenhar() {
    // Rastro: cobre o quadro anterior com o fundo quase transparente
    pintarFundo(movimentoReduzido() ? 0.5 : 0.2);
    ctx.setTransform(tela.dpr, 0, 0, tela.dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    const tamanho = semHover() ? 2.6 : 2.3;
    for (let f = 0; f < 6; f++) {
      ctx.fillStyle = paleta.cores[f];
      ctx.beginPath();
      for (let i = 0; i < quantidade; i++) if (faixa[i] === f) ctx.rect(x[i], y[i], tamanho, tamanho);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (setas.size || (cursor.ativo && document.activeElement === palco && !cursor.mouse)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 16, 0, TAU);
      ctx.stroke();
    }
  }

  /* ---------- Entrada ---------- */

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  const esconderDica = () => $('[data-dica]').classList.add('dica-palco--oculta');

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    Object.assign(cursor, posicao(e), { ativo: true, pressionado: true, inicio: performance.now(), moveu: false, mouse: e.pointerType === 'mouse' });
    esconderDica();
  });
  palco.addEventListener('pointermove', (e) => {
    const p = posicao(e);
    if (cursor.pressionado && Math.hypot(p.x - cursor.x, p.y - cursor.y) > 6) cursor.moveu = true;
    Object.assign(cursor, p, { ativo: true, mouse: e.pointerType === 'mouse' });
  });
  palco.addEventListener('pointerup', (e) => {
    const rapido = performance.now() - cursor.inicio < 280;
    if (cursor.pressionado && rapido && !cursor.moveu) explodir(cursor.x, cursor.y);
    cursor.pressionado = false;
    if (e.pointerType !== 'mouse') cursor.ativo = false;
  });
  palco.addEventListener('pointercancel', () => {
    cursor.pressionado = false;
    cursor.ativo = false;
  });
  palco.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !cursor.pressionado) cursor.ativo = false;
  });

  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input')) return;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      if (!setas.size && !cursor.ativo) Object.assign(cursor, { x: tela.l / 2, y: tela.a / 2 });
      setas.add(e.key);
      cursor.ativo = true;
      cursor.mouse = false;
      esconderDica();
      return;
    }
    const tecla = e.key.toLowerCase();
    if ((tecla === ' ' || tecla === 'enter') && e.target === palco) {
      e.preventDefault();
      if (!cursor.ativo) Object.assign(cursor, { x: tela.l / 2, y: tela.a / 2 });
      explodir(cursor.x, cursor.y);
    } else if (tecla === 'f') formar();
    else if (tecla === 'e') espalhar();
    else if (tecla === 'g') alternarGravidade();
  });
  raiz.addEventListener('keyup', (e) => setas.delete(e.key));

  function alternarGravidade() {
    config.gravidade = !config.gravidade;
    salvar();
    $('[data-gravidade]').setAttribute('aria-pressed', String(config.gravidade));
  }

  $('.doca').addEventListener('click', (e) => {
    const botao = e.target.closest('button');
    if (!botao) return;
    if (botao.dataset.paleta) aplicarPaleta(botao.dataset.paleta);
    else if ('formar' in botao.dataset) formar();
    else if ('espalhar' in botao.dataset) espalhar();
    else if ('gravidade' in botao.dataset) alternarGravidade();
    esconderDica();
  });

  aplicarPaleta(config.paleta);
  redimensionar();

  return {
    destruir() {
      pararLoop();
      observador.disconnect();
      textura?.parar();
    },
  };
}
