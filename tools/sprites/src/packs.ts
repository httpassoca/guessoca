/**
 * O registro dos personagens de sete folhas (`pack.ts`): **um personagem é uma entrada aqui**. A ordem é a dos lugares,
 * depois do herói e do esqueleto (`characters.ts`). Daqui saem a lista de personagens, o que `index.ts` lê de
 * `assets-src/` e grava, e os atlas do cliente (`atlases.json`); o cliente e os testes não têm lista de nomes para manter.
 *
 * Como acrescentar um personagem (o passo a passo, com as medidas, está em `docs/art.md`):
 * 1. copie a pasta dele para `assets-src/<dir>/`;
 * 2. acrescente uma entrada em `PACKS`: `model` (o nome do atlas), `name` (como ele se chama; não aparece na
 *    interface), `color` (a cor dele na interface, única), `dir` e o `config` (`PackConfig`, os números medidos na arte);
 * 3. some um em `CHARACTERS` (`packages/rules/src/game.ts`);
 * 4. `bun run sprites`, e confira no jogo.
 *
 * Os primeiros personagens têm o `config` num arquivo próprio (`kratos.ts`, …), com a história de cada um. Os mais novos,
 * do pedido que fixa a densidade (`PACK_WORLD_SCALE`) e deixa o modelo escolher os quadros (`packSpec`), ficam aqui,
 * cada um com a sua nota.
 */
import { BOLSONARO, BOLSONARO_COLOR } from './bolsonaro';
import { EVE, EVE_COLOR } from './eve';
import type { Hex } from './image';
import { KATARINA, KATARINA_COLOR } from './katarina';
import { KNIGHT, KNIGHT_COLOR } from './knight';
import { KRATOS, KRATOS_COLOR } from './kratos';
import { MISTA, MISTA_COLOR } from './mista';
import { OLDSNAKE, OLDSNAKE_COLOR } from './oldsnake';
import { ORELHA, ORELHA_COLOR } from './orelha';
import { PACK_SPEC, PACK_WORLD_SCALE, packSpec, type PackConfig } from './pack';
import { PINOCCHIO, PINOCCHIO_COLOR } from './pinocchio';
import { PUNISHER, PUNISHER_COLOR } from './punisher';
import { VORCARO, VORCARO_COLOR } from './vorcaro';

/** Um personagem de sete folhas: quem é, onde está a arte e os números dela. */
export interface Pack {
  /** o nome do modelo: a chave do atlas dele em `atlases.json` */
  model: string;
  /** como ele se chama, em português; não aparece na interface hoje */
  name: string;
  /** a cor dele na interface (bordas e marcas), única entre os personagens */
  color: Hex;
  /** a pasta do pacote em `assets-src/` */
  dir: string;
  config: PackConfig;
}

/** Os números comuns de um pacote do pedido novo: a escala de todos, sem deslocamentos. */
const NEW = { padX: 0, shifts: {}, worldScale: PACK_WORLD_SCALE, feetRows: 4 } as const;

export const PACKS: readonly Pack[] = [
  { model: 'kratos', name: 'kratos', color: KRATOS_COLOR, dir: 'kratos', config: KRATOS },
  { model: 'vorcaro', name: 'vorcaro', color: VORCARO_COLOR, dir: 'vorcaro', config: VORCARO },
  { model: 'orelha', name: 'orelha', color: ORELHA_COLOR, dir: 'orelha', config: ORELHA },
  { model: 'bolsonaro', name: 'bolsonaro', color: BOLSONARO_COLOR, dir: 'bolsonaro', config: BOLSONARO },
  { model: 'knight', name: 'cavaleiro', color: KNIGHT_COLOR, dir: 'knight', config: KNIGHT },
  { model: 'oldsnake', name: 'old snake', color: OLDSNAKE_COLOR, dir: 'oldsnake', config: OLDSNAKE },
  { model: 'pinocchio', name: 'pinóquio', color: PINOCCHIO_COLOR, dir: 'pinocchio', config: PINOCCHIO },
  { model: 'eve', name: 'eve', color: EVE_COLOR, dir: 'eve', config: EVE },
  { model: 'katarina', name: 'katarina', color: KATARINA_COLOR, dir: 'katarina', config: KATARINA },
  { model: 'punisher', name: 'justiceiro', color: PUNISHER_COLOR, dir: 'punisher', config: PUNISHER },
  { model: 'mista', name: 'mista', color: MISTA_COLOR, dir: 'mista', config: MISTA },

  /**
   * O Star Platinum: o espírito roxo de cabelo comprido e ombreiras douradas. Tamanho 1,16 (148 pixels), células de
   * 192×176, o chão na linha 164. Ele paira: no andar, no correr (voando deitado) e no ataque fica alguns pixels acima
   * do chão, cada quadro numa altura, então essas três ficam onde a arte as pôs (`float`). O ataque são 16 quadros de
   * socos, com balões "ORA" desenhados na arte.
   */
  {
    model: 'starplatinum', name: 'star platinum', color: '8f5fd6', dir: 'starplatinum',
    config: {
      ...NEW, name: 'o Star Platinum', cellW: 192, cellH: 176, headRows: 30, float: ['walk', 'run', 'shove'],
      spec: packSpec({ idle: [8, 8 / 1.2], walk: [8, 10], run: [8, 8 / 0.6], jump: [6, 15], fall: [4, 4 / 0.33], fall_loop: [4, 10], shove: [16, 16 / 0.45] }),
    },
  },
  /**
   * O Josuke: o rapaz de topete e uniforme azul-marinho. Tamanho 1 (128 pixels), células de 160×160, o chão na linha 144.
   * No ataque aparece o Crazy Diamond atrás dele e dá um soco. A folha `fall.png` deste pacote é o **pouso** (desce,
   * encosta no chão e volta ao parado), feita a pedido do dono; o jogo toca `fall` na passagem do pulo para a queda, lá
   * no alto, onde um pouso não faz sentido. Então a queda do jogo usa a folha `fall_loop.png` dele (os mesmos 8 quadros,
   * em 0,33 s), e o pouso fica sem uso até o jogo ter uma animação de pouso.
   */
  {
    model: 'josuke', name: 'josuke', color: '3b4a9e', dir: 'josuke',
    config: {
      ...NEW, name: 'o Josuke', cellW: 160, cellH: 160, headRows: 30, files: { fall: 'fall_loop.png' },
      spec: packSpec({ idle: [8, 8], walk: [8, 10], run: [8, 12.5], jump: [8, 20], fall: [8, 8 / 0.33], fall_loop: [8, 20], shove: [12, 12 / 0.44] }),
    },
  },
  /**
   * O Joker (de Persona): o ladrão de máscara branca e sobretudo preto comprido, com uma faca. Tamanho 1,06 (136
   * pixels), células de 144×160, o chão na linha 152.
   */
  {
    model: 'joker', name: 'joker', color: 'd8243c', dir: 'joker',
    config: {
      ...NEW, name: 'o Joker', cellW: 144, cellH: 160, headRows: 30,
      spec: packSpec({ idle: [8, 8 / 1.2], walk: [10, 10 / 0.9], run: [10, 10 / 0.65], jump: [6, 15], fall: [5, 5 / 0.33], fall_loop: [4, 10], shove: [8, 20] }),
    },
  },
  /**
   * O Giorno Giovanna: o rapaz loiro de trança e terno rosa. Tamanho 1 (128 pixels), células de 160×160, o chão na
   * linha 144.
   */
  {
    model: 'giorno', name: 'giorno', color: 'e86aa6', dir: 'giorno',
    config: {
      ...NEW, name: 'o Giorno', cellW: 160, cellH: 160, headRows: 30,
      spec: packSpec({ idle: [8, 8 / 1.2], walk: [8, 10], run: [8, 8 / 0.6], jump: [5, 12.5], fall: [3, 3 / 0.33], fall_loop: [4, 10], shove: [8, 20] }),
    },
  },
  /**
   * O Zed: o ninja de armadura escura e máscara, com lâminas nos braços. Esta é a segunda arte dele, do pedido que pede
   * pelo menos 8 quadros em tudo e deixa o ataque sair da célula: tamanho 1,10 (141 pixels), células de 192×176 e, só no
   * ataque, de 256×176, com os pés no mesmo x (80), o chão na linha 164. O ataque tem 24 quadros em 0,65 s.
   */
  {
    model: 'zed', name: 'zed', color: 'b0343a', dir: 'zed',
    config: {
      ...NEW, name: 'o Zed', cellW: 192, cellH: 176, headRows: 30, cells: { shove: { cellW: 256, cellH: 176, dx: 0 } },
      spec: packSpec({ idle: [8, 8], walk: [8, 10], run: [8, 8 / 0.6], jump: [8, 20], fall: [8, 8 / 0.33], fall_loop: [8, 20], shove: [24, 24 / 0.65] }),
    },
  },
  /**
   * O acólito: o Guimas de túnica clara de cerimônia sobre a batina preta. Tamanho 1 (128 pixels), células de 160×160, o
   * chão na linha 144.
   */
  {
    model: 'acolito', name: 'acólito', color: 'd9d2c4', dir: 'acolito',
    config: {
      ...NEW, name: 'o acólito', cellW: 160, cellH: 160, headRows: 30,
      spec: packSpec({ idle: [8, 8 / 1.28], walk: [8, 10], run: [8, 12.5], jump: [6, 15], fall: [4, 4 / 0.33], fall_loop: [4, 10], shove: [8, 20] }),
    },
  },
  /**
   * O Guimas: o rapaz de cabelo cacheado, moletom e calça pretos. Tamanho 1 (128 pixels), células de 160×160, o chão na
   * linha 144.
   */
  {
    model: 'guimas', name: 'guimas', color: '4a4a55', dir: 'guimas',
    config: {
      ...NEW, name: 'o Guimas', cellW: 160, cellH: 160, headRows: 30,
      spec: packSpec({ idle: [8, 8 / 1.2], walk: [8, 10], run: [8, 12.5], jump: [5, 12.5], fall: [3, 3 / 0.33], fall_loop: [3, 3 / 0.36], shove: [8, 20] }),
    },
  },
  /**
   * O Jotaro, com o Star Platinum: o rapaz de boné e sobretudo escuro, e o espírito roxo pairando atrás dele o tempo
   * todo. Tamanho 1,19 (152 pixels, a altura do Jotaro), células de 208×224 e, só no ataque, de 384×224, com os pés do
   * Jotaro no mesmo x (148), o chão na linha 216. O ponto mais baixo de todo quadro é o pé dele (o espírito paira acima),
   * então a receita comum o põe no chão sem mexer no pairar. O ataque são 24 quadros em 0,9 s: o espírito avança e dá a
   * rajada de socos; o dono pediu esse tempo mais lento, e o jogo trava o ataque por esse tempo (`shoveLock`). O alto do
   * conjunto é a cabeça do espírito (é por ela que o post-it sobe); o rosto na interface é o do Jotaro (`face`).
   */
  {
    model: 'jotaro', name: 'jotaro', color: '5a3fc0', dir: 'jotaro',
    config: {
      ...NEW, name: 'o Jotaro', cellW: 208, cellH: 224, headRows: 30, face: { x: 72, y: 24, size: 36 }, cells: { shove: { cellW: 384, cellH: 224, dx: 0 } },
      spec: packSpec({ idle: [10, 10 / 1.2], walk: [12, 12 / 0.9], run: [12, 12 / 0.65], jump: [10, 10 / 0.42], fall: [8, 8 / 0.33], fall_loop: [10, 10 / 0.45], shove: [24, 24 / 0.9] }),
    },
  },
  /**
   * A Miku: a cantora de marias-chiquinhas turquesa compridas, aqui musculosa. Tamanho 0,91 (116 pixels), células de
   * 224×160, o chão na linha 144. O ataque (`shove.png`, 18 quadros) é um chute alto. A folha de correr foi trocada uma
   * vez pelo dono (a primeira ficou em `assets-src/miku-v1/`).
   */
  {
    model: 'miku', name: 'miku', color: '28cbd0', dir: 'miku',
    config: {
      ...NEW, name: 'a Miku', cellW: 224, cellH: 160, headRows: 28,
      spec: packSpec({ idle: [8, 8 / 1.2], walk: [8, 10], run: [8, 8 / 0.6], jump: [8, 20], fall: [8, 8 / 0.33], fall_loop: [8, 20], shove: [18, 40] }),
    },
  },
  /**
   * O Galo Doido: o mascote de galo, de crista vermelha. Tamanho 1,09 (140 pixels), células de 160×176 e, só no ataque,
   * de 240×176, em que ele fica 40 pixels mais à direita (pés no x 111 em vez de 71): os quadros do ataque andam 40 para
   * trás, e a tela de trabalho tem essa folga. O chão na linha 152. O ataque tem 18 quadros em 0,45 s.
   */
  {
    model: 'galodoido', name: 'galo doido', color: 'e2b93b', dir: 'galodoido',
    config: {
      ...NEW, name: 'o Galo Doido', cellW: 160, cellH: 176, padX: 40, headRows: 30, cells: { shove: { cellW: 240, cellH: 176, dx: -40 } },
      spec: packSpec({ idle: [8, 8 / 1.2], walk: [8, 10], run: [8, 8 / 0.6], jump: [8, 20], fall: [8, 8 / 0.33], fall_loop: [8, 16], shove: [18, 40] }),
    },
  },
  /**
   * O Peffrey Jepstein: o homem grisalho de camisa polo azul-marinho e jeans, em guarda de boxe. Pacote do pedido antigo
   * (quadros fixos, `shove.png`, sem `size`): células de 192×160, ele com 125 pixels, o chão na linha 145; entra na
   * densidade de todos, quase um adulto. O ataque é um soco cruzado.
   */
  {
    model: 'jepstein', name: 'peffrey jepstein', color: '4f79b8', dir: 'jepstein',
    config: { ...NEW, name: 'o Peffrey Jepstein', cellW: 192, cellH: 160, headRows: 30, spec: PACK_SPEC },
  },
  /**
   * O Spike Spiegel (de Cowboy Bebop): o rapaz magro de cabelo verde-escuro despenteado e terno azul, com a mão no
   * bolso. Tamanho 1 (128 pixels), células de 160×160 e, só no ataque, de 224×160, com os pés no mesmo x (72), o chão na
   * linha 148. O ataque são 18 quadros em 0,9 s: um chute lateral.
   */
  {
    model: 'spikespiegel', name: 'spike spiegel', color: '3f8f6b', dir: 'spikespiegel',
    config: {
      ...NEW, name: 'o Spike Spiegel', cellW: 160, cellH: 160, headRows: 28, cells: { shove: { cellW: 224, cellH: 160, dx: 0 } },
      spec: packSpec({ idle: [8, 8 / 1.2], walk: [8, 10], run: [8, 8 / 0.6], jump: [8, 20], fall: [8, 8 / 0.33], fall_loop: [8, 20], shove: [18, 20] }),
    },
  },
  /**
   * O Daft Punk: a dupla de capacetes (um prateado, um dourado) que anda junta como **um personagem só**, em três
   * quartos, dançando em tudo (o parado é um gingado). Tamanho 1 (128 pixels), células de 160×160 e, só no ataque, de
   * 224×160, em que a dupla fica 12 pixels mais à direita (pés no x 92 em vez de 80): os quadros do ataque andam 12 para
   * trás. O chão na linha 144. O ataque são 24 quadros em 1,1 s (um chute dançado, que começa e termina no parado).
   */
  {
    model: 'daftpunk', name: 'daft punk', color: 'c9a227', dir: 'daftpunk',
    config: {
      ...NEW, name: 'o Daft Punk', cellW: 160, cellH: 160, padX: 12, headRows: 30, cells: { shove: { cellW: 224, cellH: 160, dx: -12 } },
      spec: packSpec({ idle: [12, 10], walk: [16, 16], run: [16, 20], jump: [8, 20], fall: [8, 8 / 0.33], fall_loop: [8, 20], shove: [24, 24 / 1.1] }),
    },
  },
];
