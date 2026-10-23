/**
 * Quebra-Cristais: combine 3 ou mais cristais iguais trocando vizinhos.
 * Cascatas viram reações em cadeia e o som sobe de tom a cada combo.
 * Especiais: 4 em linha = Raio (limpa a linha ou a coluna), formato L/T = Bomba (3×3),
 * 5 em linha = Prisma (trocado com uma cor, limpa todos dessa cor).
 * Partidas de 90 segundos. Parado por 5 s, uma jogada possível pisca; sem jogadas,
 * o tabuleiro se reembaralha.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { criarPainelJogo } from '../../core/painel-jogo.js?v=202610231621';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, embaralhar, escolher, movimentoReduzido } from '../../core/util.js?v=202610231621';

const TAU = Math.PI * 2;
const N = 8;
const TIPOS = 6;
const DURACAO = 90;
const ESCALA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
/** Cor e lapidação de cada tipo de cristal. */
const CRISTAIS = [
  { cor: '#ff2e5e', claro: '#ffc2d0', lados: 4, giro: Math.PI / 4 }, // rubi (losango)
  { cor: '#22c4ff', claro: '#c9f2ff', lados: 6, giro: 0 }, // safira (hexágono)
  { cor: '#3cff8a', claro: '#d2ffe2', lados: 3, giro: -Math.PI / 2 }, // esmeralda (triângulo)
  { cor: '#ffd60a', claro: '#fff4b8', lados: 0, giro: 0 }, // citrino (redondo)
  { cor: '#b06bff', claro: '#ead9ff', lados: 5, giro: -Math.PI / 2 }, // ametista (pentágono)
  { cor: '#ff8a1a', claro: '#ffe0c2', lados: 8, giro: Math.PI / 8 }, // âmbar (octógono)
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/quebra-cristais.css?v=202610231621', import.meta.url));

  raiz.classList.add('cristais');
  raiz.innerHTML = `
    <div class="cristais__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Quebra-Cristais. Arraste um cristal para o vizinho para trocar. Teclado: setas movem, espaço seleciona e setas trocam.">
      <canvas class="cristais__canvas"></canvas>
    </div>
    <div class="hud-jogo" data-hud hidden>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-pontos>0</span><span class="hud-jogo__rotulo">pontos</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-combo>x1</span><span class="hud-jogo__rotulo">combo</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-tempo>90</span><span class="hud-jogo__rotulo">segundos</span></div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.cristais__palco');
  const canvas = $('.cristais__canvas');
  const g = canvas.getContext('2d');
  const painel = criarPainelJogo(raiz);

  let tela = { l: 1, a: 1, dpr: 1 };
  const tab = { x: 0, y: 0, celula: 60 };
  let sprites = null;
  let grade = [];
  let proximoId = 1;
  const estilhacos = [];
  const textos = [];
  const partida = { ativa: false, pontos: 0, tempo: DURACAO, combo: 0, maiorCombo: 0, fase: 'parado', espera: 0, ocioso: 0, dica: null };
  const cursor = { linha: 3, coluna: 3, selecionado: null };
  let tempo = 0;

  /* ---------- Sprites dos cristais ---------- */

  function poligono(s, lados, r, giro) {
    s.beginPath();
    if (!lados) {
      s.arc(0, 0, r, 0, TAU);
      return;
    }
    for (let i = 0; i < lados; i++) {
      const a = giro + (i / lados) * TAU;
      if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
  }

  function criarSprites() {
    const lado = tab.celula;
    const dpr = tela.dpr;
    sprites = CRISTAIS.map((cristal) => {
      const c = document.createElement('canvas');
      c.width = c.height = Math.ceil(lado * dpr);
      const s = c.getContext('2d');
      s.scale(dpr, dpr);
      s.translate(lado / 2, lado / 2);
      const r = lado * 0.4;
      // Sombra
      s.save();
      s.translate(lado * 0.03, lado * 0.05);
      poligono(s, cristal.lados, r, cristal.giro);
      s.fillStyle = 'rgba(0,0,0,0.35)';
      s.fill();
      s.restore();
      // Corpo com degradê
      poligono(s, cristal.lados, r, cristal.giro);
      const corpo = s.createLinearGradient(-r, -r, r, r);
      corpo.addColorStop(0, cristal.claro);
      corpo.addColorStop(0.45, cristal.cor);
      corpo.addColorStop(1, '#1a0b30');
      s.fillStyle = corpo;
      s.fill();
      // Facetas: mesa central e triângulos que pegam luz de jeitos diferentes
      const mesa = r * 0.52;
      const n = cristal.lados || 12;
      for (let i = 0; i < n; i++) {
        const a0 = (cristal.lados ? cristal.giro : 0) + (i / n) * TAU;
        const a1 = (cristal.lados ? cristal.giro : 0) + ((i + 1) / n) * TAU;
        const luz = Math.cos(a0 + 0.3 + Math.PI * 0.75);
        s.fillStyle = luz > 0 ? `rgba(255,255,255,${0.08 + luz * 0.3})` : `rgba(0,0,30,${-luz * 0.3})`;
        s.beginPath();
        s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
        s.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
        s.lineTo(Math.cos(a1) * mesa, Math.sin(a1) * mesa);
        s.lineTo(Math.cos(a0) * mesa, Math.sin(a0) * mesa);
        s.closePath();
        s.fill();
      }
      poligono(s, cristal.lados, mesa, cristal.giro);
      const topo = s.createLinearGradient(-mesa, -mesa, mesa, mesa);
      topo.addColorStop(0, 'rgba(255,255,255,0.65)');
      topo.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      topo.addColorStop(1, 'rgba(255,255,255,0.3)');
      s.fillStyle = topo;
      s.fill();
      poligono(s, cristal.lados, r, cristal.giro);
      s.strokeStyle = 'rgba(255,255,255,0.6)';
      s.lineWidth = 1.2;
      s.stroke();
      // Brilho estrelado
      s.fillStyle = '#ffffff';
      s.beginPath();
      s.ellipse(-r * 0.32, -r * 0.38, r * 0.14, r * 0.05, -0.7, 0, TAU);
      s.fill();
      return c;
    });
  }

  /* ---------- Tabuleiro ---------- */

  const novoCristal = (tipo, linha, coluna, deCima = 0) => ({
    id: proximoId++,
    tipo,
    especial: null,
    vx: coluna, // posição visual (em células)
    vy: linha - deCima,
    escala: 1,
    sumindo: 0,
  });

  function gerarTabuleiro() {
    grade = Array.from({ length: N }, () => Array(N).fill(null));
    for (let l = 0; l < N; l++) {
      for (let c = 0; c < N; c++) {
        let tipo;
        do {
          tipo = Math.floor(Math.random() * TIPOS);
        } while ((c >= 2 && grade[l][c - 1].tipo === tipo && grade[l][c - 2].tipo === tipo)
          || (l >= 2 && grade[l - 1][c].tipo === tipo && grade[l - 2][c].tipo === tipo));
        grade[l][c] = novoCristal(tipo, l, c, movimentoReduzido() ? 0 : N + 2);
      }
    }
    if (!jogadaPossivel()) gerarTabuleiro();
  }

  const mesmo = (a, b) => a && b && a.tipo === b.tipo && a.tipo >= 0;

  /** Grupos de 3+ em linha e coluna. Devolve { celulas: Set "l,c", especiais: [{l,c,especial,tipo}] }. */
  function acharCombinacoes(origem = null) {
    const celulas = new Set();
    const especiais = [];
    const corridas = [];
    for (let l = 0; l < N; l++) {
      let inicio = 0;
      for (let c = 1; c <= N; c++) {
        if (c < N && mesmo(grade[l][c], grade[l][inicio])) continue;
        if (c - inicio >= 3) corridas.push({ dir: 'h', l, c0: inicio, c1: c - 1 });
        inicio = c;
      }
    }
    for (let c = 0; c < N; c++) {
      let inicio = 0;
      for (let l = 1; l <= N; l++) {
        if (l < N && mesmo(grade[l][c], grade[inicio][c])) continue;
        if (l - inicio >= 3) corridas.push({ dir: 'v', c, l0: inicio, l1: l - 1 });
        inicio = l;
      }
    }
    const contagem = new Map();
    for (const corrida of corridas) {
      const lista = corrida.dir === 'h'
        ? Array.from({ length: corrida.c1 - corrida.c0 + 1 }, (_, i) => [corrida.l, corrida.c0 + i])
        : Array.from({ length: corrida.l1 - corrida.l0 + 1 }, (_, i) => [corrida.l0 + i, corrida.c]);
      corrida.celulas = lista;
      for (const [l, c] of lista) {
        const chave = `${l},${c}`;
        celulas.add(chave);
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      }
    }
    // Especiais nascem onde o jogador trocou (se fizer parte), senão no meio da corrida
    for (const corrida of corridas) {
      const tamanho = corrida.celulas.length;
      const cruzamento = corrida.celulas.find(([l, c]) => contagem.get(`${l},${c}`) > 1);
      const lugar = (origem && corrida.celulas.find(([l, c]) => l === origem[0] && c === origem[1])) || corrida.celulas[Math.floor(tamanho / 2)];
      const tipo = grade[corrida.celulas[0][0]][corrida.celulas[0][1]].tipo;
      if (cruzamento && !especiais.some((e) => e.l === cruzamento[0] && e.c === cruzamento[1])) especiais.push({ l: cruzamento[0], c: cruzamento[1], especial: 'bomba', tipo });
      else if (tamanho >= 5) especiais.push({ l: lugar[0], c: lugar[1], especial: 'prisma', tipo: -1 });
      else if (tamanho === 4) especiais.push({ l: lugar[0], c: lugar[1], especial: corrida.dir === 'h' ? 'coluna' : 'linha', tipo });
    }
    return { celulas, especiais };
  }

  function jogadaPossivel() {
    for (let l = 0; l < N; l++) {
      for (let c = 0; c < N; c++) {
        if (grade[l][c].especial === 'prisma') return [[l, c], [l, Math.min(N - 1, c + 1)]];
        for (const [dl, dc] of [[0, 1], [1, 0]]) {
          const l2 = l + dl;
          const c2 = c + dc;
          if (l2 >= N || c2 >= N) continue;
          trocarNaGrade(l, c, l2, c2);
          const ok = acharCombinacoes().celulas.size > 0;
          trocarNaGrade(l, c, l2, c2);
          if (ok) return [[l, c], [l2, c2]];
        }
      }
    }
    return null;
  }

  function trocarNaGrade(l1, c1, l2, c2) {
    const t = grade[l1][c1];
    grade[l1][c1] = grade[l2][c2];
    grade[l2][c2] = t;
  }

  /* ---------- Jogadas ---------- */

  function tentarTroca(l1, c1, l2, c2) {
    if (partida.fase !== 'livre' || !partida.ativa) return;
    if (Math.abs(l1 - l2) + Math.abs(c1 - c2) !== 1 || l2 < 0 || c2 < 0 || l2 >= N || c2 >= N) return;
    partida.ocioso = 0;
    partida.dica = null;
    const a = grade[l1][c1];
    const b = grade[l2][c2];
    trocarNaGrade(l1, c1, l2, c2);
    audio.tocar('whoosh');
    // Prisma: some com todos da cor do vizinho
    if (a.especial === 'prisma' || b.especial === 'prisma') {
      const prisma = a.especial === 'prisma' ? a : b;
      const outro = prisma === a ? b : a;
      partida.fase = 'trocando';
      partida.espera = 0.16;
      partida.depoisDaTroca = () => ativarPrisma(prisma, outro.tipo);
      return;
    }
    const { celulas } = acharCombinacoes([l2, c2]);
    partida.fase = 'trocando';
    partida.espera = 0.16;
    if (celulas.size) {
      partida.combo = 0;
      partida.depoisDaTroca = () => resolver([l2, c2]);
    } else {
      // Não combinou: volta para o lugar
      partida.depoisDaTroca = () => {
        trocarNaGrade(l1, c1, l2, c2);
        audio.tocar('erro');
        partida.fase = 'trocando';
        partida.espera = 0.16;
        partida.depoisDaTroca = () => { partida.fase = 'livre'; };
      };
    }
  }

  function ativarPrisma(prisma, tipo) {
    const alvos = new Set();
    for (let l = 0; l < N; l++) for (let c = 0; c < N; c++) if (grade[l][c] === prisma || grade[l][c].tipo === tipo) alvos.add(`${l},${c}`);
    partida.combo = 0;
    audio.tocar('explosao', { tamanho: 0.9 });
    progresso.registrar('cristais:especial', 1, 'prisma');
    limpar(alvos, []);
  }

  /** Expande a limpeza com os especiais atingidos (raio, bomba, prisma). */
  function expandirEspeciais(alvos) {
    const fila = [...alvos];
    while (fila.length) {
      const [l, c] = fila.pop().split(',').map(Number);
      const cristal = grade[l][c];
      if (!cristal?.especial || cristal.ativado) continue;
      cristal.ativado = true;
      const extras = [];
      if (cristal.especial === 'linha') for (let k = 0; k < N; k++) extras.push(`${l},${k}`);
      if (cristal.especial === 'coluna') for (let k = 0; k < N; k++) extras.push(`${k},${c}`);
      if (cristal.especial === 'bomba') for (let dl = -1; dl <= 1; dl++) for (let dc = -1; dc <= 1; dc++) if (grade[l + dl]?.[c + dc]) extras.push(`${l + dl},${c + dc}`);
      if (cristal.especial === 'prisma') {
        const tipo = escolher(CRISTAIS.map((_, i) => i));
        for (let ll = 0; ll < N; ll++) for (let cc = 0; cc < N; cc++) if (grade[ll][cc].tipo === tipo) extras.push(`${ll},${cc}`);
      }
      audio.tocar(cristal.especial === 'bomba' ? 'explosao' : 'corte', { tamanho: 0.6 });
      progresso.registrar('cristais:especial', 1, cristal.especial);
      raios.push({ l, c, tipo: cristal.especial, vida: 1 });
      for (const chave of extras) {
        if (!alvos.has(chave)) {
          alvos.add(chave);
          fila.push(chave);
        }
      }
    }
  }

  const raios = [];

  function resolver(origem = null) {
    const { celulas, especiais } = acharCombinacoes(origem);
    if (!celulas.size) {
      partida.combo = 0;
      atualizarHud();
      if (!jogadaPossivel()) reembaralhar();
      partida.fase = 'livre';
      return;
    }
    limpar(celulas, especiais);
  }

  function limpar(alvos, especiais) {
    partida.combo++;
    partida.maiorCombo = Math.max(partida.maiorCombo, partida.combo);
    expandirEspeciais(alvos);
    // Especiais recém-criados não somem: viram o novo cristal especial
    for (const e of especiais) alvos.delete(`${e.l},${e.c}`);
    let ganhos = 0;
    for (const chave of alvos) {
      const [l, c] = chave.split(',').map(Number);
      const cristal = grade[l][c];
      if (!cristal) continue;
      cristal.sumindo = 0.001;
      ganhos += 10;
      estilhacar(l, c, cristal.tipo >= 0 ? CRISTAIS[cristal.tipo] : { cor: '#ffffff', claro: '#ffffff' });
    }
    for (const e of especiais) {
      const cristal = grade[e.l][e.c];
      cristal.especial = e.especial;
      cristal.tipo = e.tipo;
      cristal.escala = 1.4;
      cristal.ativado = false;
      ganhos += 40;
      audio.tocar('escudo');
    }
    const pontos = ganhos * partida.combo;
    partida.pontos += pontos;
    const [l0, c0] = [...alvos][0]?.split(',').map(Number) ?? [3, 3];
    textos.push({ x: tab.x + (c0 + 0.5) * tab.celula, y: tab.y + (l0 + 0.5) * tab.celula, texto: partida.combo > 1 ? `+${pontos} combo x${partida.combo}` : `+${pontos}`, vida: 1 });
    // O som sobe de tom a cada combo
    const nota = ESCALA[Math.min(ESCALA.length - 1, partida.combo - 1)];
    audio.nota(nota, { timbre: 'sino', volume: 0.12 });
    audio.nota(nota + 7, { timbre: 'pluck', volume: 0.06 });
    if (partida.combo >= 3) audio.tocar('combo', { n: partida.combo });
    progresso.registrar('cristais:quebrado', alvos.size);
    if (partida.combo >= 2) progresso.definirRecorde('quebra-cristais', 'combo', partida.combo);
    atualizarHud();
    partida.fase = 'limpando';
    partida.espera = movimentoReduzido() ? 0.1 : 0.26;
    partida.depoisDaTroca = cair;
  }

  function cair() {
    for (let c = 0; c < N; c++) {
      let vazio = 0;
      for (let l = N - 1; l >= 0; l--) {
        const cristal = grade[l][c];
        if (cristal.sumindo) {
          vazio++;
          grade[l][c] = null;
        } else if (vazio) {
          grade[l + vazio][c] = cristal;
          grade[l][c] = null;
        }
      }
      for (let l = 0; l < vazio; l++) grade[l][c] = novoCristal(Math.floor(Math.random() * TIPOS), l, c, vazio + 0.5);
    }
    partida.fase = 'caindo';
  }

  function reembaralhar() {
    const todos = embaralhar(grade.flat());
    let i = 0;
    for (let l = 0; l < N; l++) for (let c = 0; c < N; c++) grade[l][c] = todos[i++];
    if (acharCombinacoes().celulas.size || !jogadaPossivel()) return reembaralhar();
    textos.push({ x: tab.x + tab.celula * 4, y: tab.y + tab.celula * 4, texto: 'Embaralhando!', vida: 1.4 });
    audio.tocar('tema');
    return undefined;
  }

  function estilhacar(l, c, cristal) {
    const x = tab.x + (c + 0.5) * tab.celula;
    const y = tab.y + (l + 0.5) * tab.celula;
    const n = movimentoReduzido() ? 3 : 9;
    for (let i = 0; i < n; i++) {
      const a = aleatorio(0, TAU);
      const v = aleatorio(80, 300);
      estilhacos.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, giro: aleatorio(0, TAU), vgiro: aleatorio(-10, 10), tam: aleatorio(3, 8), vida: aleatorio(0.5, 0.9), cor: escolher([cristal.cor, cristal.claro]) });
    }
    if (estilhacos.length > 600) estilhacos.splice(0, estilhacos.length - 600);
  }

  /* ---------- Partida ---------- */

  function iniciar() {
    Object.assign(partida, { ativa: true, pontos: 0, tempo: DURACAO, combo: 0, maiorCombo: 0, fase: 'livre', ocioso: 0, dica: null });
    painel.esconder();
    $('[data-hud]').hidden = false;
    gerarTabuleiro();
    atualizarHud();
    audio.tocar('inicio');
    palco.focus({ preventScroll: true });
  }

  function terminar() {
    partida.ativa = false;
    $('[data-hud]').hidden = true;
    const recorde = progresso.definirRecorde('quebra-cristais', 'pontos', partida.pontos);
    progresso.registrar('cristais:partida');
    progresso.ganharXp(Math.round(partida.pontos / 300));
    audio.tocar(recorde && partida.pontos > 0 ? 'conquista' : 'fim');
    painel.resumo({
      selo: `${icone(recorde ? 'trofeu' : 'estrela')}${recorde ? 'Novo recorde!' : 'Tempo!'}`,
      titulo: `${partida.pontos.toLocaleString('pt-BR')} <small>pontos</small>`,
      estatisticas: [
        ['Maior combo', `x${partida.maiorCombo}`],
        ['Recorde', (progresso.recorde('quebra-cristais', 'pontos') ?? partida.pontos).toLocaleString('pt-BR')],
      ],
    }, iniciar);
  }

  function atualizarHud() {
    $('[data-pontos]').textContent = partida.pontos.toLocaleString('pt-BR');
    $('[data-combo]').textContent = `x${Math.max(1, partida.combo)}`;
    $('[data-tempo]').textContent = String(Math.max(0, Math.ceil(partida.tempo)));
  }

  /* ---------- Entrada ---------- */

  const toque = { ativo: false, l: 0, c: 0, x: 0, y: 0 };
  const celulaEm = (x, y) => [Math.floor((y - tab.y) / tab.celula), Math.floor((x - tab.x) / tab.celula)];
  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };
  palco.addEventListener('pointerdown', (e) => {
    if (!partida.ativa || e.button > 0) return;
    const { x, y } = posicao(e);
    const [l, c] = celulaEm(x, y);
    if (l < 0 || c < 0 || l >= N || c >= N) return;
    capturarPonteiro(palco, e.pointerId);
    // Toque num vizinho do selecionado = troca
    if (cursor.selecionado && Math.abs(cursor.selecionado[0] - l) + Math.abs(cursor.selecionado[1] - c) === 1) {
      tentarTroca(cursor.selecionado[0], cursor.selecionado[1], l, c);
      cursor.selecionado = null;
      return;
    }
    Object.assign(toque, { ativo: true, l, c, x, y });
    cursor.selecionado = [l, c];
    cursor.linha = l;
    cursor.coluna = c;
    audio.tocar('tique', { tom: 1.3 });
  });
  palco.addEventListener('pointermove', (e) => {
    if (!toque.ativo) return;
    const { x, y } = posicao(e);
    const dx = x - toque.x;
    const dy = y - toque.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < tab.celula * 0.35) return;
    toque.ativo = false;
    const [dl, dc] = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
    cursor.selecionado = null;
    tentarTroca(toque.l, toque.c, toque.l + dl, toque.c + dc);
  });
  palco.addEventListener('pointerup', () => { toque.ativo = false; });
  palco.addEventListener('pointercancel', () => { toque.ativo = false; });

  raiz.addEventListener('keydown', (e) => {
    if (!partida.ativa || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button')) return;
    const DIR = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (DIR[e.key]) {
      e.preventDefault();
      const [dl, dc] = DIR[e.key];
      if (cursor.selecionado) {
        const [l, c] = cursor.selecionado;
        cursor.selecionado = null;
        tentarTroca(l, c, l + dl, c + dc);
      } else {
        cursor.linha = clamp(cursor.linha + dl, 0, N - 1);
        cursor.coluna = clamp(cursor.coluna + dc, 0, N - 1);
      }
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cursor.selecionado = cursor.selecionado ? null : [cursor.linha, cursor.coluna];
    }
  });

  /* ---------- Desenho ---------- */

  function desenhar() {
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fundo = g.createRadialGradient(l / 2, a / 2, 0, l / 2, a / 2, Math.max(l, a) * 0.7);
    fundo.addColorStop(0, '#2a1458');
    fundo.addColorStop(1, '#0a0420');
    g.fillStyle = fundo;
    g.fillRect(0, 0, l, a);

    // Moldura do tabuleiro
    const lado = tab.celula * N;
    g.fillStyle = 'rgba(10,4,32,0.6)';
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(tab.x - 10, tab.y - 10, lado + 20, lado + 20, 22);
    g.fill();
    g.stroke();
    for (let ll = 0; ll < N; ll++) {
      for (let c = 0; c < N; c++) {
        g.fillStyle = (ll + c) % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
        g.fillRect(tab.x + c * tab.celula, tab.y + ll * tab.celula, tab.celula, tab.celula);
      }
    }
    if (!grade.length || !sprites) return;

    // Dica: os dois cristais da jogada possível pulsam
    const dica = partida.dica;
    g.save();
    g.beginPath();
    g.rect(tab.x - 10, tab.y - 10, lado + 20, lado + 20);
    g.clip();
    for (let ll = 0; ll < N; ll++) {
      for (let c = 0; c < N; c++) {
        const cristal = grade[ll][c];
        if (!cristal) continue;
        let s = cristal.escala * (cristal.sumindo ? Math.max(0, 1 - cristal.sumindo * 3) * (1 + cristal.sumindo) : 1);
        if (dica && dica.some(([dl, dc]) => dl === ll && dc === c)) s *= 1 + Math.sin(tempo * 8) * 0.08;
        const x = tab.x + (cristal.vx + 0.5) * tab.celula;
        const y = tab.y + (cristal.vy + 0.5) * tab.celula;
        const t = tab.celula * s;
        if (cristal.tipo >= 0) {
          g.drawImage(sprites[cristal.tipo], x - t / 2, y - t / 2, t, t);
        }
        if (cristal.especial) desenharEspecial(cristal, x, y, t);
        if (cristal.sumindo) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = Math.max(0, 1 - cristal.sumindo * 3);
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.arc(x, y, t * 0.35, 0, TAU);
          g.fill();
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
        }
      }
    }
    g.restore();

    // Feixes dos especiais
    g.globalCompositeOperation = 'lighter';
    for (const r of raios) {
      g.globalAlpha = r.vida;
      g.fillStyle = '#ffffff';
      const x = tab.x + (r.c + 0.5) * tab.celula;
      const y = tab.y + (r.l + 0.5) * tab.celula;
      if (r.tipo === 'linha') g.fillRect(tab.x, y - tab.celula * 0.18 * r.vida, lado, tab.celula * 0.36 * r.vida);
      else if (r.tipo === 'coluna') g.fillRect(x - tab.celula * 0.18 * r.vida, tab.y, tab.celula * 0.36 * r.vida, lado);
      else {
        g.beginPath();
        g.arc(x, y, tab.celula * (1.6 - r.vida * 0.6), 0, TAU);
        g.fill();
      }
    }
    for (const e of estilhacos) {
      g.globalAlpha = clamp(e.vida * 1.5, 0, 1);
      g.fillStyle = e.cor;
      g.save();
      g.translate(e.x, e.y);
      g.rotate(e.giro);
      g.beginPath();
      g.moveTo(0, -e.tam);
      g.lineTo(e.tam * 0.6, e.tam * 0.5);
      g.lineTo(-e.tam * 0.6, e.tam * 0.5);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    // Cursor e seleção
    if (partida.ativa) {
      const sel = cursor.selecionado ?? [cursor.linha, cursor.coluna];
      g.strokeStyle = cursor.selecionado ? '#ffd60a' : 'rgba(255,255,255,0.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(tab.x + sel[1] * tab.celula + 3, tab.y + sel[0] * tab.celula + 3, tab.celula - 6, tab.celula - 6, 10);
      g.stroke();
    }

    g.textAlign = 'center';
    g.font = `${Math.round(tab.celula * 0.32)}px Bungee, sans-serif`;
    for (const t of textos) {
      g.globalAlpha = clamp(t.vida * 1.4, 0, 1);
      g.fillStyle = '#ffffff';
      g.shadowColor = '#ff5dc8';
      g.shadowBlur = 14;
      g.fillText(t.texto, t.x, t.y);
    }
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  function desenharEspecial(cristal, x, y, t) {
    g.save();
    g.translate(x, y);
    g.globalCompositeOperation = 'lighter';
    if (cristal.especial === 'prisma') {
      // Prisma: esfera arco-íris girando
      g.rotate(tempo * 2);
      const arco = g.createConicGradient(0, 0, 0);
      ['#ff2e5e', '#ffd60a', '#3cff8a', '#22c4ff', '#b06bff', '#ff2e5e'].forEach((cor, i) => arco.addColorStop(i / 5, cor));
      g.fillStyle = arco;
      g.beginPath();
      g.arc(0, 0, t * 0.36, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.arc(0, 0, t * 0.12, 0, TAU);
      g.fill();
    } else if (cristal.especial === 'bomba') {
      g.strokeStyle = `rgba(255,255,255,${0.6 + Math.sin(tempo * 6) * 0.3})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, t * 0.42, 0, TAU);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, t * 0.22, 0, TAU);
      g.stroke();
    } else {
      // Raio: setas na direção que vai limpar
      if (cristal.especial === 'coluna') g.rotate(Math.PI / 2);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2.5;
      g.globalAlpha = 0.7 + Math.sin(tempo * 8) * 0.3;
      g.beginPath();
      g.moveTo(-t * 0.42, 0);
      g.lineTo(t * 0.42, 0);
      g.moveTo(t * 0.42, 0);
      g.lineTo(t * 0.3, -t * 0.1);
      g.moveTo(t * 0.42, 0);
      g.lineTo(t * 0.3, t * 0.1);
      g.moveTo(-t * 0.42, 0);
      g.lineTo(-t * 0.3, -t * 0.1);
      g.moveTo(-t * 0.42, 0);
      g.lineTo(-t * 0.3, t * 0.1);
      g.stroke();
    }
    g.restore();
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      tab.celula = Math.floor(Math.min((tela.l - 32) / N, (tela.a - 200) / N, 76));
      tab.x = Math.round((tela.l - tab.celula * N) / 2);
      tab.y = Math.round(Math.max(130, (tela.a - tab.celula * N) / 2 + 20));
      criarSprites();
    },
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    tempo += dt;
    if (partida.ativa) {
      partida.tempo -= dt;
      if (Math.ceil(partida.tempo) !== Math.ceil(partida.tempo + dt)) {
        atualizarHud();
        if (partida.tempo <= 5 && partida.tempo > 0) audio.tocar('tique', { tom: 1.2 });
      }
      if (partida.tempo <= 0 && partida.fase === 'livre') terminar();
      if (partida.fase === 'livre') {
        partida.ocioso += dt;
        if (partida.ocioso > 5 && !partida.dica) partida.dica = jogadaPossivel();
      }
    }

    // Animação: cada cristal desliza até a sua célula (queda com aceleração)
    let assentados = true;
    for (let l = 0; l < N && grade.length; l++) {
      for (let c = 0; c < N; c++) {
        const cristal = grade[l][c];
        if (!cristal) continue;
        if (cristal.sumindo) cristal.sumindo += dt;
        cristal.escala += (1 - cristal.escala) * Math.min(1, dt * 10);
        const dx = c - cristal.vx;
        const dy = l - cristal.vy;
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
          assentados = false;
          const velocidade = movimentoReduzido() ? 40 : 9;
          cristal.vx += clamp(dx, -velocidade * dt, velocidade * dt);
          cristal.vy += clamp(dy, -velocidade * dt * (dy > 0 ? 1.4 : 1), velocidade * dt * (dy > 0 ? 1.4 : 1));
          if (Math.abs(c - cristal.vx) < 0.01) cristal.vx = c;
          if (Math.abs(l - cristal.vy) < 0.01) {
            cristal.vy = l;
            if (dy > 0.2) cristal.escala = 0.88; // quiquezinho ao pousar
          }
        }
      }
    }

    if (partida.fase === 'trocando' || partida.fase === 'limpando') {
      partida.espera -= dt;
      if (partida.espera <= 0) {
        const proximo = partida.depoisDaTroca;
        partida.depoisDaTroca = null;
        proximo?.();
      }
    } else if (partida.fase === 'caindo' && assentados) {
      resolver();
    }

    for (const e of estilhacos) {
      e.vida -= dt;
      e.vy += 600 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.giro += e.vgiro * dt;
    }
    for (let i = estilhacos.length - 1; i >= 0; i--) if (estilhacos[i].vida <= 0) estilhacos.splice(i, 1);
    for (const r of raios) r.vida -= dt * 3;
    for (let i = raios.length - 1; i >= 0; i--) if (raios[i].vida <= 0) raios.splice(i, 1);
    for (const t of textos) {
      t.vida -= dt;
      t.y -= 40 * dt;
    }
    for (let i = textos.length - 1; i >= 0; i--) if (textos[i].vida <= 0) textos.splice(i, 1);
    desenhar();
  });

  raiz.style.setProperty('--c1', '#22c4ff');
  raiz.style.setProperty('--c2', '#ff2e5e');
  gerarTabuleiro();
  const recorde = progresso.recorde('quebra-cristais', 'pontos');
  painel.inicio({
    titulo: 'Quebra-Cristais',
    texto: 'Arraste um cristal para o vizinho e forme 3 ou mais iguais. Cascatas viram combos!',
    regras: [['relogio', `${DURACAO} segundos por partida`], ['raio', '4 em linha = Raio · L ou T = Bomba'], ['brilho', '5 em linha = Prisma (troque com uma cor)']],
    recorde: recorde ? `Recorde: ${recorde.toLocaleString('pt-BR')}` : '',
  }, iniciar);

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
    },
  };
}
