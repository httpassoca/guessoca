/**
 * O Orelha: o cachorro, arte que o dono pediu a um modelo de imagem, em `assets-src/orelha/` (fora do git, ADR 0007). É
 * um personagem de sete folhas: a receita é a comum (`pack.ts`, que não muda nenhum pixel da arte) e aqui ficam só os
 * números dele, em pixels da célula, medidos na arte. Sai `apps/web/public/sprites/char-9.webp` e `orelha.json`.
 *
 * A arte: células de 168×116, ele com 142 de comprimento e 100 de altura, o chão na linha 109 (o `sheet.json` do pacote
 * diz 108, a última linha com pata). É o único personagem de quatro patas: mais largo que alto, e a cabeça fica na
 * frente, não em cima do meio. Por isso `headSize` (o quadrado do rosto é maior que as linhas só de cabeça) e a âncora
 * no meio das quatro patas. O que ficou como veio: o parado quase não se mexe, e no pulo e na queda o corpo não muda,
 * só as patas.
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_SPEC, type PackConfig } from './pack';

/** A cor do Orelha na interface (`--gs-char-9` no CSS): o caramelo das patas. */
export const ORELHA_COLOR: Hex = 'c57a3a';

/**
 * Os números do Orelha. `worldScale` 0,3 dá 30 de altura e 43 de comprimento no mundo (o herói tem 37 de altura). As 18
 * linhas do alto só têm cabeça (o rabo começa mais abaixo): dão o meio do rosto; o quadrado do rosto tem 44.
 */
export const ORELHA: PackConfig = {
  name: 'Orelha', cellW: 168, cellH: 116, padX: 0, shifts: {}, spec: PACK_SPEC, worldScale: 0.3, headRows: 18, headSize: 44, feetRows: 6,
};

/** A folha e o atlas do Orelha a partir das sete folhas do pacote. */
export const buildOrelha = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, ORELHA);
