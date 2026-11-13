/**
 * O que os dois modelos de personagem (o herói e o esqueleto) têm em comum: as animações que o jogo usa, na ordem das
 * linhas da folha, e a montagem da folha e do atlas a partir dos quadros de cada animação. Puro, sem disco.
 *
 * Entra: os quadros de cada animação ainda na coordenada da célula do pacote (128×128 no herói, 170×125 no esqueleto),
 * todos do mesmo tamanho e com o personagem no mesmo lugar (o pé no mesmo ponto em todos). Sai: a folha (`char-N.png`,
 * uma linha por animação, um quadro por coluna, todos `frame.w × frame.h`) e o `Atlas` (`hero.json`, `skeleton.json`),
 * que o cliente lê em `apps/web/src/lib/sprites/characters.ts` (o mesmo formato, copiado lá como tipo).
 *
 * Pixels do quadro: depois do recorte, `(0, 0)` é o canto de cima à esquerda do quadro, `y` para baixo. O personagem é
 * desenhado no mundo pela âncora (o ponto entre os pés), olhando para a direita; o cliente espelha em x para a esquerda.
 * 1 pixel do quadro = 1 unidade do mundo (antes da escala inteira da tela).
 */
import { blank, blit, bounds, crop, type Image } from './image';

/**
 * As animações do jogo, na ordem das linhas da folha (o mundo, `@guess/world`, escolhe entre elas em `animate`): `idle`
 * parado; `walk` andando (setas/WASD); `run` correndo (Shift, acima de `WALK`); `jump` subindo (`vy > 0`); `fall`
 * descendo, toca uma vez e vira `fall_loop` depois de `FALL_MS` no mundo; `fall_loop` caindo, em loop; `shove` o
 * empurrão (J), enquanto dura `SHOVE_COOLDOWN_MS` (450 ms). Os nomes são o tipo `Anim` do `@guess/world`.
 */
export const ANIMATION_NAMES = ['idle', 'walk', 'run', 'jump', 'fall', 'fall_loop', 'shove'] as const;
/** Uma das sete animações. */
export type AnimationName = (typeof ANIMATION_NAMES)[number];

/** Um retângulo em pixels (de quadro ou de célula, conforme quem usa). */
export interface Box { x: number; y: number; w: number; h: number }

/** O atlas de um modelo, em pixels do quadro (tudo relativo ao canto do quadro, nunca da folha). */
export interface Atlas {
  /** tamanho de cada quadro na folha: o menor retângulo que cabe todos os quadros de todas as animações */
  frame: { w: number; h: number };
  /** o ponto do quadro que fica no chão, entre os pés (o personagem é desenhado a partir dele); `y` é a linha de baixo do parado */
  anchor: { x: number; y: number };
  /**
   * um quadrado em volta da cabeça no primeiro quadro do parado: o rosto do personagem na interface (`Swatch.svelte`), e
   * `anchor.y − head.y` é a altura do post-it sobre a cabeça (`headY` em `apps/web/src/lib/world/view.ts`), por modelo
   */
  head: { x: number; y: number; size: number };
  /** o retângulo do primeiro quadro do parado: o personagem inteiro na interface, sem o espaço do golpe e do pulo */
  stand: Box;
  /**
   * cada animação: `frames` quadros, `fps`, e se dá a volta. Saindo de `layout`, `row` é a linha da folha única (0 =
   * idle); depois de `paginate`, `page` é a folha (a página) e `row` a linha dela em que a animação começa
   */
  animations: Record<AnimationName, { row: number; frames: number; fps: number; loop: boolean; page?: number }>;
  /**
   * as folhas em que os quadros estão (depois de `paginate`): `w × h` pixels, `cols` quadros por linha. A página 0 é só o
   * parado, numa linha; as outras têm as outras animações, cada uma começando numa linha nova e quebrando em `cols`
   */
  pages?: Page[];
  /** a quem dar o crédito da arte, ou null se não precisa */
  credit: string | null;
  /**
   * o quadrado do rosto na interface (`Swatch.svelte`), quando não é o de `head`: num personagem com um companheiro mais
   * alto ao lado, `head` marca o alto do conjunto (a altura do post-it) e o rosto de quem joga fica mais abaixo
   */
  face?: { x: number; y: number; size: number };
  /**
   * quantas unidades do mundo vale um pixel do quadro; sem isto, 1 (pixel art no tamanho do jogo). Menor que 1 é arte
   * grande que o jogo desenha encolhida, sem a receita mexer nos pixels (o Vorcaro)
   */
  scale?: number;
}

/** Uma página do atlas: o tamanho da folha em pixels e quantos quadros cabem numa linha. */
export interface Page { w: number; h: number; cols: number }

/**
 * O maior lado de uma folha gerada, em pixels: 8192, o que toda placa de vídeo de computador aceita como textura, e o
 * limite do WebGL por software (SwiftShader). Uma folha maior que o limite da placa não sobe para a GPU, e o Pixi, que
 * desenha o telhado inteiro de uma vez, pinta de preto tudo o que estava no mesmo lote. Por isso as folhas são paginadas
 * (`paginate`) em vez de crescerem.
 */
export const MAX_SHEET = 8192;

/**
 * O que cada modelo decide: quantos quadros, a que velocidade, se dá a volta, e o crédito. `layout` confere os quadros
 * contra `frames`. O empurrão tem que caber em `SHOVE_COOLDOWN_MS` (frames / fps ≤ 450 ms), senão é cortado no meio.
 */
export interface ModelSpec {
  animations: Record<AnimationName, { frames: number; fps: number; loop: boolean }>;
  credit: string | null;
}

/**
 * Monta a folha: `rows[i]` são os quadros da animação `ANIMATION_NAMES[i]`, todos do mesmo tamanho. Todos são
 * recortados pelo mesmo retângulo, o menor que contém todos, então o personagem não pula entre animações. A âncora fica
 * em `anchorX` (na coordenada dos quadros de entrada) e na linha de baixo do primeiro quadro do parado; `head` acha a
 * cabeça no parado já recortado.
 *
 * O quadro cresce com a pose mais larga ou mais alta de todas (a espada do golpe, a capa da queda): todas as animações
 * pagam por ela em espaço vazio. Uma pose de preparação comprida demais é melhor aparada na receita do que deixada aqui.
 */
export function layout(
  rows: readonly (readonly Image[])[],
  spec: ModelSpec,
  opts: { anchorX: number; head: (idle: Image) => Atlas['head'] },
): { sheet: Image; atlas: Atlas } {
  ANIMATION_NAMES.forEach((name, i) => {
    if (rows[i]?.length !== spec.animations[name].frames) throw new Error(`${name}: ${rows[i]?.length ?? 0} quadros, esperava ${spec.animations[name].frames}`);
  });
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  for (const f of rows.flat()) {
    const b = bounds(f);
    if (!b) continue;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  }
  const w = maxX - minX, h = maxY - minY;
  const idle = bounds(rows[0][0])!;
  const anchor = { x: Math.round(opts.anchorX) - minX, y: idle.y + idle.h - minY };

  const cols = Math.max(...rows.map((r) => r.length));
  const sheet = blank(cols * w, rows.length * h);
  rows.forEach((frames, row) => frames.forEach((f, col) => blit(sheet, crop(f, minX, minY, w, h), col * w, row * h)));

  const atlas: Atlas = {
    frame: { w, h },
    anchor,
    head: opts.head(crop(rows[0][0], minX, minY, w, h)),
    stand: { x: idle.x - minX, y: idle.y - minY, w: idle.w, h: idle.h },
    animations: Object.fromEntries(ANIMATION_NAMES.map((name, row) => [name, { row, ...spec.animations[name] }])) as Atlas['animations'],
    credit: spec.credit,
  };
  return { sheet, atlas };
}

/**
 * Corta a folha de `layout` (uma linha por animação, tão larga quanto a animação mais comprida) em **páginas** de até
 * `max` pixels de lado, mudando só quadros inteiros de lugar (nenhum pixel muda):
 *
 * - a página 0 é **só o parado**, numa linha: é o que o seletor de personagem, o palco do pré-lobby e o rosto da
 *   interface mostram, e o que o telhado carrega primeiro; pequena para decodificar;
 * - as outras animações vão para a página 1 (e 2, 3… se não couberem numa), cada uma começando numa linha nova e
 *   quebrando em `cols` quadros por linha. `cols` é o que deixa a página mais perto de quadrada (o menor lado maior),
 *   e, empatando, a de menos área: uma folha quadrada cabe no limite e não gasta memória com a linha mais comprida.
 *
 * Joga erro se um parado não cabe numa linha, ou se uma animação sozinha não cabe numa página.
 */
export function paginate(sheet: Image, atlas: Atlas, max = MAX_SHEET): { pages: Image[]; atlas: Atlas } {
  const { w, h } = atlas.frame;
  if (w > max || h > max) throw new Error(`o quadro tem ${w}×${h} pixels, mais que ${max}`);
  const idle = atlas.animations.idle;
  if (idle.frames * w > max) throw new Error(`o parado tem ${idle.frames} quadros de ${w} pixels: ${idle.frames * w}, mais que ${max} numa linha`);
  // as páginas das outras animações: enche uma enquanto o arranjo couber em `max`, depois abre outra
  const plan = (names: readonly AnimationName[]) => {
    let best: { cols: number; side: number; area: number } | null = null;
    const most = Math.max(...names.map((n) => atlas.animations[n].frames));
    for (let cols = 1; cols <= most && cols * w <= max; cols++) {
      const lines = names.reduce((s, n) => s + Math.ceil(atlas.animations[n].frames / cols), 0);
      if (lines * h > max) continue;
      const side = Math.max(cols * w, lines * h), area = cols * w * lines * h;
      if (!best || side < best.side || (side === best.side && area < best.area)) best = { cols, side, area };
    }
    return best;
  };
  const groups: AnimationName[][] = [];
  for (const name of ANIMATION_NAMES.slice(1)) {
    const last = groups.at(-1);
    if (last && plan([...last, name])) last.push(name);
    else if (plan([name])) groups.push([name]);
    else throw new Error(`a animação ${name} (${atlas.animations[name].frames} quadros de ${w}×${h}) não cabe numa folha de ${max}×${max}`);
  }
  const pages: Page[] = [{ w: idle.frames * w, h, cols: idle.frames }];
  const animations = { ...atlas.animations, idle: { ...idle, row: 0, page: 0 } } as Atlas['animations'];
  for (const group of groups) {
    const { cols } = plan(group)!;
    let row = 0;
    for (const name of group) {
      animations[name] = { ...atlas.animations[name], row, page: pages.length };
      row += Math.ceil(atlas.animations[name].frames / cols);
    }
    pages.push({ w: cols * w, h: row * h, cols });
  }
  const images = pages.map((p) => blank(p.w, p.h));
  for (const name of ANIMATION_NAMES) {
    const from = atlas.animations[name], to = animations[name], cols = pages[to.page!].cols;
    for (let i = 0; i < from.frames; i++) {
      blit(images[to.page!], crop(sheet, i * w, from.row * h, w, h), (i % cols) * w, (to.row + Math.floor(i / cols)) * h);
    }
  }
  return { pages: images, atlas: { ...atlas, animations, pages } };
}

/** O canto do quadro `i` da animação `name` numa atlas paginada: a página e a posição nela, em pixels da folha. */
export function cellOf(atlas: Atlas, name: AnimationName, i: number): { page: number; x: number; y: number } {
  const a = atlas.animations[name], page = a.page ?? 0, cols = atlas.pages?.[page]?.cols ?? Infinity;
  return { page, x: (i % cols) * atlas.frame.w, y: (a.row + Math.floor(i / cols)) * atlas.frame.h };
}
