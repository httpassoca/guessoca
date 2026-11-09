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
packages/world     movimento, gravidade, colisão, cabeça dos outros, empurrão (@guess/world)
packages/protocol  mensagens cliente ↔ servidor, snapshot da sala, presença (@guess/protocol)
apps/server        Bun HTTP + WebSocket: máquina de estado da sala, RoomHost, Rooms em memória
apps/web           Vite + Svelte 5 + PixiJS v8 + dssoca: telhado, post-its em HTML, painéis
deploy/            wizard.sh (passos humanos do deploy) e guess.passoca.dev.nginx
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
certbot) são guiados por `bash deploy/wizard.sh`.

## Créditos

Personagem: [Ozzbit Games](https://ozzbit-games.itch.io) (pacote "male hero", uso pessoal e não comercial). O pacote original
não está no repositório; só as folhas geradas pelo pipeline (ADR 0007). Guessoca não é comercial e não tem anúncios.
