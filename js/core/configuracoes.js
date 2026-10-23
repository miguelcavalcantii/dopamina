/**
 * Janela de Configurações (botão de engrenagem na barra, em qualquer tela):
 * tema da interface, cor de destaque, pacote de sons e volumes por canal.
 * Tudo é aplicado na hora e salvo no localStorage pelos próprios módulos.
 */
import { icone } from './icones.js?v=202610231820';
import { TEMAS, DESTAQUES_SUGERIDOS } from './preferencias.js?v=202610231820';
import { PACOTES_SOM } from './audio.js?v=202610231820';
import { atualizarDeslizador } from './ui.js?v=202610231820';

const CANAIS = [
  { id: 'geral', nome: 'Geral', icone: 'som', descricao: 'Tudo junto' },
  { id: 'efeitos', nome: 'Efeitos', icone: 'raio', descricao: 'Jogos e interface' },
  { id: 'musica', nome: 'Música', icone: 'musica', descricao: 'Trilhas e ambientes' },
  { id: 'asmr', nome: 'ASMR', icone: 'gota', descricao: 'Gravações reais' },
];

export function criarConfiguracoes({ audio, preferencias }) {
  const janela = document.createElement('dialog');
  janela.className = 'config';
  janela.setAttribute('aria-labelledby', 'config-titulo');
  janela.innerHTML = `
    <div class="config__caixa">
      <header class="config__topo">
        <span class="config__selo">${icone('engrenagem')}</span>
        <h2 id="config-titulo">Configurações</h2>
        <button type="button" class="botao-icone config__fechar" data-fechar aria-label="Fechar configurações">${icone('fechar')}</button>
      </header>

      <section class="config__secao" aria-labelledby="config-temas">
        <h3 id="config-temas">Tema</h3>
        <div class="config__temas" role="group" aria-label="Tema da interface">
          ${TEMAS.map((t) => `
            <button type="button" class="tema-cartao ${t.claro ? 'tema-cartao--claro' : ''}" data-escolher-tema="${t.id}"
              style="--fundo-amostra:${t.fundo};--a1:${t.amostra[0]};--a2:${t.amostra[1]};--a3:${t.amostra[2]}">
              <span class="tema-cartao__previa" aria-hidden="true"><span></span><span></span><span></span></span>
              <span class="tema-cartao__nome">${t.nome}</span>
            </button>`).join('')}
        </div>
      </section>

      <section class="config__secao" aria-labelledby="config-destaque">
        <h3 id="config-destaque">Cor de destaque</h3>
        <p class="config__ajuda">Botões, filtros, foco e controles. Escolha uma sugestão ou qualquer cor.</p>
        <div class="config__cores" role="group" aria-label="Cor de destaque">
          <button type="button" class="chip config__do-tema" data-destaque="">${icone('brilho')}Do tema</button>
          ${DESTAQUES_SUGERIDOS.map((cor) => `<button type="button" class="amostra-cor" data-destaque="${cor}" style="--amostra:${cor}" aria-label="Cor ${cor}"></button>`).join('')}
          <label class="amostra-cor amostra-cor--livre" title="Escolher qualquer cor">
            <input type="color" data-cor-livre aria-label="Escolher qualquer cor">
            ${icone('pincel')}
          </label>
        </div>
      </section>

      <section class="config__secao" aria-labelledby="config-sons">
        <h3 id="config-sons">Sons da interface</h3>
        <p class="config__ajuda">Toque num pacote para ouvir uma prévia.</p>
        <div class="config__pacotes" role="group" aria-label="Pacote de sons">
          ${PACOTES_SOM.map((p) => `
            <button type="button" class="pacote" data-pacote="${p.id}">
              <span class="pacote__nome">${p.nome}</span>
              <span class="pacote__desc">${p.descricao}</span>
            </button>`).join('')}
        </div>
      </section>

      <section class="config__secao" aria-labelledby="config-volumes">
        <div class="config__linha-titulo">
          <h3 id="config-volumes">Volumes</h3>
          <button type="button" class="interruptor" data-mudo role="switch">
            <span class="interruptor__trilho"><span class="interruptor__bolinha"></span></span>
            <span>Silenciar tudo</span>
          </button>
        </div>
        <div class="config__volumes">
          ${CANAIS.map((c) => `
            <label class="volume-canal">
              <span class="volume-canal__icone">${icone(c.icone)}</span>
              <span class="volume-canal__texto"><strong>${c.nome}</strong><small>${c.descricao}</small></span>
              <input type="range" class="deslizador" min="0" max="100" data-canal="${c.id}" aria-label="Volume ${c.nome}">
              <output class="volume-canal__valor" data-valor="${c.id}"></output>
            </label>`).join('')}
        </div>
      </section>

      <footer class="config__rodape">
        <button type="button" class="botao-jogo botao-jogo--secundario" data-restaurar>${icone('voltar')}Restaurar padrão</button>
        <button type="button" class="botao-jogo" data-fechar>${icone('check')}Pronto</button>
      </footer>
    </div>`;
  document.body.append(janela);

  const $$ = (seletor) => janela.querySelectorAll(seletor);
  const corLivre = janela.querySelector('[data-cor-livre]');

  /* ---------- Refletir o estado atual ---------- */

  function atualizar() {
    for (const b of $$('[data-escolher-tema]')) b.setAttribute('aria-pressed', String(b.dataset.escolherTema === preferencias.tema));
    const destaque = preferencias.destaque ?? '';
    let sugerida = false;
    for (const b of $$('[data-destaque]')) {
      const ativa = b.dataset.destaque === destaque;
      sugerida ||= ativa && destaque !== '';
      b.setAttribute('aria-pressed', String(ativa));
    }
    const livre = janela.querySelector('.amostra-cor--livre');
    livre.classList.toggle('amostra-cor--ativa', Boolean(destaque) && !sugerida);
    livre.style.setProperty('--amostra', destaque && !sugerida ? destaque : 'conic-gradient(#ff2e97, #ffd60a, #a3ff12, #22e4ff, #8b5cff, #ff2e97)');
    corLivre.value = destaque || getComputedStyle(document.documentElement).getPropertyValue('--destaque').trim() || '#ff2e97';

    for (const b of $$('[data-pacote]')) b.setAttribute('aria-pressed', String(b.dataset.pacote === audio.pacote));

    for (const entrada of $$('[data-canal]')) {
      const canal = entrada.dataset.canal;
      const valor = canal === 'geral' ? audio.volume : audio.volumeCanal(canal);
      entrada.value = String(Math.round(valor * 100));
      atualizarDeslizador(entrada);
      janela.querySelector(`[data-valor="${canal}"]`).textContent = `${entrada.value}%`;
    }
    const mudo = janela.querySelector('[data-mudo]');
    mudo.setAttribute('aria-checked', String(audio.mudo));
    janela.classList.toggle('config--mudo', audio.mudo);
  }

  /* ---------- Ações ---------- */

  janela.addEventListener('click', (e) => {
    if (e.target === janela) return fechar(); // clique no fundo escurecido

    const tema = e.target.closest('[data-escolher-tema]');
    if (tema) return preferencias.definirTema(tema.dataset.escolherTema);

    const destaque = e.target.closest('[data-destaque]');
    if (destaque) return preferencias.definirDestaque(destaque.dataset.destaque || null);

    const pacote = e.target.closest('[data-pacote]');
    if (pacote) {
      audio.definirPacote(pacote.dataset.pacote);
      audio.previaPacote();
      return undefined;
    }

    if (e.target.closest('[data-mudo]')) {
      audio.alternarMudo();
      if (!audio.mudo) audio.tocar('alternar');
      return undefined;
    }

    if (e.target.closest('[data-restaurar]')) {
      preferencias.definirTema('neon');
      preferencias.definirDestaque(null);
      audio.definirPacote('suave');
      audio.definirVolume(0.7);
      for (const canal of ['efeitos', 'musica', 'asmr']) audio.definirVolumeCanal(canal, 1);
      audio.definirMudo(false);
      return undefined;
    }

    if (e.target.closest('[data-fechar]')) fechar();
    return undefined;
  });

  corLivre.addEventListener('input', () => preferencias.definirDestaque(corLivre.value));

  janela.addEventListener('input', (e) => {
    const entrada = e.target.closest('[data-canal]');
    if (!entrada) return;
    const valor = Number(entrada.value) / 100;
    if (entrada.dataset.canal === 'geral') audio.definirVolume(valor);
    else audio.definirVolumeCanal(entrada.dataset.canal, valor);
    if (audio.mudo && valor > 0) audio.definirMudo(false);
  });

  // Um "plim" ao soltar o controle, para ouvir o novo volume
  janela.addEventListener('change', (e) => {
    const canal = e.target.closest('[data-canal]')?.dataset.canal;
    if (!canal) return;
    if (canal === 'musica') audio.tocar('fase', { nota: 79 });
    else if (canal === 'asmr') audio.tocar('squish', { canal: 'asmr' });
    else audio.tocar('clique');
  });

  preferencias.on('mudou', atualizar);
  audio.aoMudar(atualizar);

  /* ---------- Abrir e fechar ---------- */

  let gatilho = null;

  function abrir() {
    if (janela.open) return;
    gatilho = document.activeElement;
    atualizar();
    janela.showModal();
    janela.classList.remove('config--saindo');
    janela.querySelector('.config__fechar').focus({ preventScroll: true });
  }

  function fechar() {
    if (!janela.open || janela.classList.contains('config--saindo')) return;
    janela.classList.add('config--saindo');
    setTimeout(() => {
      janela.close();
      janela.classList.remove('config--saindo');
      gatilho?.focus?.({ preventScroll: true });
    }, 220);
  }

  // Esc: fecha com a mesma animação (e não deixa o Esc voltar ao hub)
  janela.addEventListener('cancel', (e) => {
    e.preventDefault();
    fechar();
  });

  return {
    abrir,
    fechar,
    get aberta() {
      return janela.open;
    },
  };
}
