/**
 * O Bolsonaro: a caricatura dele de faixa presidencial, montado num tiranossauro, com uma arma de raio na mão; arte que o
 * dono pediu a um modelo de imagem, em `assets-src/bolsonaro/` (fora do git, ADR 0007). É um personagem de sete folhas:
 * a receita é a comum (`pack.ts`, que não muda nenhum pixel da arte) e aqui ficam só os números dele, em pixels da
 * célula, medidos na arte. Sai `apps/web/public/sprites/char-10.webp` e `bolsonaro.json`.
 *
 * A arte: células de 208×192, o conjunto com 172 de comprimento e 150 de altura, o chão na linha 177 (o `sheet.json` do
 * pacote diz 176, a última linha com pata). Como o Orelha, é mais largo que alto e a cabeça (a do cavaleiro) não fica em
 * cima do meio: `headSize`, e a âncora no meio das patas do dinossauro. O que ficou como veio: o parado não se mexe (os
 * dez quadros são iguais), e o empurrão é um tiro, com o clarão roxo da arma (o pedido da arte proíbe efeitos, mas a
 * arte é do dono e não se mexe nela).
 */
import type { Atlas } from './atlas';
import type { Hex, Image } from './image';
import { buildPack, PACK_SPEC, type PackConfig } from './pack';

/** A cor do Bolsonaro na interface (`--gs-char-10` no CSS): o verde da faixa. */
export const BOLSONARO_COLOR: Hex = '3f9b4a';

/**
 * Os números do Bolsonaro. `worldScale` 0,3 dá 45 de altura e 52 de comprimento no mundo (o herói tem 37 de altura). As
 * 30 linhas do alto têm a cabeça do cavaleiro e a ponta da arma; o quadrado do rosto tem 40.
 */
export const BOLSONARO: PackConfig = {
  name: 'Bolsonaro', cellW: 208, cellH: 192, padX: 0, shifts: {}, spec: PACK_SPEC, worldScale: 0.3, headRows: 30, headSize: 40, feetRows: 6,
};

/** A folha e o atlas do Bolsonaro a partir das sete folhas do pacote. */
export const buildBolsonaro = (sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } => buildPack(sheets, BOLSONARO);
