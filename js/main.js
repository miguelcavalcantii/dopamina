/**
 * Ponto de entrada: liga o áudio, o progresso, o hub e o roteamento por hash.
 * Rotas: "#/" (hub) e "#/x/<id>" (experiência), com transição em cortina circular.
 */
import { audio } from './core/audio.js?v=202610231621';
import { progresso } from './core/progresso.js?v=202610231621';
import { preferencias } from './core/preferencias.js?v=202610231621';
import { criarConfiguracoes } from './core/configuracoes.js?v=202610231621';
import { aoQuadro } from './core/loop.js?v=202610231621';
import { mostrarToast, ligarControlesSom, ligarChipNivel } from './core/ui.js?v=202610231621';
import { escolher, movimentoReduzido } from './core/util.js?v=202610231621';
import { EXPERIENCIAS, obterExperiencia } from './experiencias/registro.js?v=202610231621';
import { criarHub } from './hub/hub.js?v=202610231621';

const telaHub = document.getElementById('tela-hub');
const telaExperiencia = document.getElementById('tela-experiencia');
const palco = document.getElementById('palco-experiencia');
const tituloExperiencia = document.getElementById('titulo-experiencia');
const cortina = document.querySelector('.cortina');
const tituloCortina = cortina.querySelector('.cortina__titulo');
const TITULO_PADRAO = document.title;
const CORES_HUB = ['#ff2e97', '#8b5cff'];

let atual = null; // { id, instancia }
let origemTransicao = null;
let ultimaSurpresa = null;

progresso.definirDisponiveis(EXPERIENCIAS.filter((e) => e.disponivel).map((e) => e.id));

/* ---------- Áudio: liberado no primeiro gesto ---------- */

const liberarAudio = () => audio.desbloquear();
for (const evento of ['pointerdown', 'keydown', 'touchend']) {
  addEventListener(evento, liberarAudio, { passive: true, capture: true });
}

// Clique sonoro em qualquer botão ou link da interface (brinquedos com som próprio usam data-sem-clique)
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-sem-clique]')) return;
  if (e.target.closest('button:not([aria-disabled="true"]), a[href]')) audio.tocar('clique');
});

ligarControlesSom(audio);
ligarChipNivel(progresso);

const configuracoes = criarConfiguracoes({ audio, preferencias });
document.getElementById('botao-config').addEventListener('click', () => configuracoes.abrir());

/* ---------- Retorno de progresso ---------- */

progresso.on('nivel', ({ nivel }) => {
  audio.tocar('nivel');
  mostrarToast({ titulo: `Nível ${nivel}!`, texto: 'Você subiu de nível. Continua assim!', icone: 'coroa', cor: '#ffd60a' });
});
progresso.on('conquista', (c) => {
  audio.tocar('conquista');
  mostrarToast({ titulo: 'Conquista desbloqueada', texto: `${c.nome}: ${c.descricao}`, icone: c.icone, cor: c.cor, duracao: 4500 });
});
progresso.on('missao', (m) => {
  audio.tocar('missao');
  mostrarToast({ titulo: 'Missão concluída', texto: `${m.texto} · +${m.xp} XP`, icone: 'check', cor: '#a3ff12' });
});

// Tempo de diversão: conta a cada 5 s enquanto uma experiência está aberta e visível
setInterval(() => {
  if (!atual || document.hidden) return;
  progresso.registrar('tempo', 5);
  progresso.registrar(`tempo:${atual.id}`, 5);
}, 5000);

/* ---------- Hub ---------- */

const hub = criarHub({
  progresso,
  audio,
  preferencias,
  aoEscolher(id, origem) {
    origemTransicao = origem;
    location.hash = `#/x/${id}`;
  },
  aoSurpresa(origem) {
    const disponiveis = EXPERIENCIAS.filter((e) => e.disponivel);
    const opcoes = disponiveis.length > 1 ? disponiveis.filter((e) => e.id !== ultimaSurpresa) : disponiveis;
    const sorteada = escolher(opcoes);
    ultimaSurpresa = sorteada.id;
    origemTransicao = origem;
    location.hash = `#/x/${sorteada.id}?surpresa=${Date.now().toString(36)}`;
  },
});

/* ---------- Transições ---------- */

async function cobrir(cores, titulo) {
  const x = origemTransicao?.x ?? innerWidth / 2;
  const y = origemTransicao?.y ?? innerHeight / 2;
  origemTransicao = null;
  cortina.style.setProperty('--c1', cores[0]);
  cortina.style.setProperty('--c2', cores[1]);
  cortina.style.setProperty('--x', `${x}px`);
  cortina.style.setProperty('--y', `${y}px`);
  tituloCortina.textContent = titulo;
  cortina.getAnimations().forEach((a) => a.cancel());
  cortina.classList.add('cortina--ativa');

  if (movimentoReduzido()) {
    await cortina.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' }).finished;
    return;
  }
  const raio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  tituloCortina.animate(
    [{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 420, delay: 160, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'both' },
  );
  await cortina.animate(
    [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${raio}px at ${x}px ${y}px)` }],
    { duration: 540, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' },
  ).finished;
}

async function revelar() {
  const animacao = cortina.animate(
    [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.08)' }],
    { duration: movimentoReduzido() ? 160 : 460, easing: 'ease-out', fill: 'forwards' },
  );
  await animacao.finished;
  cortina.classList.remove('cortina--ativa');
  cortina.getAnimations().forEach((a) => a.cancel());
  tituloCortina.getAnimations().forEach((a) => a.cancel());
}

/* ---------- Telas ---------- */

function desmontarAtual() {
  if (!atual) return;
  try {
    atual.instancia?.destruir?.();
  } catch (erro) {
    console.error('Erro ao desmontar experiência:', erro);
  }
  palco.replaceChildren();
  atual = null;
}

function mostrarHubImediato() {
  telaExperiencia.hidden = true;
  telaHub.hidden = false;
  document.body.dataset.tela = 'hub';
  document.title = TITULO_PADRAO;
  hub.mostrar();
}

async function abrirExperiencia(definicao, params) {
  audio.tocar('whoosh');
  await cobrir(definicao.cores, definicao.nome);
  desmontarAtual();
  hub.ocultar();
  telaHub.hidden = true;
  telaExperiencia.hidden = false;
  document.body.dataset.tela = 'experiencia';
  document.body.style.setProperty('--cor-experiencia', definicao.cores[0]);
  tituloExperiencia.textContent = definicao.nome;
  document.title = `${definicao.nome} · Dopamina`;

  const raiz = document.createElement('div');
  raiz.className = 'experiencia__raiz';
  raiz.style.setProperty('--c1', definicao.cores[0]);
  raiz.style.setProperty('--c2', definicao.cores[1]);
  palco.append(raiz);
  try {
    const modulo = await definicao.carregar();
    const instancia = await modulo.montar(raiz, { audio, progresso, aoQuadro, params, definicao });
    atual = { id: definicao.id, instancia };
    progresso.registrar('experiencia:abrir', 1, definicao.id);
    progresso.registrar('secao:visitada', 0, definicao.categoria);
  } catch (erro) {
    console.error(erro);
    palco.replaceChildren();
    mostrarToast({ titulo: 'Ops!', texto: 'Não deu para abrir essa experiência agora.', icone: 'relogio', cor: '#ff7a18' });
    history.replaceState(null, '', '#/');
    mostrarHubImediato();
  }
  await revelar();
  (palco.querySelector('[data-foco-inicial]') ?? palco).focus({ preventScroll: true });
}

async function abrirHub() {
  const idAnterior = atual?.id;
  const definicao = obterExperiencia(idAnterior);
  audio.tocar('whoosh', { descendo: true });
  await cobrir(definicao?.cores ?? CORES_HUB, 'Dopamina');
  desmontarAtual();
  mostrarHubImediato();
  await revelar();
  if (idAnterior) hub.focarCard(idAnterior);
}

/* ---------- Roteamento ---------- */

function lerRota() {
  const [caminho, consulta = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const partes = caminho.split('/').filter(Boolean);
  if (partes[0] === 'x' && partes[1]) {
    return { tipo: 'experiencia', id: partes[1], params: new URLSearchParams(consulta) };
  }
  return { tipo: 'hub' };
}

async function navegar(rota, { inicial = false } = {}) {
  if (rota.tipo === 'experiencia') {
    const definicao = obterExperiencia(rota.id);
    if (definicao?.disponivel) return abrirExperiencia(definicao, rota.params);
    mostrarToast({
      titulo: 'Em breve',
      texto: definicao ? `${definicao.nome} chega numa próxima etapa.` : 'Essa experiência não existe.',
      icone: 'relogio',
      cor: '#ffd60a',
    });
    history.replaceState(null, '', '#/');
  }
  if (atual) return abrirHub();
  if (inicial) mostrarHubImediato();
}

// Navegações em fila: nunca duas transições ao mesmo tempo
let fila = Promise.resolve();
const agendarNavegacao = (opcoes) => {
  fila = fila.then(() => navegar(lerRota(), opcoes)).catch((erro) => console.error(erro));
};

addEventListener('hashchange', () => agendarNavegacao());

addEventListener('keydown', (e) => {
  // Esc volta ao hub (em tela cheia, o próprio navegador usa o Esc para sair dela)
  if (e.key === 'Escape' && atual && !document.fullscreenElement && !configuracoes.aberta) location.hash = '#/';
});

if (lerRota().tipo === 'experiencia') hub.ocultar();
agendarNavegacao({ inicial: true });
