/**
 * Renderizador reserva (sem WebGL2): calcula a refração na resolução da
 * simulação e amplia a imagem com suavização. Mais simples, mas funciona em tudo.
 */

export class RenderizadorCPU {
  #fonteFundo = null;
  #pixelsFundo = null;
  #campo = null;
  #tinta = null;

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buffer = document.createElement('canvas');
    this.ctxBuffer = this.buffer.getContext('2d', { willReadFrequently: true });
    this.imagem = null;
  }

  definirFundo(fonte) {
    this.#fonteFundo = fonte;
    this.#pixelsFundo = null;
  }

  atualizarAltura(campo) {
    this.#campo = campo;
    if (this.buffer.width !== campo.colunas || this.buffer.height !== campo.linhas) {
      this.buffer.width = campo.colunas;
      this.buffer.height = campo.linhas;
      this.imagem = this.ctxBuffer.createImageData(campo.colunas, campo.linhas);
      this.#pixelsFundo = null;
    }
  }

  atualizarTinta(bytes, colunas, linhas) {
    this.#tinta = { bytes, colunas, linhas };
  }

  desenhar(p) {
    const campo = this.#campo;
    if (!campo || !this.#fonteFundo || !this.imagem) return;
    const { colunas: c, linhas: l } = campo;
    if (!this.#pixelsFundo) {
      this.ctxBuffer.drawImage(this.#fonteFundo, 0, 0, c, l);
      this.#pixelsFundo = this.ctxBuffer.getImageData(0, 0, c, l).data.slice();
    }
    const fundo = this.#pixelsFundo;
    const saida = this.imagem.data;
    const h = campo.atual;
    const desloc = p.refracao * c;
    const brilho = p.corBrilho.map((v) => v * 255);
    const tinta = this.#tinta;
    const escalaTinta = tinta ? tinta.colunas / c : 0;

    for (let y = 1; y < l - 1; y++) {
      for (let x = 1; x < c - 1; x++) {
        const i = y * c + x;
        const gx = h[i + 1] - h[i - 1];
        const gy = h[i + c] - h[i - c];
        let sx = Math.round(x + gx * desloc);
        let sy = Math.round(y + gy * desloc);
        sx = sx < 0 ? 0 : sx >= c ? c - 1 : sx;
        sy = sy < 0 ? 0 : sy >= l ? l - 1 : sy;
        const f = (sy * c + sx) * 4;
        let r = fundo[f];
        let g = fundo[f + 1];
        let b = fundo[f + 2];

        if (tinta) {
          const t = ((Math.floor(y * escalaTinta) * tinta.colunas) + Math.floor(x * escalaTinta)) * 4;
          const alfa = (tinta.bytes[t + 3] / 255) * 0.9;
          if (alfa > 0.01) {
            const inv = 1 / Math.max(0.01, tinta.bytes[t + 3] / 255);
            r += (tinta.bytes[t] * inv - r) * alfa;
            g += (tinta.bytes[t + 1] * inv - g) * alfa;
            b += (tinta.bytes[t + 2] * inv - b) * alfa;
          }
        }

        // Luz aproximada: encostas viradas para o canto superior esquerdo brilham
        const luz = Math.max(0, -(gx * 0.5 + gy * 0.7)) * 0.9 * p.especular;
        const curva = Math.max(0, (h[i - 1] + h[i + 1] + h[i - c] + h[i + c] - 4 * h[i]) * p.caustica);
        const k = Math.min(0.8, luz + curva);
        const o = i * 4;
        saida[o] = r + brilho[0] * k;
        saida[o + 1] = g + brilho[1] * k;
        saida[o + 2] = b + brilho[2] * k;
        saida[o + 3] = 255;
      }
    }
    this.ctxBuffer.putImageData(this.imagem, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  destruir() {}
}
