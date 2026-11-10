/**
 * O Orelha: o cachorro, arte que o dono mandou em `assets-src/orelha/` (fora do git, ADR 0007). É um personagem de sete
 * folhas: a receita é a comum (`pack.ts`, que não muda nenhum pixel da arte) e aqui ficam só os números dele, em pixels
 * da célula, medidos na arte. Sai `apps/web/public/sprites/char-4.webp` e `orelha.json`.
 *
 * Esta é a segunda arte dele. A primeira (células de 168×116, 142 pixels de comprimento) quase não se mexia parada e no
 * ar; o dono a trocou por esta, feita pelo pedido novo: pixel art de 22 cores, com os quadros que o modelo escolheu (12
 * no andar e no correr) e o tamanho no `sheet.json` (`size` 0,30: 38 pixels, na altura do joelho de uma pessoa). Então a
 * escala é a de todos (`PACK_WORLD_SCALE`) e os tempos vêm de `packSpec`.
 *
 * A arte: células de 96×64, ele com 38 de altura e uns 52 de comprimento, o chão na linha 54. É o único de quatro patas:
 * mais comprido que alto, com a cabeça na frente e o rabo erguido atrás. As duas linhas do alto só têm o cocuruto, e dão
 * o meio do rosto; o quadrado do rosto tem 22 (`headSize`). O ataque é uma mordida.
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_WORLD_SCALE, packSpec, type PackConfig } from './pack';

/** A cor do Orelha na interface (`--gs-char-4` no CSS): o caramelo das patas. */
export const ORELHA_COLOR: Hex = 'c57a3a';

/** Os números do Orelha: 15 de altura e 20 de comprimento no mundo (0,3 adulto). Os tempos são os do `sheet.json` dele. */
export const ORELHA: PackConfig = {
  name: 'Orelha', cellW: 96, cellH: 64, padX: 0, shifts: {}, worldScale: PACK_WORLD_SCALE, headRows: 2, headSize: 22, feetRows: 4,
  spec: packSpec({ idle: [8, 8 / 1.2], walk: [12, 12 / 0.9], run: [12, 18], jump: [6, 15], fall: [4, 4 / 0.33], fall_loop: [4, 10], shove: [8, 18] }),
};

/** A folha e o atlas do Orelha a partir das sete folhas do pacote. */
export const buildOrelha = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, ORELHA);
