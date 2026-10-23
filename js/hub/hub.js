/**
 * Tela inicial: herói com logo e botão Surpresa, painel do jogador
 * (nível, missões, conquistas) e a grade de experiências com prévias animadas.
 */
import { EXPERIENCIAS } from '../experiencias/registro.js';
import { PREVIAS } from './previas.js';
import { CONQUISTAS } from '../core/conquistas.js';
import { aoQuadro } from '../core/loop.js';
import { criarCanvasResponsivo } from '../core/canvas.js';
import { icone } from '../core/icones.js';
import { formatarTempo, movimentoReduzido, semHover } from '../core/util.js';

const CATEGORIAS = ['Todos', 'Relaxar', 'Ação', 'Criar', 'Fidget'];
const CORES_LOGO = ['#ff2e97', '#ff7a18', '#ffd60a', '#a3ff12', '#3cffb4', '#22e4ff', '#8b5cff', '#ff5dc8'];
const TITULOS_NIVEL = [
  [25, 'Lenda da Dopamina'],
  [18, 'Galáxia viva'],
  [12, 'Supernova'],
  [8, 'Cometa'],
  [5, 'Faísca brilhante'],
  [3, 'Onda inquieta'],
  [1, 'Gota curiosa'],
];

const tituloDoNivel = (nivel) => TITULOS_NIVEL.find(([minimo]) => nivel >= minimo)[1];

function saudacao() {
  const hora = new Date().getHours();
  if (hora < 5) return 'Boa madrugada';
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function tempoAteMeiaNoite() {
  const agora = new Date();
  const meiaNoite = new Date(agora);
  meiaNoite.setHours(24, 0, 0, 0);
  const minutos = Math.ceil((meiaNoite - agora) / 60000);
  const horas = Math.floor(minutos / 60);
  return horas ? `${horas}h ${minutos % 60}min` : `${minutos}min`;
}

/** Prepara o canvas de prévia de um card e devolve { t, desenhar, destruir }. */
function criarPrevia(canvas, desenho, cores) {
  const ctx = canvas.getContext('2d');
  let estado = null;
  const previa = { t: 1.3 };
  previa.desenhar = () => {
    if (!estado || estado.largura < 2) return;
    ctx.setTransform(estado.dpr, 0, 0, estado.dpr, 0, 0);
    ctx.clearRect(0, 0, estado.largura, estado.altura);
    desenho(ctx, estado.largura, estado.altura, previa.t, cores);
  };
  const tela = criarCanvasResponsivo(canvas, {
    maxDpr: 1.5,
    aoRedimensionar: (novo) => {
      estado = novo;
      previa.desenhar();
    },
  });
  previa.destruir = tela.destruir;
  return previa;
}

/**
 * @param {{ progresso, audio, aoEscolher: (id, origem) => void, aoSurpresa: (origem) => void }} opcoes
 */
export function criarHub({ progresso, audio, aoEscolher, aoSurpresa }) {
  const raiz = document.getElementById('tela-hub');
  raiz.innerHTML = `
    <div class="hub__topo">
      <div class="hub__heroi">
        <p class="hub__saudacao">${icone('brilho')}<span>${saudacao()}! Bora de dopamina?</span></p>
        <h1 class="logo" aria-label="Dopamina">${[...'DOPAMINA'].map((letra, i) =>
          `<span aria-hidden="true" style="--i:${i};--cor:${CORES_LOGO[i % CORES_LOGO.length]}">${letra}</span>`).join('')}</h1>
        <p class="hub__subtitulo">Pequenas doses de cor, som e movimento. Escolha uma, mergulhe e troque quando quiser.</p>
        <div class="hub__acoes">
          <button type="button" class="botao-surpresa" data-surpresa>${icone('dado')}<span>Surpresa!</span></button>
          <p class="hub__dica">Sorteia uma experiência e um clima para você.</p>
        </div>
      </div>
      <aside class="painel-jogador vidro-fosco" aria-label="Seu progresso">
        <div class="jogador">
          <div class="jogador__nivel"><span class="jogador__rotulo">Nível</span><span class="jogador__numero" data-nivel></span></div>
          <div class="jogador__info">
            <p class="jogador__titulo" data-titulo-nivel></p>
            <div class="barra-xp" role="progressbar" aria-label="Experiência até o próximo nível" aria-valuemin="0" data-barra-xp>
              <span class="barra-xp__preenchimento"></span>
            </div>
            <p class="jogador__xp" data-texto-xp></p>
          </div>
        </div>
        <section class="bloco" aria-labelledby="titulo-missoes">
          <div class="bloco__titulo"><h2 id="titulo-missoes">Missões do dia</h2><span class="bloco__extra" data-renovacao></span></div>
          <ul class="missoes" data-missoes></ul>
        </section>
        <section class="bloco" aria-labelledby="titulo-conquistas">
          <div class="bloco__titulo"><h2 id="titulo-conquistas">Conquistas</h2><span class="bloco__extra" data-contagem-conquistas></span></div>
          <ul class="grade-conquistas" data-conquistas></ul>
          <p class="conquista-detalhe" data-detalhe-conquista aria-live="polite">Toque numa medalha para ver como ganhar.</p>
        </section>
      </aside>
    </div>
    <div class="hub__cabecalho-secao">
      <h2 class="hub__secao">Experiências</h2>
      <div class="filtros" role="group" aria-label="Filtrar por categoria" data-filtros>
        ${CATEGORIAS.map((c, i) => `<button type="button" class="filtro" data-categoria="${c}" aria-pressed="${i === 0}">${c}</button>`).join('')}
      </div>
    </div>
    <div class="grade" id="grade-experiencias" tabindex="-1" data-grade>
      ${EXPERIENCIAS.map(htmlCard).join('')}
    </div>
    <p class="hub__rodape">Seu progresso fica salvo só neste navegador. Respire, brinque e volte quando quiser.</p>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const grade = $('[data-grade]');
  let visivel = true;

  /* ---------- Prévias animadas ---------- */

  const previas = new Map();
  const ativas = new Set();
  let cancelarLoop = null;

  const quadro = (dt) => {
    for (const previa of ativas) {
      previa.t += dt;
      previa.desenhar();
    }
  };
  const ativar = (previa) => {
    if (!visivel || movimentoReduzido()) return;
    ativas.add(previa);
    cancelarLoop ??= aoQuadro(quadro);
  };
  const desativar = (previa) => {
    ativas.delete(previa);
    if (!ativas.size && cancelarLoop) {
      cancelarLoop();
      cancelarLoop = null;
    }
  };

  // No celular não existe hover: anima o card enquanto ele está bem visível
  const observadorVisibilidade = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      const previa = previas.get(entrada.target.dataset.id);
      if (entrada.isIntersecting) ativar(previa);
      else desativar(previa);
    }
  }, { threshold: 0.6 });

  for (const card of grade.querySelectorAll('.card')) {
    const exp = EXPERIENCIAS.find((e) => e.id === card.dataset.id);
    const previa = criarPrevia(card.querySelector('canvas'), PREVIAS[exp.previa], exp.cores);
    previas.set(exp.id, previa);

    if (semHover() || exp.destaque) observadorVisibilidade.observe(card);
    if (!exp.destaque) {
      card.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        ativar(previa);
        audio.tocar('hover', { intervaloMin: 0.06 });
      });
      card.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && desativar(previa));
      card.addEventListener('focus', () => ativar(previa));
      card.addEventListener('blur', () => desativar(previa));
    }

    card.addEventListener('click', (e) => {
      // Ctrl/Cmd/botão do meio continuam abrindo em nova aba
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      if (!exp.disponivel) {
        card.classList.remove('card--tremer');
        void card.offsetWidth;
        card.classList.add('card--tremer');
        audio.tocar('erro');
        return;
      }
      aoEscolher(exp.id, origemDoElemento(card));
    });
  }

  /* ---------- Filtros ---------- */

  $('[data-filtros]').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-categoria]');
    if (!botao) return;
    const categoria = botao.dataset.categoria;
    for (const outro of raiz.querySelectorAll('[data-filtros] [data-categoria]')) {
      outro.setAttribute('aria-pressed', String(outro === botao));
    }
    let ordem = 0;
    for (const card of grade.querySelectorAll('.card')) {
      const mostrar = categoria === 'Todos' || card.dataset.categoria === categoria;
      card.hidden = !mostrar;
      if (mostrar) {
        card.style.setProperty('--ordem', ordem++);
        card.classList.remove('card--entrar');
        void card.offsetWidth;
        card.classList.add('card--entrar');
      }
    }
  });

  $('[data-surpresa]').addEventListener('click', (e) => aoSurpresa(origemDoElemento(e.currentTarget)));

  /* ---------- Painel do jogador ---------- */

  const conquistasEl = $('[data-conquistas]');
  const detalheConquista = $('[data-detalhe-conquista]');

  function mostrarDetalheConquista(botao) {
    const conquista = CONQUISTAS.find((c) => c.id === botao.dataset.conquista);
    const ganha = progresso.conquistaDesbloqueada(conquista.id);
    detalheConquista.textContent = `${conquista.nome}: ${conquista.descricao}${ganha ? ' ✓' : ''}`;
    detalheConquista.style.color = ganha ? conquista.cor : '';
  }
  conquistasEl.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-conquista]');
    if (botao) mostrarDetalheConquista(botao);
  });
  conquistasEl.addEventListener('pointerover', (e) => {
    const botao = e.target.closest('[data-conquista]');
    if (botao) mostrarDetalheConquista(botao);
  });
  conquistasEl.addEventListener('focusin', (e) => {
    const botao = e.target.closest('[data-conquista]');
    if (botao) mostrarDetalheConquista(botao);
  });

  function atualizarPainel() {
    const info = progresso.infoNivel();
    $('[data-nivel]').textContent = info.nivel;
    $('[data-titulo-nivel]').textContent = tituloDoNivel(info.nivel);
    const barra = $('[data-barra-xp]');
    barra.style.setProperty('--p', `${(info.fracao * 100).toFixed(1)}%`);
    barra.setAttribute('aria-valuemax', info.necessario);
    barra.setAttribute('aria-valuenow', Math.floor(info.xpNoNivel));
    $('[data-texto-xp]').textContent =
      `${Math.floor(info.xpNoNivel)} / ${info.necessario} XP · faltam ${Math.ceil(info.necessario - info.xpNoNivel)} para o nível ${info.nivel + 1}`;

    const missoes = progresso.missoesDoDia();
    $('[data-renovacao]').textContent = `renovam em ${tempoAteMeiaNoite()}`;
    $('[data-missoes]').innerHTML = missoes.length
      ? missoes.map((m) => {
        const contagem = m.formato === 'tempo'
          ? `${formatarTempo(m.progresso)} de ${formatarTempo(m.meta)}`
          : `${m.progresso}/${m.meta}`;
        return `<li class="missao ${m.concluida ? 'missao--concluida' : ''}" style="--cor:${m.cor}">
          <span class="missao__icone">${icone(m.concluida ? 'check' : m.icone)}</span>
          <span class="missao__texto">${m.texto} <small>${m.concluida ? 'feita!' : contagem}</small></span>
          <span class="missao__xp">+${m.xp} XP</span>
          <span class="missao__progresso" aria-hidden="true"><span style="--p:${(m.progresso / m.meta) * 100}%"></span></span>
        </li>`;
      }).join('')
      : '<li class="missao">Nenhuma missão hoje. Aproveite!</li>';

    const ganhas = CONQUISTAS.filter((c) => progresso.conquistaDesbloqueada(c.id)).length;
    $('[data-contagem-conquistas]').textContent = `${ganhas} de ${CONQUISTAS.length}`;
    conquistasEl.innerHTML = CONQUISTAS.map((c) => {
      const ganha = progresso.conquistaDesbloqueada(c.id);
      return `<li><button type="button" class="conquista ${ganha ? '' : 'conquista--bloqueada'}" style="--cor:${c.cor}"
        data-conquista="${c.id}" aria-label="${c.nome}${ganha ? ', conquistada' : ', ainda bloqueada'}">${icone(ganha ? c.icone : 'cadeado')}</button></li>`;
    }).join('');

    for (const card of grade.querySelectorAll('.card')) {
      const exp = EXPERIENCIAS.find((e) => e.id === card.dataset.id);
      const alvo = card.querySelector('[data-estatistica]');
      alvo.textContent = exp.estatistica ? exp.estatistica(progresso) : 'Em breve';
    }
  }

  // Atualiza o painel no máximo uma vez por quadro enquanto o hub estiver visível
  let atualizacaoPendente = false;
  progresso.on('mudou', () => {
    if (!visivel || atualizacaoPendente) return;
    atualizacaoPendente = true;
    requestAnimationFrame(() => {
      atualizacaoPendente = false;
      atualizarPainel();
    });
  });

  atualizarPainel();

  return {
    mostrar() {
      visivel = true;
      atualizarPainel();
      // Reanima o destaque e os cards visíveis no celular
      observadorVisibilidade.disconnect();
      for (const card of grade.querySelectorAll('.card')) {
        const exp = EXPERIENCIAS.find((e) => e.id === card.dataset.id);
        if (semHover() || exp.destaque) observadorVisibilidade.observe(card);
      }
    },
    ocultar() {
      visivel = false;
      for (const previa of [...ativas]) desativar(previa);
    },
    focarCard(id) {
      grade.querySelector(`[data-id="${id}"]`)?.focus({ preventScroll: false });
    },
  };
}

function htmlCard(exp, ordem) {
  const atributos = exp.disponivel
    ? `href="#/x/${exp.id}"`
    : 'type="button" aria-disabled="true"';
  const tag = exp.disponivel ? 'a' : 'button';
  return `<${tag} class="card card--entrar ${exp.destaque ? 'card--destaque' : ''}" ${atributos}
      data-id="${exp.id}" data-categoria="${exp.categoria}"
      style="--c1:${exp.cores[0]};--c2:${exp.cores[1]};--ordem:${ordem}">
    <canvas class="card__previa" aria-hidden="true"></canvas>
    ${exp.disponivel ? '' : `<span class="card__selo">${icone('relogio')}Em breve</span>`}
    <span class="card__corpo">
      <span class="card__topo">
        <span class="card__tag">${exp.categoria}</span>
        <span class="card__icone">${icone(exp.icone)}</span>
      </span>
      <span class="card__titulo">${exp.nome}</span>
      <span class="card__desc">${exp.descricao}</span>
      <span class="card__rodape">
        <span data-estatistica></span>
        <span class="card__jogar">${exp.disponivel ? 'Jogar' : 'Na fila'}${icone('seta')}</span>
      </span>
    </span>
  </${tag}>`;
}

/** Centro do elemento na tela, de onde nasce a transição. */
function origemDoElemento(elemento) {
  const caixa = elemento.getBoundingClientRect();
  return { x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height / 2 };
}
