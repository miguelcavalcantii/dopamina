/**
 * Pinball Neon. Mesa em unidades próprias (600 × 1000), escalada para a tela.
 * Física: gravidade da mesa inclinada, colisão com segmentos (paredes, estilingues,
 * alvos), círculos (batedores que chutam a bola) e flippers que giram (a velocidade
 * da superfície do flipper entra no rebote). 8 subpassos por quadro.
 * Regras: 3 bolas; batedores, estilingues, pistas do topo (completar = multiplicador),
 * 3 alvos que caem (completar = trava; 2 travas = multibola) e a rampa (volta pelo alto).
 * Controles: ← / Z e → / M para os flippers, espaço segura e solta a mola. No toque:
 * metade esquerda e metade direita da tela; botão Lançar.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { criarPainelJogo } from '../../core/painel-jogo.js?v=202610231621';
import { criarSequenciador } from '../../core/sequenciador.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { aleatorio, carregarEstilo, clamp, movimentoReduzido, semHover } from '../../core/util.js?v=202610231621';

const L = 600;
const A = 1000;
const RAIO = 11;
const GRAVIDADE = 1350;
const SUBPASSOS = 8;
const VEL_MAX = 2600;
const BOLAS_POR_JOGO = 3;
const SALVA_BOLA = 6;
const CORES = { ciano: '#22e4ff', rosa: '#ff2e97', amarelo: '#ffd60a', lima: '#a3ff12', violeta: '#8b5cff', laranja: '#ff7a18' };

/* ---------- Geometria da mesa ---------- */

const arco = (cx, cy, r, a0, a1, passos) => Array.from({ length: passos + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / passos;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});

/** Polilinhas de parede (cada par de pontos vira um segmento). */
const PAREDES = [
  // Contorno: lateral esquerda, arco do topo até a lateral direita (que desce até o fundo da canaleta)
  [[30, 770], [30, 290], ...arco(300, 290, 270, Math.PI, Math.PI * 2, 28).slice(1), [570, 985]],
  // Parede interna da canaleta de lançamento
  [[530, 985], [530, 330]],
  // Guias das pistas internas até os flippers
  [[30, 770], [178, 892]],
  [[530, 770], [422, 892]],
  // Postes das pistas do topo
  [[195, 140], [195, 200]],
  [[265, 120], [265, 190]],
  [[335, 120], [335, 190]],
  [[405, 140], [405, 200]],
];

/** Estilingues: a aresta de chute é a de `a` para `b`. */
const ESTILINGUES = [
  { pontos: [[95, 690], [95, 790], [165, 838]], a: [95, 690], b: [165, 838], normal: [0.88, -0.47] },
  { pontos: [[505, 690], [505, 790], [435, 838]], a: [505, 690], b: [435, 838], normal: [-0.88, -0.47] },
];

const BATEDORES = [
  { x: 228, y: 320, r: 32, cor: CORES.rosa },
  { x: 372, y: 320, r: 32, cor: CORES.ciano },
  { x: 300, y: 430, r: 32, cor: CORES.amarelo },
];

const PISTAS_TOPO = [{ x: 230, y: 165 }, { x: 300, y: 150 }, { x: 370, y: 165 }];
const ALVOS = [{ x: 46, y: 470 }, { x: 46, y: 525 }, { x: 46, y: 580 }];

/** Rampa: entrada à direita; se a bola entra subindo rápido, ela percorre o caminho. */
const RAMPA = {
  entrada: { x0: 440, x1: 520, y0: 470, y1: 540 },
  caminho: [[480, 505], [500, 380], [505, 250], [450, 130], [300, 70], [150, 130], [95, 250], [80, 420], [70, 600], [75, 740]],
};

const PORTAO = { a: [530, 330], b: [570, 285] }; // só segura a bola que desce (não deixa voltar à canaleta)

const FLIPPERS = [
  { px: 186, py: 902, comprimento: 92, repouso: 0.5, ativo: -0.5, lado: 1 },
  { px: 414, py: 902, comprimento: 92, repouso: Math.PI - 0.5, ativo: Math.PI + 0.5, lado: -1 },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/pinball.css?v=202610231621', import.meta.url));

  const config = { musica: true, ...ler('pinball-config', {}) };

  raiz.classList.add('pinball');
  raiz.innerHTML = `
    <div class="pinball__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Pinball. Seta esquerda ou Z e seta direita ou M para os flippers. Segure espaço e solte para lançar. No toque: lados da tela.">
      <canvas class="pinball__canvas"></canvas>
    </div>
    <div class="pinball__hud" data-hud>
      <div class="pinball__pontos"><span data-pontos>0</span><small>pontos</small></div>
      <div class="pinball__info">
        <span class="pinball__mult" data-mult>x1</span>
        <span class="pinball__bolas" data-bolas></span>
      </div>
    </div>
    <p class="pinball__letreiro" data-letreiro aria-live="polite"></p>
    <div class="cantos-jogo">
      <button type="button" class="chip" data-musica aria-pressed="${config.musica}">${icone('musica')}<span>Música</span></button>
      <button type="button" class="chip pinball__lancar" data-lancar hidden>${icone('seta')}<span>Segure para lançar</span></button>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.pinball__palco');
  const canvas = $('.pinball__canvas');
  const g = canvas.getContext('2d');
  const painel = criarPainelJogo(raiz);
  const letreiro = $('[data-letreiro]');

  let tela = { l: 1, a: 1, dpr: 1 };
  const vista = { escala: 1, x: 0, y: 0 };
  let camadaMesa = null;

  /* ---------- Segmentos e estado ---------- */

  const segmentos = [];
  for (const linha of PAREDES) for (let i = 0; i < linha.length - 1; i++) segmentos.push({ a: linha[i], b: linha[i + 1], tipo: 'parede' });
  for (const e of ESTILINGUES) {
    const [p0, p1, p2] = e.pontos;
    segmentos.push({ a: p0, b: p1, tipo: 'parede' }, { a: p1, b: p2, tipo: 'parede' }, { a: e.a, b: e.b, tipo: 'estilingue', estilingue: e });
  }

  const jogo = {
    fase: 'inicio', // 'lancar' | 'jogando' | 'fim'
    pontos: 0,
    bolasRestantes: BOLAS_POR_JOGO,
    mult: 1,
    pistas: [false, false, false],
    alvos: [true, true, true],
    travas: 0,
    salvaBola: 0,
    combo: 0,
    ultimaRampa: 0,
    carga: 0,
    carregando: false,
  };
  let bolas = [];
  const flippers = FLIPPERS.map((f) => ({ ...f, angulo: f.repouso, omega: 0, apertado: false }));
  const luzes = { batedores: [0, 0, 0], estilingues: [0, 0], pistas: [0, 0, 0], alvos: [0, 0, 0], rampa: 0 };
  const particulas = [];
  const textos = [];
  let tempo = 0;

  const novaBola = (x, y, vx = 0, vy = 0) => ({ x, y, vx, vy, naRampa: null, rastro: [] });

  /* ---------- Física ---------- */

  function colidirSegmento(bola, s, restituicao = 0.45) {
    const [ax, ay] = s.a;
    const [bx, by] = s.b;
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp(((bola.x - ax) * dx + (bola.y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    let nx = bola.x - cx;
    let ny = bola.y - cy;
    const d = Math.hypot(nx, ny);
    if (d >= RAIO || d === 0) return false;
    nx /= d;
    ny /= d;
    bola.x = cx + nx * RAIO;
    bola.y = cy + ny * RAIO;
    const vn = bola.vx * nx + bola.vy * ny;
    if (vn < 0) {
      bola.vx -= (1 + restituicao) * vn * nx;
      bola.vy -= (1 + restituicao) * vn * ny;
      return -vn;
    }
    return false;
  }

  function colidirFlipper(bola, f) {
    const tx = f.px + Math.cos(f.angulo) * f.comprimento;
    const ty = f.py + Math.sin(f.angulo) * f.comprimento;
    const dx = tx - f.px;
    const dy = ty - f.py;
    const t = clamp(((bola.x - f.px) * dx + (bola.y - f.py) * dy) / (dx * dx + dy * dy), 0, 1);
    const cx = f.px + dx * t;
    const cy = f.py + dy * t;
    const espessura = 11 - t * 4; // mais grosso no pivô
    let nx = bola.x - cx;
    let ny = bola.y - cy;
    const d = Math.hypot(nx, ny);
    if (d >= RAIO + espessura || d === 0) return;
    nx /= d;
    ny /= d;
    bola.x = cx + nx * (RAIO + espessura);
    bola.y = cy + ny * (RAIO + espessura);
    // Velocidade da superfície do flipper no ponto de contato (ω × r)
    const sx = -f.omega * (cy - f.py);
    const sy = f.omega * (cx - f.px);
    const rx = bola.vx - sx;
    const ry = bola.vy - sy;
    const vn = rx * nx + ry * ny;
    if (vn < 0) {
      const e = 0.32;
      bola.vx = sx + rx - (1 + e) * vn * nx;
      bola.vy = sy + ry - (1 + e) * vn * ny;
      if (Math.abs(f.omega) > 1 && -vn > 200) audio.tocar('quique', { tom: 0.8, volume: 0.6 });
    }
  }

  function passoBola(bola, dt) {
    if (bola.naRampa) return passoRampa(bola, dt);
    bola.vy += GRAVIDADE * dt;
    const v = Math.hypot(bola.vx, bola.vy);
    if (v > VEL_MAX) {
      bola.vx *= VEL_MAX / v;
      bola.vy *= VEL_MAX / v;
    }
    bola.x += bola.vx * dt;
    bola.y += bola.vy * dt;

    for (const s of segmentos) {
      const impacto = colidirSegmento(bola, s, s.tipo === 'estilingue' ? 0.3 : 0.45);
      if (impacto && s.tipo === 'estilingue' && impacto > 120) {
        // Estilingue chuta a bola na direção da sua normal
        const [nx, ny] = s.estilingue.normal;
        bola.vx += nx * 700;
        bola.vy += ny * 700;
        const i = ESTILINGUES.indexOf(s.estilingue);
        luzes.estilingues[i] = 1;
        marcar(10, bola.x, bola.y, CORES.lima);
        audio.tocar('bumper', { tom: 1.4, pan: i ? 0.5 : -0.5 });
      } else if (impacto && impacto > 260) {
        audio.tocar('quique', { volume: clamp(impacto / 1200, 0.2, 0.8), pan: clamp((bola.x / L) * 2 - 1, -1, 1) * 0.6 });
      }
    }
    // Portão da canaleta: só bloqueia quem desce
    if (bola.vy > 0 && bola.x > 520) colidirSegmento(bola, PORTAO, 0.3);

    for (const [i, b] of BATEDORES.entries()) {
      const dx = bola.x - b.x;
      const dy = bola.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < b.r + RAIO && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        bola.x = b.x + nx * (b.r + RAIO);
        bola.y = b.y + ny * (b.r + RAIO);
        const vn = bola.vx * nx + bola.vy * ny;
        bola.vx -= 2 * vn * nx;
        bola.vy -= 2 * vn * ny;
        bola.vx += nx * 520;
        bola.vy += ny * 520;
        luzes.batedores[i] = 1;
        explosao(b.x + nx * b.r, b.y + ny * b.r, b.cor, 18);
        marcar(100, b.x, b.y - b.r - 10, b.cor);
        audio.tocar('bumper', { tom: 0.9 + i * 0.12, pan: (b.x / L) * 2 - 1, intervaloMin: 0.03 });
        progresso.registrar('pinball:batedor');
      }
    }

    for (const f of flippers) colidirFlipper(bola, f);

    // Alvos que caem (na parede esquerda)
    for (const [i, alvo] of ALVOS.entries()) {
      if (!jogo.alvos[i]) continue;
      if (Math.abs(bola.y - alvo.y) < 22 && bola.x - RAIO < alvo.x + 10 && bola.x > alvo.x) {
        jogo.alvos[i] = false;
        luzes.alvos[i] = 1;
        bola.x = alvo.x + 10 + RAIO;
        bola.vx = Math.abs(bola.vx) * 0.6 + 150;
        marcar(250, alvo.x + 30, alvo.y, CORES.laranja);
        audio.tocar('acerto');
        if (jogo.alvos.every((a) => !a)) {
          jogo.travas++;
          marcar(3000, 140, 525, CORES.laranja, true);
          audio.tocar('trava');
          anunciar(jogo.travas >= 2 ? 'MULTIBOLA!' : 'BOLA TRAVADA · mais uma para a multibola');
          setTimeout(() => { jogo.alvos = [true, true, true]; }, 800);
          if (jogo.travas >= 2) {
            jogo.travas = 0;
            multibola();
          }
        }
      }
    }

    // Pistas do topo: acendem ao passar; as três = multiplicador
    for (const [i, p] of PISTAS_TOPO.entries()) {
      if (!jogo.pistas[i] && Math.hypot(bola.x - p.x, bola.y - p.y) < 22) {
        jogo.pistas[i] = true;
        luzes.pistas[i] = 1;
        marcar(500, p.x, p.y + 30, CORES.violeta);
        audio.tocar('coleta', { n: jogo.pistas.filter(Boolean).length });
        if (jogo.pistas.every(Boolean)) {
          jogo.mult = Math.min(5, jogo.mult + 1);
          jogo.pistas = [false, false, false];
          marcar(2000, 300, 230, CORES.violeta, true);
          anunciar(`MULTIPLICADOR x${jogo.mult}`);
          audio.tocar('nivel');
          progresso.definirRecorde('pinball', 'multiplicador', jogo.mult);
        }
      }
    }

    // Entrada da rampa
    const r = RAMPA.entrada;
    if (bola.x > r.x0 && bola.x < r.x1 && bola.y > r.y0 && bola.y < r.y1 && bola.vy < -650) {
      bola.naRampa = { indice: 0, t: 0, velocidade: Math.max(900, -bola.vy) };
      luzes.rampa = 1;
      audio.tocar('rampa');
    }

    bola.rastro.push([bola.x, bola.y]);
    if (bola.rastro.length > 8) bola.rastro.shift();
    return undefined;
  }

  function passoRampa(bola, dt) {
    const caminho = RAMPA.caminho;
    let andar = bola.naRampa.velocidade * dt;
    while (andar > 0 && bola.naRampa.indice < caminho.length - 1) {
      const [ax, ay] = caminho[bola.naRampa.indice];
      const [bx, by] = caminho[bola.naRampa.indice + 1];
      const trecho = Math.hypot(bx - ax, by - ay);
      const resta = trecho * (1 - bola.naRampa.t);
      if (andar < resta) {
        bola.naRampa.t += andar / trecho;
        andar = 0;
      } else {
        andar -= resta;
        bola.naRampa.indice++;
        bola.naRampa.t = 0;
      }
    }
    const i = Math.min(bola.naRampa.indice, caminho.length - 2);
    const [ax, ay] = caminho[i];
    const [bx, by] = caminho[i + 1];
    const t = bola.naRampa.indice >= caminho.length - 1 ? 1 : bola.naRampa.t;
    bola.x = ax + (bx - ax) * t;
    bola.y = ay + (by - ay) * t;
    if (bola.naRampa.indice >= caminho.length - 1) {
      // Saiu da rampa na pista interna esquerda, descendo
      bola.naRampa = null;
      bola.vx = 120;
      bola.vy = 300;
      const agora = tempo;
      jogo.combo = agora - jogo.ultimaRampa < 8 ? jogo.combo + 1 : 1;
      jogo.ultimaRampa = agora;
      marcar(1500 * jogo.combo, 120, 700, CORES.ciano, true);
      anunciar(jogo.combo > 1 ? `RAMPA x${jogo.combo}!` : 'RAMPA!');
      progresso.registrar('pinball:rampa');
      audio.tocar('combo', { n: jogo.combo + 2 });
    }
    bola.rastro.push([bola.x, bola.y]);
    if (bola.rastro.length > 8) bola.rastro.shift();
  }

  function colisoesEntreBolas() {
    for (let i = 0; i < bolas.length; i++) {
      for (let k = i + 1; k < bolas.length; k++) {
        const a = bolas[i];
        const b = bolas[k];
        if (a.naRampa || b.naRampa) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d === 0 || d >= RAIO * 2) continue;
        const nx = dx / d;
        const ny = dy / d;
        const sobra = (RAIO * 2 - d) / 2;
        a.x -= nx * sobra;
        a.y -= ny * sobra;
        b.x += nx * sobra;
        b.y += ny * sobra;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          a.vx += vn * nx;
          a.vy += vn * ny;
          b.vx -= vn * nx;
          b.vy -= vn * ny;
        }
      }
    }
  }

  /* ---------- Pontos, efeitos e anúncios ---------- */

  function marcar(valor, x, y, cor, grande = false) {
    const total = valor * jogo.mult;
    jogo.pontos += total;
    textos.push({ x, y, texto: `+${total.toLocaleString('pt-BR')}`, cor, vida: 1, grande });
    $('[data-pontos]').textContent = jogo.pontos.toLocaleString('pt-BR');
  }

  function explosao(x, y, cor, quantidade) {
    const n = movimentoReduzido() ? Math.ceil(quantidade / 3) : quantidade;
    for (let i = 0; i < n; i++) {
      const a = aleatorio(0, Math.PI * 2);
      const v = aleatorio(120, 420);
      particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: aleatorio(0.4, 0.8), cor });
    }
    if (particulas.length > 500) particulas.splice(0, particulas.length - 500);
  }

  let timerLetreiro = 0;
  function anunciar(texto) {
    clearTimeout(timerLetreiro);
    letreiro.textContent = texto;
    letreiro.classList.remove('pinball__letreiro--visivel');
    void letreiro.offsetWidth;
    letreiro.classList.add('pinball__letreiro--visivel');
    timerLetreiro = setTimeout(() => letreiro.classList.remove('pinball__letreiro--visivel'), 2200);
  }

  function atualizarHud() {
    $('[data-pontos]').textContent = jogo.pontos.toLocaleString('pt-BR');
    $('[data-mult]').textContent = `x${jogo.mult}`;
    $('[data-bolas]').innerHTML = Array.from({ length: BOLAS_POR_JOGO }, (_, i) => `<span class="${i < jogo.bolasRestantes ? '' : 'gasta'}"></span>`).join('');
  }

  /* ---------- Fluxo ---------- */

  function iniciarJogo() {
    Object.assign(jogo, { pontos: 0, bolasRestantes: BOLAS_POR_JOGO, mult: 1, pistas: [false, false, false], alvos: [true, true, true], travas: 0, combo: 0 });
    painel.esconder();
    atualizarHud();
    prepararLancamento();
    palco.focus({ preventScroll: true });
    atualizarMusica();
  }

  function prepararLancamento() {
    jogo.fase = 'lancar';
    jogo.carga = 0;
    jogo.carregando = false;
    bolas = [novaBola(550, 930)];
    $('[data-lancar]').hidden = !semHover();
    anunciar(semHover() ? 'Segure "Lançar" e solte' : 'Segure ESPAÇO e solte para lançar');
  }

  function lancar() {
    if (jogo.fase !== 'lancar' || !bolas.length) return;
    const forca = 0.35 + jogo.carga * 0.65;
    bolas[0].vy = -(1500 + 1300 * forca);
    jogo.fase = 'jogando';
    jogo.salvaBola = SALVA_BOLA;
    $('[data-lancar]').hidden = true;
    audio.tocar('mola');
    progresso.registrar('pinball:lancamento');
  }

  function multibola() {
    for (let i = 0; i < 2; i++) bolas.push(novaBola(300 + (i ? 60 : -60), 180, aleatorio(-200, 200), 100));
    audio.tocar('conquista');
    progresso.registrar('pinball:multibola');
  }

  function perderBola(bola) {
    bolas = bolas.filter((b) => b !== bola);
    if (bolas.length) return;
    if (jogo.salvaBola > 0) {
      anunciar('BOLA SALVA!');
      audio.tocar('escudo');
      prepararLancamento();
      return;
    }
    jogo.bolasRestantes--;
    jogo.mult = 1;
    atualizarHud();
    if (jogo.bolasRestantes <= 0) {
      fimDeJogo();
      return;
    }
    audio.tocar('erro');
    anunciar(`Bola perdida · restam ${jogo.bolasRestantes}`);
    setTimeout(() => {
      if (jogo.fase !== 'fim') prepararLancamento();
    }, 900);
    jogo.fase = 'espera';
  }

  function fimDeJogo() {
    jogo.fase = 'fim';
    atualizarMusica();
    const recorde = progresso.definirRecorde('pinball', 'pontos', jogo.pontos);
    progresso.registrar('pinball:jogo');
    progresso.ganharXp(Math.round(jogo.pontos / 2500));
    audio.tocar(recorde && jogo.pontos > 0 ? 'conquista' : 'fim');
    painel.resumo({
      selo: `${icone(recorde ? 'trofeu' : 'estrela')}${recorde ? 'Novo recorde!' : 'Fim de jogo'}`,
      titulo: `${jogo.pontos.toLocaleString('pt-BR')} <small>pontos</small>`,
      estatisticas: [
        ['Recorde', (progresso.recorde('pinball', 'pontos') ?? jogo.pontos).toLocaleString('pt-BR')],
        ['Maior multiplicador', `x${progresso.recorde('pinball', 'multiplicador') ?? 1}`],
      ],
    }, iniciarJogo);
  }

  function mostrarInicio() {
    const recorde = progresso.recorde('pinball', 'pontos');
    painel.inicio({
      titulo: 'Pinball Neon',
      texto: 'Mantenha a bola viva com os flippers. Acerte os batedores, suba a rampa e complete as pistas.',
      regras: [
        ['raio', '← ou Z: flipper esquerdo · → ou M: direito'],
        ['seta', 'Segure espaço e solte para lançar'],
        ['estrela', '3 pistas = multiplicador · 2 travas = multibola'],
      ],
      recorde: recorde ? `Recorde: ${recorde.toLocaleString('pt-BR')}` : '',
    }, iniciarJogo);
  }

  /* ---------- Música eletrônica ---------- */

  const BAIXO = [45, 45, 52, 45, 48, 48, 55, 48, 43, 43, 50, 43, 47, 47, 52, 47];
  const ARPEJO = [69, 72, 76, 79, 76, 72];
  const sequenciador = criarSequenciador(audio, {
    bpm: 124,
    aoPasso(passo, quando) {
      const p = passo % 16;
      if (p % 4 === 0) audio.batida('bumbo', quando, 'musica');
      if (p === 4 || p === 12) audio.batida('palma', quando, 'musica');
      if (p % 2 === 1) audio.batida('chimbal', quando, 'musica');
      if (p % 2 === 0) audio.nota(BAIXO[(passo / 2) % BAIXO.length], { quando, duracao: 0.18, timbre: 'baixo', volume: 0.2, canal: 'musica' });
      if (passo % 32 >= 16 && p % 2 === 0) audio.nota(ARPEJO[(passo / 2) % ARPEJO.length] + (Math.floor(passo / 64) % 2 ? 2 : 0), { quando, duracao: 0.12, timbre: 'synth', volume: 0.09, canal: 'musica' });
    },
  });

  function atualizarMusica() {
    const tocar = config.musica && ['jogando', 'lancar', 'espera'].includes(jogo.fase);
    if (tocar && !sequenciador.ativo && audio.ativo) sequenciador.iniciar();
    if (!tocar && sequenciador.ativo) sequenciador.parar();
  }

  /* ---------- Entrada ---------- */

  const TECLAS_ESQ = new Set(['arrowleft', 'z', 'a', 'shift']);
  const TECLAS_DIR = new Set(['arrowright', 'm', 'l', '/']);
  const toques = new Map();

  function acionarFlipper(i, apertado) {
    const f = flippers[i];
    if (f.apertado === apertado) return;
    f.apertado = apertado;
    if (apertado) audio.tocar('flipper', { pan: i ? 0.5 : -0.5 });
  }

  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button')) return;
    const tecla = e.key.toLowerCase();
    const ladoShift = e.code === 'ShiftRight' ? 1 : 0;
    if (TECLAS_ESQ.has(tecla) && !(tecla === 'shift' && ladoShift)) {
      e.preventDefault();
      acionarFlipper(0, true);
    } else if (TECLAS_DIR.has(tecla) || (tecla === 'shift' && ladoShift)) {
      e.preventDefault();
      acionarFlipper(1, true);
    } else if (tecla === ' ' || tecla === 'arrowdown' || tecla === 'enter') {
      e.preventDefault();
      if (jogo.fase === 'lancar' && !e.repeat) jogo.carregando = true;
    }
  });
  raiz.addEventListener('keyup', (e) => {
    const tecla = e.key.toLowerCase();
    const ladoShift = e.code === 'ShiftRight' ? 1 : 0;
    if (TECLAS_ESQ.has(tecla) && !(tecla === 'shift' && ladoShift)) acionarFlipper(0, false);
    else if (TECLAS_DIR.has(tecla) || (tecla === 'shift' && ladoShift)) acionarFlipper(1, false);
    else if ((tecla === ' ' || tecla === 'arrowdown' || tecla === 'enter') && jogo.carregando) lancar();
  });

  palco.addEventListener('pointerdown', (e) => {
    if (jogo.fase !== 'jogando' && jogo.fase !== 'lancar' && jogo.fase !== 'espera') return;
    const caixa = palco.getBoundingClientRect();
    const lado = e.clientX - caixa.left < caixa.width / 2 ? 0 : 1;
    toques.set(e.pointerId, lado);
    acionarFlipper(lado, true);
  });
  const soltarToque = (e) => {
    if (!toques.has(e.pointerId)) return;
    const lado = toques.get(e.pointerId);
    toques.delete(e.pointerId);
    if (![...toques.values()].includes(lado)) acionarFlipper(lado, false);
  };
  palco.addEventListener('pointerup', soltarToque);
  palco.addEventListener('pointercancel', soltarToque);

  const botaoLancar = $('[data-lancar]');
  botaoLancar.addEventListener('pointerdown', () => { if (jogo.fase === 'lancar') jogo.carregando = true; });
  botaoLancar.addEventListener('pointerup', () => { if (jogo.carregando) lancar(); });
  $('[data-musica]').addEventListener('click', () => {
    config.musica = !config.musica;
    gravar('pinball-config', config);
    $('[data-musica]').setAttribute('aria-pressed', String(config.musica));
    atualizarMusica();
  });

  /* ---------- Desenho ---------- */

  const P = (x, y) => [vista.x + x * vista.escala, vista.y + y * vista.escala];

  function tracoNeon(s, desenho, cor, largura) {
    // Três passadas: halo largo, meio e núcleo claro
    for (const [w, alfa, c] of [[largura * 4, 0.12, cor], [largura * 2, 0.35, cor], [largura, 1, '#ffffff']]) {
      s.strokeStyle = c;
      s.globalAlpha = alfa;
      s.lineWidth = w;
      desenho();
    }
    s.globalAlpha = 1;
  }

  function criarCamadaMesa() {
    const { l, a, dpr } = tela;
    const c = document.createElement('canvas');
    c.width = Math.round(l * dpr);
    c.height = Math.round(a * dpr);
    const s = c.getContext('2d');
    s.scale(dpr, dpr);
    s.lineCap = 'round';
    s.lineJoin = 'round';
    const e = vista.escala;
    // Tampo
    const caminhoMesa = new Path2D();
    const contorno = PAREDES[0];
    contorno.forEach(([x, y], i) => {
      const [px, py] = P(x, y);
      if (i) caminhoMesa.lineTo(px, py);
      else caminhoMesa.moveTo(px, py);
    });
    caminhoMesa.lineTo(...P(570, 1000));
    caminhoMesa.lineTo(...P(30, 1000));
    caminhoMesa.closePath();
    const fundo = s.createRadialGradient(...P(300, 450), 0, ...P(300, 450), 700 * e);
    fundo.addColorStop(0, '#2a0f55');
    fundo.addColorStop(0.6, '#140734');
    fundo.addColorStop(1, '#07031a');
    s.fillStyle = fundo;
    s.fill(caminhoMesa);
    // Grade sutil e decoração
    s.save();
    s.clip(caminhoMesa);
    s.strokeStyle = 'rgba(139,92,255,0.12)';
    s.lineWidth = 1;
    for (let x = 0; x <= L; x += 40) {
      s.beginPath();
      s.moveTo(...P(x, 0));
      s.lineTo(...P(x, A));
      s.stroke();
    }
    for (let y = 0; y <= A; y += 40) {
      s.beginPath();
      s.moveTo(...P(0, y));
      s.lineTo(...P(L, y));
      s.stroke();
    }
    s.font = `${Math.round(54 * e)}px Bungee, sans-serif`;
    s.textAlign = 'center';
    s.fillStyle = 'rgba(255,46,151,0.12)';
    s.fillText('DOPAMINA', ...P(280, 640));
    // Setas indicando a rampa e as pistas
    s.fillStyle = 'rgba(34,228,255,0.25)';
    for (const [x, y, ang] of [[470, 600, -1.7], [470, 640, -1.7]]) {
      s.save();
      s.translate(...P(x, y));
      s.rotate(ang);
      s.beginPath();
      s.moveTo(14 * e, 0);
      s.lineTo(-8 * e, -10 * e);
      s.lineTo(-8 * e, 10 * e);
      s.closePath();
      s.fill();
      s.restore();
    }
    s.restore();

    // Paredes em neon
    for (const linha of PAREDES) {
      tracoNeon(s, () => {
        s.beginPath();
        linha.forEach(([x, y], i) => (i ? s.lineTo(...P(x, y)) : s.moveTo(...P(x, y))));
        s.stroke();
      }, CORES.ciano, 3 * e);
    }
    // Rampa: trilho translúcido por cima da mesa
    s.globalAlpha = 0.5;
    s.strokeStyle = 'rgba(34,228,255,0.25)';
    s.lineWidth = 34 * e;
    s.beginPath();
    RAMPA.caminho.forEach(([x, y], i) => (i ? s.lineTo(...P(x, y)) : s.moveTo(...P(x, y))));
    s.stroke();
    s.globalAlpha = 1;
    for (const lado of [-1, 1]) {
      tracoNeon(s, () => {
        s.beginPath();
        RAMPA.caminho.forEach(([x, y], i) => {
          const [nx, ny] = (() => {
            const prox = RAMPA.caminho[Math.min(i + 1, RAMPA.caminho.length - 1)];
            const ant = RAMPA.caminho[Math.max(i - 1, 0)];
            const dx = prox[0] - ant[0];
            const dy = prox[1] - ant[1];
            const d = Math.hypot(dx, dy) || 1;
            return [-dy / d, dx / d];
          })();
          const pt = P(x + nx * 17 * lado, y + ny * 17 * lado);
          if (i) s.lineTo(...pt);
          else s.moveTo(...pt);
        });
        s.stroke();
      }, CORES.violeta, 1.5 * e);
    }
    camadaMesa = c;
  }

  function desenhar() {
    const { l, a, dpr } = tela;
    const e = vista.escala;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05020f';
    g.fillRect(0, 0, l, a);
    g.drawImage(camadaMesa, 0, 0, l, a);
    g.lineCap = 'round';

    // Estilingues
    ESTILINGUES.forEach((est, i) => {
      const luz = luzes.estilingues[i];
      g.fillStyle = `rgba(163,255,18,${0.12 + luz * 0.4})`;
      g.beginPath();
      est.pontos.forEach(([x, y], k) => (k ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))));
      g.closePath();
      g.fill();
      tracoNeon(g, () => {
        g.beginPath();
        g.moveTo(...P(...est.a));
        g.lineTo(...P(...est.b));
        g.stroke();
      }, CORES.lima, (2 + luz * 3) * e);
    });

    // Pistas do topo e alvos
    PISTAS_TOPO.forEach((p, i) => {
      const aceso = jogo.pistas[i] || luzes.pistas[i] > 0;
      g.fillStyle = aceso ? CORES.violeta : 'rgba(139,92,255,0.25)';
      g.shadowColor = CORES.violeta;
      g.shadowBlur = aceso ? 16 : 0;
      g.beginPath();
      g.arc(...P(p.x, p.y + 28), 7 * e, 0, Math.PI * 2);
      g.fill();
    });
    ALVOS.forEach((alvo, i) => {
      if (!jogo.alvos[i]) return;
      g.fillStyle = CORES.laranja;
      g.shadowColor = CORES.laranja;
      g.shadowBlur = 12 + luzes.alvos[i] * 20;
      const [x, y] = P(alvo.x - 4, alvo.y - 18);
      g.fillRect(x, y, 14 * e, 36 * e);
    });
    g.shadowBlur = 0;

    // Batedores: anel neon que acende e cresce no impacto
    BATEDORES.forEach((b, i) => {
      const luz = luzes.batedores[i];
      const [x, y] = P(b.x, b.y);
      const r = b.r * e * (1 + luz * 0.12);
      const corpo = g.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      corpo.addColorStop(0, luz > 0.2 ? '#ffffff' : '#3a2a6a');
      corpo.addColorStop(1, b.cor);
      g.fillStyle = corpo;
      g.globalAlpha = 0.35 + luz * 0.65;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      tracoNeon(g, () => {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.stroke();
      }, b.cor, (2.5 + luz * 3) * e);
      tracoNeon(g, () => {
        g.beginPath();
        g.arc(x, y, r * 0.55, 0, Math.PI * 2);
        g.stroke();
      }, b.cor, 1.5 * e);
    });

    // Flippers
    for (const f of flippers) {
      const [px, py] = P(f.px, f.py);
      const tx = px + Math.cos(f.angulo) * f.comprimento * e;
      const ty = py + Math.sin(f.angulo) * f.comprimento * e;
      g.strokeStyle = '#fff';
      g.lineWidth = 18 * e;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(tx, ty);
      g.stroke();
      tracoNeon(g, () => {
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(tx, ty);
        g.stroke();
      }, f.apertado ? CORES.amarelo : CORES.rosa, 5 * e);
    }

    // Mola da canaleta
    const comprimir = jogo.carga * 40;
    g.fillStyle = 'rgba(255,214,10,0.8)';
    g.fillRect(...P(538, 950 + comprimir), 24 * e, 30 * e);

    // Bolas: cromadas, com rastro
    for (const bola of bolas) {
      if (!movimentoReduzido()) {
        bola.rastro.forEach(([x, y], i) => {
          g.fillStyle = `rgba(34,228,255,${(i / bola.rastro.length) * 0.25})`;
          g.beginPath();
          g.arc(...P(x, y), RAIO * e * (0.4 + (i / bola.rastro.length) * 0.5), 0, Math.PI * 2);
          g.fill();
        });
      }
      const [x, y] = P(bola.x, bola.y);
      const r = RAIO * e * (bola.naRampa ? 1.15 : 1);
      const cromo = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      cromo.addColorStop(0, '#ffffff');
      cromo.addColorStop(0.4, '#c9d1e0');
      cromo.addColorStop(0.8, '#5a6378');
      cromo.addColorStop(1, '#2a3040');
      g.fillStyle = cromo;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }

    // Partículas e pontos flutuando
    g.globalCompositeOperation = 'lighter';
    for (const p of particulas) {
      g.globalAlpha = clamp(p.vida * 1.6, 0, 1);
      g.fillStyle = p.cor;
      g.fillRect(...P(p.x, p.y), 3 * e, 3 * e);
    }
    g.globalCompositeOperation = 'source-over';
    g.textAlign = 'center';
    for (const t of textos) {
      g.globalAlpha = clamp(t.vida * 1.5, 0, 1);
      g.font = `${Math.round((t.grande ? 26 : 16) * e)}px Bungee, sans-serif`;
      g.fillStyle = t.cor;
      g.fillText(t.texto, ...P(t.x, t.y));
    }
    g.globalAlpha = 1;
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      // Em telas estreitas o placar fica em cima da mesa: ela desce um pouco
      const topo = tela.l < 760 ? 136 : 82;
      const altura = tela.a - topo - 16;
      vista.escala = Math.min(altura / A, (tela.l - 24) / L);
      vista.x = (tela.l - L * vista.escala) / 2;
      vista.y = topo + (altura - A * vista.escala) / 2;
      criarCamadaMesa();
    },
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    tempo += dt;
    // Flippers giram rápido até o batente
    for (const f of flippers) {
      const alvo = f.apertado ? f.ativo : f.repouso;
      const velocidade = f.apertado ? 34 : 22;
      const antes = f.angulo;
      const passo = clamp(alvo - f.angulo, -velocidade * dt, velocidade * dt);
      f.angulo += passo;
      f.omega = (f.angulo - antes) / Math.max(dt, 0.001);
    }

    if (jogo.fase === 'lancar') {
      if (jogo.carregando) jogo.carga = Math.min(1, jogo.carga + dt * 1.1);
      if (bolas[0]) {
        bolas[0].x = 550;
        bolas[0].y = 930 + jogo.carga * 40;
      }
    } else if (jogo.fase === 'jogando') {
      jogo.salvaBola = Math.max(0, jogo.salvaBola - dt);
      const passo = dt / SUBPASSOS;
      for (let k = 0; k < SUBPASSOS; k++) {
        for (const bola of bolas) passoBola(bola, passo);
        colisoesEntreBolas();
      }
      for (const bola of [...bolas]) {
        // Lançamento fraco: a bola volta pela canaleta até a mola, sem custar uma bola
        if (bola.x > 532 && bola.y > 905 && bola.vy > 0 && bolas.length === 1) prepararLancamento();
        else if (bola.y > A + 30) perderBola(bola);
      }
    }

    for (const chave of ['batedores', 'estilingues', 'pistas', 'alvos']) luzes[chave] = luzes[chave].map((v) => Math.max(0, v - dt * 3));
    for (const p of particulas) {
      p.vida -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
    }
    for (let i = particulas.length - 1; i >= 0; i--) if (particulas[i].vida <= 0) particulas.splice(i, 1);
    for (const t of textos) {
      t.vida -= dt * 0.9;
      t.y -= 40 * dt;
    }
    for (let i = textos.length - 1; i >= 0; i--) if (textos[i].vida <= 0) textos.splice(i, 1);
    if (camadaMesa) desenhar();
  });

  raiz.style.setProperty('--c1', CORES.rosa);
  raiz.style.setProperty('--c2', CORES.ciano);
  atualizarHud();
  mostrarInicio();

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      sequenciador.parar();
      clearTimeout(timerLetreiro);
    },
  };
}
