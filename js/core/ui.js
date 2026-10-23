/**
 * Peças de interface compartilhadas: avisos (toasts), controles de som,
 * selo de nível na barra e preenchimento dos controles deslizantes.
 */
import { icone } from './icones.js';

const pilhaToasts = document.getElementById('toasts');
const MAX_TOASTS = 3;

/** Mostra um aviso curto no topo da tela. */
export function mostrarToast({ titulo, texto = '', icone: nomeIcone = 'estrela', cor = '#ffd60a', duracao = 3800 }) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.setProperty('--cor', cor);
  toast.innerHTML = `<span class="toast__icone">${icone(nomeIcone)}</span><div><strong class="toast__titulo"></strong><p class="toast__texto"></p></div>`;
  toast.querySelector('.toast__titulo').textContent = titulo;
  toast.querySelector('.toast__texto').textContent = texto;
  pilhaToasts.append(toast);
  while (pilhaToasts.children.length > MAX_TOASTS) pilhaToasts.firstElementChild.remove();

  requestAnimationFrame(() => toast.classList.add('toast--visivel'));
  setTimeout(() => {
    toast.classList.remove('toast--visivel');
    setTimeout(() => toast.remove(), 500);
  }, duracao);
}

/** Liga o botão de mudo e o volume geral da barra superior. */
export function ligarControlesSom(audio) {
  const botao = document.getElementById('botao-mudo');
  const volume = document.getElementById('volume');

  const atualizar = () => {
    botao.innerHTML = icone(audio.mudo ? 'mudo' : 'som');
    botao.setAttribute('aria-pressed', String(audio.mudo));
    botao.setAttribute('aria-label', audio.mudo ? 'Ativar som' : 'Silenciar');
    botao.title = audio.mudo ? 'Ativar som' : 'Silenciar';
    volume.value = String(Math.round(audio.volume * 100));
    atualizarDeslizador(volume);
  };

  botao.addEventListener('click', () => audio.alternarMudo());
  volume.addEventListener('input', () => {
    audio.definirVolume(Number(volume.value) / 100);
    if (audio.mudo && Number(volume.value) > 0) audio.definirMudo(false);
  });
  audio.aoMudar(atualizar);
  atualizar();
}

/** Selo "LV" na barra superior, visível dentro das experiências. */
export function ligarChipNivel(progresso) {
  const chip = document.getElementById('chip-nivel');
  const rotulo = chip.querySelector('[data-lv]');

  const atualizar = (ganhou) => {
    const info = progresso.infoNivel();
    rotulo.textContent = `LV ${info.nivel}`;
    chip.style.setProperty('--p', `${(info.fracao * 100).toFixed(1)}%`);
    chip.title = `${Math.floor(info.xpNoNivel)} de ${info.necessario} XP para o próximo nível`;
    if (ganhou) {
      chip.classList.remove('chip-nivel--ganho');
      void chip.offsetWidth; // reinicia a animação
      chip.classList.add('chip-nivel--ganho');
    }
  };

  progresso.on('xp', () => atualizar(true));
  atualizar(false);
}

/** Pinta a parte preenchida dos <input type="range" class="deslizador">. */
export function atualizarDeslizador(entrada) {
  const minimo = Number(entrada.min || 0);
  const maximo = Number(entrada.max || 100);
  const p = ((Number(entrada.value) - minimo) / (maximo - minimo)) * 100;
  entrada.style.setProperty('--p', `${p}%`);
}

document.addEventListener('input', (evento) => {
  if (evento.target.matches?.('input.deslizador')) atualizarDeslizador(evento.target);
});
