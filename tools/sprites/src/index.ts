/**
 * `bun run sprites`: roda as receitas sobre os pacotes em `assets-src/` (fora do git, ADR 0007) e escreve as folhas que o
 * jogo usa em `apps/web/public/sprites/` (`char-N.png`, ou `char-N.webp` para a arte grande do Kratos e do Vorcaro, uma por personagem) e os atlas em
 * `apps/web/src/lib/sprites/` (`hero.json`, `skeleton.json`, `kratos.json`, `vorcaro.json`, `orelha.json`, `bolsonaro.json`, `knight.json`, `oldsnake.json`, `pinocchio.json`, `eve.json`, `katarina.json`, `punisher.json`, `mista.json` e `characters.json`, que liga cada personagem ao seu).
 * Só a saída vai para o git; o CI e o Docker nunca precisam dos pacotes.
 * O telhado (objetos em grade de texto e a cidade ao fundo) não usa o pacote e sai primeiro, mesmo sem ele.
 *
 * Ordem: `rooftop.png` + `skyline-*.png` + `rooftop.json` (de `rooftop.ts` e `skyline.ts`); depois cada modelo de
 * `models` (`hero.ts`, `skeleton.ts`, e `kratos.ts`, `vorcaro.ts`, `orelha.ts`, `bolsonaro.ts`, `knight.ts`, `oldsnake.ts`, `pinocchio.ts`, `eve.ts`, `katarina.ts`, `punisher.ts` e `mista.ts`, os de sete folhas de `pack.ts`), com as folhas nos lugares que `characters.ts` dá a ele; `characters.json`;
 * `emotes-<língua>.png` e `emotes.json` (`emotes.ts`); e por fim apaga nomes antigos que não existem mais. É o único
 * arquivo que toca o disco (com `png.ts`); as receitas são puras. `bun run sprites:preview` (`preview.ts`) lê o que
 * sai daqui e amplia para conferir.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { emoteSheet, type EmoteLang } from './emotes';
import { characters } from './characters';
import { buildHero, ANIMATIONS } from './hero';
import type { Atlas } from './atlas';
import type { Image } from './image';
import { buildPack, packFiles } from './pack';
import { PACKS } from './packs';
import { buildSkeleton, SHEETS as SKELETON_SHEETS } from './skeleton';
import { ROOFTOP_RECIPES } from './life';
import { rooftopSheet } from './rooftop';
import { SKYLINES, skyline, twinkles, type WindowSpot } from './skyline';
import { readPng, writePng, writeSheet } from './png';

const root = resolve(import.meta.dir, '../../..');
/** as folhas do pacote da Ozzbit que o herói usa */
const HERO_SHEETS = [...new Set(ANIMATIONS.flatMap((a) => a.from))];
/** as folhas vão para o `public` (servidas como arquivo); os atlas para o código do cliente, que os importa */
const out = join(root, 'apps/web/public/sprites');
const atlasOut = join(root, 'apps/web/src/lib/sprites');

mkdirSync(atlasOut, { recursive: true });
const rooftop = rooftopSheet(256, ROOFTOP_RECIPES);
writePng(join(out, 'rooftop.png'), rooftop.sheet);
const skylines = SKYLINES.map((s) => {
  const spots: WindowSpot[] = [];
  const img = skyline(s, spots);
  writePng(join(out, `${s.name}.png`), img);
  // as janelas que piscam no cliente (`world/skylife.ts`): umas poucas por ladrilho
  const twinkle = twinkles(spots, s.seed, s.layer === 'far' ? 14 : 8).map(({ x, y, w, h, lit, on, off }) => ({ x, y, w, h, lit, on, off }));
  return { name: s.name, layer: s.layer, file: `${s.name}.png`, w: img.width, h: img.height, twinkle };
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
const models: { model: string; pack: string; how: string; files: (readonly [string, string])[]; build: (sheets: Readonly<Record<string, Image>>) => { sheets: Image[]; atlas: Atlas } }[] = [
  {
    model: 'hero',
    pack: join(root, 'assets-src/male_hero_free/individual_sheets'),
    how: 'Copie o "male_hero_free" da Ozzbit Games para assets-src/ (ver README).',
    files: HERO_SHEETS.map((n) => [n, `male_hero-${n}.png`] as const),
    build: buildHero,
  },
  {
    model: 'skeleton',
    pack: join(root, 'assets-src/skeleton'),
    how: 'Copie as folhas do cavaleiro esqueleto (IDLE.png, WALK.png, ...) para assets-src/skeleton/ (ver README).',
    files: SKELETON_SHEETS.map((n) => [n, `${n}.png`] as const),
    build: buildSkeleton,
  },
  // os de sete folhas: um por entrada de `PACKS` (`packs.ts`)
  ...PACKS.map((p) => ({
    model: p.model,
    pack: join(root, 'assets-src', p.dir),
    how: `Copie as sete folhas de ${p.config.name} (idle.png, walk.png, ..., attack.png, de células de ${p.config.cellW}×${p.config.cellH}) para assets-src/${p.dir}/ (ver README).`,
    files: packFiles((file) => existsSync(join(root, 'assets-src', p.dir, file)), p.config.files),
    build: (sheets: Readonly<Record<string, Image>>) => buildPack(sheets, p.config),
  })),
];
const list = characters();
const missing: string[] = [];
// os atlas de todos os modelos num arquivo só, `atlases.json` (o cliente importa um arquivo, não um por modelo). Um modelo
// cujo pacote falta fica com o atlas que já estava lá.
const atlasesPath = join(atlasOut, 'atlases.json');
const atlases: Record<string, Atlas> = existsSync(atlasesPath) ? JSON.parse(readFileSync(atlasesPath, 'utf8')) : {};
for (const m of models) {
  const absent = m.files.filter(([, file]) => !existsSync(join(m.pack, file))).map(([, file]) => file);
  if (absent.length) {
    console.error(`${m.model}: pacote não encontrado em ${m.pack} (falta ${absent.join(', ')}).\n  ${m.how}\n  As folhas de ${m.model} ficam como estão.`);
    missing.push(m.model);
    continue;
  }
  const built = m.build(Object.fromEntries(m.files.map(([name, file]) => [name, readPng(join(m.pack, file))])));
  const slots = list.flatMap((c, n) => (c.model === m.model ? [n] : []));
  for (const [i, n] of slots.entries()) await writeSheet(join(out, list[n].sheet.replace(/^\/sprites\//, '')), built.sheets[i]);
  atlases[m.model] = built.atlas;
  console.log(`${m.model}: personagens ${slots.join(', ')}, folhas de ${built.sheets[0].width}×${built.sheets[0].height}, quadro ${built.atlas.frame.w}×${built.atlas.frame.h}`);
}
// só os atlas de quem está na lista, na ordem dela
writeFileSync(atlasesPath, JSON.stringify(Object.fromEntries([...new Set(list.map((c) => c.atlas))].flatMap((m) => (atlases[m] ? [[m, atlases[m]]] : []))), null, 2) + '\n');
writeFileSync(join(atlasOut, 'characters.json'), JSON.stringify(list, null, 2) + '\n');
// quanto dura o ataque de cada personagem, em ms, na ordem dos lugares: o servidor simula os bots engraçados
// (`apps/server/src/bots.ts`) e não leva os atlas do cliente na imagem de produção
writeFileSync(
  join(root, 'apps/server/src/attacks.json'),
  JSON.stringify(list.map((c) => { const a = atlases[c.atlas]?.animations.shove; return a ? Math.round((a.frames / a.fps) * 1000) : 450; })) + '\n',
);

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
// e toda folha `char-*` que não é de um lugar de hoje (o elenco encolheu, ou um lugar mudou de formato): pela lista de
// agora, não por uma lista de nomes escrita à mão, que já apagou a folha de um lugar que voltou a existir
const live = new Set(list.map((c) => c.sheet.replace(/^\/sprites\//, '')));
for (const file of readdirSync(out)) if (/^char-\d+\.(png|webp)$/.test(file) && !live.has(file)) rmSync(join(out, file), { force: true });
if (missing.length) {
  console.error(`faltou o pacote de: ${missing.join(', ')}`);
  process.exitCode = 1;
}
