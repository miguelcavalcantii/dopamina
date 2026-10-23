/**
 * Areia cinética: um bloco de areia colorida numa bandeja, visto de cima.
 * A faca corta: o sulco mostra a cor de dentro (as camadas), com bordas iluminadas
 * e farelos que caem para os lados e assentam. Forminhas carimbam figuras; o rolo
 * alisa tudo de novo. Sons gravados (CC0): atrito de areia em laço (segue a
 * velocidade da faca) e farelos de areia úmida.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js?v=202610231621';
import { icone } from '../../core/icones.js?v=202610231621';
import { ler, gravar } from '../../core/armazenamento.js?v=202610231621';
import { criarBanco } from '../../core/amostras.js?v=202610231621';
import { htmlControlesAsmr, ligarControlesAsmr } from '../../core/asmr.js?v=202610231621';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, eventosCombinados, geradorComSemente, movimentoReduzido } from '../../core/util.js?v=202610231621';

const TAU = Math.PI * 2;
const som = (nome) => new URL(`../../../assets/sons/asmr/${nome}.mp3`, import.meta.url);

/** `faixas`: cores da superfície em diagonal; `dentro`: cor que aparece no fundo do corte. */
const AREIAS = [
  { id: 'arco', nome: 'Arco-íris', faixas: ['#ffb3c7', '#ffd59e', '#fff1a8', '#c4f5b8', '#b3e5ff', '#d9c2ff'], dentro: ['#ff8fb0', '#ffc070', '#ffe57a', '#9fe68c', '#80d0ff', '#bb9bff'] },
  { id: 'rosa', nome: 'Rosa', faixas: ['#ffc2d6', '#ffb0cb'], dentro: ['#ff7fae', '#ff6aa0'] },
  { id: 'azul', nome: 'Azul', faixas: ['#b8e2ff', '#a6d6ff'], dentro: ['#5eb4ff', '#4aa2f0'] },
  { id: 'lilas', nome: 'Lilás', faixas: ['#dccbff', '#cfb8ff'], dentro: ['#a982ff', '#9a6ff5'] },
  { id: 'menta', nome: 'Menta', faixas: ['#bff5df', '#aeeed3'], dentro: ['#5fd9a8', '#4cc796'] },
];
const FORMAS = ['estrela', 'coracao', 'circulo', 'flor'];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/areia-cinetica.css?v=202610231621', import.meta.url));

  const config = { areia: 'arco', ferramenta: 'faca', forma: 'estrela', ...ler('areia-cinetica-config', {}) };
  const salvar = () => gravar('areia-cinetica-config', config);
  let areia = AREIAS.find((a) => a.id === config.areia) ?? AREIAS[0];
  const farelos = criarBanco(audio, [som('areia-umida')], { recorte: { intervaloMin: 0.05, duracaoMax: 0.4, sensibilidade: 2 } });
  let bufferAtrito = null;
  let bufferRaspar = null;
  audio.carregarAmostra(som('areia-atrito')).then((b) => { bufferAtrito = b; });
  audio.carregarAmostra(som('areia-raspar')).then((b) => { bufferRaspar = b; });

  raiz.classList.add('cinetica', 'cena-clara');
  raiz.innerHTML = `
    <div class="cinetica__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Areia cinética. Arraste a faca para cortar. Com a forminha, clique para carimbar. Teclado: espaço faz um corte sorteado, A alisa.">
      <canvas class="cinetica__canvas"></canvas>
    </div>
    <p class="dica-palco" data-dica>Arraste para cortar<small>devagar soa ainda melhor</small></p>
    <div class="doca vidro-fosco cinetica__doca" role="region" aria-label="Ferramentas da areia">
      <div class="doca__linha">
        <span class="doca__rotulo">USAR</span>
        <button type="button" class="chip" data-ferramenta="faca" aria-pressed="${config.ferramenta === 'faca'}">${icone('faca')}<span>Faca</span></button>
        <button type="button" class="chip" data-ferramenta="forma" aria-pressed="${config.ferramenta === 'forma'}">${icone('estrela')}<span>Forminha</span></button>
        ${FORMAS.map((f) => `<button type="button" class="chip cinetica__forma" data-forma="${f}" aria-pressed="${f === config.forma}" aria-label="Forma ${f}">${icone({ estrela: 'estrela', coracao: 'coracao', circulo: 'alvo', flor: 'flor' }[f])}</button>`).join('')}
        <button type="button" class="chip" data-alisar>${icone('onda')}<span>Alisar</span></button>
      </div>
      <div class="doca__linha">
        <span class="doca__rotulo">AREIA</span>
        ${AREIAS.map((a) => `<button type="button" class="amostra-tema" data-areia="${a.id}" aria-pressed="${a.id === areia.id}" aria-label="${a.nome}" title="${a.nome}"
          style="--amostra:linear-gradient(135deg, ${a.faixas.join(',')});--brilho:${a.dentro[0]}"></button>`).join('')}
      </div>
      ${htmlControlesAsmr(0.8)}
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.cinetica__palco');
  const canvas = $('.cinetica__canvas');
  const g = canvas.getContext('2d');
  const dica = $('[data-dica]');

  let tela = { l: 1, a: 1, dpr: 1 };
  const bloco = { x: 0, y: 0, l: 0, a: 0, r: 0 };
  let camada = null; // a areia (com cortes e farelos já assentados)
  let cs = null;
  let volumeLocal = 0.8;
  const farelosVoando = [];
  const faca = { x: -100, y: -100, angulo: -0.6, ativa: false, visivel: false, velocidade: 0 };
  const rolo = { ativo: false, x: 0 };
  let laco = null;
  let interagiu = false;
  let tempo = 0;
  let cortado = 0;

  const controles = ligarControlesAsmr(raiz, { chave: 'areia-cinetica', aoMudarVolume: (v) => { volumeLocal = v; } });

  /* ---------- A areia ---------- */

  const caminhoBloco = () => {
    const p = new Path2D();
    p.roundRect(bloco.x, bloco.y, bloco.l, bloco.a, bloco.r);
    return p;
  };

  function corDaFaixa(x, y, lista = areia.faixas) {
    const t = ((x - bloco.x) + (y - bloco.y)) / (bloco.l + bloco.a);
    return lista[clamp(Math.floor(t * lista.length), 0, lista.length - 1)];
  }

  function desenharAreiaLisa(ctx, ateX = tela.l) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, Math.max(0, ateX), tela.a); // (valores infinitos anulam o recorte)
    ctx.clip();
    const forma = caminhoBloco();
    ctx.save();
    ctx.clip(forma);
    // Faixas diagonais macias
    const n = areia.faixas.length;
    const total = bloco.l + bloco.a;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = areia.faixas[i];
      ctx.beginPath();
      const d0 = (i / n) * total;
      const d1 = ((i + 1) / n) * total + 1;
      ctx.moveTo(bloco.x + d0, bloco.y);
      ctx.lineTo(bloco.x + d1, bloco.y);
      ctx.lineTo(bloco.x + d1 - bloco.a * 2, bloco.y + bloco.a * 2);
      ctx.lineTo(bloco.x + d0 - bloco.a * 2, bloco.y + bloco.a * 2);
      ctx.closePath();
      ctx.fill();
    }
    // Grão: milhares de pontinhos claros e escuros
    const rnd = geradorComSemente(77);
    for (let i = 0; i < (bloco.l * bloco.a) / 14; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(90,60,40,0.1)';
      ctx.fillRect(bloco.x + rnd() * bloco.l, bloco.y + rnd() * bloco.a, 1.2, 1.2);
    }
    // Luz suave vinda do alto à esquerda
    const luz = ctx.createLinearGradient(bloco.x, bloco.y, bloco.x + bloco.l, bloco.y + bloco.a);
    luz.addColorStop(0, 'rgba(255,255,255,0.18)');
    luz.addColorStop(1, 'rgba(60,30,60,0.12)');
    ctx.fillStyle = luz;
    ctx.fillRect(bloco.x, bloco.y, bloco.l, bloco.a);
    ctx.restore();
    // Borda do bloco: um pouco de volume
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke(forma);
    ctx.restore();
  }

  function criarCamada() {
    camada = document.createElement('canvas');
    camada.width = Math.round(tela.l * tela.dpr);
    camada.height = Math.round(tela.a * tela.dpr);
    cs = camada.getContext('2d');
    cs.scale(tela.dpr, tela.dpr);
    desenharAreiaLisa(cs);
  }

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: 2,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      bloco.l = Math.min(tela.l * 0.78, 760);
      bloco.a = Math.min((tela.a - 260) * 0.95, bloco.l * 0.7);
      bloco.x = (tela.l - bloco.l) / 2;
      bloco.y = Math.max(110, (tela.a - 170 - bloco.a) / 2 + 40);
      bloco.r = 26;
      criarCamada();
    },
  });

  /* ---------- Cortar ---------- */

  const dentroDoBloco = (x, y) => x > bloco.x + 6 && x < bloco.x + bloco.l - 6 && y > bloco.y + 6 && y < bloco.y + bloco.a - 6;

  let pontoAnterior = null; // penúltimo ponto do corte atual (para emendar sem "contas")

  function cortar(x0, y0, x1, y1) {
    const comprimento = Math.hypot(x1 - x0, y1 - y0);
    if (comprimento < 0.5) return;
    const emenda = pontoAnterior ?? { x: x0, y: y0 };
    cs.save();
    cs.clip(caminhoBloco());
    // Linhas translúcidas com ponta reta: pontas redondas se sobrepõem e marcam "contas"
    cs.lineCap = 'butt';
    const nx = -(y1 - y0) / comprimento;
    const ny = (x1 - x0) / comprimento;
    // Fundo do corte: a cor de dentro, mais escura nas paredes
    cs.strokeStyle = 'rgba(70,40,50,0.35)';
    cs.lineWidth = 9;
    cs.beginPath();
    cs.moveTo(x0, y0);
    cs.lineTo(x1, y1);
    cs.stroke();
    // O miolo colorido é redesenhado desde o segmento anterior, cobrindo a emenda escura
    cs.strokeStyle = corDaFaixa((x0 + x1) / 2, (y0 + y1) / 2, areia.dentro);
    cs.lineWidth = 4.5;
    cs.lineJoin = 'round';
    cs.lineCap = 'round';
    cs.beginPath();
    cs.moveTo(emenda.x, emenda.y);
    cs.lineTo(x0, y0);
    cs.lineTo(x1, y1);
    cs.stroke();
    pontoAnterior = { x: x0, y: y0 };
    // Paredes: a de cima pega luz, a de baixo faz sombra
    cs.lineCap = 'butt';
    for (const [lado, cor, largura] of [[-1, 'rgba(255,255,255,0.75)', 1.6], [1, 'rgba(60,30,40,0.35)', 2]]) {
      cs.strokeStyle = cor;
      cs.lineWidth = largura;
      cs.beginPath();
      cs.moveTo(x0 + nx * 5 * lado, y0 + ny * 5 * lado);
      cs.lineTo(x1 + nx * 5 * lado, y1 + ny * 5 * lado);
      cs.stroke();
    }
    cs.restore();
    // Farelos saltam para os dois lados
    const quantidade = movimentoReduzido() ? 1 : Math.min(6, Math.ceil(comprimento / 6));
    for (let i = 0; i < quantidade; i++) {
      const t = Math.random();
      const lado = Math.random() < 0.5 ? -1 : 1;
      const x = x0 + (x1 - x0) * t + nx * 5 * lado;
      const y = y0 + (y1 - y0) * t + ny * 5 * lado;
      farelosVoando.push({ x, y, vx: nx * lado * aleatorio(20, 70), vy: ny * lado * aleatorio(20, 70), vida: aleatorio(0.25, 0.6), tam: aleatorio(1.5, 4), cor: Math.random() < 0.3 ? corDaFaixa(x, y, areia.dentro) : corDaFaixa(x, y) });
    }
    if (Math.random() < 0.08) farelos.tocar({ volume: 0.5 * volumeLocal, variacaoTom: 0.15, tom: 1.2 });
    cortado += comprimento;
    if (cortado > 300) {
      progresso.registrar('areia-cinetica:corte');
      cortado = 0;
    }
  }

  /** Assenta o farelo na areia (vira parte da camada). */
  function assentar(f) {
    cs.save();
    cs.fillStyle = 'rgba(60,30,40,0.25)';
    cs.beginPath();
    cs.arc(f.x + 0.8, f.y + 0.8, f.tam, 0, TAU);
    cs.fill();
    cs.fillStyle = f.cor;
    cs.beginPath();
    cs.arc(f.x, f.y, f.tam, 0, TAU);
    cs.fill();
    cs.fillStyle = 'rgba(255,255,255,0.4)';
    cs.beginPath();
    cs.arc(f.x - f.tam * 0.3, f.y - f.tam * 0.3, f.tam * 0.4, 0, TAU);
    cs.fill();
    cs.restore();
  }

  function carimbar(x, y) {
    if (!dentroDoBloco(x, y)) return;
    const r = Math.min(bloco.l, bloco.a) * 0.12;
    const p = new Path2D();
    if (config.forma === 'circulo') p.arc(x, y, r, 0, TAU);
    else if (config.forma === 'coracao') {
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * TAU;
        const px = x + (16 * Math.sin(a) ** 3 / 16) * r;
        const py = y - ((13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16) * r;
        if (i) p.lineTo(px, py);
        else p.moveTo(px, py);
      }
      p.closePath();
    } else if (config.forma === 'flor') {
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * TAU;
        const raio = r * (0.75 + 0.25 * Math.cos(a * 5));
        if (i) p.lineTo(x + Math.cos(a) * raio, y + Math.sin(a) * raio);
        else p.moveTo(x + Math.cos(a) * raio, y + Math.sin(a) * raio);
      }
      p.closePath();
    } else {
      for (let i = 0; i < 10; i++) {
        const raio = i % 2 ? r * 0.45 : r;
        const a = -Math.PI / 2 + (i / 10) * TAU;
        if (i) p.lineTo(x + Math.cos(a) * raio, y + Math.sin(a) * raio);
        else p.moveTo(x + Math.cos(a) * raio, y + Math.sin(a) * raio);
      }
      p.closePath();
    }
    // Figura afundada: sombra por dentro em cima/esquerda, luz embaixo/direita
    cs.save();
    cs.clip(caminhoBloco());
    cs.save();
    cs.clip(p);
    cs.fillStyle = 'rgba(70,40,60,0.12)';
    cs.fill(p);
    cs.lineWidth = 5;
    cs.strokeStyle = 'rgba(60,30,50,0.35)';
    cs.translate(2, 2);
    cs.stroke(p);
    cs.translate(-4, -4);
    cs.strokeStyle = 'rgba(255,255,255,0.6)';
    cs.stroke(p);
    cs.restore();
    cs.restore();
    farelos.tocar({ volume: 0.9 * volumeLocal, tom: 0.85 });
    progresso.registrar('areia-cinetica:forma', 1, config.forma);
  }

  function alisar() {
    if (rolo.ativo) return;
    rolo.ativo = true;
    rolo.x = bloco.x - 40;
    farelosVoando.length = 0;
    if (bufferRaspar) audio.tocarAmostra(bufferRaspar, { inicio: aleatorio(0, Math.max(0, bufferRaspar.duration - 2.2)), duracao: 1.8, volume: 0.9 * volumeLocal, soltura: 0.5 });
  }

  /* ---------- Entrada ---------- */

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };
  let anterior = null;
  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || rolo.ativo) return;
    capturarPonteiro(palco, e.pointerId);
    const { x, y } = posicao(e);
    if (!interagiu) {
      interagiu = true;
      dica.classList.add('dica-palco--oculta');
    }
    if (config.ferramenta === 'forma') {
      carimbar(x, y);
      return;
    }
    faca.ativa = true;
    anterior = { x, y };
    pontoAnterior = null;
  });
  palco.addEventListener('pointermove', (e) => {
    const { x, y } = posicao(e);
    // A lâmina acompanha o sentido do movimento
    if (faca.visivel && Math.hypot(x - faca.x, y - faca.y) > 1) faca.angulo = Math.atan2(y - faca.y, x - faca.x);
    faca.x = x;
    faca.y = y;
    faca.visivel = e.pointerType === 'mouse' || faca.ativa;
    if (!faca.ativa || !anterior) return;
    for (const ev of eventosCombinados(e)) {
      const p = posicao(ev);
      if (dentroDoBloco(p.x, p.y) && dentroDoBloco(anterior.x, anterior.y)) {
        faca.velocidade = Math.min(1, faca.velocidade + Math.hypot(p.x - anterior.x, p.y - anterior.y) / 60);
        cortar(anterior.x, anterior.y, p.x, p.y);
      }
      anterior = p;
    }
  });
  const soltar = () => {
    faca.ativa = false;
    anterior = null;
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);
  palco.addEventListener('pointerleave', () => { faca.visivel = false; });

  raiz.addEventListener('keydown', (e) => {
    if (e.target.closest('button, input')) return;
    const tecla = e.key.toLowerCase();
    if (tecla === ' ' || tecla === 'enter') {
      e.preventDefault();
      // Um corte reto sorteado, desenhado aos pouquinhos para soar como de verdade
      const y = aleatorio(bloco.y + 30, bloco.y + bloco.a - 30);
      let x = bloco.x + 14;
      pontoAnterior = null;
      const passo = () => {
        if (x >= bloco.x + bloco.l - 14) return;
        cortar(x, y, x + 6, y + aleatorio(-0.6, 0.6));
        faca.velocidade = 0.6;
        x += 6;
        setTimeout(passo, 16);
      };
      passo();
    } else if (tecla === 'a') alisar();
  });

  $('.cinetica__doca').addEventListener('click', (e) => {
    const ferramenta = e.target.closest('[data-ferramenta]');
    const forma = e.target.closest('[data-forma]');
    const tipo = e.target.closest('[data-areia]');
    if (ferramenta) {
      config.ferramenta = ferramenta.dataset.ferramenta;
      raiz.querySelectorAll('[data-ferramenta]').forEach((b) => b.setAttribute('aria-pressed', String(b === ferramenta)));
    } else if (forma) {
      config.forma = forma.dataset.forma;
      config.ferramenta = 'forma';
      raiz.querySelectorAll('[data-forma]').forEach((b) => b.setAttribute('aria-pressed', String(b === forma)));
      raiz.querySelectorAll('[data-ferramenta]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ferramenta === 'forma')));
    } else if (tipo) {
      areia = AREIAS.find((a) => a.id === tipo.dataset.areia);
      config.areia = areia.id;
      raiz.querySelectorAll('[data-areia]').forEach((b) => b.setAttribute('aria-pressed', String(b === tipo)));
      alisar();
    } else if (e.target.closest('[data-alisar]')) {
      alisar();
    }
    salvar();
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (!camada) return;
    tempo += dt;

    // Som de atrito: só enquanto a faca anda dentro da areia
    if (!laco && bufferAtrito && audio.ativo) laco = audio.iniciarLaco(bufferAtrito, { volume: 0 });
    faca.velocidade = Math.max(0, faca.velocidade - dt * 3);
    laco?.volume(faca.ativa ? faca.velocidade * 1.1 * volumeLocal : 0, 0.06);
    laco?.tom(0.85 + faca.velocidade * 0.3);

    for (const f of farelosVoando) {
      f.vida -= dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 0.9;
      f.vy *= 0.9;
      if (f.vida <= 0) assentar(f);
    }
    for (let i = farelosVoando.length - 1; i >= 0; i--) if (farelosVoando[i].vida <= 0) farelosVoando.splice(i, 1);

    if (rolo.ativo) {
      rolo.x += dt * (bloco.l + 80) / 1.2;
      desenharAreiaLisa(cs, rolo.x);
      if (rolo.x > bloco.x + bloco.l + 40) {
        rolo.ativo = false;
        progresso.registrar('areia-cinetica:alisar');
      }
    }

    /* Desenho */
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fundo = g.createRadialGradient(l / 2, a * 0.45, 0, l / 2, a * 0.45, Math.max(l, a) * 0.75);
    fundo.addColorStop(0, '#f6e6ff');
    fundo.addColorStop(1, '#c9b3e6');
    g.fillStyle = fundo;
    g.fillRect(0, 0, l, a);
    // Bandeja
    g.fillStyle = 'rgba(80,40,120,0.18)';
    g.beginPath();
    g.roundRect(bloco.x - 34, bloco.y - 30, bloco.l + 68, bloco.a + 64, 40);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(bloco.x - 28, bloco.y - 26, bloco.l + 56, bloco.a + 52, 36);
    g.fill();
    g.fillStyle = 'rgba(80,40,120,0.12)';
    g.beginPath();
    g.roundRect(bloco.x - 14, bloco.y - 10, bloco.l + 28, bloco.a + 26, 30);
    g.fill();
    g.drawImage(camada, 0, 0, l, a);

    for (const f of farelosVoando) {
      g.fillStyle = f.cor;
      g.beginPath();
      g.arc(f.x, f.y, f.tam, 0, TAU);
      g.fill();
    }

    // Rolo alisando
    if (rolo.ativo) {
      const grad = g.createLinearGradient(rolo.x - 22, 0, rolo.x + 22, 0);
      grad.addColorStop(0, '#d9dde8');
      grad.addColorStop(0.5, '#ffffff');
      grad.addColorStop(1, '#a9b0c2');
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(rolo.x - 22, bloco.y - 34, 44, bloco.a + 68, 22);
      g.fill();
    }

    // Faca: lâmina de metal que acompanha o movimento
    if (faca.visivel && config.ferramenta === 'faca' && !rolo.ativo) desenharFaca();
  });

  function desenharFaca() {
    g.save();
    g.translate(faca.x, faca.y);
    g.rotate(faca.angulo + Math.PI);
    const descida = faca.ativa ? 0 : -6;
    g.translate(0, descida);
    // Sombra
    g.fillStyle = 'rgba(40,20,60,0.2)';
    g.beginPath();
    g.roundRect(4, 6, 120, 20, 8);
    g.fill();
    // Lâmina
    const lamina = g.createLinearGradient(0, -12, 0, 10);
    lamina.addColorStop(0, '#ffffff');
    lamina.addColorStop(0.5, '#c8cfdc');
    lamina.addColorStop(1, '#7c8597');
    g.fillStyle = lamina;
    g.beginPath();
    g.moveTo(-6, 2);
    g.quadraticCurveTo(8, -12, 70, -10);
    g.lineTo(70, 6);
    g.lineTo(0, 6);
    g.closePath();
    g.fill();
    // Cabo
    g.fillStyle = '#ff8fb0';
    g.beginPath();
    g.roundRect(70, -12, 70, 20, 9);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(74, -9, 60, 4);
    g.restore();
  }

  raiz.style.setProperty('--c1', '#ff8fb0');
  raiz.style.setProperty('--c2', '#80d0ff');

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      laco?.parar();
      controles.destruir();
    },
  };
}
