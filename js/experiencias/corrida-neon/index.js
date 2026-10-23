/**
 * Corrida Neon: endless runner em perspectiva synthwave.
 * Três pistas, pulo, orbes que formam combos e poderes (escudo, ímã, turbo, pontos x2).
 * A velocidade sobe sem parar; 3 vidas, com invulnerabilidade curta após cada batida.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231621';
import { criarPainelJogo } from '../../core/painel-jogo.js?v=202610231621';
import { criarSequenciador } from '../../core/sequenciador.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { aleatorio, carregarEstilo, clamp, embaralhar, escolher, movimentoReduzido, perfilLeve } from '../../core/util.js?v=202610231621';

const Z_MAX = 70;
const FOCO = 7;
const VIDAS = 3;
const VEL_INICIAL = 20;
const VEL_MAXIMA = 62;
const GRAVIDADE = 30;
const IMPULSO_PULO = 10.5;
const TAU = Math.PI * 2;

const PODERES = {
  escudo: { nome: 'Escudo', cor: '#22e4ff', letra: 'E', duracao: 0 },
  ima: { nome: 'Ímã', cor: '#ff2bd6', letra: 'Í', duracao: 8 },
  turbo: { nome: 'Turbo', cor: '#ffd60a', letra: 'T', duracao: 4 },
  dobro: { nome: 'Pontos x2', cor: '#a3ff12', letra: '2', duracao: 10 },
};

// Linha de baixo synthwave (Lá menor, Fá, Dó, Sol), em colcheias
const BAIXO = [45, 45, 57, 45, 45, 57, 45, 57, 41, 41, 53, 41, 41, 53, 41, 53, 48, 48, 60, 48, 48, 60, 48, 60, 43, 43, 55, 43, 43, 55, 43, 55];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/corrida-neon.css?v=202610231621', import.meta.url));

  raiz.classList.add('corrida');
  raiz.innerHTML = `
    <div class="corrida__palco" tabindex="0" role="application"
      aria-label="Corrida Neon. Setas ou A e D trocam de pista, seta para cima ou espaço pula. No toque: deslize ou toque nas laterais e no centro.">
      <canvas class="corrida__canvas"></canvas>
    </div>
    <div class="hud-jogo" data-hud hidden>
      <div class="hud-jogo__vidas" data-vidas></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-pontos>0</span><span class="hud-jogo__rotulo">pontos</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-combo>x1</span><span class="hud-jogo__rotulo" data-combo-texto>combo</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-distancia>0 m</span><span class="hud-jogo__rotulo">distância</span></div>
    </div>
    <div class="corrida__poderes" data-poderes aria-live="polite"></div>
    <div class="cantos-jogo">
      <button type="button" class="chip" data-musica aria-pressed="true">${icone('musica')}<span>Música</span></button>
      <button type="button" class="chip" data-pausa hidden>${icone('relogio')}<span>Pausar</span></button>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.corrida__palco');
  const canvas = $('.corrida__canvas');
  const g = canvas.getContext('2d');
  const painel = criarPainelJogo(raiz);
  const fundo = document.createElement('canvas');

  let tela = { l: 1, a: 1, dpr: 1 };
  let geo = null; // geometria da pista, recalculada no redimensionamento

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: perfilLeve ? 1.25 : 1.75,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      calcularGeometria();
      pintarFundo();
    },
  });

  function calcularGeometria() {
    const { l, a } = tela;
    geo = {
      cx: l / 2,
      horizonte: a * 0.42,
      base: a * 0.86,
      larguraPista: Math.min(l * 0.2, 190),
    };
    geo.unidade = geo.larguraPista * 0.7;
  }

  /** Projeta (x em pistas, z em profundidade, h em altura) na tela. */
  function projetar(x, z, h = 0) {
    const s = FOCO / (FOCO + z);
    return {
      x: geo.cx + x * geo.larguraPista * s,
      y: geo.horizonte + (geo.base - geo.horizonte) * s - h * geo.unidade * s,
      s,
    };
  }

  /* ---------- Cenário fixo (céu, sol, montanhas), pintado uma vez ---------- */

  function pintarFundo() {
    const { l, a, dpr } = tela;
    fundo.width = Math.round(l * dpr);
    fundo.height = Math.round(geo.horizonte * dpr) + 2;
    const f = fundo.getContext('2d');
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    const h = geo.horizonte;

    const ceu = f.createLinearGradient(0, 0, 0, h);
    ceu.addColorStop(0, '#0b0225');
    ceu.addColorStop(0.55, '#3a0a6a');
    ceu.addColorStop(1, '#c21e8a');
    f.fillStyle = ceu;
    f.fillRect(0, 0, l, h + 1);

    for (let i = 0; i < 140; i++) {
      f.fillStyle = `rgba(255,255,255,${aleatorio(0.3, 0.9)})`;
      const tamanho = aleatorio(0.8, 2);
      f.fillRect(aleatorio(0, l), aleatorio(0, h * 0.7), tamanho, tamanho);
    }

    const raio = Math.min(l, a) * 0.17;
    const cy = h - raio * 0.15;
    const aura = f.createRadialGradient(l / 2, cy, 0, l / 2, cy, raio * 3);
    aura.addColorStop(0, 'rgba(255,80,190,0.55)');
    aura.addColorStop(1, 'rgba(255,80,190,0)');
    f.fillStyle = aura;
    f.fillRect(0, 0, l, h);
    const sol = f.createLinearGradient(0, cy - raio, 0, cy + raio);
    sol.addColorStop(0, '#ffe14d');
    sol.addColorStop(0.55, '#ff7a3d');
    sol.addColorStop(1, '#ff2bd6');
    f.save();
    f.beginPath();
    f.rect(0, 0, l, h);
    f.clip();
    f.fillStyle = sol;
    f.beginPath();
    f.arc(l / 2, cy, raio, 0, TAU);
    f.fill();
    f.fillStyle = ceu;
    for (let i = 0; i < 6; i++) f.fillRect(l / 2 - raio, cy - raio * (0.35 - i * 0.1), raio * 2, raio * (0.02 + i * 0.016));
    f.restore();

    // Montanhas com contorno neon
    f.save();
    f.fillStyle = '#16003a';
    f.strokeStyle = '#00f0ff';
    f.lineWidth = 2;
    f.shadowColor = '#00f0ff';
    f.shadowBlur = 10;
    for (const lado of [-1, 1]) {
      f.beginPath();
      let x = l / 2 + lado * raio * 1.1;
      f.moveTo(x, h);
      while (lado < 0 ? x > -30 : x < l + 30) {
        x += lado * aleatorio(l * 0.03, l * 0.07);
        f.lineTo(x, h - aleatorio(a * 0.03, a * 0.12));
        x += lado * aleatorio(l * 0.02, l * 0.04);
        f.lineTo(x, h - aleatorio(0, a * 0.03));
      }
      f.lineTo(x, h);
      f.closePath();
      f.fill();
      f.stroke();
    }
    f.restore();
  }

  /* ---------- Estado da corrida ---------- */

  const jogo = {
    fase: 'inicio',
    vidas: VIDAS,
    pontos: 0,
    distancia: 0,
    vel: VEL_INICIAL,
    pista: 0,
    x: 0,
    altura: 0,
    vy: 0,
    objetos: [],
    proximaLinha: 30,
    combo: 0,
    melhorCombo: 0,
    orbes: 0,
    ultimoOrbe: 0,
    invulneravel: 0,
    escudo: false,
    poderes: { ima: 0, turbo: 0, dobro: 0 },
    tremor: 0,
    tempo: 0,
    deslocamentoGrade: 0,
  };
  const particulas = [];
  const textos = [];
  const config = { musica: true, ...ler('corrida-config', {}) };

  const multiplicadorCombo = () => Math.min(5, 1 + Math.floor(jogo.combo / 8));
  const multiplicadorPontos = () => (jogo.poderes.dobro > 0 ? 2 : 1) * (jogo.poderes.turbo > 0 ? 2 : 1);

  /* ---------- Música ---------- */

  const sequenciador = criarSequenciador(audio, {
    bpm: 118,
    aoPasso(passo, quando) {
      const p = passo % 16;
      if (p % 4 === 0) audio.batida('bumbo', quando);
      if (p === 4 || p === 12) audio.batida('caixa', quando);
      if (p % 2 === 0) audio.batida('chimbal', quando);
      if (p % 2 === 0) audio.nota(BAIXO[(passo / 2) % BAIXO.length], { quando, duracao: 0.2, timbre: 'baixo', volume: 0.13 });
    },
  });

  function atualizarMusica() {
    const tocar = config.musica && (jogo.fase === 'jogando');
    if (tocar && !sequenciador.ativo) sequenciador.iniciar();
    if (!tocar && sequenciador.ativo) sequenciador.parar();
    $('[data-musica]').setAttribute('aria-pressed', String(config.musica));
  }

  $('[data-musica]').addEventListener('click', () => {
    config.musica = !config.musica;
    gravar('corrida-config', config);
    atualizarMusica();
  });
  $('[data-pausa]').addEventListener('click', () => alternarPausa());

  /* ---------- HUD ---------- */

  function atualizarHud() {
    $('[data-vidas]').innerHTML = Array.from({ length: VIDAS }, (_, i) =>
      `<span class="${i < jogo.vidas ? '' : 'perdida'}">${icone('coracao')}</span>`).join('');
    $('[data-pontos]').textContent = Math.floor(jogo.pontos).toLocaleString('pt-BR');
    $('[data-combo]').textContent = `x${multiplicadorCombo()}`;
    $('[data-combo-texto]').textContent = jogo.combo ? `combo ${jogo.combo}` : 'combo';
    $('[data-distancia]').textContent = `${Math.floor(jogo.distancia)} m`;
    const ativos = Object.entries(jogo.poderes).filter(([, t]) => t > 0);
    if (jogo.escudo) ativos.unshift(['escudo', 0]);
    $('[data-poderes]').innerHTML = ativos.map(([id, t]) =>
      `<span class="corrida__poder" style="--cor:${PODERES[id].cor}">${PODERES[id].nome}${t ? ` <b>${Math.ceil(t)}s</b>` : ''}</span>`).join('');
  }

  /* ---------- Fluxo ---------- */

  function mostrarInicio() {
    const recorde = progresso.recorde('corrida-neon', 'pontos');
    painel.inicio({
      titulo: 'Corrida Neon',
      texto: 'Corra pela estrada synthwave, desvie dos muros, pule as barreiras e junte orbes.',
      regras: [
        ['corrida', 'Troque de pista: setas, A/D, deslize ou toque nas laterais'],
        ['mostrar', 'Pule: seta para cima, espaço ou toque no centro'],
        ['estrela', 'Poderes: escudo, ímã, turbo e pontos x2'],
      ],
      recorde: recorde ? `Recorde: ${Math.floor(recorde).toLocaleString('pt-BR')} pontos` : '',
    }, iniciar);
  }

  function iniciar() {
    Object.assign(jogo, {
      fase: 'jogando', vidas: VIDAS, pontos: 0, distancia: 0, vel: VEL_INICIAL, pista: 0, x: 0, altura: 0, vy: 0,
      objetos: [], proximaLinha: 30, combo: 0, melhorCombo: 0, orbes: 0, invulneravel: 0, escudo: false,
      poderes: { ima: 0, turbo: 0, dobro: 0 }, tremor: 0,
    });
    painel.esconder();
    $('[data-hud]').hidden = false;
    $('[data-pausa]').hidden = false;
    palco.focus({ preventScroll: true });
    audio.tocar('inicio');
    atualizarHud();
    atualizarMusica();
  }

  function alternarPausa() {
    if (jogo.fase === 'jogando') jogo.fase = 'pausado';
    else if (jogo.fase === 'pausado') jogo.fase = 'jogando';
    else return;
    $('[data-pausa]').innerHTML = jogo.fase === 'pausado' ? `${icone('jogar')}<span>Continuar</span>` : `${icone('relogio')}<span>Pausar</span>`;
    atualizarMusica();
  }

  function encerrar() {
    jogo.fase = 'fim';
    $('[data-hud]').hidden = true;
    $('[data-pausa]').hidden = true;
    $('[data-poderes]').innerHTML = '';
    atualizarMusica();
    const pontos = Math.floor(jogo.pontos);
    progresso.registrar('corrida:partida');
    progresso.registrar('corrida:metros', Math.floor(jogo.distancia));
    const novo = progresso.definirRecorde('corrida-neon', 'pontos', pontos);
    progresso.definirRecorde('corrida-neon', 'distancia', Math.floor(jogo.distancia));
    progresso.definirRecorde('corrida-neon', 'combo', jogo.melhorCombo);
    progresso.ganharXp(Math.round(pontos / 400));
    audio.tocar(novo && pontos > 0 ? 'conquista' : 'fim');
    painel.resumo({
      selo: novo && pontos > 0 ? `${icone('trofeu')} Novo recorde!` : `${icone('estrela')} Que corrida!`,
      titulo: `${pontos.toLocaleString('pt-BR')} <small>pontos</small>`,
      estatisticas: [
        ['Distância', `${Math.floor(jogo.distancia)} m`],
        ['Orbes', jogo.orbes],
        ['Maior combo', jogo.melhorCombo],
        ['Recorde', Math.floor(progresso.recorde('corrida-neon', 'pontos') ?? pontos).toLocaleString('pt-BR')],
      ],
    }, iniciar);
  }

  /* ---------- Mundo ---------- */

  function gerarLinha(z) {
    const dificuldade = (jogo.vel - VEL_INICIAL) / (VEL_MAXIMA - VEL_INICIAL);
    const pistas = embaralhar([-1, 0, 1]);
    const obstaculos = Math.random() < 0.3 + dificuldade * 0.35 ? 2 : 1;
    for (let i = 0; i < obstaculos; i++) {
      const tipo = Math.random() < 0.45 ? 'barreira' : 'muro';
      jogo.objetos.push({ tipo, pista: pistas[i], z });
      if (tipo === 'barreira' && Math.random() < 0.35) jogo.objetos.push({ tipo: 'orbe', pista: pistas[i], z, h: 1.5 });
    }
    const livre = pistas[obstaculos];
    if (Math.random() < 0.1) {
      jogo.objetos.push({ tipo: 'poder', poder: escolher(Object.keys(PODERES)), pista: livre, z: z + 3 });
    } else if (Math.random() < 0.8) {
      for (let k = 0; k < 4; k++) jogo.objetos.push({ tipo: 'orbe', pista: livre, z: z + 2 + k * 2.4 });
    }
  }

  function pular() {
    if (jogo.fase !== 'jogando' || jogo.altura > 0.01) return;
    jogo.vy = IMPULSO_PULO;
    audio.tocar('pulo');
  }

  function trocarPista(direcao) {
    if (jogo.fase !== 'jogando') return;
    const nova = clamp(jogo.pista + direcao, -1, 1);
    if (nova === jogo.pista) return;
    jogo.pista = nova;
    audio.tocar('tique', { tom: 1.3, intervaloMin: 0.03 });
  }

  function particulasEm(x, y, cores, quantidade, forca = 1) {
    const limite = movimentoReduzido() ? 0.4 : 1;
    for (let i = 0; i < quantidade * limite; i++) {
      const ang = aleatorio(0, TAU);
      const vel = aleatorio(80, 320) * forca;
      particulas.push({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel - 60, vida: aleatorio(0.4, 0.8), cor: escolher(cores), tam: aleatorio(2, 4.5) });
    }
    if (particulas.length > 500) particulas.splice(0, particulas.length - 500);
  }

  function textoFlutuante(x, y, texto, cor) {
    textos.push({ x, y, texto, cor, vida: 1 });
  }

  function bater(objeto) {
    const p = projetar(jogo.x, 0, jogo.altura);
    if (jogo.poderes.turbo > 0) {
      // No turbo os obstáculos viram confete
      particulasEm(p.x, p.y - 20, ['#ffd60a', '#ff2bd6', '#ffffff'], 24, 1.3);
      jogo.pontos += 50;
      audio.tocar('estouro', { tamanho: 0.9 });
      return;
    }
    if (jogo.invulneravel > 0) return;
    if (jogo.escudo) {
      jogo.escudo = false;
      jogo.invulneravel = 1;
      particulasEm(p.x, p.y - 20, ['#22e4ff', '#ffffff'], 30, 1.2);
      audio.tocar('estouro', { tamanho: 0.4 });
      textoFlutuante(p.x, p.y - 80, 'ESCUDO!', '#22e4ff');
      atualizarHud();
      return;
    }
    jogo.vidas--;
    jogo.combo = 0;
    jogo.invulneravel = 1.6;
    jogo.tremor = movimentoReduzido() ? 0 : 0.35;
    particulasEm(p.x, p.y - 20, [objeto.tipo === 'muro' ? '#ff2bd6' : '#ffd60a', '#ffffff'], 34, 1.4);
    audio.tocar('erro');
    audio.tocar('explosao', { tamanho: 0.5 });
    progresso.registrar('corrida:batida');
    atualizarHud();
    if (jogo.vidas <= 0) setTimeout(encerrar, 700);
  }

  function coletar(objeto) {
    const p = projetar(objeto.pista, Math.max(0, objeto.z), objeto.h ?? 0.5);
    if (objeto.tipo === 'orbe') {
      jogo.combo++;
      jogo.orbes++;
      jogo.melhorCombo = Math.max(jogo.melhorCombo, jogo.combo);
      jogo.ultimoOrbe = jogo.tempo;
      const ganho = 25 * multiplicadorCombo() * multiplicadorPontos();
      jogo.pontos += ganho;
      particulasEm(p.x, p.y, ['#22e4ff', '#ffffff'], 8, 0.6);
      audio.tocar('coleta', { n: (jogo.combo % 10) + 1, intervaloMin: 0.02 });
      if (jogo.combo % 8 === 0) {
        textoFlutuante(p.x, p.y - 30, `COMBO x${multiplicadorCombo()}`, '#a3ff12');
        audio.tocar('combo', { n: multiplicadorCombo() });
      }
      progresso.registrar('corrida:orbe');
    } else {
      const poder = PODERES[objeto.poder];
      if (objeto.poder === 'escudo') jogo.escudo = true;
      else jogo.poderes[objeto.poder] = poder.duracao;
      particulasEm(p.x, p.y, [poder.cor, '#ffffff'], 26, 1.1);
      textoFlutuante(p.x, p.y - 40, poder.nome.toUpperCase(), poder.cor);
      audio.tocar(objeto.poder === 'escudo' ? 'escudo' : 'missao');
      progresso.registrar('corrida:poder');
    }
    atualizarHud();
  }

  /* ---------- Atualização ---------- */

  let relogioHud = 0;

  function atualizar(dt) {
    jogo.tempo += dt;
    const turbo = jogo.poderes.turbo > 0;
    const vel = jogo.vel * (turbo ? 1.5 : 1);
    jogo.vel = Math.min(VEL_MAXIMA, jogo.vel + dt * 0.45);
    jogo.distancia += vel * dt * 0.5;
    jogo.deslocamentoGrade = (jogo.deslocamentoGrade + vel * dt) % 6;
    jogo.pontos += vel * dt * 0.4 * multiplicadorPontos();

    // Movimento do jogador
    jogo.x += (jogo.pista - jogo.x) * Math.min(1, dt * 14);
    if (jogo.altura > 0 || jogo.vy > 0) {
      jogo.altura += jogo.vy * dt;
      jogo.vy -= GRAVIDADE * dt;
      if (jogo.altura <= 0) {
        jogo.altura = 0;
        jogo.vy = 0;
      }
    }
    jogo.invulneravel = Math.max(0, jogo.invulneravel - dt);
    jogo.tremor = Math.max(0, jogo.tremor - dt);
    for (const id of Object.keys(jogo.poderes)) jogo.poderes[id] = Math.max(0, jogo.poderes[id] - dt);
    if (jogo.combo && jogo.tempo - jogo.ultimoOrbe > 4) jogo.combo = 0;

    // Objetos vêm na direção do jogador
    for (const o of jogo.objetos) o.z -= vel * dt;
    const avancoMundo = jogo.distancia * 2;
    while (jogo.proximaLinha <= avancoMundo + Z_MAX) {
      gerarLinha(jogo.proximaLinha - avancoMundo);
      jogo.proximaLinha += aleatorio(11, 17);
    }

    for (const o of jogo.objetos) {
      if (o.usado || o.z > 0.9 || o.z < -0.9) continue;
      const mesmaPista = Math.abs(jogo.x - o.pista) < 0.45;
      if (o.tipo === 'orbe') {
        const alcancou = o.h ? jogo.altura > 0.7 : jogo.altura < 1.8;
        if ((mesmaPista && alcancou) || jogo.poderes.ima > 0) {
          o.usado = true;
          coletar(o);
        }
      } else if (o.tipo === 'poder') {
        if (mesmaPista) {
          o.usado = true;
          coletar(o);
        }
      } else if (mesmaPista && (o.tipo === 'muro' || jogo.altura < 0.55)) {
        o.usado = true;
        bater(o);
      }
    }
    // O ímã puxa orbes de qualquer pista quando chegam perto
    if (jogo.poderes.ima > 0) {
      for (const o of jogo.objetos) if (o.tipo === 'orbe' && !o.usado && o.z < 8) o.pista += (jogo.x - o.pista) * Math.min(1, dt * 6);
    }
    jogo.objetos = jogo.objetos.filter((o) => o.z > -3 && !(o.usado && o.tipo !== 'muro' && o.tipo !== 'barreira'));

    relogioHud -= dt;
    if (relogioHud <= 0) {
      relogioHud = 0.15;
      atualizarHud();
    }
  }

  /* ---------- Desenho ---------- */

  function linhaProjetada(x, z0, z1) {
    const a = projetar(x, z0);
    const b = projetar(x, z1);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
  }

  function desenharCenario() {
    const { l, a } = tela;
    g.drawImage(fundo, 0, 0, l, fundo.height / tela.dpr);

    const chao = g.createLinearGradient(0, geo.horizonte, 0, a);
    chao.addColorStop(0, '#2a0058');
    chao.addColorStop(1, '#07000f');
    g.fillStyle = chao;
    g.fillRect(0, geo.horizonte, l, a - geo.horizonte);

    // Pista
    const pe = projetar(-1.6, -2);
    const pd = projetar(1.6, -2);
    const fe = projetar(-1.6, Z_MAX);
    const fd = projetar(1.6, Z_MAX);
    g.fillStyle = 'rgba(12,0,30,0.85)';
    g.beginPath();
    g.moveTo(pe.x, pe.y);
    g.lineTo(fe.x, fe.y);
    g.lineTo(fd.x, fd.y);
    g.lineTo(pd.x, pd.y);
    g.closePath();
    g.fill();

    // Grade do chão (linhas horizontais andando)
    g.save();
    g.strokeStyle = 'rgba(255,59,220,0.55)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let z = 6 - jogo.deslocamentoGrade; z < Z_MAX; z += 6) {
      const p = projetar(0, z);
      g.moveTo(0, p.y);
      g.lineTo(l, p.y);
    }
    for (let k = 2; k <= 12; k++) {
      linhaProjetada(-k * 1.1, -2, Z_MAX);
      linhaProjetada(k * 1.1, -2, Z_MAX);
    }
    g.stroke();

    // Bordas e divisórias da pista em neon
    g.shadowColor = '#00f0ff';
    g.shadowBlur = 12;
    g.strokeStyle = '#7ff8ff';
    g.lineWidth = 3;
    g.beginPath();
    linhaProjetada(-1.6, -2, Z_MAX);
    linhaProjetada(1.6, -2, Z_MAX);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(127,248,255,0.7)';
    g.beginPath();
    for (const x of [-0.5, 0.5]) {
      for (let z = -jogo.deslocamentoGrade; z < Z_MAX; z += 6) linhaProjetada(x, Math.max(-2, z), z + 3);
    }
    g.stroke();
    g.restore();
  }

  function desenharObjeto(o) {
    if (o.z > Z_MAX || o.z < -2) return;
    const nevoa = clamp(1 - o.z / Z_MAX, 0, 1) ** 0.6;
    const p = projetar(o.pista, o.z);
    const largura = geo.larguraPista * 0.8 * p.s;
    g.save();
    g.globalAlpha = nevoa;
    if (o.tipo === 'muro' || o.tipo === 'barreira') {
      const altura = (o.tipo === 'muro' ? 2.2 : 0.65) * geo.unidade * p.s;
      const cor = o.tipo === 'muro' ? '#ff2bd6' : '#ffd60a';
      const grad = g.createLinearGradient(0, p.y - altura, 0, p.y);
      grad.addColorStop(0, o.tipo === 'muro' ? 'rgba(255,43,214,0.95)' : 'rgba(255,214,10,0.95)');
      grad.addColorStop(1, o.tipo === 'muro' ? 'rgba(120,20,200,0.9)' : 'rgba(255,122,24,0.9)');
      g.fillStyle = grad;
      g.shadowColor = cor;
      g.shadowBlur = 16 * p.s;
      g.fillRect(p.x - largura / 2, p.y - altura, largura, altura);
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = Math.max(1, 2.5 * p.s);
      g.strokeRect(p.x - largura / 2, p.y - altura, largura, altura);
      if (o.tipo === 'barreira') {
        g.strokeStyle = 'rgba(40,0,60,0.6)';
        g.beginPath();
        for (let i = 1; i < 5; i++) {
          const x = p.x - largura / 2 + (largura * i) / 5;
          g.moveTo(x, p.y);
          g.lineTo(x - largura * 0.12, p.y - altura);
        }
        g.stroke();
      }
    } else if (o.tipo === 'orbe') {
      if (o.usado) return g.restore();
      const q = projetar(o.pista, o.z, (o.h ?? 0.5) + Math.sin(jogo.tempo * 5 + o.z) * 0.08);
      const r = geo.larguraPista * 0.16 * q.s;
      g.shadowColor = '#22e4ff';
      g.shadowBlur = 18 * q.s;
      g.fillStyle = '#22e4ff';
      g.beginPath();
      g.arc(q.x, q.y, r, 0, TAU);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(q.x - r * 0.25, q.y - r * 0.25, r * 0.4, 0, TAU);
      g.fill();
    } else if (o.tipo === 'poder') {
      if (o.usado) return g.restore();
      const poder = PODERES[o.poder];
      const q = projetar(o.pista, o.z, 0.8 + Math.sin(jogo.tempo * 4) * 0.1);
      const r = geo.larguraPista * 0.28 * q.s;
      g.translate(q.x, q.y);
      g.rotate(Math.sin(jogo.tempo * 3) * 0.3);
      g.shadowColor = poder.cor;
      g.shadowBlur = 24 * q.s;
      g.fillStyle = poder.cor;
      g.beginPath();
      g.moveTo(0, -r);
      g.lineTo(r, 0);
      g.lineTo(0, r);
      g.lineTo(-r, 0);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#1a0640';
      g.font = `${Math.round(r * 0.9)}px Bungee, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(poder.letra, 0, r * 0.06);
    }
    g.restore();
  }

  function desenharJogador() {
    const chao = projetar(jogo.x, 0);
    const p = projetar(jogo.x, 0, jogo.altura);
    const largura = geo.larguraPista * 0.55;
    const altura = geo.larguraPista * 0.42;

    g.save();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(chao.x, chao.y + 4, largura * 0.5 / (1 + jogo.altura * 0.3), 8, 0, 0, TAU);
    g.fill();

    g.globalAlpha = jogo.invulneravel > 0 ? 0.5 : 1;
    g.translate(p.x, p.y - 6);
    g.rotate((jogo.pista - jogo.x) * 0.35);

    // Chama do motor
    const chama = 0.8 + Math.sin(jogo.tempo * 30) * 0.1 + (jogo.poderes.turbo > 0 ? 0.6 : 0);
    g.fillStyle = jogo.poderes.turbo > 0 ? '#ffd60a' : '#ff2bd6';
    g.shadowColor = g.fillStyle;
    g.shadowBlur = 20;
    for (const lado of [-1, 1]) {
      g.beginPath();
      g.moveTo(lado * largura * 0.22 - 7, 0);
      g.lineTo(lado * largura * 0.22 + 7, 0);
      g.lineTo(lado * largura * 0.22, altura * 0.55 * chama);
      g.closePath();
      g.fill();
    }

    const casco = g.createLinearGradient(0, -altura, 0, 0);
    casco.addColorStop(0, '#ffffff');
    casco.addColorStop(0.35, '#22e4ff');
    casco.addColorStop(1, '#7b2bff');
    g.fillStyle = casco;
    g.shadowColor = '#22e4ff';
    g.shadowBlur = 22;
    g.beginPath();
    g.moveTo(0, -altura);
    g.lineTo(largura / 2, 0);
    g.lineTo(largura * 0.15, -altura * 0.15);
    g.lineTo(-largura * 0.15, -altura * 0.15);
    g.lineTo(-largura / 2, 0);
    g.closePath();
    g.fill();

    if (jogo.escudo) {
      g.shadowBlur = 16;
      g.strokeStyle = 'rgba(34,228,255,0.85)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, -altura * 0.45, largura * 0.62 + Math.sin(jogo.tempo * 6) * 3, 0, TAU);
      g.stroke();
    }
    g.restore();

    // Rastro de faíscas
    if (jogo.fase === 'jogando' && Math.random() < 0.6 && !movimentoReduzido()) {
      particulas.push({ x: p.x + aleatorio(-6, 6), y: p.y, vx: aleatorio(-20, 20), vy: aleatorio(60, 140), vida: 0.35, cor: jogo.poderes.turbo > 0 ? '#ffd60a' : '#ff8ef0', tam: aleatorio(1.5, 3) });
    }
  }

  function desenhar(dt) {
    const { l, a } = tela;
    g.setTransform(tela.dpr, 0, 0, tela.dpr, 0, 0);
    g.save();
    if (jogo.tremor > 0) g.translate(aleatorio(-6, 6) * jogo.tremor * 2, aleatorio(-6, 6) * jogo.tremor * 2);
    desenharCenario();

    const ordenados = [...jogo.objetos].sort((x, y) => y.z - x.z);
    for (const o of ordenados) if (o.z > 0.5) desenharObjeto(o);
    desenharJogador();
    for (const o of ordenados) if (o.z <= 0.5) desenharObjeto(o);

    // Linhas de velocidade no turbo
    if (jogo.poderes.turbo > 0 && !movimentoReduzido()) {
      g.strokeStyle = 'rgba(255,240,180,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < 14; i++) {
        const ang = aleatorio(0, TAU);
        const r0 = aleatorio(0.25, 0.5) * l;
        g.moveTo(l / 2 + Math.cos(ang) * r0, geo.horizonte + Math.sin(ang) * r0 * 0.6);
        g.lineTo(l / 2 + Math.cos(ang) * (r0 + 120), geo.horizonte + Math.sin(ang) * (r0 + 120) * 0.6);
      }
      g.stroke();
    }

    g.globalCompositeOperation = 'lighter';
    for (const p of particulas) {
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= dt;
      g.globalAlpha = clamp(p.vida * 2, 0, 1);
      g.fillStyle = p.cor;
      g.fillRect(p.x - p.tam / 2, p.y - p.tam / 2, p.tam, p.tam);
    }
    g.globalCompositeOperation = 'source-over';
    for (let i = particulas.length - 1; i >= 0; i--) if (particulas[i].vida <= 0) particulas.splice(i, 1);

    g.textAlign = 'center';
    g.font = '24px Bungee, sans-serif';
    for (const t of textos) {
      t.y -= 50 * dt;
      t.vida -= dt * 0.9;
      g.globalAlpha = clamp(t.vida * 1.5, 0, 1);
      g.fillStyle = t.cor;
      g.shadowColor = t.cor;
      g.shadowBlur = 14;
      g.fillText(t.texto, t.x, t.y);
    }
    g.shadowBlur = 0;
    for (let i = textos.length - 1; i >= 0; i--) if (textos[i].vida <= 0) textos.splice(i, 1);
    g.restore();

    if (jogo.fase === 'pausado') {
      g.fillStyle = 'rgba(10,0,30,0.5)';
      g.fillRect(0, 0, l, a);
      g.fillStyle = '#ffffff';
      g.font = `${Math.round(Math.min(l, a) * 0.08)}px Bungee, sans-serif`;
      g.textAlign = 'center';
      g.fillText('PAUSA', l / 2, a / 2);
    }
  }

  const pararLoop = aoQuadro((dt) => {
    if (!geo) return;
    if (jogo.fase === 'jogando') atualizar(dt);
    else if (jogo.fase === 'inicio' || jogo.fase === 'fim') {
      // Tela de fundo animada enquanto o painel está aberto
      jogo.tempo += dt;
      jogo.deslocamentoGrade = (jogo.deslocamentoGrade + VEL_INICIAL * 0.5 * dt) % 6;
    }
    desenhar(jogo.fase === 'pausado' ? 0 : dt);
  });

  /* ---------- Entrada ---------- */

  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button, a')) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'arrowleft' || tecla === 'a') trocarPista(-1);
    else if (tecla === 'arrowright' || tecla === 'd') trocarPista(1);
    else if (tecla === 'arrowup' || tecla === 'w' || tecla === ' ') pular();
    else if (tecla === 'p') alternarPausa();
    else return;
    e.preventDefault();
  });

  let toque = null;
  palco.addEventListener('pointerdown', (e) => {
    toque = { x: e.clientX, y: e.clientY, t: performance.now() };
    palco.setPointerCapture?.(e.pointerId);
  });
  palco.addEventListener('pointerup', (e) => {
    if (!toque) return;
    const dx = e.clientX - toque.x;
    const dy = e.clientY - toque.y;
    toque = null;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) trocarPista(Math.sign(dx));
    else if (dy < -35) pular();
    else {
      const caixa = palco.getBoundingClientRect();
      const x = (e.clientX - caixa.left) / caixa.width;
      if (x < 0.33) trocarPista(-1);
      else if (x > 0.67) trocarPista(1);
      else pular();
    }
  });

  mostrarInicio();
  atualizarMusica();

  return {
    destruir() {
      pararLoop();
      sequenciador.parar();
      canvasResponsivo.destruir();
    },
  };
}
