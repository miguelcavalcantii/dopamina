/**
 * Progresso do jogador: XP, nível, conquistas, missões do dia e recordes.
 * Fica salvo no localStorage. Emite: 'xp', 'nivel', 'conquista', 'missao', 'mudou'.
 */
import { ler, gravar } from './armazenamento.js';
import { Emissor, dataHoje, embaralhar, geradorComSemente, hashTexto } from './util.js';
import { CONQUISTAS } from './conquistas.js';
import { MODELOS_MISSAO, XP_POR_EVENTO } from './missoes.js';

const CHAVE = 'progresso';
const MISSOES_POR_DIA = 3;

const estadoInicial = () => ({
  versao: 1,
  xp: 0,
  conquistas: {},
  recordes: {},
  contadores: {},
  distintos: {},
  missoes: { data: '', lista: [] },
  missoesConcluidas: 0,
});

/** XP necessário para sair de `nivel` e chegar ao próximo. */
export const xpDoNivel = (nivel) => 80 + (nivel - 1) * 40;

class Progresso extends Emissor {
  #estado;
  #disponiveis = new Set();
  #timerSalvar = 0;

  constructor() {
    super();
    const salvo = ler(CHAVE, null);
    this.#estado = { ...estadoInicial(), ...(salvo && typeof salvo === 'object' ? salvo : {}) };
    addEventListener('pagehide', () => this.salvarAgora());
  }

  get estado() {
    return this.#estado;
  }

  /** Informa quais experiências existem (as missões só usam essas). */
  definirDisponiveis(ids) {
    this.#disponiveis = new Set(ids);
    this.#garantirMissoes();
  }

  infoNivel() {
    let nivel = 1;
    let resto = this.#estado.xp;
    while (resto >= xpDoNivel(nivel)) {
      resto -= xpDoNivel(nivel);
      nivel++;
    }
    const necessario = xpDoNivel(nivel);
    return { nivel, xpNoNivel: resto, necessario, fracao: resto / necessario };
  }

  ganharXp(quantidade) {
    if (!(quantidade > 0)) return;
    const antes = this.infoNivel().nivel;
    this.#estado.xp += quantidade;
    const info = this.infoNivel();
    this.emit('xp', { quantidade, ...info });
    if (info.nivel > antes) {
      this.emit('nivel', info);
      this.#verificarConquistas();
    }
    this.#mudou();
  }

  /**
   * Registra algo que o jogador fez. `valor` opcional conta itens distintos
   * (ex.: qual tema foi visitado).
   */
  registrar(evento, quantidade = 1, valor) {
    const e = this.#estado;
    e.contadores[evento] = (e.contadores[evento] ?? 0) + quantidade;
    if (valor !== undefined) {
      const lista = (e.distintos[evento] ??= []);
      if (!lista.includes(valor)) lista.push(valor);
    }
    this.#atualizarMissoes(evento, quantidade, valor);
    this.#verificarConquistas();
    const xp = (XP_POR_EVENTO[evento] ?? 0) * quantidade;
    if (xp > 0) this.ganharXp(xp);
    else this.#mudou();
  }

  contador(evento) {
    return this.#estado.contadores[evento] ?? 0;
  }

  distintos(evento) {
    return this.#estado.distintos[evento]?.length ?? 0;
  }

  recorde(experiencia, chave) {
    return this.#estado.recordes[experiencia]?.[chave];
  }

  /** Salva o valor se for melhor que o recorde anterior. Devolve true se for recorde novo. */
  definirRecorde(experiencia, chave, valor, { menorMelhor = false } = {}) {
    const atual = this.recorde(experiencia, chave);
    const melhor = atual === undefined || (menorMelhor ? valor < atual : valor > atual);
    if (!melhor) return false;
    (this.#estado.recordes[experiencia] ??= {})[chave] = valor;
    this.#verificarConquistas();
    this.#mudou();
    return true;
  }

  conquistaDesbloqueada(id) {
    return Boolean(this.#estado.conquistas[id]);
  }

  /** Missões de hoje já combinadas com seus modelos (texto, meta, xp...). */
  missoesDoDia() {
    this.#garantirMissoes();
    return this.#estado.missoes.lista
      .map((m) => {
        const modelo = MODELOS_MISSAO.find((md) => md.id === m.id);
        return modelo ? { ...modelo, ...m } : null;
      })
      .filter(Boolean);
  }

  salvarAgora() {
    clearTimeout(this.#timerSalvar);
    gravar(CHAVE, this.#estado);
  }

  /* ---------- Interno ---------- */

  #garantirMissoes() {
    if (!this.#disponiveis.size) return;
    const hoje = dataHoje();
    const missoes = this.#estado.missoes;
    if (missoes.data === hoje && missoes.lista.length) return;

    const elegiveis = MODELOS_MISSAO.filter((md) =>
      (!md.requer || this.#disponiveis.has(md.requer)) &&
      (!md.minimoDisponiveis || this.#disponiveis.size >= md.minimoDisponiveis));
    // Mesma data, mesmas missões: o sorteio usa a data como semente
    const sorteadas = embaralhar(elegiveis, geradorComSemente(hashTexto(hoje))).slice(0, MISSOES_POR_DIA);
    missoes.data = hoje;
    missoes.lista = sorteadas.map((md) => ({ id: md.id, progresso: 0, valores: [], concluida: false }));
    this.#mudou();
  }

  #atualizarMissoes(evento, quantidade, valor) {
    this.#garantirMissoes();
    for (const missao of this.#estado.missoes.lista) {
      if (missao.concluida) continue;
      const modelo = MODELOS_MISSAO.find((md) => md.id === missao.id);
      if (!modelo || modelo.evento !== evento) continue;

      if (modelo.distinto) {
        if (valor === undefined || missao.valores.includes(valor)) continue;
        missao.valores.push(valor);
        missao.progresso = missao.valores.length;
      } else {
        missao.progresso += quantidade;
      }

      if (missao.progresso >= modelo.meta) {
        missao.progresso = modelo.meta;
        missao.concluida = true;
        this.#estado.missoesConcluidas++;
        this.emit('missao', modelo);
        this.ganharXp(modelo.xp);
      }
    }
  }

  #verificarConquistas() {
    const estado = this.#estado;
    const visao = {
      contador: (ev) => this.contador(ev),
      distintos: (ev) => this.distintos(ev),
      recorde: (exp, chave) => this.recorde(exp, chave) ?? 0,
      nivel: this.infoNivel().nivel,
      missoesConcluidas: estado.missoesConcluidas,
      missoesHoje: estado.missoes.lista.filter((m) => m.concluida).length,
    };
    for (const conquista of CONQUISTAS) {
      if (estado.conquistas[conquista.id] || !conquista.condicao(visao)) continue;
      estado.conquistas[conquista.id] = Date.now();
      this.emit('conquista', conquista);
      this.ganharXp(conquista.xp ?? 40);
    }
  }

  #mudou() {
    this.emit('mudou');
    clearTimeout(this.#timerSalvar);
    this.#timerSalvar = setTimeout(() => this.salvarAgora(), 400);
  }
}

export const progresso = new Progresso();
