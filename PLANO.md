# Plano da grande atualização

Você pediu para eu analisar, perguntar e planejar antes de começar, mas ficou offline. Então anotei aqui as perguntas
que eu faria e a resposta que adotei em cada uma. Tudo pode ser trocado depois (ver também `DECISOES.md`).

## Como o projeto está hoje (análise)

- HTML/CSS/JS puro com módulos ES, sem build. Roteamento por hash (`#/` e `#/x/<id>`), em `js/main.js`.
- Cada experiência é uma pasta `js/experiencias/<id>/index.js` com `montar(raiz, contexto)` e um CSS próprio em
  `css/experiencias/<id>.css`, carregado sob demanda. O catálogo fica em `js/experiencias/registro.js`.
- Núcleo compartilhado em `js/core/`: áudio sintetizado (`audio.js`), progresso, XP, missões e conquistas
  (`progresso.js`, `missoes.js`, `conquistas.js`), loop único de animação, painel de início/resumo dos jogos etc.
- O visual usa variáveis CSS em `css/base.css`, mas várias cores estavam escritas direto nos componentes.

## Perguntas que eu faria (e o que decidi)

1. **Tema "Doce" claro ou escuro?** Decidi **claro** (fundo lavanda/rosa-bebê, texto escuro), para ser bem
   diferente dos outros. Os temas mudam a interface (hub, barra, painéis, configurações); o interior dos jogos
   mantém a arte própria, com a cor de destaque aplicada onde faz sentido.
2. **Em que volume entram os sons reais?** Três volumes, como pedido: **Efeitos** (sons sintetizados dos jogos e da
   interface), **Música** (trilhas e ambientes) e **ASMR** (todas as gravações reais: plástico-bolha, seção ASMR,
   mesa de sons). Mais o volume geral e o mudo, que continuam na barra do topo.
3. **Sons reais: de onde?** Freesound, só sons com licença **CC0** (domínio público), usando a versão de prévia
   em MP3 de alta qualidade, que o site disponibiliza sem login. Tudo listado em `CREDITOS.md`.
4. **Fotos de plástico-bolha?** Tento primeiro o visual realista desenhado em canvas (fica mais leve e anima melhor).
   Só uso fotos se o canvas não convencer.
5. **Categorias das experiências antigas?** Jogos: Relâmpago, Corrida Neon, Ritmo. Relaxar: Vidro Líquido, Fogos,
   Areia Mágica, Caleidoscópio, Respira. Fidget Toys: Plástico-Bolha, Slime.
6. **"Slime interativo" é um novo ou o atual melhorado?** Melhorar o atual (mudar de cor com o movimento, dois
   slimes que se misturam, sons de squish e bolhas), para não ter dois slimes no hub.
7. **Modo Insano:** desbloqueia ao fazer **4.000 pontos no Difícil**.
8. **Publicar no GitHub Pages ao fim?** Não publico sem você pedir. Deixo tudo salvo no git local, com um commit por etapa.

## Ordem de trabalho

1. **Configurações:** botão de engrenagem fixo na barra; temas (Neon, Aurora, Tropical, Pôr do sol, Galáxia, Oceano,
   Doce, Escuro vibrante) e cor de destaque livre, com troca suave; pacotes de sons da interface (Suave, Arcade,
   Bolhas, Cristal, Natureza) com prévia; volumes separados (Efeitos, Música, ASMR); mudo sempre visível.
2. **Plástico-bolha realista** + sons reais; **Relâmpago com dificuldades** (Fácil, Normal, Difícil, Insano).
3. **Hub reorganizado:** categorias Jogos, Relaxar, Fidget Toys e ASMR, busca, filtro e favoritos.
4. **Fidget Toys:** Fidget Spinner, Pop It, Teclado de switches, Clicker e interruptores, Cubo infinito.
5. **Jogos e experiências:** Empinar Pipa, Ping Pong, Jardim Bioluminescente, Pinball Neon, Slime melhorado,
   Orbitando, Quebra-Cristais.
6. **ASMR:** Areia cinética, Sabonete e espuma, Chuva na janela, Mesa de sons, Tinta grossa.
7. Cada novidade entra no sistema de XP, missões e conquistas. Teste no navegador ao fim de cada etapa.
