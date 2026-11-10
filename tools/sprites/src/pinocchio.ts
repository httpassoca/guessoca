/**
 * O Pinóquio: o rapaz de cabelo escuro, camisa branca, braço mecânico e sabre, arte que o dono mandou em
 * `assets-src/pinocchio/` (fora do git, ADR 0007). É um desenho novo feito para o jogo do dono (pixel art de 29 cores),
 * não os arquivos de nenhum outro jogo. É um personagem de sete folhas: a receita é a comum (`pack.ts`, que não muda
 * nenhum pixel da arte) e aqui ficam só os números dele, em pixels da célula, medidos na arte. Sai
 * `apps/web/public/sprites/char-8.webp` e `pinocchio.json`.
 *
 * A arte: células de 160×128, ele com 107 de altura e uns 35 de largura parado, o chão na linha 113 (o `sheet.json` do
 * pacote diz 112, a última linha com bota). O ataque vem em `attack.png`: uma estocada com o sabre, que chega 40 pixels à
 * frente do corpo. O que ficou como veio: no correr ele vai bem agachado (83 de altura contra 107 parado), e no pulo e
 * na queda veio até 23 pixels acima do chão (a receita comum desce todo quadro até o chão).
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_SPEC, type PackConfig } from './pack';

/** A cor do Pinóquio na interface (`--gs-char-8` no CSS): um roxo-azulado, do brilho do cabelo. */
export const PINOCCHIO_COLOR: Hex = '5b4b8a';

/** Os números do Pinóquio. `worldScale` 0,47 dá 50 de altura no mundo (o herói tem 37, o Vorcaro 50). */
export const PINOCCHIO: PackConfig = {
  name: 'Pinóquio', cellW: 160, cellH: 128, padX: 0, shifts: {}, spec: PACK_SPEC, worldScale: 0.47, headRows: 28, feetRows: 4,
};

/** A folha e o atlas do Pinóquio a partir das sete folhas do pacote. */
export const buildPinocchio = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, PINOCCHIO);
