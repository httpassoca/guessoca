/**
 * O Kratos: arte que o dono pediu a um modelo de imagem, em `assets-src/kratos/` (fora do git, ADR 0007). É um
 * personagem de sete folhas: a receita é a comum (`pack.ts`, que não muda nenhum pixel da arte) e aqui ficam só os
 * números dele, em pixels da célula, medidos na arte. Sai `apps/web/public/sprites/char-6.webp` e `kratos.json`.
 *
 * Esta arte trocou a primeira versão do Kratos, que era um GIF dele girando parado, com as sete animações desenhadas
 * por código a partir de um quadro só (ADR 0007, emendas).
 *
 * A arte: células de 116×160, ele com 121 de altura, o chão na linha 145 (o `sheet.json` do pacote diz 144, a última
 * linha com sapato). Os pés do correr já vêm embaixo do corpo: nada anda para o lado. No pulo e na queda ele veio
 * desenhado até 11 pixels acima do chão; a receita comum desce todo quadro até o chão.
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_SPEC, type PackConfig } from './pack';

/** A cor do Kratos na interface (`--gs-char-6` no CSS): o cinza pálido da pele, que nenhum outro personagem usa. */
export const KRATOS_COLOR: Hex = 'cdbfb4';

/** Os números do Kratos. `worldScale` 1/2 dá uns 60 de altura no mundo (o herói tem 37; o Kratos antigo tinha 62). */
export const KRATOS: PackConfig = {
  name: 'Kratos', cellW: 116, cellH: 160, padX: 0, shifts: {}, spec: PACK_SPEC, worldScale: 1 / 2, headRows: 24, feetRows: 6,
};

/** A folha e o atlas do Kratos a partir das sete folhas do pacote. */
export const buildKratos = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, KRATOS);
