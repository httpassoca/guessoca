# Guessoca — quem sou eu? no telhado

"Quem sou eu?" online para 2 a 8 amigos numa chamada de voz. Cada pessoa escreve o post-it de outra; todo mundo lê o post-it na testa dos outros, menos o próprio, e descobre quem é perguntando em voz alta. Na sua vez, "Acertei" abre uma votação; quem acertar primeiro sobe no ranking. Tudo acontece num telhado neon à noite, onde cada um anda, pula, sobe na cabeça dos outros e empurra quem estiver na frente.

Só desktop, teclado primeiro. Em https://guess.passoca.dev.

```
bun install
bun run dev      # servidor Bun em :3000 + Vite em http://localhost:5173 (com proxy de /api e /ws)
bun test         # regras, mundo, protocolo, sala, host e servidor
bun run check    # svelte-check + tsc do servidor e dos pacotes
bun run build    # cliente em apps/web/dist
bun run start    # servidor servindo o cliente buildado (PORT=3000)
bun run sprites  # gera as folhas de sprites a partir do pacote em assets-src/ (só na máquina do dono, ADR 0007)
```

## Estrutura

```
packages/rules     sala e jogo, puros (@guess/rules)
  src/index.ts       apelido limpo e com sufixo; MAX_MEMBERS (8)
  src/game.ts        o jogo (ADR 0008): `act(game, actor, moderador?, ação, ctx)`, `settle` (põe em dia com a hora e com quem
                     está online), `nextDeadline`, `addMember`/`removeMember`, `createGame({ turnMs })`. Lobby, com a escrita:
                     ordem das vezes, autores em círculo (ou sorteados sem ninguém escrever para si, ou escolhidos à mão pelo moderador), personagens
                     à escolha (não exclusivos; cada um troca o seu no lobby),
                     tamanho da vez, só moderar; cada dono da ordem tem um post-it já no lobby, que o autor (ou o moderador)
                     escreve ao vivo até "Pronto"; o post-it cujo autor muda é apagado (`cleared`). "Começar" é do moderador:
                     pelo menos duas pessoas e todo post-it com texto, pronto ou não; dali em diante os autores congelam.
                     Jogo: vezes na ordem pulando quem caiu, jogador falso e quem já terminou; Acertei → votação de 15 s
                     (maioria dos votos dados, empate e zero votos = sim; não = a vez volta com o que sobrava); desistir;
                     moderador marca acertou/não (desfaz revelação), passa a vez, pausa, reordena, encerra. Fim quando nenhuma
                     pessoa conectada ainda joga; "jogar de novo" (moderador) volta ao lobby com os fantasmas entrando e
                     post-its vazios
  test/              lobby, escrita no lobby, apagar, começar e jogo com `Sim` e sorteio semeado
packages/world     o telhado, puro (@guess/world, ADR 0005): o mapa (três prédios com vãos, caixas para subir), `stepBody`
                   (andar, correr, profundidade, pular, gravidade, lados que bloqueiam, degrau, corpos sólidos, ficar na
                   cabeça de alguém e ser carregado, cair na rua e voltar piscando), `shoveTargets`/`applyShove`, `applyCheer` (o salto de quem acertou), e a
                   projeção 2.5D (`project`, `depthKey`, `followCamera`) que o Pixi e os post-its em HTML dividem (ADR 0006)
  test/              movimento, corpos, empurrão, animação, projeção e câmera, a 60 passos por segundo
packages/protocol  mensagens cliente ↔ servidor (@guess/protocol): todas as ações do jogo e de volta `snapshot`, `error`
                   (`roomFull`, `refused`), `pong`; `presence` (posição, velocidade, lado, animação, emote, piscando), `shove`/`shoved` e `chat` (a fala, limpa por `cleanChat`); `RoomSnapshot` com post-its como cada um os vê (o próprio vem sem texto e
                   sem imagem até ser revelado, só com `written`), vez e votação com o tempo que sobra; `parseClientMessage`;
                   `isWebp`, limites da imagem, `imageUrl`; códigos de fechamento (4404, 4410, 4409, 4403 expulso)

apps/server        Bun.serve: `/health`, `POST /api/rooms` (corpo JSON do pré-lobby, `{ turnMs, maxPlayers, onlyModerate }`, até
                   1 KB; o que falta ou não vale fica no padrão) → `{ code }`, `POST /api/rooms/CODE/images?token=T` (WebP até
                   300 KB → `{ id }`; 404/403/413/415), `GET /api/rooms/CODE/images/ID`, cliente estático com fallback SPA,
                   WebSocket em `/ws?room=CODE&token=T`. `dev` (fora de produção) aceita jogadores falsos
  src/room.ts        máquina de estado da sala, pura: `step(state, input, now, { rng })` → estado novo, mensagens e
                     fechamentos por token, eventos para o log; timers como dado (morte em 10 min sem ação de alguém da
                     turma, tolerância do moderador, prazo do jogo). Nasce com as escolhas do pré-lobby (vez, limite de
                     pessoas, criador só moderando). Turma: entrar, apelido, sala cheia (`maxPlayers`, que o moderador
                     muda no lobby, nunca abaixo da turma), quem cai continua
                     até a sala morrer; o moderador expulsa (4403, o token não volta) e passa o papel; offline por 20 s, o
                     papel vai para a pessoa conectada mais antiga. Repassa as ações ao jogo e o põe em dia a cada entrada.
                     Jogadores falsos, no lobby, escrevem uma identidade ao acaso e ficam prontos (de novo, depois de apagado). `snapshotFor` esconde o post-it do
                     próprio dono
  src/bots.ts        os bots engraçados, puro: o diretor (quando e quantos chegam; o chefão, raro) e o cérebro de cada um (o que faz), sobre
                     a física do `@guess/world`; `attacks.json` (gerado por `bun run sprites`) dá a duração do ataque de cada
                     personagem
  src/host.ts        `RoomHost`: sockets por token, timers que a sala pede, silêncio de 90 s, a presença de cada um repassada
                     aos outros (~15 por segundo, só a mais recente; quem chega recebe a de todos), o empurrão entregue só a
                     quem foi empurrado, a fala repassada a todo mundo (uma por segundo por pessoa, nenhuma guardada), o laço
                     dos bots engraçados (só com a opção ligada e o jogo rodando), as
                     estatísticas do jogo (conta cada empurrão entregue e cada queda, que é a presença passar para baixo da
                     rua, num contador próprio que entra na sala antes de cada passo dela, e o snapshot do fim os mostra), os
                     limites (issue #72: um balde de pedidos por socket, a presença num balde bem mais largo, fechando com 4429 quem insiste;
                     o empurrão no ritmo do empurrão e ao alcance pelas presenças; no máximo 16 visitantes), e as imagens da sala em memória
                     (ADR 0003): só de quem é da turma, liberadas quando nenhum post-it as usa (uma subida ainda sem post-it
                     espera 2 min; no máximo 2 por pessoa)
  src/rooms.ts       `Rooms`: as salas vivas num mapa em memória, códigos de 4 letras sem I nem O; no máximo 2000, e o sorteio
                     do código desiste depois de 100 tentativas (503)
  src/limits.ts      baldes de fichas (por socket, por IP) e o IP de quem pede (o `X-Real-IP` do nginx só vale vindo do
                     loopback ou de rede privada): criar sala (10, depois 1 a cada 6 s, 429) e abrir socket (24 abertos, 30
                     de uma vez, depois 2 por segundo) por IP
  test/              sala, jogo pela sala (visibilidade no fio, expulsar, passar o papel, sucessão, timers, falsos), host
                     (imagens) e um servidor real numa porta livre: três abas jogam um jogo inteiro; subir e baixar imagem

apps/web           Vite + Svelte 5 + PixiJS v8 + dssoca
  src/lib/route.ts         rotas: `/` início, `/sala/CODE`; `route.svelte.ts` é a rota reativa e `navigate`
  src/lib/identity.ts      token e bloco por aba (sessionStorage); apelido e último personagem por navegador (localStorage)
  src/lib/i18n.ts          a tabela de tradução (pt-BR padrão, en-US), tipada para as duas terem as mesmas chaves
  src/lib/room/remote.ts   `RemoteRoom`: conecta com o token, aplica os snapshots, manda as ações, pinga, reconecta com espera
                           crescente até 10 s, e para de vez em 4404/4410/4409/4403 dizendo por quê
  src/lib/room/view.ts     o snapshot visto por mim: quem sou, para quem escrevo, de quem é a vez, se posso acertar, passar,
                           desistir ou votar, os post-its como posso vê-los, o ranking, a contagem regressiva
  src/lib/room/stats.ts    as estatísticas do fim do jogo: do snapshot para as linhas da tabela (uma por pessoa) e os destaques
  src/lib/image.ts         a imagem do post-it: reduz a 512 px, WebP baixando a qualidade até caber, sobe por POST
  src/lib/effects.ts       "efeitos de tela" (os filtros de filme) ligados ou não, por navegador (localStorage)
  src/lib/sprites/         os atlas gerados (`characters.json`, `atlases.json`, `emotes.json`, `rooftop.json`),
                           `characters.ts`, que diz de que modelo é cada personagem, a folha, a cor e onde está cada quadro
                           no atlas do modelo, e `rooftop.ts`, o mesmo para os objetos do telhado e as faixas da cidade
  src/lib/world/            o telhado no navegador: controls (teclas → `Input`), loop (60 passos por segundo), presence (manda
                           a própria ~15/s e um batimento por segundo parado; interpola a dos outros), crowd (quem desenhar,
                           jogadores falsos parados em lugares fixos), view (escala inteira, onde vão o post-it e o balão),
                           heads, dressing (puro: que objeto veste cada caixa do mapa, onde ficam tampo e fachada de cada
                           telhado, antenas, letreiros e poças, o neon que falha), parallax (puro: a faixa que rola a uma
                           fração da câmera), rain (puro: as gotas reaproveitadas), cheer (puro: quem acabou de
                           acertar, pela diferença entre snapshots), confetti (puro: os pedaços do confete e onde cada um está
                           pela idade), celebration (Pixi: o confete em volta de quem acertou), art (as texturas da folha do telhado),
                           backdrop (céu, lua, a cidade em duas camadas de paralaxe, a queda até a rua com neblina), platforms
                           (os telhados vestidos, num lugar só: tampo, muretas, fachada, objetos das caixas, enfeites), weather
                           (chuva e neblina da frente), film (os filtros só no mundo: brilho no cenário, aberração e VHS em
                           tudo), scene (Pixi: as camadas, corpos por profundidade, sombras, balões, câmera), runtime (o laço,
                           o empurrão de ida e de volta, o salto de quem acertou, os post-its em HTML sobre as cabeças), bubbles
                           (puro: os balões de fala, quanto duram e a troca pelo seguinte) e World.svelte (que também desenha
                           os balões de fala, na fonte Tiny5 de `public/fonts/`)
  src/lib/sound/           os efeitos sonoros: sfx (cinco sons como parâmetros do sfxr, gerados com o jsfxr; nenhum arquivo de
                           áudio), room (os sons da sala tirados da diferença entre snapshots: votação, acertou, fim de vez),
                           settings (volume e mudo por navegador) e player (um AudioContext, ligado na primeira interação)
  src/lib/keys.ts          Tab = passar, N = bloco, Esc = menu, Enter = falar (fora de campo de texto)
  src/lib/panels/          Room (o telhado atrás de tudo, a barra, a coluna da fase que recolhe, teclado), TurnBar (vez e votação
                           no alto), Roster (a tira de post-its embaixo), Lobby (ordem arrastável, autores, personagens, tamanho da vez), Writing
                           e PostitEditor (ao vivo, imagem, Pronto, moderador escreve os vazios), Playing (vez, votação, ranking),
                           ModPanel, Ended, Stats (as estatísticas do jogo, na coluna do fim), Notepad, Menu, Chat (o campo da
                           fala, no canto de baixo à direita)
  src/lib/screens/         Home (abrir sala, entrar com código, crédito) e Sala (apelido, depois o jogo; sala inexistente,
                           encerrada ou expulso)
  test/                    tradução, rotas, identidade, teclas, imagem, `RemoteRoom` com socket falso e contra o servidor de
                           verdade, o modelo de vista, os sons da sala, volume e mudo, e os efeitos que rendem amostras

tools/sprites      `bun run sprites` (@guess/sprites): as receitas que geram as folhas a partir do pacote (ver Sprites)
  src/image.ts       imagens RGBA puras: recortar, colar, trocar e apagar cores, pedaços soltos, traços finos, e as
                     transformações para desenhar quadros novos (mover, inclinar, achatar, esticar, girar, colar por baixo)
  src/grid.ts        pixel art escrita como texto (um caractere por pixel, `.` transparente)
  src/atlas.ts       o que os dois modelos têm em comum: as animações na ordem do jogo e a montagem da folha e do atlas
  src/hero.ts        o herói: fatia as folhas do pacote, tira a espada do golpe, uma folha por cor de cabelo (hoje só o loiro)
  src/skeleton.ts    o cavaleiro esqueleto: tira o rastro dos golpes, desenha correr, pular e cair, uma folha por capa (hoje só a vermelha)
  src/pack.ts        a receita dos personagens de sete folhas (arte de modelo de imagem): não muda pixel, só põe os quadros no lugar
  src/packs.ts       o registro dos personagens de sete folhas, na ordem dos lugares: um personagem é uma entrada aqui
  src/kratos.ts …    os números (`PackConfig`) dos primeiros personagens, um arquivo cada, com a história de cada um
  src/characters.ts  a lista de todos os personagens (o herói, o esqueleto e os de `packs.ts`), que vira `characters.json`
  src/emotes.ts      os balões `?`, `!`, `haha`, "eu?"/"me?" com uma fonte 3×5 em texto
  src/rooftop.ts     o telhado em grades de texto: a paleta, a prancheta (`Sketch`) que carimba grades, tampo, muretas,
                     fachadas, as três caixas do mapa (ar-condicionado, chaminé, caixa-d'água), antenas, letreiros de neon,
                     poças, lua e neblina; a folha `rooftop.png` e o atlas
  src/skyline.ts     a cidade ao fundo: faixas que repetem, geradas por um sorteio semeado (longe e perto)
  src/preview.ts     `bun run sprites:preview`: folhas de contato ampliadas (4×) da saída, em `.preview/`
  test/              as receitas com imagens de mentira (o pacote não é preciso para testar)

Dockerfile         imagem oficial do Bun em duas etapas: builda o cliente, roda o servidor (ver Deploy)
.github/workflows  deploy.yml: push na main → check, test, build da imagem no runner, scp do tar, docker load/stop/start, sonda
deploy/            wizard.sh (passos humanos do deploy) e guess.passoca.dev.nginx (bloco do nginx com upgrade de WebSocket)
```

## Teclas

| Tecla          | O quê                       |
| -------------- | --------------------------- |
| A/D ou ←→      | andar                       |
| W/S ou ↑↓      | profundidade                |
| Shift          | correr                      |
| Espaço         | pular                       |
| J              | empurrar                    |
| 1–4            | emotes                      |
| Enter          | falar (Enter manda, Esc sai)|
| Tab            | passar a vez                |
| N              | bloco                       |
| Esc            | menu                        |
| Roda do mouse  | zoom do telhado             |

O mouse é para a interface; no telhado, só a roda (zoom).

## Sprites

Como a arte funciona e como importar arte nova (personagens, animações, objetos, mapas, emotes) está em
[`docs/art.md`](docs/art.md). `bun run sprites:preview` gera folhas de contato ampliadas do que está versionado em
`.preview/` (fora do git) para conferir no olho.

Há trinta personagens, um de cada modelo. O herói é o "male hero" (versão grátis) da [Ozzbit Games](https://ozzbit-games.itch.io),
com licença só para uso pessoal e não comercial, modificações permitidas e crédito obrigatório (ADR 0007). O cavaleiro
esqueleto e todos os de sete folhas (`tools/sprites/src/packs.ts`) são arte do dono do jogo, sem restrição nem crédito (emendas da ADR 0007). Os pacotes ficam fora do git, em
`assets-src/` (ignorado), e só as folhas que o pipeline gera são versionadas em `apps/web/public/sprites/` (os atlas em
`apps/web/src/lib/sprites/`). O CI e o Docker usam o que está versionado e nunca precisam dos pacotes.

```
cp -r ~/dev/tmp/male_hero_free assets-src/   # uma vez, na máquina do dono
cp -r <folhas do esqueleto> assets-src/skeleton/   # IDLE.png, WALK.png, FWD_SWING.png, DOWN_SWING.png, ...
cp -r <pasta de um personagem> assets-src/<dir>/   # os de sete folhas: idle.png, walk.png, run.png, jump.png, fall.png,
                                                   # fall_loop.png e attack.png (ou shove.png); `dir` é o de `packs.ts`
bun run sprites                             # refaz as folhas e os atlas
```

Sem um dos pacotes, `bun run sprites` diz qual falta, deixa as folhas daquele modelo como estão, faz todo o resto e sai
com erro.

O que sai:

- `char-0.png`, `char-1.png` e `char-2.webp` … `char-12.webp` (a arte grande, em WebP sem perda): uma folha por personagem, com uma linha por animação, na mesma ordem em todos os modelos:
  parado, andando, correndo, pulo, queda, queda em loop e empurrão.
  - `char-0`: o herói, de cabelo loiro (o pacote vem castanho; o jogo já teve também preto e ruivo). O empurrão é o golpe do pacote
    sem a espada: as cores da lâmina e do cabo saem por cor, o rastro branco por ser uma mancha branca grande, e o
    contorno fino da lâmina por estar à frente do corpo.
  - `char-1`: o cavaleiro esqueleto, de capa vermelha, a original (o jogo já teve também azul e roxa). Fica com a espada em
    tudo; dos golpes sai só o rastro branco (mancha branca grande demais para ser osso, ou ponta solta toda branca). A arte
    não tem correr, pular nem cair, então a receita desenha: correr é o andar inclinado 4 pixels para a frente com a capa
    arrastando atrás; pular é o parado agachado, depois o golpe de cima (espada erguida, um joelho para cima) esticado,
    com a capa puxada para baixo e a perna encolhida; cair é esse corpo com a capa do golpe para a frente girada 90° para
    voar para cima atrás das costas. O empurrão é o golpe para a frente, cinco quadros, com o pé de trás no lugar do
    parado.
  - `char-2` em diante: os personagens de sete folhas, na ordem de `PACKS` (`tools/sprites/src/packs.ts`): arte feita por
    um modelo de imagem a pedido do dono. A receita (`pack.ts`) não muda nenhum pixel: só põe o pé de todo quadro na
    linha do chão. A folha sai no tamanho da arte, em WebP sem perda, e o atlas leva `scale`: é o jogo que a desenha
    menor. Um adulto tem 50 de altura no mundo; cada personagem tem o seu tamanho (o cachorro fica no joelho, o do
    dinossauro é o maior). A nota de cada um está em `packs.ts` ou no arquivo dele, e a história na ADR 0007.
- `characters.json`: todos, na ordem dos lugares, cada um com o modelo, o nome, a cor na interface, a folha e o atlas.
- `atlases.json`: um atlas por modelo: tamanho do quadro, âncora (entre os pés), a cabeça, o parado, as linhas das
  animações com quadros, fps e loop, a escala, e o crédito (ou null).
- `emotes-pt-BR.png` e `emotes-en-US.png`: os balões das teclas 1–4; só o "eu?"/"me?" muda de uma para a outra.
- `rooftop.png` (atlas em `rooftop.json`): o telhado neon-noir, todo desenhado em grades de texto em
  `tools/sprites/src/rooftop.ts`, com uma paleta só (azul e roxo fundos, concreto molhado, neon magenta e ciano, janela
  amarela). O tampo de concreto, as muretas da frente e do fundo, as três fachadas (tijolo, o hotel de painéis, azulejo,
  montadas carimbando a parede e as janelas por um plano de texto) e a neblina repetem: a primeira e a última coluna são
  iguais, uma junta ou um pilar dividido ao meio. Cada caixa do mapa tem o objeto do tamanho dela (ar-condicionado,
  chaminé, caixa-d'água): a largura da caixa, a frente com a altura dela e o tampo com o fundo dela achatado pela
  perspectiva, então o topo visível cai no `top` da caixa (os testes conferem contra o `MAP`). Mais antenas, a luz da
  torre, os letreiros "BAR", "HOTEL" (com uma letra que falha) e "24H", poças e a lua. Não precisam do pacote: saem mesmo
  sem ele.
- `skyline-far.png` e `skyline-near.png`: a cidade ao fundo, gerada por `tools/sprites/src/skyline.ts` com uma semente
  fixa (a mesma semente dá sempre a mesma cidade): prédios, janelas acesas, antenas, caixas-d'água e um pouco de neon, em
  faixas que repetem. O cliente as rola a frações diferentes da câmera.

### Pedir um personagem ou objeto novo

- **Outra cor de cabelo** ou **outra capa**: mais uma rampa (um lugar a mais) em `HAIRS` (sombra, base, brilho) em
  `tools/sprites/src/hero.ts` ou em `CAPES` (sombra, base) em `tools/sprites/src/skeleton.ts`. São trinta personagens
  (não exclusivos; a sala tem até oito pessoas), na ordem de `characters.ts`. A cor do personagem na interface é
  a base da rampa; atualize `--gs-char-N` em `apps/web/src/app.css` (o teste confere).
- **Variantes do esqueleto**: a capa é `771818` (sombra) e `982b2b` (base), os únicos vermelhos da arte além do olho
  (`fe0707`, que fica). Diga a cor da capa nova, ou outra peça (a espada, os ossos) e a cor; uma animação nova ou
  melhor sai de uma folha nova do dono em `assets-src/skeleton/` (a receita prefere arte de verdade ao que desenha).
- **Outra peça do personagem** (cachecol, camisa…): o mesmo jeito, trocando as cores dessa peça; diga qual peça e a cor.
  Para achar as cores de uma peça, o pipeline tem `palette()`.
- **Outro balão**: uma entrada em `EMOTES` e, se tiver letra nova, a letra em `FONT` (3×5) em `tools/sprites/src/emotes.ts`.
- **Um objeto do telhado** (caixa-d'água, antena, placa…): uma grade de texto com as cores de `PALETTE`, numa receita
  nova em `RECIPES` em `tools/sprites/src/rooftop.ts` (para repetir pedaços, a `Sketch` carimba grades menores); e onde ele
  fica no mapa, em `DECOR` em `apps/web/src/lib/world/dressing.ts` (atrás da mureta do fundo, pregado na fachada ou
  deitado no tampo). Diga o tamanho em pixels, as cores e onde vai. Um letreiro novo é `neonSign('TEXTO', 'x' ou 'z')`,
  com as letras que faltarem na fonte 5×7 `NEON_FONT`; só textos nossos, nada de marca ou jogo de verdade.
- **Uma caixa nova no mapa** (`MAP` em `@guess/world`): precisa de um objeto com `fits` do tamanho dela (largura, altura
  da frente, fundo), senão fica invisível; o teste do pipeline aponta qual falta.
- **A cidade ao fundo**: outra semente ou outros números em `SKYLINES`/`STYLES` em `tools/sprites/src/skyline.ts`.
  Personagens de outro pacote precisam de licença que permita.

Depois de mudar uma receita: `bun run sprites`, conferir as folhas e versionar o que mudou em `apps/web/`.

## Sistema

`/sistema` é a página do dono do jogo: ver, baixar e trocar tudo o que o jogo usa (ADR 0009). Pede uma senha, que o
servidor confere pelo SHA-256 dela, dado só pelo ambiente (`GUESS_ADMIN_HASH`); nem a senha nem o hash ficam no
repositório. Sem a variável o sistema fica desligado. No servidor ela vem de `~/.guessoca.env`, que o `docker:start` passa
ao container se existir:

```
printf 'GUESS_ADMIN_HASH=%s\n' "$(printf %s 'A SENHA' | sha256sum | cut -d' ' -f1)" > ~/.guessoca.env
chmod 600 ~/.guessoca.env
cd ~/dev/guessoca && npm run docker:stop; npm run docker:start
```

Para testar na sua máquina: `GUESS_ADMIN_HASH=<hash> PORT=3111 bun apps/server/src/index.ts`. O passo a passo do servidor,
com a conferência e como trocar a senha, está em `docs/sistema.md`.

- **Ver**: cada personagem com as sete animações tocando (tamanho, velocidade, pausa, quadro a quadro, linha do chão e
  âncora), os objetos do telhado, a cidade ao fundo, os balões, a música e os efeitos sonoros, e a tabela de todos os
  arquivos servidos.
- **Baixar**: cada arquivo, cada atlas, cada efeito em WAV, ou tudo num zip.
- **Trocar**: um arquivo de `/sprites/` ou `/music/` por outro do mesmo formato e, se imagem, do mesmo tamanho em
  pixels. Vale na hora, e "Desfazer troca" volta o original. As trocas ficam em `data/overrides/` (no Docker, o volume
  `guessoca-data` em `/app/data`) e **sobrevivem a um deploy**: se uma folha nova do repositório não aparece no ar, veja
  se há uma troca valendo na primeira aba.
- **Só com deploy**: personagem novo, outra quantidade de quadros, outro fps, efeitos sonoros, mapa.

## Deploy

Um push na `main` põe o jogo em https://guess.passoca.dev (ADR 0001): o workflow roda `check` e `test`, builda a imagem no
runner, manda o `docker save` por scp e, por SSH, roda `docker:load` / `docker:stop` / `docker:start` (o container escuta em
`127.0.0.1:3003`, atrás do nginx) e sonda `/health` e a raiz. Os passos humanos (segredos `SSH_*`, DNS, bloco do nginx e
certbot) são guiados por `bash deploy/wizard.sh`, que termina provando HTTPS e o handshake `wss://` de fora.
`bun run docker:build && bun run docker:start` reproduz o container localmente em http://localhost:3003.

## Pendente

- `vanilla.css` do dssoca@0.19 ainda tem `:where(:scope)a.ss-svc`, que o lightningcss (Vite 8) rejeita; `build.cssMinify`
  está desligado até isso ser corrigido no dssoca (como no trucossoca).

## Créditos

Herói: [Ozzbit Games](https://ozzbit-games.itch.io) (pacote "male hero", uso pessoal e não comercial). O pacote original
não está no repositório; só as folhas geradas pelo pipeline (ADR 0007). O cavaleiro esqueleto e os personagens de sete folhas são arte do dono do jogo.
Guessoca não é comercial e não tem anúncios.
