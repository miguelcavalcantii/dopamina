# Decisões para revisar

Escolhas que tomei sozinho durante a construção, com o padrão que me pareceu mais sensato.
Qualquer uma pode ser trocada; indico onde mexer.

## Gerais

- **Servidor local**: módulos ES não funcionam abrindo o `index.html` direto. Para desenvolver uso um servidor
  estático sem cache (o `http.server` padrão do Python deixa o Chrome guardar JS antigo). Qualquer servidor
  estático serve em produção.
- **Progresso**: tudo fica no `localStorage` deste navegador (chaves `dopamina:*`). Não há conta nem nuvem.
- **XP e níveis**: nível N→N+1 custa `80 + 40·(N−1)` XP (`js/core/progresso.js`). XP por ação em
  `js/core/missoes.js` (`XP_POR_EVENTO`); bônus ao fim das partidas proporcional aos pontos.
- **Missões do dia**: 3 sorteadas pela data, só entre jogos disponíveis. Como as de hoje já tinham sido
  sorteadas antes dos jogos novos existirem, as missões deles começam a aparecer a partir de amanhã.
- **"Sem game over frustrante"**: jogos com vidas (Relâmpago, Corrida) terminam num resumo comemorativo
  ("Boa corrida!", recorde, estatísticas) com "Jogar de novo" em destaque. No Ritmo errar nunca para a música.
- **Flashes**: nenhum clarão de tela cheia. O clarão dos fogos é limitado a 8% e some devagar; estrelas
  cintilam em senos lentos. Com `prefers-reduced-motion` as partículas caem pela metade e giros param.
- **Música**: tocam sozinhas a do modo Acalmar (Vidro), a do Respira (pode desligar) e as trilhas da Corrida e do
  Ritmo. Fogos e Vidro têm botão "Música" desligado por padrão.

## Por experiência

- **Vidro Líquido**: simulação de ondas na CPU (~85 mil células) + refração em WebGL2; sem WebGL2 cai num
  renderizador em CPU mais simples. Resolução menor em aparelhos com ≤4 núcleos ou ≤4 GB.
- **Relâmpago**: 10 microgames, 4 vidas, acelera a cada rodada (máx. x2,4) com aviso a cada 4 rodadas.
  Errar o clique no "Acerte" não tira vida.
- **Corrida Neon**: 3 vidas; invulnerável 1,6 s após batida; poderes: Escudo, Ímã (8 s), Turbo (4 s, atravessa
  obstáculos), Pontos x2 (10 s). Tecla P pausa.
- **Ritmo**: 3 músicas (Brisa 90 bpm fácil, Pulso 110 médio, Turbo 132 difícil), ~1 min cada, partitura
  nova a cada vez. Janelas: perfeito ±60 ms, bom ±130 ms. Teclas D F J K ou setas.
- **Fogos**: clique = fogo normal; segurar = maior (até 2,2×); arrastar = rajada. Teclas: espaço, S (show), G (finale).
- **Areia Mágica**: 7.000 partículas no desktop, 4.200 em PCs modestos, 2.600 no celular.
  "Formar" alterna coração, estrela, "UAU!", espiral e "OI!".
- **Caleidoscópio**: "Salvar" baixa um PNG direto (sem perguntar). Teclado: setas desenham, A automático, L limpa, D desvanece.
- **Plástico-Bolha** (refeito na grande atualização): ver a seção abaixo.
- **Respira**: padrões Caixa (4-4-4-4), 4-7-8 e Coerente (5-5); 1, 3, 5 min ou livre. A sessão termina ao fim
  do ciclo em que o tempo acaba (não corta uma expiração no meio).
- **Slime**: anel de 44 pontos com molas + pressão; vários dedos ao mesmo tempo. Rostinho e glitter ligados por padrão.

## Grande atualização (out/2026)

O plano completo e as perguntas que eu teria feito estão em `PLANO.md`.

### Configurações
- **Onde**: engrenagem na barra do topo, em qualquer tela. Esc ou clique fora fecham. Código em
  `js/core/configuracoes.js`; temas em `css/temas.css`; preferências em `js/core/preferencias.js`.
- **Temas**: 8 temas mudam fundo, superfícies, manchas de luz, logo, degradês e destaque. A troca usa
  View Transitions (cruzamento de 0,55 s) quando o navegador suporta. Um script no `<head>` aplica o tema salvo antes
  da primeira pintura. **Doce** é o único tema claro; dentro das experiências os controles voltam a ser escuros,
  porque a arte dos jogos é escura.
- **Cor de destaque**: "Do tema" (padrão), 8 sugestões ou qualquer cor. O texto sobre ela vira escuro ou branco
  automaticamente, conforme a luminância.
- **Sons da interface**: 5 pacotes (Suave = o som original, Arcade, Bolhas, Cristal, Natureza). Afetam clique, hover,
  transições, nível, conquista, missão e liga/desliga. Os sons de dentro dos jogos não mudam.
- **Volumes**: Geral + Efeitos + Música + ASMR, em curva quadrática. A Música tem teto de 60% (como antes), para
  nunca cobrir os efeitos. "Restaurar padrão" volta tudo.

### Plástico-Bolha
- **Visual**: 100% canvas, sem fotos. A bolha é uma lente: amplia em 1,3x o fundo embaixo dela. Tem borda de Fresnel,
  reflexo interno, sombra com foco de luz e brilho especular que se move devagar seguindo o ponteiro, como se a
  folha inclinasse. Estourada: plástico achatado, com facetas, vincos e aspecto leitoso (8 formatos sorteados).
- **Sons**: 5 gravações CC0 de plástico-bolha, mais 1 de plástico amassado para a troca de folha (ver `CREDITOS.md`).
  O site recorta sozinho cada estouro das gravações (cerca de 100 trechos, `js/core/amostras.js`). Sorteia
  primeiro a gravação e depois o trecho, com ±9% de tom e um pouco de volume. Se os arquivos não carregarem,
  volta ao estouro sintetizado.
- **Folha**: as bolhas **não voltam mais** sozinhas. Quando todas estouram, aparece "Folha completa!" (+XP) e uma
  folha nova, de outra cor, desliza para a tela. "Nova folha" (ou tecla N) troca na hora. O HUD mostra
  "nesta folha", sequência e total.

### Relâmpago: dificuldades
| | Vidas | Velocidade inicial / máx. | Aceleração | Tempo de cada jogo | Complexidade |
| --- | --- | --- | --- | --- | --- |
| Fácil | 5 | 0,8 / 1,7 | a cada 5 rodadas | 1,35x (mín. 2,8 s) | 0,8x |
| Normal | 4 | 1,0 / 2,4 | a cada 4 | 1x (mín. 2,2 s) | 1x (o jogo original) |
| Difícil | 3 | 1,2 / 2,8 | a cada 4 | 0,85x (mín. 1,9 s) | 1,25x |
| Insano | 2 | 1,45 / 3,3 | a cada 3 | 0,7x (mín. 1,6 s) | 1,55x |
- "Complexidade" é a velocidade que os microgames enxergam: mais balões, objetos mais rápidos, alvos menores.
- Recorde separado por dificuldade. O recorde antigo vira o do Normal. **Insano** libera com 4.000 pontos no Difícil
  (tabela em `js/experiencias/microgames/index.js`, `DIFICULDADES`).

### Hub
- **Seções** na ordem Jogos, Relaxar, Fidget Toys e ASMR (`CATEGORIAS` em `js/experiencias/registro.js`). Filtros
  mostram a contagem de cada categoria. A busca ignora acentos e também procura em `palavras` de cada experiência.
  A tecla `/` leva à busca, e Esc dentro dela limpa o texto.
- **Favoritos**: coração no canto do card. Aparece no hover; no celular fica sempre visível. Os favoritos sobem para
  o começo da própria seção e ganham o filtro "Favoritos". Ficam salvos nas preferências.
- **Categorias antigas**: Ação virou Jogos; Criar (Fogos, Caleidoscópio) virou Relaxar; Fidget virou Fidget Toys.

### Fidget Toys
- **Fidget Spinner**: inércia com atrito de rolamento (0,22 rad/s² fixo + 1,1%/s viscoso), máx. ~2.580 RPM. Agarrar
  freia; soltar arremessa com a velocidade dos últimos 90 ms; passar o dedo por fora dá peteleco. Som: gravação real em
  laço (tom e volume seguem a velocidade) + zumbido de passagem das pontas. 4 modelos, 5 materiais. O reflexo do metal
  fica parado enquanto o corpo gira; em alta velocidade há desfoque de movimento (até 18 cópias) e rastro de luz.
- **Pop It**: 4 formatos (Arco-íris, Coração, Estrela, Polvo). Só as bolinhas de pé podem ser apertadas; quando todas
  afundam, a placa vira (animação de 0,55 s) e o outro lado (um tom mais escuro) fica todo de pé. Som: gravação de um
  brinquedo de bolhas de silicone, recortada em ~20 pops; fileiras de baixo soam um pouco mais graves.
- **Teclado de Switches**: 16 teclas (Esc, Q W E, A S D F, Z X C V, 1 2 3, Enter), que também respondem ao teclado de
  verdade. Switches Clicky, Tátil e Linear, com gravações de teclados MX Blue, Brown e Red. A volta da tecla toca o
  mesmo som mais leve. 4 estilos de keycap e luz RGB com onda a partir da tecla apertada.
- **Caneta e Interruptores**: 7 controles. O estado (luz, chave, posições) fica salvo. A alavanca precisa descer 92%
  para "travar" e volta com mola. Puxar a alavanca passa uma luz colorida pelo painel.
- **Cubo Infinito**: 3D próprio em canvas. As dobras alternam 6 combinações de eixo e dobradiça. Arrastar dobra na hora;
  soltar com impulso continua; soltar devagar encaixa no lado mais perto (passou de 42%, completa). Clássico tem cores
  por face; Neon, Pastel e Alumínio têm uma cor por cubinho.

## Não testado / limites conhecidos

- **Som**: não consigo ouvir. Todos os sons foram escritos e o código roda sem erros, mas volume e timbre
  precisam do seu ouvido (ajuste fino em `js/core/audio.js`, função `#sintetizar`).
- **Celular real**: testei o layout em 390 px de largura (sem rolagem horizontal), mas não em aparelho com toque
  de verdade (multitoque do Slime, gestos da Corrida).
- **Renderizador reserva do Vidro (sem WebGL2)**: escrito, não exercitado.
