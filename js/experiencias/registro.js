/**
 * Catálogo de experiências. Para adicionar uma nova: crie a pasta em
 * js/experiencias/<id>/index.js exportando `montar(raiz, contexto)` e
 * marque `disponivel: true` aqui. `palavras` ajudam a busca do hub.
 */

/** Seções do hub, nesta ordem. `chave` vira id de HTML. */
export const CATEGORIAS = [
  { id: 'Jogos', chave: 'jogos', nome: 'Jogos', descricao: 'Desafios, recordes e reflexos rápidos', icone: 'controle', cor: '#ff2e97' },
  { id: 'Relaxar', chave: 'relaxar', nome: 'Relaxar', descricao: 'Para desacelerar e criar sem pressa', icone: 'lua', cor: '#22e4ff' },
  { id: 'Fidget Toys', chave: 'fidget', nome: 'Fidget Toys', descricao: 'Brinquedos para mãos inquietas', icone: 'mao', cor: '#a3ff12' },
  { id: 'ASMR', chave: 'asmr', nome: 'ASMR', descricao: 'Sons e texturas que dão aquele arrepio bom', icone: 'fone', cor: '#c77dff' },
];

export const EXPERIENCIAS = [
  {
    id: 'vidro-liquido',
    palavras: ['agua', 'ondas', 'chuva', 'calmo', 'pintar'],
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
    palavras: ['reflexo', 'warioware', 'rapido', 'dificuldade', 'insano'],
    nome: 'Relâmpago',
    descricao: 'Desafios de 3 segundos que mudam o tempo todo. Do Fácil ao Insano.',
    categoria: 'Jogos',
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
    palavras: ['corrida', 'carro', 'synthwave', 'neon', 'desviar'],
    nome: 'Corrida Neon',
    descricao: 'Corra sem parar numa estrada synthwave. Power-ups e combos.',
    categoria: 'Jogos',
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
    palavras: ['musica', 'batida', 'notas', 'guitar'],
    nome: 'Ritmo',
    descricao: 'Acerte as notas no tempo da batida que o próprio jogo cria.',
    categoria: 'Jogos',
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
    palavras: ['fogos de artificio', 'ceu', 'explosao', 'noite'],
    nome: 'Fogos',
    descricao: 'Clique e arraste para lançar fogos de artifício no céu.',
    categoria: 'Relaxar',
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
    palavras: ['particulas', 'areia', 'redemoinho'],
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
    palavras: ['desenhar', 'arte', 'simetria', 'mandala'],
    nome: 'Caleidoscópio',
    descricao: 'Desenhe livre e veja tudo se espelhar em degradê e brilho.',
    categoria: 'Relaxar',
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
    palavras: ['bolha', 'estourar', 'pop', 'asmr'],
    nome: 'Plástico-Bolha',
    descricao: 'Plástico-bolha de verdade: transparente, com estouro gravado.',
    categoria: 'Fidget Toys',
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
    palavras: ['respiracao', 'meditar', 'calma', 'ansiedade'],
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
    palavras: ['gosma', 'apertar', 'squish', 'massinha'],
    nome: 'Slime',
    descricao: 'Gosma que estica, muda de cor e se mistura com outro slime.',
    categoria: 'Fidget Toys',
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
  {
    id: 'fidget-spinner',
    palavras: ['spinner', 'girar', 'rpm', 'rolamento', 'fidget'],
    nome: 'Fidget Spinner',
    descricao: 'Gire, segure e solte. Inércia de verdade e contador de RPM.',
    categoria: 'Fidget Toys',
    icone: 'spinner',
    cores: ['#bfe4ff', '#8b5cff'],
    disponivel: true,
    previa: 'spinner',
    carregar: () => import('./fidget-spinner/index.js'),
    estatistica: (p) => {
      const rpm = p.recorde('fidget-spinner', 'rpm');
      return rpm ? `Recorde: ${rpm.toLocaleString('pt-BR')} RPM` : 'Quantas voltas?';
    },
  },
  {
    id: 'pop-it',
    palavras: ['pop it', 'popit', 'silicone', 'apertar', 'bolinhas', 'polvo'],
    nome: 'Pop It',
    descricao: 'Aperte todas as bolinhas e vire a placa. Coração, estrela, polvo.',
    categoria: 'Fidget Toys',
    icone: 'popit',
    cores: ['#ffd23f', '#ff4d6d'],
    disponivel: true,
    previa: 'popit',
    carregar: () => import('./pop-it/index.js'),
    estatistica: (p) => {
      const viradas = p.contador('popit:virada');
      const apertos = p.contador('popit:aperto');
      if (viradas) return `${viradas} ${viradas === 1 ? 'virada' : 'viradas'}`;
      return apertos ? `${apertos} pops` : 'Pop, pop, vira!';
    },
  },
  {
    id: 'teclado-switches',
    palavras: ['teclado', 'mecanico', 'switch', 'clicky', 'tecla', 'asmr'],
    nome: 'Teclado de Switches',
    descricao: 'Teclas mecânicas com som de verdade: clicky, tátil ou linear.',
    categoria: 'Fidget Toys',
    icone: 'teclado',
    cores: ['#2e7bff', '#ff9ad5'],
    disponivel: true,
    previa: 'teclado',
    carregar: () => import('./teclado-switches/index.js'),
    estatistica: (p) => {
      const toques = p.contador('teclado:toque');
      return toques ? `${toques.toLocaleString('pt-BR')} toques` : 'Clack, clack, clack';
    },
  },
  {
    id: 'interruptores',
    palavras: ['caneta', 'clicker', 'interruptor', 'botao', 'alavanca', 'chave', 'luz', 'click'],
    nome: 'Caneta e Interruptores',
    descricao: 'Caneta clicker, chaves, alavanca e botões, cada um com seu clique.',
    categoria: 'Fidget Toys',
    icone: 'interruptor',
    cores: ['#ffd60a', '#ff2e3d'],
    disponivel: true,
    previa: 'interruptores',
    carregar: () => import('./interruptores/index.js'),
    estatistica: (p) => {
      const cliques = p.contador('caneta:clique');
      const usados = p.distintos('interruptor:uso');
      if (usados) return `${usados} de 7 controles usados`;
      return cliques ? `${cliques} cliques de caneta` : 'Click, clack, tlec';
    },
  },
  {
    id: 'cubo-infinito',
    palavras: ['cubo', 'infinito', 'dobrar', '3d', 'rubik', 'infinity cube'],
    nome: 'Cubo Infinito',
    descricao: 'Dobra, desdobra e dobra de novo. As metades trocam de lugar sem fim.',
    categoria: 'Fidget Toys',
    icone: 'cubo',
    cores: ['#2e7bff', '#e8343a'],
    disponivel: true,
    previa: 'cubo',
    carregar: () => import('./cubo-infinito/index.js'),
    estatistica: (p) => {
      const dobras = p.contador('cubo:dobra');
      return dobras ? `${dobras.toLocaleString('pt-BR')} dobras` : 'Sem fim, sem pressa';
    },
  },
  {
    id: 'pipa',
    palavras: ['pipa', 'papagaio', 'arraia', 'vento', 'ceu', 'nuvens', 'empinar'],
    nome: 'Empinar Pipa',
    descricao: 'Puxe e solte a linha no vento que muda. Livre ou caçando estrelas.',
    categoria: 'Jogos',
    icone: 'pipa',
    cores: ['#ff7a18', '#22a8ff'],
    disponivel: true,
    previa: 'pipa',
    carregar: () => import('./pipa/index.js'),
    estatistica: (p) => {
      const recorde = p.recorde('pipa', 'estrelas');
      return recorde ? `Recorde: ${recorde} estrelas` : 'O céu é o limite';
    },
  },
  {
    id: 'ping-pong',
    palavras: ['ping pong', 'tenis de mesa', 'raquete', 'bola', 'dois jogadores', '2 jogadores'],
    nome: 'Ping Pong',
    descricao: 'Mesa em perspectiva, efeito na bola e torcida. Contra a CPU ou a dois.',
    categoria: 'Jogos',
    icone: 'raquete',
    cores: ['#ff9a3c', '#1d5fd1'],
    disponivel: true,
    previa: 'pingPong',
    carregar: () => import('./ping-pong/index.js'),
    estatistica: (p) => {
      const vitorias = p.contador('pingpong:vitoria');
      const troca = p.recorde('ping-pong', 'troca');
      if (vitorias) return `${vitorias} ${vitorias === 1 ? 'vitória' : 'vitórias'}`;
      return troca ? `Maior troca: ${troca}` : 'Pá, pum, pá';
    },
  },
  {
    id: 'jardim',
    palavras: ['jardim', 'flores', 'cogumelo', 'brilho', 'vaga-lume', 'noite', 'plantar', 'musica'],
    nome: 'Jardim Bioluminescente',
    descricao: 'Plante flores e cogumelos que brilham, cantam e soltam esporos.',
    categoria: 'Relaxar',
    icone: 'cogumelo',
    cores: ['#3cffb4', '#b18cff'],
    disponivel: true,
    previa: 'jardim',
    carregar: () => import('./jardim/index.js'),
    estatistica: (p) => {
      const plantas = p.contador('jardim:planta');
      return plantas ? `${plantas} plantas cultivadas` : 'Um jardim que canta';
    },
  },
  {
    id: 'pinball',
    palavras: ['pinball', 'fliperama', 'flipper', 'neon', 'multibola', 'bola'],
    nome: 'Pinball Neon',
    descricao: 'Batedores que explodem em luz, rampa, multiplicador e multibola.',
    categoria: 'Jogos',
    icone: 'pinball',
    cores: ['#ff2e97', '#22e4ff'],
    disponivel: true,
    previa: 'pinball',
    carregar: () => import('./pinball/index.js'),
    estatistica: (p) => {
      const recorde = p.recorde('pinball', 'pontos');
      return recorde ? `Recorde: ${recorde.toLocaleString('pt-BR')}` : 'Bola na mesa!';
    },
  },
  {
    id: 'orbitando',
    palavras: ['espaco', 'planeta', 'estrela', 'buraco negro', 'gravidade', 'orbita', 'cometa', 'galaxia'],
    nome: 'Orbitando',
    descricao: 'Lance planetas, estrelas e buracos negros. A gravidade faz o resto.',
    categoria: 'Relaxar',
    icone: 'planeta',
    cores: ['#ffb020', '#8b5cff'],
    disponivel: true,
    previa: 'orbitando',
    carregar: () => import('./orbitando/index.js'),
    estatistica: (p) => {
      const orbitas = p.recorde('orbitando', 'orbitas');
      return orbitas ? `${orbitas} planetas em órbita` : 'Seu próprio sistema solar';
    },
  },
];

export const obterExperiencia = (id) => EXPERIENCIAS.find((e) => e.id === id);
