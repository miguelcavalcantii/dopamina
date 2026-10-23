/**
 * Slime: corpo macio feito de um anel de pontos ligados por molas, com pressão interna
 * e memória de forma. Agarre e estique (vários dedos ao mesmo tempo), cutuque com toques
 * rápidos e veja ele voltar balançando. Integração de Verlet com passo fixo.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js';
import { icone } from '../../core/icones.js';
import { ler, gravar } from '../../core/armazenamento.js';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, movimentoReduzido } from '../../core/util.js';

const TAU = Math.PI * 2;
const PONTOS = 44;
const PASSO = 1 / 120;
const ITERACOES = 4;

const PALETAS = [
  { id: 'lima', nome: 'Lima', cores: ['#efffd0', '#7bff4a', '#00a35c'], brilho: '#7bff4a' },
  { id: 'chiclete', nome: 'Chiclete', cores: ['#ffe3f3', '#ff70c0', '#b0106a'], brilho: '#ff70c0' },
  { id: 'galaxia', nome: 'Galáxia', cores: ['#efe4ff', '#8b5cff', '#2a0b8e'], brilho: '#a87bff' },
  { id: 'oceano', nome: 'Oceano', cores: ['#dbfcff', '#22c4ff', '#0048b0'], brilho: '#22c4ff' },
  { id: 'lava', nome: 'Lava', cores: ['#fff3b8', '#ff7a18', '#c2180a'], brilho: '#ff7a18' },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/slime.css', import.meta.url));

  const config = { paleta: 'lima', rosto: true, glitter: true, ...ler('slime-config', {}) };
  const salvar = () => gravar('slime-config', config);

  raiz.classList.add('slime');
  raiz.innerHTML = `
    <div class="slime__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Slime. Agarre e estique com o mouse ou os dedos, toque rápido para cutucar. Teclado: setas esticam, espaço cutuca.">
      <canvas class="slime__canvas"></canvas>
    </div>
    <p class="dica-palco" data-dica>Agarre e estique<small>toque rápido para cutucar · use vários dedos</small></p>
    <div class="doca vidro-fosco slime__doca" role="region" aria-label="Controles do slime">
      <div class="doca__linha">
        <span class="doca__rotulo">COR</span>
        ${PALETAS.map((p) => `<button type="button" class="amostra-tema" data-paleta="${p.id}" style="--amostra:radial-gradient(circle at 35% 30%, ${p.cores[0]}, ${p.cores[1]} 45%, ${p.cores[2]});--brilho:${p.brilho}" aria-pressed="${p.id === config.paleta}" aria-label="${p.nome}" title="${p.nome}"></button>`).join('')}
        <button type="button" class="chip" data-rosto aria-pressed="${config.rosto}">${icone('estrela')}<span>Rostinho</span></button>
        <button type="button" class="chip" data-glitter aria-pressed="${config.glitter}">${icone('brilho')}<span>Glitter</span></button>
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.slime__palco');
  const canvas = $('.slime__canvas');
  const g = canvas.getContext('2d');

  let tela = { l: 1, a: 1, dpr: 1 };
  let raio = 100;
  let centro = { x: 0, y: 0 };
  const pontos = Array.from({ length: PONTOS }, () => ({ x: 0, y: 0, px: 0, py: 0 }));
  const glitter = Array.from({ length: 46 }, () => ({ angulo: aleatorio(0, TAU), fracao: Math.sqrt(Math.random()) * 0.85, fase: aleatorio(0, TAU), tamanho: aleatorio(1, 2.6) }));
  let paleta = PALETAS.find((p) => p.id === config.paleta) ?? PALETAS[0];
  let iniciado = false;
  let acumulador = 0;
  let tempo = 0;
  let textura = null;
  let olhar = { x: 0, y: 0 };

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      raio = Math.min(tela.l, tela.a - 140) * 0.24;
      centro = { x: tela.l / 2, y: tela.a / 2 - 20 };
      if (!iniciado) {
        pontos.forEach((p, i) => {
          const ang = (i / PONTOS) * TAU;
          p.x = p.px = centro.x + Math.cos(ang) * raio;
          p.y = p.py = centro.y + Math.sin(ang) * raio;
        });
        iniciado = true;
      }
    },
  });

  /* ---------- Física ---------- */

  const pegadas = new Map(); // ponteiro → { alvos: [{ indice, peso, dx, dy }], x, y, inicio, moveu }

  function centroide() {
    let x = 0;
    let y = 0;
    for (const p of pontos) {
      x += p.x;
      y += p.y;
    }
    return { x: x / PONTOS, y: y / PONTOS };
  }

  function area() {
    let soma = 0;
    for (let i = 0; i < PONTOS; i++) {
      const a = pontos[i];
      const b = pontos[(i + 1) % PONTOS];
      soma += a.x * b.y - b.x * a.y;
    }
    return soma / 2;
  }

  function restringirDistancia(a, b, repouso, rigidez) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    const correcao = ((d - repouso) / d) * 0.5 * rigidez;
    a.x += dx * correcao;
    a.y += dy * correcao;
    b.x -= dx * correcao;
    b.y -= dy * correcao;
  }

  function passoFisica() {
    // Verlet com amortecimento
    for (const p of pontos) {
      const vx = (p.x - p.px) * 0.985;
      const vy = (p.y - p.py) * 0.985;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;
    }

    const c = centroide();
    // O corpo todo volta devagar para o centro da tela
    // Enquanto alguém segura, o corpo fica mais "preso" ao centro e estica em vez de deslizar
    const ancora = pegadas.size ? 0.02 : 0.004;
    const puxaX = (centro.x - c.x) * ancora;
    const puxaY = (centro.y - c.y) * ancora;
    pontos.forEach((p, i) => {
      p.x += puxaX;
      p.y += puxaY;
      // Memória de forma: cada ponto lembra onde ficava no círculo
      const ang = (i / PONTOS) * TAU;
      const memoria = pegadas.size ? 0.005 : 0.012;
      p.x += (c.x + Math.cos(ang) * raio - p.x) * memoria;
      p.y += (c.y + Math.sin(ang) * raio - p.y) * memoria;
    });

    // Ponteiros puxando os pontos agarrados
    for (const pegada of pegadas.values()) {
      for (const alvo of pegada.alvos) {
        const p = pontos[alvo.indice];
        p.x += (pegada.x + alvo.dx - p.x) * 0.35 * alvo.peso;
        p.y += (pegada.y + alvo.dy - p.y) * 0.35 * alvo.peso;
      }
    }

    const repouso1 = 2 * raio * Math.sin(Math.PI / PONTOS);
    const repouso2 = 2 * raio * Math.sin((2 * Math.PI) / PONTOS);
    const areaAlvo = Math.PI * raio * raio;
    for (let k = 0; k < ITERACOES; k++) {
      for (let i = 0; i < PONTOS; i++) {
        restringirDistancia(pontos[i], pontos[(i + 1) % PONTOS], repouso1, 0.9);
        restringirDistancia(pontos[i], pontos[(i + 2) % PONTOS], repouso2, 0.12);
      }
      // Pressão: empurra a borda para fora (ou para dentro) para manter a área
      const diferenca = (areaAlvo - area()) / (PONTOS * repouso1);
      const empurrao = clamp(diferenca * 0.5, -6, 6);
      for (let i = 0; i < PONTOS; i++) {
        const antes = pontos[(i - 1 + PONTOS) % PONTOS];
        const depois = pontos[(i + 1) % PONTOS];
        let nx = depois.y - antes.y;
        let ny = -(depois.x - antes.x);
        const d = Math.hypot(nx, ny) || 1;
        nx /= d;
        ny /= d;
        pontos[i].x += nx * empurrao;
        pontos[i].y += ny * empurrao;
      }
    }
  }

  /** Quanto o slime está esticado (0 = redondo). */
  function esticamento() {
    const c = centroide();
    let maior = 0;
    for (const p of pontos) maior = Math.max(maior, Math.hypot(p.x - c.x, p.y - c.y));
    return clamp(maior / raio - 1, 0, 2);
  }

  /* ---------- Interação ---------- */

  function agarrar(id, x, y) {
    const c = centroide();
    const distanciaCentro = Math.hypot(x - c.x, y - c.y);
    if (distanciaCentro > raio * 1.6) return false;
    // Pega os pontos da borda mais próximos, com peso pela distância
    const alvos = [];
    pontos.forEach((p, indice) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < raio * 0.75) alvos.push({ indice, peso: 1 - d / (raio * 0.75), dx: p.x - x, dy: p.y - y });
    });
    if (!alvos.length) {
      let melhor = 0;
      pontos.forEach((p, i) => {
        if (Math.hypot(p.x - x, p.y - y) < Math.hypot(pontos[melhor].x - x, pontos[melhor].y - y)) melhor = i;
      });
      alvos.push({ indice: melhor, peso: 1, dx: pontos[melhor].x - x, dy: pontos[melhor].y - y });
    }
    pegadas.set(id, { alvos, x, y, inicio: performance.now(), moveu: false, origemX: x, origemY: y });
    audio.tocar('squish', { tom: aleatorio(0.9, 1.15), volume: 0.6, intervaloMin: 0.05 });
    progresso.registrar('slime:aperto');
    return true;
  }

  function cutucar(x, y, forca = 1) {
    for (const p of pontos) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > raio * 1.2) continue;
      const impulso = (1 - d / (raio * 1.2)) * 22 * forca;
      // Afunda a borda: empurra os pontos para longe do toque (cria a covinha)
      p.px -= (dx / d) * -impulso * 0.5;
      p.py -= (dy / d) * -impulso * 0.5;
      p.x += (x - p.x) * 0.15 * (1 - d / (raio * 1.2)) * forca;
      p.y += (y - p.y) * 0.15 * (1 - d / (raio * 1.2)) * forca;
    }
    audio.tocar('squish', { tom: aleatorio(1.1, 1.4), volume: 0.8 });
    progresso.registrar('slime:aperto');
  }

  function soltar(id) {
    const pegada = pegadas.get(id);
    if (!pegada) return;
    pegadas.delete(id);
    const estica = esticamento();
    if (!pegada.moveu && performance.now() - pegada.inicio < 220) {
      cutucar(pegada.x, pegada.y);
    } else {
      audio.tocar('squish', { tom: 0.75 + estica * 0.2, volume: clamp(0.4 + estica, 0.4, 1.2) });
    }
  }

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const { x, y } = posicao(e);
    if (agarrar(e.pointerId, x, y)) {
      capturarPonteiro(palco, e.pointerId);
      $('[data-dica]').classList.add('dica-palco--oculta');
    }
  });
  palco.addEventListener('pointermove', (e) => {
    const { x, y } = posicao(e);
    olhar = { x, y };
    const pegada = pegadas.get(e.pointerId);
    if (!pegada) return;
    pegada.x = x;
    pegada.y = y;
    if (Math.hypot(x - pegada.origemX, y - pegada.origemY) > 8) pegada.moveu = true;
  });
  palco.addEventListener('pointerup', (e) => soltar(e.pointerId));
  palco.addEventListener('pointercancel', (e) => soltar(e.pointerId));

  // Teclado: setas esticam naquela direção enquanto a tecla está apertada
  const DIRECOES = { ArrowLeft: Math.PI, ArrowRight: 0, ArrowUp: -Math.PI / 2, ArrowDown: Math.PI / 2 };
  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button')) return;
    if (e.key in DIRECOES) {
      e.preventDefault();
      if (e.repeat || pegadas.has(e.key)) return;
      const c = centroide();
      const ang = DIRECOES[e.key];
      const x = c.x + Math.cos(ang) * raio;
      const y = c.y + Math.sin(ang) * raio;
      agarrar(e.key, x, y);
      const pegada = pegadas.get(e.key);
      pegada.x = c.x + Math.cos(ang) * raio * 1.9;
      pegada.y = c.y + Math.sin(ang) * raio * 1.9;
      pegada.moveu = true;
      $('[data-dica]').classList.add('dica-palco--oculta');
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (e.target !== palco) return;
      e.preventDefault();
      const c = centroide();
      cutucar(c.x + aleatorio(-raio * 0.5, raio * 0.5), c.y - raio * 0.6, 1.4);
    }
  });
  raiz.addEventListener('keyup', (e) => {
    if (e.key in DIRECOES) soltar(e.key);
  });

  /* ---------- Desenho ---------- */

  function caminhoSuave() {
    g.beginPath();
    const ultimo = pontos[PONTOS - 1];
    const primeiro = pontos[0];
    g.moveTo((ultimo.x + primeiro.x) / 2, (ultimo.y + primeiro.y) / 2);
    for (let i = 0; i < PONTOS; i++) {
      const a = pontos[i];
      const b = pontos[(i + 1) % PONTOS];
      g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    g.closePath();
  }

  /** Distância do centro até a borda numa direção (para posicionar glitter e brilho). */
  function raioNaDirecao(c, angulo) {
    let melhor = raio;
    let menorDiferenca = Infinity;
    for (const p of pontos) {
      const diferenca = Math.abs(((Math.atan2(p.y - c.y, p.x - c.x) - angulo + Math.PI * 3) % TAU) - Math.PI);
      if (diferenca < menorDiferenca) {
        menorDiferenca = diferenca;
        melhor = Math.hypot(p.x - c.x, p.y - c.y);
      }
    }
    return melhor;
  }

  function desenhar() {
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fundo = g.createRadialGradient(l / 2, a / 2, 0, l / 2, a / 2, Math.max(l, a) * 0.7);
    fundo.addColorStop(0, '#2a1060');
    fundo.addColorStop(1, '#0d0628');
    g.fillStyle = fundo;
    g.fillRect(0, 0, l, a);

    const c = centroide();
    const [claro, medio, escuro] = paleta.cores;

    // Sombra no "chão"
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(c.x, centro.y + raio * 1.15, raio * 0.95, raio * 0.18, 0, 0, TAU);
    g.fill();

    // Corpo
    const corpo = g.createRadialGradient(c.x - raio * 0.35, c.y - raio * 0.45, raio * 0.1, c.x, c.y, raio * 1.4);
    corpo.addColorStop(0, claro);
    corpo.addColorStop(0.4, medio);
    corpo.addColorStop(1, escuro);
    g.save();
    g.shadowColor = paleta.brilho;
    g.shadowBlur = 40;
    g.fillStyle = corpo;
    caminhoSuave();
    g.fill();
    g.restore();

    // Glitter preso ao corpo
    if (config.glitter) {
      g.save();
      caminhoSuave();
      g.clip();
      for (const b of glitter) {
        const r = raioNaDirecao(c, b.angulo) * b.fracao;
        const brilha = movimentoReduzido() ? 0.7 : 0.45 + 0.55 * Math.abs(Math.sin(tempo * 2 + b.fase));
        g.fillStyle = `rgba(255,255,255,${brilha})`;
        g.beginPath();
        g.arc(c.x + Math.cos(b.angulo) * r, c.y + Math.sin(b.angulo) * r, b.tamanho, 0, TAU);
        g.fill();
      }
      g.restore();
    }

    // Brilho molhado
    const rTopo = raioNaDirecao(c, -Math.PI * 0.72);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(c.x - rTopo * 0.42, c.y - rTopo * 0.5, raio * 0.22, raio * 0.1, -0.6, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(c.x - rTopo * 0.15, c.y - rTopo * 0.66, raio * 0.04, 0, TAU);
    g.fill();

    if (config.rosto) desenharRosto(c);
  }

  function desenharRosto(c) {
    const estica = esticamento();
    const piscando = tempo % 4.2 < 0.13;
    const dx = clamp((olhar.x - c.x) / tela.l, -0.5, 0.5) * raio * 0.12;
    const dy = clamp((olhar.y - c.y) / tela.a, -0.5, 0.5) * raio * 0.12;
    g.fillStyle = '#1a0b3a';
    for (const lado of [-1, 1]) {
      const ox = c.x + lado * raio * 0.28;
      const oy = c.y - raio * 0.12;
      g.beginPath();
      g.ellipse(ox + dx, oy + dy, raio * 0.085, piscando ? raio * 0.012 : raio * (0.12 + estica * 0.05), 0, 0, TAU);
      g.fill();
      if (!piscando) {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(ox + dx - raio * 0.025, oy + dy - raio * 0.04, raio * 0.028, 0, TAU);
        g.fill();
        g.fillStyle = '#1a0b3a';
      }
    }
    // Boca: sorriso que vira "O" quando estica
    g.strokeStyle = '#1a0b3a';
    g.lineWidth = Math.max(2, raio * 0.035);
    g.lineCap = 'round';
    g.beginPath();
    if (estica > 0.35) {
      g.ellipse(c.x, c.y + raio * 0.2, raio * 0.06, raio * (0.06 + estica * 0.05), 0, 0, TAU);
      g.fill();
    } else {
      g.arc(c.x, c.y + raio * 0.12, raio * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
    // Bochechas
    g.fillStyle = 'rgba(255,90,170,0.35)';
    for (const lado of [-1, 1]) {
      g.beginPath();
      g.ellipse(c.x + lado * raio * 0.45, c.y + raio * 0.1, raio * 0.09, raio * 0.05, 0, 0, TAU);
      g.fill();
    }
  }

  /* ---------- Loop ---------- */

  let esticamentoAnterior = 0;
  const pararLoop = aoQuadro((dt) => {
    if (!iniciado) return;
    tempo += dt;
    acumulador += dt;
    let passos = 0;
    while (acumulador >= PASSO && passos < 6) {
      passoFisica();
      acumulador -= PASSO;
      passos++;
    }
    if (acumulador > PASSO) acumulador = 0;

    // Som contínuo enquanto estica (proporcional à velocidade de deformação)
    const estica = esticamento();
    if (!textura && audio.ativo) textura = audio.iniciarTextura({ filtro: 'bandpass', freq: 380, q: 2.5, volumeMaximo: 0.16 });
    textura?.atualizar(pegadas.size ? clamp(Math.abs(estica - esticamentoAnterior) * 40, 0, 1) : 0, 250 + estica * 500);
    esticamentoAnterior = estica;

    desenhar();
  });

  /* ---------- Controles ---------- */

  $('.doca').addEventListener('click', (e) => {
    const botao = e.target.closest('button');
    if (!botao) return;
    if (botao.dataset.paleta) {
      config.paleta = botao.dataset.paleta;
      paleta = PALETAS.find((p) => p.id === config.paleta);
      raiz.querySelectorAll('[data-paleta]').forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));
      const c = centroide();
      cutucar(c.x, c.y - raio * 0.8, 0.8);
    } else if ('rosto' in botao.dataset || 'glitter' in botao.dataset) {
      const chave = 'rosto' in botao.dataset ? 'rosto' : 'glitter';
      config[chave] = !config[chave];
      botao.setAttribute('aria-pressed', String(config[chave]));
    }
    salvar();
  });

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      textura?.parar();
    },
  };
}
