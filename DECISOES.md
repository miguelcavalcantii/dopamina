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
- **Plástico-Bolha**: bolhas voltam em 5–9 s; "Nova folha" troca entre 5 cores.
- **Respira**: padrões Caixa (4-4-4-4), 4-7-8 e Coerente (5-5); 1, 3, 5 min ou livre. A sessão termina ao fim
  do ciclo em que o tempo acaba (não corta uma expiração no meio).
- **Slime**: anel de 44 pontos com molas + pressão; vários dedos ao mesmo tempo. Rostinho e glitter ligados por padrão.

## Não testado / limites conhecidos

- **Som**: não consigo ouvir. Todos os sons foram escritos e o código roda sem erros, mas volume e timbre
  precisam do seu ouvido (ajuste fino em `js/core/audio.js`, função `#sintetizar`).
- **Celular real**: testei o layout em 390 px de largura (sem rolagem horizontal), mas não em aparelho com toque
  de verdade (multitoque do Slime, gestos da Corrida).
- **Renderizador reserva do Vidro (sem WebGL2)**: escrito, não exercitado.
