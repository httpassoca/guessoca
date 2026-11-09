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
                     está online), `nextDeadline`, `addMember`/`removeMember`. Lobby: ordem das vezes, autores em círculo
                     (trocar, sortear sem ninguém escrever para si), personagens únicos, tamanho da vez, só moderar. Escrita:
                     autor (ou moderador) escreve ao vivo até "Pronto"; todos prontos → jogo; "Começar já" sem post-it vazio.
                     Jogo: vezes na ordem pulando quem caiu, jogador falso e quem já terminou; Acertei → votação de 15 s
                     (maioria dos votos dados, empate e zero votos = sim; não = a vez volta com o que sobrava); desistir;
                     moderador marca acertou/não (desfaz revelação), passa a vez, pausa, reordena, encerra. Fim quando nenhuma
                     pessoa conectada ainda joga; "jogar de novo" volta ao lobby com os fantasmas entrando
  test/              lobby, escrita e jogo com `Sim` e sorteio semeado
packages/world     o telhado, puro (@guess/world, ADR 0005): o mapa (três prédios com vãos, caixas para subir), `stepBody`
                   (andar, correr, profundidade, pular, gravidade, lados que bloqueiam, degrau, corpos sólidos, ficar na
                   cabeça de alguém e ser carregado, cair na rua e voltar piscando), `shoveTargets`/`applyShove`, e a
                   projeção 2.5D (`project`, `depthKey`, `followCamera`) que o Pixi e os post-its em HTML dividem (ADR 0006)
  test/              movimento, corpos, empurrão, animação, projeção e câmera, a 60 passos por segundo
packages/protocol  mensagens cliente ↔ servidor (@guess/protocol): todas as ações do jogo e de volta `snapshot`, `error`
                   (`roomFull`, `refused`), `pong`; `presence` (posição, velocidade, lado, animação, emote, piscando) e `shove`/`shoved`; `RoomSnapshot` com post-its como cada um os vê (o próprio vem sem texto e
                   sem imagem até ser revelado, só com `written`), vez e votação com o tempo que sobra; `parseClientMessage`;
                   `isWebp`, limites da imagem, `imageUrl`; códigos de fechamento (4404, 4410, 4409, 4403 expulso)

apps/server        Bun.serve: `/health`, `POST /api/rooms` → `{ code }`, `POST /api/rooms/CODE/images?token=T` (WebP até
                   300 KB → `{ id }`; 404/403/413/415), `GET /api/rooms/CODE/images/ID`, cliente estático com fallback SPA,
                   WebSocket em `/ws?room=CODE&token=T`. `dev` (fora de produção) aceita jogadores falsos
  src/room.ts        máquina de estado da sala, pura: `step(state, input, now, { rng })` → estado novo, mensagens e
                     fechamentos por token, eventos para o log; timers como dado (morte em 10 min sem ação de alguém da
                     turma, tolerância do moderador, prazo do jogo). Turma: entrar, apelido, sala cheia, quem cai continua
                     até a sala morrer; o moderador expulsa (4403, o token não volta) e passa o papel; offline por 20 s, o
                     papel vai para a pessoa conectada mais antiga. Repassa as ações ao jogo e o põe em dia a cada entrada.
                     Jogadores falsos escrevem uma identidade ao acaso e ficam prontos. `snapshotFor` esconde o post-it do
                     próprio dono
  src/host.ts        `RoomHost`: sockets por token, timers que a sala pede, silêncio de 30 s, a presença de cada um repassada
                     aos outros (~15 por segundo, só a mais recente; quem chega recebe a de todos), o empurrão entregue só a
                     quem foi empurrado, e as imagens da sala em memória
                     (ADR 0003): só de quem é da turma, liberadas quando nenhum post-it as usa (uma subida ainda sem post-it
                     espera 2 min; no máximo 2 por pessoa)
  src/rooms.ts       `Rooms`: as salas vivas num mapa em memória, códigos de 4 letras sem I nem O
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
  src/lib/image.ts         a imagem do post-it: reduz a 512 px, WebP baixando a qualidade até caber, sobe por POST
  src/lib/sprites/         os atlas gerados (`hero.json`, `emotes.json`) e `hero.ts`, que diz onde está cada quadro
  src/lib/world/            o telhado no navegador: controls (teclas → `Input`), loop (60 passos por segundo), presence (manda
                           a própria ~15/s e um batimento por segundo parado; interpola a dos outros), crowd (quem desenhar,
                           jogadores falsos parados em lugares fixos), view (escala inteira, onde vão o post-it e o balão),
                           heads, platforms (o desenho das plataformas, num lugar só), scene (Pixi: corpos por profundidade,
                           sombras, balões, câmera), runtime (o laço, o empurrão de ida e de volta, os post-its em HTML sobre as
                           cabeças) e World.svelte
  src/lib/sound/           os efeitos sonoros: sfx (cinco sons como parâmetros do sfxr, gerados com o jsfxr; nenhum arquivo de
                           áudio), room (os sons da sala tirados da diferença entre snapshots: votação, acertou, fim de vez),
                           settings (volume e mudo por navegador) e player (um AudioContext, ligado na primeira interação)
  src/lib/keys.ts          Enter = Acertei, Tab = passar, N = bloco, Esc = menu (fora de campo de texto)
  src/lib/panels/          Room (o telhado atrás de tudo, a barra, a coluna da fase que recolhe, teclado), TurnBar (vez e votação
                           no alto), Roster (a tira de post-its embaixo), Lobby (ordem arrastável, autores, personagens, tamanho da vez), Writing
                           e PostitEditor (ao vivo, imagem, Pronto, moderador escreve os vazios), Playing (vez, votação, ranking),
                           ModPanel, Ended, Notepad, Menu
  src/lib/screens/         Home (abrir sala, entrar com código, crédito) e Sala (apelido, depois o jogo; sala inexistente,
                           encerrada ou expulso)
  test/                    tradução, rotas, identidade, teclas, imagem, `RemoteRoom` com socket falso e contra o servidor de
                           verdade, o modelo de vista, os sons da sala, volume e mudo, e os efeitos que rendem amostras

tools/sprites      `bun run sprites` (@guess/sprites): as receitas que geram as folhas a partir do pacote (ver Sprites)
  src/image.ts       imagens RGBA puras: recortar, colar, trocar e apagar cores, pedaços soltos, traços finos
  src/grid.ts        pixel art escrita como texto (um caractere por pixel, `.` transparente)
  src/hero.ts        o personagem: fatia as folhas do pacote, tira a espada do golpe, oito cores de cabelo, atlas
  src/emotes.ts      os balões `?`, `!`, `haha`, "eu?"/"me?" com uma fonte 3×5 em texto
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
| Enter          | Acertei (na sua vez)        |
| Tab            | passar a vez                |
| N              | bloco                       |
| Esc            | menu                        |

O mouse é só para a interface.

## Sprites

O personagem é o "male hero" (versão grátis) da [Ozzbit Games](https://ozzbit-games.itch.io), com licença só para uso
pessoal e não comercial, modificações permitidas e crédito obrigatório (ADR 0007). Por isso o pacote original não entra no
git: fica em `assets-src/` (ignorado), e só as folhas que o pipeline gera são versionadas em `apps/web/public/sprites/`
(os atlas em `apps/web/src/lib/sprites/`). O CI e o Docker usam o que está versionado e nunca precisam do pacote.

```
cp -r ~/dev/tmp/male_hero_free assets-src/   # uma vez, na máquina do dono
bun run sprites                             # refaz as folhas e os atlas
```

O que sai:

- `hero-0.png` … `hero-7.png`: os oito personagens, iguais menos o cabelo (castanho, preto, loiro, ruivo, azul, verde,
  prata, lilás). Uma linha por animação: parado, andando, correndo, pulo, queda, queda em loop e empurrão. O empurrão é o
  golpe do pacote sem a espada: as cores da lâmina e do cabo saem por cor, o rastro branco por ser uma mancha branca
  grande, e o contorno fino da lâmina por estar à frente do corpo.
- `emotes-pt-BR.png` e `emotes-en-US.png`: os balões das teclas 1–4; só o "eu?"/"me?" muda de uma para a outra.

### Pedir um personagem ou objeto novo

- **Outra cor de cabelo**: uma rampa a mais (sombra, base, brilho) em `HAIRS` em `tools/sprites/src/hero.ts`. Hoje são
  oito porque a sala tem oito pessoas.
- **Outra peça do personagem** (cachecol, camisa…): o mesmo jeito, trocando as cores dessa peça; diga qual peça e a cor.
  Para achar as cores de uma peça, o pipeline tem `palette()`.
- **Outro balão**: uma entrada em `EMOTES` e, se tiver letra nova, a letra em `FONT` (3×5) em `tools/sprites/src/emotes.ts`.
- **Um objeto do telhado** (caixa-d'água, antena, placa…): uma grade de texto com a paleta, como as letras dos balões, num
  módulo novo ao lado; diga o tamanho em pixels e as cores. Personagens de outro pacote precisam de licença que permita.

Depois de mudar uma receita: `bun run sprites`, conferir as folhas e versionar o que mudou em `apps/web/`.

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

Personagem: [Ozzbit Games](https://ozzbit-games.itch.io) (pacote "male hero", uso pessoal e não comercial). O pacote original
não está no repositório; só as folhas geradas pelo pipeline (ADR 0007). Guessoca não é comercial e não tem anúncios.
