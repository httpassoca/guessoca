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
packages/rules     sala e jogo, puros (@guess/rules): apelido limpo e com sufixo, MAX_MEMBERS (8), MIN_PLAYERS (2)
packages/world     o telhado, puro (@guess/world): por enquanto só o sistema de coordenadas x, y, z (ADR 0005)
packages/protocol  mensagens cliente ↔ servidor (@guess/protocol): `join`, `nickname`, `ping` e de volta `snapshot`,
                   `error` (`roomFull`), `pong`; `RoomSnapshot` (código, fase, você, moderador, turma); `parseClientMessage`;
                   formatos do token e do código; códigos de fechamento do WebSocket

apps/server        Bun.serve: `/health`, `POST /api/rooms` → `{ code }`, cliente estático com fallback SPA, WebSocket em
                   `/ws?room=CODE&token=T` (sala inexistente fecha com 4404)
  src/room.ts        máquina de estado da sala, pura: `step(state, input, now)` → estado novo, mensagens por token, eventos
                     para o log; timers como dado (morte em 10 min sem ação de alguém da turma; conectar, cair e `ping` não
                     contam). Entrar com apelido (repetido ganha sufixo), trocar apelido, nona pessoa recusada (`roomFull`),
                     quem cai continua na turma até a sala morrer e volta com o mesmo token; quem entra primeiro é o moderador
  src/host.ts        `RoomHost`: sockets por token (aba nova com o mesmo token assume, a velha fecha com 4409), agenda os timers
                     que a sala pede, derruba o socket mudo por 30 s, fecha todo mundo com 4410 quando a sala morre
  src/rooms.ts       `Rooms`: as salas vivas num mapa em memória (ADR 0003), códigos de 4 letras sem I nem O
  test/              sala (entrar, sufixo, sala cheia, cair e voltar, morte), host (silêncio, aba substituída) e um servidor
                     real numa porta livre (duas abas na mesma sala, 4404, estáticos)

apps/web           Vite + Svelte 5 + dssoca (PixiJS v8 chega com o mundo)
  src/lib/route.ts         rotas: `/` início, `/sala/CODE`; `route.svelte.ts` é a rota reativa e `navigate`
  src/lib/identity.ts      token por aba (sessionStorage), apelido por navegador (localStorage)
  src/lib/i18n.ts          a tabela de tradução (pt-BR padrão, en-US), tipada para as duas terem as mesmas chaves;
                           `i18n.svelte.ts` guarda a língua do navegador e acompanha o `<html lang>`
  src/lib/rooms.ts         `openRoom()` (POST /api/rooms) e o endereço do WebSocket (ws/wss pela página)
  src/lib/room/remote.ts   `RemoteRoom`: conecta com o token, aplica os snapshots, pinga, nota o silêncio do servidor, reconecta
                           com espera crescente até 10 s, e para de vez em 4404/4410/4409 dizendo por quê
  src/lib/screens/         Home (abrir sala, entrar com código, crédito) e Sala (código e link, apelido, turma com moderador e
                           quem caiu, sala inexistente ou encerrada com "abrir uma sala nova")
  test/                    tradução, rotas, identidade, `RemoteRoom` com socket falso e contra o servidor de verdade

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
