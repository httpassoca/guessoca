/**
 * O Mista: o pistoleiro de gorro vermelho quadriculado, suéter azul e calça vermelha, com um revólver, arte que o dono
 * mandou em `assets-src/mista/` (fora do git, ADR 0007). É um desenho novo feito para o jogo do dono (pixel art de 37
 * cores), não os arquivos de nenhum outro jogo. É um personagem de sete folhas: a receita é a comum (`pack.ts`, que não
 * muda nenhum pixel da arte) e aqui ficam só os números dele, em pixels da célula, medidos na arte. Sai
 * `apps/web/public/sprites/char-12.webp` e `mista.json`.
 *
 * É um pacote do pedido novo: o `sheet.json` traz o tamanho (`size` 1,03: 132 pixels, um adulto) e os quadros que o
 * modelo escolheu, então a escala é a de todos (`PACK_WORLD_SCALE`) e os tempos vêm de `packSpec`. Células de 160×176, o
 * chão na linha 160. No pulo e na queda veio até 35 pixels acima do chão (a receita comum desce todo quadro até o chão).
 * O ataque é um tiro de revólver, com um clarão pequeno no cano.
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_WORLD_SCALE, packSpec, type PackConfig } from './pack';

/** A cor do Mista na interface (`--gs-char-12` no CSS): o azul do suéter. */
export const MISTA_COLOR: Hex = '2f8fd0';

/** Os números do Mista: 52 de altura no mundo (1,03 adulto). Os tempos são os do `sheet.json` dele. */
export const MISTA: PackConfig = {
  name: 'o Mista', cellW: 160, cellH: 176, padX: 0, shifts: {}, worldScale: PACK_WORLD_SCALE, headRows: 28, feetRows: 4,
  spec: packSpec({ idle: [8, 8 / 1.2], walk: [8, 10], run: [8, 8 / 0.6], jump: [5, 12.5], fall: [3, 3 / 0.33], fall_loop: [3, 8], shove: [8, 20] }),
};

/** A folha e o atlas do Mista a partir das sete folhas do pacote. */
export const buildMista = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, MISTA);
