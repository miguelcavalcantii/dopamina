/**
 * Ping Pong em perspectiva, com física 3D em metros (mesa oficial 2,74 × 1,525 m).
 * A raquete fica exatamente sob o ponteiro (projeção inversa num plano atrás da mesa).
 * O golpe mira um ponto do lado de lá e calcula a velocidade para chegar nele; o
 * movimento da raquete define ritmo, direção e efeito (topspin/backspin e lateral),
 * que curvam a bola em voo (Magnus) e mudam o quique.
 * Contra o computador (3 níveis) ou 2 jogadores no mesmo teclado. Partida até 11.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js';
import { icone } from '../../core/icones.js';
import { ler, gravar } from '../../core/armazenamento.js';
import { criarBanco } from '../../core/amostras.js';
import { criarPainelJogo } from '../../core/painel-jogo.js';
import { aleatorio, carregarEstilo, clamp, movimentoReduzido } from '../../core/util.js';

const som = (nome) => new URL(`../../../assets/sons/jogos/${nome}.mp3`, import.meta.url);

/* Medidas em metros */
const COMP = 2.74;
const LARG = 1.525;
const REDE = 0.1525;
const G = 9.8;
const RAIO_BOLA = 0.02;
const Z_JOGADOR = -0.32;
const Z_RIVAL = COMP + 0.32;
const ALCANCE = { x: 0.22, y: 0.24 };
const PONTOS_VITORIA = 11;

const NIVEIS = [
  { id: 'facil', nome: 'Fácil', velocidade: 1.5, erro: 0.28, reacao: 0.3, ritmo: 0.95 },
  { id: 'medio', nome: 'Médio', velocidade: 2.4, erro: 0.16, reacao: 0.18, ritmo: 0.8 },
  { id: 'dificil', nome: 'Difícil', velocidade: 3.4, erro: 0.07, reacao: 0.09, ritmo: 0.62 },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/ping-pong.css', import.meta.url));

  const config = { nivel: 'medio', modo: '1p', ...ler('pingpong-config', {}) };
  const salvar = () => gravar('pingpong-config', config);
  const somMesa = criarBanco(audio, [som('pingpong-mesa')], { recorte: { intervaloMin: 0.08, duracaoMax: 0.15 }, canal: 'efeitos' });
  const somRaquete = criarBanco(audio, [som('pingpong-1'), som('pingpong-2')], { recorte: { intervaloMin: 0.08, duracaoMax: 0.15 }, canal: 'efeitos' });
  let torcida = null;
  let aplausos = null;
  audio.carregarAmostra(som('torcida')).then((b) => { torcida = b; });
  audio.carregarAmostra(som('aplausos')).then((b) => { aplausos = b; });

  raiz.classList.add('pong');
  raiz.innerHTML = `
    <div class="pong__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Ping pong. Mova o mouse ou o dedo para mexer a raquete; o movimento na hora do golpe dá força e efeito. Clique para sacar. Dois jogadores: A e D contra setas.">
      <canvas class="pong__canvas"></canvas>
    </div>
    <div class="pong__placar" data-placar hidden>
      <div class="pong__lado"><span class="pong__nome" data-nome-1>Você</span><span class="pong__pontos" data-pontos-1>0</span></div>
      <span class="pong__x">×</span>
      <div class="pong__lado"><span class="pong__pontos" data-pontos-2>0</span><span class="pong__nome" data-nome-2>CPU</span></div>
    </div>
    <p class="pong__aviso" data-aviso aria-live="polite"></p>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.pong__palco');
  const canvas = $('.pong__canvas');
  const g = canvas.getContext('2d');
  const painel = criarPainelJogo(raiz);
  const aviso = $('[data-aviso]');

  let tela = { l: 1, a: 1, dpr: 1 };
  const camera = { x: 0, y: 1.62, z: -2.35, inclinacao: 0.47, foco: 1 };
  let nivel = NIVEIS.find((n) => n.id === config.nivel) ?? NIVEIS[1];

  /* ---------- Projeção ---------- */

  function projetar(x, y, z) {
    const dx = x - camera.x;
    const dy = y - camera.y;
    const dz = z - camera.z;
    const c = Math.cos(camera.inclinacao);
    const s = Math.sin(camera.inclinacao);
    const yv = dy * c + dz * s;
    const zv = -dy * s + dz * c;
    const f = camera.foco / zv;
    return { x: tela.l / 2 + dx * f, y: tela.a * 0.42 - yv * f, escala: f };
  }

  /** Ponto da tela → ponto no plano z = zPlano (para a raquete ficar sob o ponteiro). */
  function desprojetar(sx, sy, zPlano) {
    const c = Math.cos(camera.inclinacao);
    const s = Math.sin(camera.inclinacao);
    const dz = zPlano - camera.z;
    const k = -(sy - tela.a * 0.42) / camera.foco;
    const dy = (dz * (k * c - s)) / (c + k * s);
    const zv = -dy * s + dz * c;
    return { x: camera.x + ((sx - tela.l / 2) * zv) / camera.foco, y: camera.y + dy };
  }

  /* ---------- Estado ---------- */

  const bola = { x: 0, y: 0.3, z: 0, vx: 0, vy: 0, vz: 0, giroTopo: 0, giroLado: 0, rastro: [] };
  const raquetes = [
    { x: 0, y: 0.25, z: Z_JOGADOR, vx: 0, vy: 0, alvoX: 0, alvoY: 0.25, golpe: 0, cor: '#e8343a' },
    { x: 0, y: 0.25, z: Z_RIVAL, vx: 0, vy: 0, alvoX: 0, alvoY: 0.25, golpe: 0, cor: '#1d4ed8' },
  ];
  const partida = {
    ativa: false,
    fase: 'parado', // 'saque' | 'jogo' | 'ponto'
    pontos: [0, 0],
    sacador: 0,
    batedor: 0, // quem bateu por último
    quiques: 0, // quiques no lado de quem recebe
    relogio: 0,
    troca: 0, // golpes no ponto atual
    maiorTroca: 0,
  };
  const ia = { reacao: 0, alvoX: 0, alvoY: 0.25 };
  const efeitos = [];
  const teclas = new Set();
  let ponteiro = null;
  let tempo = 0;

  /* ---------- Física ---------- */

  function ladoDe(z) {
    return z < COMP / 2 ? 0 : 1;
  }

  /** Calcula o golpe: velocidade inicial para a bola cair em (xa, za) em T segundos. */
  function golpear(quem, { ritmo, direcao, topo, lado }) {
    const r = raquetes[quem];
    const sentido = quem === 0 ? 1 : -1;
    const za = quem === 0 ? COMP * aleatorio(0.68, 0.9) : COMP * aleatorio(0.1, 0.32);
    const xa = clamp(direcao, -LARG / 2 + 0.12, LARG / 2 - 0.12);
    let T = clamp(ritmo, 0.38, 1.15);
    const gEfetivo = G + topo * 0.35;
    // Garante que a bola passe a rede com folga
    for (let i = 0; i < 12; i++) {
      const vy = (0 - bola.y + 0.5 * gEfetivo * T * T) / T;
      const tRede = Math.abs((COMP / 2 - bola.z) / ((za - bola.z) / T));
      const alturaRede = bola.y + vy * tRede - 0.5 * gEfetivo * tRede * tRede;
      if (alturaRede > REDE + 0.06) break;
      T += 0.05;
    }
    bola.vz = (za - bola.z) / T;
    bola.vx = (xa - bola.x) / T;
    bola.vy = (0 - bola.y + 0.5 * gEfetivo * T * T) / T;
    bola.giroTopo = topo;
    bola.giroLado = lado;
    bola.z = r.z + sentido * 0.05;
    partida.batedor = quem;
    partida.quiques = 0;
    partida.troca++;
    r.golpe = 1;
    const forca = Math.hypot(bola.vx, bola.vz);
    if (!somRaquete.tocar({ tom: 0.9 + forca * 0.02, volume: 0.9, pan: clamp(bola.x / LARG, -0.8, 0.8) })) audio.tocar('estouro', { tamanho: 0.2 });
    efeitos.push({ x: bola.x, y: bola.y, z: bola.z, vida: 1, cor: r.cor });
    if (quem === 0) progresso.registrar('pingpong:golpe');
  }

  function passoBola(dt) {
    // Magnus: topspin puxa para baixo (a mira já conta com isso), lateral curva para o lado
    bola.vy += (-G - bola.giroTopo * 0.35) * dt;
    bola.vx += bola.giroLado * 0.08 * Math.sign(bola.vz) * dt;
    bola.vx *= 1 - 0.08 * dt;
    bola.vz *= 1 - 0.08 * dt;
    const zAntes = bola.z;
    bola.x += bola.vx * dt;
    bola.y += bola.vy * dt;
    bola.z += bola.vz * dt;

    // Rede: atravessou o plano da rede baixo demais
    if ((zAntes - COMP / 2) * (bola.z - COMP / 2) < 0 && bola.y < REDE + RAIO_BOLA && Math.abs(bola.x) < LARG / 2 + 0.15) {
      bola.z = COMP / 2 - Math.sign(bola.vz) * 0.03;
      bola.vz *= -0.15;
      bola.vx *= 0.3;
      audio.tocar('squish', { tom: 1.8, volume: 0.6 });
    }

    // Mesa
    const naMesa = Math.abs(bola.x) <= LARG / 2 && bola.z >= 0 && bola.z <= COMP;
    if (bola.y <= RAIO_BOLA && bola.vy < 0 && naMesa) {
      bola.y = RAIO_BOLA;
      bola.vy = -bola.vy * 0.86;
      bola.vz += bola.giroTopo * 0.04 * Math.sign(bola.vz);
      bola.vx += bola.giroLado * 0.015;
      bola.giroTopo *= 0.6;
      bola.giroLado *= 0.6;
      if (!somMesa.tocar({ volume: clamp(Math.abs(bola.vy) / 3, 0.35, 1), pan: clamp(bola.x / LARG, -0.8, 0.8) })) audio.tocar('tique', { tom: 1.6 });
      quicou(ladoDe(bola.z));
    }

    // Chão / fora
    if (bola.y < -0.75 || bola.z < Z_JOGADOR - 1.4 || bola.z > Z_RIVAL + 1.4 || Math.abs(bola.x) > 3) caiu();

    bola.rastro.push({ x: bola.x, y: bola.y, z: bola.z });
    if (bola.rastro.length > 10) bola.rastro.shift();
  }

  function quicou(lado) {
    if (partida.fase !== 'jogo') return;
    const recebedor = 1 - partida.batedor;
    if (lado === partida.batedor) return fimDoPonto(recebedor, 'Bateu no próprio lado');
    partida.quiques++;
    if (partida.quiques >= 2) return fimDoPonto(partida.batedor, 'Quicou duas vezes');
    return undefined;
  }

  function caiu() {
    if (partida.fase !== 'jogo') return;
    const recebedor = 1 - partida.batedor;
    if (partida.quiques >= 1) fimDoPonto(partida.batedor, 'Não devolveu');
    else fimDoPonto(recebedor, 'Bola fora');
  }

  function tentarRebater(quem) {
    const r = raquetes[quem];
    const vindo = quem === 0 ? bola.vz < 0 : bola.vz > 0;
    if (!vindo || partida.fase !== 'jogo') return;
    const cruzou = quem === 0 ? bola.z <= r.z + 0.06 : bola.z >= r.z - 0.06;
    if (!cruzou) return;
    if (partida.quiques < 1) return; // precisa quicar do lado de quem recebe antes do golpe
    if (Math.abs(bola.x - r.x) > ALCANCE.x || Math.abs(bola.y - r.y) > ALCANCE.y) return;
    if (quem === 0 && config.modo === '1p') {
      // Mouse/toque: o movimento da raquete vira ritmo, direção e efeito
      const velocidade = Math.hypot(r.vx, r.vy);
      golpear(0, {
        ritmo: 1.05 - Math.min(0.6, velocidade * 0.09) - (bola.y > 0.35 ? 0.12 : 0),
        direcao: bola.x * 0.25 + r.vx * 0.22 + (bola.x - r.x) * 1.6,
        topo: clamp(r.vy * 6, -14, 22),
        lado: clamp(-r.vx * 4, -12, 12),
      });
    } else if (quem === 1 && config.modo === '1p') {
      golpear(1, {
        ritmo: nivel.ritmo + aleatorio(-0.08, 0.1),
        direcao: aleatorio(-0.6, 0.6) + aleatorio(-nivel.erro, nivel.erro),
        topo: aleatorio(-2, 10) * (nivel.id === 'dificil' ? 1.5 : 1),
        lado: aleatorio(-4, 4),
      });
    } else {
      // Teclado: a direção vem das teclas seguradas no golpe
      const esquerda = quem === 0 ? teclas.has('a') : teclas.has('arrowleft');
      const direita = quem === 0 ? teclas.has('d') : teclas.has('arrowright');
      const forte = quem === 0 ? teclas.has('w') : teclas.has('arrowup');
      const sentido = (direita ? 1 : 0) - (esquerda ? 1 : 0);
      golpear(quem, {
        ritmo: forte ? 0.6 : 0.85,
        direcao: (quem === 0 ? sentido : -sentido) * 0.5 + aleatorio(-0.1, 0.1),
        topo: forte ? 14 : 4,
        lado: -sentido * 5,
      });
    }
  }

  /* ---------- Fluxo da partida ---------- */

  function iniciarPartida() {
    Object.assign(partida, { ativa: true, pontos: [0, 0], sacador: 0, troca: 0, maiorTroca: 0 });
    painel.esconder();
    $('[data-placar]').hidden = false;
    $('[data-nome-1]').textContent = config.modo === '2p' ? 'Jogador 1' : 'Você';
    $('[data-nome-2]').textContent = config.modo === '2p' ? 'Jogador 2' : nivel.nome;
    atualizarPlacar();
    prepararSaque();
    palco.focus({ preventScroll: true });
  }

  function prepararSaque() {
    partida.fase = 'saque';
    partida.troca = 0;
    const r = raquetes[partida.sacador];
    bola.rastro.length = 0;
    bola.vx = bola.vy = bola.vz = 0;
    bola.giroTopo = bola.giroLado = 0;
    bola.x = r.x;
    bola.y = r.y + 0.12;
    bola.z = r.z + (partida.sacador === 0 ? 0.08 : -0.08);
    partida.relogio = partida.sacador === 1 && config.modo === '1p' ? 1.1 : 0;
    const quem = partida.sacador === 0 ? (config.modo === '2p' ? 'Jogador 1' : 'Você') : (config.modo === '2p' ? 'Jogador 2' : 'CPU');
    mostrarAviso(partida.sacador === 0 && config.modo === '1p' ? 'Seu saque: clique ou toque' : `Saque: ${quem}${config.modo === '2p' ? ' (espaço / Enter)' : ''}`);
  }

  function sacar() {
    if (partida.fase !== 'saque') return;
    const quem = partida.sacador;
    partida.fase = 'jogo';
    esconderAviso();
    golpear(quem, { ritmo: 0.95, direcao: aleatorio(-0.4, 0.4), topo: 3, lado: aleatorio(-2, 2) });
  }

  function fimDoPonto(vencedor, motivo) {
    partida.fase = 'ponto';
    partida.pontos[vencedor]++;
    partida.maiorTroca = Math.max(partida.maiorTroca, partida.troca);
    partida.relogio = 1.3;
    atualizarPlacar();
    const humano = config.modo === '2p' || vencedor === 0;
    // Torcida: mais animada em trocas longas
    if (torcida && humano) {
      audio.tocarAmostra(torcida, { inicio: aleatorio(0, Math.max(0, torcida.duration - 2.4)), duracao: 1.4 + Math.min(1, partida.troca / 8), volume: 0.35 + Math.min(0.5, partida.troca * 0.05), canal: 'efeitos', soltura: 0.6 });
    } else {
      audio.tocar('erro');
    }
    if (vencedor === 0 && config.modo === '1p') progresso.registrar('pingpong:ponto');
    if (partida.troca >= 10) progresso.registrar('pingpong:troca-longa');
    mostrarAviso(`${motivo} · ponto para ${nomeDe(vencedor)}`);
    // A cada 2 pontos troca o saque (e a cada ponto no 10 × 10)
    const total = partida.pontos[0] + partida.pontos[1];
    const deuce = partida.pontos[0] >= PONTOS_VITORIA - 1 && partida.pontos[1] >= PONTOS_VITORIA - 1;
    if (deuce || total % 2 === 0) partida.sacador = 1 - partida.sacador;
  }

  function nomeDe(lado) {
    if (config.modo === '2p') return lado === 0 ? 'Jogador 1' : 'Jogador 2';
    return lado === 0 ? 'você' : 'a CPU';
  }

  function verificarFim() {
    const [a, b] = partida.pontos;
    if (Math.max(a, b) >= PONTOS_VITORIA && Math.abs(a - b) >= 2) {
      encerrarPartida(a > b ? 0 : 1);
      return true;
    }
    return false;
  }

  function encerrarPartida(vencedor) {
    partida.ativa = false;
    partida.fase = 'parado';
    $('[data-placar]').hidden = true;
    esconderAviso();
    const venceu = config.modo === '2p' || vencedor === 0;
    if (aplausos && venceu) audio.tocarAmostra(aplausos, { volume: 0.8, canal: 'efeitos', soltura: 0.8 });
    if (config.modo === '1p' && vencedor === 0) {
      progresso.registrar('pingpong:vitoria', 1, nivel.id);
      progresso.ganharXp(40 + NIVEIS.indexOf(nivel) * 30);
    }
    progresso.registrar('pingpong:partida');
    progresso.definirRecorde('ping-pong', 'troca', partida.maiorTroca);
    painel.resumo({
      selo: `${icone(venceu ? 'trofeu' : 'estrela')}${config.modo === '2p' ? `Vitória de ${nomeDe(vencedor)}!` : vencedor === 0 ? `Você venceu no ${nivel.nome}!` : 'Boa partida!'}`,
      titulo: `${partida.pontos[0]} <small>×</small> ${partida.pontos[1]}`,
      estatisticas: [
        ['Maior troca', `${partida.maiorTroca} golpes`],
        ['Recorde de troca', `${progresso.recorde('ping-pong', 'troca') ?? partida.maiorTroca}`],
      ],
    }, mostrarInicio);
  }

  function mostrarInicio() {
    const vitorias = progresso.contador('pingpong:vitoria');
    painel.inicio({
      titulo: 'Ping Pong',
      texto: 'Mexa a raquete com o mouse ou o dedo. Na hora do golpe, o movimento dá força e efeito.',
      regras: [['raquete', 'Primeiro a 11 pontos, com 2 de vantagem'], ['espiral', 'Raquete subindo = topspin; de lado = curva'], ['teclado', '2 jogadores: A/D e W contra ←/→ e ↑']],
      extra: `
        <div class="painel-jogo__opcoes" role="group" aria-label="Modo">
          <button type="button" class="chip" data-modo="1p" aria-pressed="${config.modo === '1p'}">Contra a CPU</button>
          <button type="button" class="chip" data-modo="2p" aria-pressed="${config.modo === '2p'}">2 jogadores</button>
        </div>
        <div class="painel-jogo__opcoes" role="group" aria-label="Nível da CPU" data-niveis ${config.modo === '2p' ? 'hidden' : ''}>
          ${NIVEIS.map((n) => `<button type="button" class="chip" data-nivel="${n.id}" aria-pressed="${n.id === nivel.id}">${n.nome}</button>`).join('')}
        </div>`,
      recorde: vitorias ? `${vitorias} ${vitorias === 1 ? 'vitória' : 'vitórias'} contra a CPU` : '',
    }, iniciarPartida);
  }

  // Escolhas de modo e nível no painel inicial (ligadas uma vez só)
  painel.elemento.addEventListener('click', (e) => {
    const modo = e.target.closest('[data-modo]');
    if (modo) {
      config.modo = modo.dataset.modo;
      salvar();
      painel.elemento.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b === modo)));
      painel.elemento.querySelector('[data-niveis]').hidden = config.modo === '2p';
    }
    const botaoNivel = e.target.closest('[data-nivel]');
    if (botaoNivel) {
      nivel = NIVEIS.find((n) => n.id === botaoNivel.dataset.nivel);
      config.nivel = nivel.id;
      salvar();
      painel.elemento.querySelectorAll('[data-nivel]').forEach((b) => b.setAttribute('aria-pressed', String(b === botaoNivel)));
    }
  });

  function atualizarPlacar() {
    $('[data-pontos-1]').textContent = String(partida.pontos[0]);
    $('[data-pontos-2]').textContent = String(partida.pontos[1]);
  }

  let timerAviso = 0;
  function mostrarAviso(texto) {
    clearTimeout(timerAviso);
    aviso.textContent = texto;
    aviso.classList.add('pong__aviso--visivel');
  }
  function esconderAviso() {
    timerAviso = setTimeout(() => aviso.classList.remove('pong__aviso--visivel'), 200);
  }

  /* ---------- Entrada ---------- */

  palco.addEventListener('pointermove', (e) => {
    const caixa = palco.getBoundingClientRect();
    ponteiro = { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  });
  palco.addEventListener('pointerdown', (e) => {
    const caixa = palco.getBoundingClientRect();
    ponteiro = { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
    if (partida.fase === 'saque' && partida.sacador === 0) sacar();
  });
  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button')) return;
    const tecla = e.key.toLowerCase();
    if (['a', 'd', 'w', 's', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(tecla)) {
      e.preventDefault();
      teclas.add(tecla);
      if (config.modo === '1p') ponteiro = null;
    }
    if ((tecla === ' ' || tecla === 'enter') && partida.fase === 'saque') {
      e.preventDefault();
      if (config.modo === '2p' || partida.sacador === 0) sacar();
    }
  });
  raiz.addEventListener('keyup', (e) => teclas.delete(e.key.toLowerCase()));

  /* ---------- Raquetes ---------- */

  function moverRaquete(r, alvoX, alvoY, velocidadeMax, dt) {
    const dx = clamp(alvoX - r.x, -velocidadeMax * dt, velocidadeMax * dt);
    const dy = clamp(alvoY - r.y, -velocidadeMax * dt, velocidadeMax * dt);
    r.vx += ((dx / dt) - r.vx) * Math.min(1, dt * 18);
    r.vy += ((dy / dt) - r.vy) * Math.min(1, dt * 18);
    r.x += dx;
    r.y += dy;
    r.golpe = Math.max(0, r.golpe - dt * 4);
  }

  function controlarJogador(dt) {
    const r = raquetes[0];
    if (ponteiro && config.modo === '1p') {
      const p = desprojetar(ponteiro.x, ponteiro.y, r.z);
      r.alvoX = clamp(p.x, -1.3, 1.3);
      r.alvoY = clamp(p.y, 0.02, 0.85);
      moverRaquete(r, r.alvoX, r.alvoY, 30, dt);
      return;
    }
    // Teclado (ou 2 jogadores): A/D andam; a altura acompanha a bola sozinha
    const sentido = (teclas.has('d') || (config.modo === '1p' && teclas.has('arrowright')) ? 1 : 0) - (teclas.has('a') || (config.modo === '1p' && teclas.has('arrowleft')) ? 1 : 0);
    r.alvoX = clamp(r.alvoX + sentido * 2.6 * dt, -1.2, 1.2);
    r.alvoY = clamp(bola.z < COMP / 2 ? bola.y : 0.25, 0.05, 0.6);
    moverRaquete(r, r.alvoX, r.alvoY, 4, dt);
  }

  function controlarRival(dt) {
    const r = raquetes[1];
    if (config.modo === '2p') {
      const sentido = (teclas.has('arrowleft') ? 1 : 0) - (teclas.has('arrowright') ? 1 : 0); // visto de frente, esquerda e direita trocam
      r.alvoX = clamp(r.alvoX + sentido * 2.6 * dt, -1.2, 1.2);
      r.alvoY = clamp(bola.z > COMP / 2 ? bola.y : 0.25, 0.05, 0.6);
      moverRaquete(r, r.alvoX, r.alvoY, 4, dt);
      return;
    }
    // CPU: prevê onde a bola vai chegar, com tempo de reação e erro do nível
    ia.reacao -= dt;
    if (bola.vz > 0 && partida.fase === 'jogo') {
      if (ia.reacao <= 0) {
        const t = Math.max(0, (Z_RIVAL - bola.z) / Math.max(0.5, bola.vz));
        ia.alvoX = bola.x + bola.vx * t + aleatorio(-nivel.erro, nivel.erro) * 0.6;
        ia.alvoY = clamp(0.28 + Math.sin(tempo * 2) * 0.05, 0.05, 0.6);
        ia.reacao = nivel.reacao;
      }
    } else if (partida.fase !== 'saque') {
      ia.alvoX *= 0.98;
    }
    moverRaquete(r, ia.alvoX, ia.alvoY, nivel.velocidade, dt);
    // A CPU acompanha a altura da bola no último instante
    if (bola.vz > 0 && Z_RIVAL - bola.z < 0.6) r.y += (bola.y - r.y) * Math.min(1, dt * 10);
  }

  /* ---------- Desenho ---------- */

  function poligono(pontos, cor) {
    g.fillStyle = cor;
    g.beginPath();
    pontos.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fill();
  }

  function desenharRaquete(r) {
    const p = projetar(r.x, r.y, r.z);
    const raio = 0.085 * p.escala;
    const inclinacao = clamp(r.vx * 0.08, -0.5, 0.5);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(inclinacao);
    // Cabo de madeira
    g.fillStyle = '#c08a4e';
    g.beginPath();
    g.roundRect(-raio * 0.18, raio * 0.8, raio * 0.36, raio * 1.1, raio * 0.1);
    g.fill();
    // Borracha
    const borracha = g.createRadialGradient(-raio * 0.3, -raio * 0.3, raio * 0.1, 0, 0, raio);
    borracha.addColorStop(0, r === raquetes[0] ? '#ff6b6b' : '#5b8bff');
    borracha.addColorStop(1, r.cor);
    g.fillStyle = borracha;
    g.shadowColor = 'rgba(0,0,0,0.4)';
    g.shadowBlur = raio * 0.3;
    g.beginPath();
    g.ellipse(0, 0, raio * 0.92, raio, 0, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = '#2a1a0e';
    g.lineWidth = Math.max(1, raio * 0.06);
    g.stroke();
    if (r.golpe > 0) {
      g.strokeStyle = `rgba(255,255,255,${r.golpe * 0.8})`;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, 0, raio * (1 + (1 - r.golpe) * 0.6), raio * (1.08 + (1 - r.golpe) * 0.6), 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  function desenhar() {
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Ginásio: chão de madeira escura e luz de cima
    const fundo = g.createLinearGradient(0, 0, 0, a);
    fundo.addColorStop(0, '#0e1630');
    fundo.addColorStop(0.45, '#1a2550');
    fundo.addColorStop(1, '#3a2a1e');
    g.fillStyle = fundo;
    g.fillRect(0, 0, l, a);
    const holofote = g.createRadialGradient(l / 2, a * 0.35, 0, l / 2, a * 0.35, Math.max(l, a) * 0.6);
    holofote.addColorStop(0, 'rgba(255,240,210,0.22)');
    holofote.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = holofote;
    g.fillRect(0, 0, l, a);

    // Sombra da mesa no chão
    const sombra = [projetar(-LARG / 2 - 0.1, -0.76, -0.05), projetar(LARG / 2 + 0.1, -0.76, -0.05), projetar(LARG / 2 + 0.1, -0.76, COMP + 0.05), projetar(-LARG / 2 - 0.1, -0.76, COMP + 0.05)];
    poligono(sombra, 'rgba(0,0,0,0.35)');
    // Pernas
    for (const [x, z] of [[-LARG / 2 + 0.15, 0.25], [LARG / 2 - 0.15, 0.25], [-LARG / 2 + 0.15, COMP - 0.25], [LARG / 2 - 0.15, COMP - 0.25]]) {
      const topo = projetar(x, 0, z);
      const base = projetar(x, -0.76, z);
      g.strokeStyle = '#1b1f2a';
      g.lineWidth = Math.max(2, 0.04 * topo.escala);
      g.beginPath();
      g.moveTo(topo.x, topo.y);
      g.lineTo(base.x, base.y);
      g.stroke();
    }
    // Lateral (espessura) e tampo
    const c = [projetar(-LARG / 2, 0, 0), projetar(LARG / 2, 0, 0), projetar(LARG / 2, 0, COMP), projetar(-LARG / 2, 0, COMP)];
    const cBaixo = [projetar(-LARG / 2, -0.04, 0), projetar(LARG / 2, -0.04, 0)];
    poligono([c[0], c[1], cBaixo[1], cBaixo[0]], '#0b2a6b');
    const tampo = g.createLinearGradient(0, c[2].y, 0, c[0].y);
    tampo.addColorStop(0, '#1d5fd1');
    tampo.addColorStop(1, '#1546a8');
    poligono(c, tampo);
    // Linhas brancas
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 2;
    g.beginPath();
    c.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    const meioPerto = projetar(0, 0, 0);
    const meioLonge = projetar(0, 0, COMP);
    g.moveTo(meioPerto.x, meioPerto.y);
    g.lineTo(meioLonge.x, meioLonge.y);
    g.stroke();

    // A bola e a raquete de trás são desenhadas antes da rede quando estão do outro lado
    const atras = bola.z > COMP / 2;
    desenharRaquete(raquetes[1]);
    if (atras) desenharBola();
    // Rede
    const r1 = projetar(-LARG / 2 - 0.15, 0, COMP / 2);
    const r2 = projetar(LARG / 2 + 0.15, 0, COMP / 2);
    const r3 = projetar(LARG / 2 + 0.15, REDE, COMP / 2);
    const r4 = projetar(-LARG / 2 - 0.15, REDE, COMP / 2);
    poligono([r1, r2, r3, r4], 'rgba(20,24,36,0.55)');
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 30; i++) {
      const x = r1.x + ((r2.x - r1.x) * i) / 30;
      g.moveTo(x, r1.y);
      g.lineTo(r4.x + ((r3.x - r4.x) * i) / 30, r4.y);
    }
    g.stroke();
    g.strokeStyle = '#f4f4f0';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(r4.x, r4.y);
    g.lineTo(r3.x, r3.y);
    g.stroke();
    if (!atras) desenharBola();
    desenharRaquete(raquetes[0]);

    for (const e of efeitos) {
      const p = projetar(e.x, e.y, e.z);
      g.strokeStyle = e.cor;
      g.globalAlpha = e.vida;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(p.x, p.y, (0.04 + (1 - e.vida) * 0.12) * p.escala, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function desenharBola() {
    if (partida.fase === 'parado') return;
    // Sombra na mesa (ou no chão): essencial para enxergar a altura
    const naMesa = Math.abs(bola.x) <= LARG / 2 && bola.z >= 0 && bola.z <= COMP;
    const ys = naMesa ? 0.001 : -0.76;
    const s = projetar(bola.x, ys, bola.z);
    g.fillStyle = `rgba(0,0,0,${clamp(0.45 - (bola.y - ys) * 0.35, 0.08, 0.45)})`;
    g.beginPath();
    g.ellipse(s.x, s.y, RAIO_BOLA * 1.3 * s.escala, RAIO_BOLA * 0.6 * s.escala, 0, 0, Math.PI * 2);
    g.fill();
    // Rastro
    if (!movimentoReduzido()) {
      bola.rastro.forEach((p, i) => {
        const q = projetar(p.x, p.y, p.z);
        g.fillStyle = `rgba(255,190,90,${(i / bola.rastro.length) * 0.3})`;
        g.beginPath();
        g.arc(q.x, q.y, RAIO_BOLA * q.escala * (0.5 + i / bola.rastro.length * 0.5), 0, Math.PI * 2);
        g.fill();
      });
    }
    const p = projetar(bola.x, bola.y, bola.z);
    const r = Math.max(2.5, RAIO_BOLA * p.escala);
    const grad = g.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#ffd9a0');
    grad.addColorStop(1, '#ff9a3c');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fill();
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      camera.foco = Math.min(tela.l * 1.1, tela.a * 1.5);
    },
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    tempo += dt;
    controlarJogador(dt);
    controlarRival(dt);

    if (partida.fase === 'saque') {
      const r = raquetes[partida.sacador];
      bola.x = r.x;
      bola.y = r.y + 0.12 + Math.abs(Math.sin(tempo * 4)) * 0.08;
      bola.z = r.z + (partida.sacador === 0 ? 0.08 : -0.08);
      if (partida.sacador === 1 && config.modo === '1p') {
        partida.relogio -= dt;
        if (partida.relogio <= 0) sacar();
      }
    } else if (partida.fase === 'jogo') {
      // Subpassos: a bola é rápida e a raquete é fina
      const passos = 4;
      for (let i = 0; i < passos && partida.fase === 'jogo'; i++) {
        passoBola(dt / passos);
        tentarRebater(0);
        tentarRebater(1);
      }
    } else if (partida.fase === 'ponto') {
      passoBola(dt);
      partida.relogio -= dt;
      if (partida.relogio <= 0 && !verificarFim()) prepararSaque();
    }

    for (const e of efeitos) e.vida -= dt * 3;
    for (let i = efeitos.length - 1; i >= 0; i--) if (efeitos[i].vida <= 0) efeitos.splice(i, 1);
    desenhar();
  });

  raiz.style.setProperty('--c1', '#ff9a3c');
  raiz.style.setProperty('--c2', '#1d5fd1');
  mostrarInicio();

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      clearTimeout(timerAviso);
    },
  };
}
