/**
 * Catálogo de experiências. Para adicionar uma nova: crie a pasta em
 * js/experiencias/<id>/index.js exportando `montar(raiz, contexto)` e
 * marque `disponivel: true` aqui.
 */

export const EXPERIENCIAS = [
  {
    id: 'vidro-liquido',
    nome: 'Vidro Líquido',
    descricao: 'A tela vira água. Toque, arraste, pinte, estoure bolhas ou só respire.',
    categoria: 'Relaxar',
    icone: 'gota',
    cores: ['#22e4ff', '#7b5cff'],
    destaque: true,
    disponivel: true,
    previa: 'vidro',
    carregar: () => import('./vidro-liquido/index.js'),
    estatistica: (p) => {
      const gotas = p.contador('vidro:gota-grande');
      return gotas ? `${gotas} gotas soltas` : 'Comece por aqui';
    },
  },
  {
    id: 'microgames',
    nome: 'Relâmpago',
    descricao: 'Desafios de 3 segundos que mudam o tempo todo. Do Fácil ao Insano.',
    categoria: 'Ação',
    icone: 'raio',
    cores: ['#ff2e97', '#ffd60a'],
    disponivel: true,
    previa: 'microgames',
    carregar: () => import('./microgames/index.js'),
    estatistica: (p) => {
      const recorde = Math.max(0, ...['pontos-facil', 'pontos', 'pontos-dificil', 'pontos-insano'].map((k) => p.recorde('microgames', k) ?? 0));
      return recorde ? `Recorde: ${recorde.toLocaleString('pt-BR')} pts` : 'Teste seus reflexos';
    },
  },
  {
    id: 'corrida-neon',
    nome: 'Corrida Neon',
    descricao: 'Corra sem parar numa estrada synthwave. Power-ups e combos.',
    categoria: 'Ação',
    icone: 'corrida',
    cores: ['#ff2bd6', '#00f0ff'],
    disponivel: true,
    previa: 'corrida',
    carregar: () => import('./corrida-neon/index.js'),
    estatistica: (p) => {
      const recorde = p.recorde('corrida-neon', 'pontos');
      return recorde ? `Recorde: ${Math.floor(recorde).toLocaleString('pt-BR')} pts` : 'Pé na estrada';
    },
  },
  {
    id: 'ritmo',
    nome: 'Ritmo',
    descricao: 'Acerte as notas no tempo da batida que o próprio jogo cria.',
    categoria: 'Ação',
    icone: 'musica',
    cores: ['#a3ff12', '#00e5ff'],
    disponivel: true,
    previa: 'ritmo',
    carregar: () => import('./ritmo/index.js'),
    estatistica: (p) => {
      const tocadas = p.distintos('ritmo:musica');
      return tocadas ? `${tocadas} de 3 músicas tocadas` : '3 músicas para tocar';
    },
  },
  {
    id: 'fogos',
    nome: 'Fogos',
    descricao: 'Clique e arraste para lançar fogos de artifício no céu.',
    categoria: 'Criar',
    icone: 'fogos',
    cores: ['#ff7a18', '#ff2e97'],
    disponivel: true,
    previa: 'fogos',
    carregar: () => import('./fogos/index.js'),
    estatistica: (p) => {
      const lancados = p.contador('fogos:lancado');
      return lancados ? `${lancados} fogos lançados` : 'O céu é seu';
    },
  },
  {
    id: 'areia-magica',
    nome: 'Areia Mágica',
    descricao: 'Milhares de partículas que seguem você e formam redemoinhos.',
    categoria: 'Relaxar',
    icone: 'particulas',
    cores: ['#ffb703', '#fb5607'],
    disponivel: true,
    previa: 'areia',
    carregar: () => import('./areia-magica/index.js'),
    estatistica: (p) => {
      const explosoes = p.contador('areia:explosao');
      return explosoes ? `${explosoes} explosões de areia` : 'Milhares de grãos';
    },
  },
  {
    id: 'caleidoscopio',
    nome: 'Caleidoscópio',
    descricao: 'Desenhe livre e veja tudo se espelhar em degradê e brilho.',
    categoria: 'Criar',
    icone: 'flor',
    cores: ['#c77dff', '#ff5dc8'],
    disponivel: true,
    previa: 'caleidoscopio',
    carregar: () => import('./caleidoscopio/index.js'),
    estatistica: (p) => {
      const segundos = p.contador('caleido:segundos');
      return segundos ? `${Math.floor(segundos / 60)} min desenhando` : 'Arte simétrica';
    },
  },
  {
    id: 'plastico-bolha',
    nome: 'Plástico-Bolha',
    descricao: 'Plástico-bolha de verdade: transparente, com estouro gravado.',
    categoria: 'Fidget',
    icone: 'bolhas',
    cores: ['#3cffb4', '#00b4ff'],
    disponivel: true,
    previa: 'plasticoBolha',
    carregar: () => import('./plastico-bolha/index.js'),
    estatistica: (p) => {
      const total = p.contador('bolha:estouro');
      const folhas = p.contador('bolha:folha');
      if (folhas) return `${folhas} ${folhas === 1 ? 'folha completa' : 'folhas completas'}`;
      return total ? `${total.toLocaleString('pt-BR')} bolhas estouradas` : 'Pop, pop, pop';
    },
  },
  {
    id: 'respira',
    nome: 'Respira',
    descricao: 'Uma luz que cresce e encolhe para guiar sua respiração.',
    categoria: 'Relaxar',
    icone: 'respirar',
    cores: ['#b18cff', '#5ce1e6'],
    disponivel: true,
    previa: 'respiracao',
    carregar: () => import('./respira/index.js'),
    estatistica: (p) => {
      const ciclos = p.contador('respira:ciclo');
      return ciclos ? `${ciclos} ciclos respirados` : 'Uma pausa para você';
    },
  },
  {
    id: 'slime',
    nome: 'Slime',
    descricao: 'Uma gosma elástica para apertar, esticar e cutucar.',
    categoria: 'Fidget',
    icone: 'gosma',
    cores: ['#7bff4a', '#00ffa3'],
    disponivel: true,
    previa: 'slime',
    carregar: () => import('./slime/index.js'),
    estatistica: (p) => {
      const apertos = p.contador('slime:aperto');
      return apertos ? `${apertos} apertões` : 'Squish!';
    },
  },
];

export const obterExperiencia = (id) => EXPERIENCIAS.find((e) => e.id === id);
