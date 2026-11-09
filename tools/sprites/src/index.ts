/**
 * `bun run sprites`: roda as receitas sobre o pacote em `assets-src/` (fora do git, ADR 0007) e escreve as folhas que o
 * jogo usa em `apps/web/public/sprites/`. Só a saída vai para o git; o CI e o Docker nunca precisam do pacote.
 * O telhado (objetos em grade de texto e a cidade ao fundo) não usa o pacote e sai primeiro, mesmo sem ele.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { emoteSheet, type EmoteLang } from './emotes';
import { buildHero } from './hero';
import { rooftopSheet } from './rooftop';
import { SKYLINES, skyline } from './skyline';
import { readPng, writePng } from './png';

const root = resolve(import.meta.dir, '../../..');
const pack = join(root, 'assets-src/male_hero_free/individual_sheets');
/** as folhas vão para o `public` (servidas como arquivo); os atlas para o código do cliente, que os importa */
const out = join(root, 'apps/web/public/sprites');
const atlasOut = join(root, 'apps/web/src/lib/sprites');

mkdirSync(atlasOut, { recursive: true });
const rooftop = rooftopSheet();
writePng(join(out, 'rooftop.png'), rooftop.sheet);
const skylines = SKYLINES.map((s) => {
  const img = skyline(s);
  writePng(join(out, `${s.name}.png`), img);
  return { name: s.name, layer: s.layer, file: `${s.name}.png`, w: img.width, h: img.height };
});
writeFileSync(join(atlasOut, 'rooftop.json'), JSON.stringify({ ...rooftop.atlas, skylines }, null, 2) + '\n');
console.log(`telhado: ${Object.keys(rooftop.atlas.frames).length} objetos em ${rooftop.sheet.width}×${rooftop.sheet.height}; cidade: ${skylines.map((s) => `${s.w}×${s.h}`).join(', ')}`);

if (!existsSync(pack)) {
  console.error(`Pacote não encontrado em ${pack}.\nCopie o "male_hero_free" da Ozzbit Games para assets-src/ (ver README).`);
  process.exit(1);
}

const names = ['idle', 'walk', 'run', 'jump', 'fall', 'fall_loop', 'combo_1', 'combo_1_end'];
const sheets = Object.fromEntries(names.map((n) => [n, readPng(join(pack, `male_hero-${n}.png`))]));
const hero = buildHero(sheets);
hero.sheets.forEach((img, i) => writePng(join(out, `hero-${i}.png`), img));
writeFileSync(join(atlasOut, 'hero.json'), JSON.stringify(hero.atlas, null, 2) + '\n');
console.log(`personagens: ${hero.sheets.length} folhas de ${hero.sheets[0].width}×${hero.sheets[0].height}, quadro ${hero.atlas.frame.w}×${hero.atlas.frame.h}`);

const langs: EmoteLang[] = ['pt-BR', 'en-US'];
let emoteAtlas = null;
for (const lang of langs) {
  const { sheet, atlas } = emoteSheet(lang);
  writePng(join(out, `emotes-${lang}.png`), sheet);
  emoteAtlas ??= atlas;
  console.log(`emotes ${lang}: ${sheet.width}×${sheet.height}`);
}
writeFileSync(join(atlasOut, 'emotes.json'), JSON.stringify(emoteAtlas, null, 2) + '\n');
for (const stale of ['hero.json', 'emotes.json']) rmSync(join(out, stale), { force: true });
