/**
 * Teclado de switches: 16 teclas mecânicas para apertar (mouse, vários dedos ou o
 * teclado de verdade). Três switches com gravações reais (CC0): clicky, tátil e linear.
 * Cada toque sorteia um trecho diferente das gravações; a volta da tecla toca mais leve.
 * Ao lado, um testador mostra o switch por dentro e a curva de força do tipo escolhido.
 */
import { icone } from '../../core/icones.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { criarBanco } from '../../core/amostras.js?v=202610231621';
import { carregarEstilo, clamp } from '../../core/util.js?v=202610231621';

const SWITCHES = [
  { id: 'clicky', nome: 'Clicky', cor: '#2e7bff', descricao: 'Clique alto e nítido (tipo Blue)', arquivo: 'teclado-clicky', forca: 'M4 52 L40 44 Q48 40 52 18 L56 50 L96 38' },
  { id: 'tatil', nome: 'Tátil', cor: '#a8692f', descricao: 'Um calombo no meio, sem clique (tipo Brown)', arquivo: 'teclado-tatil', forca: 'M4 52 L36 44 Q46 30 54 42 L96 34' },
  { id: 'linear', nome: 'Linear', cor: '#e8343a', descricao: 'Liso do começo ao fim (tipo Red)', arquivo: 'teclado-linear', forca: 'M4 52 L96 30' },
];

const ESTILOS = [
  { id: 'retro', nome: 'Retrô' },
  { id: 'pastel', nome: 'Pastel' },
  { id: 'noite', nome: 'Noite' },
  { id: 'mel', nome: 'Mel' },
];

/** Legenda visível e teclas do teclado físico que acionam cada tecla. */
const TECLAS = [
  ['Esc', ['escape']], ['Q', ['q']], ['W', ['w']], ['E', ['e']],
  ['A', ['a']], ['S', ['s']], ['D', ['d']], ['F', ['f']],
  ['Z', ['z']], ['X', ['x']], ['C', ['c']], ['V', ['v']],
  ['1', ['1']], ['2', ['2']], ['3', ['3']], ['Enter', ['enter']],
];

export async function montar(raiz, { audio, progresso }) {
  await carregarEstilo(new URL('../../../css/experiencias/teclado-switches.css?v=202610231621', import.meta.url));

  const config = { switch: 'clicky', estilo: 'retro', rgb: true, ...ler('teclado-config', {}) };
  const salvar = () => gravar('teclado-config', config);
  const bancos = new Map(SWITCHES.map((sw) => [sw.id, criarBanco(audio,
    [new URL(`../../../assets/sons/fidget/${sw.arquivo}.mp3`, import.meta.url)],
    { recorte: { intervaloMin: 0.06, duracaoMax: 0.16 }, canal: 'efeitos' })]));
  let tipo = SWITCHES.find((sw) => sw.id === config.switch) ?? SWITCHES[0];

  raiz.classList.add('teclado');
  raiz.innerHTML = `
    <div class="teclado__mesa">
      <section class="testador" aria-label="Testador de switch" style="--cor-haste:${tipo.cor}">
        <div class="testador__switch" data-testador>
          <svg viewBox="0 0 120 150" aria-hidden="true">
            <defs>
              <linearGradient id="carcaca" x1="0" x2="1">
                <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".18"/><stop offset="1" stop-color="#ffffff" stop-opacity=".45"/>
              </linearGradient>
            </defs>
            <rect x="14" y="70" width="92" height="56" rx="6" fill="#1b1d26"/>
            <g class="testador__mola"><path d="M46 122 l28 -6 l-28 -6 l28 -6 l-28 -6 l28 -6 l-28 -6" fill="none" stroke="#d9dee8" stroke-width="3" stroke-linecap="round"/></g>
            <g class="testador__haste">
              <rect x="40" y="20" width="40" height="70" rx="6" fill="var(--cor-haste)"/>
              <rect x="54" y="4" width="12" height="26" rx="2" fill="var(--cor-haste)"/>
              <rect x="46" y="10" width="28" height="8" rx="2" fill="var(--cor-haste)"/>
              <rect x="40" y="20" width="10" height="70" rx="5" fill="#fff" opacity=".22"/>
            </g>
            <rect x="10" y="44" width="100" height="44" rx="8" fill="url(#carcaca)" stroke="#ffffff" stroke-opacity=".5"/>
            <rect x="8" y="84" width="104" height="10" rx="3" fill="#2a2d38"/>
            <rect x="34" y="128" width="6" height="16" rx="2" fill="#c9a65a"/><rect x="80" y="128" width="6" height="16" rx="2" fill="#c9a65a"/>
          </svg>
        </div>
        <div class="testador__info">
          <p class="testador__nome" data-nome-switch>${tipo.nome}</p>
          <p class="testador__desc" data-desc-switch>${tipo.descricao}</p>
          <svg class="testador__curva" viewBox="0 0 100 60" aria-label="Curva de força do switch">
            <path d="M4 56 H96 M4 56 V4" stroke="rgba(255,255,255,.25)" fill="none"/>
            <path data-curva d="${tipo.forca}" stroke="var(--cor-haste)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <circle data-ponto r="4" cx="4" cy="52" fill="#fff"/>
          </svg>
          <p class="testador__legenda">força × curso da tecla</p>
        </div>
      </section>

      <section class="teclas" data-sem-clique data-estilo="${config.estilo}" data-rgb="${config.rgb}" aria-label="Teclas mecânicas">
        <div class="teclas__placa">
          ${TECLAS.map(([legenda], i) => `<button type="button" class="tecla ${legenda.length > 1 ? 'tecla--mod' : ''}" data-tecla="${i}"
            style="--i:${i};--linha:${Math.floor(i / 4)};--coluna:${i % 4}"><span class="tecla__topo">${legenda}</span></button>`).join('')}
        </div>
        <div class="teclas__placar" aria-live="off">
          <span><strong data-toques>0</strong> toques</span>
          <span><strong data-tpm>0</strong> por minuto</span>
        </div>
      </section>
    </div>
    <div class="doca vidro-fosco teclado__doca" role="region" aria-label="Opções do teclado">
      <div class="doca__linha">
        <span class="doca__rotulo">SWITCH</span>
        ${SWITCHES.map((sw) => `<button type="button" class="chip" data-switch="${sw.id}" aria-pressed="${sw.id === tipo.id}"><span class="teclado__bolinha" style="--cor:${sw.cor}"></span>${sw.nome}</button>`).join('')}
      </div>
      <div class="doca__linha">
        <span class="doca__rotulo">TECLAS</span>
        ${ESTILOS.map((e) => `<button type="button" class="chip" data-estilo-btn="${e.id}" aria-pressed="${e.id === config.estilo}">${e.nome}</button>`).join('')}
        <button type="button" class="chip" data-rgb-btn aria-pressed="${config.rgb}">${icone('brilho')}<span>RGB</span></button>
      </div>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const teclas = [...raiz.querySelectorAll('[data-tecla]')];
  const testador = $('[data-testador]');
  const ponto = $('[data-ponto]');
  const curva = $('[data-curva]');
  const area = $('.teclas');

  let toques = 0;
  const recentes = [];
  const apertadas = new Map(); // índice da tecla → quantos dedos/teclas seguram

  /* ---------- Som e animação ---------- */

  function animarTestador(descendo) {
    testador.classList.toggle('testador__switch--baixo', descendo);
    // O ponto percorre a curva de força
    const comprimento = curva.getTotalLength();
    const inicio = performance.now();
    const duracao = 90;
    const passo = (agora) => {
      const t = clamp((agora - inicio) / duracao, 0, 1);
      const p = curva.getPointAtLength(comprimento * (descendo ? t : 1 - t));
      ponto.setAttribute('cx', p.x.toFixed(1));
      ponto.setAttribute('cy', p.y.toFixed(1));
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  function apertar(indice) {
    const quantos = apertadas.get(indice) ?? 0;
    apertadas.set(indice, quantos + 1);
    if (quantos) return;
    const tecla = teclas[indice];
    tecla.classList.add('tecla--apertada');
    const pan = ((indice % 4) / 3 - 0.5) * 0.6;
    const banco = bancos.get(tipo.id);
    if (!banco.tocar({ variacaoTom: 0.05, pan })) audio.tocar('clique', { pan });
    animarTestador(true);
    toques++;
    const agora = performance.now();
    recentes.push(agora);
    while (recentes.length && agora - recentes[0] > 10000) recentes.shift();
    progresso.registrar('teclado:toque');
    progresso.registrar('teclado:switch', 0, tipo.id);
    // Onda de luz RGB a partir da tecla apertada
    if (config.rgb) {
      area.style.setProperty('--onda-linha', Math.floor(indice / 4));
      area.style.setProperty('--onda-coluna', indice % 4);
      area.classList.remove('teclas--onda');
      void area.offsetWidth;
      area.classList.add('teclas--onda');
    }
    atualizarPlacar();
  }

  function soltar(indice) {
    const quantos = apertadas.get(indice) ?? 0;
    if (!quantos) return;
    if (quantos > 1) {
      apertadas.set(indice, quantos - 1);
      return;
    }
    apertadas.delete(indice);
    teclas[indice].classList.remove('tecla--apertada');
    // Volta da tecla: o mesmo som, mais leve e um pouco mais agudo
    bancos.get(tipo.id).tocar({ tom: 1.12, variacaoTom: 0.05, volume: tipo.id === 'linear' ? 0.25 : 0.4 });
    animarTestador(false);
  }

  function atualizarPlacar() {
    $('[data-toques]').textContent = toques.toLocaleString('pt-BR');
    const janela = recentes.length > 1 ? Math.max(2000, recentes[recentes.length - 1] - recentes[0]) : 10000;
    $('[data-tpm]').textContent = String(Math.round((recentes.length / janela) * 60000));
  }

  /* ---------- Entrada: ponteiros (com deslizar de tecla em tecla) e teclado físico ---------- */

  const dedos = new Map(); // pointerId → índice da tecla
  const teclaEm = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-tecla]');

  area.addEventListener('pointerdown', (e) => {
    const tecla = e.target.closest('[data-tecla]');
    if (!tecla || e.button > 0) return;
    e.preventDefault();
    try { area.setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }
    const indice = Number(tecla.dataset.tecla);
    dedos.set(e.pointerId, indice);
    apertar(indice);
  });
  area.addEventListener('pointermove', (e) => {
    if (!dedos.has(e.pointerId)) return;
    const tecla = teclaEm(e.clientX, e.clientY);
    const indice = tecla ? Number(tecla.dataset.tecla) : -1;
    const anterior = dedos.get(e.pointerId);
    if (indice === anterior) return;
    if (anterior >= 0) soltar(anterior);
    dedos.set(e.pointerId, indice);
    if (indice >= 0) apertar(indice);
  });
  const soltarDedo = (e) => {
    if (!dedos.has(e.pointerId)) return;
    const indice = dedos.get(e.pointerId);
    dedos.delete(e.pointerId);
    if (indice >= 0) soltar(indice);
  };
  area.addEventListener('pointerup', soltarDedo);
  area.addEventListener('pointercancel', soltarDedo);
  // Clique de teclado (Enter/Espaço com foco na tecla) não deve repetir o som do clique do mouse
  area.addEventListener('click', (e) => e.preventDefault());

  const indicePorTecla = new Map();
  TECLAS.forEach(([, fisicas], i) => fisicas.forEach((k) => indicePorTecla.set(k, i)));

  function teclaFisica(e, descendo) {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    const chave = e.key.toLowerCase();
    let indice = indicePorTecla.get(chave);
    // Espaço ou Enter numa tecla com foco aciona aquela tecla
    if ((chave === ' ' || chave === 'enter') && e.target.closest?.('[data-tecla]')) indice = Number(e.target.closest('[data-tecla]').dataset.tecla);
    if (indice === undefined) return;
    if (chave === 'escape') {
      // Esc continua voltando ao hub; só anima a tecla
      if (descendo) {
        apertar(indice);
        setTimeout(() => soltar(indice), 90);
      }
      return;
    }
    e.preventDefault();
    if (descendo && !e.repeat) apertar(indice);
    else if (!descendo) soltar(indice);
  }
  const aoDescer = (e) => teclaFisica(e, true);
  const aoSubir = (e) => teclaFisica(e, false);
  addEventListener('keydown', aoDescer);
  addEventListener('keyup', aoSubir);

  /* ---------- Opções ---------- */

  $('.teclado__doca').addEventListener('click', (e) => {
    const sw = e.target.closest('[data-switch]');
    if (sw) {
      tipo = SWITCHES.find((x) => x.id === sw.dataset.switch);
      config.switch = tipo.id;
      salvar();
      for (const b of raiz.querySelectorAll('[data-switch]')) b.setAttribute('aria-pressed', String(b === sw));
      $('.testador').style.setProperty('--cor-haste', tipo.cor);
      curva.setAttribute('d', tipo.forca);
      $('[data-nome-switch]').textContent = tipo.nome;
      $('[data-desc-switch]').textContent = tipo.descricao;
      apertar(0);
      setTimeout(() => soltar(0), 110);
      return;
    }
    const estilo = e.target.closest('[data-estilo-btn]');
    if (estilo) {
      config.estilo = estilo.dataset.estiloBtn;
      salvar();
      area.dataset.estilo = config.estilo;
      for (const b of raiz.querySelectorAll('[data-estilo-btn]')) b.setAttribute('aria-pressed', String(b === estilo));
      return;
    }
    const rgb = e.target.closest('[data-rgb-btn]');
    if (rgb) {
      config.rgb = !config.rgb;
      salvar();
      area.dataset.rgb = String(config.rgb);
      rgb.setAttribute('aria-pressed', String(config.rgb));
    }
  });

  teclas[5].setAttribute('data-foco-inicial', '');
  raiz.style.setProperty('--c1', tipo.cor);

  return {
    destruir() {
      removeEventListener('keydown', aoDescer);
      removeEventListener('keyup', aoSubir);
    },
  };
}
