/**
 * Chuva na janela: uma cena desfocada atrás do vidro (cidade à noite, floresta ou
 * entardecer). Cada gota é uma lente grande-angular: mostra a cena nítida, de cabeça
 * para baixo e bem reduzida (um padrão de canvas com transformação por gota, sem recortes).
 * Gotas novas batem no vidro, crescem, se juntam e, pesadas, escorrem engolindo as
 * menores e deixando um rastro limpo no embaçado. O dedo desembaça o vidro (que
 * volta a embaçar devagar). Trovões opcionais: clarão suave (máx. 8%) e trovoada
 * gravada, tirada dos trechos mais altos da gravação.
 */
import { criarCanvasResponsivo } from '../../core/canvas.js';
import { icone } from '../../core/icones.js';
import { ler, gravar } from '../../core/armazenamento.js';
import { htmlControlesAsmr, ligarControlesAsmr } from '../../core/asmr.js';
import { aleatorio, capturarPonteiro, carregarEstilo, clamp, eventosCombinados, geradorComSemente, movimentoReduzido, perfilLeve } from '../../core/util.js';

const TAU = Math.PI * 2;
const som = (nome) => new URL(`../../../assets/sons/asmr/${nome}.mp3`, import.meta.url);
const CAMPO_GOTA = 0.12; // cada gota (grande-angular) mostra ~12% da altura da cena, invertida
const CELULA = 24;

const CENAS = [
  { id: 'cidade', nome: 'Cidade', ceu: ['#05060f', '#141a3a', '#2a1c3a'], luzes: ['#ffb347', '#ff5dc8', '#22e4ff', '#ffe08a', '#ff7a5c', '#8b8bff'], predios: '#0a0c18' },
  { id: 'floresta', nome: 'Floresta', ceu: ['#0d1f1a', '#1f3d2e', '#3c5a3a'], luzes: ['#d8ff8a', '#ffe9a8', '#9fffd0'], predios: '#06120d' },
  { id: 'entardecer', nome: 'Entardecer', ceu: ['#3a1c4a', '#c4507a', '#ffb070'], luzes: ['#fff0c2', '#ffd27a', '#ffb3c7'], predios: '#2a1230' },
];
const INTENSIDADES = [
  { id: 'garoa', nome: 'Garoa', taxa: 6, volume: 0.45 },
  { id: 'chuva', nome: 'Chuva', taxa: 18, volume: 0.75 },
  { id: 'temporal', nome: 'Temporal', taxa: 40, volume: 1 },
];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/chuva-janela.css', import.meta.url));

  const config = { cena: 'cidade', intensidade: 'chuva', trovoes: true, ...ler('chuva-janela-config', {}) };
  const salvar = () => gravar('chuva-janela-config', config);
  let cena = CENAS.find((c) => c.id === config.cena) ?? CENAS[0];
  let intensidade = INTENSIDADES.find((i) => i.id === config.intensidade) ?? INTENSIDADES[1];
  let bufferChuva = null;
  let bufferTrovao = null;
  let trechosTrovao = [];
  audio.carregarAmostra(som('chuva-janela')).then((b) => { bufferChuva = b; });
  audio.carregarAmostra(som('trovao')).then((b) => {
    bufferTrovao = b;
    if (b) trechosTrovao = acharTrovoes(b);
  });

  raiz.classList.add('janela');
  raiz.innerHTML = `
    <div class="janela__palco" tabindex="0" role="application" data-foco-inicial
      aria-label="Chuva na janela. Arraste para desembaçar o vidro; toque para pingar uma gota.">
      <canvas class="janela__canvas"></canvas>
    </div>
    <p class="dica-palco" data-dica>Arraste para desembaçar<small>toque para pingar uma gota</small></p>
    <div class="doca vidro-fosco janela__doca" role="region" aria-label="Opções da chuva">
      <div class="doca__linha">
        <span class="doca__rotulo">CHUVA</span>
        ${INTENSIDADES.map((i) => `<button type="button" class="chip" data-intensidade="${i.id}" aria-pressed="${i.id === intensidade.id}">${icone('chuva')}<span>${i.nome}</span></button>`).join('')}
        <button type="button" class="chip" data-trovoes aria-pressed="${config.trovoes}">${icone('raio')}<span>Trovões</span></button>
      </div>
      <div class="doca__linha">
        <span class="doca__rotulo">LÁ FORA</span>
        ${CENAS.map((c) => `<button type="button" class="chip" data-cena="${c.id}" aria-pressed="${c.id === cena.id}">${c.nome}</button>`).join('')}
      </div>
      ${htmlControlesAsmr(0.8)}
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const palco = $('.janela__palco');
  const canvas = $('.janela__canvas');
  const g = canvas.getContext('2d');
  const dica = $('[data-dica]');

  let tela = { l: 1, a: 1, dpr: 1 };
  let nitida = null; // cena nítida (para as lentes das gotas)
  let desfocada = null; // cena borrada (fundo)
  let padrao = null;
  let embacado = null;
  let ec = null;
  let volumeLocal = 0.8;
  let gotas = []; // paradas
  let escorrendo = [];
  let laco = null;
  let tempo = 0;
  let proximoTrovao = aleatorio(8, 18);
  let clarao = 0;
  let reembacar = 0;
  let interagiu = false;

  const controles = ligarControlesAsmr(raiz, { chave: 'chuva-janela', aoMudarVolume: (v) => { volumeLocal = v; } });

  /** Os trechos mais altos da gravação (janelas de meio segundo), bem separados: as trovoadas. */
  function acharTrovoes(buffer) {
    const dados = buffer.getChannelData(0);
    const janela = Math.floor(buffer.sampleRate * 0.5);
    const energias = [];
    for (let i = 0; i + janela < dados.length; i += janela) {
      let soma = 0;
      for (let k = i; k < i + janela; k += 8) soma += dados[k] * dados[k];
      energias.push({ inicio: i / buffer.sampleRate, energia: soma });
    }
    const ordenadas = [...energias].sort((a, b) => b.energia - a.energia);
    const escolhidos = [];
    for (const e of ordenadas) {
      if (escolhidos.every((x) => Math.abs(x - e.inicio) > 6)) escolhidos.push(e.inicio);
      if (escolhidos.length >= 4) break;
    }
    return escolhidos.map((t) => Math.max(0, t - 1));
  }

  /* ---------- Cena lá fora ---------- */

  function desenharCena(ctx, l, a, rnd) {
    const [c1, c2, c3] = cena.ceu;
    const ceu = ctx.createLinearGradient(0, 0, 0, a);
    ceu.addColorStop(0, c1);
    ceu.addColorStop(0.6, c2);
    ceu.addColorStop(1, c3);
    ctx.fillStyle = ceu;
    ctx.fillRect(0, 0, l, a);
    if (cena.id === 'floresta') {
      for (let camada = 0; camada < 3; camada++) {
        ctx.fillStyle = ['#16352a', '#0f2a20', '#081a13'][camada];
        for (let x = -40; x < l + 40; x += 30 + rnd() * 40) {
          const h = a * (0.35 + rnd() * 0.3 + camada * 0.08);
          ctx.beginPath();
          ctx.moveTo(x - 40, a);
          ctx.lineTo(x, a - h);
          ctx.lineTo(x + 40, a);
          ctx.fill();
        }
      }
    } else {
      // Prédios com janelas acesas
      for (let x = -20; x < l; x += 50 + rnd() * 70) {
        const largura = 50 + rnd() * 90;
        const h = a * (0.25 + rnd() * 0.45);
        ctx.fillStyle = cena.predios;
        ctx.fillRect(x, a - h, largura, h);
        for (let wy = a - h + 12; wy < a - 10; wy += 16) {
          for (let wx = x + 8; wx < x + largura - 8; wx += 14) {
            if (rnd() < 0.35) {
              ctx.fillStyle = rnd() < 0.7 ? '#ffd88a' : '#9fd8ff';
              ctx.fillRect(wx, wy, 6, 8);
            }
          }
        }
      }
    }
    // Luzes de bokeh (círculos grandes e suaves)
    for (let i = 0; i < 70; i++) {
      const x = rnd() * l;
      const y = a * (0.3 + rnd() * 0.65);
      const r = 6 + rnd() * 26;
      const cor = cena.luzes[Math.floor(rnd() * cena.luzes.length)];
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, cor);
      grad.addColorStop(0.6, `${cor}aa`);
      grad.addColorStop(1, `${cor}00`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  function criarCenas() {
    const { l, a, dpr } = tela;
    nitida = document.createElement('canvas');
    nitida.width = Math.round(l * dpr);
    nitida.height = Math.round(a * dpr);
    const n = nitida.getContext('2d');
    n.scale(dpr, dpr);
    desenharCena(n, l, a, geradorComSemente(cena.id.length * 31));
    // Desfoque barato: reduz muito e amplia de novo (funciona em qualquer navegador)
    const pequena = document.createElement('canvas');
    pequena.width = Math.max(8, Math.round(l / 14));
    pequena.height = Math.max(8, Math.round(a / 14));
    const p = pequena.getContext('2d');
    p.imageSmoothingQuality = 'high';
    p.drawImage(nitida, 0, 0, pequena.width, pequena.height);
    desfocada = document.createElement('canvas');
    desfocada.width = Math.round(l / 3);
    desfocada.height = Math.round(a / 3);
    const d = desfocada.getContext('2d');
    d.imageSmoothingQuality = 'high';
    d.drawImage(pequena, 0, 0, desfocada.width, desfocada.height);
    padrao = g.createPattern(nitida, 'no-repeat');
  }

  function criarEmbacado() {
    embacado = document.createElement('canvas');
    embacado.width = Math.round(tela.l / 2);
    embacado.height = Math.round(tela.a / 2);
    ec = embacado.getContext('2d');
    ec.fillStyle = 'rgba(200,215,235,0.32)';
    ec.fillRect(0, 0, embacado.width, embacado.height);
  }

  function semearGotas() {
    gotas = [];
    escorrendo = [];
    const quantidade = Math.round((tela.l * tela.a) / (perfilLeve ? 2400 : 1500));
    for (let i = 0; i < quantidade; i++) gotas.push(novaGota(aleatorio(0, tela.l), aleatorio(0, tela.a), Math.random() < 0.85 ? aleatorio(0.8, 2.4) : aleatorio(2.5, 4.5)));
  }

  const novaGota = (x, y, r) => ({ x, y, r, achatar: aleatorio(0.85, 1) });

  const canvasResponsivo = criarCanvasResponsivo(canvas, {
    maxDpr: perfilLeve ? 1.25 : 1.75,
    aoRedimensionar: (e) => {
      tela = { l: e.largura, a: e.altura, dpr: e.dpr };
      criarCenas();
      criarEmbacado();
      semearGotas();
    },
  });

  /* ---------- Gotas ---------- */

  /** Grade espacial das gotas paradas (para as que escorrem engolirem as do caminho). */
  function montarGrade() {
    const grade = new Map();
    for (const gota of gotas) {
      const chave = `${Math.floor(gota.x / CELULA)},${Math.floor(gota.y / CELULA)}`;
      if (!grade.has(chave)) grade.set(chave, []);
      grade.get(chave).push(gota);
    }
    return grade;
  }

  function limparEmbacado(x, y, raio) {
    ec.save();
    ec.globalCompositeOperation = 'destination-out';
    const grad = ec.createRadialGradient(x / 2, y / 2, 0, x / 2, y / 2, raio / 2);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.8)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ec.fillStyle = grad;
    ec.beginPath();
    ec.arc(x / 2, y / 2, raio / 2, 0, TAU);
    ec.fill();
    ec.restore();
  }

  function passoGotas(dt) {
    // Chuva batendo no vidro
    const esperado = (intensidade.taxa * dt * (tela.l * tela.a)) / 600000;
    const chegando = Math.min(20, Math.floor(esperado) + (Math.random() < esperado % 1 ? 1 : 0));
    for (let i = 0; i < chegando; i++) {
      const x = aleatorio(0, tela.l);
      const y = aleatorio(0, tela.a);
      const r = Math.random() < 0.9 ? aleatorio(0.8, 2.8) : aleatorio(3, 5.5);
      gotas.push(novaGota(x, y, r));
      if (gotas.length > 2600) gotas.splice(0, 200);
    }
    // Gotas grandes começam a escorrer
    for (let i = gotas.length - 1; i >= 0; i--) {
      const gota = gotas[i];
      if (gota.r > 5.2 && Math.random() < dt * 2) {
        gotas.splice(i, 1);
        escorrendo.push({ ...gota, vy: 0, desvio: aleatorio(-1, 1), rastro: 0 });
      }
    }
    const grade = montarGrade();
    for (const gota of escorrendo) {
      // Mais pesada, mais rápida; anda aos trancos e muda um pouco de rumo
      const alvo = 40 + gota.r * 22;
      gota.vy += (alvo - gota.vy) * Math.min(1, dt * (Math.random() < 0.08 ? 0.5 : 4));
      if (Math.random() < dt * 1.5) gota.desvio = aleatorio(-1, 1);
      gota.x += gota.desvio * 8 * dt;
      gota.y += gota.vy * dt;
      gota.r = Math.max(3, gota.r - dt * 0.35);
      limparEmbacado(gota.x, gota.y, gota.r * 3.2);
      // Rastro: gotinhas que ficam para trás
      gota.rastro += gota.vy * dt;
      if (gota.rastro > 9 && !movimentoReduzido()) {
        gota.rastro = 0;
        gotas.push(novaGota(gota.x + aleatorio(-1.5, 1.5), gota.y - gota.r * 1.4, aleatorio(0.6, 1.4)));
      }
      // Engole as paradas do caminho
      const cx = Math.floor(gota.x / CELULA);
      const cy = Math.floor(gota.y / CELULA);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const outra of grade.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (outra.engolida || Math.hypot(outra.x - gota.x, outra.y - gota.y) > gota.r + outra.r) continue;
            outra.engolida = true;
            gota.r = Math.min(9, Math.sqrt(gota.r * gota.r + outra.r * outra.r));
          }
        }
      }
    }
    gotas = gotas.filter((x) => !x.engolida);
    escorrendo = escorrendo.filter((x) => x.y < tela.a + 20);
    // Gotas paradas que se encostam viram uma só (às vezes)
    if (Math.random() < dt * 4) {
      for (const lista of grade.values()) {
        for (let i = 0; i < lista.length; i++) {
          for (let k = i + 1; k < lista.length; k++) {
            const a = lista[i];
            const b = lista[k];
            if (a.engolida || b.engolida) continue;
            if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.8) {
              b.engolida = true;
              a.r = Math.min(8, Math.sqrt(a.r * a.r + b.r * b.r));
            }
          }
        }
      }
      gotas = gotas.filter((x) => !x.engolida);
    }
  }

  function desenharGota(x, y, r, achatar = 1) {
    // Lente: a cena nítida aparece invertida e bem reduzida dentro da gota
    const k = clamp((tela.a * CAMPO_GOTA) / Math.max(r, 0.5), 6, 160);
    const d = tela.dpr;
    padrao.setTransform(new DOMMatrix([-1 / (k * d), 0, 0, -1 / (k * d), x * (1 + 1 / k), y * (1 + 1 / k)]));
    // A gota soma luz: o escuro da cena some e as luzes viram brilhos coloridos
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = padrao;
    g.beginPath();
    g.ellipse(x, y, r, r * achatar, 0, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    // Luz que a gota concentra embaixo, borda de refração e brilho
    const foco = g.createRadialGradient(x, y + r * 0.35, 0, x, y + r * 0.35, r);
    foco.addColorStop(0, 'rgba(255,255,255,0.18)');
    foco.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = foco;
    g.fill();
    if (r > 1.4) {
      g.strokeStyle = 'rgba(0,0,10,0.2)';
      g.lineWidth = Math.max(0.5, r * 0.14);
      g.stroke();
    }
    if (r > 1.6) {
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.arc(x - r * 0.35, y - r * 0.4, Math.max(0.5, r * 0.2), 0, TAU);
      g.fill();
    }
  }

  /* ---------- Entrada ---------- */

  const posicao = (e) => {
    const caixa = palco.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };
  let pressionado = false;
  palco.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    capturarPonteiro(palco, e.pointerId);
    pressionado = true;
    const { x, y } = posicao(e);
    gotas.push(novaGota(x, y, aleatorio(4, 6)));
    audio.tocar('gota', { tom: aleatorio(0.9, 1.3), volume: 0.5 * volumeLocal, canal: 'asmr' });
    if (!interagiu) {
      interagiu = true;
      dica.classList.add('dica-palco--oculta');
    }
  });
  palco.addEventListener('pointermove', (e) => {
    if (!pressionado) return;
    for (const ev of eventosCombinados(e)) {
      const { x, y } = posicao(ev);
      limparEmbacado(x, y, 70);
      // O dedo também arrasta as gotinhas para fora do caminho
      for (const gota of gotas) if (Math.hypot(gota.x - x, gota.y - y) < 26) gota.engolida = true;
    }
  });
  const soltar = () => { pressionado = false; };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  $('.janela__doca').addEventListener('click', (e) => {
    const botaoIntensidade = e.target.closest('[data-intensidade]');
    const botaoCena = e.target.closest('[data-cena]');
    if (botaoIntensidade) {
      intensidade = INTENSIDADES.find((i) => i.id === botaoIntensidade.dataset.intensidade);
      config.intensidade = intensidade.id;
      raiz.querySelectorAll('[data-intensidade]').forEach((b) => b.setAttribute('aria-pressed', String(b === botaoIntensidade)));
    } else if (botaoCena) {
      cena = CENAS.find((c) => c.id === botaoCena.dataset.cena);
      config.cena = cena.id;
      raiz.querySelectorAll('[data-cena]').forEach((b) => b.setAttribute('aria-pressed', String(b === botaoCena)));
      criarCenas();
      progresso.registrar('chuva:cena', 1, cena.id);
    } else if (e.target.closest('[data-trovoes]')) {
      config.trovoes = !config.trovoes;
      $('[data-trovoes]').setAttribute('aria-pressed', String(config.trovoes));
    }
    salvar();
  });

  /* ---------- Loop ---------- */

  const pararLoop = aoQuadro((dt) => {
    if (!padrao) return;
    tempo += dt;
    passoGotas(dt);

    // O vidro volta a embaçar devagar
    reembacar += dt;
    if (reembacar > 0.25) {
      reembacar = 0;
      ec.fillStyle = 'rgba(200,215,235,0.009)';
      ec.fillRect(0, 0, embacado.width, embacado.height);
    }

    // Som da chuva
    if (!laco && bufferChuva && audio.ativo) laco = audio.iniciarLaco(bufferChuva, { volume: 0 });
    laco?.volume(intensidade.volume * volumeLocal, 0.6);

    // Trovões: clarão suave e, segundos depois, a trovoada
    if (config.trovoes) {
      proximoTrovao -= dt;
      if (proximoTrovao <= 0) {
        proximoTrovao = aleatorio(18, 45);
        if (!movimentoReduzido()) clarao = 1;
        if (bufferTrovao && trechosTrovao.length) {
          const inicio = trechosTrovao[Math.floor(Math.random() * trechosTrovao.length)];
          setTimeout(() => audio.tocarAmostra(bufferTrovao, { inicio, duracao: 5, volume: 0.9 * volumeLocal, ataque: 0.4, soltura: 1.5 }), aleatorio(400, 2200));
        }
        progresso.registrar('chuva:trovao');
      }
    }
    clarao = Math.max(0, clarao - dt * 0.9);

    /* Desenho */
    const { l, a, dpr } = tela;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingQuality = 'high';
    g.drawImage(desfocada, 0, 0, l, a);
    // Clarão (no máximo 8% de branco, e some devagar)
    if (clarao > 0) {
      g.fillStyle = `rgba(220,230,255,${clarao * 0.08})`;
      g.fillRect(0, 0, l, a);
    }
    g.drawImage(embacado, 0, 0, l, a);
    for (const gota of gotas) desenharGota(gota.x, gota.y, gota.r, gota.achatar);
    for (const gota of escorrendo) desenharGota(gota.x, gota.y, gota.r * 0.9, 1.25);
    // Moldura da janela
    g.strokeStyle = 'rgba(20,16,30,0.9)';
    g.lineWidth = 18;
    g.strokeRect(0, 0, l, a);
  });

  raiz.style.setProperty('--c1', '#9fd8ff');
  raiz.style.setProperty('--c2', '#ffb347');

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      laco?.parar(1);
      controles.destruir();
    },
  };
}
