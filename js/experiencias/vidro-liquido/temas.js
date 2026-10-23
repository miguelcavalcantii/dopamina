/**
 * Temas do Vidro Líquido. Cada tema define:
 *  - cores da interface e amostra do seletor
 *  - parâmetros do shader (animação própria, cor do brilho, tom da água...)
 *  - paleta da tinta e dos respingos, clima da música ambiente
 *  - `desenhar(ctx, l, a)`: pinta a imagem de fundo vista através da água
 */
import { geradorComSemente } from '../../core/util.js?v=202610231621';

const TAU = Math.PI * 2;

export const TEMAS = [
  {
    id: 'piscina',
    nome: 'Piscina',
    cores: ['#22e4ff', '#2f6bff'],
    amostra: 'linear-gradient(135deg, #3af2ff, #0a6cff)',
    animacao: 1,
    brilho: '#ffffff',
    agua: '#a8fbff',
    tingimento: 0.08,
    caustica: 0.7,
    refracao: 1,
    humor: 'calmo',
    tinta: ['#ff2e97', '#ffd60a', '#8b5cff', '#00ffa3', '#ff7a18'],
    respingo: ['#ffffff', '#b8fbff', '#3af2ff'],
    desenhar: desenharPiscina,
  },
  {
    id: 'por-do-sol',
    nome: 'Pôr do sol',
    cores: ['#ff8a00', '#ff2e97'],
    amostra: 'linear-gradient(180deg, #5b1fa8, #ff2e97 55%, #ffc94d)',
    animacao: 2,
    brilho: '#fff0c4',
    agua: '#ffd9b8',
    tingimento: 0.05,
    caustica: 0.55,
    refracao: 1,
    humor: 'crepusculo',
    tinta: ['#ffd60a', '#ff2e97', '#7b2ff7', '#00e5ff', '#ff5d3d'],
    respingo: ['#fff0c4', '#ffc94d', '#ff8fc8'],
    desenhar: desenharPorDoSol,
  },
  {
    id: 'galaxia',
    nome: 'Galáxia',
    cores: ['#c77dff', '#ff4fd8'],
    amostra: 'radial-gradient(circle at 35% 40%, #ff4fd8, #6a2bff 45%, #0a0420 78%)',
    animacao: 3,
    brilho: '#efe4ff',
    agua: '#ddd0ff',
    tingimento: 0.04,
    caustica: 0.6,
    refracao: 1.1,
    humor: 'cosmico',
    tinta: ['#00e5ff', '#ff4fd8', '#ffd60a', '#7bff4a', '#8b5cff'],
    respingo: ['#ffffff', '#e6d6ff', '#ff9be9'],
    desenhar: desenharGalaxia,
  },
  {
    id: 'aurora',
    nome: 'Aurora boreal',
    cores: ['#3cff9e', '#00c8ff'],
    amostra: 'linear-gradient(180deg, #041030, #0b6b6b 55%, #3cff9e)',
    animacao: 4,
    brilho: '#d4fff0',
    agua: '#c4f8ff',
    tingimento: 0.05,
    caustica: 0.6,
    refracao: 1,
    humor: 'aurora',
    tinta: ['#3cff9e', '#00c8ff', '#c56bff', '#ff5dc8', '#ffe45e'],
    respingo: ['#ffffff', '#9dffd2', '#9be8ff'],
    desenhar: desenharAurora,
  },
  {
    id: 'neon',
    nome: 'Neon',
    cores: ['#ff2bd6', '#00f0ff'],
    amostra: 'linear-gradient(135deg, #ff2bd6, #7b2bff 50%, #00f0ff)',
    animacao: 5,
    brilho: '#ffd6fb',
    agua: '#f2d0ff',
    tingimento: 0.04,
    caustica: 0.75,
    refracao: 1.15,
    humor: 'neon',
    tinta: ['#ff2bd6', '#00f0ff', '#ffd60a', '#a3ff12', '#ff7a18'],
    respingo: ['#ffffff', '#ff8ef0', '#7ff8ff'],
    desenhar: desenharNeon,
  },
];

/* ---------- Piscina com azulejos ---------- */

function desenharPiscina(ctx, l, a) {
  const rnd = geradorComSemente(7);
  const base = ctx.createLinearGradient(0, 0, l, a);
  base.addColorStop(0, '#29f4ff');
  base.addColorStop(0.45, '#00b2ff');
  base.addColorStop(1, '#1f4dff');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, l, a);

  const lado = Math.max(26, Math.min(l, a) / 12);
  const colunas = Math.ceil(l / lado) + 1;
  const linhas = Math.ceil(a / lado) + 1;
  const tons = ['rgba(130,255,255,0.24)', 'rgba(0,210,255,0.18)', 'rgba(80,150,255,0.16)', 'rgba(255,255,255,0.11)'];
  const raia = Math.floor(linhas * 0.62);

  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < colunas; x++) {
      const sorteio = rnd();
      let cor = tons[Math.floor(sorteio * tons.length)];
      const naRaia = (y === raia && x > 1 && x < colunas - 3) || ((x === 2 || x === colunas - 4) && Math.abs(y - raia) === 1);
      if (naRaia) cor = 'rgba(12,30,160,0.8)';
      else if (sorteio > 0.972) cor = rnd() > 0.5 ? 'rgba(255,93,200,0.6)' : 'rgba(255,228,94,0.65)';
      ctx.fillStyle = cor;
      ctx.fillRect(x * lado + 1, y * lado + 1, lado - 2, lado - 2);
    }
  }

  // Rejunte claro
  ctx.strokeStyle = 'rgba(232,255,255,0.6)';
  ctx.lineWidth = Math.max(1.5, lado * 0.07);
  ctx.beginPath();
  for (let x = 0; x <= colunas; x++) {
    ctx.moveTo(x * lado, 0);
    ctx.lineTo(x * lado, a);
  }
  for (let y = 0; y <= linhas; y++) {
    ctx.moveTo(0, y * lado);
    ctx.lineTo(l, y * lado);
  }
  ctx.stroke();

  // Sol entrando pela água e fundo mais profundo embaixo
  const luz = ctx.createRadialGradient(l * 0.2, a * 0.1, 0, l * 0.2, a * 0.1, Math.max(l, a) * 0.8);
  luz.addColorStop(0, 'rgba(255,255,255,0.35)');
  luz.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = luz;
  ctx.fillRect(0, 0, l, a);
  const profundidade = ctx.createLinearGradient(0, 0, 0, a);
  profundidade.addColorStop(0.55, 'rgba(0,20,130,0)');
  profundidade.addColorStop(1, 'rgba(0,20,130,0.35)');
  ctx.fillStyle = profundidade;
  ctx.fillRect(0, 0, l, a);
}

/* ---------- Pôr do sol tropical ---------- */

function desenharPorDoSol(ctx, l, a) {
  const rnd = geradorComSemente(11);
  const s = Math.min(l, a) / 1000;
  const horizonte = a * 0.58;

  const ceu = ctx.createLinearGradient(0, 0, 0, horizonte);
  ceu.addColorStop(0, '#1d0b52');
  ceu.addColorStop(0.35, '#6a1fb0');
  ceu.addColorStop(0.68, '#e8287f');
  ceu.addColorStop(0.9, '#ff7a3d');
  ceu.addColorStop(1, '#ffc94d');
  ctx.fillStyle = ceu;
  ctx.fillRect(0, 0, l, horizonte);

  const cx = l * 0.5;
  const raio = Math.min(l, a) * 0.15;
  const cy = horizonte - raio * 0.35;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, l, horizonte);
  ctx.clip();
  const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, raio * 4.5);
  aura.addColorStop(0, 'rgba(255,205,100,0.6)');
  aura.addColorStop(1, 'rgba(255,110,60,0)');
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, l, horizonte);
  const sol = ctx.createRadialGradient(cx, cy, 0, cx, cy, raio);
  sol.addColorStop(0, '#fff8d6');
  sol.addColorStop(0.6, '#ffd34d');
  sol.addColorStop(1, '#ff9a3d');
  ctx.fillStyle = sol;
  ctx.beginPath();
  ctx.arc(cx, cy, raio, 0, TAU);
  ctx.fill();
  // Nuvens alongadas
  for (let i = 0; i < 8; i++) {
    const y = horizonte * (0.18 + rnd() * 0.62);
    const alto = y < horizonte * 0.45;
    ctx.fillStyle = alto ? 'rgba(150,70,220,0.35)' : 'rgba(255,120,180,0.32)';
    ctx.beginPath();
    ctx.ellipse(rnd() * l, y, l * (0.1 + rnd() * 0.18), Math.max(4, (6 + rnd() * 10) * s * 1.6), 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  const mar = ctx.createLinearGradient(0, horizonte, 0, a);
  mar.addColorStop(0, '#ff7a5c');
  mar.addColorStop(0.25, '#c02a86');
  mar.addColorStop(0.7, '#4a1588');
  mar.addColorStop(1, '#1d0b52');
  ctx.fillStyle = mar;
  ctx.fillRect(0, horizonte, l, a - horizonte);

  // Reflexo do sol em listras
  for (let i = 0; i < 48; i++) {
    const t = i / 48;
    const y = horizonte + t ** 1.5 * (a - horizonte);
    const largura = raio * (1.9 - t * 1.1) * (0.6 + rnd() * 0.8);
    ctx.fillStyle = `rgba(255,${Math.floor(200 + rnd() * 40)},120,${0.75 * (1 - t) + 0.1})`;
    ctx.fillRect(cx - largura / 2 + (rnd() - 0.5) * raio * 0.4, y, largura, Math.max(2, 5 * s * (1 + t * 2)));
  }

  ilhaComPalmeira(ctx, l * 0.13, horizonte, Math.min(l, a) * 0.32, rnd);
  ilhaComPalmeira(ctx, l * 0.88, horizonte, Math.min(l, a) * 0.2, rnd);

  ctx.fillStyle = 'rgba(255,232,170,0.85)';
  ctx.fillRect(0, horizonte - 1.5 * s, l, Math.max(2, 3 * s));
}

function ilhaComPalmeira(ctx, x, y, largura, rnd) {
  ctx.fillStyle = '#2a0838';
  ctx.strokeStyle = '#2a0838';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(x, y, largura / 2, largura * 0.1, 0, Math.PI, 0);
  ctx.fill();

  const altura = largura * 0.85;
  const topoX = x + largura * 0.14;
  const topoY = y - altura;
  ctx.lineWidth = Math.max(3, largura * 0.04);
  ctx.beginPath();
  ctx.moveTo(x - largura * 0.04, y - largura * 0.04);
  ctx.quadraticCurveTo(x + largura * 0.16, y - altura * 0.5, topoX, topoY);
  ctx.stroke();

  ctx.lineWidth = Math.max(2, largura * 0.028);
  for (let i = 0; i < 8; i++) {
    const ang = -Math.PI + (i / 7) * Math.PI + (rnd() - 0.5) * 0.3;
    const comp = largura * (0.3 + rnd() * 0.12);
    ctx.beginPath();
    ctx.moveTo(topoX, topoY);
    ctx.quadraticCurveTo(
      topoX + Math.cos(ang) * comp * 0.55, topoY - comp * 0.3,
      topoX + Math.cos(ang) * comp, topoY + Math.abs(Math.sin(ang)) * -comp * 0.1 + comp * 0.32,
    );
    ctx.stroke();
  }
}

/* ---------- Galáxia ---------- */

function desenharGalaxia(ctx, l, a) {
  const rnd = geradorComSemente(23);
  const s = Math.min(l, a) / 1000;
  const maior = Math.max(l, a);
  ctx.fillStyle = '#06021a';
  ctx.fillRect(0, 0, l, a);
  ctx.globalCompositeOperation = 'lighter';

  nebulosa(ctx, l, a, l * 0.25, a * 0.35, maior * 0.55, 'rgba(255,46,170,0.42)');
  nebulosa(ctx, l, a, l * 0.75, a * 0.72, maior * 0.55, 'rgba(110,40,255,0.48)');
  nebulosa(ctx, l, a, l * 0.6, a * 0.22, maior * 0.4, 'rgba(0,200,255,0.3)');
  nebulosa(ctx, l, a, l * 0.12, a * 0.88, maior * 0.35, 'rgba(255,140,40,0.24)');

  // Galáxia espiral de dois braços
  const cx = l * 0.6;
  const cy = a * 0.47;
  const raio = Math.min(l, a) * 0.42;
  const rot = -0.35;
  for (let i = 0; i < 2800; i++) {
    const t = rnd() ** 0.6;
    const ang = t * 5.2 + (i % 2) * Math.PI + (rnd() - 0.5) * 0.7 * (1 - t * 0.5);
    const x = Math.cos(ang) * t * raio;
    const y = Math.sin(ang) * t * raio * 0.5;
    const tam = (rnd() * 1.6 + 0.4) * Math.max(1, s * 2);
    ctx.fillStyle = `hsla(${290 - t * 110}, 100%, ${70 + (1 - t) * 20}%, 0.55)`;
    ctx.fillRect(cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot), tam, tam);
  }
  const nucleo = ctx.createRadialGradient(cx, cy, 0, cx, cy, raio * 0.3);
  nucleo.addColorStop(0, 'rgba(255,240,255,0.95)');
  nucleo.addColorStop(0.4, 'rgba(255,120,220,0.4)');
  nucleo.addColorStop(1, 'rgba(255,120,220,0)');
  ctx.fillStyle = nucleo;
  ctx.fillRect(0, 0, l, a);

  estrelas(ctx, l, a, 700, rnd, s, 1);

  // Algumas estrelas grandes com cruz de brilho
  for (let i = 0; i < 14; i++) {
    const x = rnd() * l;
    const y = rnd() * a;
    const r = (6 + rnd() * 10) * Math.max(1, s * 1.5);
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    halo.addColorStop(0, 'rgba(255,255,255,0.9)');
    halo.addColorStop(1, 'rgba(200,170,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x - r * 2.5, y - 0.6, r * 5, 1.2);
    ctx.fillRect(x - 0.6, y - r * 2.5, 1.2, r * 5);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function nebulosa(ctx, l, a, x, y, r, cor) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, cor);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, l, a);
}

function estrelas(ctx, l, a, quantidade, rnd, s, limiteY) {
  for (let i = 0; i < quantidade; i++) {
    const tam = rnd() ** 3 * 2.4 * Math.max(1, s * 2) + 0.6;
    const matiz = rnd();
    ctx.fillStyle = matiz > 0.85 ? `rgba(255,190,240,${0.5 + rnd() * 0.5})` : matiz > 0.7 ? `rgba(180,220,255,${0.5 + rnd() * 0.5})` : `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
    ctx.fillRect(rnd() * l, rnd() * a * limiteY, tam, tam);
  }
}

/* ---------- Aurora boreal ---------- */

function desenharAurora(ctx, l, a) {
  const rnd = geradorComSemente(31);
  const s = Math.min(l, a) / 1000;
  const ceu = ctx.createLinearGradient(0, 0, 0, a);
  ceu.addColorStop(0, '#020617');
  ceu.addColorStop(0.45, '#071d40');
  ceu.addColorStop(0.75, '#0a3d58');
  ceu.addColorStop(1, '#0f5c5c');
  ctx.fillStyle = ceu;
  ctx.fillRect(0, 0, l, a);
  estrelas(ctx, l, a, 420, rnd, s, 0.7);

  // Cortinas: faixas verticais finas com degradê que some para cima
  ctx.globalCompositeOperation = 'lighter';
  const faixas = [
    { base: 0.44, amp: 0.08, freq: 1.6, fase: 0.3, altura: 0.32, cor: '60,255,158' },
    { base: 0.34, amp: 0.06, freq: 2.3, fase: 2.1, altura: 0.22, cor: '0,200,255' },
    { base: 0.52, amp: 0.05, freq: 1.1, fase: 4.0, altura: 0.2, cor: '197,107,255' },
  ];
  const passo = Math.max(2, Math.round(3 * s * 2));
  for (const f of faixas) {
    const g = ctx.createLinearGradient(0, 0, 0, -100);
    g.addColorStop(0, `rgba(${f.cor},0.6)`);
    g.addColorStop(0.12, `rgba(${f.cor},0.4)`);
    g.addColorStop(1, `rgba(${f.cor},0)`);
    ctx.fillStyle = g;
    for (let x = 0; x < l; x += passo) {
      const u = x / l;
      const y = a * (f.base + f.amp * Math.sin(u * TAU * f.freq + f.fase) + 0.015 * Math.sin(u * 40 + f.fase));
      const alt = a * f.altura * (0.55 + 0.45 * Math.sin(u * 23 + f.fase * 3) ** 2);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, alt / 100);
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(u * 9 + f.fase));
      ctx.fillRect(0, -100, passo + 0.5, 104);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  montanhas(ctx, l, a, a * 0.74, '#082040', rnd, 0.14);
  montanhas(ctx, l, a, a * 0.83, '#030c1c', rnd, 0.1);
}

function montanhas(ctx, l, a, base, cor, rnd, amplitude) {
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.moveTo(0, a);
  ctx.lineTo(0, base);
  let x = 0;
  let pico = true;
  while (x < l) {
    x += l * (0.04 + rnd() * 0.07);
    ctx.lineTo(x, base - (pico ? 0.5 + rnd() * 0.5 : rnd() * 0.3) * a * amplitude);
    pico = !pico;
  }
  ctx.lineTo(l, a);
  ctx.closePath();
  ctx.fill();
}

/* ---------- Neon / synthwave ---------- */

function desenharNeon(ctx, l, a) {
  const rnd = geradorComSemente(41);
  const s = Math.min(l, a) / 1000;
  const horizonte = a * 0.56;

  const ceu = ctx.createLinearGradient(0, 0, 0, horizonte);
  ceu.addColorStop(0, '#0b0225');
  ceu.addColorStop(0.6, '#2a0657');
  ceu.addColorStop(1, '#7a1286');
  ctx.fillStyle = ceu;
  ctx.fillRect(0, 0, l, horizonte);
  estrelas(ctx, l, horizonte, 160, rnd, s, 0.8);

  const cx = l / 2;
  const raio = Math.min(l, a) * 0.22;
  const cy = horizonte - raio * 0.3;
  const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, raio * 3);
  aura.addColorStop(0, 'rgba(255,60,200,0.55)');
  aura.addColorStop(1, 'rgba(255,60,200,0)');
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, l, horizonte);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, l, horizonte);
  ctx.clip();
  const sol = ctx.createLinearGradient(0, cy - raio, 0, cy + raio);
  sol.addColorStop(0, '#ffe14d');
  sol.addColorStop(0.5, '#ff7a3d');
  sol.addColorStop(1, '#ff2bd6');
  ctx.fillStyle = sol;
  ctx.beginPath();
  ctx.arc(cx, cy, raio, 0, TAU);
  ctx.fill();
  // Listras horizontais recortando o sol (pintadas com o próprio céu)
  ctx.fillStyle = ceu;
  for (let i = 0; i < 8; i++) ctx.fillRect(cx - raio, cy - raio * (0.25 - i * 0.075), raio * 2, raio * (0.015 + i * 0.012));
  ctx.restore();

  // Montanhas em linha neon
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 14 * Math.max(1, s * 2);
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = Math.max(1.5, 2.2 * s * 2);
  ctx.fillStyle = '#16003a';
  for (const lado of [-1, 1]) {
    ctx.beginPath();
    let x = cx + lado * raio * 1.2;
    ctx.moveTo(x, horizonte);
    while (lado < 0 ? x > -20 : x < l + 20) {
      x += lado * l * (0.03 + rnd() * 0.05);
      ctx.lineTo(x, horizonte - rnd() * a * 0.12);
      x += lado * l * (0.02 + rnd() * 0.03);
      ctx.lineTo(x, horizonte - rnd() * a * 0.03);
    }
    ctx.lineTo(x, horizonte);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  const chao = ctx.createLinearGradient(0, horizonte, 0, a);
  chao.addColorStop(0, '#1e0042');
  chao.addColorStop(1, '#07000f');
  ctx.fillStyle = chao;
  ctx.fillRect(0, horizonte, l, a - horizonte);

  ctx.save();
  ctx.shadowColor = '#ff2bd6';
  ctx.shadowBlur = 12 * Math.max(1, s * 2);
  ctx.strokeStyle = '#ff3bdc';
  ctx.lineWidth = Math.max(1.5, 2.4 * s * 2);
  ctx.beginPath();
  for (let i = -26; i <= 26; i++) {
    ctx.moveTo(cx + i * l * 0.012, horizonte);
    ctx.lineTo(cx + i * l * 0.12, a);
  }
  for (let k = 1; k <= 14; k++) {
    const z = k / 14;
    const y = horizonte + (a - horizonte) * z * z;
    ctx.moveTo(0, y);
    ctx.lineTo(l, y);
  }
  ctx.stroke();
  ctx.restore();

  // Linha do horizonte e formas flutuantes
  ctx.save();
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 18 * Math.max(1, s * 2);
  ctx.fillStyle = '#9ffcff';
  ctx.fillRect(0, horizonte - 1.5, l, 3);
  ctx.lineWidth = Math.max(2, 4 * s * 2);
  ctx.strokeStyle = '#00f0ff';
  ctx.beginPath();
  const tx = l * 0.16;
  const ty = a * 0.2;
  const tr = Math.min(l, a) * 0.07;
  for (let i = 0; i < 3; i++) ctx.lineTo(tx + Math.cos(i / 3 * TAU - Math.PI / 2) * tr, ty + Math.sin(i / 3 * TAU - Math.PI / 2) * tr);
  ctx.closePath();
  ctx.stroke();
  ctx.shadowColor = '#ffd60a';
  ctx.strokeStyle = '#ffd60a';
  ctx.beginPath();
  ctx.arc(l * 0.84, a * 0.18, tr * 0.8, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
