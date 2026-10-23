/**
 * Caneta e interruptores: um painel com controles para ficar mexendo, cada um com o
 * seu som gravado (CC0): caneta clicker, interruptor de luz, chave de alavanca com LED,
 * chave deslizante de 3 posições, alavanca com mola, botões de fliperama e botão
 * giratório com estalos. Tudo funciona com mouse, toque e teclado (Tab + Espaço/setas).
 */
import { ler, gravar } from '../../core/armazenamento.js';
import { criarBanco } from '../../core/amostras.js';
import { capturarPonteiro, carregarEstilo, clamp } from '../../core/util.js';

const som = (nome) => new URL(`../../../assets/sons/fidget/${nome}.mp3`, import.meta.url);
const DETENTES = 16;

export async function montar(raiz, { audio, progresso }) {
  await carregarEstilo(new URL('../../../css/experiencias/interruptores.css', import.meta.url));

  const estado = { caneta: false, luz: false, chave: false, deslizante: 0, giro: 5, ...ler('interruptores-estado', {}) };
  const salvar = () => gravar('interruptores-estado', estado);
  const recorte = { intervaloMin: 0.04, duracaoMax: 0.25, sensibilidade: 1.6 };
  const bancos = {
    caneta: criarBanco(audio, [som('caneta')], { recorte, canal: 'efeitos' }),
    luz: criarBanco(audio, [som('interruptor')], { recorte, canal: 'efeitos' }),
    chave: criarBanco(audio, [som('toggle')], { recorte, canal: 'efeitos' }),
    deslizante: criarBanco(audio, [som('deslizante')], { recorte: { ...recorte, duracaoMax: 0.35 }, canal: 'efeitos' }),
    alavanca: criarBanco(audio, [som('alavanca')], { recorte: { ...recorte, duracaoMax: 0.5 }, canal: 'efeitos' }),
  };

  raiz.classList.add('painel');
  raiz.innerHTML = `
    <div class="painel__placa" data-sem-clique>
      <section class="modulo modulo--caneta" aria-label="Caneta clicker">
        <h3 class="modulo__nome">Caneta</h3>
        <button type="button" class="caneta" data-caneta aria-pressed="${estado.caneta}" aria-label="Clicar a caneta" data-foco-inicial>
          <svg viewBox="0 0 60 300" aria-hidden="true">
            <defs>
              <linearGradient id="corpo-caneta" x1="0" x2="1"><stop offset="0" stop-color="#1b4fd6"/><stop offset=".35" stop-color="#5f8dff"/><stop offset=".55" stop-color="#2f62ec"/><stop offset="1" stop-color="#102f8a"/></linearGradient>
              <linearGradient id="metal-caneta" x1="0" x2="1"><stop offset="0" stop-color="#8d96a8"/><stop offset=".4" stop-color="#ffffff"/><stop offset=".6" stop-color="#c6ccd8"/><stop offset="1" stop-color="#6a7284"/></linearGradient>
              <linearGradient id="grip-caneta" x1="0" x2="1"><stop offset="0" stop-color="#1a1d26"/><stop offset=".4" stop-color="#4a5064"/><stop offset="1" stop-color="#11131a"/></linearGradient>
            </defs>
            <g class="caneta__ponta"><path d="M28 268 h4 l-1 22 h-2z" fill="#9aa3b5"/><circle cx="30" cy="290" r="1.6" fill="#1d4ed8"/></g>
            <path d="M18 228 L42 228 L34 272 L26 272 Z" fill="url(#metal-caneta)"/>
            <rect x="14" y="170" width="32" height="60" rx="6" fill="url(#grip-caneta)"/>
            <g fill="#000" opacity=".25">${Array.from({ length: 9 }, (_, i) => `<rect x="14" y="${176 + i * 6}" width="32" height="2"/>`).join('')}</g>
            <rect x="14" y="44" width="32" height="132" rx="8" fill="url(#corpo-caneta)"/>
            <rect x="19" y="50" width="5" height="118" rx="2.5" fill="#fff" opacity=".35"/>
            <path d="M44 52 h8 a4 4 0 0 1 4 4 v86 a5 5 0 0 1 -10 0 v-74 h-2z" fill="url(#metal-caneta)"/>
            <rect x="15" y="36" width="30" height="12" rx="3" fill="url(#metal-caneta)"/>
            <g class="caneta__botao"><rect x="21" y="6" width="18" height="34" rx="6" fill="url(#metal-caneta)"/><rect x="24" y="10" width="4" height="24" rx="2" fill="#fff" opacity=".6"/></g>
          </svg>
        </button>
        <p class="modulo__info"><strong data-cliques-caneta>0</strong> cliques</p>
      </section>

      <section class="modulo modulo--luz" aria-label="Interruptor de luz" data-luz-modulo>
        <h3 class="modulo__nome">Luz</h3>
        <div class="lampada" aria-hidden="true"><span class="lampada__vidro"></span><span class="lampada__base"></span></div>
        <div class="espelho">
          <button type="button" class="tecla-luz" data-luz role="switch" aria-checked="${estado.luz}" aria-label="Interruptor de luz">
            <span class="tecla-luz__face"></span>
          </button>
        </div>
      </section>

      <section class="modulo" aria-label="Chave de alavanca">
        <h3 class="modulo__nome">Chave</h3>
        <span class="led" data-led-chave aria-hidden="true"></span>
        <button type="button" class="chave" data-chave role="switch" aria-checked="${estado.chave}" aria-label="Chave de alavanca">
          <span class="chave__porca"></span><span class="chave__haste"></span>
        </button>
        <p class="modulo__info" data-texto-chave>${estado.chave ? 'LIGADA' : 'DESLIGADA'}</p>
      </section>

      <section class="modulo" aria-label="Chave deslizante">
        <h3 class="modulo__nome">Deslizante</h3>
        <div class="barra-leds" aria-hidden="true">${[0, 1, 2].map((i) => `<span data-led-nivel="${i}"></span>`).join('')}</div>
        <div class="deslizante" data-deslizante role="slider" tabindex="0" aria-label="Chave deslizante" aria-valuemin="0" aria-valuemax="2" aria-valuenow="${estado.deslizante}">
          <span class="deslizante__trilho"></span>
          <span class="deslizante__pino"></span>
        </div>
        <div class="deslizante__rotulos" aria-hidden="true"><span>1</span><span>2</span><span>3</span></div>
      </section>

      <section class="modulo modulo--alavanca" aria-label="Alavanca">
        <h3 class="modulo__nome">Alavanca</h3>
        <div class="alavanca" data-alavanca role="button" tabindex="0" aria-label="Puxar a alavanca">
          <span class="alavanca__fenda"></span>
          <span class="alavanca__braco"><span class="alavanca__bola"></span></span>
        </div>
        <p class="modulo__info"><strong data-puxadas>0</strong> puxadas</p>
      </section>

      <section class="modulo" aria-label="Botões de fliperama">
        <h3 class="modulo__nome">Botões</h3>
        <div class="arcade">
          ${['#ff2e97', '#ffd60a', '#22e4ff'].map((cor, i) => `<button type="button" class="arcade__botao" data-arcade="${i}" style="--cor:${cor}" aria-label="Botão ${i + 1}"><span></span></button>`).join('')}
        </div>
      </section>

      <section class="modulo" aria-label="Botão giratório">
        <h3 class="modulo__nome">Giratório</h3>
        <div class="giratorio" data-giratorio role="slider" tabindex="0" aria-label="Botão giratório" aria-valuemin="0" aria-valuemax="${DETENTES - 1}" aria-valuenow="${estado.giro}">
          <div class="giratorio__leds" aria-hidden="true">${Array.from({ length: DETENTES }, (_, i) => `<span style="--a:${-135 + (270 / (DETENTES - 1)) * i}deg" data-led-giro="${i}"></span>`).join('')}</div>
          <div class="giratorio__botao"><span class="giratorio__marca"></span></div>
        </div>
      </section>
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  let cliquesCaneta = 0;
  let puxadas = 0;

  function usar(controle) {
    progresso.registrar('interruptor:uso', 1, controle);
  }

  function tocar(banco, opcoes = {}, reserva = 'clique') {
    if (!bancos[banco]?.tocar({ variacaoTom: 0.04, ...opcoes })) audio.tocar(reserva, opcoes);
  }

  /* ---------- Caneta ---------- */

  const caneta = $('[data-caneta]');
  caneta.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    caneta.classList.add('caneta--apertando');
    tocar('caneta', { volume: 0.9 });
  });
  const soltarCaneta = () => {
    if (!caneta.classList.contains('caneta--apertando')) return;
    caneta.classList.remove('caneta--apertando');
    alternarCaneta();
  };
  caneta.addEventListener('pointerup', soltarCaneta);
  caneta.addEventListener('pointerleave', soltarCaneta);
  caneta.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      caneta.classList.add('caneta--apertando');
      tocar('caneta', { volume: 0.9 });
    }
  });
  caneta.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') soltarCaneta();
  });
  caneta.addEventListener('click', (e) => e.preventDefault());

  function alternarCaneta() {
    estado.caneta = !estado.caneta;
    caneta.setAttribute('aria-pressed', String(estado.caneta));
    tocar('caneta', { tom: 1.1, volume: 0.7 });
    cliquesCaneta++;
    $('[data-cliques-caneta]').textContent = String(cliquesCaneta);
    progresso.registrar('caneta:clique');
    usar('caneta');
    salvar();
  }

  /* ---------- Interruptor de luz ---------- */

  const luz = $('[data-luz]');
  luz.addEventListener('click', () => {
    estado.luz = !estado.luz;
    luz.setAttribute('aria-checked', String(estado.luz));
    $('[data-luz-modulo]').classList.toggle('modulo--acesa', estado.luz);
    raiz.classList.toggle('painel--acesa', estado.luz);
    tocar('luz', { volume: 1 });
    usar('luz');
    salvar();
  });

  /* ---------- Chave de alavanca ---------- */

  const chave = $('[data-chave]');
  chave.addEventListener('click', () => {
    estado.chave = !estado.chave;
    chave.setAttribute('aria-checked', String(estado.chave));
    $('[data-led-chave]').classList.toggle('led--aceso', estado.chave);
    $('[data-texto-chave]').textContent = estado.chave ? 'LIGADA' : 'DESLIGADA';
    tocar('chave', { tom: estado.chave ? 1 : 0.9, volume: 1 });
    usar('chave');
    salvar();
  });

  /* ---------- Chave deslizante (3 posições) ---------- */

  const deslizante = $('[data-deslizante]');
  function posicionarDeslizante(posicao, comSom = true) {
    posicao = clamp(posicao, 0, 2);
    if (posicao === estado.deslizante && comSom) return;
    estado.deslizante = posicao;
    deslizante.style.setProperty('--pos', posicao);
    deslizante.setAttribute('aria-valuenow', String(posicao));
    raiz.querySelectorAll('[data-led-nivel]').forEach((led, i) => led.classList.toggle('aceso', i <= posicao));
    if (comSom) {
      tocar('deslizante', { tom: 0.9 + posicao * 0.08, volume: 1 }, 'tique');
      usar('deslizante');
      salvar();
    }
  }
  let arrastandoDeslizante = false;
  const posicaoNoTrilho = (e) => {
    const caixa = deslizante.getBoundingClientRect();
    return Math.round(clamp((e.clientX - caixa.left) / caixa.width, 0, 1) * 2);
  };
  deslizante.addEventListener('pointerdown', (e) => {
    capturarPonteiro(deslizante, e.pointerId);
    arrastandoDeslizante = true;
    posicionarDeslizante(posicaoNoTrilho(e));
  });
  deslizante.addEventListener('pointermove', (e) => {
    if (arrastandoDeslizante) posicionarDeslizante(posicaoNoTrilho(e));
  });
  deslizante.addEventListener('pointerup', () => { arrastandoDeslizante = false; });
  deslizante.addEventListener('pointercancel', () => { arrastandoDeslizante = false; });
  deslizante.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') posicionarDeslizante(estado.deslizante - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') posicionarDeslizante(estado.deslizante + 1);
    else return;
    e.preventDefault();
  });

  /* ---------- Alavanca com mola ---------- */

  const alavanca = $('[data-alavanca]');
  const alav = { puxando: false, inicio: 0, valor: 0, travou: false };
  function puxarAlavanca(valor) {
    alav.valor = clamp(valor, 0, 1);
    alavanca.style.setProperty('--puxada', alav.valor.toFixed(3));
    if (alav.valor > 0.92 && !alav.travou) {
      alav.travou = true;
      tocar('alavanca', { volume: 1 }, 'acerto');
      puxadas++;
      $('[data-puxadas]').textContent = String(puxadas);
      progresso.registrar('alavanca:puxada');
      usar('alavanca');
      raiz.classList.remove('painel--festa');
      void raiz.offsetWidth;
      raiz.classList.add('painel--festa');
    }
  }
  function soltarAlavanca() {
    if (!alav.puxando) return;
    alav.puxando = false;
    alavanca.classList.add('alavanca--voltando');
    if (alav.travou) tocar('alavanca', { tom: 1.15, volume: 0.6 }, 'tique');
    alav.travou = false;
    puxarAlavanca(0);
  }
  alavanca.addEventListener('pointerdown', (e) => {
    capturarPonteiro(alavanca, e.pointerId);
    alav.puxando = true;
    alav.inicio = e.clientY;
    alavanca.classList.remove('alavanca--voltando');
  });
  alavanca.addEventListener('pointermove', (e) => {
    if (!alav.puxando) return;
    puxarAlavanca((e.clientY - alav.inicio) / (alavanca.getBoundingClientRect().height * 0.62));
  });
  alavanca.addEventListener('pointerup', soltarAlavanca);
  alavanca.addEventListener('pointercancel', soltarAlavanca);
  alavanca.addEventListener('keydown', (e) => {
    if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat) return;
    e.preventDefault();
    alav.puxando = true;
    alavanca.classList.add('alavanca--voltando');
    puxarAlavanca(1);
    setTimeout(soltarAlavanca, 260);
  });

  /* ---------- Botões de fliperama ---------- */

  for (const botao of raiz.querySelectorAll('[data-arcade]')) {
    const i = Number(botao.dataset.arcade);
    const apertar = () => {
      botao.classList.add('arcade__botao--apertado');
      tocar('caneta', { tom: 0.62 + i * 0.08, volume: 1 });
      usar('botoes');
      progresso.registrar('arcade:botao');
    };
    const soltarBotao = () => {
      if (!botao.classList.contains('arcade__botao--apertado')) return;
      botao.classList.remove('arcade__botao--apertado');
      tocar('caneta', { tom: 0.8 + i * 0.08, volume: 0.35 });
    };
    botao.addEventListener('pointerdown', (e) => e.button === 0 && apertar());
    botao.addEventListener('pointerup', soltarBotao);
    botao.addEventListener('pointerleave', soltarBotao);
    botao.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        apertar();
      }
    });
    botao.addEventListener('keyup', soltarBotao);
  }

  /* ---------- Botão giratório com estalos ---------- */

  const giratorio = $('[data-giratorio]');
  const anguloDoDetente = (d) => -135 + (270 / (DETENTES - 1)) * d;
  function girarPara(detente, comSom = true) {
    detente = clamp(detente, 0, DETENTES - 1);
    if (detente === estado.giro && comSom) return;
    const passos = Math.abs(detente - estado.giro);
    estado.giro = detente;
    giratorio.style.setProperty('--giro', `${anguloDoDetente(detente)}deg`);
    giratorio.setAttribute('aria-valuenow', String(detente));
    raiz.querySelectorAll('[data-led-giro]').forEach((led, i) => led.classList.toggle('aceso', i <= detente));
    if (comSom) {
      // Um estalo por detente, mais agudo conforme gira
      for (let k = 0; k < Math.min(passos, 4); k++) {
        setTimeout(() => tocar('chave', { tom: 1.5 + detente * 0.03, volume: 0.35 }, 'tique'), k * 18);
      }
      usar('giratorio');
      progresso.registrar('giratorio:detente', passos);
      salvar();
    }
  }
  let anguloAnterior = null;
  let acumulado = 0;
  giratorio.addEventListener('pointerdown', (e) => {
    capturarPonteiro(giratorio, e.pointerId);
    const caixa = giratorio.getBoundingClientRect();
    anguloAnterior = Math.atan2(e.clientY - (caixa.top + caixa.height / 2), e.clientX - (caixa.left + caixa.width / 2));
    acumulado = 0;
  });
  giratorio.addEventListener('pointermove', (e) => {
    if (anguloAnterior === null) return;
    const caixa = giratorio.getBoundingClientRect();
    const angulo = Math.atan2(e.clientY - (caixa.top + caixa.height / 2), e.clientX - (caixa.left + caixa.width / 2));
    let delta = angulo - anguloAnterior;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    anguloAnterior = angulo;
    acumulado += (delta * 180) / Math.PI;
    const passo = 270 / (DETENTES - 1);
    while (Math.abs(acumulado) >= passo) {
      const sentido = Math.sign(acumulado);
      acumulado -= sentido * passo;
      girarPara(estado.giro + sentido);
    }
  });
  const soltarGiro = () => { anguloAnterior = null; };
  giratorio.addEventListener('pointerup', soltarGiro);
  giratorio.addEventListener('pointercancel', soltarGiro);
  giratorio.addEventListener('wheel', (e) => {
    e.preventDefault();
    girarPara(estado.giro + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });
  giratorio.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') girarPara(estado.giro + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') girarPara(estado.giro - 1);
    else return;
    e.preventDefault();
  });

  /* ---------- Estado inicial ---------- */

  $('[data-luz-modulo]').classList.toggle('modulo--acesa', estado.luz);
  raiz.classList.toggle('painel--acesa', estado.luz);
  $('[data-led-chave]').classList.toggle('led--aceso', estado.chave);
  posicionarDeslizante(estado.deslizante, false);
  girarPara(estado.giro, false);
  raiz.style.setProperty('--c1', '#ffd60a');

  return {
    destruir() {
      /* tudo vive dentro de `raiz`, que é removida */
    },
  };
}
