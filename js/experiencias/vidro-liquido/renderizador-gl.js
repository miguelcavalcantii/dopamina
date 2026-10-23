/**
 * Renderizador WebGL2 do Vidro Líquido. Um único shader de tela cheia faz:
 * refração do fundo pela inclinação da água, redemoinho, aberração cromática,
 * tinta, cáusticas por curvatura, brilho especular e a animação própria de cada tema.
 */

const VERTICE = `#version 300 es
in vec2 aPosicao;
out vec2 vUv;
void main() {
  // Triângulo que cobre a tela; vUv com origem no canto superior esquerdo
  vUv = vec2(aPosicao.x * 0.5 + 0.5, 0.5 - aPosicao.y * 0.5);
  gl_Position = vec4(aPosicao, 0.0, 1.0);
}`;

const FRAGMENTO = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 corFinal;

uniform sampler2D uFundo;
uniform sampler2D uFundoAnterior;
uniform sampler2D uAltura;
uniform sampler2D uTinta;
uniform vec2 uTexel;
uniform float uAspecto;
uniform float uTempo;
uniform float uMistura;
uniform float uRefracao;
uniform float uEspecular;
uniform float uCaustica;
uniform float uTingimento;
uniform float uVinheta;
uniform int uAnimacao;
uniform vec3 uCorBrilho;
uniform vec3 uCorAgua;
uniform vec4 uRedemoinho; // xy = centro (uv), z = força, w = raio

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Cáusticas procedurais (variação do clássico "water turbulence")
float causticas(vec2 uv, float t) {
  const float TAU = 6.28318530718;
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

// Estrelas que cintilam devagar (sem piscadas fortes)
vec3 estrelas(vec2 uv, float t, float densidade) {
  vec2 g = uv * vec2(uAspecto, 1.0) * densidade;
  vec2 celula = floor(g);
  float h = hash(celula);
  if (h < 0.93) return vec3(0.0);
  vec2 deslocamento = vec2(hash(celula + 3.1), hash(celula + 7.7)) - 0.5;
  float d = length(fract(g) - 0.5 - deslocamento * 0.6);
  float brilho = smoothstep(0.14, 0.0, d) * (0.55 + 0.45 * sin(t * (0.8 + h * 2.0) + h * 50.0));
  return mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.7, 0.95), hash(celula + 1.3)) * brilho;
}

vec3 animarTema(vec2 uv, vec3 cor) {
  if (uAnimacao == 1) {
    // Piscina: luz dançando no fundo
    cor += uCorBrilho * causticas(uv * vec2(uAspecto, 1.0) * 1.15, uTempo * 0.45 + 23.0) * 0.32;
  } else if (uAnimacao == 2) {
    // Pôr do sol: cintilar do sol no mar
    if (uv.y > 0.6) {
      vec2 g = vec2(uv.x * uAspecto * 70.0, uv.y * 110.0);
      vec2 celula = floor(g);
      float h = hash(celula);
      float coluna = exp(-pow((uv.x - 0.5) * uAspecto * 2.6, 2.0));
      float pisca = max(0.0, sin(uTempo * (1.2 + h * 2.5) + h * 60.0));
      float ponto = smoothstep(0.5, 0.1, length(fract(g) - 0.5));
      cor += vec3(1.0, 0.82, 0.55) * step(0.9, h) * pisca * ponto * coluna * 0.85;
    }
  } else if (uAnimacao == 3) {
    // Galáxia: estrelas cintilando e nebulosa respirando
    cor += estrelas(uv, uTempo, 70.0) * 0.9 + estrelas(uv + 0.37, uTempo * 0.7, 140.0) * 0.5;
    cor *= 1.0 + 0.06 * sin(uTempo * 0.25 + uv.x * 4.0);
  } else if (uAnimacao == 4) {
    // Aurora: cortina viva que ondula
    float x = uv.x * uAspecto;
    float linha = 0.3 + 0.07 * sin(x * 1.7 + uTempo * 0.3) + 0.035 * sin(x * 4.3 - uTempo * 0.55);
    float d = uv.y - linha;
    float forma = d < 0.0 ? exp(d * 7.0) : exp(-d * d * 700.0);
    float raios = 0.55 + 0.45 * sin(x * 38.0 + 3.0 * sin(uTempo * 0.4 + x * 2.0));
    vec3 tom = mix(vec3(0.15, 1.0, 0.6), vec3(0.75, 0.3, 1.0), 0.5 + 0.5 * sin(x * 0.9 + uTempo * 0.2));
    cor += tom * forma * raios * 0.42 * smoothstep(0.75, 0.35, uv.y);
    cor += estrelas(uv, uTempo, 90.0) * 0.6 * smoothstep(0.5, 0.0, uv.y);
  } else if (uAnimacao == 5) {
    // Neon: pulso lento e varredura de luz no chão
    cor *= 1.0 + 0.07 * (0.5 + 0.5 * sin(uTempo * 0.9));
    if (uv.y > 0.56) {
      float y = 0.56 + pow(fract(uTempo * 0.12), 2.0) * 0.44;
      cor += vec3(1.0, 0.25, 0.85) * exp(-abs(uv.y - y) * 90.0) * 0.45;
    }
  }
  return cor;
}

void main() {
  float h = texture(uAltura, vUv).r;
  float hE = texture(uAltura, vUv - vec2(uTexel.x, 0.0)).r;
  float hD = texture(uAltura, vUv + vec2(uTexel.x, 0.0)).r;
  float hC = texture(uAltura, vUv - vec2(0.0, uTexel.y)).r;
  float hB = texture(uAltura, vUv + vec2(0.0, uTexel.y)).r;
  vec2 gradiente = vec2(hD - hE, hB - hC);
  float curvatura = hE + hD + hC + hB - 4.0 * h;

  // Refração: o fundo aparece deslocado pela inclinação da superfície
  vec2 uv = vUv + gradiente * uRefracao;

  // Redemoinho: torce as coordenadas em volta do centro
  if (uRedemoinho.z > 0.001) {
    vec2 d = uv - uRedemoinho.xy;
    d.x *= uAspecto;
    float queda = smoothstep(uRedemoinho.w, 0.0, length(d));
    float angulo = uRedemoinho.z * queda * queda * 3.2;
    float s = sin(angulo);
    float c = cos(angulo);
    d = mat2(c, -s, s, c) * d;
    d.x /= uAspecto;
    uv = uRedemoinho.xy + d;
  }

  // Aberração cromática sutil onde a água inclina
  vec2 desvio = gradiente * uRefracao * 0.3;
  vec3 fundo = vec3(texture(uFundo, uv + desvio).r, texture(uFundo, uv).g, texture(uFundo, uv - desvio).b);
  if (uMistura < 1.0) {
    vec3 antigo = texture(uFundoAnterior, uv).rgb;
    fundo = mix(antigo, fundo, smoothstep(0.0, 1.0, uMistura));
  }
  vec3 cor = animarTema(uv, fundo);

  // Tinta pré-multiplicada, com saturação reforçada para não acinzentar ao misturar
  vec4 tinta = texture(uTinta, vUv + gradiente * uRefracao * 0.5);
  if (tinta.a > 0.004) {
    vec3 tom = tinta.rgb / tinta.a;
    float luma = dot(tom, vec3(0.299, 0.587, 0.114));
    tom = clamp(mix(vec3(luma), tom, 1.6) * 1.08, 0.0, 1.0);
    cor = mix(cor, tom, clamp(tinta.a, 0.0, 1.0) * 0.9);
  }

  cor *= mix(vec3(1.0), uCorAgua, uTingimento);

  // Luz: cáusticas pela curvatura + reflexo especular + brilho nas encostas
  cor += uCorBrilho * clamp(curvatura * uCaustica, 0.0, 0.6);
  vec3 normal = normalize(vec3(-gradiente * 5.0, 1.0));
  vec3 meio = normalize(normalize(vec3(-0.5, -0.7, 1.0)) + vec3(0.0, 0.0, 1.0));
  // Reflexo fino e contido: brilha sem estourar em manchas brancas
  float especular = pow(max(dot(normal, meio), 0.0), 140.0);
  cor += uCorBrilho * especular * uEspecular * 0.75;
  cor += uCorBrilho * smoothstep(0.03, 0.6, length(gradiente)) * 0.08 * uEspecular;
  cor = min(cor, vec3(1.0)) * 0.97 + cor * 0.03;

  vec2 centro = (vUv - 0.5) * vec2(uAspecto, 1.0);
  cor *= 1.0 - uVinheta * dot(centro, centro) * 0.9;

  corFinal = vec4(cor, 1.0);
}`;

const UNIFORMES = [
  'uFundo', 'uFundoAnterior', 'uAltura', 'uTinta', 'uTexel', 'uAspecto', 'uTempo', 'uMistura',
  'uRefracao', 'uEspecular', 'uCaustica', 'uTingimento', 'uVinheta', 'uAnimacao',
  'uCorBrilho', 'uCorAgua', 'uRedemoinho',
];

function compilar(gl, tipo, fonte) {
  const shader = gl.createShader(tipo);
  gl.shaderSource(shader, fonte);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Erro no shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function criarTextura(gl) {
  const textura = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, textura);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  return textura;
}

export class RenderizadorGL {
  #tamanhoAltura = [0, 0];
  #tamanhoTinta = [0, 0];

  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 indisponível');
    this.gl = gl;

    const programa = gl.createProgram();
    gl.attachShader(programa, compilar(gl, gl.VERTEX_SHADER, VERTICE));
    gl.attachShader(programa, compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTO));
    gl.linkProgram(programa);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
      throw new Error(`Erro ao ligar o programa: ${gl.getProgramInfoLog(programa)}`);
    }
    this.programa = programa;
    gl.useProgram(programa);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posicao = gl.getAttribLocation(programa, 'aPosicao');
    gl.enableVertexAttribArray(posicao);
    gl.vertexAttribPointer(posicao, 2, gl.FLOAT, false, 0, 0);

    this.u = Object.fromEntries(UNIFORMES.map((nome) => [nome, gl.getUniformLocation(programa, nome)]));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.texFundo = criarTextura(gl);
    this.texAnterior = criarTextura(gl);
    this.texAltura = criarTextura(gl);
    this.texTinta = criarTextura(gl);
    gl.uniform1i(this.u.uFundo, 0);
    gl.uniform1i(this.u.uFundoAnterior, 1);
    gl.uniform1i(this.u.uAltura, 2);
    gl.uniform1i(this.u.uTinta, 3);
  }

  /** Envia a imagem do fundo. Com `transicao`, a imagem antiga vira a "anterior" do cross-fade. */
  definirFundo(fonte, transicao = false) {
    const gl = this.gl;
    if (transicao) [this.texFundo, this.texAnterior] = [this.texAnterior, this.texFundo];
    gl.bindTexture(gl.TEXTURE_2D, this.texFundo);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte);
  }

  atualizarAltura(campo) {
    const gl = this.gl;
    const { colunas, linhas } = campo;
    gl.bindTexture(gl.TEXTURE_2D, this.texAltura);
    if (colunas !== this.#tamanhoAltura[0] || linhas !== this.#tamanhoAltura[1]) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, colunas, linhas, 0, gl.RED, gl.FLOAT, campo.atual);
      this.#tamanhoAltura = [colunas, linhas];
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, colunas, linhas, gl.RED, gl.FLOAT, campo.atual);
    }
  }

  atualizarTinta(bytes, colunas, linhas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texTinta);
    if (colunas !== this.#tamanhoTinta[0] || linhas !== this.#tamanhoTinta[1]) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, colunas, linhas, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      this.#tamanhoTinta = [colunas, linhas];
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, colunas, linhas, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    }
  }

  desenhar(p) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const u = this.u;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.programa);
    gl.bindVertexArray(this.vao);
    [this.texFundo, this.texAnterior, this.texAltura, this.texTinta].forEach((textura, unidade) => {
      gl.activeTexture(gl.TEXTURE0 + unidade);
      gl.bindTexture(gl.TEXTURE_2D, textura);
    });
    gl.activeTexture(gl.TEXTURE0);

    gl.uniform2f(u.uTexel, 1 / Math.max(1, this.#tamanhoAltura[0]), 1 / Math.max(1, this.#tamanhoAltura[1]));
    gl.uniform1f(u.uAspecto, p.aspecto);
    gl.uniform1f(u.uTempo, p.tempo);
    gl.uniform1f(u.uMistura, p.mistura);
    gl.uniform1f(u.uRefracao, p.refracao);
    gl.uniform1f(u.uEspecular, p.especular);
    gl.uniform1f(u.uCaustica, p.caustica);
    gl.uniform1f(u.uTingimento, p.tingimento);
    gl.uniform1f(u.uVinheta, p.vinheta);
    gl.uniform1i(u.uAnimacao, p.animacao);
    gl.uniform3fv(u.uCorBrilho, p.corBrilho);
    gl.uniform3fv(u.uCorAgua, p.corAgua);
    gl.uniform4fv(u.uRedemoinho, p.redemoinho);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destruir() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
