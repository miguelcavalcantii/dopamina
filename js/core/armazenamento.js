/**
 * Acesso seguro ao localStorage. Em janelas privadas ou com armazenamento
 * bloqueado, as funções simplesmente devolvem o valor padrão.
 */

const PREFIXO = 'dopamina:';

export function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    return bruto === null ? padrao : JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

export function gravar(chave, valor) {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: o progresso vale só para esta sessão */
  }
}
