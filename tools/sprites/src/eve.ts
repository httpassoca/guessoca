/**
 * A Eve: a espadachim de rabo de cavalo escuro e traje verde-esmeralda, com uma espada longa, arte que o dono mandou em
 * `assets-src/eve/` (fora do git, ADR 0007; o pacote chama a personagem de "Emerald"). É um desenho novo feito para o
 * jogo do dono (pixel art de 33 cores), não os arquivos de nenhum outro jogo. É um personagem de sete folhas: a receita
 * é a comum (`pack.ts`, que não muda nenhum pixel da arte) e aqui ficam só os números dela, em pixels da célula, medidos
 * na arte. Sai `apps/web/public/sprites/char-9.webp` e `eve.json`.
 *
 * A arte: células de 192×192, ela com 140 de altura e uns 57 de largura parada, o chão na linha 177 (o `sheet.json` do
 * pacote diz 176, a última linha com bota). O ataque vem em `attack.png`: uma estocada com a espada, que chega 55 pixels
 * à frente do corpo. O que ficou como veio: no correr ela vai bem agachada (113 de altura contra 140 parada), e na queda
 * veio até 17 pixels acima do chão (a receita comum desce todo quadro até o chão).
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_SPEC, type PackConfig } from './pack';

/** A cor da Eve na interface (`--gs-char-9` no CSS): um turquesa, para não confundir com o verde do Bolsonaro. */
export const EVE_COLOR: Hex = '2bb8a3';

/** Os números da Eve. `worldScale` 0,36 dá 50 de altura no mundo (o herói tem 37, o Vorcaro e o Pinóquio 50). */
export const EVE: PackConfig = {
  name: 'Eve', cellW: 192, cellH: 192, padX: 0, shifts: {}, spec: PACK_SPEC, worldScale: 0.36, headRows: 30, feetRows: 4,
};

/** A folha e o atlas da Eve a partir das sete folhas do pacote. */
export const buildEve = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, EVE);
