/**
 * A receita comum dos personagens que chegam **prontos, em sete folhas**: a arte que o dono pede a um modelo de imagem
 * (o pedido está em `docs/art.md`, "Art made by an image model"), uma folha por animação (`idle.png`, `walk.png`,
 * `run.png`, `jump.png`, `fall.png`, `fall_loop.png`, e `attack.png` ou `shove.png`, ver `packFiles`), cada uma uma linha de células iguais, o personagem
 * olhando para a direita. O Kratos (`kratos.ts`), o Vorcaro (`vorcaro.ts`), o Orelha (`orelha.ts`), o Bolsonaro (`bolsonaro.ts`), o cavaleiro (`knight.ts`), o Old Snake (`oldsnake.ts`), o Pinóquio (`pinocchio.ts`), a Eve (`eve.ts`), a Katarina (`katarina.ts`), o Justiceiro (`punisher.ts`) e o Mista (`mista.ts`) são só os números de cada um (`PackConfig`).
 *
 * A regra: **a receita não muda nenhum pixel da arte**. Não encolhe, não recolore, não redesenha, não aumenta um quadro,
 * não tira quadro. Ela só **muda quadros inteiros de lugar** (o ponto mais baixo de cada um vai para a linha do chão; uma
 * animação pode andar para a frente, `shifts`) e recorta todos pelo mesmo retângulo (`layout`). A folha sai no tamanho
 * da arte, e é o jogo que a desenha menor: o atlas leva `scale` (`worldScale`), unidades do mundo por pixel do quadro
 * (`artScale` no cliente). Se um quadro veio errado (menor, repetido, torto), avise o dono e peça arte nova.
 *
 * Coordenadas: pixels da célula do pacote; a tela de trabalho tem `padX` de folga de cada lado e o chão na última linha.
 *
 * Como mudar:
 * - **Personagem novo**: um arquivo como `vorcaro.ts` com um `PackConfig` (meça a célula e as linhas da cabeça na arte;
 *   o pacote traz um `sheet.json` com a célula e os quadros), e os passos de `docs/art.md`.
 * - **Arte nova de um que já existe**: troque os PNG na pasta dele em `assets-src/`; se a célula ou os quadros mudarem,
 *   os números no `PackConfig` dele.
 */
import { ANIMATION_NAMES, layout, type AnimationName, type Atlas, type ModelSpec } from './atlas';
import { FALL_MS, SHOVE_MAX_MS } from '@guess/world';
import { blank, blit, bounds, crop, type Image } from './image';

/** As folhas de um pacote: uma por animação, `<nome>.png`. */
export const SHEETS = ANIMATION_NAMES;

/**
 * O arquivo de cada folha de um pacote, como `[animação, arquivo]`. O empurrão do jogo é o ataque do personagem: o pedido
 * da arte (`apps/web/src/lib/system/character-prompt.txt`) chama a folha de `attack.png`, e os pacotes mais antigos de
 * `shove.png`. Vale `attack.png` se o pacote tiver (`has` diz se um arquivo existe na pasta); senão, `shove.png`.
 */
export function packFiles(has: (file: string) => boolean, files: PackConfig['files'] = {}): (readonly [AnimationName, string])[] {
  return SHEETS.map((name) => [name, files[name] ?? (name === 'shove' && has('attack.png') ? 'attack.png' : `${name}.png`)] as const);
}

/**
 * Quadros, fps e loop dos pacotes de quando o pedido da arte fixava esses números: os do herói. Os pacotes novos
 * escolhem os seus (`packSpec`). O empurrão, 7 a 16 fps ≈ 437 ms, cabe em
 * `SHOVE_COOLDOWN_MS` (450 ms). A queda, 4 a 12 fps ≈ 333 ms, dura o `FALL_MS` do mundo.
 */
export const PACK_SPEC: ModelSpec = {
  animations: {
    idle: { frames: 10, fps: 10, loop: true },
    walk: { frames: 10, fps: 12, loop: true },
    run: { frames: 10, fps: 14, loop: true },
    jump: { frames: 6, fps: 12, loop: false },
    fall: { frames: 4, fps: 12, loop: false },
    fall_loop: { frames: 3, fps: 10, loop: true },
    shove: { frames: 7, fps: 16, loop: false },
  },
  credit: null,
};

/** Quais animações dão a volta; as outras tocam uma vez e param no último quadro. Igual para todo personagem. */
const LOOPS: Record<AnimationName, boolean> = { idle: true, walk: true, run: true, jump: false, fall: false, fall_loop: true, shove: false };
/** O maior número de quadros de uma animação, e o maior fps, que o pedido da arte aceita. */
export const MAX_FRAMES = 24;
export const MAX_FPS = 60;
/**
 * O maior lado de uma folha gerada, em pixels: o que qualquer placa de vídeo de computador aceita como textura (16384; o
 * jogo é só para navegador de computador). Era 8192, até o Vault Boy: o tiro e a explosão dele alargam o quadro, e 24
 * quadros de 365 pixels dão 8760.
 */
export const MAX_SHEET = 16384;

/**
 * A `ModelSpec` de um pacote que escolheu os próprios quadros: o pedido da arte dá um mínimo por animação e uma duração,
 * e o modelo decide quantos quadros cada uma precisa (e o fps que sai disso), gravando no `sheet.json`. Copie de lá, na
 * forma `{ idle: [quadros, fps], … }`, com `attack` no lugar de `shove`. O loop de cada animação é fixo (`LOOPS`).
 */
export function packSpec(timing: Record<AnimationName, readonly [frames: number, fps: number]>, credit: string | null = null): ModelSpec {
  return {
    animations: Object.fromEntries(ANIMATION_NAMES.map((name) => [name, { frames: timing[name][0], fps: timing[name][1], loop: LOOPS[name] }])) as ModelSpec['animations'],
    credit,
  };
}

/**
 * O que há de errado nos tempos de uma `ModelSpec`, em palavras (vazio se está tudo certo). O jogo deixa o ataque durar
 * o que dura na folha, até `SHOVE_MAX_MS` (quem ataca não ataca de novo até acabar), e troca a queda pelo loop em
 * `FALL_MS`, com quantos quadros forem: o empurrão não pode durar mais que o teto, e a queda tem que durar isso (com um oitavo de folga). E os limites do pedido: 1 a `MAX_FRAMES` quadros, fps
 * até `MAX_FPS`.
 */
export function specProblems(spec: ModelSpec): string[] {
  const out: string[] = [];
  for (const name of ANIMATION_NAMES) {
    const a = spec.animations[name];
    if (!Number.isInteger(a.frames) || a.frames < 1 || a.frames > MAX_FRAMES) out.push(`${name}: ${a.frames} quadros (tem que ser de 1 a ${MAX_FRAMES})`);
    if (!(a.fps > 0) || a.fps > MAX_FPS) out.push(`${name}: ${a.fps} fps (tem que ser até ${MAX_FPS})`);
  }
  const ms = (name: AnimationName) => (spec.animations[name].frames / spec.animations[name].fps) * 1000;
  if (ms('shove') > SHOVE_MAX_MS + 0.5) out.push(`shove: dura ${Math.round(ms('shove'))} ms, e o jogo corta em ${SHOVE_MAX_MS} ms`);
  if (Math.abs(ms('fall') - FALL_MS) > FALL_MS / 8) out.push(`fall: dura ${Math.round(ms('fall'))} ms, e o jogo troca pelo loop em ${Math.round(FALL_MS)} ms`);
  return out;
}

/** Os números de um personagem de sete folhas, em pixels da célula, medidos na arte. */
export interface PackConfig {
  /** o nome nas mensagens de erro */
  name: string;
  /** o tamanho de cada célula das folhas */
  cellW: number;
  cellH: number;
  /** a folga de cada lado na tela de trabalho: pelo menos o maior `shifts` */
  padX: number;
  /** quantos pixels uma animação anda para a frente (os pés vieram atrás dos do parado); só muda o lugar */
  shifts: Partial<Record<AnimationName, number>>;
  /** quadros, fps, loop e crédito: `PACK_SPEC` nos pacotes de quadros fixos; `packSpec({...})` com os números do `sheet.json` nos que escolheram os seus */
  spec: ModelSpec;
  /** unidades do mundo por pixel do quadro: a altura que ele deve ter no jogo ÷ a altura na arte */
  worldScale: number;
  /** quantas linhas do alto do parado são cabeça (do alto ao queixo): o que há nelas dá o meio do rosto */
  headRows: number;
  /** o lado do quadrado do rosto, se não for `headRows` mais um sétimo (um bicho de quatro patas, com a cabeça na frente) */
  headSize?: number;
  /** quantos pixels o quadrado do rosto anda para a frente: cabelo ou capa voando para trás puxam o meio das linhas da cabeça para trás */
  headShift?: number;
  /**
   * o quadrado do rosto, medido a partir do canto de cima à esquerda do boneco no primeiro quadro do parado, quando o
   * rosto de quem joga não está no alto do conjunto (um companheiro mais alto ao lado): vai no atlas como `face`
   */
  face?: { x: number; y: number; size: number };
  /** quantas linhas de baixo do parado são sola (para achar o meio dos pés) */
  feetRows: number;
  /**
   * Animações cuja folha tem uma célula própria, maior que a das outras: o pedido da arte deixa o ataque sair da célula
   * (uma estocada comprida, um tiro, um golpe pulando). `cellW` e `cellH` são dessa folha; `dx` é quanto os quadros dela
   * andam para os pés caírem no mesmo x dos pés do parado: o x dos pés na célula normal menos o x dos pés na célula
   * maior (em geral negativo; `padX` tem que ser pelo menos `-dx`). O chão continua sendo o ponto mais baixo do quadro.
   */
  cells?: Partial<Record<AnimationName, { cellW: number; cellH: number; dx: number }>>;
  /**
   * Animações em que o personagem não pisa no chão de propósito (um espírito que paira): os quadros delas ficam na
   * altura em que a arte os desenhou, medida pela linha do chão do primeiro quadro do parado, em vez de cada um descer
   * até encostar. Sem isto, um quadro que paira desceria, e os que pairam em alturas diferentes tremeriam.
   */
  float?: readonly AnimationName[];
  /**
   * Uma animação tirada de outra folha do pacote, pelo nome do arquivo: quando a folha com o nome dela mostra outra
   * coisa (uma `fall.png` que é o pouso, e não a passagem para a queda, que é o que o jogo toca em `fall`).
   */
  files?: Partial<Record<AnimationName, string>>;
}

/** A célula das folhas de uma animação: a própria (`cells`), ou a de todas. */
const cellOf = (c: PackConfig, name?: AnimationName) => (name && c.cells?.[name]) || { cellW: c.cellW, cellH: c.cellH, dx: 0 };
/** O tamanho da tela de trabalho: cabe a maior célula, com `padX` de folga de cada lado. */
const canvasOf = (c: PackConfig) => {
  const all = [{ cellW: c.cellW, cellH: c.cellH }, ...Object.values(c.cells ?? {})];
  return { w: Math.max(...all.map((x) => x.cellW)) + 2 * c.padX, h: Math.max(...all.map((x) => x.cellH)) };
};

/**
 * O tamanho no jogo. A referência é um adulto comum de pé: `NORMAL_HEIGHT` unidades do mundo (a Eve, o Pinóquio e o
 * Vorcaro têm isso). O pedido da arte manda desenhar esse adulto com `NORMAL_ART_HEIGHT` pixels e todo personagem na
 * mesma densidade (um cachorro na altura do joelho tem 0,3 × 128 pixels), e manda gravar no `sheet.json` o `size` (a
 * altura dele em adultos) e `standing_height_px`. Então um pacote novo entra com a mesma escala de todos,
 * `PACK_WORLD_SCALE`, e o tamanho já vem no desenho.
 *
 * Os pacotes de antes dessa regra vieram em qualquer tamanho, e cada um tem a sua `worldScale`, escolhida no olho. Para
 * um pacote que não seguiu a densidade (ou para o dono mudar o tamanho de alguém): `worldScaleFor(size, alturaNaArte)`.
 */
export const NORMAL_HEIGHT = 50;
/** Quantos pixels o adulto de referência tem na arte, da cabeça ao chão (o pedido da arte fixa este número). */
export const NORMAL_ART_HEIGHT = 128;
/** A escala de um pacote que seguiu o pedido: unidades do mundo por pixel da arte. */
export const PACK_WORLD_SCALE = NORMAL_HEIGHT / NORMAL_ART_HEIGHT;

/**
 * A `worldScale` para um personagem ficar com `size` adultos de altura no jogo, tendo `artHeight` pixels de altura no
 * parado da arte (do alto da cabeça ao chão). Um adulto (`size` 1) de 128 pixels dá `PACK_WORLD_SCALE`.
 */
export const worldScaleFor = (size: number, artHeight: number): number => (size * NORMAL_HEIGHT) / artHeight;

/** As células de uma folha, da esquerda para a direita, como vieram (`name`: a animação, se a folha dela tem célula própria). */
export function cellsOf(sheet: Image, c: PackConfig, name?: AnimationName): Image[] {
  const { cellW, cellH } = cellOf(c, name);
  return Array.from({ length: Math.floor(sheet.width / cellW) }, (_, i) => crop(sheet, i * cellW, 0, cellW, cellH));
}

/**
 * Uma célula na tela de trabalho, `dx` pixels para a frente e com o ponto mais baixo na última linha (o chão). No ar
 * (pulo, queda) isso põe o pé onde o corpo do jogo está, em vez de boiar na altura em que a arte o desenhou.
 */
export function place(cell: Image, c: PackConfig, dx = 0, ground?: number): Image {
  const b = bounds(cell);
  const { w, h } = canvasOf(c);
  const out = blank(w, h);
  // `ground`: a linha do chão na célula, para quem paira (`float`); sem ela, o ponto mais baixo do quadro é o chão
  if (b) blit(out, cell, c.padX + dx, h - (ground ?? b.y + b.h));
  return out;
}

/** Os quadros de cada animação, na ordem de `ANIMATION_NAMES`: os da arte, só mudados de lugar. */
export function derive(sheets: Readonly<Record<string, Image>>, c: PackConfig): Image[][] {
  // a linha do chão do pacote: embaixo do primeiro quadro do parado (só usada por quem paira)
  const idle = sheets.idle && bounds(cellsOf(sheets.idle, c, 'idle')[0]);
  const ground = idle ? idle.y + idle.h : undefined;
  return ANIMATION_NAMES.map((name) => {
    const sheet = sheets[name];
    if (!sheet) throw new Error(`folha de ${c.name} faltando: ${name}`);
    const cells = cellsOf(sheet, c, name);
    const want = c.spec.animations[name].frames;
    if (cells.length < want) throw new Error(`${name}: a folha de ${c.name} tem ${cells.length} quadros, esperava ${want}`);
    return cells.slice(0, want).map((cell) => place(cell, c, (c.shifts[name] ?? 0) + cellOf(c, name).dx, c.float?.includes(name) ? ground : undefined));
  });
}

/** O meio dos pés no parado: o meio das `rows` linhas de baixo. */
export function feetX(idle: Image, rows: number): number {
  const b = bounds(idle)!;
  const f = bounds(crop(idle, 0, b.y + b.h - rows, idle.width, rows))!;
  return f.x + f.w / 2;
}

/** O quadrado da cabeça: do alto do parado, centrado no que há nas `rows` linhas da cabeça, com um sétimo de folga (ou de lado `side`), `shift` pixels para a frente. */
export function headBox(idle: Image, rows: number, side?: number, shift = 0): Atlas['head'] {
  const b = bounds(idle)!;
  const h = bounds(crop(idle, 0, b.y, idle.width, rows))!;
  const pad = Math.round(rows / 7);
  const size = side ?? rows + pad;
  return { x: Math.round(h.x + h.w / 2 - size / 2) + shift, y: Math.max(0, b.y - Math.floor(pad / 2)), size };
}

/** A folha (no tamanho da arte) e o atlas (com `scale`) de um personagem de sete folhas. */
export function buildPack(sheets: Readonly<Record<string, Image>>, c: PackConfig): { sheets: Image[]; atlas: Atlas } {
  const problems = specProblems(c.spec);
  if (problems.length) throw new Error(`os tempos de ${c.name} não servem: ${problems.join('; ')}`);
  for (const [name, cell] of Object.entries(c.cells ?? {})) {
    if (c.padX + cell.dx + (c.shifts[name as AnimationName] ?? 0) < 0) throw new Error(`${name} de ${c.name}: a célula própria anda ${cell.dx} pixels e sai da tela; padX tem que ser pelo menos ${-cell.dx}`);
  }
  const rows = derive(sheets, c);
  const { sheet, atlas } = layout(rows, c.spec, { anchorX: feetX(rows[0][0], c.feetRows), head: (idle) => headBox(idle, c.headRows, c.headSize, c.headShift) });
  if (sheet.width > MAX_SHEET || sheet.height > MAX_SHEET) {
    throw new Error(`a folha de ${c.name} ficou com ${sheet.width}×${sheet.height} pixels, mais que ${MAX_SHEET}: o ataque alcança longe demais ou tem quadros demais para uma textura só`);
  }
  const face = c.face ? { face: { x: atlas.stand.x + c.face.x, y: atlas.stand.y + c.face.y, size: c.face.size } } : {};
  return { sheets: [sheet], atlas: { ...atlas, ...face, scale: c.worldScale } };
}
