/**
 * Peças comuns das experiências de ASMR: volume próprio de cada experiência (salvo)
 * e o modo "Só a tela", que esconde a barra e os controles para ficar só a cena.
 * No modo tela, um olhinho discreto no canto (ou o Esc) traz a interface de volta.
 */
import { icone } from './icones.js?v=202610231820';
import { ler, gravar } from './armazenamento.js?v=202610231820';
import { atualizarDeslizador } from './ui.js?v=202610231820';

/** Linha de doca com o volume desta experiência e o botão de esconder a interface. */
export function htmlControlesAsmr(volume) {
  return `
    <div class="doca__linha">
      <span class="doca__rotulo">VOLUME</span>
      <label class="doca__ajuste">
        ${icone('som')}
        <input type="range" class="deslizador" min="0" max="100" value="${Math.round(volume * 100)}" data-volume-asmr aria-label="Volume desta experiência">
      </label>
      <button type="button" class="chip" data-so-tela>${icone('olhoFechado')}<span>Só a tela</span></button>
    </div>`;
}

/**
 * Liga os controles. `chave` identifica a experiência no armazenamento.
 * `aoMudarVolume(v)` recebe o volume (0 a 1) sempre que muda.
 */
export function ligarControlesAsmr(raiz, { chave, aoMudarVolume }) {
  const salvo = ler('asmr-volumes', {});
  let volume = salvo[chave] ?? 0.8;

  const entrada = raiz.querySelector('[data-volume-asmr]');
  entrada.value = String(Math.round(volume * 100));
  atualizarDeslizador(entrada);
  entrada.addEventListener('input', () => {
    volume = Number(entrada.value) / 100;
    aoMudarVolume?.(volume);
    gravar('asmr-volumes', { ...ler('asmr-volumes', {}), [chave]: volume });
  });

  // Olhinho para sair do modo tela
  const mostrar = document.createElement('button');
  mostrar.type = 'button';
  mostrar.className = 'asmr__mostrar';
  mostrar.hidden = true;
  mostrar.setAttribute('aria-label', 'Mostrar os controles');
  mostrar.innerHTML = icone('olho');
  raiz.append(mostrar);

  function alternar(zen) {
    raiz.classList.toggle('asmr--zen', zen);
    document.body.classList.toggle('modo-zen', zen);
    mostrar.hidden = !zen;
    if (zen) mostrar.focus({ preventScroll: true });
  }

  raiz.querySelector('[data-so-tela]').addEventListener('click', () => alternar(true));
  mostrar.addEventListener('click', () => alternar(false));

  // Esc no modo tela só traz a interface de volta (não volta ao hub)
  const aoTeclar = (e) => {
    if (e.key === 'Escape' && raiz.classList.contains('asmr--zen')) {
      e.stopPropagation();
      e.preventDefault();
      alternar(false);
    }
  };
  addEventListener('keydown', aoTeclar, true);

  aoMudarVolume?.(volume);

  return {
    get volume() {
      return volume;
    },
    destruir() {
      removeEventListener('keydown', aoTeclar, true);
      document.body.classList.remove('modo-zen');
    },
  };
}
