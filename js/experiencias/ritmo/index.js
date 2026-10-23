/**
 * Ritmo: notas caem em 4 pistas no compasso de uma música gerada pelo próprio jogo.
 * A bateria, o baixo e os acordes tocam sozinhos; cada acerto toca a nota da melodia,
 * então quem joga "toca" a música. Tudo sincronizado pelo relógio do AudioContext.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231621';
import { criarPainelJogo } from '../../core/painel-jogo.js?v=202610231621';
import { criarSequenciador } from '../../core/sequenciador.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { aleatorio, aleatorioInt, carregarEstilo, clamp, movimentoReduzido, perfilLeve } from '../../core/util.js?v=202610231621';

const CORES = ['#ff2e97', '#ffd60a', '#22e4ff', '#a3ff12'];
const ROTULOS = ['D', 'F', 'J', 'K'];
const TECLAS = { d: 0, f: 1, j: 2, k: 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 };
const JANELA_PERFEITO = 0.06;
const JANELA_BOM = 0.13;
const ANTECEDENCIA = 1.6;
const TAU = Math.PI * 2;

const MUSICAS = [
  {
    id: 'brisa', nome: 'Brisa', nivel: 'Fácil', bpm: 90, densidade: 0.34, contratempo: 0, timbre: 'sino',
    acordes: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    escala: [64, 67, 69, 72, 74, 76, 79],
  },
  {
    id: 'pulso', nome: 'Pulso', nivel: 'Médio', bpm: 110, densidade: 0.46, contratempo: 0.3, timbre: 'pluck',
    acordes: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],
    escala: [62, 65, 67, 69, 72, 74, 77],
  },
  {
    id: 'turbo', nome: 'Turbo', nivel: 'Difícil', bpm: 132, densidade: 0.56, contratempo: 0.45, timbre: 'synth',
    acordes: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]],
    escala: [69, 72, 74, 76, 79, 81, 84],
  },
];

/** Cria as notas da música: melodia em passeio aleatório pela escala; notas agudas à direita. */
function gerarPartitura(musica) {
  const colcheia = 60 / musica.bpm / 2;
  const totalColcheias = musica.compassos * 8;
  const notas = [];
  let indice = 3;
  for (let s = 8; s < totalColcheias - 4; s++) {
    const noTempo = s % 2 === 0;
    const forte = s % 8 === 0;
    const chance = noTempo ? musica.densidade + (forte ? 0.35 : 0) : musica.contratempo * musica.densidade;
    if (Math.random() > chance) continue;
    indice = clamp(indice + aleatorioInt(-2, 2), 0, musica.escala.length - 1);
    const pista = Math.round((indice / (musica.escala.length - 1)) * 3);
    notas.push({ tempo: s * colcheia, pista, midi: musica.escala[indice], estado: 'pendente' });
    if (musica.contratempo > 0.4 && forte && Math.random() < 0.3) {
      const outra = (pista + 2) % 4;
      notas.push({ tempo: s * colcheia, pista: outra, midi: musica.escala[clamp(indice - 2, 0, musica.escala.length - 1)], estado: 'pendente' });
    }
  }
  return notas;
}

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/ritmo.css?v=202610231621', import.meta.url));

  raiz.classList.add('ritmo');
  raiz.innerHTML = `
    <div class="ritmo__palco" tabindex="0" role="application"
      aria-label="Ritmo. Aperte D, F, J e K (ou as setas) quando as notas chegarem à linha. No toque, toque na pista.">
      <canvas class="ritmo__canvas"></canvas>
    </div>
    <div class="hud-jogo" data-hud hidden>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-pontos>0</span><span class="hud-jogo__rotulo">pontos</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-combo>0</span><span class="hud-jogo__rotulo">combo</span></div>
      <div class="hud-jogo__item"><span class="hud-jogo__valor" data-precisao>100%</span><span class="hud-jogo__rotulo">precisão</span></div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.ritmo__palco');
  const canvas = $('.ritmo__canvas');
  const g = canvas.getContext('2d');
  const painel = criarPainelJogo(raiz);
  const config = { musica: 'brisa', ...ler('ritmo-config', {}) };

  let tela = { l: 1, a: 1, dpr: 1 };
  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: perfilLeve ? 1.5 : 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
    },
  });

  const geometria = () => {
    const largura = Math.min(tela.l - 24, 560);
    const x0 = (tela.l - largura) / 2;
    return { x0, largura, pista: largura / 4, topo: 150, linha: tela.a - 120 };
  };

  /* ---------- Estado ---------- */

  const partida = {
    fase: 'inicio',
    musica: null,
    notas: [],
    inicio: 0,
    pontos: 0,
    combo: 0,
    melhorCombo: 0,
    perfeitos: 0,
    bons: 0,
    erros: 0,
  };
  const pressionado = [0, 0, 0, 0];
  const particulas = [];
  const julgamentos = [];
  const aneis = [];

  const tempoMusica = () => audio.agora - audio.latencia - partida.inicio;

  const sequenciador = criarSequenciador(audio, {
    bpm: 100,
    aoPasso(passo, quando) {
      const musica = partida.musica;
      if (!musica) return;
      const compasso = Math.floor(passo / 16);
      if (compasso >= musica.compassos) return;
      const p = passo % 16;
      if (p === 0 || p === 8 || (musica.contratempo > 0 && p === 10)) audio.batida('bumbo', quando);
      if (p === 4 || p === 12) audio.batida(compasso === 0 ? 'palma' : 'caixa', quando);
      if (p % 2 === 0 || (musica.bpm > 120 && compasso > 0)) audio.batida('chimbal', quando);
      if (compasso === 0) return; // compasso de entrada: só bateria
      const acorde = musica.acordes[(compasso - 1) % musica.acordes.length];
      if (p === 0) {
        const duracaoCompasso = (60 / musica.bpm) * 4;
        for (const nota of acorde) audio.nota(nota, { quando, duracao: duracaoCompasso * 0.95, timbre: 'pad', volume: 0.045 });
      }
      if (p % 4 === 0) audio.nota(acorde[0] - 12, { quando, duracao: 0.3, timbre: 'baixo', volume: 0.12 });
    },
  });

  /* ---------- HUD e painéis ---------- */

  const precisao = () => {
    const julgadas = partida.perfeitos + partida.bons + partida.erros;
    return julgadas ? Math.round(((partida.perfeitos + partida.bons * 0.6) / julgadas) * 100) : 100;
  };

  function atualizarHud() {
    $('[data-pontos]').textContent = partida.pontos.toLocaleString('pt-BR');
    $('[data-combo]').textContent = partida.combo;
    $('[data-precisao]').textContent = `${precisao()}%`;
  }

  function mostrarInicio() {
    const opcoes = MUSICAS.map((m) => {
      const recorde = progresso.recorde('ritmo', `pontos-${m.id}`);
      return `<button type="button" class="chip ritmo__musica" data-musica="${m.id}" aria-pressed="${m.id === config.musica}">
        ${icone('musica')}<span><b>${m.nome}</b> ${m.nivel} · ${m.bpm} bpm${recorde ? ` · ${icone('trofeu')}${recorde.toLocaleString('pt-BR')}` : ''}</span></button>`;
    }).join('');
    painel.inicio({
      titulo: 'Ritmo',
      texto: 'Toque as notas quando elas encostarem na linha. Cada acerto toca a melodia!',
      regras: [
        ['raio', 'Teclas D F J K ou as setas'],
        ['alvo', 'No celular: toque na pista da nota'],
        ['estrela', 'Errar não para a música. Só curta!'],
      ],
      extra: `<div class="painel-jogo__opcoes ritmo__musicas" role="group" aria-label="Escolha a música">${opcoes}</div>`,
      rotuloBotao: 'Tocar',
    }, iniciar);
    painel.elemento.querySelectorAll('[data-musica]').forEach((botao) => botao.addEventListener('click', () => {
      config.musica = botao.dataset.musica;
      gravar('ritmo-config', config);
      painel.elemento.querySelectorAll('[data-musica]').forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));
      const musica = MUSICAS.find((m) => m.id === config.musica);
      audio.nota(musica.escala[3], { timbre: musica.timbre, volume: 0.1 });
    }));
  }

  function iniciar() {
    const base = MUSICAS.find((m) => m.id === config.musica) ?? MUSICAS[0];
    const musica = { ...base, compassos: Math.round((56 * base.bpm) / 240) + 1 };
    Object.assign(partida, {
      fase: 'jogando', musica, notas: gerarPartitura(musica), pontos: 0, combo: 0, melhorCombo: 0, perfeitos: 0, bons: 0, erros: 0,
    });
    partida.inicio = audio.agora + 0.4;
    sequenciador.definirBpm(musica.bpm);
    sequenciador.iniciar(partida.inicio);
    painel.esconder();
    $('[data-hud]').hidden = false;
    palco.focus({ preventScroll: true });
    atualizarHud();
  }

  function encerrar() {
    partida.fase = 'fim';
    sequenciador.parar();
    $('[data-hud]').hidden = true;
    const p = precisao();
    const nota = p >= 95 ? 'S' : p >= 85 ? 'A' : p >= 70 ? 'B' : p >= 50 ? 'C' : 'D';
    const frase = { S: 'Lendário!', A: 'Arrasou!', B: 'Muito bom!', C: 'Bom ritmo!', D: 'Valeu a jam!' }[nota];
    const id = partida.musica.id;
    const novo = progresso.definirRecorde('ritmo', `pontos-${id}`, partida.pontos);
    progresso.definirRecorde('ritmo', 'combo', partida.melhorCombo);
    progresso.definirRecorde('ritmo', 'precisao', p);
    progresso.registrar('ritmo:musica', 1, id);
    if (nota === 'S') progresso.registrar('ritmo:nota-s');
    progresso.ganharXp(Math.round(partida.pontos / 1500) + 5);
    audio.tocar(novo && partida.pontos > 0 ? 'conquista' : 'fim');
    painel.resumo({
      selo: `${icone(novo && partida.pontos > 0 ? 'trofeu' : 'estrela')} ${novo && partida.pontos > 0 ? 'Novo recorde!' : frase}`,
      titulo: `Nota ${nota} <small>${partida.pontos.toLocaleString('pt-BR')} pontos</small>`,
      estatisticas: [
        ['Precisão', `${p}%`],
        ['Maior combo', partida.melhorCombo],
        ['Perfeitos', partida.perfeitos],
        ['Bons / erros', `${partida.bons} / ${partida.erros}`],
      ],
      rotuloBotao: 'Tocar de novo',
    }, () => mostrarInicio());
  }

  /* ---------- Julgamento ---------- */

  function julgar(pista) {
    pressionado[pista] = 1;
    if (partida.fase !== 'jogando') return;
    const agora = tempoMusica();
    let melhor = null;
    for (const nota of partida.notas) {
      if (nota.pista !== pista || nota.estado !== 'pendente') continue;
      const distancia = Math.abs(nota.tempo - agora);
      if (distancia <= JANELA_BOM && (!melhor || distancia < Math.abs(melhor.tempo - agora))) melhor = nota;
      if (nota.tempo - agora > JANELA_BOM) break;
    }
    if (!melhor) return;

    const perfeito = Math.abs(melhor.tempo - agora) <= JANELA_PERFEITO;
    melhor.estado = 'acertada';
    partida.combo++;
    partida.melhorCombo = Math.max(partida.melhorCombo, partida.combo);
    if (perfeito) partida.perfeitos++;
    else partida.bons++;
    partida.pontos += Math.round((perfeito ? 300 : 150) * (1 + Math.min(partida.combo, 50) / 50));
    audio.nota(melhor.midi, { timbre: partida.musica.timbre, volume: 0.13, pan: (pista - 1.5) * 0.3 });
    if (partida.combo > 0 && partida.combo % 25 === 0) audio.tocar('combo', { n: partida.combo / 25 });
    if (perfeito) progresso.registrar('ritmo:perfeito');

    const { x0, pista: largura, linha } = geometria();
    const x = x0 + largura * (pista + 0.5);
    efeito(x, linha, CORES[pista], perfeito);
    julgamentos.push({ texto: perfeito ? 'PERFEITO!' : 'BOM!', cor: perfeito ? '#ffffff' : CORES[pista], x, vida: 1 });
    atualizarHud();
  }

  function efeito(x, y, cor, forte) {
    aneis.push({ x, y, cor, vida: 1 });
    const quantidade = (forte ? 18 : 10) * (movimentoReduzido() ? 0.4 : 1);
    for (let i = 0; i < quantidade; i++) {
      const ang = aleatorio(Math.PI, TAU);
      const vel = aleatorio(120, 360);
      particulas.push({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, vida: aleatorio(0.35, 0.7), cor, tam: aleatorio(2, 4) });
    }
  }

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    const agora = partida.fase === 'jogando' ? tempoMusica() : 0;

    if (partida.fase === 'jogando') {
      let mudou = false;
      for (const nota of partida.notas) {
        if (nota.estado === 'pendente' && agora - nota.tempo > JANELA_BOM) {
          nota.estado = 'perdida';
          partida.erros++;
          partida.combo = 0;
          mudou = true;
          const { x0, pista: largura } = geometria();
          julgamentos.push({ texto: 'ops', cor: '#ff9b5e', x: x0 + largura * (nota.pista + 0.5), vida: 0.7, pequeno: true });
        }
      }
      if (mudou) atualizarHud();
      const ultima = partida.notas.at(-1)?.tempo ?? 0;
      if (agora > ultima + 2.5) encerrar();
    }

    for (let i = 0; i < 4; i++) pressionado[i] = Math.max(0, pressionado[i] - dt * 5);
    desenhar(dt, agora);
  });

  function desenhar(dt, agora) {
    const { l, a, dpr } = tela;
    const { x0, largura, pista: lp, topo, linha } = geometria();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const fundo = g.createLinearGradient(0, 0, l, a);
    fundo.addColorStop(0, '#1b0a5e');
    fundo.addColorStop(0.55, '#3a0a6a');
    fundo.addColorStop(1, '#063a52');
    g.fillStyle = fundo;
    g.fillRect(0, 0, l, a);
    // Brilhos coloridos atrás das pistas
    for (let i = 0; i < 4; i++) {
      const cx = x0 + lp * (i + 0.5);
      const brilhoPista = g.createRadialGradient(cx, linha, 0, cx, linha, lp * 2.2);
      brilhoPista.addColorStop(0, `${CORES[i]}${pressionado[i] > 0.1 ? '55' : '2a'}`);
      brilhoPista.addColorStop(1, `${CORES[i]}00`);
      g.fillStyle = brilhoPista;
      g.fillRect(cx - lp * 2.2, linha - lp * 2.2, lp * 4.4, lp * 4.4);
    }

    // Anéis que pulsam com a batida (suaves, sem piscar)
    const batida = partida.musica ? 60 / partida.musica.bpm : 0.6;
    const fase = partida.fase === 'jogando' && agora > 0 ? (agora / batida) % 1 : (performance.now() / 1000 / 0.6) % 1;
    g.save();
    g.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      const f = (fase + k / 3) % 1;
      g.strokeStyle = `rgba(139,92,255,${(1 - f) * 0.22})`;
      g.beginPath();
      g.arc(l / 2, linha, 60 + f * Math.max(l, a) * 0.6, 0, TAU);
      g.stroke();
    }
    g.restore();

    // Pistas
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * lp;
      const coluna = g.createLinearGradient(0, topo, 0, linha);
      coluna.addColorStop(0, 'rgba(10,4,40,0.35)');
      coluna.addColorStop(1, `${CORES[i]}${Math.round(0x22 + pressionado[i] * 0x40).toString(16)}`);
      g.fillStyle = coluna;
      g.fillRect(x + 2, topo, lp - 4, linha - topo + 40);
      if (pressionado[i] > 0) {
        const feixe = g.createLinearGradient(0, linha - 220, 0, linha);
        feixe.addColorStop(0, 'rgba(0,0,0,0)');
        feixe.addColorStop(1, CORES[i]);
        g.globalAlpha = pressionado[i] * 0.35;
        g.fillStyle = feixe;
        g.fillRect(x + 4, linha - 220, lp - 8, 220);
        g.globalAlpha = 1;
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 4; i++) {
      g.moveTo(x0 + i * lp, topo);
      g.lineTo(x0 + i * lp, linha + 40);
    }
    g.stroke();

    // Barra de progresso da música
    if (partida.fase === 'jogando') {
      const fim = partida.notas.at(-1)?.tempo ?? 1;
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(x0, topo - 14, largura, 4);
      g.fillStyle = '#ffffff';
      g.fillRect(x0, topo - 14, largura * clamp(agora / fim, 0, 1), 4);
    }

    // Linha de acerto luminosa
    const faixa = g.createLinearGradient(x0, 0, x0 + largura, 0);
    CORES.forEach((cor, i) => faixa.addColorStop(i / 3, cor));
    g.save();
    g.shadowColor = '#ffffff';
    g.shadowBlur = 14;
    g.fillStyle = faixa;
    g.fillRect(x0, linha - 1.5, largura, 3);
    g.restore();

    // Receptores na linha de acerto
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * lp + 6;
      g.save();
      g.shadowColor = CORES[i];
      g.shadowBlur = 10 + pressionado[i] * 20;
      g.strokeStyle = CORES[i];
      g.lineWidth = 3;
      g.fillStyle = `rgba(255,255,255,${0.05 + pressionado[i] * 0.5})`;
      g.beginPath();
      g.roundRect ? g.roundRect(x, linha - 12, lp - 12, 24, 12) : g.rect(x, linha - 12, lp - 12, 24);
      g.fill();
      g.stroke();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.font = '16px Bungee, sans-serif';
      g.textAlign = 'center';
      g.fillText(ROTULOS[i], x0 + (i + 0.5) * lp, linha + 46);
    }

    // Notas caindo
    if (partida.fase === 'jogando') {
      const altura = linha - topo;
      for (const nota of partida.notas) {
        const falta = nota.tempo - agora;
        if (falta > ANTECEDENCIA) break;
        if (nota.estado === 'acertada' || falta < -0.4) continue;
        const y = linha - (falta / ANTECEDENCIA) * altura;
        const x = x0 + nota.pista * lp + 8;
        const cor = CORES[nota.pista];
        g.save();
        g.globalAlpha = nota.estado === 'perdida' ? 0.3 : clamp(1.2 - falta / ANTECEDENCIA, 0.3, 1);
        g.shadowColor = cor;
        g.shadowBlur = 16;
        const gema = g.createLinearGradient(0, y - 13, 0, y + 13);
        gema.addColorStop(0, '#ffffff');
        gema.addColorStop(0.45, cor);
        gema.addColorStop(1, cor);
        g.fillStyle = gema;
        g.beginPath();
        g.roundRect ? g.roundRect(x, y - 13, lp - 16, 26, 13) : g.rect(x, y - 13, lp - 16, 26);
        g.fill();
        g.restore();
      }

      // Contagem no compasso de entrada
      if (agora < 60 / partida.musica.bpm * 4) {
        const restante = Math.max(1, 4 - Math.floor(agora / (60 / partida.musica.bpm)));
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.font = `${Math.round(Math.min(l, a) * 0.14)}px Bungee, sans-serif`;
        g.textAlign = 'center';
        g.fillText(agora < 0 ? '4' : String(restante), l / 2, (topo + linha) / 2);
      }

      // Combo grande ao fundo
      if (partida.combo >= 5) {
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.font = `${Math.round(Math.min(l, a) * 0.16)}px Bungee, sans-serif`;
        g.textAlign = 'center';
        g.fillText(String(partida.combo), l / 2, topo + (linha - topo) * 0.42);
      }
    }

    // Efeitos
    g.globalCompositeOperation = 'lighter';
    for (const p of particulas) {
      p.vy += 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= dt;
      g.globalAlpha = clamp(p.vida * 2, 0, 1);
      g.fillStyle = p.cor;
      g.fillRect(p.x, p.y, p.tam, p.tam);
    }
    for (const anel of aneis) {
      anel.vida -= dt * 3;
      g.globalAlpha = Math.max(0, anel.vida);
      g.strokeStyle = anel.cor;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(anel.x, anel.y, (1 - anel.vida) * lp * 0.7 + 10, 0, TAU);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.textAlign = 'center';
    for (const j of julgamentos) {
      j.vida -= dt * 1.6;
      g.globalAlpha = clamp(j.vida * 1.5, 0, 1);
      g.fillStyle = j.cor;
      g.font = j.pequeno ? '14px Bungee, sans-serif' : '22px Bungee, sans-serif';
      g.fillText(j.texto, j.x, linha - 40 - (1 - j.vida) * 30);
    }
    g.globalAlpha = 1;
    for (let i = particulas.length - 1; i >= 0; i--) if (particulas[i].vida <= 0) particulas.splice(i, 1);
    for (let i = aneis.length - 1; i >= 0; i--) if (aneis[i].vida <= 0) aneis.splice(i, 1);
    for (let i = julgamentos.length - 1; i >= 0; i--) if (julgamentos[i].vida <= 0) julgamentos.splice(i, 1);
  }

  /* ---------- Entrada ---------- */

  raiz.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button, a')) return;
    const pista = TECLAS[e.key.toLowerCase()];
    if (pista === undefined) return;
    e.preventDefault();
    julgar(pista);
  });

  palco.addEventListener('pointerdown', (e) => {
    const caixa = palco.getBoundingClientRect();
    const { x0, pista: lp } = geometria();
    const pista = Math.floor((e.clientX - caixa.left - x0) / lp);
    if (pista >= 0 && pista < 4) julgar(pista);
  });

  mostrarInicio();

  return {
    destruir() {
      pararLoop();
      sequenciador.parar();
      canvasResponsivo.destruir();
    },
  };
}
