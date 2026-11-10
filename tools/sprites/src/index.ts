/**
 * `bun run sprites`: roda as receitas sobre os pacotes em `assets-src/` (fora do git, ADR 0007) e escreve as folhas que o
 * jogo usa em `apps/web/public/sprites/` (`char-0.png` … `char-8.png`, uma por personagem) e os atlas em
 * `apps/web/src/lib/sprites/` (`hero.json`, `skeleton.json`, `kratos.json`, `vorcaro.json` e `characters.json`, que liga cada personagem ao seu).
 * Só a saída vai para o git; o CI e o Docker nunca precisam dos pacotes.
 * O telhado (objetos em grade de texto e a cidade ao fundo) não usa o pacote e sai primeiro, mesmo sem ele.
 *
 * Ordem: `rooftop.png` + `skyline-*.png` + `rooftop.json` (de `rooftop.ts` e `skyline.ts`); depois cada modelo de
 * `models` (`hero.ts`, `skeleton.ts`, `kratos.ts`, `vorcaro.ts`), com as folhas nos lugares que `characters.ts` dá a ele; `characters.json`;
 * `emotes-<língua>.png` e `emotes.json` (`emotes.ts`); e por fim apaga nomes antigos que não existem mais. É o único
 * arquivo que toca o disco (com `png.ts`); as receitas são puras. `bun run sprites:preview` (`preview.ts`) lê o que
 * sai daqui e amplia para conferir.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { emoteSheet, type EmoteLang } from './emotes';
import { characters } from './characters';
import { buildHero, ANIMATIONS } from './hero';
import { buildKratos } from './kratos';
import { buildVorcaro, SHEETS as VORCARO_SHEETS } from './vorcaro';
import { buildSkeleton, SHEETS as SKELETON_SHEETS } from './skeleton';
import { readGifStrip } from './gif';
import { rooftopSheet } from './rooftop';
import { SKYLINES, skyline } from './skyline';
import { readPng, writePng } from './png';

const root = resolve(import.meta.dir, '../../..');
/** as folhas do pacote da Ozzbit que o herói usa */
const HERO_SHEETS = [...new Set(ANIMATIONS.flatMap((a) => a.from))];
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

/**
 * Os modelos de personagem, cada um do seu pacote (fora do git). Sem um pacote, aquele modelo fica como está (as
 * folhas e o atlas já no git) e os outros saem assim mesmo; no fim, o comando diz o que faltou e sai com erro.
 *
 * Como mudar: um modelo novo é mais uma entrada aqui — `model` (o nome em `Model` de `characters.ts`, e do atlas
 * `<model>.json`), `pack` (a pasta em `assets-src/`), `how` (o que dizer quando falta), `files` (nome lógico → arquivo,
 * o que a receita recebe em `sheets[nome]`) e `build` (a receita: uma folha por variante, na ordem dos lugares do modelo
 * em `characters()`, e um atlas).
 */
const models = [
  {
    model: 'hero' as const,
    pack: join(root, 'assets-src/male_hero_free/individual_sheets'),
    how: 'Copie o "male_hero_free" da Ozzbit Games para assets-src/ (ver README).',
    files: HERO_SHEETS.map((n) => [n, `male_hero-${n}.png`] as const),
    build: buildHero,
  },
  {
    model: 'skeleton' as const,
    pack: join(root, 'assets-src/skeleton'),
    how: 'Copie as folhas do cavaleiro esqueleto (IDLE.png, WALK.png, ...) para assets-src/skeleton/ (ver README).',
    files: SKELETON_SHEETS.map((n) => [n, `${n}.png`] as const),
    build: buildSkeleton,
  },
  {
    model: 'kratos' as const,
    pack: join(root, 'assets-src/kratos'),
    how: 'Copie o kratos.gif (o giro de 8 quadros de 64×64) para assets-src/kratos/ (ver README).',
    files: [['ROTATION', 'kratos.gif'] as const],
    build: buildKratos,
  },
  {
    model: 'vorcaro' as const,
    pack: join(root, 'assets-src/vorcaro'),
    how: 'Copie as sete folhas do Vorcaro (idle.png, walk.png, ... de células de 256×384) para assets-src/vorcaro/ (ver README).',
    files: VORCARO_SHEETS.map((n) => [n, `${n}.png`] as const),
    build: buildVorcaro,
  },
];
/** lê uma folha do pacote: PNG, ou GIF como folha de uma linha (um quadro por célula) */
const readSheet = (path: string) => (path.endsWith('.gif') ? readGifStrip(path) : readPng(path));
const list = characters();
const missing: string[] = [];
for (const m of models) {
  const absent = m.files.filter(([, file]) => !existsSync(join(m.pack, file))).map(([, file]) => file);
  if (absent.length) {
    console.error(`${m.model}: pacote não encontrado em ${m.pack} (falta ${absent.join(', ')}).\n  ${m.how}\n  As folhas de ${m.model} ficam como estão.`);
    missing.push(m.model);
    continue;
  }
  const built = m.build(Object.fromEntries(m.files.map(([name, file]) => [name, readSheet(join(m.pack, file))])));
  const slots = list.flatMap((c, n) => (c.model === m.model ? [n] : []));
  slots.forEach((n, i) => writePng(join(out, `char-${n}.png`), built.sheets[i]));
  writeFileSync(join(atlasOut, `${m.model}.json`), JSON.stringify(built.atlas, null, 2) + '\n');
  console.log(`${m.model}: personagens ${slots.join(', ')}, folhas de ${built.sheets[0].width}×${built.sheets[0].height}, quadro ${built.atlas.frame.w}×${built.atlas.frame.h}`);
}
writeFileSync(join(atlasOut, 'characters.json'), JSON.stringify(list, null, 2) + '\n');

const langs: EmoteLang[] = ['pt-BR', 'en-US'];
let emoteAtlas = null;
for (const lang of langs) {
  const { sheet, atlas } = emoteSheet(lang);
  writePng(join(out, `emotes-${lang}.png`), sheet);
  emoteAtlas ??= atlas;
  console.log(`emotes ${lang}: ${sheet.width}×${sheet.height}`);
}
writeFileSync(join(atlasOut, 'emotes.json'), JSON.stringify(emoteAtlas, null, 2) + '\n');
// nomes de antes do esqueleto (os atlas moravam no `public`, as folhas eram `hero-N.png`): se ainda estão lá, saem
for (const stale of ['hero.json', 'emotes.json', ...Array.from({ length: 8 }, (_, n) => `hero-${n}.png`)]) rmSync(join(out, stale), { force: true });
if (missing.length) {
  console.error(`faltou o pacote de: ${missing.join(', ')}`);
  process.exitCode = 1;
}
