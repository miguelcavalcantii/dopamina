/**
 * Mini-animações dos cards do hub. Cada função desenha um quadro em
 * coordenadas CSS: (ctx, largura, altura, tempo, [cor1, cor2]).
 */

const TAU = Math.PI * 2;
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const suavizarSaida = (t) => 1 - (1 - t) ** 3;

function degrade(ctx, l, a, inicio, fim, vertical = false) {
  const g = vertical ? ctx.createLinearGradient(0, 0, 0, a) : ctx.createLinearGradient(0, 0, l, a);
  g.addColorStop(0, inicio);
  g.addColorStop(1, fim);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, l, a);
}

function brilhoCanto(ctx, l, a) {
  const g = ctx.createRadialGradient(l * 0.15, a * 0.1, 0, l * 0.15, a * 0.1, l * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, l, a);
}

export const PREVIAS = {
  vidro(ctx, l, a, t) {
    degrade(ctx, l, a, '#1f4dff', '#18e8ff');
    // Rejunte de azulejos ondulando como se visto através da água
    ctx.strokeStyle = 'rgba(220,255,255,0.28)';
    ctx.lineWidth = 1.2;
    const lado = 24;
    ctx.beginPath();
    for (let x = 0; x <= l + lado; x += lado) {
      for (let y = 0; y <= a; y += 6) {
        const px = x + Math.sin(y * 0.06 + t * 2.2) * 2.5;
        if (y === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
    }
    for (let y = 0; y <= a + lado; y += lado) {
      for (let x = 0; x <= l; x += 6) {
        const py = y + Math.sin(x * 0.06 + t * 1.8) * 2.5;
        if (x === 0) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
    }
    ctx.stroke();
    // Ondas concêntricas nascendo de três pontos
    const fontes = [[0.28, 0.45, 0], [0.7, 0.62, 0.45], [0.55, 0.28, 0.8]];
    for (const [fx, fy, atraso] of fontes) {
      for (let k = 0; k < 3; k++) {
        const fase = (t * 0.45 + atraso + k / 3) % 1;
        ctx.strokeStyle = `rgba(255,255,255,${(1 - fase) * 0.75})`;
        ctx.lineWidth = 2.5 * (1 - fase) + 0.5;
        ctx.beginPath();
        ctx.arc(fx * l, fy * a, fase * Math.max(l, a) * 0.45, 0, TAU);
        ctx.stroke();
      }
    }
    brilhoCanto(ctx, l, a);
  },

  microgames(ctx, l, a, t, [c1, c2]) {
    degrade(ctx, l, a, '#3a0a5e', '#6a0f5b');
    // Raios girando ao fundo
    ctx.save();
    ctx.translate(l / 2, a / 2);
    ctx.rotate(t * 0.35);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,46,151,0.22)' : 'rgba(255,214,10,0.14)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, Math.max(l, a), (i / 12) * TAU, ((i + 1) / 12) * TAU);
      ctx.fill();
    }
    ctx.restore();
    // Um alvo diferente a cada ciclo, entrando com "pulo"
    const ciclo = t / 1.1;
    const n = Math.floor(ciclo);
    const f = ciclo - n;
    const escala = f < 0.25 ? 1 + Math.sin((f / 0.25) * Math.PI) * 0.25 : 1;
    const x = l * (0.3 + 0.4 * hash(n));
    const y = a * (0.42 + 0.18 * hash(n + 7));
    const r = Math.min(l, a) * 0.16 * escala * Math.min(1, f / 0.12);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 3) * 0.15);
    ctx.fillStyle = n % 2 ? c1 : c2;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    const lados = [0, 3, 4, 5][n % 4];
    if (!lados) ctx.arc(0, 0, r, 0, TAU);
    else for (let i = 0; i < lados * (lados === 5 ? 2 : 1); i++) {
      const estrela = lados === 5;
      const ang = (i / (estrela ? 10 : lados)) * TAU - Math.PI / 2;
      const raio = estrela && i % 2 ? r * 0.45 : r;
      ctx.lineTo(Math.cos(ang) * raio, Math.sin(ang) * raio);
    }
    ctx.fill();
    ctx.restore();
    // Barra de tempo
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(l * 0.1, a * 0.86, l * 0.8, 7);
    ctx.fillStyle = c2;
    ctx.fillRect(l * 0.1, a * 0.86, l * 0.8 * (1 - f), 7);
    ctx.font = `${Math.round(a * 0.12)}px Bungee, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('TOQUE!', l / 2, a * 0.2);
  },

  corrida(ctx, l, a, t) {
    const horizonte = a * 0.55;
    const ceu = ctx.createLinearGradient(0, 0, 0, horizonte);
    ceu.addColorStop(0, '#12002e');
    ceu.addColorStop(0.6, '#4a0a6e');
    ceu.addColorStop(1, '#ff2e97');
    ctx.fillStyle = ceu;
    ctx.fillRect(0, 0, l, horizonte);
    // Sol listrado
    const r = a * 0.3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, l, horizonte);
    ctx.clip();
    const sol = ctx.createLinearGradient(0, horizonte - r, 0, horizonte);
    sol.addColorStop(0, '#ffe14d');
    sol.addColorStop(1, '#ff2e97');
    ctx.fillStyle = sol;
    ctx.beginPath();
    ctx.arc(l / 2, horizonte, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ceu;
    for (let i = 0; i < 4; i++) ctx.fillRect(0, horizonte - r * (0.12 + i * 0.16), l, 2 + i * 1.2);
    ctx.restore();
    // Chão quadriculado em perspectiva
    ctx.fillStyle = '#14002b';
    ctx.fillRect(0, horizonte, l, a - horizonte);
    ctx.strokeStyle = '#ff3bdc';
    ctx.lineWidth = 1.3;
    ctx.shadowColor = '#ff3bdc';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let i = -10; i <= 10; i++) {
      ctx.moveTo(l / 2 + i * l * 0.02, horizonte);
      ctx.lineTo(l / 2 + i * l * 0.24, a);
    }
    for (let k = 0; k < 10; k++) {
      const z = (k + ((t * 1.6) % 1)) / 10;
      const y = horizonte + (a - horizonte) * z * z;
      ctx.moveTo(0, y);
      ctx.lineTo(l, y);
    }
    ctx.stroke();
    // Nave
    const pulo = Math.abs(Math.sin(t * 4)) * a * 0.04;
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(l / 2, a * 0.74 - pulo);
    ctx.lineTo(l / 2 - 14, a * 0.86 - pulo);
    ctx.lineTo(l / 2 + 14, a * 0.86 - pulo);
    ctx.fill();
    ctx.shadowBlur = 0;
  },

  ritmo(ctx, l, a, t) {
    degrade(ctx, l, a, '#0a1035', '#04302c', true);
    const cores = ['#a3ff12', '#00e5ff', '#ff2e97', '#ffd60a'];
    const pista = l * 0.15;
    const x0 = l / 2 - pista * 2;
    const linhaAcerto = a * 0.8;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)';
      ctx.fillRect(x0 + i * pista, 0, pista, a);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = '#a3ff12';
    ctx.shadowBlur = 12;
    ctx.fillRect(x0, linhaAcerto, pista * 4, 3);
    for (let n = 0; n < 12; n++) {
      const pistaN = Math.floor(hash(n) * 4);
      const y = ((t * 0.45 + n / 12) % 1) * a * 1.05 - a * 0.1;
      ctx.fillStyle = cores[pistaN];
      ctx.shadowColor = cores[pistaN];
      ctx.fillRect(x0 + pistaN * pista + 5, y, pista - 10, 10);
      if (Math.abs(y - linhaAcerto) < 18) {
        ctx.strokeStyle = cores[pistaN];
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1 - Math.abs(y - linhaAcerto) / 18;
        ctx.beginPath();
        ctx.arc(x0 + (pistaN + 0.5) * pista, linhaAcerto, 10 + (18 - Math.abs(y - linhaAcerto)), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.shadowBlur = 0;
  },

  fogos(ctx, l, a, t) {
    degrade(ctx, l, a, '#0b0423', '#3a0b4d', true);
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 3; b++) {
      const periodo = 2.2;
      const tb = t + b * 0.73;
      const ciclo = Math.floor(tb / periodo);
      const idade = (tb % periodo) / periodo;
      const cx = l * (0.2 + 0.6 * hash(ciclo * 3 + b));
      const cy = a * (0.25 + 0.3 * hash(ciclo * 5 + b));
      const matiz = Math.floor(hash(ciclo + b * 9) * 360);
      if (idade < 0.2) {
        const y = a - (a - cy) * suavizarSaida(idade / 0.2);
        ctx.fillStyle = `hsl(${matiz}, 100%, 75%)`;
        ctx.beginPath();
        ctx.arc(cx, y, 2.5, 0, TAU);
        ctx.fill();
      } else {
        const e = (idade - 0.2) / 0.8;
        const raio = suavizarSaida(e) * a * 0.32;
        for (let i = 0; i < 26; i++) {
          const ang = (i / 26) * TAU;
          ctx.fillStyle = `hsla(${matiz + i * 4}, 100%, 65%, ${1 - e})`;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ang) * raio, cy + Math.sin(ang) * raio + e * e * a * 0.12, 2.3, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  areia(ctx, l, a, t, [c1, c2]) {
    degrade(ctx, l, a, '#3a0d2e', '#1b0b3a');
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 170; i++) {
      const semente = hash(i);
      const raio = (0.12 + 0.85 * semente) * Math.min(l, a) * 0.45;
      const ang = hash(i + 99) * TAU + t * (0.4 + (1 - semente) * 1.3);
      ctx.fillStyle = i % 3 ? c1 : c2;
      ctx.globalAlpha = 0.5 + 0.5 * hash(i + 3);
      ctx.fillRect(l / 2 + Math.cos(ang) * raio * 1.5, a / 2 + Math.sin(ang) * raio * 0.85, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  caleidoscopio(ctx, l, a, t) {
    degrade(ctx, l, a, '#1a0638', '#2a0a3a');
    const r = Math.min(l, a) * 0.46;
    ctx.save();
    ctx.translate(l / 2, a / 2);
    ctx.rotate(t * 0.25);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      ctx.rotate(TAU / 8);
      for (const espelho of [1, -1]) {
        ctx.save();
        ctx.scale(1, espelho);
        ctx.strokeStyle = `hsl(${(t * 50 + i * 25) % 360}, 100%, 66%)`;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(r * 0.1, 0);
        ctx.bezierCurveTo(r * 0.35, r * 0.3 * Math.sin(t), r * 0.65, -r * 0.2 * Math.cos(t * 1.3), r, r * 0.12 * Math.sin(t * 0.7));
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  },

  plasticoBolha(ctx, l, a, t, [c1]) {
    degrade(ctx, l, a, '#06404a', '#0a2a6a');
    const colunas = 6;
    const linhas = 4;
    const passo = Math.min(l / colunas, a / linhas);
    const r = passo * 0.4;
    const ox = (l - passo * colunas) / 2 + passo / 2;
    const oy = (a - passo * linhas) / 2 + passo / 2;
    for (let i = 0; i < colunas * linhas; i++) {
      const x = ox + (i % colunas) * passo;
      const y = oy + Math.floor(i / colunas) * passo;
      const fase = (t * 0.22 + hash(i)) % 1;
      const estourada = fase < 0.18;
      const s = estourada ? 0.7 + 0.3 * (fase / 0.18) : 1;
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r * s);
      g.addColorStop(0, estourada ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.75)');
      g.addColorStop(0.5, estourada ? 'rgba(60,255,180,0.12)' : 'rgba(60,255,180,0.35)');
      g.addColorStop(1, 'rgba(0,180,255,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * s, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = estourada ? 'rgba(255,255,255,0.2)' : c1;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  },

  respiracao(ctx, l, a, t, [c1, c2]) {
    degrade(ctx, l, a, '#1a0b4a', '#0b2a4a');
    const fase = (Math.sin(t * 0.9 - Math.PI / 2) + 1) / 2;
    const r = Math.min(l, a) * (0.17 + 0.16 * fase);
    for (let k = 3; k >= 1; k--) {
      ctx.fillStyle = `rgba(177,140,255,${0.08 + 0.02 * k})`;
      ctx.beginPath();
      ctx.arc(l / 2, a / 2, r * (1 + k * 0.2), 0, TAU);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(l / 2, a / 2, 0, l / 2, a / 2, r);
    g.addColorStop(0, c2);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.shadowColor = c1;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(l / 2, a / 2, r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `${Math.round(a * 0.075)}px Bungee, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1a0b4a';
    ctx.fillText(Math.cos(t * 0.9 - Math.PI / 2) > 0 ? 'INSPIRE' : 'SOLTE', l / 2, a / 2);
  },

  slime(ctx, l, a, t, [c1, c2]) {
    degrade(ctx, l, a, '#0d2a06', '#03302a');
    const cx = l / 2;
    const cy = a / 2 + 6;
    const raio = Math.min(l, a) * 0.32;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const ang = (i / 48) * TAU;
      const r = raio * (1 + 0.08 * Math.sin(3 * ang + t * 2) + 0.05 * Math.sin(5 * ang - t * 1.6) + 0.04 * Math.sin(2 * ang + t * 3.1));
      const x = cx + Math.cos(ang) * r * 1.2;
      const y = cy + Math.sin(ang) * r * 0.88;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const g = ctx.createRadialGradient(cx - raio * 0.4, cy - raio * 0.5, 0, cx, cy, raio * 1.3);
    g.addColorStop(0, '#e4ffb8');
    g.addColorStop(0.35, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.shadowColor = c1;
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
    // Olhinhos que piscam
    const piscando = t % 3.5 < 0.14;
    ctx.fillStyle = '#0d2a06';
    for (const lado of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + lado * raio * 0.28, cy - raio * 0.12, raio * 0.08, piscando ? raio * 0.015 : raio * 0.12, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx - raio * 0.55, cy - raio * 0.45, raio * 0.18, raio * 0.08, -0.5, 0, TAU);
    ctx.fill();
  },

  spinner(ctx, l, a, t, [c1, c2]) {
    degrade(ctx, l, a, '#1d1638', '#07060f');
    const cx = l / 2;
    const cy = a / 2;
    const r = Math.min(l, a) * 0.36;
    const angulo = t * 9;
    // Rastro de luz nas pontas
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const base = angulo + (i / 3) * TAU;
      for (let k = 0; k < 10; k++) {
        ctx.strokeStyle = c1;
        ctx.globalAlpha = (1 - k / 10) * 0.35;
        ctx.lineWidth = r * 0.26 * (1 - k / 12);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.62, base - (k + 1) * 0.12, base - k * 0.12);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Corpo
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angulo);
    const corpo = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r);
    corpo.addColorStop(0, '#ffffff');
    corpo.addColorStop(0.45, '#9aa6bd');
    corpo.addColorStop(1, c2);
    ctx.fillStyle = corpo;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.36, 0, TAU);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * TAU;
      ctx.moveTo(Math.cos(ang) * r * 0.62 + r * 0.31, Math.sin(ang) * r * 0.62);
      ctx.arc(Math.cos(ang) * r * 0.62, Math.sin(ang) * r * 0.62, r * 0.31, 0, TAU);
    }
    ctx.fill();
    ctx.lineWidth = r * 0.3;
    ctx.strokeStyle = corpo;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * TAU;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * r * 0.62, Math.sin(ang) * r * 0.62);
    }
    ctx.stroke();
    ctx.fillStyle = '#20242e';
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * r * 0.62, Math.sin(ang) * r * 0.62, r * 0.17, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#e8edf7';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, TAU);
    ctx.fill();
    ctx.restore();
    brilhoCanto(ctx, l, a);
  },

  popit(ctx, l, a, t) {
    degrade(ctx, l, a, '#2b1f4a', '#0c0818');
    const cores = ['#ff4d6d', '#ff8c42', '#ffd23f', '#5ddc5a', '#2ec4f0', '#a05cff'];
    const lado = Math.min(l, a) * 0.78;
    const x0 = l / 2 - lado / 2;
    const y0 = a / 2 - lado / 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, lado, lado, lado * 0.16);
    ctx.clip();
    cores.forEach((cor, i) => {
      ctx.fillStyle = cor;
      ctx.fillRect(x0, y0 + (i * lado) / 6, lado, lado / 6 + 1);
    });
    const r = lado / 15;
    const ordem = Math.floor((t * 4) % 30);
    for (let linha = 0; linha < 6; linha++) {
      for (let coluna = 0; coluna < 5; coluna++) {
        const x = x0 + lado * 0.14 + coluna * lado * 0.18;
        const y = y0 + lado / 12 + linha * (lado / 6);
        const apertada = linha * 5 + coluna < ordem;
        const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
        grad.addColorStop(0, apertada ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.65)');
        grad.addColorStop(1, apertada ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    brilhoCanto(ctx, l, a);
  },

  teclado(ctx, l, a, t) {
    degrade(ctx, l, a, '#2a2440', '#0d0b16');
    const tam = Math.min(l / 5.6, a / 3.3);
    const x0 = l / 2 - tam * 2.12;
    const y0 = a / 2 - tam * 1.06;
    // Luz RGB por baixo
    const rgb = ctx.createLinearGradient(x0, 0, x0 + tam * 4.3, 0);
    ['#ff2e97', '#ffd60a', '#3cffb4', '#22e4ff', '#8b5cff'].forEach((cor, i) => rgb.addColorStop((i / 4 + t * 0.15) % 1, cor));
    ctx.fillStyle = rgb;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x0 - 6, y0 - 6, tam * 4.36 + 12, tam * 2.12 + 12);
    ctx.globalAlpha = 1;
    const apertada = Math.floor(t * 5) % 8;
    for (let i = 0; i < 8; i++) {
      const x = x0 + (i % 4) * tam * 1.12;
      const baixo = i === apertada;
      const y = y0 + Math.floor(i / 4) * tam * 1.12 + (baixo ? tam * 0.06 : 0);
      ctx.fillStyle = '#c9bea2';
      ctx.beginPath();
      ctx.roundRect(x, y, tam, tam, tam * 0.14);
      ctx.fill();
      ctx.fillStyle = baixo ? '#f4ead2' : '#ece4cf';
      ctx.beginPath();
      ctx.roundRect(x + tam * 0.1, y + tam * 0.08, tam * 0.8, tam * 0.74, tam * 0.1);
      ctx.fill();
      ctx.fillStyle = '#3b352a';
      ctx.font = `600 ${tam * 0.26}px Rubik, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('QWERASDF'[i], x + tam / 2, y + tam * 0.45);
    }
  },

  interruptores(ctx, l, a, t) {
    degrade(ctx, l, a, '#2a2d36', '#15171d', true);
    const ligado = Math.floor(t * 1.2) % 2 === 0;
    // Lâmpada
    const lx = l * 0.28;
    const ly = a * 0.42;
    if (ligado) {
      const luz = ctx.createRadialGradient(lx, ly, 0, lx, ly, a * 0.5);
      luz.addColorStop(0, 'rgba(255,200,90,0.55)');
      luz.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = luz;
      ctx.fillRect(0, 0, l, a);
    }
    ctx.fillStyle = ligado ? '#ffd36b' : 'rgba(220,230,255,0.25)';
    ctx.beginPath();
    ctx.arc(lx, ly, a * 0.13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#9aa1b2';
    ctx.fillRect(lx - a * 0.055, ly + a * 0.12, a * 0.11, a * 0.08);
    // Chave de alavanca
    const cx = l * 0.62;
    const cy = a * 0.62;
    ctx.fillStyle = '#7d8392';
    ctx.beginPath();
    ctx.arc(cx, cy, a * 0.09, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ligado ? 0.45 : -0.45);
    ctx.fillStyle = '#e6e9f0';
    ctx.beginPath();
    ctx.roundRect(-a * 0.03, -a * 0.3, a * 0.06, a * 0.3, a * 0.03);
    ctx.fill();
    ctx.restore();
    // LED
    ctx.fillStyle = ligado ? '#3cff6b' : '#7a1010';
    ctx.shadowColor = '#3cff6b';
    ctx.shadowBlur = ligado ? 14 : 0;
    ctx.beginPath();
    ctx.arc(l * 0.84, a * 0.3, a * 0.05, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  },

  cubo(ctx, l, a, t) {
    degrade(ctx, l, a, '#26214a', '#09081a');
    // Dois blocos que se abrem como um livro e voltam a fechar
    const cx = l / 2;
    const cy = a / 2 + a * 0.06;
    const s = Math.min(l, a) * 0.17;
    const abertura = (1 - Math.cos(t * 1.6)) / 2;
    const cores = [['#e8343a', '#ff8a1a'], ['#2e7bff', '#22c25a']];
    const iso = (x, y, z) => [cx + (x - z) * s * 0.87, cy + (x + z) * s * 0.5 - y * s];
    const cubinho = (x, y, z, [c1, c2]) => {
      const topo = [iso(x, y + 1, z), iso(x + 1, y + 1, z), iso(x + 1, y + 1, z + 1), iso(x, y + 1, z + 1)];
      const frente = [iso(x, y, z + 1), iso(x + 1, y, z + 1), iso(x + 1, y + 1, z + 1), iso(x, y + 1, z + 1)];
      const lado = [iso(x + 1, y, z), iso(x + 1, y, z + 1), iso(x + 1, y + 1, z + 1), iso(x + 1, y + 1, z)];
      for (const [face, cor] of [[topo, '#f4f4f0'], [frente, c1], [lado, c2]]) {
        ctx.fillStyle = '#121318';
        ctx.beginPath();
        face.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fill();
        const mx = face.reduce((m, p) => m + p[0], 0) / 4;
        const my = face.reduce((m, p) => m + p[1], 0) / 4;
        ctx.fillStyle = cor;
        ctx.beginPath();
        face.forEach(([px, py], i) => {
          const qx = mx + (px - mx) * 0.84;
          const qy = my + (py - my) * 0.84;
          if (i) ctx.lineTo(qx, qy);
          else ctx.moveTo(qx, qy);
        });
        ctx.closePath();
        ctx.fill();
      }
    };
    const d = abertura * 0.9;
    for (const [x, y, z, cor] of [[-1 - d, 0, -1, 0], [-1 - d, 0, 0, 0], [-1 - d, -1, -1, 0], [-1 - d, -1, 0, 0], [d, 0, -1, 1], [d, 0, 0, 1], [d, -1, -1, 1], [d, -1, 0, 1]]
      .sort((p, q) => (p[0] + p[2] - p[1]) - (q[0] + q[2] - q[1]))) {
      cubinho(x, y, z, cores[cor]);
    }
  },

  pipa(ctx, l, a, t) {
    const ceu = ctx.createLinearGradient(0, 0, 0, a);
    ceu.addColorStop(0, '#3a6df0');
    ceu.addColorStop(0.6, '#7fb2ff');
    ceu.addColorStop(1, '#ffc2c9');
    ctx.fillStyle = ceu;
    ctx.fillRect(0, 0, l, a);
    // Nuvens passando
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 3; i++) {
      const x = ((t * (12 + i * 8) + i * 90) % (l + 120)) - 60;
      const y = a * (0.18 + i * 0.16);
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, TAU);
      ctx.arc(x + 16, y - 6, 18, 0, TAU);
      ctx.arc(x + 34, y, 13, 0, TAU);
      ctx.fill();
    }
    // Morro
    ctx.fillStyle = '#4fae7e';
    ctx.beginPath();
    ctx.ellipse(l / 2, a * 1.05, l * 0.7, a * 0.2, 0, 0, TAU);
    ctx.fill();
    // Pipa balançando
    const px = l * 0.62 + Math.sin(t * 1.2) * l * 0.08;
    const py = a * 0.36 + Math.sin(t * 2.1) * a * 0.05;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l * 0.45, a * 0.92);
    ctx.quadraticCurveTo(l * 0.6, a * 0.75, px, py);
    ctx.stroke();
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.sin(t * 2) * 0.2 + 0.25);
    const s = Math.min(l, a) * 0.13;
    const cores = ['#ff2e5e', '#ffd60a', '#ff7a18', '#ff2e5e'];
    const gomos = [[[0, -s], [s * 0.7, -s * 0.2], [0, -s * 0.2]], [[0, -s], [-s * 0.7, -s * 0.2], [0, -s * 0.2]], [[0, s], [s * 0.7, -s * 0.2], [0, -s * 0.2]], [[0, s], [-s * 0.7, -s * 0.2], [0, -s * 0.2]]];
    gomos.forEach((tri, i) => {
      ctx.fillStyle = cores[i];
      ctx.beginPath();
      tri.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    });
    // Rabiola
    ctx.strokeStyle = '#ff2e5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, s);
    for (let i = 1; i <= 6; i++) ctx.lineTo(Math.sin(t * 4 + i) * 6, s + i * 9);
    ctx.stroke();
    ctx.restore();
  },

  pingPong(ctx, l, a, t) {
    degrade(ctx, l, a, '#0e1630', '#3a2a1e', true);
    // Mesa em trapézio (perspectiva)
    const topo = a * 0.3;
    const base = a * 0.88;
    const mesa = [[l * 0.36, topo], [l * 0.64, topo], [l * 0.9, base], [l * 0.1, base]];
    ctx.fillStyle = '#1d5fd1';
    ctx.beginPath();
    mesa.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(l / 2, topo);
    ctx.lineTo(l / 2, base);
    ctx.stroke();
    // Rede
    const ry = (topo + base) / 2 - a * 0.04;
    ctx.fillStyle = 'rgba(20,24,36,0.6)';
    ctx.fillRect(l * 0.2, ry, l * 0.6, a * 0.06);
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(l * 0.2, ry, l * 0.6, 2);
    // Bola indo e vindo num arco
    const f = (Math.sin(t * 2.4) + 1) / 2;
    const y = topo + (base - topo) * f;
    const arco = Math.sin(f * Math.PI * 2) * a * 0.06;
    const x = l / 2 + Math.sin(t * 1.3) * l * 0.12 * (0.5 + f * 0.5);
    const raio = 3 + f * 5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, raio, raio * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffb35c';
    ctx.beginPath();
    ctx.arc(x, y - a * 0.12 - Math.abs(arco), raio, 0, TAU);
    ctx.fill();
    // Raquetes
    ctx.fillStyle = '#e8343a';
    ctx.beginPath();
    ctx.ellipse(l * 0.5 + Math.sin(t * 1.3) * l * 0.12, a * 0.92, l * 0.05, l * 0.055, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath();
    ctx.ellipse(l * 0.5 + Math.sin(t * 1.3 + 2) * l * 0.06, a * 0.24, l * 0.025, l * 0.028, 0, 0, TAU);
    ctx.fill();
  },

  jardim(ctx, l, a, t) {
    degrade(ctx, l, a, '#040619', '#03110f', true);
    ctx.fillStyle = '#0b2a26';
    ctx.beginPath();
    ctx.moveTo(0, a);
    for (let x = 0; x <= l; x += 6) ctx.lineTo(x, a * 0.7 + Math.sin(x * 0.03) * 5);
    ctx.lineTo(l, a);
    ctx.fill();
    const cores = ['#22e4ff', '#ff5dc8', '#a3ff12', '#b18cff', '#ffb347'];
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = l * (0.14 + i * 0.18);
      const cresc = Math.min(1, ((t * 0.5 + i * 0.37) % 2.2));
      const h = a * 0.32 * cresc;
      const y = a * 0.74;
      ctx.strokeStyle = 'rgba(80,255,190,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.sin(t + i) * 6, y - h * 0.5, x, y - h);
      ctx.stroke();
      const r = 9 * cresc;
      const brilho = ctx.createRadialGradient(x, y - h, 0, x, y - h, r * 3);
      brilho.addColorStop(0, cores[i]);
      brilho.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = brilho;
      ctx.beginPath();
      ctx.arc(x, y - h, r * 3, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < 8; i++) {
      const x = l * hash(i) + Math.sin(t * 0.8 + i) * 14;
      const y = a * (0.25 + hash(i + 9) * 0.4) + Math.cos(t * 0.7 + i) * 10;
      ctx.fillStyle = `rgba(216,255,106,${0.4 + Math.sin(t * 3 + i) * 0.4})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  pinball(ctx, l, a, t) {
    degrade(ctx, l, a, '#2a0f55', '#07031a');
    ctx.lineCap = 'round';
    const neon = (cor, largura, desenho) => {
      for (const [w, alfa] of [[largura * 3, 0.2], [largura, 1]]) {
        ctx.strokeStyle = cor;
        ctx.globalAlpha = alfa;
        ctx.lineWidth = w;
        ctx.beginPath();
        desenho();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    // Batedores piscando
    const batedores = [[0.36, 0.34, '#ff2e97'], [0.64, 0.34, '#22e4ff'], [0.5, 0.56, '#ffd60a']];
    batedores.forEach(([x, y, cor], i) => {
      const luz = Math.max(0, Math.sin(t * 4 + i * 2.1));
      ctx.fillStyle = cor;
      ctx.globalAlpha = 0.25 + luz * 0.6;
      ctx.beginPath();
      ctx.arc(l * x, a * y, a * 0.09, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      neon(cor, 2, () => ctx.arc(l * x, a * y, a * 0.09, 0, TAU));
    });
    // Flippers
    const sobe = Math.sin(t * 3) > 0.6 ? -0.5 : 0.45;
    neon('#ff2e97', 4, () => {
      ctx.moveTo(l * 0.3, a * 0.86);
      ctx.lineTo(l * 0.3 + Math.cos(sobe) * l * 0.16, a * 0.86 + Math.sin(sobe) * l * 0.16);
      ctx.moveTo(l * 0.7, a * 0.86);
      ctx.lineTo(l * 0.7 - Math.cos(sobe) * l * 0.16, a * 0.86 + Math.sin(sobe) * l * 0.16);
    });
    // Bola quicando entre os batedores
    const bx = l * (0.5 + Math.sin(t * 1.7) * 0.25);
    const by = a * (0.45 + Math.cos(t * 2.3) * 0.25);
    const bola = ctx.createRadialGradient(bx - 2, by - 2, 0, bx, by, 6);
    bola.addColorStop(0, '#fff');
    bola.addColorStop(1, '#5a6378');
    ctx.fillStyle = bola;
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, TAU);
    ctx.fill();
  },

  orbitando(ctx, l, a, t) {
    degrade(ctx, l, a, '#0b0620', '#03020c');
    const cx = l / 2;
    const cy = a / 2;
    const sol = ctx.createRadialGradient(cx, cy, 0, cx, cy, a * 0.3);
    sol.addColorStop(0, '#fff7d6');
    sol.addColorStop(0.15, '#ffb020');
    sol.addColorStop(1, 'rgba(255,176,32,0)');
    ctx.fillStyle = sol;
    ctx.fillRect(0, 0, l, a);
    const planetas = [[0.2, 1.4, '#7fd4ff', 5], [0.32, 0.9, '#ff9ec7', 7], [0.44, 0.55, '#a8ff9e', 6]];
    for (const [r, vel, cor, tam] of planetas) {
      const raio = Math.min(l, a) * r * 1.1;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, raio, raio * 0.6, 0, 0, TAU);
      ctx.stroke();
      // Rastro
      for (let k = 0; k < 14; k++) {
        const ang = t * vel - k * 0.06;
        ctx.fillStyle = cor;
        ctx.globalAlpha = (1 - k / 14) * 0.4;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * raio, cy + Math.sin(ang) * raio * 0.6, tam * 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(t * vel) * raio, cy + Math.sin(t * vel) * raio * 0.6, tam, 0, TAU);
      ctx.fill();
    }
  },

  cristais(ctx, l, a, t) {
    degrade(ctx, l, a, '#2a1458', '#0a0420');
    const cores = ['#ff2e5e', '#22c4ff', '#3cff8a', '#ffd60a', '#b06bff', '#ff8a1a'];
    const lado = Math.min(l, a) * 0.15;
    const colunas = 5;
    const linhas = 4;
    const x0 = l / 2 - (colunas * lado) / 2;
    const y0 = a / 2 - (linhas * lado) / 2;
    const fase = (t * 0.8) % 3;
    for (let ll = 0; ll < linhas; ll++) {
      for (let c = 0; c < colunas; c++) {
        let tipo = (ll * 7 + c * 3) % 6;
        if (ll === 1 && c >= 1 && c <= 3) tipo = 1;
        const some = ll === 1 && c >= 1 && c <= 3 && fase > 1.6;
        const s = some ? Math.max(0, 1 - (fase - 1.6) * 3) : 1;
        if (s <= 0) continue;
        const x = x0 + (c + 0.5) * lado;
        const y = y0 + (ll + 0.5) * lado;
        const r = lado * 0.38 * s;
        const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, cores[tipo]);
        grad.addColorStop(1, '#1a0b30');
        ctx.fillStyle = grad;
        ctx.beginPath();
        const lados = [4, 6, 3, 0, 5, 8][tipo];
        if (!lados) ctx.arc(x, y, r, 0, TAU);
        else for (let i = 0; i < lados; i++) {
          const ang = -Math.PI / 2 + (i / lados) * TAU;
          if (i) ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
          else ctx.moveTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
        }
        ctx.closePath();
        ctx.fill();
        if (some) {
          ctx.fillStyle = `rgba(255,255,255,${1 - s})`;
          ctx.beginPath();
          ctx.arc(x, y, lado * 0.4, 0, TAU);
          ctx.fill();
        }
      }
    }
  },

  areiaCinetica(ctx, l, a, t) {
    degrade(ctx, l, a, '#f6e6ff', '#c9b3e6');
    const x0 = l * 0.16;
    const y0 = a * 0.2;
    const lb = l * 0.68;
    const ab = a * 0.6;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, lb, ab, 14);
    ctx.clip();
    const faixas = ['#ffb3c7', '#ffd59e', '#fff1a8', '#c4f5b8', '#b3e5ff', '#d9c2ff'];
    faixas.forEach((cor, i) => {
      ctx.fillStyle = cor;
      ctx.beginPath();
      const d0 = (i / 6) * (lb + ab);
      const d1 = ((i + 1) / 6) * (lb + ab) + 1;
      ctx.moveTo(x0 + d0, y0);
      ctx.lineTo(x0 + d1, y0);
      ctx.lineTo(x0 + d1 - ab * 2, y0 + ab * 2);
      ctx.lineTo(x0 + d0 - ab * 2, y0 + ab * 2);
      ctx.fill();
    });
    // Cortes já feitos e o corte que avança
    const progresso = (t * 0.35) % 1.4;
    for (let k = 0; k < 3; k++) {
      const y = y0 + ab * (0.25 + k * 0.25);
      const fim = k < Math.floor(progresso * 3) ? 1 : k === Math.floor(progresso * 3) ? (progresso * 3) % 1 : 0;
      if (fim <= 0) continue;
      ctx.strokeStyle = 'rgba(70,40,50,0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + lb * fim, y);
      ctx.stroke();
      ctx.strokeStyle = '#ff8fb0';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  },
};
