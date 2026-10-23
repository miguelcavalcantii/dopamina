/**
 * Microgames do Relâmpago. Cada um dura de 3 a 5 segundos e recebe a API do motor `j`:
 *   j.l, j.a, j.area {x0, y0, x1, y1}, j.vel, j.cursor {x, y, pressionado}
 *   j.ganhar(), j.perder(), j.som(nome, opcoes), j.particulas(x, y, cores, n, forca), j.anel(x, y, cor), j.pan(x)
 *
 * `criar(j)` devolve { comando?, atualizar(dt), desenhar(g), pressionar(x, y), mover(x, y, px, py), soltar(x, y), tecla(k) }.
 * Com `vencePorTempo`, sobreviver até o fim já é a vitória.
 */
import { aleatorio, clamp, embaralhar, escolher } from '../../core/util.js';

const TAU = Math.PI * 2;
const CORES_VIVAS = ['#ffd60a', '#22e4ff', '#a3ff12', '#ff7a18', '#3cffb4', '#ff5dc8', '#ffffff'];

/* ---------- Ajudantes de desenho e geometria ---------- */

function caminhoEstrela(g, x, y, r, pontas = 5, interno = 0.45, giro = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < pontas * 2; i++) {
    const raio = i % 2 ? r * interno : r;
    const ang = giro + (i / (pontas * 2)) * TAU;
    g.lineTo(x + Math.cos(ang) * raio, y + Math.sin(ang) * raio);
  }
  g.closePath();
}

function retangulo(g, x, y, l, a, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, l, a, r);
  else g.rect(x, y, l, a);
}

function brilho(g, cor, desfoque) {
  g.shadowColor = cor;
  g.shadowBlur = desfoque;
}

function desenharBalao(g, x, y, r, cor, t) {
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y + r);
  g.quadraticCurveTo(x + Math.sin(t * 3) * 10, y + r * 1.5, x - 4, y + r * 2.1);
  g.stroke();
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r * 1.1);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, cor);
  grad.addColorStop(1, cor);
  g.save();
  brilho(g, cor, 22);
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(x, y, r * 0.86, r, 0, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(x - 6, y + r + 6);
  g.lineTo(x + 6, y + r + 6);
  g.lineTo(x, y + r - 2);
  g.fill();
  g.restore();
}

/** Posições aleatórias sem sobreposição dentro da área segura. */
function posicoesLivres(j, quantidade, raio) {
  const pontos = [];
  for (let tentativa = 0; pontos.length < quantidade && tentativa < 500; tentativa++) {
    const p = { x: aleatorio(j.area.x0 + raio, j.area.x1 - raio), y: aleatorio(j.area.y0 + raio, j.area.y1 - raio * 1.8) };
    if (pontos.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > raio * 2.2)) pontos.push(p);
  }
  return pontos;
}

function distanciaAoSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const comprimento2 = dx * dx + dy * dy;
  const t = comprimento2 ? clamp(((px - ax) * dx + (py - ay) * dy) / comprimento2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/* ---------- Os microgames ---------- */

export const MICROGAMES = [
  {
    id: 'estoure',
    comando: 'ESTOURE!',
    dica: 'Toque em todos os balões',
    fundo: ['#ff2e97', '#7b2bff'],
    duracao: 4,
    criar(j) {
      const quantidade = Math.min(7, 3 + Math.floor(j.vel * 1.4));
      const r = Math.min(j.l, j.a) * 0.06 + 16;
      const baloes = posicoesLivres(j, quantidade, r * 1.2).map((p, i) => ({ ...p, r, cor: CORES_VIVAS[i % CORES_VIVAS.length], fase: aleatorio(0, TAU), vivo: true }));
      let t = 0;
      const yAtual = (b) => b.y + Math.sin(t * 2 + b.fase) * 6;
      return {
        atualizar(dt) { t += dt; },
        desenhar(g) {
          for (const b of baloes) if (b.vivo) desenharBalao(g, b.x, yAtual(b), b.r, b.cor, t + b.fase);
        },
        pressionar(x, y) {
          const alvo = baloes.find((b) => b.vivo && Math.hypot(b.x - x, yAtual(b) - y) < b.r * 1.15);
          if (!alvo) return;
          alvo.vivo = false;
          j.som('estouro', { tamanho: 0.6, pan: j.pan(alvo.x), intervaloMin: 0.01 });
          j.particulas(alvo.x, yAtual(alvo), [alvo.cor, '#ffffff'], 20);
          if (baloes.every((b) => !b.vivo)) j.ganhar();
        },
      };
    },
  },

  {
    id: 'desvie',
    comando: 'DESVIE!',
    dica: 'Fuja dos blocos que caem',
    fundo: ['#00b4ff', '#3a0ca3'],
    duracao: 3.5,
    vencePorTempo: true,
    criar(j) {
      const jogador = { x: j.cursor.x, y: clamp(j.cursor.y, j.area.y0 + 80, j.area.y1), r: 17 };
      const blocos = [];
      let relogio = 0.35;
      let vivo = true;
      let t = 0;
      return {
        atualizar(dt) {
          t += dt;
          if (vivo) {
            jogador.x += (j.cursor.x - jogador.x) * Math.min(1, dt * 16);
            jogador.y += (j.cursor.y - jogador.y) * Math.min(1, dt * 16);
          }
          relogio -= dt;
          if (relogio <= 0) {
            relogio = aleatorio(0.16, 0.32) / j.vel;
            blocos.push({ x: aleatorio(j.area.x0, j.area.x1), y: j.area.y0 - 50, tam: aleatorio(24, 44), vy: aleatorio(260, 420) * j.vel, giro: aleatorio(-4, 4), ang: 0 });
          }
          for (const b of blocos) {
            b.y += b.vy * dt;
            b.ang += b.giro * dt;
          }
          if (vivo && blocos.some((b) => Math.hypot(b.x - jogador.x, b.y - jogador.y) < jogador.r + b.tam * 0.45)) {
            vivo = false;
            j.particulas(jogador.x, jogador.y, ['#ffffff', '#22e4ff', '#ffd60a'], 28);
            j.perder();
          }
        },
        desenhar(g) {
          g.save();
          brilho(g, '#ff2e97', 16);
          g.fillStyle = '#ff2e97';
          for (const b of blocos) {
            g.save();
            g.translate(b.x, b.y);
            g.rotate(b.ang);
            retangulo(g, -b.tam / 2, -b.tam / 2, b.tam, b.tam, 7);
            g.fill();
            g.restore();
          }
          if (vivo) {
            brilho(g, '#22e4ff', 24);
            g.fillStyle = '#ffffff';
            g.beginPath();
            g.arc(jogador.x, jogador.y, jogador.r * (1 + Math.sin(t * 10) * 0.05), 0, TAU);
            g.fill();
            g.fillStyle = '#22e4ff';
            g.beginPath();
            g.arc(jogador.x, jogador.y, jogador.r * 0.55, 0, TAU);
            g.fill();
          }
          g.restore();
        },
      };
    },
  },

  {
    id: 'pegue',
    comando: 'PEGUE!',
    dica: 'Apanhe as 3 estrelas com a cesta',
    fundo: ['#ffb703', '#fb5607'],
    duracao: 4.5,
    criar(j) {
      const cesta = { x: j.cursor.x, y: j.area.y1 - 24, largura: 120 };
      const estrelas = [0, 1, 2].map((i) => ({
        x: aleatorio(j.area.x0 + 60, j.area.x1 - 60),
        y: j.area.y0 - 40,
        atraso: (i * 0.75) / j.vel,
        vy: 230 * j.vel,
        pega: false,
        giro: aleatorio(0, TAU),
      }));
      let pegas = 0;
      let t = 0;
      let perdeu = false;
      return {
        atualizar(dt) {
          t += dt;
          cesta.x += (clamp(j.cursor.x, j.area.x0, j.area.x1) - cesta.x) * Math.min(1, dt * 18);
          for (const e of estrelas) {
            if (e.pega || t < e.atraso) continue;
            e.y += e.vy * dt;
            e.x += Math.sin(t * 2 + e.giro) * 40 * dt;
            e.giro += dt * 3;
            if (e.y >= cesta.y - 14 && e.y <= cesta.y + 16 && Math.abs(e.x - cesta.x) < cesta.largura / 2 + 10) {
              e.pega = true;
              pegas++;
              j.som('combo', { n: pegas, intervaloMin: 0.01 });
              j.particulas(e.x, cesta.y - 10, ['#ffd60a', '#ffffff'], 16);
              if (pegas === estrelas.length) j.ganhar();
            } else if (e.y > j.a + 30 && !perdeu) {
              perdeu = true;
              j.perder();
            }
          }
        },
        desenhar(g) {
          g.save();
          for (const e of estrelas) {
            if (e.pega || t < e.atraso) continue;
            brilho(g, '#ffd60a', 20);
            g.fillStyle = '#fff3a0';
            caminhoEstrela(g, e.x, e.y, 20, 5, 0.45, e.giro);
            g.fill();
          }
          brilho(g, '#ffffff', 14);
          const grad = g.createLinearGradient(0, cesta.y - 20, 0, cesta.y + 26);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(1, '#7b2bff');
          g.fillStyle = grad;
          g.beginPath();
          g.moveTo(cesta.x - cesta.largura / 2, cesta.y - 14);
          g.lineTo(cesta.x + cesta.largura / 2, cesta.y - 14);
          g.lineTo(cesta.x + cesta.largura * 0.36, cesta.y + 24);
          g.lineTo(cesta.x - cesta.largura * 0.36, cesta.y + 24);
          g.closePath();
          g.fill();
          g.restore();
        },
      };
    },
  },

  {
    id: 'arraste',
    comando: 'ARRASTE!',
    dica: 'Leve a joia até o alvo',
    fundo: ['#00d9a0', '#0062b8'],
    duracao: 4,
    criar(j) {
      const esquerda = Math.random() < 0.5;
      const terco = (j.area.x1 - j.area.x0) / 3;
      const joia = {
        x: esquerda ? j.area.x0 + terco * 0.5 : j.area.x1 - terco * 0.5,
        y: aleatorio(j.area.y0 + 60, j.area.y1 - 60),
        r: 34,
      };
      const alvo = {
        x: esquerda ? j.area.x1 - terco * 0.5 : j.area.x0 + terco * 0.5,
        y: aleatorio(j.area.y0 + 60, j.area.y1 - 60),
        r: Math.max(42, 62 - j.vel * 8),
      };
      let segurando = false;
      let entregue = false;
      const deslocamento = { x: 0, y: 0 };
      let t = 0;
      return {
        atualizar(dt) { t += dt; },
        pressionar(x, y) {
          if (Math.hypot(x - joia.x, y - joia.y) < joia.r * 1.5) {
            segurando = true;
            deslocamento.x = joia.x - x;
            deslocamento.y = joia.y - y;
            j.som('clique');
          }
        },
        mover(x, y) {
          if (!segurando || entregue) return;
          joia.x = x + deslocamento.x;
          joia.y = y + deslocamento.y;
          if (Math.hypot(joia.x - alvo.x, joia.y - alvo.y) < alvo.r * 0.65) {
            entregue = true;
            joia.x = alvo.x;
            joia.y = alvo.y;
            j.particulas(alvo.x, alvo.y, ['#3cffb4', '#ffffff', '#ffd60a'], 30);
            j.ganhar();
          }
        },
        soltar() { segurando = false; },
        desenhar(g) {
          g.save();
          g.translate(alvo.x, alvo.y);
          g.rotate(t * 0.8);
          g.setLineDash([12, 10]);
          g.lineWidth = 5;
          g.strokeStyle = '#ffffff';
          brilho(g, '#3cffb4', 18);
          g.beginPath();
          g.arc(0, 0, alvo.r * (1 + Math.sin(t * 4) * 0.04), 0, TAU);
          g.stroke();
          g.restore();

          g.save();
          g.translate(joia.x, joia.y);
          g.scale(segurando ? 1.12 : 1, segurando ? 1.12 : 1);
          brilho(g, '#ff5dc8', 26);
          const grad = g.createLinearGradient(-joia.r, -joia.r, joia.r, joia.r);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.35, '#ff5dc8');
          grad.addColorStop(1, '#7b2bff');
          g.fillStyle = grad;
          g.beginPath();
          for (let i = 0; i < 6; i++) g.lineTo(Math.cos((i / 6) * TAU) * joia.r, Math.sin((i / 6) * TAU) * joia.r);
          g.closePath();
          g.fill();
          g.restore();
        },
      };
    },
  },

  {
    id: 'tecla',
    dica: 'Aperte no teclado ou toque na tecla',
    fundo: ['#8b5cff', '#ff2e97'],
    duracao: 3.2,
    criar(j) {
      const letras = embaralhar(['A', 'S', 'D', 'F', 'G', 'J', 'K', 'L']).slice(0, 4);
      const alvo = escolher(letras);
      const lado = Math.min(118, ((j.area.x1 - j.area.x0) - 3 * 16) / 4);
      const inicioX = (j.l - (lado * 4 + 16 * 3)) / 2;
      const y = (j.area.y0 + j.area.y1) / 2 - lado / 2;
      const teclas = letras.map((letra, i) => ({ letra, x: inicioX + i * (lado + 16), y, apertada: 0, errada: false }));
      let decidido = false;

      const escolherLetra = (letra) => {
        if (decidido) return;
        const tecla = teclas.find((k) => k.letra === letra);
        if (!tecla) return;
        decidido = true;
        tecla.apertada = 1;
        if (letra === alvo) {
          j.particulas(tecla.x + lado / 2, tecla.y + lado / 2, ['#ffd60a', '#ffffff'], 22);
          j.ganhar();
        } else {
          tecla.errada = true;
          j.perder();
        }
      };

      return {
        comando: `APERTE ${alvo}!`,
        atualizar() {},
        pressionar(x, py) {
          const tecla = teclas.find((k) => x >= k.x && x <= k.x + lado && py >= k.y && py <= k.y + lado + 10);
          if (tecla) escolherLetra(tecla.letra);
        },
        tecla(k) { escolherLetra(k.toUpperCase()); },
        desenhar(g) {
          g.save();
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `${Math.round(lado * 0.48)}px Bungee, sans-serif`;
          for (const k of teclas) {
            const afundar = k.apertada ? 8 : 0;
            g.fillStyle = 'rgba(20,8,60,0.55)';
            retangulo(g, k.x, k.y + 10, lado, lado, 18);
            g.fill();
            const grad = g.createLinearGradient(0, k.y, 0, k.y + lado);
            grad.addColorStop(0, k.errada ? '#ffb38a' : '#ffffff');
            grad.addColorStop(1, k.errada ? '#ff7a18' : '#e3d6ff');
            g.fillStyle = grad;
            retangulo(g, k.x, k.y + afundar, lado, lado, 18);
            g.fill();
            g.fillStyle = '#2a0b5e';
            g.fillText(k.letra, k.x + lado / 2, k.y + afundar + lado / 2 + 2);
          }
          g.restore();
        },
      };
    },
  },

  {
    id: 'nao-toque',
    comando: 'NÃO TOQUE!',
    dica: 'Resista ao botão...',
    fundo: ['#ff7a18', '#c9184a'],
    duracao: 3,
    vencePorTempo: true,
    criar(j) {
      const botao = { x: j.l / 2, y: (j.area.y0 + j.area.y1) / 2, r: Math.min(90, Math.min(j.l, j.a) * 0.15) };
      let t = 0;
      let tocou = false;
      return {
        atualizar(dt) {
          t += dt;
          // O botão chega pertinho do cursor, só para provocar
          const dx = j.cursor.x - botao.x;
          const dy = j.cursor.y - botao.y;
          const d = Math.hypot(dx, dy);
          if (d > botao.r * 1.6) {
            botao.x += (dx / d) * 45 * j.vel * dt;
            botao.y += (dy / d) * 45 * j.vel * dt;
          }
        },
        pressionar(x, y) {
          if (tocou || Math.hypot(x - botao.x, y - botao.y) > botao.r) return;
          tocou = true;
          j.particulas(botao.x, botao.y, ['#ffd60a', '#ff2e97', '#ffffff'], 30);
          j.perder();
        },
        desenhar(g) {
          const escala = tocou ? 0.85 : 1 + Math.sin(t * 7) * 0.04;
          const r = botao.r * escala;
          g.save();
          g.fillStyle = 'rgba(40,0,20,0.45)';
          g.beginPath();
          g.ellipse(botao.x, botao.y + r * 0.25, r * 1.05, r * 0.95, 0, 0, TAU);
          g.fill();
          brilho(g, '#ffd60a', 30);
          const grad = g.createRadialGradient(botao.x - r * 0.3, botao.y - r * 0.4, r * 0.1, botao.x, botao.y, r);
          grad.addColorStop(0, '#fff6b0');
          grad.addColorStop(0.4, '#ffd60a');
          grad.addColorStop(1, '#ff7a18');
          g.fillStyle = grad;
          g.beginPath();
          g.arc(botao.x, botao.y, r, 0, TAU);
          g.fill();
          g.shadowBlur = 0;
          g.fillStyle = '#7a0b3a';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `${Math.round(r * 0.36)}px Bungee, sans-serif`;
          g.fillText('APERTA', botao.x, botao.y + 2);
          // Brilhinhos tentadores em volta
          g.fillStyle = '#ffffff';
          for (let i = 0; i < 5; i++) {
            const ang = t * 1.5 + (i / 5) * TAU;
            caminhoEstrela(g, botao.x + Math.cos(ang) * r * 1.45, botao.y + Math.sin(ang) * r * 1.45, 6 + Math.sin(t * 5 + i) * 2, 4, 0.4, t);
            g.fill();
          }
          g.restore();
        },
      };
    },
  },

  {
    id: 'cor',
    dica: 'Toque na cor certa (ou tecle 1 a 4)',
    fundo: ['#1b0b4a', '#3a0ca3'],
    duracao: 3,
    criar(j) {
      const paleta = [
        { nome: 'ROSA', hex: '#ff2e97' },
        { nome: 'AMARELO', hex: '#ffd60a' },
        { nome: 'VERDE', hex: '#a3ff12' },
        { nome: 'AZUL', hex: '#2f8bff' },
        { nome: 'LARANJA', hex: '#ff7a18' },
        { nome: 'ROXO', hex: '#a35cff' },
      ];
      const opcoes = embaralhar(paleta).slice(0, 4);
      const alvo = escolher(opcoes);
      const r = Math.min(70, (j.area.x1 - j.area.x0) / 10 + 20);
      const y = (j.area.y0 + j.area.y1) / 2;
      const espaco = Math.min(r * 2.7, (j.area.x1 - j.area.x0) / 4);
      const circulos = opcoes.map((cor, i) => ({ ...cor, x: j.l / 2 + (i - 1.5) * espaco, y, escolhido: false }));
      let decidido = false;
      let t = 0;
      const escolherCirculo = (c) => {
        if (decidido || !c) return;
        decidido = true;
        c.escolhido = true;
        if (c === circulos.find((x) => x.nome === alvo.nome)) {
          j.particulas(c.x, c.y, [c.hex, '#ffffff'], 24);
          j.ganhar();
        } else {
          j.perder();
        }
      };
      return {
        comando: `TOQUE NO ${alvo.nome}!`,
        atualizar(dt) { t += dt; },
        pressionar(x, py) { escolherCirculo(circulos.find((c) => Math.hypot(c.x - x, c.y - py) < r * 1.1)); },
        tecla(k) { if (/^[1-4]$/.test(k)) escolherCirculo(circulos[Number(k) - 1]); },
        desenhar(g) {
          g.save();
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          circulos.forEach((c, i) => {
            const pulo = Math.sin(t * 5 + i) * 4;
            brilho(g, c.hex, 26);
            g.fillStyle = c.hex;
            g.beginPath();
            g.arc(c.x, c.y + pulo, r * (c.escolhido ? 1.12 : 1), 0, TAU);
            g.fill();
            g.shadowBlur = 0;
            g.fillStyle = 'rgba(20,8,60,0.8)';
            g.font = `${Math.round(r * 0.5)}px Bungee, sans-serif`;
            g.fillText(String(i + 1), c.x, c.y + pulo + 2);
          });
          g.restore();
        },
      };
    },
  },

  {
    id: 'corte',
    comando: 'CORTE!',
    dica: 'Arraste para fatiar as frutas',
    fundo: ['#7bd400', '#007f5f'],
    duracao: 4.2,
    criar(j) {
      const gravidade = 760 * j.vel * j.vel;
      const tipos = [
        { casca: '#3cff6e', polpa: '#ff2e60' },
        { casca: '#ff9a1f', polpa: '#ffd27a' },
        { casca: '#b54dff', polpa: '#f1c4ff' },
        { casca: '#ffe14d', polpa: '#fff7c2' },
      ];
      const frutas = [0, 1, 2].map((i) => {
        const x = aleatorio(j.area.x0 + 60, j.area.x1 - 60);
        const apice = aleatorio(j.area.y0 + 30, j.area.y0 + (j.area.y1 - j.area.y0) * 0.35);
        const y = j.a + 40;
        return {
          x, y, r: 36,
          vx: (j.l / 2 - x) * aleatorio(0.15, 0.35),
          vy: -Math.sqrt(2 * gravidade * (y - apice)),
          atraso: (i * 0.4) / j.vel,
          cortada: false,
          metades: null,
          ...escolher(tipos),
          giro: aleatorio(0, TAU),
        };
      });
      const rastro = [];
      let t = 0;
      let perdeu = false;

      return {
        atualizar(dt) {
          t += dt;
          for (const f of frutas) {
            if (t < f.atraso) continue;
            if (f.cortada) {
              for (const m of f.metades) {
                m.vy += gravidade * dt;
                m.x += m.vx * dt;
                m.y += m.vy * dt;
                m.giro += m.vgiro * dt;
              }
              continue;
            }
            f.vy += gravidade * dt;
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            f.giro += dt * 2;
            if (f.vy > 0 && f.y > j.a + 60 && !perdeu) {
              perdeu = true;
              j.perder();
            }
          }
          for (const p of rastro) p.vida -= dt * 4;
          while (rastro.length && rastro[0].vida <= 0) rastro.shift();
        },
        mover(x, y, px, py) {
          if (!j.cursor.pressionado) return;
          rastro.push({ x, y, vida: 1 });
          for (const f of frutas) {
            if (f.cortada || t < f.atraso) continue;
            if (distanciaAoSegmento(f.x, f.y, px, py, x, y) < f.r) {
              f.cortada = true;
              const ang = Math.atan2(y - py, x - px);
              f.metades = [-1, 1].map((lado) => ({
                x: f.x, y: f.y,
                vx: f.vx + Math.cos(ang + lado * Math.PI / 2) * 160,
                vy: f.vy * 0.3 + Math.sin(ang + lado * Math.PI / 2) * 160 - 120,
                giro: ang, vgiro: lado * 6, lado,
              }));
              j.som('corte', { pan: j.pan(f.x) });
              j.particulas(f.x, f.y, [f.polpa, f.casca], 18);
              if (frutas.every((x2) => x2.cortada)) j.ganhar();
            }
          }
        },
        desenhar(g) {
          g.save();
          for (const f of frutas) {
            if (t < f.atraso) continue;
            const partes = f.cortada ? f.metades : [null];
            for (const m of partes) {
              g.save();
              g.translate(m ? m.x : f.x, m ? m.y : f.y);
              g.rotate(m ? m.giro : f.giro);
              brilho(g, f.casca, 18);
              g.fillStyle = f.casca;
              g.beginPath();
              if (m) g.arc(0, 0, f.r, m.lado > 0 ? 0 : Math.PI, m.lado > 0 ? Math.PI : TAU);
              else g.arc(0, 0, f.r, 0, TAU);
              g.fill();
              g.shadowBlur = 0;
              g.fillStyle = f.polpa;
              g.beginPath();
              if (m) g.arc(0, 0, f.r * 0.78, m.lado > 0 ? 0 : Math.PI, m.lado > 0 ? Math.PI : TAU);
              else g.arc(-f.r * 0.3, -f.r * 0.3, f.r * 0.22, 0, TAU);
              g.fill();
              g.restore();
            }
          }
          // Rastro da lâmina
          if (rastro.length > 1) {
            g.lineCap = 'round';
            g.lineJoin = 'round';
            brilho(g, '#ffffff', 16);
            for (let i = 1; i < rastro.length; i++) {
              g.strokeStyle = `rgba(255,255,255,${rastro[i].vida})`;
              g.lineWidth = 7 * rastro[i].vida;
              g.beginPath();
              g.moveTo(rastro[i - 1].x, rastro[i - 1].y);
              g.lineTo(rastro[i].x, rastro[i].y);
              g.stroke();
            }
          }
          g.restore();
        },
      };
    },
  },

  {
    id: 'infle',
    comando: 'INFLE!',
    dica: 'Toque rápido sem parar (ou espaço)',
    fundo: ['#ff5dc8', '#ffb703'],
    duracao: 4,
    criar(j) {
      const meta = Math.round(8 + j.vel * 3);
      const cx = j.l / 2;
      const cy = (j.area.y0 + j.area.y1) / 2;
      const raioBase = Math.min(j.l, j.a) * 0.06 + 12;
      const raioMax = Math.min(j.l, j.a - 260) * 0.28 + 30;
      let valor = 0;
      let cheio = false;
      let t = 0;
      let empurrao = 0;
      return {
        atualizar(dt) {
          t += dt;
          if (!cheio) valor = Math.max(0, valor - dt * 1.1);
          empurrao = Math.max(0, empurrao - dt * 6);
        },
        pressionar() {
          if (cheio) return;
          valor += 1;
          empurrao = 1;
          j.som('gota', { tom: 0.6 + (valor / meta) * 1.2, volume: 0.6, intervaloMin: 0.01 });
          if (valor >= meta) {
            cheio = true;
            const r = raioBase + raioMax;
            j.som('estouro', { tamanho: 1 });
            j.particulas(cx, cy, ['#ff5dc8', '#ffd60a', '#ffffff', '#22e4ff'], 46, 1.6);
            j.anel(cx, cy, '#ffffff', r);
            j.ganhar();
          }
        },
        desenhar(g) {
          const fracao = Math.min(1, valor / meta);
          if (!cheio) {
            const r = raioBase + raioMax * fracao + empurrao * 6;
            desenharBalao(g, cx, cy, r, '#ff5dc8', t);
          }
          g.save();
          g.lineWidth = 10;
          g.lineCap = 'round';
          g.strokeStyle = 'rgba(255,255,255,0.2)';
          const yBarra = j.area.y1 - 6;
          g.beginPath();
          g.moveTo(j.l / 2 - 120, yBarra);
          g.lineTo(j.l / 2 + 120, yBarra);
          g.stroke();
          brilho(g, '#ffd60a', 12);
          g.strokeStyle = '#ffd60a';
          g.beginPath();
          g.moveTo(j.l / 2 - 120, yBarra);
          g.lineTo(j.l / 2 - 120 + 240 * fracao, yBarra);
          g.stroke();
          g.restore();
        },
      };
    },
  },

  {
    id: 'acerte',
    comando: 'ACERTE!',
    dica: 'Toque no alvo em movimento',
    fundo: ['#00e0ff', '#c218ff'],
    duracao: 3.5,
    criar(j) {
      const r = Math.max(28, 52 - j.vel * 9);
      const ang = aleatorio(0, TAU);
      const velocidade = 260 * j.vel;
      const alvo = { x: j.l / 2, y: (j.area.y0 + j.area.y1) / 2, vx: Math.cos(ang) * velocidade, vy: Math.sin(ang) * velocidade };
      let acertou = false;
      return {
        atualizar(dt) {
          if (acertou) return;
          alvo.x += alvo.vx * dt;
          alvo.y += alvo.vy * dt;
          if (alvo.x < j.area.x0 + r || alvo.x > j.area.x1 - r) alvo.vx *= -1;
          if (alvo.y < j.area.y0 + r || alvo.y > j.area.y1 - r) alvo.vy *= -1;
          alvo.x = clamp(alvo.x, j.area.x0 + r, j.area.x1 - r);
          alvo.y = clamp(alvo.y, j.area.y0 + r, j.area.y1 - r);
        },
        pressionar(x, y) {
          if (acertou) return;
          if (Math.hypot(x - alvo.x, y - alvo.y) < r * 1.15) {
            acertou = true;
            j.particulas(alvo.x, alvo.y, ['#ffd60a', '#ffffff', '#ff2bd6'], 30, 1.3);
            j.ganhar();
          } else {
            // Errar o clique não tira vida: só mostra onde foi
            j.anel(x, y, 'rgba(255,255,255,0.7)', 18);
          }
        },
        desenhar(g) {
          if (acertou) return;
          g.save();
          brilho(g, '#ff2bd6', 24);
          [['#ffffff', 1], ['#ff2bd6', 0.75], ['#ffffff', 0.5], ['#ffd60a', 0.26]].forEach(([cor, escala]) => {
            g.fillStyle = cor;
            g.beginPath();
            g.arc(alvo.x, alvo.y, r * escala, 0, TAU);
            g.fill();
            g.shadowBlur = 0;
          });
          g.restore();
        },
      };
    },
  },
];
