/**
 * Vidro Líquido: a tela inteira vira uma lâmina d'água com refração.
 * Este módulo junta simulação, renderização, efeitos 2D, entrada (mouse/toque/teclado),
 * sons e o painel de controles.
 */
import { TEMAS } from './temas.js?v=202610231621';
import { CampoDeOndas, CampoDeTinta } from './simulacao.js?v=202610231621';
import { RenderizadorGL } from './renderizador-gl.js?v=202610231621';
import { RenderizadorCPU } from './renderizador-cpu.js?v=202610231621';
import { CamadaEfeitos } from './efeitos.js?v=202610231621';
import { criarPainel } from './painel.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { aleatorio, carregarEstilo, clamp, escolher, hexParaRgb, movimentoReduzido, perfilLeve } from '../../core/util.js?v=202610231621';

const MODOS = [
  { id: 'livre', nome: 'Livre', icone: 'onda', dica: 'Arraste para criar ondas', detalhe: 'Clique ou toque para soltar uma gota grande', amortecimento: 0.986 },
  { id: 'chuva', nome: 'Chuva', icone: 'chuva', dica: 'Está chovendo', detalhe: 'Brinque na água junto com a chuva', amortecimento: 0.984 },
  { id: 'tinta', nome: 'Tinta', icone: 'pincel', dica: 'Pinte a água', detalhe: 'Arraste para soltar tinta e misturar as cores', amortecimento: 0.986 },
  { id: 'bolhas', nome: 'Bolhas', icone: 'bolha', dica: 'Estoure as bolhas', detalhe: 'Estouros seguidos fazem combo', amortecimento: 0.986 },
  { id: 'redemoinho', nome: 'Redemoinho', icone: 'espiral', dica: 'Segure para girar', detalhe: 'Quanto mais tempo segurar, mais forte fica', amortecimento: 0.988 },
  { id: 'acalmar', nome: 'Acalmar', icone: 'lua', dica: 'Só respire', detalhe: 'A água se move sozinha, bem devagar', amortecimento: 0.994 },
];

const CONFIG_PADRAO = { tema: 'piscina', modo: 'livre', intensidade: 60 };
const PASSO_FISICA = 1 / 60;
const MAX_BOLHAS = 26;

export async function montar(raiz, { audio, progresso, aoQuadro, params }) {
  await carregarEstilo(new URL('../../../css/experiencias/vidro-liquido.css?v=202610231621', import.meta.url));

  const config = { ...CONFIG_PADRAO, ...ler('vidro-config', {}) };
  const surpresa = params?.has('surpresa');
  if (surpresa) {
    config.tema = escolher(TEMAS.filter((t) => t.id !== config.tema)).id;
    config.modo = escolher(MODOS.filter((m) => m.id !== 'livre')).id;
  }
  const salvarConfig = () => gravar('vidro-config', { tema: config.tema, modo: config.modo, intensidade: config.intensidade });

  /* ---------- Estrutura ---------- */

  raiz.classList.add('vidro');
  raiz.innerHTML = `
    <div class="vidro__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Água interativa. Arraste para criar ondas e clique para soltar gotas. Atalhos: espaço solta uma gota, T troca o tema, M troca o modo, F tela cheia, H esconde os controles.">
      <canvas class="vidro__agua"></canvas>
      <canvas class="vidro__efeitos"></canvas>
    </div>
    <p class="vidro__dica" aria-live="polite"><span data-dica-titulo></span><small data-dica-detalhe></small></p>`;

  const palco = raiz.querySelector('.vidro__palco');
  let canvasAgua = raiz.querySelector('.vidro__agua');
  const canvasEfeitos = raiz.querySelector('.vidro__efeitos');
  const dica = raiz.querySelector('.vidro__dica');

  let renderizador;
  try {
    renderizador = new RenderizadorGL(canvasAgua);
  } catch (erro) {
    console.warn('Vidro Líquido: usando renderização em CPU.', erro);
    const novo = canvasAgua.cloneNode();
    canvasAgua.replaceWith(novo);
    canvasAgua = novo;
    renderizador = new RenderizadorCPU(canvasAgua);
  }

  const ondas = new CampoDeOndas();
  const tinta = new CampoDeTinta();
  const efeitos = new CamadaEfeitos(canvasEfeitos);
  const canvasFundo = document.createElement('canvas');
  const tela = { largura: 1, altura: 1, celula: 4 };

  let tema = TEMAS[0];
  let uniformesTema = null;
  let mistura = 1;
  let tempo = 0;
  let musicaLigada = false;
  let musicaAutomatica = false;
  let primeiraInteracao = false;

  const intensidade = () => 0.3 + (config.intensidade / 100) * 1.2;
  const fatorModo = () => (config.modo === 'acalmar' ? 0.5 : 1);
  const pan = (x) => clamp((x / tela.largura) * 2 - 1, -1, 1) * 0.8;

  /* ---------- Tamanho e fundo ---------- */

  function redimensionar() {
    const caixa = palco.getBoundingClientRect();
    if (caixa.width < 2 || caixa.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, perfilLeve ? 1.25 : 1.75);
    tela.largura = caixa.width;
    tela.altura = caixa.height;
    canvasAgua.width = Math.round(caixa.width * dpr);
    canvasAgua.height = Math.round(caixa.height * dpr);

    // Resolução da simulação: ~85 mil células (menos em aparelhos leves)
    const alvo = perfilLeve ? 55000 : 85000;
    tela.celula = clamp(Math.sqrt((caixa.width * caixa.height) / alvo), 2.5, 9);
    const colunas = Math.max(16, Math.round(caixa.width / tela.celula));
    const linhas = Math.max(16, Math.round(caixa.height / tela.celula));
    ondas.redimensionar(colunas, linhas);
    tinta.redimensionar(Math.ceil(colunas / 2), Math.ceil(linhas / 2));
    efeitos.redimensionar(caixa.width, caixa.height);
    pintarFundo(false);
  }

  function pintarFundo(transicao) {
    const maior = Math.max(canvasAgua.width, canvasAgua.height);
    const escala = Math.min(1, 2048 / maior);
    canvasFundo.width = Math.max(2, Math.round(canvasAgua.width * escala));
    canvasFundo.height = Math.max(2, Math.round(canvasAgua.height * escala));
    tema.desenhar(canvasFundo.getContext('2d'), canvasFundo.width, canvasFundo.height);
    renderizador.definirFundo(canvasFundo, transicao);
    mistura = transicao ? 0 : 1;
  }

  let redimensionamentoPendente = 0;
  const observador = new ResizeObserver(() => {
    cancelAnimationFrame(redimensionamentoPendente);
    redimensionamentoPendente = requestAnimationFrame(redimensionar);
  });
  observador.observe(palco);

  canvasAgua.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvasAgua.addEventListener('webglcontextrestored', () => {
    renderizador = new RenderizadorGL(canvasAgua);
    pintarFundo(false);
  });

  /* ---------- Dicas na tela ---------- */

  let timerDica = 0;
  function mostrarDica(titulo, detalhe, duracao = 2600) {
    dica.querySelector('[data-dica-titulo]').textContent = titulo;
    dica.querySelector('[data-dica-detalhe]').textContent = detalhe;
    dica.classList.remove('vidro__dica--oculta');
    clearTimeout(timerDica);
    timerDica = setTimeout(() => dica.classList.add('vidro__dica--oculta'), duracao);
  }

  /* ---------- Ações na água ---------- */

  const emCelulas = (px) => px / tela.celula;

  function soltarGota(x, y, escala = 1) {
    const forca = 3.2 * escala * intensidade() * fatorModo();
    ondas.perturbar(emCelulas(x), emCelulas(y), Math.max(3, emCelulas(26 * escala)), forca);
    tinta.empurrarRadial(emCelulas(x) / 2, emCelulas(y) / 2, emCelulas(60 * escala) / 2, 0.6 * escala);
    efeitos.respingo(x, y, tema.respingo, Math.round(9 * escala), Math.min(1.4, escala));
    audio.tocar('gotaGrande', { tom: aleatorio(0.85, 1.2) / Math.sqrt(escala), pan: pan(x) });
    progresso.registrar('vidro:gota-grande');
  }

  function depositarTinta(ponteiro, x, y, dx, dy) {
    // A cor caminha pela paleta do tema conforme o traço avança
    ponteiro.distanciaCor = (ponteiro.distanciaCor ?? 0) + Math.hypot(dx, dy);
    const paleta = uniformesTema.paletaTinta;
    const posicao = ponteiro.indiceCor + ponteiro.distanciaCor / 260;
    const a = paleta[Math.floor(posicao) % paleta.length];
    const b = paleta[(Math.floor(posicao) + 1) % paleta.length];
    const f = posicao % 1;
    const cor = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    const celulaTinta = tela.celula * 2;
    tinta.depositar(x / celulaTinta, y / celulaTinta, Math.max(1.6, 18 / celulaTinta), cor, 0.55, (dx / celulaTinta) * 0.12, (dy / celulaTinta) * 0.12);
  }

  /** Estoura bolhas perto do ponto, com combo para estouros seguidos. */
  const combo = { quantidade: 0, ultimo: 0 };
  function estourarEm(x, y, folga) {
    const estouradas = efeitos.estourarEm(x, y, folga);
    for (const bolha of estouradas) {
      const agora = performance.now();
      combo.quantidade = agora - combo.ultimo < 750 ? combo.quantidade + 1 : 1;
      combo.ultimo = agora;
      audio.tocar('estouro', { tamanho: bolha.r / 46, pan: pan(bolha.x), intervaloMin: 0.01 });
      ondas.perturbar(emCelulas(bolha.x), emCelulas(bolha.y), emCelulas(bolha.r * 0.8), 1.4 * intensidade());
      progresso.registrar('vidro:bolha');
      if (combo.quantidade >= 3) {
        audio.tocar('combo', { n: combo.quantidade - 2, intervaloMin: 0.01 });
        efeitos.textoFlutuante(bolha.x, bolha.y - bolha.r, `COMBO x${combo.quantidade}`, escolher(tema.tinta));
        progresso.definirRecorde('vidro-liquido', 'combo', combo.quantidade);
      }
    }
    return estouradas.length > 0;
  }

  /* ---------- Redemoinho ---------- */

  const giro = { ativo: false, ponteiro: null, x: 0, y: 0, forca: 0, angulo: 0, inicio: 0, contado: false, zumbido: null };

  function iniciarRedemoinho(ponteiro) {
    Object.assign(giro, { ativo: true, ponteiro, x: ponteiro.x, y: ponteiro.y, inicio: performance.now(), contado: false });
    giro.zumbido = audio.iniciarZumbido();
  }

  function soltarRedemoinho() {
    if (!giro.ativo) return;
    giro.ativo = false;
    giro.zumbido?.parar();
    giro.zumbido = null;
    const segurou = performance.now() - giro.inicio;
    soltarGota(giro.x, giro.y, segurou < 250 ? 1 : 0.8 + giro.forca * 0.9);
  }

  function atualizarRedemoinho(dt) {
    if (giro.ativo) {
      giro.x += (giro.ponteiro.x - giro.x) * Math.min(1, dt * 8);
      giro.y += (giro.ponteiro.y - giro.y) * Math.min(1, dt * 8);
      giro.forca = Math.min(1, giro.forca + dt * 0.7);
      giro.angulo += dt * (4 + giro.forca * 8);
      const raio = 18 + giro.forca * 42;
      for (let k = 0; k < 3; k++) {
        const ang = giro.angulo + (k / 3) * Math.PI * 2;
        ondas.perturbar(emCelulas(giro.x + Math.cos(ang) * raio), emCelulas(giro.y + Math.sin(ang) * raio), 2.5, 0.35 * giro.forca * intensidade());
      }
      giro.zumbido?.atualizar(giro.forca);
      if (!giro.contado && performance.now() - giro.inicio > 1000) {
        giro.contado = true;
        progresso.registrar('vidro:redemoinho');
      }
    } else {
      giro.forca = Math.max(0, giro.forca - dt * 0.9);
    }
  }

  /* ---------- Entrada: mouse, toque e caneta ---------- */

  const ponteiros = new Map();
  let indiceCorTinta = 0;
  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  function marcarPrimeiraInteracao() {
    if (primeiraInteracao) return;
    primeiraInteracao = true;
    dica.classList.add('vidro__dica--oculta');
  }

  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    palco.setPointerCapture?.(e.pointerId);
    const { x, y } = posicao(e);
    const ponteiro = { x, y, pressionado: true, toque: e.pointerType !== 'mouse', distanciaSom: 0, indiceCor: indiceCorTinta++ };
    ponteiros.set(e.pointerId, ponteiro);
    marcarPrimeiraInteracao();

    if (config.modo === 'bolhas' && estourarEm(x, y, ponteiro.toque ? 18 : 6)) return;
    if (config.modo === 'redemoinho') {
      iniciarRedemoinho(ponteiro);
      return;
    }
    if (config.modo === 'tinta') {
      for (let i = 0; i < 3; i++) depositarTinta(ponteiro, x, y, aleatorio(-20, 20), aleatorio(-20, 20));
    }
    soltarGota(x, y, 1);
  });

  palco.addEventListener('pointermove', (e) => {
    const { x, y } = posicao(e);
    let ponteiro = ponteiros.get(e.pointerId);
    if (!ponteiro) {
      // Mouse passando sem clicar também mexe na água
      if (e.pointerType !== 'mouse') return;
      ponteiro = { x, y, pressionado: false, toque: false, distanciaSom: 0, indiceCor: 0 };
      ponteiros.set(e.pointerId, ponteiro);
      return;
    }
    mover(ponteiro, x, y);
    ponteiro.x = x;
    ponteiro.y = y;
  });

  const soltar = (e) => {
    const ponteiro = ponteiros.get(e.pointerId);
    if (!ponteiro) return;
    if (ponteiro.pressionado && giro.ativo && giro.ponteiro === ponteiro) soltarRedemoinho();
    if (e.pointerType === 'mouse' && e.type === 'pointerup') ponteiro.pressionado = false;
    else ponteiros.delete(e.pointerId);
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);
  palco.addEventListener('pointerleave', soltar);

  function mover(ponteiro, x, y) {
    const dx = x - ponteiro.x;
    const dy = y - ponteiro.y;
    const distancia = Math.hypot(dx, dy);
    if (distancia < 0.5) return;

    // Rastro: pequenas perturbações ao longo do segmento (sem buracos em gestos rápidos)
    const passos = Math.min(40, Math.ceil(distancia / (tela.celula * 1.5)));
    const forca = (ponteiro.pressionado ? 0.55 : 0.28) * intensidade() * fatorModo();
    const raio = ponteiro.pressionado ? 3.8 : 3;
    for (let i = 1; i <= passos; i++) {
      const t = i / passos;
      ondas.perturbar(emCelulas(ponteiro.x + dx * t), emCelulas(ponteiro.y + dy * t), raio, forca);
    }
    if (!ponteiro.pressionado) return;

    if (config.modo === 'tinta') {
      const passosTinta = Math.max(1, Math.ceil(distancia / 10));
      for (let i = 1; i <= passosTinta; i++) {
        const t = i / passosTinta;
        depositarTinta(ponteiro, ponteiro.x + dx * t, ponteiro.y + dy * t, dx / passosTinta, dy / passosTinta);
      }
    }
    if (config.modo === 'bolhas') estourarEm(x, y, ponteiro.toque ? 18 : 6);

    // Gotinhas sonoras enquanto arrasta (com moderação)
    ponteiro.distanciaSom += distancia;
    if (ponteiro.distanciaSom > 110 && config.modo !== 'redemoinho') {
      ponteiro.distanciaSom = 0;
      audio.tocar('gota', { tom: aleatorio(0.8, 1.5), volume: config.modo === 'tinta' ? 0.25 : 0.4, pan: pan(x), intervaloMin: 0.07 });
    }
  }

  /* ---------- Teclado ---------- */

  raiz.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches('input')) return;
    const tecla = e.key.toLowerCase();
    if ((tecla === ' ' || tecla === 'enter') && e.target === palco) {
      e.preventDefault();
      marcarPrimeiraInteracao();
      soltarGota(aleatorio(0.2, 0.8) * tela.largura, aleatorio(0.25, 0.7) * tela.altura, aleatorio(0.8, 1.3));
    } else if (tecla === 't') {
      aplicarTema(TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length].id);
    } else if (tecla === 'm') {
      const atual = MODOS.findIndex((m) => m.id === config.modo);
      aplicarModo(MODOS[(atual + 1) % MODOS.length].id);
    } else if (tecla === 'f') {
      alternarTelaCheia();
    } else if (tecla === 'h') {
      painel.alternar();
    } else if (/^[1-5]$/.test(tecla)) {
      aplicarTema(TEMAS[Number(tecla) - 1].id);
    }
  });

  /* ---------- Temas, modos, música e tela cheia ---------- */

  const podeTelaCheia = Boolean(document.documentElement.requestFullscreen);

  function alternarTelaCheia() {
    if (!podeTelaCheia) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  const aoMudarTelaCheia = () => painel.marcarTelaCheia(Boolean(document.fullscreenElement));
  document.addEventListener('fullscreenchange', aoMudarTelaCheia);

  function definirMusica(ligar, automatica = false) {
    musicaLigada = ligar;
    musicaAutomatica = ligar && automatica;
    if (ligar) audio.iniciarAmbiente(tema.humor);
    else audio.pararAmbiente();
    painel.marcarMusica(ligar);
  }

  function aplicarTema(id, { comEfeito = true } = {}) {
    if (comEfeito && id === tema.id) return;
    tema = TEMAS.find((t) => t.id === id) ?? TEMAS[0];
    config.tema = tema.id;
    salvarConfig();
    uniformesTema = {
      corBrilho: new Float32Array(hexParaRgb(tema.brilho)),
      corAgua: new Float32Array(hexParaRgb(tema.agua)),
      paletaTinta: tema.tinta.map(hexParaRgb),
    };
    raiz.style.setProperty('--c1', tema.cores[0]);
    raiz.style.setProperty('--c2', tema.cores[1]);
    painel.marcarTema(tema.id, tema.nome);
    if (tela.largura > 1) pintarFundo(comEfeito);
    if (musicaLigada) audio.iniciarAmbiente(tema.humor);
    progresso.registrar('vidro:tema', 1, tema.id);
    if (comEfeito) {
      ondas.perturbar(ondas.colunas / 2, ondas.linhas / 2, Math.min(ondas.colunas, ondas.linhas) * 0.14, 0.7);
      audio.tocar('tema');
      mostrarDica(tema.nome, 'Novo clima na água', 1800);
    }
  }

  function aplicarModo(id, { comEfeito = true } = {}) {
    const modo = MODOS.find((m) => m.id === id) ?? MODOS[0];
    const anterior = config.modo;
    config.modo = modo.id;
    salvarConfig();
    ondas.amortecimento = modo.amortecimento;
    tinta.modoAtivo = modo.id === 'tinta';
    if (modo.id !== 'bolhas') efeitos.dispensarBolhas();
    if (modo.id !== 'redemoinho') soltarRedemoinho();
    if (modo.id === 'acalmar' && !musicaLigada) definirMusica(true, true);
    if (anterior === 'acalmar' && modo.id !== 'acalmar' && musicaAutomatica) definirMusica(false);
    painel.marcarModo(modo.id);
    progresso.registrar('vidro:modo', 1, modo.id);
    if (comEfeito) mostrarDica(modo.dica, modo.detalhe);
  }

  const painel = criarPainel(raiz, {
    temas: TEMAS,
    modos: MODOS,
    config,
    podeTelaCheia,
    aoTema: (id) => aplicarTema(id),
    aoModo: (id) => aplicarModo(id),
    aoIntensidade: (valor) => {
      config.intensidade = valor;
      salvarConfig();
    },
    aoMusica: () => definirMusica(!musicaLigada),
    aoTelaCheia: alternarTelaCheia,
  });

  /* ---------- Eventos automáticos de cada modo ---------- */

  let relogioChuva = 0;
  let relogioAcalmar = 1;
  let relogioBolhas = 0;
  let relogioSegundos = 0;

  function atualizarAutomaticos(dt) {
    const calmo = movimentoReduzido() ? 0.5 : 1;

    if (config.modo === 'chuva') {
      relogioChuva -= dt;
      while (relogioChuva <= 0) {
        relogioChuva += aleatorio(0.5, 1.5) / ((3 + intensidade() * 6) * calmo);
        const x = aleatorio(0, tela.largura);
        const y = aleatorio(0, tela.altura);
        ondas.perturbar(emCelulas(x), emCelulas(y), aleatorio(1.5, 3), aleatorio(0.8, 1.7) * intensidade());
        if (Math.random() < 0.45) audio.tocar('gota', { tom: aleatorio(0.7, 1.7), volume: 0.22, pan: pan(x), intervaloMin: 0.05 });
      }
    }

    if (config.modo === 'acalmar') {
      relogioAcalmar -= dt;
      if (relogioAcalmar <= 0) {
        relogioAcalmar = aleatorio(1.8, 3.4) / calmo;
        const x = aleatorio(0.15, 0.85) * tela.largura;
        const y = aleatorio(0.15, 0.75) * tela.altura;
        ondas.perturbar(emCelulas(x), emCelulas(y), emCelulas(40), 0.9);
        audio.tocar('gota', { tom: aleatorio(0.5, 0.75), volume: 0.3, pan: pan(x) });
      }
    }

    if (config.modo === 'bolhas') {
      relogioBolhas -= dt;
      if (relogioBolhas <= 0 && efeitos.bolhasAtivas < MAX_BOLHAS) {
        relogioBolhas = aleatorio(0.25, 0.6);
        efeitos.criarBolha();
      }
    }

    // Segundos por modo (missões e conquistas)
    relogioSegundos += dt;
    if (relogioSegundos >= 1) {
      relogioSegundos -= 1;
      if (config.modo === 'chuva') progresso.registrar('vidro:chuva-segundos');
      if (config.modo === 'acalmar') progresso.registrar('vidro:acalmar-segundos');
      if (config.modo === 'tinta' && [...ponteiros.values()].some((p) => p.pressionado)) progresso.registrar('vidro:tinta-segundos');
    }
  }

  /* ---------- Loop principal ---------- */

  let acumulador = 0;
  const redemoinhoUniforme = new Float32Array(4);
  const parametros = {};

  const pararLoop = aoQuadro((dt) => {
    if (tela.largura < 2) return;
    tempo += dt * (config.modo === 'acalmar' ? 0.6 : 1) * (movimentoReduzido() ? 0.5 : 1);
    atualizarAutomaticos(dt);
    atualizarRedemoinho(dt);

    // Física em passo fixo (igual em telas de 60 Hz ou 144 Hz)
    acumulador += dt;
    let passos = 0;
    const infoGiro = giro.forca > 0.01
      ? { x: emCelulas(giro.x) / 2, y: emCelulas(giro.y) / 2, raio: emCelulas(70 + giro.forca * 90) / 2, forca: giro.forca }
      : null;
    while (acumulador >= PASSO_FISICA && passos < 3) {
      ondas.passo();
      tinta.passo(ondas, infoGiro);
      acumulador -= PASSO_FISICA;
      passos++;
    }
    if (acumulador > PASSO_FISICA) acumulador = 0;

    efeitos.atualizar(dt);
    efeitos.desenhar();

    renderizador.atualizarAltura(ondas);
    if (tinta.sujo) renderizador.atualizarTinta(tinta.paraBytes(), tinta.colunas, tinta.linhas);
    mistura = Math.min(1, mistura + dt * 1.6);

    redemoinhoUniforme[0] = giro.x / tela.largura;
    redemoinhoUniforme[1] = giro.y / tela.altura;
    redemoinhoUniforme[2] = giro.forca * 1.6 * Math.min(1.2, intensidade());
    redemoinhoUniforme[3] = 0.32;

    const acalmar = config.modo === 'acalmar';
    Object.assign(parametros, {
      aspecto: tela.largura / tela.altura,
      tempo,
      mistura,
      refracao: 0.022 * (0.5 + intensidade() * 0.6) * tema.refracao,
      especular: acalmar ? 0.5 : 1,
      caustica: tema.caustica,
      tingimento: tema.tingimento,
      vinheta: acalmar ? 0.55 : 0.28,
      animacao: tema.animacao,
      corBrilho: uniformesTema.corBrilho,
      corAgua: uniformesTema.corAgua,
      redemoinho: redemoinhoUniforme,
    });
    renderizador.desenhar(parametros);
  });

  /* ---------- Início ---------- */

  redimensionar();
  aplicarTema(config.tema, { comEfeito: false });
  aplicarModo(config.modo, { comEfeito: false });
  painel.marcarTelaCheia(false);
  const modoInicial = MODOS.find((m) => m.id === config.modo);
  mostrarDica(surpresa ? `${tema.nome} · ${modoInicial.nome}` : modoInicial.dica, modoInicial.detalhe, 4200);

  return {
    destruir() {
      pararLoop();
      observador.disconnect();
      cancelAnimationFrame(redimensionamentoPendente);
      clearTimeout(timerDica);
      document.removeEventListener('fullscreenchange', aoMudarTelaCheia);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      giro.zumbido?.parar();
      audio.pararAmbiente();
      renderizador.destruir();
    },
  };
}
