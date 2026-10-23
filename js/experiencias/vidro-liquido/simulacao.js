/**
 * Física do Vidro Líquido, rodando na CPU em baixa resolução:
 *  - CampoDeOndas: equação de onda discreta com duas camadas (atual/anterior)
 *  - CampoDeTinta: pigmento pré-multiplicado levado pela água (advecção semi-lagrangiana)
 */

const LIMITE_ALTURA = 8;

export class CampoDeOndas {
  colunas = 0;
  linhas = 0;
  atual = new Float32Array(0);
  anterior = new Float32Array(0);
  amortecimento = 0.986;

  redimensionar(colunas, linhas) {
    this.colunas = colunas;
    this.linhas = linhas;
    this.atual = new Float32Array(colunas * linhas);
    this.anterior = new Float32Array(colunas * linhas);
  }

  /** Afunda a superfície num círculo suave (coordenadas em células). */
  perturbar(cx, cy, raio, forca) {
    const { colunas, linhas, atual } = this;
    const r = Math.max(1.2, raio);
    const x0 = Math.max(1, Math.floor(cx - r));
    const x1 = Math.min(colunas - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r));
    const y1 = Math.min(linhas - 2, Math.ceil(cy + r));
    const inverso = 1 / r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) * inverso;
        if (d >= 1) continue;
        const i = y * colunas + x;
        const v = atual[i] - forca * (0.5 + 0.5 * Math.cos(Math.PI * d));
        atual[i] = v < -LIMITE_ALTURA ? -LIMITE_ALTURA : v > LIMITE_ALTURA ? LIMITE_ALTURA : v;
      }
    }
  }

  /** Avança um passo: cada célula vira a média dos vizinhos menos o seu passado. */
  passo() {
    const { colunas: c, linhas: l, atual, anterior, amortecimento } = this;
    for (let y = 1; y < l - 1; y++) {
      let i = y * c + 1;
      for (let x = 1; x < c - 1; x++, i++) {
        anterior[i] = ((atual[i - 1] + atual[i + 1] + atual[i - c] + atual[i + c]) * 0.5 - anterior[i]) * amortecimento;
      }
    }
    this.atual = anterior;
    this.anterior = atual;
  }

  acalmar() {
    this.atual.fill(0);
    this.anterior.fill(0);
  }
}

export class CampoDeTinta {
  colunas = 0;
  linhas = 0;
  cor = new Float32Array(0); // RGBA pré-multiplicado, 4 valores por célula
  temporario = new Float32Array(0);
  vx = new Float32Array(0);
  vy = new Float32Array(0);
  bytes = new Uint8Array(0);
  /** O modo Tinta está ligado (a tinta dura mais). */
  modoAtivo = false;
  /** Existe tinta na água; quando falso, nada é simulado. */
  ativa = false;
  /** Há mudanças a enviar para a GPU. */
  sujo = true;

  redimensionar(colunas, linhas) {
    const n = colunas * linhas;
    this.colunas = colunas;
    this.linhas = linhas;
    this.cor = new Float32Array(n * 4);
    this.temporario = new Float32Array(n * 4);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.bytes = new Uint8Array(n * 4);
    this.ativa = false;
    this.sujo = true;
  }

  /**
   * Deposita pigmento numa mancha gaussiana e dá um empurrão (vx, vy) na direção do gesto.
   * Mistura por "sobreposição": a cor nova cobre parte da antiga.
   */
  depositar(cx, cy, raio, rgb, quantidade, empurraoX = 0, empurraoY = 0) {
    const { colunas, linhas, cor, vx, vy } = this;
    const alcance = raio * 1.8;
    const x0 = Math.max(0, Math.floor(cx - alcance));
    const x1 = Math.min(colunas - 1, Math.ceil(cx + alcance));
    const y0 = Math.max(0, Math.floor(cy - alcance));
    const y1 = Math.min(linhas - 1, Math.ceil(cy + alcance));
    const inverso = 1 / (raio * raio);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        const peso = Math.min(1, Math.exp(-d2 * inverso) * quantidade);
        if (peso < 0.003) continue;
        const i = y * colunas + x;
        const i4 = i * 4;
        const resto = 1 - peso;
        cor[i4] = cor[i4] * resto + rgb[0] * peso;
        cor[i4 + 1] = cor[i4 + 1] * resto + rgb[1] * peso;
        cor[i4 + 2] = cor[i4 + 2] * resto + rgb[2] * peso;
        cor[i4 + 3] = cor[i4 + 3] * resto + peso;
        vx[i] += empurraoX * peso;
        vy[i] += empurraoY * peso;
      }
    }
    this.ativa = true;
    this.sujo = true;
  }

  /** Empurra a tinta para fora de um ponto (quando cai uma gota). */
  empurrarRadial(cx, cy, raio, forca) {
    if (!this.ativa) return;
    const { colunas, linhas, vx, vy } = this;
    const x0 = Math.max(0, Math.floor(cx - raio));
    const x1 = Math.min(colunas - 1, Math.ceil(cx + raio));
    const y0 = Math.max(0, Math.floor(cy - raio));
    const y1 = Math.min(linhas - 1, Math.ceil(cy + raio));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d < 0.5 || d > raio) continue;
        const peso = forca * (1 - d / raio) / d;
        const i = y * colunas + x;
        vx[i] += dx * peso;
        vy[i] += dy * peso;
      }
    }
  }

  /**
   * Um passo: a tinta é levada pela inclinação da água, pelo próprio impulso
   * e pelo redemoinho (quando houver). `redemoinho` = { x, y, raio, forca } em células da tinta.
   */
  passo(ondas, redemoinho) {
    if (!this.ativa) return;
    const { colunas: c, linhas: l, vx, vy } = this;
    const fonte = this.cor;
    const destino = this.temporario;
    const h = ondas.atual;
    const oc = ondas.colunas;
    const escalaX = ondas.colunas / c;
    const escalaY = ondas.linhas / l;
    const decaimento = this.modoAtivo ? 0.9993 : 0.985;
    const giro = redemoinho && redemoinho.forca > 0.01 ? redemoinho : null;
    const raio2 = giro ? giro.raio * giro.raio : 0;
    const maxX = c - 1.001;
    const maxY = l - 1.001;
    let total = 0;

    for (let y = 0; y < l; y++) {
      const oy = Math.min(ondas.linhas - 2, Math.max(1, Math.round(y * escalaY)));
      for (let x = 0; x < c; x++) {
        const i = y * c + x;
        const ox = Math.min(oc - 2, Math.max(1, Math.round(x * escalaX)));
        const oi = oy * oc + ox;
        let velX = vx[i] + (h[oi + 1] - h[oi - 1]) * 0.6;
        let velY = vy[i] + (h[oi + oc] - h[oi - oc]) * 0.6;

        if (giro) {
          const dx = x - giro.x;
          const dy = y - giro.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < raio2 * 4) {
            const f = (giro.forca * 1.4 * Math.exp(-d2 / raio2)) / Math.sqrt(d2 + 1);
            velX += (-dy - dx * 0.15) * f;
            velY += (dx - dy * 0.15) * f;
          }
        }

        // Busca de onde a tinta veio e interpola (semi-lagrangiano)
        let sx = x - velX;
        let sy = y - velY;
        sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
        sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;
        const x0 = sx | 0;
        const y0 = sy | 0;
        const fx = sx - x0;
        const fy = sy - y0;
        const a = (y0 * c + x0) * 4;
        const b = a + 4;
        const d = a + c * 4;
        const e = d + 4;
        const i4 = i * 4;
        for (let k = 0; k < 4; k++) {
          const cima = fonte[a + k] + (fonte[b + k] - fonte[a + k]) * fx;
          const baixo = fonte[d + k] + (fonte[e + k] - fonte[d + k]) * fx;
          destino[i4 + k] = (cima + (baixo - cima) * fy) * decaimento;
        }
        total += destino[i4 + 3];
        vx[i] *= 0.95;
        vy[i] *= 0.95;
      }
    }

    this.cor = destino;
    this.temporario = fonte;
    this.sujo = true;
    if (!this.modoAtivo && total < 0.5) {
      this.cor.fill(0);
      this.vx.fill(0);
      this.vy.fill(0);
      this.ativa = false;
    }
  }

  /** Converte para bytes RGBA (para enviar como textura). */
  paraBytes() {
    const { cor, bytes } = this;
    for (let i = 0; i < cor.length; i++) {
      const v = cor[i] * 255;
      bytes[i] = v > 255 ? 255 : v;
    }
    this.sujo = false;
    return bytes;
  }
}
