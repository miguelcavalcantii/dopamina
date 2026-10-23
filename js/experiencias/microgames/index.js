/**
 * Relâmpago: microgames de 3 a 5 segundos em sequência, estilo WarioWare.
 * O motor cuida de rodadas, vidas, pontos, velocidade, cartões de comando,
 * entrada (mouse, toque e teclado com cursor virtual) e partículas.
 */
import { MICROGAMES } from './microgames.js';
import { criarCanvasResponsivo } from '../../core/canvas.js';
import { icone } from '../../core/icones.js';
import { aleatorio, carregarEstilo, clamp, embaralhar, escolher, movimentoReduzido, perfilLeve } from '../../core/util.js';
import { ler, gravar } from '../../core/armazenamento.js';

/**
 * Dificuldades. `tempo` multiplica a duração de cada microgame (com `tempoMinimo`);
 * `complexidade` multiplica a velocidade que os microgames enxergam (mais balões,
 * objetos mais rápidos, alvos menores). O Normal é o jogo original.
 */
export const DIFICULDADES = [
  { id: 'facil', nome: 'Fácil', descricao: '5 vidas, tempo de sobra', cor: '#3cffb4', vidas: 5, velInicial: 0.8, incremento: 0.04, velMaxima: 1.7, aceleraACada: 5, tempo: 1.35, tempoMinimo: 2.8, complexidade: 0.8, chaveRecorde: 'pontos-facil' },
  { id: 'normal', nome: 'Normal', descricao: '4 vidas, acelera aos poucos', cor: '#ffd60a', vidas: 4, velInicial: 1, incremento: 0.07, velMaxima: 2.4, aceleraACada: 4, tempo: 1, tempoMinimo: 2.2, complexidade: 1, chaveRecorde: 'pontos' },
  { id: 'dificil', nome: 'Difícil', descricao: '3 vidas, desafios maiores', cor: '#ff7a18', vidas: 3, velInicial: 1.2, incremento: 0.09, velMaxima: 2.8, aceleraACada: 4, tempo: 0.85, tempoMinimo: 1.9, complexidade: 1.25, chaveRecorde: 'pontos-dificil' },
  { id: 'insano', nome: 'Insano', descricao: '2 vidas, só reflexo puro', cor: '#ff2e97', vidas: 2, velInicial: 1.45, incremento: 0.11, velMaxima: 3.3, aceleraACada: 3, tempo: 0.7, tempoMinimo: 1.6, complexidade: 1.55, chaveRecorde: 'pontos-insano' },
];
/** Pontos no Difícil para liberar o Insano. */
export const PONTOS_PARA_INSANO = 4000;

const VELOCIDADE_CURSOR = 560;
const FRASES_ACERTO = ['BOA!', 'ISSO!', 'UAU!', 'MANDOU BEM!', 'PERFEITO!', 'DEMAIS!'];
const FRASES_ERRO = ['QUASE!', 'OPS!', 'FOI POR POUCO!', 'TUDO BEM!'];
const FUNDO_INICIAL = ['#ff2e97', '#ffd60a'];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/microgames.css', import.meta.url));

  const config = { dificuldade: 'normal', ...ler('relampago-config', {}) };
  const insanoLiberado = () => (progresso.recorde('microgames', 'pontos-dificil') ?? 0) >= PONTOS_PARA_INSANO;
  let dif = DIFICULDADES.find((d) => d.id === config.dificuldade) ?? DIFICULDADES[1];
  if (dif.id === 'insano' && !insanoLiberado()) dif = DIFICULDADES[1];

  raiz.classList.add('relampago');
  raiz.innerHTML = `
    <div class="relampago__palco" tabindex="0" role="application"
      aria-label="Relâmpago. Use mouse ou toque. No teclado, setas movem o cursor e espaço toca.">
      <canvas class="relampago__canvas"></canvas>
    </div>
    <div class="relampago__hud" data-hud hidden>
      <div class="relampago__vidas" data-vidas role="img"></div>
      <div class="relampago__placar"><span data-pontos>0</span><small>pontos</small></div>
      <div class="relampago__rodada"><span data-rodada>1</span><small data-velocidade>x1.0</small></div>
    </div>
    <div class="relampago__pavio" data-pavio-caixa hidden><span data-pavio></span></div>
    <div class="relampago__cartao" data-cartao aria-live="polite"></div>
    <div class="relampago__painel vidro-fosco" data-painel></div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.relampago__palco');
  const canvas = $('.relampago__canvas');
  const g = canvas.getContext('2d');
  const cartao = $('[data-cartao]');
  const painel = $('[data-painel]');
  const pavio = $('[data-pavio]');

  let tela = { l: 1, a: 1, dpr: 1 };
  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: perfilLeve ? 1.5 : 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
    },
  });

  /** Região livre do HUD (em cima) e do pavio (embaixo). */
  const area = () => {
    const topo = tela.a > 620 ? 170 : 150;
    return { x0: 24, y0: topo, x1: tela.l - 24, y1: tela.a - 70 };
  };

  /* ---------- Estado ---------- */

  const cursor = { x: 0, y: 0, pressionado: false, teclado: false };
  const setas = new Set();
  const particulas = [];
  const aneis = [];
  const partida = {
    fase: 'inicio',
    vidas: dif.vidas,
    pontos: 0,
    rodada: 0,
    vitorias: 0,
    sequencia: 0,
    melhorSequencia: 0,
    vel: 1,
    relogio: 0,
    duracao: 1,
    restante: 1,
    ultimoTique: 0,
    def: null,
    jogo: null,
    resultado: null,
    fila: [],
  };
  let fundoAtual = FUNDO_INICIAL;
  let fundoAnterior = FUNDO_INICIAL;
  let misturaFundo = 1;
  let tempo = 0;

  /* ---------- API entregue aos microgames ---------- */

  const j = {
    get l() { return tela.l; },
    get a() { return tela.a; },
    get vel() { return partida.vel * dif.complexidade; },
    get area() { return area(); },
    cursor,
    ganhar: () => finalizar(true),
    perder: () => finalizar(false),
    som: (nome, opcoes) => audio.tocar(nome, opcoes),
    pan: (x) => clamp((x / tela.l) * 2 - 1, -1, 1) * 0.7,
    particulas(x, y, cores, quantidade = 16, forca = 1) {
      const limite = movimentoReduzido() ? 0.5 : 1;
      for (let i = 0; i < quantidade * limite; i++) {
        const ang = aleatorio(0, Math.PI * 2);
        const vel = aleatorio(120, 360) * forca;
        particulas.push({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel - 80, vida: aleatorio(0.5, 0.9), cor: escolher(cores), tam: aleatorio(2.5, 5) });
      }
      if (particulas.length > 400) particulas.splice(0, particulas.length - 400);
    },
    anel(x, y, cor = '#ffffff', raio = 20) {
      aneis.push({ x, y, cor, raio, vida: 1 });
    },
  };

  /* ---------- HUD, cartões e painéis ---------- */

  function atualizarHud() {
    $('[data-vidas]').innerHTML = Array.from({ length: dif.vidas }, (_, i) =>
      `<span class="relampago__vida ${i < partida.vidas ? '' : 'relampago__vida--perdida'}">${icone('coracao')}</span>`).join('');
    $('[data-vidas]').setAttribute('aria-label', `${partida.vidas} vidas`);
    $('[data-pontos]').textContent = partida.pontos.toLocaleString('pt-BR');
    $('[data-rodada]').textContent = `Rodada ${partida.rodada}`;
    $('[data-velocidade]').textContent = `velocidade x${partida.vel.toFixed(1)}`;
  }

  function mostrarCartao(titulo, subtitulo, tipo, cores = fundoAtual) {
    cartao.className = `relampago__cartao relampago__cartao--${tipo}`;
    cartao.style.setProperty('--c1', cores[0]);
    cartao.style.setProperty('--c2', cores[1]);
    cartao.innerHTML = '<strong></strong><span></span>';
    cartao.querySelector('strong').textContent = titulo;
    cartao.querySelector('span').textContent = subtitulo;
    void cartao.offsetWidth; // reinicia a animação de entrada
    cartao.classList.add('relampago__cartao--visivel');
  }

  function esconderCartao() {
    cartao.classList.remove('relampago__cartao--visivel');
  }

  function htmlDificuldades() {
    return `<div class="relampago__dificuldades" role="radiogroup" aria-label="Dificuldade">
      ${DIFICULDADES.map((d) => {
        const bloqueada = d.id === 'insano' && !insanoLiberado();
        const recorde = progresso.recorde('microgames', d.chaveRecorde);
        const rodape = bloqueada
          ? `${icone('cadeado')}${PONTOS_PARA_INSANO.toLocaleString('pt-BR')} pts no Difícil`
          : recorde ? `${icone('trofeu')}${recorde.toLocaleString('pt-BR')}` : 'sem recorde';
        return `<button type="button" class="dificuldade ${bloqueada ? 'dificuldade--bloqueada' : ''}" role="radio"
            data-dificuldade="${d.id}" aria-checked="${d.id === dif.id}" ${bloqueada ? 'aria-disabled="true"' : ''} style="--cor:${d.cor}">
          <strong>${d.nome}</strong><small>${d.descricao}</small><span class="dificuldade__recorde">${rodape}</span>
        </button>`;
      }).join('')}
    </div>`;
  }

  function ligarDificuldades() {
    painel.querySelector('.relampago__dificuldades')?.addEventListener('click', (e) => {
      const botao = e.target.closest('[data-dificuldade]');
      if (!botao) return;
      if (botao.getAttribute('aria-disabled') === 'true') {
        audio.tocar('erro');
        botao.classList.remove('dificuldade--tremer');
        void botao.offsetWidth;
        botao.classList.add('dificuldade--tremer');
        return;
      }
      dif = DIFICULDADES.find((d) => d.id === botao.dataset.dificuldade);
      config.dificuldade = dif.id;
      gravar('relampago-config', config);
      for (const outro of painel.querySelectorAll('[data-dificuldade]')) outro.setAttribute('aria-checked', String(outro === botao));
      painel.style.setProperty('--cor-dificuldade', dif.cor);
      partida.vidas = dif.vidas;
      atualizarHud();
    });
    painel.style.setProperty('--cor-dificuldade', dif.cor);
  }

  function mostrarPainelInicial() {
    painel.innerHTML = `
      <h2 class="relampago__titulo">Relâmpago</h2>
      <p class="relampago__texto">Desafios de poucos segundos, um atrás do outro. Leia o comando e reaja rápido!</p>
      ${htmlDificuldades()}
      <ul class="relampago__regras">
        <li>${icone('raio')} Fica mais rápido a cada rodada</li>
        <li>${icone('alvo')} Mouse, toque ou teclado (setas + espaço)</li>
      </ul>
      <button type="button" class="relampago__botao" data-comecar data-foco-inicial>${icone('jogar')}Começar</button>`;
    painel.hidden = false;
    ligarDificuldades();
    painel.querySelector('[data-comecar]').addEventListener('click', iniciarPartida);
    painel.querySelector('[data-comecar]').focus({ preventScroll: true });
  }

  function mostrarResumo(novoRecorde, liberouInsano) {
    const recorde = progresso.recorde('microgames', dif.chaveRecorde) ?? partida.pontos;
    painel.innerHTML = `
      <p class="relampago__selo">${novoRecorde ? `${icone('trofeu')} Novo recorde no ${dif.nome}!` : `${icone('estrela')} Boa corrida!`}</p>
      ${liberouInsano ? `<p class="relampago__selo relampago__selo--insano">${icone('raio')} Modo Insano liberado!</p>` : ''}
      <h2 class="relampago__titulo">${partida.pontos.toLocaleString('pt-BR')} <small>pontos</small></h2>
      <dl class="relampago__estatisticas">
        <div><dt>Vitórias</dt><dd>${partida.vitorias}</dd></div>
        <div><dt>Rodada</dt><dd>${partida.rodada}</dd></div>
        <div><dt>Sequência</dt><dd>x${partida.melhorSequencia}</dd></div>
        <div><dt>Recorde (${dif.nome})</dt><dd>${recorde.toLocaleString('pt-BR')}</dd></div>
      </dl>
      ${htmlDificuldades()}
      <div class="relampago__acoes">
        <button type="button" class="relampago__botao" data-comecar>${icone('jogar')}Jogar de novo</button>
        <a class="relampago__botao relampago__botao--secundario" href="#/">${icone('voltar')}Hub</a>
      </div>`;
    painel.hidden = false;
    ligarDificuldades();
    painel.querySelector('[data-comecar]').addEventListener('click', iniciarPartida);
    painel.querySelector('[data-comecar]').focus({ preventScroll: true });
  }

  /* ---------- Fluxo da partida ---------- */

  function iniciarPartida() {
    Object.assign(partida, { vidas: dif.vidas, pontos: 0, rodada: 0, vitorias: 0, sequencia: 0, melhorSequencia: 0, vel: 1, fila: [], def: null, jogo: null });
    painel.hidden = true;
    $('[data-hud]').hidden = false;
    $('[data-pavio-caixa]').hidden = false;
    cursor.x = tela.l / 2;
    cursor.y = (area().y0 + area().y1) / 2;
    palco.focus({ preventScroll: true });
    proximaRodada();
  }

  function proximaRodada() {
    partida.rodada++;
    partida.vel = Math.min(dif.velMaxima, dif.velInicial + (partida.rodada - 1) * dif.incremento);
    atualizarHud();
    if (partida.rodada > 1 && (partida.rodada - 1) % dif.aceleraACada === 0) {
      partida.fase = 'acelerar';
      partida.relogio = 1.1;
      partida.jogo = null;
      mostrarCartao('MAIS RÁPIDO!', `velocidade x${partida.vel.toFixed(1)}`, 'acelerar');
      audio.tocar('acelerar');
      return;
    }
    mostrarComando();
  }

  function sortearMicrogame() {
    if (!partida.fila.length) {
      partida.fila = embaralhar(MICROGAMES);
      // Evita repetir o mesmo jogo na virada do baralho
      if (partida.fila[0] === partida.def) partida.fila.push(partida.fila.shift());
    }
    return partida.fila.shift();
  }

  function mostrarComando() {
    const def = sortearMicrogame();
    partida.def = def;
    partida.resultado = null;
    partida.jogo = def.criar(j);
    partida.duracao = Math.max(dif.tempoMinimo, (def.duracao * dif.tempo) / Math.sqrt(partida.vel));
    partida.restante = partida.duracao;
    partida.ultimoTique = Math.ceil(partida.restante);
    fundoAnterior = fundoAtual;
    fundoAtual = def.fundo;
    misturaFundo = 0;
    pavio.style.setProperty('--p', '100%');
    mostrarCartao(partida.jogo.comando ?? def.comando, def.dica, 'comando', def.fundo);
    audio.tocar('inicio');
    partida.fase = 'comando';
    partida.relogio = movimentoReduzido() ? 1.4 : Math.max(0.8, 1.2 / Math.sqrt(partida.vel));
  }

  function finalizar(venceu) {
    if (partida.fase !== 'jogando' || partida.resultado) return;
    partida.resultado = venceu ? 'ganhou' : 'perdeu';
    if (venceu) {
      partida.vitorias++;
      partida.sequencia++;
      partida.melhorSequencia = Math.max(partida.melhorSequencia, partida.sequencia);
      const ganho = Math.round(100 * partida.vel + (partida.restante / partida.duracao) * 60);
      partida.pontos += ganho;
      audio.tocar('acerto');
      if (partida.sequencia >= 3) audio.tocar('combo', { n: partida.sequencia - 2 });
      progresso.registrar('relampago:vitoria');
      const extra = partida.sequencia >= 3 ? ` · sequência x${partida.sequencia}` : '';
      mostrarCartao(escolher(FRASES_ACERTO), `+${ganho}${extra}`, 'acerto');
    } else {
      partida.vidas--;
      partida.sequencia = 0;
      audio.tocar('erro');
      const restam = partida.vidas === 1 ? 'Última vida!' : `${partida.vidas} vidas restando`;
      mostrarCartao(escolher(FRASES_ERRO), partida.vidas ? restam : 'Fim da corrida', 'erro');
    }
    partida.fase = 'resultado';
    partida.relogio = 0.95;
    atualizarHud();
  }

  function encerrarPartida() {
    partida.fase = 'resumo';
    partida.jogo = null;
    esconderCartao();
    $('[data-hud]').hidden = true;
    $('[data-pavio-caixa]').hidden = true;
    progresso.registrar('relampago:partida', 1, dif.id);
    const insanoAntes = insanoLiberado();
    const novoRecorde = progresso.definirRecorde('microgames', dif.chaveRecorde, partida.pontos);
    const liberouInsano = !insanoAntes && insanoLiberado();
    progresso.registrar(`relampago:partida-${dif.id}`);
    progresso.definirRecorde('microgames', `rodada-${dif.id}`, partida.rodada);
    progresso.definirRecorde('microgames', 'rodada', partida.rodada);
    progresso.definirRecorde('microgames', 'sequencia', partida.melhorSequencia);
    progresso.ganharXp(Math.round(partida.pontos / 250));
    audio.tocar(novoRecorde && partida.pontos > 0 ? 'conquista' : 'fim');
    mostrarResumo(novoRecorde && partida.pontos > 0, liberouInsano);
  }

  /* ---------- Entrada ---------- */

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  function moverCursor(x, y) {
    const px = cursor.x;
    const py = cursor.y;
    cursor.x = x;
    cursor.y = y;
    if (partida.fase === 'jogando') partida.jogo?.mover?.(x, y, px, py);
  }

  function pressionar() {
    cursor.pressionado = true;
    if (partida.fase === 'jogando') partida.jogo?.pressionar?.(cursor.x, cursor.y);
  }

  function soltar() {
    cursor.pressionado = false;
    if (partida.fase === 'jogando') partida.jogo?.soltar?.(cursor.x, cursor.y);
  }

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    palco.setPointerCapture?.(e.pointerId);
    cursor.teclado = false;
    const { x, y } = posicao(e);
    moverCursor(x, y);
    pressionar();
  });
  palco.addEventListener('pointermove', (e) => {
    cursor.teclado = false;
    const { x, y } = posicao(e);
    moverCursor(x, y);
  });
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  const DIRECOES = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button, a')) return;
    if (DIRECOES[e.key]) {
      e.preventDefault();
      setas.add(e.key);
      cursor.teclado = true;
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (partida.fase === 'inicio' || partida.fase === 'resumo') iniciarPartida();
      else pressionar();
    } else if (e.key.length === 1 && partida.fase === 'jogando') {
      partida.jogo?.tecla?.(e.key);
    }
  });
  raiz.addEventListener('keyup', (e) => {
    setas.delete(e.key);
    if (e.key === ' ' || e.key === 'Enter') soltar();
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    tempo += dt;

    if (setas.size) {
      let dx = 0;
      let dy = 0;
      for (const tecla of setas) {
        dx += DIRECOES[tecla][0];
        dy += DIRECOES[tecla][1];
      }
      const limites = area();
      moverCursor(
        clamp(cursor.x + dx * VELOCIDADE_CURSOR * dt, limites.x0, limites.x1),
        clamp(cursor.y + dy * VELOCIDADE_CURSOR * dt, limites.y0, limites.y1),
      );
    }

    switch (partida.fase) {
      case 'acelerar':
        partida.relogio -= dt;
        if (partida.relogio <= 0) mostrarComando();
        break;
      case 'comando':
        partida.relogio -= dt;
        if (partida.relogio <= 0) {
          partida.fase = 'jogando';
          esconderCartao();
        }
        break;
      case 'jogando': {
        partida.restante -= dt;
        partida.jogo.atualizar(dt);
        const segundo = Math.ceil(partida.restante);
        if (segundo < partida.ultimoTique && segundo <= 3 && segundo > 0) {
          audio.tocar('tique', { tom: 1 + (3 - segundo) * 0.15 });
        }
        partida.ultimoTique = segundo;
        pavio.style.setProperty('--p', `${Math.max(0, partida.restante / partida.duracao) * 100}%`);
        if (partida.restante <= 0 && !partida.resultado) finalizar(Boolean(partida.def.vencePorTempo));
        break;
      }
      case 'resultado':
        partida.relogio -= dt;
        partida.jogo?.atualizar(dt * 0.5);
        if (partida.relogio <= 0) {
          if (partida.vidas <= 0) encerrarPartida();
          else proximaRodada();
        }
        break;
      default:
        break;
    }

    for (const p of particulas) {
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= dt;
    }
    for (let i = particulas.length - 1; i >= 0; i--) if (particulas[i].vida <= 0) particulas.splice(i, 1);
    for (const anel of aneis) anel.vida -= dt * 2.5;
    for (let i = aneis.length - 1; i >= 0; i--) if (aneis[i].vida <= 0) aneis.splice(i, 1);
    misturaFundo = Math.min(1, misturaFundo + dt * 2.5);

    desenhar();
  });

  function desenharFundo() {
    const { l, a } = tela;
    const pintar = (cores, alfa) => {
      const grad = g.createLinearGradient(0, 0, l, a);
      grad.addColorStop(0, cores[0]);
      grad.addColorStop(1, cores[1]);
      g.globalAlpha = alfa;
      g.fillStyle = grad;
      g.fillRect(0, 0, l, a);
    };
    pintar(fundoAnterior, 1);
    if (misturaFundo < 1 || fundoAnterior !== fundoAtual) pintar(fundoAtual, misturaFundo);
    g.globalAlpha = 1;

    // Raios girando, marca registrada do gênero
    const giro = movimentoReduzido() ? 0 : tempo * 0.18;
    const raio = Math.hypot(l, a);
    g.save();
    g.translate(l / 2, a * 0.55);
    g.rotate(giro);
    g.fillStyle = 'rgba(255,255,255,0.09)';
    for (let i = 0; i < 16; i += 2) {
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, raio, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2);
      g.fill();
    }
    g.restore();

    const vinheta = g.createRadialGradient(l / 2, a / 2, Math.min(l, a) * 0.3, l / 2, a / 2, raio * 0.6);
    vinheta.addColorStop(0, 'rgba(10,0,40,0)');
    vinheta.addColorStop(1, 'rgba(10,0,40,0.4)');
    g.fillStyle = vinheta;
    g.fillRect(0, 0, l, a);
  }

  function desenhar() {
    g.setTransform(tela.dpr, 0, 0, tela.dpr, 0, 0);
    desenharFundo();

    if (partida.jogo && ['comando', 'jogando', 'resultado'].includes(partida.fase)) {
      g.save();
      if (partida.fase === 'comando') g.globalAlpha = 0.55;
      partida.jogo.desenhar(g);
      g.restore();
    }

    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of particulas) {
      g.globalAlpha = Math.min(1, p.vida * 1.5);
      g.fillStyle = p.cor;
      g.beginPath();
      g.arc(p.x, p.y, p.tam, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    for (const anel of aneis) {
      g.globalAlpha = anel.vida;
      g.strokeStyle = anel.cor;
      g.lineWidth = 4 * anel.vida;
      g.beginPath();
      g.arc(anel.x, anel.y, anel.raio * (1 + (1 - anel.vida) * 1.2), 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();

    // Mira do cursor de teclado
    if (cursor.teclado && partida.fase === 'jogando') {
      g.save();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.shadowColor = '#000';
      g.shadowBlur = 6;
      g.beginPath();
      g.arc(cursor.x, cursor.y, 14, 0, Math.PI * 2);
      g.moveTo(cursor.x - 22, cursor.y);
      g.lineTo(cursor.x - 8, cursor.y);
      g.moveTo(cursor.x + 8, cursor.y);
      g.lineTo(cursor.x + 22, cursor.y);
      g.moveTo(cursor.x, cursor.y - 22);
      g.lineTo(cursor.x, cursor.y - 8);
      g.moveTo(cursor.x, cursor.y + 8);
      g.lineTo(cursor.x, cursor.y + 22);
      g.stroke();
      g.restore();
    }
  }

  /* ---------- Início ---------- */

  cursor.x = tela.l / 2;
  cursor.y = tela.a / 2;
  atualizarHud();
  mostrarPainelInicial();

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
    },
  };
}
