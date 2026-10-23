/**
 * Plástico-Bolha: uma folha infinita de bolhas para estourar.
 * Toque ou arraste para estourar; cada bolha volta sozinha depois de alguns segundos.
 * Estouros rápidos em sequência fazem combo. "Nova folha" troca a cor com uma onda.
 */
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, escolher, movimentoReduzido, semHover } from '../../core/util.js';
import { icone } from '../../core/icones.js';
import { ler, gravar } from '../../core/armazenamento.js';

const TAU = Math.PI * 2;
const FOLHAS = [
  { nome: 'Menta', cores: ['#3cffb4', '#00b4ff'] },
  { nome: 'Chiclete', cores: ['#ff9ad5', '#c77dff'] },
  { nome: 'Sol', cores: ['#ffd60a', '#ff7a18'] },
  { nome: 'Galáxia', cores: ['#22e4ff', '#8b5cff'] },
  { nome: 'Lima', cores: ['#a3ff12', '#00d9a0'] },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/plastico-bolha.css', import.meta.url));

  const config = { folha: 0, ...ler('bolha-config', {}) };

  raiz.classList.add('bolha');
  raiz.innerHTML = `
    <div class="bolha__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Plástico-bolha. Toque ou arraste para estourar. Teclado: setas escolhem a bolha, espaço estoura, N troca a folha.">
      <canvas class="bolha__canvas"></canvas>
    </div>
    <div class="hud-jogo">
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-contagem>0</span><span class="hud-jogo__rotulo">estouradas</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-combo>x0</span><span class="hud-jogo__rotulo">sequência</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-total>0</span><span class="hud-jogo__rotulo">no total</span></div>
    </div>
    <div class="cantos-jogo">
      <button type="button" class="chip" data-nova-folha>${icone('bolhas')}<span>Nova folha</span></button>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.bolha__palco');
  const canvas = $('.bolha__canvas');
  const ctx = canvas.getContext('2d');

  const tela = { l: 1, a: 1, dpr: 1 };
  let bolhas = [];
  let lado = 64;
  let raio = 26;
  let sprites = null;
  let folha = FOLHAS[config.folha % FOLHAS.length];
  const particulas = [];
  const textos = [];
  const combo = { quantidade: 0, ultimo: 0 };
  let contagem = 0;
  let selecionada = -1;
  let tempo = 0;

  /* ---------- Folha e sprites ---------- */

  /** Pré-desenha a bolha cheia e a estourada (desenhar imagens prontas é bem mais leve). */
  function criarSprites() {
    const tamanho = Math.ceil((raio * 2 + 8) * tela.dpr);
    const fazer = (desenho) => {
      const c = document.createElement('canvas');
      c.width = tamanho;
      c.height = tamanho;
      const g = c.getContext('2d');
      g.scale(tela.dpr, tela.dpr);
      g.translate(raio + 4, raio + 4);
      desenho(g);
      return c;
    };
    const [c1, c2] = folha.cores;
    sprites = {
      tamanho: tamanho / tela.dpr,
      cheia: fazer((g) => {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.ellipse(2, 4, raio, raio * 0.95, 0, 0, TAU);
        g.fill();
        const corpo = g.createRadialGradient(-raio * 0.35, -raio * 0.4, raio * 0.05, 0, 0, raio);
        corpo.addColorStop(0, 'rgba(255,255,255,0.95)');
        corpo.addColorStop(0.25, `${c1}cc`);
        corpo.addColorStop(0.85, `${c2}aa`);
        corpo.addColorStop(1, `${c2}ee`);
        g.fillStyle = corpo;
        g.beginPath();
        g.arc(0, 0, raio, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        g.ellipse(-raio * 0.38, -raio * 0.42, raio * 0.24, raio * 0.12, -0.7, 0, TAU);
        g.fill();
      }),
      estourada: fazer((g) => {
        g.fillStyle = `${c2}33`;
        g.strokeStyle = 'rgba(255,255,255,0.28)';
        g.lineWidth = 1.2;
        g.beginPath();
        for (let i = 0; i <= 12; i++) {
          const ang = (i / 12) * TAU;
          const r = raio * (0.78 + (i % 2 ? 0.1 : -0.04));
          g.lineTo(Math.cos(ang) * r, Math.sin(ang) * r * 0.85);
        }
        g.closePath();
        g.fill();
        g.stroke();
        g.beginPath();
        g.moveTo(-raio * 0.4, -raio * 0.1);
        g.lineTo(raio * 0.1, raio * 0.15);
        g.lineTo(raio * 0.35, -raio * 0.2);
        g.stroke();
      }),
    };
  }

  function montarFolha() {
    const caixa = palco.getBoundingClientRect();
    if (caixa.width < 2) return;
    tela.l = caixa.width;
    tela.a = caixa.height;
    tela.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(tela.l * tela.dpr);
    canvas.height = Math.round(tela.a * tela.dpr);

    lado = semHover() ? 58 : 68;
    raio = lado * 0.43;
    const topo = 130;
    const base = 80;
    const colunas = Math.max(3, Math.floor((tela.l - 24) / lado));
    const linhas = Math.max(3, Math.floor((tela.a - topo - base) / (lado * 0.87)));
    const larguraFolha = colunas * lado;
    const x0 = (tela.l - larguraFolha) / 2 + lado / 2;
    const y0 = topo + (tela.a - topo - base - linhas * lado * 0.87) / 2 + lado / 2;
    bolhas = [];
    for (let linha = 0; linha < linhas; linha++) {
      const deslocada = linha % 2 === 1;
      for (let coluna = 0; coluna < colunas - (deslocada ? 1 : 0); coluna++) {
        bolhas.push({
          x: x0 + coluna * lado + (deslocada ? lado / 2 : 0),
          y: y0 + linha * lado * 0.87,
          linha,
          coluna,
          cheia: true,
          volta: 0,
          escala: 1,
          surgir: 0,
        });
      }
    }
    selecionada = clamp(selecionada, -1, bolhas.length - 1);
    criarSprites();
  }

  const observador = new ResizeObserver(() => montarFolha());
  observador.observe(palco);

  function novaFolha() {
    config.folha = (config.folha + 1) % FOLHAS.length;
    gravar('bolha-config', config);
    folha = FOLHAS[config.folha];
    criarSprites();
    // Onda: as bolhas voltam da esquerda para a direita
    for (const b of bolhas) {
      b.cheia = true;
      b.volta = 0;
      b.surgir = movimentoReduzido() ? 0 : (b.x / tela.l) * 0.6 + 0.001;
      b.escala = movimentoReduzido() ? 1 : 0;
    }
    raiz.style.setProperty('--c1', folha.cores[0]);
    raiz.style.setProperty('--c2', folha.cores[1]);
    audio.tocar('tema');
  }

  /* ---------- Estourar ---------- */

  function estourar(bolha) {
    if (!bolha.cheia || bolha.surgir > 0) return;
    bolha.cheia = false;
    bolha.volta = aleatorio(5, 9);
    bolha.escala = 1.25;
    contagem++;
    const agora = performance.now();
    combo.quantidade = agora - combo.ultimo < 320 ? combo.quantidade + 1 : 1;
    combo.ultimo = agora;
    audio.tocar('estouro', { tamanho: aleatorio(0.25, 0.75), pan: clamp((bolha.x / tela.l) * 2 - 1, -1, 1) * 0.7, intervaloMin: 0.012 });
    const quantidade = movimentoReduzido() ? 3 : 7;
    for (let i = 0; i < quantidade; i++) {
      const ang = aleatorio(0, TAU);
      const vel = aleatorio(60, 200);
      particulas.push({ x: bolha.x, y: bolha.y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, vida: aleatorio(0.3, 0.55), cor: escolher([...folha.cores, '#ffffff']) });
    }
    if (combo.quantidade > 0 && combo.quantidade % 10 === 0) {
      textos.push({ x: bolha.x, y: bolha.y - 20, texto: `x${combo.quantidade}!`, vida: 1 });
      audio.tocar('combo', { n: combo.quantidade / 10 });
    }
    progresso.registrar('bolha:estouro');
    progresso.definirRecorde('plastico-bolha', 'sequencia', combo.quantidade);
    atualizarHud();
  }

  function bolhaEm(x, y) {
    for (const b of bolhas) if ((b.x - x) ** 2 + (b.y - y) ** 2 < raio * raio * 1.1) return b;
    return null;
  }

  function atualizarHud() {
    $('[data-contagem]').textContent = contagem.toLocaleString('pt-BR');
    $('[data-combo]').textContent = `x${combo.quantidade}`;
    $('[data-total]').textContent = progresso.contador('bolha:estouro').toLocaleString('pt-BR');
  }

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (!sprites) return;
    tempo += dt;
    if (performance.now() - combo.ultimo > 900 && combo.quantidade) {
      combo.quantidade = 0;
      atualizarHud();
    }

    for (const b of bolhas) {
      if (b.surgir > 0) {
        b.surgir -= dt;
        if (b.surgir <= 0) b.surgir = 0;
        continue;
      }
      if (!b.cheia) {
        b.volta -= dt;
        if (b.volta <= 0) {
          b.cheia = true;
          b.escala = 0;
        }
      }
      // Mola simples para a escala voltar a 1 com um leve "boing"
      b.escala += (1 - b.escala) * Math.min(1, dt * 10);
    }

    const { l, a, dpr } = tela;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fundo = ctx.createLinearGradient(0, 0, l, a);
    fundo.addColorStop(0, '#0c1a3a');
    fundo.addColorStop(1, '#1a0b3a');
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, l, a);

    const metade = sprites.tamanho / 2;
    bolhas.forEach((b, i) => {
      if (b.surgir > 0) return;
      const sprite = b.cheia ? sprites.cheia : sprites.estourada;
      const balanco = b.cheia && !movimentoReduzido() ? 1 + Math.sin(tempo * 2 + b.x * 0.05 + b.y * 0.03) * 0.015 : 1;
      const s = Math.max(0.01, b.escala * balanco);
      ctx.drawImage(sprite, b.x - metade * s, b.y - metade * s, sprites.tamanho * s, sprites.tamanho * s);
      if (i === selecionada) {
        ctx.strokeStyle = '#ffd60a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, raio + 5, 0, TAU);
        ctx.stroke();
      }
    });

    ctx.globalCompositeOperation = 'lighter';
    for (const p of particulas) {
      p.vy += 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= dt;
      ctx.globalAlpha = clamp(p.vida * 2.5, 0, 1);
      ctx.fillStyle = p.cor;
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.font = '26px Bungee, sans-serif';
    for (const t of textos) {
      t.y -= 50 * dt;
      t.vida -= dt;
      ctx.globalAlpha = clamp(t.vida * 1.6, 0, 1);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = folha.cores[0];
      ctx.shadowBlur = 16;
      ctx.fillText(t.texto, t.x, t.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    for (let i = particulas.length - 1; i >= 0; i--) if (particulas[i].vida <= 0) particulas.splice(i, 1);
    for (let i = textos.length - 1; i >= 0; i--) if (textos[i].vida <= 0) textos.splice(i, 1);
  });

  /* ---------- Entrada ---------- */

  let pressionado = false;
  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    pressionado = true;
    selecionada = -1;
    const { x, y } = posicao(e);
    const bolha = bolhaEm(x, y);
    if (bolha) estourar(bolha);
  });
  palco.addEventListener('pointermove', (e) => {
    if (!pressionado) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) {
      const { x, y } = posicao(ev);
      const bolha = bolhaEm(x, y);
      if (bolha) estourar(bolha);
    }
  });
  const soltar = () => {
    pressionado = false;
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button')) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'n') {
      novaFolha();
      return;
    }
    if (!bolhas.length) return;
    if (selecionada < 0) selecionada = Math.floor(bolhas.length / 2);
    const atual = bolhas[selecionada];
    const vizinha = (dLinha, dColuna) => {
      let melhor = selecionada;
      let menor = Infinity;
      bolhas.forEach((b, i) => {
        if (b.linha !== atual.linha + dLinha) return;
        const distancia = Math.abs(b.x - (atual.x + dColuna * lado));
        if (distancia < menor) {
          menor = distancia;
          melhor = i;
        }
      });
      return melhor;
    };
    if (e.key === 'ArrowLeft') selecionada = vizinha(0, -1);
    else if (e.key === 'ArrowRight') selecionada = vizinha(0, 1);
    else if (e.key === 'ArrowUp') selecionada = vizinha(-1, 0);
    else if (e.key === 'ArrowDown') selecionada = vizinha(1, 0);
    else if (tecla === ' ' || tecla === 'enter') estourar(atual);
    else return;
    e.preventDefault();
  });

  $('[data-nova-folha]').addEventListener('click', novaFolha);

  raiz.style.setProperty('--c1', folha.cores[0]);
  raiz.style.setProperty('--c2', folha.cores[1]);
  montarFolha();
  atualizarHud();

  return {
    destruir() {
      pararLoop();
      observador.disconnect();
    },
  };
}
