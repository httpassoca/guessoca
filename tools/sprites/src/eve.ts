/**
 * A Eve: a espadachim de rabo de cavalo escuro e traje verde-esmeralda, com uma espada longa, arte que o dono mandou em
 * `assets-src/eve/` (fora do git, ADR 0007). É um desenho novo feito para o jogo do dono, não os arquivos de nenhum
 * outro jogo. É um personagem de sete folhas: a receita é a comum (`pack.ts`, que não muda nenhum pixel da arte) e aqui
 * ficam só os números dela, em pixels da célula, medidos na arte. Sai `apps/web/public/sprites/char-9.webp` e o atlas dela.
 *
 * Esta é a segunda arte dela, do pedido que fixa a densidade e deixa o modelo escolher os quadros: tamanho 1 (128
 * pixels), células de 160×176 e, só no ataque, de 240×208, em que ela fica 32 pixels mais à direita (pés no x 104 em vez
 * de 72): os quadros do ataque andam 32 para trás, e a tela de trabalho tem essa folga. O chão na linha 160. O ataque são
 * 24 quadros em 1 s. A primeira arte (192×192, 140 pixels, quadros fixos) ficou em `assets-src/eve-v1/`.
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_WORLD_SCALE, packSpec, type PackConfig } from './pack';

/** A cor da Eve na interface (`--gs-char-9` no CSS): um turquesa, para não confundir com o verde do Bolsonaro. */
export const EVE_COLOR: Hex = '2bb8a3';

/** Os números da Eve. */
export const EVE: PackConfig = {
  name: 'Eve', cellW: 160, cellH: 176, padX: 32, shifts: {}, worldScale: PACK_WORLD_SCALE, headRows: 30, feetRows: 4,
  cells: { shove: { cellW: 240, cellH: 208, dx: -32 } },
  spec: packSpec({ idle: [8, 8 / 1.2], walk: [8, 8], run: [8, 8 / 0.6], jump: [8, 20], fall: [8, 8 / 0.33], fall_loop: [8, 20], shove: [24, 24] }),
};

/** A folha e o atlas da Eve a partir das sete folhas do pacote. */
export const buildEve = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, EVE);
