import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SHOVE_COOLDOWN_MS } from '@guess/world';
import { ANIMATION_NAMES } from '../src/atlas';
import { blank, bounds, crop, palette, rgbOf, setPixel, type Image } from '../src/image';
import { BOLSONARO, buildBolsonaro } from '../src/bolsonaro';
import { EVE, buildEve } from '../src/eve';
import { KNIGHT, buildKnight } from '../src/knight';
import { KRATOS, buildKratos } from '../src/kratos';
import { OLDSNAKE, buildOldSnake } from '../src/oldsnake';
import { ORELHA, buildOrelha } from '../src/orelha';
import { PINOCCHIO, buildPinocchio } from '../src/pinocchio';
import { PACK_SPEC, buildPack, cellsOf, derive, packFiles, place, type PackConfig } from '../src/pack';
import { readPng } from '../src/png';
import { VORCARO, buildVorcaro } from '../src/vorcaro';

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
    expect(atlas.head.x + 12).toBe(atlas.stand.x + (16 - 12 + 5));
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
for (const who of [
  { c: KRATOS, dir: 'kratos', build: buildKratos, ground: 145, height: 121, world: 61 },
  { c: VORCARO, dir: 'vorcaro', build: buildVorcaro, ground: 352, height: 302, world: 50 },
  { c: ORELHA, dir: 'orelha', build: buildOrelha, ground: 109, height: 100, world: 30 },
  { c: BOLSONARO, dir: 'bolsonaro', build: buildBolsonaro, ground: 177, height: 150, world: 45 },
  { c: KNIGHT, dir: 'knight', build: buildKnight, ground: 87, height: 63, world: 35 },
  { c: OLDSNAKE, dir: 'oldsnake', build: buildOldSnake, ground: 116, height: 97, world: 49 },
  { c: PINOCCHIO, dir: 'pinocchio', build: buildPinocchio, ground: 113, height: 106, world: 50 },
  { c: EVE, dir: 'eve', build: buildEve, ground: 177, height: 140, world: 50 },
]) {
  const dir = join(import.meta.dir, '../../../assets-src', who.dir);
  describe.skipIf(!existsSync(join(dir, 'idle.png')))(`${who.c.name}: a arte de verdade`, () => {
    test('as folhas têm as células e os quadros do pedido, o parado pisa na linha do chão, e a folha gerada é a arte', () => {
      const sheets: Record<string, Image> = {};
      for (const [name, file] of packFiles((f) => existsSync(join(dir, f)))) {
        const s = readPng(join(dir, file));
        expect(s.height).toBe(who.c.cellH);
        expect(s.width / who.c.cellW).toBe(who.c.spec.animations[name].frames);
        sheets[name] = s;
      }
      const idle = cellsOf(sheets.idle, who.c)[0];
      expect(floor(idle)).toBe(who.ground);
      const { sheets: [out], atlas } = who.build(sheets);
      expect(atlas.stand.h).toBe(who.height);
      expect(Math.round(atlas.stand.h * atlas.scale!)).toBe(who.world);
      // os pixels visíveis são os da arte (a cor que a arte guarda por baixo de um pixel transparente não conta)
      expect(visible(crop(out, atlas.stand.x, atlas.stand.y, atlas.stand.w, atlas.stand.h)).data).toEqual(visible(tight(idle)).data);
      // todas as cores da arte estão na folha, e nenhuma a mais
      const art = new Set(ANIMATION_NAMES.flatMap((n) => [...palette(sheets[n])]));
      expect(palette(out)).toEqual(art);
    });
  });
}
