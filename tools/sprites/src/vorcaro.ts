/**
 * O Vorcaro: o homem de terno, arte que o dono pediu a um modelo de imagem, em `assets-src/vorcaro/` (fora do git, ADR
 * 0007). É um personagem de sete folhas: a receita é a comum (`pack.ts`, que não muda nenhum pixel da arte) e aqui ficam
 * só os números dele, em pixels da célula, medidos na arte. Sai `apps/web/public/sprites/char-8.webp` e `vorcaro.json`.
 *
 * A arte: células de 256×384, ele com uns 300 de altura, o chão na linha 352. No correr o corpo veio todo atrás da cabeça
 * (os pés 24 pixels atrás dos do parado), então o correr anda 24 para a frente. O que ficou como veio: o décimo quadro do
 * parado e do andar repete o primeiro, o quinto do correr é menor, e a queda é quase o parado.
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_SPEC, type PackConfig } from './pack';

/** A cor do Vorcaro na interface (`--gs-char-8` no CSS): o azul da gravata. */
export const VORCARO_COLOR: Hex = '6f8fc0';

/** Os números do Vorcaro. `worldScale` 1/6 dá uns 50 de altura no mundo (o herói tem 37). */
export const VORCARO: PackConfig = {
  name: 'Vorcaro', cellW: 256, cellH: 384, padX: 28, shifts: { run: 24 }, spec: PACK_SPEC, worldScale: 1 / 6, headRows: 84, feetRows: 12,
};

/** A folha e o atlas do Vorcaro a partir das sete folhas do pacote. */
export const buildVorcaro = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, VORCARO);
