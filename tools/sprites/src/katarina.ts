/**
 * A Katarina: a assassina de cabelo vermelho comprido, com duas adagas, arte que o dono mandou em `assets-src/katarina/`
 * (fora do git, ADR 0007). É um desenho novo feito para o jogo do dono, não os arquivos de nenhum outro jogo. É um
 * personagem de sete folhas: a receita é a comum (`pack.ts`, que não muda nenhum pixel da arte) e aqui ficam só os
 * números dela, em pixels da célula, medidos na arte. Sai `apps/web/public/sprites/char-10.webp` e o atlas dela.
 *
 * Esta é a segunda arte dela, do pedido que fixa a densidade e deixa o modelo escolher os quadros: tamanho 1 (128
 * pixels), células de 160×160 e, só no ataque, de 256×160, em que ela fica 16 pixels mais à direita (pés no x 88 em vez
 * de 72): os quadros do ataque andam 16 para trás, e a tela de trabalho tem essa folga. O chão na linha 148. O ataque
 * (`attack.png`) são 22 quadros em 1 s: ela gira e corta baixo com as duas adagas. A primeira arte (144×144, 101 pixels,
 * quadros fixos) ficou em `assets-src/katarina-v1/`.
 */
import type { Hex } from './image';
import { PACK_WORLD_SCALE, packSpec, type PackConfig } from './pack';

/** A cor da Katarina na interface (`--gs-char-10` no CSS): o carmim do cabelo, mais vivo que o vermelho do esqueleto. */
export const KATARINA_COLOR: Hex = 'e0364f';

/** Os números da Katarina. O cabelo voa para trás, então o quadrado do rosto anda para a frente (`headShift`). */
export const KATARINA: PackConfig = {
  name: 'Katarina', cellW: 160, cellH: 160, padX: 16, shifts: {}, worldScale: PACK_WORLD_SCALE, headRows: 30, headShift: 8, feetRows: 4,
  cells: { shove: { cellW: 256, cellH: 160, dx: -16 } },
  spec: packSpec({ idle: [8, 8 / 1.2], walk: [12, 12 / 0.85], run: [12, 20], jump: [8, 20], fall: [8, 8 / 0.33], fall_loop: [8, 8 / 0.45], shove: [22, 22] }),
};
