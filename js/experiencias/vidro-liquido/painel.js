/**
 * Doca de controles do Vidro Líquido: temas, modos, intensidade,
 * música, tela cheia e botão para esconder tudo.
 */
import { icone } from '../../core/icones.js?v=202610231621';
import { atualizarDeslizador } from '../../core/ui.js?v=202610231621';

export function criarPainel(raiz, { temas, modos, config, podeTelaCheia, aoTema, aoModo, aoIntensidade, aoMusica, aoTelaCheia }) {
  const doca = document.createElement('div');
  doca.className = 'doca vidro-fosco';
  doca.setAttribute('role', 'region');
  doca.setAttribute('aria-label', 'Controles do Vidro Líquido');
  doca.innerHTML = `
    <div class="doca__linha" role="group" aria-label="Tema">
      <span class="doca__rotulo">TEMA</span>
      ${temas.map((t, i) => `<button type="button" class="amostra-tema" data-tema="${t.id}"
        style="--amostra:${t.amostra};--brilho:${t.cores[0]}" aria-pressed="false"
        aria-label="${t.nome} (tecla ${i + 1})" title="${t.nome}"></button>`).join('')}
      <span class="doca__nome" data-nome-tema aria-hidden="true"></span>
    </div>
    <div class="doca__linha" role="group" aria-label="Modo">
      <span class="doca__rotulo">MODO</span>
      ${modos.map((m) => `<button type="button" class="chip" data-modo="${m.id}" aria-pressed="false">${icone(m.icone)}<span>${m.nome}</span></button>`).join('')}
    </div>
    <div class="doca__linha">
      <label class="doca__ajuste">
        <span class="doca__rotulo">FORÇA</span>
        <input type="range" class="deslizador" min="0" max="100" value="${config.intensidade}" data-intensidade aria-label="Intensidade das ondas">
      </label>
      <button type="button" class="chip" data-musica aria-pressed="false">${icone('musica')}<span>Música</span></button>
      ${podeTelaCheia ? `<button type="button" class="chip" data-tela-cheia aria-pressed="false" title="Tela cheia (F)">${icone('telaCheia')}<span>Tela cheia</span></button>` : ''}
      <button type="button" class="chip" data-ocultar title="Esconder controles (H)">${icone('ocultar')}<span>Esconder</span></button>
    </div>`;

  const botaoMostrar = document.createElement('button');
  botaoMostrar.type = 'button';
  botaoMostrar.className = 'botao-flutuante vidro-fosco';
  botaoMostrar.hidden = true;
  botaoMostrar.innerHTML = `${icone('mostrar')}<span>Controles</span>`;
  raiz.append(doca, botaoMostrar);

  const deslizador = doca.querySelector('[data-intensidade]');
  atualizarDeslizador(deslizador);
  deslizador.addEventListener('input', () => aoIntensidade(Number(deslizador.value)));

  doca.addEventListener('click', (e) => {
    const alvo = e.target.closest('button');
    if (!alvo) return;
    if (alvo.dataset.tema) aoTema(alvo.dataset.tema);
    else if (alvo.dataset.modo) aoModo(alvo.dataset.modo);
    else if ('musica' in alvo.dataset) aoMusica();
    else if ('telaCheia' in alvo.dataset) aoTelaCheia();
    else if ('ocultar' in alvo.dataset) alternar();
  });
  botaoMostrar.addEventListener('click', () => alternar());

  function alternar() {
    const ocultar = !doca.classList.contains('doca--oculta');
    doca.classList.toggle('doca--oculta', ocultar);
    doca.inert = ocultar;
    botaoMostrar.hidden = !ocultar;
    if (ocultar) botaoMostrar.focus({ preventScroll: true });
    else doca.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  const marcar = (seletor, atributo, valor) => {
    for (const botao of doca.querySelectorAll(seletor)) {
      botao.setAttribute('aria-pressed', String(botao.dataset[atributo] === valor));
    }
  };

  return {
    alternar,
    marcarTema(id, nome) {
      marcar('[data-tema]', 'tema', id);
      doca.querySelector('[data-nome-tema]').textContent = nome;
    },
    marcarModo(id) {
      marcar('[data-modo]', 'modo', id);
    },
    marcarMusica(ligada) {
      doca.querySelector('[data-musica]').setAttribute('aria-pressed', String(ligada));
    },
    marcarTelaCheia(ativa) {
      const botao = doca.querySelector('[data-tela-cheia]');
      if (!botao) return;
      botao.setAttribute('aria-pressed', String(ativa));
      botao.innerHTML = `${icone(ativa ? 'sairTelaCheia' : 'telaCheia')}<span>${ativa ? 'Sair' : 'Tela cheia'}</span>`;
    },
  };
}
