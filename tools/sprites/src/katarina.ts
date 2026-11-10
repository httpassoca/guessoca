/**
 * A Katarina: a assassina de cabelo vermelho comprido, com duas adagas, arte que o dono mandou em `assets-src/katarina/`
 * (fora do git, ADR 0007; o pacote chama a personagem de "Crimsonblade"). É um desenho novo feito para o jogo do dono
 * (pixel art de 48 cores), não os arquivos de nenhum outro jogo. É um personagem de sete folhas: a receita é a comum
 * (`pack.ts`, que não muda nenhum pixel da arte) e aqui ficam só os números dela, em pixels da célula, medidos na arte.
 * Sai `apps/web/public/sprites/char-10.webp` e `katarina.json`.
 *
 * A arte: células de 144×144, ela com 101 de altura e uns 66 de largura parada (o cabelo voa para trás), o chão na linha
 * 125 (o `sheet.json` do pacote diz 124, a última linha com bota). O pacote veio do pedido antigo: quadros fixos
 * (`PACK_SPEC`) e sem `size`, então o tamanho sai de `worldScaleFor`: um adulto. O ataque (`attack.png`) é um golpe de
 * adaga para a frente. Na queda ela veio até 7 pixels acima do chão; a receita comum desce todo quadro até o chão.
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_SPEC, worldScaleFor, type PackConfig } from './pack';

/** A cor da Katarina na interface (`--gs-char-10` no CSS): o carmim do cabelo, mais vivo que o vermelho do esqueleto. */
export const KATARINA_COLOR: Hex = 'e0364f';

/**
 * Os números da Katarina. Um adulto de 101 pixels: 50 de altura no mundo, como a Eve e o Pinóquio. O cabelo voa para
 * trás, então o quadrado do rosto anda 13 pixels para a frente (`headShift`).
 */
export const KATARINA: PackConfig = {
  name: 'Katarina', cellW: 144, cellH: 144, padX: 0, shifts: {}, spec: PACK_SPEC, worldScale: worldScaleFor(1, 101), headRows: 26, headShift: 13, feetRows: 4,
};

/** A folha e o atlas da Katarina a partir das sete folhas do pacote. */
export const buildKatarina = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, KATARINA);
