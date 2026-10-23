/**
 * Camada 2D por cima da água: bolhas de sabão, respingos, anéis de estouro
 * e textos flutuantes de combo. Coordenadas em pixels CSS.
 */
import { aleatorio, escolher } from '../../core/util.js?v=202610231621';

const TAU = Math.PI * 2;
const GRAVIDADE = 620;
const MAX_PARTICULAS = 500;

export class CamadaEfeitos {
  bolhas = [];
  particulas = [];
  aneis = [];
  textos = [];
  largura = 1;
  altura = 1;
  #tempo = 0;
  #vazia = true;

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  redimensionar(largura, altura) {
    this.largura = largura;
    this.altura = altura;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(largura * this.dpr);
    this.canvas.height = Math.round(altura * this.dpr);
    this.bolhas = this.bolhas.filter((b) => b.x < largura);
  }

  /* ---------- Bolhas ---------- */

  get bolhasAtivas() {
    return this.bolhas.filter((b) => !b.saindo).length;
  }

  criarBolha() {
    const escala = Math.min(this.largura, this.altura) < 600 ? 0.8 : 1;
    const r = aleatorio(16, 46) * escala;
    this.bolhas.push({
      x: aleatorio(r, this.largura - r),
      y: this.altura + r + aleatorio(0, 60),
      r,
      vy: aleatorio(30, 70),
      fase: aleatorio(0, TAU),
      matiz: aleatorio(0, 360),
      escala: 0,
      saindo: false,
    });
  }

  /** Estoura as bolhas que tocam o ponto. Devolve a lista das estouradas. */
  estourarEm(x, y, folga) {
    const estouradas = [];
    this.bolhas = this.bolhas.filter((b) => {
      if (b.saindo || Math.hypot(b.x - x, b.y - y) > b.r + folga) return true;
      estouradas.push(b);
      this.#explosaoDeBolha(b);
      return false;
    });
    return estouradas;
  }

  /** Bolhas encolhem e somem (ao trocar de modo). */
  dispensarBolhas() {
    for (const b of this.bolhas) b.saindo = true;
  }

  #explosaoDeBolha(b) {
    const quantidade = Math.round(10 + b.r / 3);
    for (let i = 0; i < quantidade; i++) {
      const ang = (i / quantidade) * TAU + aleatorio(-0.2, 0.2);
      const vel = aleatorio(90, 220);
      this.#adicionarParticula({
        x: b.x + Math.cos(ang) * b.r * 0.8,
        y: b.y + Math.sin(ang) * b.r * 0.8,
        vx: Math.cos(ang) * vel,
        vy: Math.sin(ang) * vel,
        tamanho: aleatorio(1.6, 3.4),
        cor: `hsl(${(b.matiz + i * 25) % 360}, 100%, 75%)`,
        vida: aleatorio(0.45, 0.75),
        gravidade: 0.4,
      });
    }
    this.aneis.push({ x: b.x, y: b.y, r: b.r, vida: 1 });
  }

  /* ---------- Respingos e textos ---------- */

  respingo(x, y, cores, quantidade = 10, forca = 1) {
    for (let i = 0; i < quantidade; i++) {
      const ang = aleatorio(-Math.PI * 0.95, -Math.PI * 0.05);
      const vel = aleatorio(140, 340) * forca;
      this.#adicionarParticula({
        x,
        y,
        vx: Math.cos(ang) * vel,
        vy: Math.sin(ang) * vel,
        tamanho: aleatorio(1.8, 4),
        cor: escolher(cores),
        vida: aleatorio(0.5, 0.9),
        gravidade: 1,
      });
    }
  }

  textoFlutuante(x, y, texto, cor) {
    this.textos.push({ x, y, texto, cor, vida: 1 });
  }

  #adicionarParticula(p) {
    p.vidaTotal = p.vida;
    this.particulas.push(p);
    if (this.particulas.length > MAX_PARTICULAS) this.particulas.splice(0, this.particulas.length - MAX_PARTICULAS);
  }

  /* ---------- Atualização e desenho ---------- */

  atualizar(dt) {
    this.#tempo += dt;
    const t = this.#tempo;

    for (const b of this.bolhas) {
      b.y -= b.vy * dt;
      b.x += Math.sin(b.fase + t * 1.6) * 14 * dt;
      b.escala = b.saindo ? b.escala - dt * 3 : Math.min(1, b.escala + dt * 2.5);
    }
    this.bolhas = this.bolhas.filter((b) => b.y > -b.r * 2 && b.escala > 0);

    for (const p of this.particulas) {
      p.vy += GRAVIDADE * p.gravidade * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= dt;
    }
    this.particulas = this.particulas.filter((p) => p.vida > 0);

    for (const anel of this.aneis) anel.vida -= dt * 3;
    this.aneis = this.aneis.filter((a) => a.vida > 0);

    for (const texto of this.textos) {
      texto.y -= 50 * dt;
      texto.vida -= dt * 0.9;
    }
    this.textos = this.textos.filter((x) => x.vida > 0);
  }

  desenhar() {
    const { ctx } = this;
    const vazia = !this.bolhas.length && !this.particulas.length && !this.aneis.length && !this.textos.length;
    if (vazia && this.#vazia) return;
    this.#vazia = vazia;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.largura, this.altura);
    if (vazia) return;

    for (const b of this.bolhas) this.#desenharBolha(b);

    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particulas) {
      ctx.globalAlpha = Math.min(1, (p.vida / p.vidaTotal) * 1.4);
      ctx.fillStyle = p.cor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.tamanho, 0, TAU);
      ctx.fill();
    }
    for (const anel of this.aneis) {
      ctx.globalAlpha = anel.vida * 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * anel.vida;
      ctx.beginPath();
      ctx.arc(anel.x, anel.y, anel.r * (1 + (1 - anel.vida) * 0.7), 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const texto of this.textos) {
      const escala = 1 + Math.max(0, texto.vida - 0.8) * 2;
      ctx.globalAlpha = Math.min(1, texto.vida * 1.6);
      ctx.font = `${Math.round(26 * escala)}px Bungee, sans-serif`;
      ctx.shadowColor = texto.cor;
      ctx.shadowBlur = 18;
      ctx.fillStyle = texto.cor;
      ctx.fillText(texto.texto, texto.x, texto.y);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(texto.texto, texto.x, texto.y - 2);
    }
    ctx.globalAlpha = 1;
  }

  #desenharBolha(b) {
    const { ctx } = this;
    const r = b.r * Math.max(0, b.escala);
    if (r < 0.5) return;
    ctx.save();
    ctx.translate(b.x, b.y);

    // Corpo transparente com borda tingida
    const corpo = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    corpo.addColorStop(0, 'rgba(255,255,255,0.06)');
    corpo.addColorStop(0.65, `hsla(${b.matiz}, 100%, 75%, 0.16)`);
    corpo.addColorStop(1, `hsla(${b.matiz + 60}, 100%, 80%, 0.65)`);
    ctx.fillStyle = corpo;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // Borda iridescente que gira devagar
    ctx.lineWidth = 2.2;
    if (ctx.createConicGradient) {
      const borda = ctx.createConicGradient(this.#tempo * 0.8 + b.fase, 0, 0);
      borda.addColorStop(0, 'rgba(255,90,200,0.85)');
      borda.addColorStop(0.33, 'rgba(90,240,255,0.85)');
      borda.addColorStop(0.66, 'rgba(255,240,120,0.85)');
      borda.addColorStop(1, 'rgba(255,90,200,0.85)');
      ctx.strokeStyle = borda;
    } else {
      ctx.strokeStyle = `hsla(${b.matiz}, 100%, 80%, 0.8)`;
    }
    ctx.stroke();

    // Reflexos de luz
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.11, -0.7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(r * 0.4, r * 0.38, r * 0.07, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
