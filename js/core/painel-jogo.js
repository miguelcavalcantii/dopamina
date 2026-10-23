/**
 * Painel central de início e de resumo, compartilhado pelos jogos.
 * Usa as classes .painel-jogo e .botao-jogo de css/experiencia.css.
 */
import { icone } from './icones.js';

export function criarPainelJogo(raiz) {
  const elemento = document.createElement('div');
  elemento.className = 'painel-jogo';
  elemento.hidden = true;
  raiz.append(elemento);

  function mostrar(html, aoComecar) {
    elemento.innerHTML = html;
    elemento.hidden = false;
    elemento.classList.remove('painel-jogo--entrar');
    void elemento.offsetWidth;
    elemento.classList.add('painel-jogo--entrar');
    const botao = elemento.querySelector('[data-comecar]');
    botao?.addEventListener('click', aoComecar);
    botao?.focus({ preventScroll: true });
  }

  return {
    elemento,

    /** regras: lista de [ícone, texto]. extra: HTML livre (ex.: seletor de opções). */
    inicio({ titulo, texto, regras = [], recorde, extra = '', rotuloBotao = 'Começar' }, aoComecar) {
      mostrar(`
        <h2 class="painel-jogo__titulo">${titulo}</h2>
        <p class="painel-jogo__texto">${texto}</p>
        ${regras.length ? `<ul class="painel-jogo__regras">${regras.map(([nome, frase]) => `<li>${icone(nome)}<span>${frase}</span></li>`).join('')}</ul>` : ''}
        ${extra}
        ${recorde ? `<p class="painel-jogo__selo">${icone('trofeu')}${recorde}</p>` : ''}
        <button type="button" class="botao-jogo" data-comecar data-foco-inicial>${icone('jogar')}${rotuloBotao}</button>`, aoComecar);
    },

    /** estatisticas: lista de [rótulo, valor]. */
    resumo({ selo, titulo, estatisticas = [], rotuloBotao = 'Jogar de novo' }, aoComecar) {
      mostrar(`
        <p class="painel-jogo__selo">${selo}</p>
        <h2 class="painel-jogo__titulo">${titulo}</h2>
        <dl class="painel-jogo__estatisticas">${estatisticas.map(([rotulo, valor]) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`).join('')}</dl>
        <div class="painel-jogo__acoes">
          <button type="button" class="botao-jogo" data-comecar>${icone('jogar')}${rotuloBotao}</button>
          <a class="botao-jogo botao-jogo--secundario" href="#/">${icone('voltar')}Hub</a>
        </div>`, aoComecar);
    },

    esconder() {
      elemento.hidden = true;
    },

    get visivel() {
      return !elemento.hidden;
    },
  };
}
