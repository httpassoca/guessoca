import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOVE_COOLDOWN_MS, SHOVE_MAX_MS } from '@guess/world';
import { ANIMATION_NAMES } from '../src/atlas';
import { blank, bounds, crop, palette, rgbOf, setPixel, type Image } from '../src/image';
import { MAX_FRAMES, NORMAL_ART_HEIGHT, NORMAL_HEIGHT, PACK_SPEC, PACK_WORLD_SCALE, buildPack, cellsOf, derive, packFiles, packSpec, place, specProblems, worldScaleFor, type PackConfig } from '../src/pack';
import { PACKS } from '../src/packs';
import { readPng } from '../src/png';

function fill(img: Image, x: number, y: number, w: number, h: number, hex: string) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(img, x + i, y + j, [...rgbOf(hex), 255]);
}

/** Um pacote de mentira: células de 40×60, o chão na linha 56, o correr 6 pixels atrás. */
const C: PackConfig = { name: 'Boneco', cellW: 40, cellH: 60, padX: 8, shifts: { run: 6 }, spec: PACK_SPEC, worldScale: 1 / 2, headRows: 14, feetRows: 2 };
const GROUND = 56;

/** Uma folha com `n` células: um boneco (cabeça, corpo, sapatos) com os pés `lift` pixels acima do chão. */
function sheet(n: number, lift = 0, c = C, ground = GROUND): Image {
  const img = blank(n * c.cellW, c.cellH);
  for (let i = 0; i < n; i++) {
    const x0 = i * c.cellW;
    fill(img, x0 + 16, 8 - lift, 10, 14, 'aa7744');
    fill(img, x0 + 12, 22 - lift, 16, ground - 26, '222244');
    fill(img, x0 + 12, ground - 4 - lift, 16, 4, '221111');
  }
  return img;
}
const pack = (lift = 0, c = C, ground = GROUND) => Object.fromEntries(ANIMATION_NAMES.map((name) => [name, sheet(c.spec.animations[name].frames, ['jump', 'fall', 'fall_loop'].includes(name) ? lift : 0, c, ground)]));
/** os tempos de uma spec na forma que `packSpec` recebe */
const timing = (s: typeof PACK_SPEC) => Object.fromEntries(ANIMATION_NAMES.map((n) => [n, [s.animations[n].frames, s.animations[n].fps] as const])) as Parameters<typeof packSpec>[0];
const floor = (img: Image) => { const b = bounds(img)!; return b.y + b.h; };
/** a mesma imagem com a cor zerada onde é transparente: só o que se vê */
const visible = (img: Image): Image => { const data = img.data.slice(); for (let i = 0; i < data.length; i += 4) if (!data[i + 3]) data[i] = data[i + 1] = data[i + 2] = 0; return { ...img, data }; };
/** só o retângulo com o boneco */
const tight = (img: Image) => { const b = bounds(img)!; return crop(img, b.x, b.y, b.w, b.h); };

describe('personagem de sete folhas', () => {
  test('as células saem como vieram, pixel por pixel', () => {
    const src = sheet(2);
    const cells = cellsOf(src, C);
    expect(cells).toHaveLength(2);
    expect(cells[1].data).toEqual(crop(src, C.cellW, 0, C.cellW, C.cellH).data);
  });

  test('cada quadro vai para a tela com o ponto mais baixo no chão, mesmo desenhado no ar, sem mudar a arte', () => {
    const [ground] = cellsOf(sheet(1), C), [air] = cellsOf(sheet(1, 7), C);
    expect(floor(place(ground, C))).toBe(C.cellH);
    expect(floor(place(air, C))).toBe(C.cellH);
    expect(bounds(place(ground, C))!.x).toBe(C.padX + 12);
    expect(bounds(place(ground, C, 6))!.x).toBe(C.padX + 12 + 6);
    expect(tight(place(air, C, 6)).data).toEqual(tight(air).data);
    expect(palette(place(ground, C))).toEqual(palette(ground));
  });

  test('o pedido da arte: os quadros e o fps do herói, e o empurrão cabe no tempo do mundo', () => {
    const rows = derive(pack(), C);
    ANIMATION_NAMES.forEach((name, i) => expect(rows[i]).toHaveLength(PACK_SPEC.animations[name].frames));
    expect(ANIMATION_NAMES.map((n) => [PACK_SPEC.animations[n].frames, PACK_SPEC.animations[n].fps])).toEqual([[10, 10], [10, 12], [10, 14], [6, 12], [4, 12], [3, 10], [7, 16]]);
    const s = PACK_SPEC.animations.shove;
    expect((s.frames / s.fps) * 1000).toBeLessThanOrEqual(SHOVE_COOLDOWN_MS);
    expect(PACK_SPEC.credit).toBeNull();
  });

  test('todo quadro de toda animação tem o pé na mesma linha; só a animação com `shifts` anda para a frente', () => {
    const rows = derive(pack(7), C);
    for (const f of rows.flat()) expect(floor(f)).toBe(C.cellH);
    const x = (name: (typeof ANIMATION_NAMES)[number]) => bounds(rows[ANIMATION_NAMES.indexOf(name)][0])!.x;
    expect(x('run') - x('idle')).toBe(6);
    expect(x('walk')).toBe(x('idle'));
  });

  test('monta uma folha só, no tamanho da arte, com a escala do mundo no atlas', () => {
    const { sheets, atlas } = buildPack(pack(), C);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].height).toBe(ANIMATION_NAMES.length * atlas.frame.h);
    expect(atlas.scale).toBe(1 / 2);
    expect(atlas.stand).toMatchObject({ w: 16, h: GROUND - 8 });
    expect(atlas.stand.y + atlas.stand.h).toBe(atlas.anchor.y);
    expect(atlas.anchor.x).toBe(atlas.stand.x + atlas.stand.w / 2);
    expect(atlas.head.y).toBeLessThanOrEqual(atlas.stand.y);
    expect(atlas.head.size).toBe(16);
    expect(atlas.head.x + atlas.head.size / 2).toBe(atlas.stand.x + (16 - 12 + 5));
    // o primeiro quadro do parado, na folha, é a arte: os mesmos pixels do boneco da célula
    const first = crop(sheets[0], atlas.stand.x, atlas.stand.y, atlas.stand.w, atlas.stand.h);
    expect(first.data).toEqual(tight(cellsOf(sheet(1), C)[0]).data);
  });

  test('um bicho de quatro patas pode ter o quadrado do rosto maior que as linhas só de cabeça', () => {
    const { atlas } = buildPack(pack(), { ...C, headSize: 24 });
    expect(atlas.head.size).toBe(24);
    // o rosto pode ter um quadrado só dele, medido a partir do canto do boneco
    const withFace = buildPack(pack(), { ...C, face: { x: 3, y: 5, size: 10 } }).atlas;
    expect(withFace.face).toEqual({ x: withFace.stand.x + 3, y: withFace.stand.y + 5, size: 10 });
    expect(atlas.face).toBeUndefined();
    // e o rosto pode andar para a frente, quando o cabelo voa para trás
    expect(buildPack(pack(), { ...C, headSize: 24, headShift: 5 }).atlas.head.x).toBe(atlas.head.x + 5);
    expect(atlas.head.x + 12).toBe(atlas.stand.x + (16 - 12 + 5));
  });

  test('o tamanho: um adulto tem 50 no jogo e 128 pixels na arte, e os outros se medem por ele', () => {
    expect([NORMAL_HEIGHT, NORMAL_ART_HEIGHT]).toEqual([50, 128]);
    expect(PACK_WORLD_SCALE).toBe(50 / 128);
    expect(worldScaleFor(1, 128)).toBe(PACK_WORLD_SCALE);
    // um cachorro na altura do joelho (0,3), desenhado na densidade do pedido (0,3 × 128 ≈ 38 pixels): a mesma escala
    expect(worldScaleFor(0.3, 0.3 * 128)).toBeCloseTo(PACK_WORLD_SCALE);
    // um pacote fora da densidade: um adulto desenhado com 140 pixels fica com 50 no jogo
    expect(worldScaleFor(1, 140) * 140).toBeCloseTo(50);
    // o pedido de personagem diz os mesmos números
    const prompt = readFileSync(join(import.meta.dir, '../../../apps/web/src/lib/system/character-prompt.txt'), 'utf8');
    expect(prompt).toContain(`exactly ${NORMAL_ART_HEIGHT} pixels`);
    expect(prompt).toContain('"size"');
    expect(prompt).toContain('"standing_height_px"');
    expect(prompt).toContain('FOUR alternative designs');
    // e os mesmos limites de quadros e de fps
    expect(prompt).toContain(`at most ${MAX_FRAMES} for the attack`);
    expect(prompt).toContain('any value up to 60');
    expect(prompt).toContain('attack.png        18');
    // o ataque dura de 0,7 s ao teto do jogo
    expect(prompt).toContain(`0.7-${SHOVE_MAX_MS / 1000} s`);
    expect(prompt).toContain(`must fit in ${SHOVE_MAX_MS / 1000} s`);
  });

  test('um pacote pode escolher os próprios quadros: o empurrão cabe no tempo do jogo e a queda dura o tempo dela', () => {
    // 12 quadros de ataque em 0,45 s; 5 de queda em 0,33 s; um andar mais liso
    const spec = packSpec({ idle: [12, 10], walk: [12, 14], run: [10, 16], jump: [7, 16], fall: [5, 15], fall_loop: [4, 10], shove: [12, 27] });
    expect(specProblems(spec)).toEqual([]);
    expect(spec.animations.walk).toEqual({ frames: 12, fps: 14, loop: true });
    expect(spec.animations.shove.loop).toBe(false);
    expect(specProblems(PACK_SPEC)).toEqual([]);

    expect(specProblems(packSpec({ ...timing(spec), shove: [24, 24 / 0.9] }))).toEqual([]); // 0,9 s: um ataque lento vale
    const slow = packSpec({ ...timing(spec), shove: [12, 8] }); // 1,5 s: o jogo cortaria no meio
    expect(specProblems(slow)).toEqual(['shove: dura 1500 ms, e o jogo corta em 1200 ms']);
    const long = packSpec({ ...timing(spec), fall: [8, 12] });
    expect(specProblems(long)[0]).toContain('fall: dura 667 ms');
    const many = packSpec({ ...timing(spec), idle: [MAX_FRAMES + 1, 10], run: [10, 61] });
    expect(specProblems(many)).toHaveLength(2);
    // e a receita recusa montar com tempos que não servem
    expect(() => buildPack(pack(), { ...C, spec: slow })).toThrow(/Boneco.*shove.*1500 ms/);
    // com os quadros escolhidos, a folha tem uma linha de cada tamanho
    const c = { ...C, spec };
    const { atlas } = buildPack(pack(0, c), c);
    expect(atlas.animations.shove).toMatchObject({ frames: 12, fps: 27 });
  });

  test('o ataque pode ter uma célula própria, maior: os pés ficam no mesmo lugar e o quadro cresce para caber', () => {
    // o pedido novo: pelo menos 18 quadros de ataque (40 fps em 0,45 s), numa célula de 100×80 em vez de 40×60
    const spec = packSpec({ idle: [8, 8], walk: [8, 10], run: [8, 14], jump: [8, 20], fall: [8, 24], fall_loop: [8, 16], shove: [18, 40] });
    expect(specProblems(spec)).toEqual([]);
    // na célula maior o boneco fica 20 pixels mais à direita e 20 mais abaixo; o braço estica 40 pixels no quadro 9
    const wide = blank(18 * 100, 80);
    for (let i = 0; i < 18; i++) {
      fill(wide, i * 100 + 36, 28, 10, 14, 'aa7744');
      fill(wide, i * 100 + 32, 42, 16, 30, '222244');
      fill(wide, i * 100 + 32, 72, 16, 4, '221111');
      if (i === 9) fill(wide, i * 100 + 48, 50, 40, 4, 'eeeeee');
    }
    const c: PackConfig = { ...C, padX: 20, spec, cells: { shove: { cellW: 100, cellH: 80, dx: -20 } } };
    const sheets = { ...pack(0, c), shove: wide };
    const rows = derive(sheets, c);
    const idle = bounds(rows[0][0])!, first = bounds(rows[6][0])!, reach = bounds(rows[6][9])!;
    expect([first.x, first.y + first.h]).toEqual([idle.x, idle.y + idle.h]); // os pés do ataque onde estão os do parado
    expect(reach.x + reach.w).toBe(idle.x + idle.w + 40);
    const { sheets: [out], atlas } = buildPack(sheets, c);
    expect(atlas.animations.shove).toMatchObject({ frames: 18, fps: 40, loop: false });
    expect(atlas.frame.w).toBe(16 + 40); // o boneco e o alcance do braço
    expect(atlas.anchor.x).toBe(atlas.stand.x + 8);
    expect(out.width).toBe(18 * atlas.frame.w);
    // sem folga para andar a célula maior, a receita diz o que falta
    expect(() => buildPack(sheets, { ...c, padX: 8 })).toThrow(/shove.*padX.*20/);
  });

  test('quem paira fica na altura em que a arte o pôs; os outros descem até encostar no chão', () => {
    // um pacote em que o andar veio 5 pixels acima do chão
    const sheets = { ...pack(), walk: sheet(C.spec.animations.walk.frames, 5) };
    const down = derive(sheets, C), up = derive(sheets, { ...C, float: ['walk'] });
    const bottom = (rows: Image[][], i: number) => { const b = bounds(rows[i][0])!; return b.y + b.h; };
    expect(bottom(down, 1)).toBe(C.cellH);
    expect(bottom(up, 1)).toBe(C.cellH - 5);
    expect(bottom(up, 0)).toBe(C.cellH); // o parado continua no chão
  });

  test('uma animação pode vir de outra folha do pacote', () => {
    const files = packFiles(() => true, { fall: 'fall_loop.png' });
    expect(files[4]).toEqual(['fall', 'fall_loop.png']);
    expect(files[5]).toEqual(['fall_loop', 'fall_loop.png']);
  });

  test('o empurrão do jogo vem de attack.png se o pacote tiver, senão de shove.png', () => {
    const old = packFiles((f) => f !== 'attack.png');
    expect(old.map(([, file]) => file)).toEqual(['idle.png', 'walk.png', 'run.png', 'jump.png', 'fall.png', 'fall_loop.png', 'shove.png']);
    const now = packFiles(() => true);
    expect(now[6]).toEqual(['shove', 'attack.png']);
    expect(now.slice(0, 6)).toEqual(old.slice(0, 6));
  });

  test('sem uma folha, ou com uma folha curta, erro dizendo o que falta e de quem', () => {
    const { walk: _, ...rest } = pack();
    expect(() => buildPack(rest, C)).toThrow(/Boneco.*walk/);
    expect(() => buildPack({ ...pack(), run: sheet(3) }, C)).toThrow(/run.*Boneco.*3 quadros/);
  });
});

// a arte de verdade de cada um: só com o pacote em assets-src/ (no CI não há; nada é lido do disco sem ele)
for (const p of PACKS) {
  const dir = join(import.meta.dir, '../../../assets-src', p.dir);
  describe.skipIf(!existsSync(join(dir, 'idle.png')))(`${p.config.name}: a arte de verdade`, () => {
    test('as folhas têm as células e os quadros do registro, e a folha gerada é a arte', () => {
      const c = p.config;
      const sheets: Record<string, Image> = {};
      for (const [name, file] of packFiles((f) => existsSync(join(dir, f)), c.files)) {
        const s = readPng(join(dir, file));
        const cell = c.cells?.[name] ?? c;
        expect(s.height).toBe(cell.cellH);
        expect(s.width / cell.cellW).toBeGreaterThanOrEqual(c.spec.animations[name].frames);
        sheets[name] = s;
      }
      const idle = cellsOf(sheets.idle, c)[0];
      const { sheets: [out], atlas } = buildPack(sheets, c);
      expect(atlas.stand.h).toBe(bounds(idle)!.h);
      expect(atlas.scale).toBe(c.worldScale);
      // os pixels visíveis são os da arte (a cor que a arte guarda por baixo de um pixel transparente não conta)
      expect(visible(crop(out, atlas.stand.x, atlas.stand.y, atlas.stand.w, atlas.stand.h)).data).toEqual(visible(tight(idle)).data);
      // todas as cores das folhas usadas estão na folha gerada, e nenhuma a mais
      const art = new Set(Object.values(sheets).flatMap((s) => [...palette(s)]));
      expect(palette(out)).toEqual(art);
    });
  });
}
