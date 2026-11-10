/**
 * O cavaleiro: o pequeno cavaleiro de máscara branca com chifres e capa azul-acinzentada, arte que o dono mandou em
 * `assets-src/knight/` (fora do git, ADR 0007). É um desenho novo feito para o jogo do dono, não os arquivos de nenhum
 * outro jogo (ver a emenda da ADR 0007). É um personagem de sete folhas: a receita é a comum (`pack.ts`, que não muda
 * nenhum pixel da arte) e aqui ficam só os números dele, em pixels da célula, medidos na arte. Sai
 * `apps/web/public/sprites/char-6.webp` e `knight.json`.
 *
 * A arte: células de 96×96, ele com 63 de altura e uns 30 de largura, o chão na linha 87 (o `sheet.json` do pacote diz
 * 86, a última linha com pé). O ataque vem em `attack.png` (o pedido novo): uma investida com a capa para trás. No pulo e
 * na queda ele veio até 8 pixels acima do chão; a receita comum desce todo quadro até o chão.
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_SPEC, worldScaleFor, type PackConfig } from './pack';

/** A cor do cavaleiro na interface (`--gs-char-6` no CSS): o branco frio da máscara. */
export const KNIGHT_COLOR: Hex = 'dfe3ee';

/**
 * Os números do cavaleiro. Ele tem 0,2 de um adulto (`worldScaleFor`, a regra de tamanho de `pack.ts`): 10 de altura no
 * mundo, o menor personagem do jogo, abaixo do joelho de uma pessoa e menor que o cachorro (15). Já teve 35 (0,69), até
 * o dono pedir 0,2.
 */
export const KNIGHT: PackConfig = {
  name: 'o cavaleiro', cellW: 96, cellH: 96, padX: 0, shifts: {}, spec: PACK_SPEC, worldScale: worldScaleFor(0.2, 63), headRows: 30, feetRows: 4,
};

/** A folha e o atlas do cavaleiro a partir das sete folhas do pacote. */
export const buildKnight = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, KNIGHT);
