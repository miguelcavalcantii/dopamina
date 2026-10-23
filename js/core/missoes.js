/**
 * Modelos de missões diárias e XP por evento.
 * Cada missão escuta um evento registrado em progresso.registrar().
 * `requer` limita a missão a experiências disponíveis; `distinto` conta valores diferentes.
 */

export const MODELOS_MISSAO = [
  { id: 'gotas', texto: 'Solte 30 gotas grandes', evento: 'vidro:gota-grande', meta: 30, xp: 60, icone: 'gota', cor: '#22e4ff', requer: 'vidro-liquido' },
  { id: 'bolhas', texto: 'Estoure 40 bolhas', evento: 'vidro:bolha', meta: 40, xp: 70, icone: 'bolha', cor: '#3cffb4', requer: 'vidro-liquido' },
  { id: 'acalmar', texto: 'Fique 2 minutos no modo Acalmar', evento: 'vidro:acalmar-segundos', meta: 120, xp: 80, icone: 'lua', cor: '#b18cff', formato: 'tempo', requer: 'vidro-liquido' },
  { id: 'temas', texto: 'Visite 3 temas do Vidro Líquido', evento: 'vidro:tema', meta: 3, distinto: true, xp: 50, icone: 'brilho', cor: '#ffd60a', requer: 'vidro-liquido' },
  { id: 'tinta', texto: 'Pinte a água por 1 minuto', evento: 'vidro:tinta-segundos', meta: 60, xp: 60, icone: 'pincel', cor: '#ff5dc8', formato: 'tempo', requer: 'vidro-liquido' },
  { id: 'redemoinhos', texto: 'Crie 5 redemoinhos', evento: 'vidro:redemoinho', meta: 5, xp: 60, icone: 'espiral', cor: '#00f0ff', requer: 'vidro-liquido' },
  { id: 'chuva', texto: 'Deixe chover por 1 minuto', evento: 'vidro:chuva-segundos', meta: 60, xp: 50, icone: 'chuva', cor: '#3a7bff', formato: 'tempo', requer: 'vidro-liquido' },
  { id: 'relampago-vitorias', texto: 'Vença 15 microgames no Relâmpago', evento: 'relampago:vitoria', meta: 15, xp: 70, icone: 'raio', cor: '#ff2e97', requer: 'microgames' },
  { id: 'relampago-partidas', texto: 'Jogue 3 partidas de Relâmpago', evento: 'relampago:partida', meta: 3, xp: 50, icone: 'jogar', cor: '#ffd60a', requer: 'microgames' },
  { id: 'corrida-orbes', texto: 'Junte 60 orbes na Corrida Neon', evento: 'corrida:orbe', meta: 60, xp: 70, icone: 'corrida', cor: '#00f0ff', requer: 'corrida-neon' },
  { id: 'corrida-metros', texto: 'Corra 1.500 m na Corrida Neon', evento: 'corrida:metros', meta: 1500, xp: 70, icone: 'raio', cor: '#ff2bd6', requer: 'corrida-neon' },
  { id: 'ritmo-perfeitos', texto: 'Acerte 40 notas perfeitas no Ritmo', evento: 'ritmo:perfeito', meta: 40, xp: 70, icone: 'musica', cor: '#a3ff12', requer: 'ritmo' },
  { id: 'ritmo-musicas', texto: 'Toque 2 músicas diferentes no Ritmo', evento: 'ritmo:musica', meta: 2, distinto: true, xp: 60, icone: 'musica', cor: '#22e4ff', requer: 'ritmo' },
  { id: 'fogos-lancar', texto: 'Lance 40 fogos de artifício', evento: 'fogos:lancado', meta: 40, xp: 60, icone: 'fogos', cor: '#ff7a18', requer: 'fogos' },
  { id: 'areia-formas', texto: 'Forme 3 figuras na Areia Mágica', evento: 'areia:forma', meta: 3, distinto: true, xp: 60, icone: 'particulas', cor: '#ffb703', requer: 'areia-magica' },
  { id: 'caleido-desenhar', texto: 'Desenhe por 2 minutos no Caleidoscópio', evento: 'caleido:segundos', meta: 120, xp: 70, icone: 'flor', cor: '#c77dff', formato: 'tempo', requer: 'caleidoscopio' },
  { id: 'bolha-estourar', texto: 'Estoure 150 bolhas no Plástico-Bolha', evento: 'bolha:estouro', meta: 150, xp: 60, icone: 'bolhas', cor: '#3cffb4', requer: 'plastico-bolha' },
  { id: 'respira-ciclos', texto: 'Complete 5 ciclos no Respira', evento: 'respira:ciclo', meta: 5, xp: 70, icone: 'respirar', cor: '#b18cff', requer: 'respira' },
  { id: 'slime-apertar', texto: 'Aperte o Slime 30 vezes', evento: 'slime:aperto', meta: 30, xp: 50, icone: 'gosma', cor: '#7bff4a', requer: 'slime' },
  { id: 'bolha-folha', texto: 'Complete uma folha inteira de Plástico-Bolha', evento: 'bolha:folha', meta: 1, xp: 80, icone: 'bolhas', cor: '#9fd8ff', requer: 'plastico-bolha' },
  { id: 'relampago-dificil', texto: 'Jogue 2 partidas de Relâmpago no Difícil', evento: 'relampago:partida-dificil', meta: 2, xp: 80, icone: 'raio', cor: '#ff7a18', requer: 'microgames' },
  { id: 'spinner-voltas', texto: 'Dê 500 voltas no Fidget Spinner', evento: 'spinner:volta', meta: 500, xp: 60, icone: 'spinner', cor: '#bfe4ff', requer: 'fidget-spinner' },
  { id: 'popit-viradas', texto: 'Vire a placa do Pop It 2 vezes', evento: 'popit:virada', meta: 2, xp: 70, icone: 'popit', cor: '#ffd23f', requer: 'pop-it' },
  { id: 'tempo-livre', texto: 'Divirta-se por 5 minutos', evento: 'tempo', meta: 300, xp: 70, icone: 'relogio', cor: '#ff7a18', formato: 'tempo' },
  { id: 'explorar', texto: 'Abra 3 experiências diferentes', evento: 'experiencia:abrir', meta: 3, distinto: true, xp: 60, icone: 'bussola', cor: '#a3ff12', minimoDisponiveis: 3 },
];

/** XP ganho a cada unidade do evento (frações acumulam). */
export const XP_POR_EVENTO = {
  'vidro:gota-grande': 0.5,
  'vidro:bolha': 0.5,
  'vidro:redemoinho': 3,
  'relampago:vitoria': 2,
  'corrida:orbe': 0.3,
  'ritmo:perfeito': 0.5,
  'fogos:lancado': 0.3,
  'areia:explosao': 0.5,
  'areia:forma': 2,
  'caleido:segundos': 0.2,
  'bolha:estouro': 0.1,
  'bolha:folha': 15,
  'respira:ciclo': 3,
  'slime:aperto': 0.3,
  'spinner:volta': 0.02,
  'popit:aperto': 0.15,
  'popit:virada': 8,
  tempo: 0.2,
};
