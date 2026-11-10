/**
 * O Old Snake: o soldado velho de bandana, colete e fuzil, arte que o dono mandou em `assets-src/oldsnake/` (fora do git,
 * ADR 0007). É um desenho novo feito para o jogo do dono (pixel art de 25 cores), não os arquivos de nenhum outro jogo.
 * É um personagem de sete folhas: a receita é a comum (`pack.ts`, que não muda nenhum pixel da arte) e aqui ficam só os
 * números dele, em pixels da célula, medidos na arte. Sai `apps/web/public/sprites/char-7.webp` e `oldsnake.json`.
 *
 * A arte: células de 128×128, ele com 97 de altura e uns 50 de largura, o chão na linha 116 (como diz o `sheet.json` do
 * pacote). O ataque vem em `attack.png`: ele ergue o fuzil e atira, com um clarão pequeno na ponta do cano. No pulo e na
 * queda ele veio até 20 pixels acima do chão; a receita comum desce todo quadro até o chão.
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_SPEC, type PackConfig } from './pack';

/** A cor do Old Snake na interface (`--gs-char-7` no CSS): o cinza-azulado do traje. */
export const OLDSNAKE_COLOR: Hex = '656a7c';

/** Os números do Old Snake. `worldScale` 0,5 dá 49 de altura no mundo (o herói tem 37, o Vorcaro 50). */
export const OLDSNAKE: PackConfig = {
  name: 'Old Snake', cellW: 128, cellH: 128, padX: 0, shifts: {}, spec: PACK_SPEC, worldScale: 0.5, headRows: 30, feetRows: 4,
};

/** A folha e o atlas do Old Snake a partir das sete folhas do pacote. */
export const buildOldSnake = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, OLDSNAKE);
