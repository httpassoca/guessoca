/**
 * O Justiceiro (Punisher): o homem de sobretudo preto com a caveira branca no peito e uma pistola, arte que o dono
 * mandou em `assets-src/punisher/` (fora do git, ADR 0007). É um desenho novo feito para o jogo do dono (pixel art de
 * uns 30 cores), não os arquivos de nenhum outro jogo. É um personagem de sete folhas: a receita é a comum (`pack.ts`,
 * que não muda nenhum pixel da arte) e aqui ficam só os números dele, em pixels da célula, medidos na arte. Sai
 * `apps/web/public/sprites/char-11.webp` e `punisher.json`.
 *
 * É um pacote do pedido novo: o `sheet.json` traz o tamanho (`size` 1,19: 152 pixels, um lutador alto) e os quadros que
 * o modelo escolheu, então a escala é a de todos (`PACK_WORLD_SCALE`) e os tempos vêm de `packSpec`. Células de 224×192,
 * o chão na linha 176. No correr ele se inclina muito e os pés vêm uns 38 pixels atrás dos do parado: o correr anda 24
 * para a frente. No pulo e na queda veio até 46 pixels acima do chão (a receita comum desce todo quadro até o chão). O
 * ataque é um tiro de pistola, com um clarão no cano.
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_WORLD_SCALE, packSpec, type PackConfig } from './pack';

/** A cor do Justiceiro na interface (`--gs-char-11` no CSS): um cinza de aço. */
export const PUNISHER_COLOR: Hex = '9aa0aa';

/** Os números do Justiceiro: 59 de altura no mundo (1,19 adulto). Os tempos são os do `sheet.json` dele. */
export const PUNISHER: PackConfig = {
  name: 'o Justiceiro', cellW: 224, cellH: 192, padX: 24, shifts: { run: 24 }, worldScale: PACK_WORLD_SCALE, headRows: 28, feetRows: 4,
  spec: packSpec({ idle: [8, 8 / 1.2], walk: [8, 10], run: [8, 12.5], jump: [6, 15], fall: [4, 4 / 0.33], fall_loop: [4, 10], shove: [8, 20] }),
};

/** A folha e o atlas do Justiceiro a partir das sete folhas do pacote. */
export const buildPunisher = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, PUNISHER);
