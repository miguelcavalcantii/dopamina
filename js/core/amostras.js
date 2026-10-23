/**
 * Bancos de amostras: gravações reais recortadas em trechos curtos (cada estouro,
 * cada clique). O recorte é automático: acha os "ataques" (subidas bruscas de energia)
 * e corta de um ataque até o som morrer. Cada toque sorteia um trecho diferente,
 * com pequena variação de tom e volume para nunca soar repetido.
 */
import { aleatorio, clamp } from './util.js';

const JANELA = 0.004; // 4 ms por janela de energia

/**
 * Acha os trechos de um AudioBuffer.
 * @returns {{inicio:number, duracao:number, ganho:number}[]}
 */
export function fatiarTransientes(buffer, {
  intervaloMin = 0.07, // dois ataques mais próximos que isso viram um só
  duracaoMax = 0.32,
  duracaoMin = 0.03,
  sensibilidade = 1, // maior = aceita ataques mais fracos
} = {}) {
  const taxa = buffer.sampleRate;
  const canais = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const passo = Math.max(1, Math.round(JANELA * taxa));
  const total = Math.floor(canais[0].length / passo);
  const energia = new Float32Array(total);
  const picos = new Float32Array(total);

  for (let j = 0; j < total; j++) {
    let soma = 0;
    let pico = 0;
    for (let k = j * passo; k < (j + 1) * passo; k++) {
      let v = 0;
      for (const canal of canais) v += canal[k];
      v /= canais.length;
      soma += v * v;
      pico = Math.max(pico, Math.abs(v));
    }
    energia[j] = Math.sqrt(soma / passo);
    picos[j] = pico;
  }

  const ordenada = Float32Array.from(energia).sort();
  const piso = ordenada[Math.floor(total * 0.3)] || 1e-5;
  const topo = ordenada[Math.floor(total * 0.995)] || 1;
  const limiar = Math.max(piso * 4, topo * 0.12 / sensibilidade);
  const limiarFim = Math.max(piso * 2, limiar * 0.25);

  let picoArquivo = 0;
  for (let j = 0; j < total; j++) picoArquivo = Math.max(picoArquivo, picos[j]);

  const trechos = [];
  const janelasMin = Math.round(intervaloMin / JANELA);
  let ultimo = -Infinity;
  for (let j = 2; j < total; j++) {
    const antes = Math.max(energia[j - 1], energia[j - 2], piso);
    const ataque = energia[j] > limiar && energia[j] > antes * 2.2;
    if (!ataque || j - ultimo < janelasMin) continue;
    ultimo = j;

    // O trecho vai até a energia ficar baixa por ~24 ms (ou até o próximo ataque forte)
    let fim = j + 1;
    let silencio = 0;
    let pico = 0;
    const limite = Math.min(total, j + Math.round(duracaoMax / JANELA));
    for (; fim < limite; fim++) {
      pico = Math.max(pico, picos[fim]);
      if (energia[fim] < limiarFim) silencio++;
      else silencio = 0;
      if (silencio >= 6) break;
      if (fim > j + janelasMin && energia[fim] > limiar && energia[fim] > energia[fim - 2] * 3) break;
    }
    const inicio = Math.max(0, (j - 1) * JANELA);
    const duracao = (fim - j + 1) * JANELA;
    // Trechos fracos demais seriam amplificados junto com o chiado de fundo
    if (duracao < duracaoMin || pico < Math.max(0.02, picoArquivo * 0.2)) continue;
    trechos.push({ inicio, duracao, ganho: clamp(0.7 / pico, 0.4, 3.5) });
  }
  return trechos;
}

/**
 * Carrega vários arquivos e junta os trechos num banco só.
 * `tocar()` sorteia um trecho evitando os últimos usados.
 */
export function criarBanco(audio, urls, { recorte = {}, volume = 1, canal = 'asmr' } = {}) {
  const grupos = []; // um grupo de trechos por arquivo: sorteia o arquivo, depois o trecho
  const recentes = [];
  const pronto = Promise.all(urls.map(async (url) => {
    const buffer = await audio.carregarAmostra(url);
    if (!buffer) return;
    const trechos = fatiarTransientes(buffer, recorte).map((t) => ({ ...t, buffer }));
    if (trechos.length) grupos.push(trechos);
  }));

  return {
    pronto,
    get tamanho() {
      return grupos.reduce((soma, g) => soma + g.length, 0);
    },
    /** Toca um trecho sorteado. Devolve false se o banco ainda está vazio (use o som sintetizado). */
    tocar({ tom = 1, variacaoTom = 0.08, volume: v = 1, pan = 0, reverb = 0 } = {}) {
      if (!grupos.length) return false;
      let t = null;
      for (let tentativa = 0; tentativa < 6; tentativa++) {
        const grupo = grupos[Math.floor(Math.random() * grupos.length)];
        t = grupo[Math.floor(Math.random() * grupo.length)];
        if (!recentes.includes(t)) break;
      }
      recentes.push(t);
      if (recentes.length > 8) recentes.shift();
      audio.tocarAmostra(t.buffer, {
        inicio: t.inicio,
        duracao: t.duracao,
        tom: tom * aleatorio(1 - variacaoTom, 1 + variacaoTom),
        volume: t.ganho * volume * v * aleatorio(0.82, 1),
        pan,
        reverb,
        canal,
      });
      return true;
    },
  };
}
