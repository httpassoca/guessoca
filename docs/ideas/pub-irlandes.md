# Ideia: um segundo mapa, o pub irlandês

O telhado neon é o único mundo da v1. Um segundo mapa seria um pub irlandês à noite: madeira escura, balcão comprido, banquetas, mesas redondas, um palco pequeno com instrumentos, lareira, garrafas atrás do balcão, chope.

## Como encaixa

- Mesmo jogo, mesmo mundo 2.5D (ADR 0005, ADR 0006): só muda o chão e o cenário. As plataformas viram o balcão, as mesas, o palco e a escada para um mezanino.
- Cair do telhado vira cair do mezanino ou do palco; o empurrão continua.
- Cenário gerado pelo mesmo pipeline (`bun run sprites`), em grades de pixel em texto, como os props do telhado.
- O mapa seria escolhido por sala, no lobby, como o cenário do trucossoca.
- Outro clima de filtros: luz quente, fumaça, sem o VHS frio do telhado.

## Perguntas em aberto

- O mapa é um termo novo no `CONTEXT.md` (hoje "telhado" é o mundo) ou "telhado" vira um dos mapas?
- Música ambiente (um violino ao fundo) entra mesmo sem música na v1?
