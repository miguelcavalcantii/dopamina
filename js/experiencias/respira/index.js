/**
 * Respira: respiração guiada por uma esfera de luz que cresce (inspire), para (segure)
 * e encolhe (solte). Padrões Caixa, 4-7-8 e Coerente; sessões de 1, 3, 5 min ou livre.
 * Som de "respiração" em ruído suave, sino a cada fase e música ambiente opcional.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231621';
import { criarPainelJogo } from '../../core/painel-jogo.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { aleatorio, carregarEstilo, clamp, formatarTempo, movimentoReduzido } from '../../core/util.js?v=202610231621';

const TAU = Math.PI * 2;

const PADROES = [
  { id: 'caixa', nome: 'Caixa', descricao: '4-4-4-4 · foco e calma', fases: [['inspire', 4], ['segure', 4], ['solte', 4], ['segure', 4]] },
  { id: '478', nome: '4-7-8', descricao: 'Desacelera e ajuda a relaxar', fases: [['inspire', 4], ['segure', 7], ['solte', 8]] },
  { id: 'coerente', nome: 'Coerente', descricao: '5-5 · ritmo tranquilo', fases: [['inspire', 5], ['solte', 5]] },
];
const DURACOES = [[1, '1 min'], [3, '3 min'], [5, '5 min'], [0, 'Livre']];
const ROTULOS = { inspire: 'Inspire', segure: 'Segure', solte: 'Solte' };
const NOTAS = { inspire: 76, segure: 79, solte: 72 };

const suave = (t) => 0.5 - Math.cos(Math.PI * clamp(t, 0, 1)) / 2;

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/respira.css?v=202610231621', import.meta.url));

  const config = { padrao: 'caixa', duracao: 3, musica: true, ...ler('respira-config', {}) };
  const salvar = () => gravar('respira-config', config);

  raiz.classList.add('respira');
  raiz.innerHTML = `
    <canvas class="respira__canvas" aria-hidden="true"></canvas>
    <div class="respira__texto" data-texto hidden>
      <span class="respira__fase" data-fase aria-live="polite"></span>
      <span class="respira__contagem" data-contagem></span>
    </div>
    <p class="respira__tempo" data-tempo hidden></p>
    <div class="cantos-jogo" data-controles hidden>
      <button type="button" class="chip" data-musica aria-pressed="${config.musica}">${icone('musica')}<span>Música</span></button>
      <button type="button" class="chip" data-pausa>${icone('relogio')}<span>Pausar</span></button>
      <button type="button" class="chip" data-encerrar>${icone('check')}<span>Encerrar</span></button>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const canvas = $('.respira__canvas');
  const g = canvas.getContext('2d');
  const painel = criarPainelJogo(raiz);

  let tela = { l: 1, a: 1, dpr: 1 };
  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 1.5,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
    },
  });

  const sessao = {
    fase: 'inicio',
    padrao: PADROES[0],
    indiceFase: 0,
    tempoFase: 0,
    decorrido: 0,
    ciclos: 0,
    pausado: false,
    escala: 0,
    escalaInicio: 0,
  };
  let tempo = 0;
  let textura = null;
  let segundosAcumulados = 0;
  const orbitas = Array.from({ length: 46 }, () => ({ angulo: aleatorio(0, TAU), distancia: aleatorio(1.15, 1.9), velocidade: aleatorio(0.15, 0.45), tamanho: aleatorio(1.5, 3.5) }));

  /* ---------- Painéis ---------- */

  function mostrarInicio() {
    const minutos = progresso.contador('respira:segundos') / 60;
    painel.inicio({
      titulo: 'Respira',
      texto: 'Siga a luz: ela cresce quando você inspira e encolhe quando você solta o ar.',
      extra: `
        <div class="painel-jogo__opcoes respira__opcoes" role="group" aria-label="Padrão de respiração">
          ${PADROES.map((p) => `<button type="button" class="chip respira__opcao" data-padrao="${p.id}" aria-pressed="${p.id === config.padrao}"><b>${p.nome}</b><small>${p.descricao}</small></button>`).join('')}
        </div>
        <div class="painel-jogo__opcoes" role="group" aria-label="Duração">
          ${DURACOES.map(([valor, rotulo]) => `<button type="button" class="chip" data-duracao="${valor}" aria-pressed="${valor === config.duracao}">${rotulo}</button>`).join('')}
        </div>`,
      recorde: minutos >= 1 ? `${Math.floor(minutos)} min respirando no total` : '',
      rotuloBotao: 'Começar',
    }, iniciar);
    painel.elemento.addEventListener('click', escolherOpcao);
  }

  function escolherOpcao(e) {
    const botao = e.target.closest('[data-padrao], [data-duracao]');
    if (!botao) return;
    if (botao.dataset.padrao) config.padrao = botao.dataset.padrao;
    else config.duracao = Number(botao.dataset.duracao);
    salvar();
    painel.elemento.querySelectorAll('[data-padrao]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.padrao === config.padrao)));
    painel.elemento.querySelectorAll('[data-duracao]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.duracao) === config.duracao)));
  }

  function iniciar() {
    painel.elemento.removeEventListener('click', escolherOpcao);
    Object.assign(sessao, {
      fase: 'respirando',
      padrao: PADROES.find((p) => p.id === config.padrao) ?? PADROES[0],
      indiceFase: 0,
      tempoFase: 0,
      decorrido: 0,
      ciclos: 0,
      pausado: false,
      escalaInicio: sessao.escala,
    });
    painel.esconder();
    $('[data-texto]').hidden = false;
    $('[data-tempo]').hidden = false;
    $('[data-controles]').hidden = false;
    $('[data-encerrar]').focus({ preventScroll: true });
    if (config.musica) audio.iniciarAmbiente('aurora');
    textura ??= audio.iniciarTextura({ filtro: 'lowpass', freq: 500, q: 0.5, volumeMaximo: 0.1 });
    anunciarFase();
  }

  function encerrar() {
    sessao.fase = 'fim';
    $('[data-texto]').hidden = true;
    $('[data-tempo]').hidden = true;
    $('[data-controles]').hidden = true;
    audio.pararAmbiente();
    textura?.atualizar(0);
    progresso.registrar('respira:sessao');
    progresso.ganharXp(Math.round(sessao.decorrido / 20));
    audio.tocar('fase', { nota: 84 });
    painel.resumo({
      selo: `${icone('lua')} Muito bem`,
      titulo: `${sessao.ciclos} <small>${sessao.ciclos === 1 ? 'ciclo completo' : 'ciclos completos'}</small>`,
      estatisticas: [
        ['Tempo', formatarTempo(sessao.decorrido)],
        ['Padrão', sessao.padrao.nome],
        ['Total respirado', formatarTempo(progresso.contador('respira:segundos'))],
        ['Sessões', progresso.contador('respira:sessao')],
      ],
      rotuloBotao: 'Mais uma',
    }, () => mostrarInicio());
  }

  function anunciarFase() {
    const [tipo] = sessao.padrao.fases[sessao.indiceFase];
    $('[data-fase]').textContent = ROTULOS[tipo];
    raiz.dataset.fase = tipo;
    audio.tocar('fase', { nota: NOTAS[tipo] });
  }

  function alternarPausa() {
    sessao.pausado = !sessao.pausado;
    $('[data-pausa]').innerHTML = sessao.pausado ? `${icone('jogar')}<span>Continuar</span>` : `${icone('relogio')}<span>Pausar</span>`;
    $('[data-fase]').textContent = sessao.pausado ? 'Pausa' : ROTULOS[sessao.padrao.fases[sessao.indiceFase][0]];
  }

  $('[data-pausa]').addEventListener('click', alternarPausa);
  $('[data-encerrar]').addEventListener('click', encerrar);
  $('[data-musica]').addEventListener('click', (e) => {
    config.musica = !config.musica;
    salvar();
    e.currentTarget.setAttribute('aria-pressed', String(config.musica));
    if (config.musica && sessao.fase === 'respirando') audio.iniciarAmbiente('aurora');
    else audio.pararAmbiente();
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    tempo += dt;

    if (sessao.fase === 'respirando' && !sessao.pausado) {
      const [tipo, duracao] = sessao.padrao.fases[sessao.indiceFase];
      sessao.tempoFase += dt;
      sessao.decorrido += dt;
      const progressoFase = sessao.tempoFase / duracao;
      if (tipo === 'inspire') sessao.escala = sessao.escalaInicio + (1 - sessao.escalaInicio) * suave(progressoFase);
      else if (tipo === 'solte') sessao.escala = sessao.escalaInicio * (1 - suave(progressoFase));
      textura?.atualizar(tipo === 'segure' ? 0.08 : 0.25 + 0.6 * Math.sin(Math.PI * clamp(progressoFase, 0, 1)), tipo === 'inspire' ? 400 + 700 * progressoFase : 1100 - 700 * progressoFase);
      $('[data-contagem]').textContent = Math.max(1, Math.ceil(duracao - sessao.tempoFase));

      if (sessao.tempoFase >= duracao) {
        sessao.tempoFase = 0;
        sessao.escalaInicio = sessao.escala;
        sessao.indiceFase = (sessao.indiceFase + 1) % sessao.padrao.fases.length;
        if (sessao.indiceFase === 0) {
          sessao.ciclos++;
          progresso.registrar('respira:ciclo');
        }
        const limite = config.duracao * 60;
        if (limite && sessao.decorrido >= limite && sessao.indiceFase === 0) {
          encerrar();
        } else {
          anunciarFase();
        }
      }

      segundosAcumulados += dt;
      if (segundosAcumulados >= 1) {
        segundosAcumulados -= 1;
        progresso.registrar('respira:segundos');
      }
      const limite = config.duracao * 60;
      $('[data-tempo]').textContent = limite
        ? `${formatarTempo(Math.max(0, limite - sessao.decorrido))} restantes · ${sessao.ciclos} ciclos`
        : `${formatarTempo(sessao.decorrido)} · ${sessao.ciclos} ciclos`;
    } else if (sessao.fase !== 'respirando') {
      // Respiração lenta de espera atrás dos painéis
      sessao.escala = 0.5 + Math.sin(tempo * 0.6) * 0.25;
    }

    desenhar(dt);
  });

  function desenhar(dt) {
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fundo em degradê que muda de tom bem devagar
    const matiz = (250 + Math.sin(tempo * 0.05) * 40 + 360) % 360;
    const fundo = g.createLinearGradient(0, 0, l, a);
    fundo.addColorStop(0, `hsl(${matiz}, 70%, 14%)`);
    fundo.addColorStop(1, `hsl(${(matiz + 50) % 360}, 75%, 18%)`);
    g.fillStyle = fundo;
    g.fillRect(0, 0, l, a);

    const cx = l / 2;
    const cy = a / 2 + 10;
    const menor = Math.min(l, a);
    const raio = menor * (0.12 + 0.17 * sessao.escala);

    // Halos
    for (let k = 4; k >= 1; k--) {
      g.fillStyle = `hsla(${k % 2 ? 188 : 268}, 100%, 72%, ${0.03 * k})`;
      g.beginPath();
      g.arc(cx, cy, raio * (1 + k * 0.22), 0, TAU);
      g.fill();
    }

    // Esfera principal
    const esfera = g.createRadialGradient(cx - raio * 0.3, cy - raio * 0.35, raio * 0.1, cx, cy, raio);
    esfera.addColorStop(0, '#ffffff');
    esfera.addColorStop(0.35, '#b8f3ff');
    esfera.addColorStop(0.75, '#b18cff');
    esfera.addColorStop(1, '#7b5cff');
    g.save();
    g.shadowColor = '#b18cff';
    g.shadowBlur = 60;
    g.fillStyle = esfera;
    g.beginPath();
    g.arc(cx, cy, raio, 0, TAU);
    g.fill();
    g.restore();

    // Anel de progresso da fase
    if (sessao.fase === 'respirando') {
      const [, duracao] = sessao.padrao.fases[sessao.indiceFase];
      g.strokeStyle = 'rgba(255,255,255,0.15)';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(cx, cy, menor * 0.34, 0, TAU);
      g.stroke();
      g.strokeStyle = '#5ce1e6';
      g.lineCap = 'round';
      g.shadowColor = '#5ce1e6';
      g.shadowBlur = 14;
      g.beginPath();
      g.arc(cx, cy, menor * 0.34, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(sessao.tempoFase / duracao, 0, 1));
      g.stroke();
      g.shadowBlur = 0;
    }

    // Partículas em órbita (mais rápidas ao inspirar)
    if (!movimentoReduzido()) {
      const ritmo = sessao.fase === 'respirando' && sessao.padrao.fases[sessao.indiceFase][0] === 'inspire' ? 1.6 : 0.8;
      g.globalCompositeOperation = 'lighter';
      for (const o of orbitas) {
        o.angulo += o.velocidade * ritmo * dt;
        const r = raio * o.distancia;
        g.fillStyle = 'rgba(200,240,255,0.7)';
        g.beginPath();
        g.arc(cx + Math.cos(o.angulo) * r, cy + Math.sin(o.angulo) * r * 0.9, o.tamanho, 0, TAU);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  raiz.addEventListener('keydown', (e) => {
    if (sessao.fase !== 'respirando' || e.target.closest('button')) return;
    if (e.key === ' ' || e.key.toLowerCase() === 'p') {
      e.preventDefault();
      alternarPausa();
    }
  });

  mostrarInicio();

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      textura?.parar();
      audio.pararAmbiente();
    },
  };
}
