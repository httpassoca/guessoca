import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blank, setPixel } from '../src/image';
import { readSheet, writeSheet } from '../src/png';

describe('webp sem perda', () => {
  test('uma folha gravada em .webp volta com os mesmos pixels, e menor que em .png', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gs-webp-'));
    try {
      // um degradê com muitas cores (como a arte grande) e uma parte transparente
      const img = blank(96, 64);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) setPixel(img, x, y, [(x * 4 + y) & 255, (y * 3 + x * x) & 255, (x * y) & 255, 255]);
      await writeSheet(join(dir, 'a.webp'), img);
      await writeSheet(join(dir, 'a.png'), img);
      const back = await readSheet(join(dir, 'a.webp'));
      expect([back.width, back.height]).toEqual([96, 64]);
      expect(back.data).toEqual(img.data);
      expect((await readSheet(join(dir, 'a.png'))).data).toEqual(img.data);
      expect(statSync(join(dir, 'a.webp')).size).toBeLessThan(statSync(join(dir, 'a.png')).size);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
