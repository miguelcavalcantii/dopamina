/**
 * Mesa de sons: misture ambientes gravados (CC0) em laço, cada um com o seu volume.
 * Chuva, fogueira, ondas, floresta e café. A cena ao fundo reage ao que está tocando
 * (riscos de chuva, brasas, ondas, vaga-lumes, vapor). Misturas prontas e um timer
 * que abaixa tudo devagar até desligar (bom para dormir).
 */
import { criarCanvasResponsivo } from '../../core/canvas.js';
import { icone } from '../../core/icones.js';
import { ler, gravar } from '../../core/armazenamento.js';
import { htmlControlesAsmr, ligarControlesAsmr } from '../../core/asmr.js';
import { atualizarDeslizador } from '../../core/ui.js';
import { aleatorio, carregarEstilo, clamp, movimentoReduzido } from '../../core/util.js';

const TAU = Math.PI * 2;
const som = (nome) => new URL(`../../../assets/sons/asmr/${nome}.mp3`, import.meta.url);

const CANAIS = [
  { id: 'chuva', nome: 'Chuva', icone: 'chuva', cor: '#7fb8ff', arquivo: 'mesa-chuva' },
  { id: 'fogueira', nome: 'Fogueira', icone: 'fogos', cor: '#ff8a3c', arquivo: 'mesa-fogueira' },
  { id: 'ondas', nome: 'Ondas', icone: 'onda', cor: '#3cd6ff', arquivo: 'mesa-ondas' },
  { id: 'floresta', nome: 'Floresta', icone: 'flor', cor: '#7bff8a', arquivo: 'mesa-floresta' },
  { id: 'cafe', nome: 'Café', icone: 'xicara', cor: '#e0b07a', arquivo: 'mesa-cafe' },
];
const MISTURAS = [
  { id: 'cafe-chuvoso', nome: 'Café chuvoso', volumes: { chuva: 0.7, cafe: 0.55 } },
  { id: 'praia', nome: 'Noite na praia', volumes: { ondas: 0.8, fogueira: 0.35 } },
  { id: 'acampamento', nome: 'Acampamento', volumes: { fogueira: 0.8, floresta: 0.5 } },
  { id: 'floresta-molhada', nome: 'Floresta molhada', volumes: { floresta: 0.7, chuva: 0.5 } },
  { id: 'silencio', nome: 'Silêncio', volumes: {} },
];
const TIMERS = [0, 15, 30, 60];

export async function montar(raiz, { audio, progresso, aoQuadro }) {
  await carregarEstilo(new URL('../../../css/experiencias/mesa-sons.css', import.meta.url));

  const salvo = ler('mesa-sons', {});
  const estado = Object.fromEntries(CANAIS.map((c) => [c.id, { ligado: false, volume: 0.6, ...(salvo.canais?.[c.id] ?? {}) }]));
  if (!salvo.canais) estado.chuva.ligado = true; // primeira vez: começa com chuva
  const salvar = () => gravar('mesa-sons', { canais: estado });

  raiz.classList.add('mesa');
  raiz.innerHTML = `
    <canvas class="mesa__cena" aria-hidden="true"></canvas>
    <div class="mesa__painel" data-sem-clique>
      <div class="mesa__canais">
        ${CANAIS.map((c) => `
          <section class="canal" data-canal="${c.id}" style="--cor:${c.cor}" aria-label="${c.nome}">
            <button type="button" class="canal__botao" data-ligar="${c.id}" aria-pressed="false" aria-label="Ligar ${c.nome}">
              ${icone(c.icone)}
            </button>
            <span class="canal__nome">${c.nome}</span>
            <span class="canal__barras" aria-hidden="true">${'<i></i>'.repeat(5)}</span>
            <input type="range" class="deslizador canal__volume" min="0" max="100" data-volume="${c.id}" aria-label="Volume de ${c.nome}">
          </section>`).join('')}
      </div>
      <div class="mesa__misturas" role="group" aria-label="Misturas prontas">
        ${MISTURAS.map((m) => `<button type="button" class="chip" data-mistura="${m.id}">${m.nome}</button>`).join('')}
      </div>
    </div>
    <div class="doca vidro-fosco mesa__doca" role="region" aria-label="Opções da mesa de sons">
      <div class="doca__linha">
        <span class="doca__rotulo">DESLIGAR</span>
        ${TIMERS.map((m) => `<button type="button" class="chip" data-timer="${m}" aria-pressed="${m === 0}">${m ? `${m} min` : 'Nunca'}</button>`).join('')}
        <span class="mesa__restante" data-restante></span>
      </div>
      ${htmlControlesAsmr(0.8)}
    </div>`;

  const $ = (seletor) => raiz.querySelector(seletor);
  const cena = $('.mesa__cena');
  const g = cena.getContext('2d');
  let tela = { l: 1, a: 1, dpr: 1 };
  let volumeGeral = 0.8;
  let fadeTimer = 1;
  let timer = { minutos: 0, restante: 0 };
  const lacos = new Map();
  const buffers = new Map();
  const nivelVisual = Object.fromEntries(CANAIS.map((c) => [c.id, 0]));
  let tempo = 0;

  const controles = ligarControlesAsmr(raiz, { chave: 'mesa-sons', aoMudarVolume: (v) => { volumeGeral = v; aplicarVolumes(); } });

  // Carrega cada som só uma vez; o laço nasce quando o som é ligado (e o áudio já existe)
  for (const c of CANAIS) audio.carregarAmostra(som(c.arquivo)).then((b) => { buffers.set(c.id, b); aplicarVolumes(); });

  function aplicarVolumes() {
    for (const c of CANAIS) {
      const { ligado, volume } = estado[c.id];
      const alvo = ligado ? volume * volumeGeral * fadeTimer : 0;
      let laco = lacos.get(c.id);
      if (!laco && alvo > 0 && buffers.get(c.id) && audio.ativo) {
        laco = audio.iniciarLaco(buffers.get(c.id), { volume: 0 });
        lacos.set(c.id, laco);
      }
      laco?.volume(alvo * 1.1, 0.5);
    }
  }

  function atualizarCanais() {
    for (const c of CANAIS) {
      const { ligado, volume } = estado[c.id];
      const secao = raiz.querySelector(`[data-canal="${c.id}"]`);
      secao.classList.toggle('canal--ligado', ligado);
      const botao = secao.querySelector('[data-ligar]');
      botao.setAttribute('aria-pressed', String(ligado));
      botao.setAttribute('aria-label', `${ligado ? 'Desligar' : 'Ligar'} ${c.nome}`);
      const entrada = secao.querySelector('[data-volume]');
      entrada.value = String(Math.round(volume * 100));
      atualizarDeslizador(entrada);
    }
    const simultaneos = CANAIS.filter((c) => estado[c.id].ligado).length;
    progresso.definirRecorde('mesa-sons', 'simultaneos', simultaneos);
  }

  /* ---------- Controles ---------- */

  raiz.addEventListener('click', (e) => {
    const ligar = e.target.closest('[data-ligar]');
    if (ligar) {
      const id = ligar.dataset.ligar;
      estado[id].ligado = !estado[id].ligado;
      audio.tocar('alternar');
      if (estado[id].ligado) progresso.registrar('mesa:som', 1, id);
    }
    const mistura = e.target.closest('[data-mistura]');
    if (mistura) {
      const m = MISTURAS.find((x) => x.id === mistura.dataset.mistura);
      for (const c of CANAIS) {
        estado[c.id].ligado = c.id in m.volumes;
        if (c.id in m.volumes) estado[c.id].volume = m.volumes[c.id];
      }
      audio.tocar('tema');
      progresso.registrar('mesa:mistura', 1, m.id);
    }
    const botaoTimer = e.target.closest('[data-timer]');
    if (botaoTimer) {
      timer = { minutos: Number(botaoTimer.dataset.timer), restante: Number(botaoTimer.dataset.timer) * 60 };
      fadeTimer = 1;
      raiz.querySelectorAll('[data-timer]').forEach((b) => b.setAttribute('aria-pressed', String(b === botaoTimer)));
    }
    if (ligar || mistura || botaoTimer) {
      atualizarCanais();
      aplicarVolumes();
      salvar();
    }
  });
  raiz.addEventListener('input', (e) => {
    const entrada = e.target.closest('[data-volume]');
    if (!entrada) return;
    const id = entrada.dataset.volume;
    estado[id].volume = Number(entrada.value) / 100;
    if (!estado[id].ligado && estado[id].volume > 0) estado[id].ligado = true;
    atualizarCanais();
    aplicarVolumes();
    salvar();
  });

  /* ---------- Cena reagindo aos sons ---------- */

  const gotas = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), v: aleatorio(0.6, 1.2) }));
  const brasas = Array.from({ length: 40 }, () => ({ x: aleatorio(0.4, 0.6), y: 1, v: aleatorio(0.05, 0.15), fase: aleatorio(0, TAU) }));
  const vagalumes = Array.from({ length: 24 }, () => ({ x: Math.random(), y: aleatorio(0.3, 0.8), fase: aleatorio(0, TAU) }));

  const canvasResponsivo = criarCanvasResponsivo(cena, {
    maxDpr: 1.5,
    aoRedimensionar: (e) => { tela = { l: e.largura, a: e.altura, dpr: e.dpr }; },
  });

  function desenharCena(dt) {
    const { l, a, dpr } = tela;
    const n = nivelVisual;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Céu: mistura de tons conforme os sons ligados
    const ceu = g.createLinearGradient(0, 0, 0, a);
    ceu.addColorStop(0, `rgb(${8 + n.cafe * 30},${10 + n.floresta * 20},${28 + n.ondas * 30})`);
    ceu.addColorStop(1, `rgb(${20 + n.fogueira * 50 + n.cafe * 30},${14 + n.floresta * 30},${36 + n.chuva * 20})`);
    g.fillStyle = ceu;
    g.fillRect(0, 0, l, a);
    const parado = movimentoReduzido();

    // Ondas: faixas que sobem e descem no pé da tela
    if (n.ondas > 0.01) {
      for (let k = 0; k < 3; k++) {
        g.fillStyle = `rgba(60,214,255,${n.ondas * (0.12 + k * 0.05)})`;
        g.beginPath();
        g.moveTo(0, a);
        for (let x = 0; x <= l; x += 12) g.lineTo(x, a * (0.8 + k * 0.06) + Math.sin(x * 0.008 + tempo * (0.6 + k * 0.2) + k) * 14);
        g.lineTo(l, a);
        g.fill();
      }
    }
    // Floresta: vaga-lumes piscando
    if (n.floresta > 0.01) {
      for (const v of vagalumes) {
        v.fase += dt;
        const x = (v.x + Math.sin(v.fase * 0.3) * 0.02) * l;
        const y = (v.y + Math.cos(v.fase * 0.25) * 0.02) * a;
        g.fillStyle = `rgba(200,255,140,${n.floresta * Math.max(0, Math.sin(v.fase * 1.7)) * 0.8})`;
        g.beginPath();
        g.arc(x, y, 2.4, 0, TAU);
        g.fill();
      }
    }
    // Fogueira: brilho quente embaixo e brasas subindo
    if (n.fogueira > 0.01) {
      const fogo = g.createRadialGradient(l / 2, a * 1.05, 0, l / 2, a * 1.05, a * 0.6);
      fogo.addColorStop(0, `rgba(255,140,60,${n.fogueira * (0.45 + Math.sin(tempo * 7) * 0.05)})`);
      fogo.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = fogo;
      g.fillRect(0, 0, l, a);
      for (const b of brasas) {
        if (!parado) {
          b.y -= b.v * dt;
          b.x += Math.sin(tempo * 2 + b.fase) * 0.0006;
        }
        if (b.y < 0.35) {
          b.y = 1;
          b.x = aleatorio(0.4, 0.6);
        }
        g.fillStyle = `rgba(255,${150 + (1 - b.y) * 80},80,${n.fogueira * clamp((b.y - 0.35) * 2, 0, 1)})`;
        g.fillRect(b.x * l, b.y * a, 2, 2);
      }
    }
    // Café: vapor ondulando
    if (n.cafe > 0.01) {
      g.strokeStyle = `rgba(255,240,220,${n.cafe * 0.25})`;
      g.lineWidth = 6;
      g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        const x0 = l * (0.78 + k * 0.03);
        for (let y = a * 0.75; y > a * 0.4; y -= 8) g.lineTo(x0 + Math.sin(y * 0.03 - tempo * 2 + k) * 10, y);
        g.stroke();
      }
    }
    // Chuva: riscos inclinados
    if (n.chuva > 0.01) {
      g.strokeStyle = `rgba(180,210,255,${n.chuva * 0.45})`;
      g.lineWidth = 1.2;
      g.beginPath();
      for (const d of gotas) {
        if (!parado) {
          d.y += d.v * dt * 1.4;
          if (d.y > 1) {
            d.y = 0;
            d.x = Math.random();
          }
        }
        const x = d.x * l;
        const y = d.y * a;
        g.moveTo(x, y);
        g.lineTo(x - 4, y + 16);
      }
      g.stroke();
    }
  }

  /* ---------- Loop ---------- */

  let ultimoAudioAtivo = false;
  const pararLoop = aoQuadro((dt) => {
    tempo += dt;
    // O áudio só existe depois do primeiro gesto: quando ele nasce, liga os laços
    if (audio.ativo && !ultimoAudioAtivo) aplicarVolumes();
    ultimoAudioAtivo = audio.ativo;

    for (const c of CANAIS) {
      const alvo = estado[c.id].ligado ? estado[c.id].volume : 0;
      nivelVisual[c.id] += (alvo - nivelVisual[c.id]) * Math.min(1, dt * 2);
      // Barrinhas do visualizador dançando com o nível
      const barras = raiz.querySelectorAll(`[data-canal="${c.id}"] .canal__barras i`);
      barras.forEach((barra, i) => {
        const altura = nivelVisual[c.id] * (0.35 + 0.65 * Math.abs(Math.sin(tempo * (2 + i * 0.7) + i)));
        barra.style.transform = `scaleY(${altura.toFixed(3)})`;
      });
    }

    if (timer.minutos) {
      timer.restante -= dt;
      // Últimos 60 s: abaixa tudo devagar
      const novo = clamp(timer.restante / 60, 0, 1);
      if (Math.abs(novo - fadeTimer) > 0.01) {
        fadeTimer = novo;
        aplicarVolumes();
      }
      const minutos = Math.max(0, Math.ceil(timer.restante / 60));
      $('[data-restante]').textContent = timer.restante > 0 ? `faltam ${minutos} min` : 'boa noite';
      if (timer.restante <= 0) {
        for (const c of CANAIS) estado[c.id].ligado = false;
        timer = { minutos: 0, restante: 0 };
        fadeTimer = 1;
        atualizarCanais();
        aplicarVolumes();
        raiz.querySelectorAll('[data-timer]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.timer === '0')));
      }
    } else {
      $('[data-restante]').textContent = '';
    }
    desenharCena(dt);
  });

  raiz.style.setProperty('--c1', '#7fb8ff');
  raiz.style.setProperty('--c2', '#ff8a3c');
  atualizarCanais();
  raiz.querySelector('[data-ligar]').setAttribute('data-foco-inicial', '');

  return {
    destruir() {
      pararLoop();
      canvasResponsivo.destruir();
      for (const laco of lacos.values()) laco.parar(0.6);
      controles.destruir();
    },
  };
}
