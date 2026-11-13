/**
 * `bun run sprites`: roda as receitas sobre os pacotes em `assets-src/` (fora do git, ADR 0007) e escreve as folhas que o
 * jogo usa em `apps/web/public/sprites/` (`char-N-idle.png` e `char-N-moves.png`, ou `.webp` para a arte grande dos de sete folhas: as páginas de
 * cada personagem, `paginate` em `atlas.ts`, nenhuma com lado maior que `MAX_SHEET`) e os atlas em
 * `apps/web/src/lib/sprites/` (`hero.json`, `skeleton.json`, `kratos.json`, `vorcaro.json`, `orelha.json`, `bolsonaro.json`, `knight.json`, `oldsnake.json`, `pinocchio.json`, `eve.json`, `katarina.json`, `punisher.json`, `mista.json` e `characters.json`, que liga cada personagem ao seu).
 * Só a saída vai para o git; o CI e o Docker nunca precisam dos pacotes.
 * O telhado (objetos em grade de texto e a cidade ao fundo) não usa o pacote e sai primeiro, mesmo sem ele.
 *
 * Ordem: `rooftop.png` + `skyline-*.png` + `rooftop.json` (de `rooftop.ts` e `skyline.ts`); depois cada modelo de
 * `models` (`hero.ts`, `skeleton.ts`, e `kratos.ts`, `vorcaro.ts`, `orelha.ts`, `bolsonaro.ts`, `knight.ts`, `oldsnake.ts`, `pinocchio.ts`, `eve.ts`, `katarina.ts`, `punisher.ts` e `mista.ts`, os de sete folhas de `pack.ts`), com as folhas nos lugares que `characters.ts` dá a ele; `characters.json`;
 * `cats.png` + `birds.png` + `critters.json` (os bichos do telhado, `critters.ts`, dos pacotes em `assets-src/cats` e
 * `assets-src/birds`); `emotes-<língua>.png` e `emotes.json` (`emotes.ts`); e por fim apaga nomes antigos que não existem mais. É o único
 * arquivo que toca o disco (com `png.ts`); as receitas são puras. `bun run sprites:preview` (`preview.ts`) lê o que
 * sai daqui e amplia para conferir.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { emoteSheet, type EmoteLang } from './emotes';
import { characters, sheetFiles } from './characters';
import { buildCritters, critterFiles } from './critters';
import { buildHero, ANIMATIONS } from './hero';
import { paginate, type Atlas } from './atlas';
import type { Image } from './image';
import { buildPack, packFiles } from './pack';
import { PACKS } from './packs';
import { buildSkeleton, SHEETS as SKELETON_SHEETS } from './skeleton';
import { rooftopSheet } from './rooftop';
import { SKYLINES, skyline } from './skyline';
import { readPng, writePng, writeSheet } from './png';

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
  // a folha de uma linha por animação vira páginas de até `MAX_SHEET` (só quadros inteiros mudam de lugar)
  let paged: ReturnType<typeof paginate>[];
  try { paged = built.sheets.map((sheet) => paginate(sheet, built.atlas)); } catch (e) { throw new Error(`${m.model}: ${(e as Error).message}`); }
  const slots = list.flatMap((c, n) => (c.model === m.model ? [n] : []));
  for (const [i, n] of slots.entries()) {
    const files = sheetFiles(n, m.model, paged[i].pages.length);
    for (const [p, page] of paged[i].pages.entries()) await writeSheet(join(out, files[p].replace(/^\/sprites\//, '')), page);
  }
  atlases[m.model] = paged[0].atlas;
  console.log(`${m.model}: personagens ${slots.join(', ')}, páginas de ${paged[0].pages.map((p) => `${p.width}×${p.height}`).join(' + ')}, quadro ${built.atlas.frame.w}×${built.atlas.frame.h}`);
}
// com as páginas de cada modelo sabidas, os endereços das folhas de cada personagem
const entries = characters((model) => atlases[model]?.pages?.length ?? 2);
// só os atlas de quem está na lista, na ordem dela
writeFileSync(atlasesPath, JSON.stringify(Object.fromEntries([...new Set(list.map((c) => c.atlas))].flatMap((m) => (atlases[m] ? [[m, atlases[m]]] : []))), null, 2) + '\n');
writeFileSync(join(atlasOut, 'characters.json'), JSON.stringify(entries, null, 2) + '\n');
// quanto dura o ataque de cada personagem, em ms, na ordem dos lugares: o servidor simula os bots engraçados
// (`apps/server/src/bots.ts`) e não leva os atlas do cliente na imagem de produção
writeFileSync(
  join(root, 'apps/server/src/attacks.json'),
  JSON.stringify(list.map((c) => { const a = atlases[c.atlas]?.animations.shove; return a ? Math.round((a.frames / a.fps) * 1000) : 450; })) + '\n',
);

// os bichos do telhado (`critters.ts`): gatos e pássaros, dos dois pacotes em assets-src/cats e assets-src/birds. Sem
// eles, as folhas e o atlas que já estão no git ficam como estão.
{
  const files = critterFiles();
  const absent = files.filter(([, file]) => !existsSync(join(root, 'assets-src', file))).map(([, file]) => file);
  if (absent.length) {
    console.error(`bichos: pacote não encontrado (falta ${absent.slice(0, 3).join(', ')}${absent.length > 3 ? '…' : ''}).\n  Baixe o "Pet Cats Pack" (LuizMelo) para assets-src/cats/ e o "Bird Sprites" grátis (carysaurus) para assets-src/birds/ (ver docs/art.md).\n  As folhas dos bichos ficam como estão.`);
    missing.push('bichos');
  } else {
    const built = buildCritters(Object.fromEntries(files.map(([name, file]) => [name, readPng(join(root, 'assets-src', file))])));
    writePng(join(out, 'cats.png'), built.cats);
    writePng(join(out, 'birds.png'), built.birds);
    writeFileSync(join(atlasOut, 'critters.json'), JSON.stringify(built.atlas, null, 2) + '\n');
    console.log(`bichos: gatos ${built.cats.width}×${built.cats.height}, pássaros ${built.birds.width}×${built.birds.height}`);
  }
}

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
// e toda folha `char-*` que não é de um lugar de hoje (o elenco encolheu, um lugar mudou de formato, ou é a folha única
// `char-N.<formato>` de antes das páginas): pela lista de agora, não por uma lista de nomes escrita à mão, que já apagou
// a folha de um lugar que voltou a existir
const live = new Set(entries.flatMap((c) => c.sheets.map((s) => s.replace(/^\/sprites\//, ''))));
for (const file of readdirSync(out)) if (/^char-\d+(-[a-z0-9-]+)?\.(png|webp)$/.test(file) && !live.has(file)) rmSync(join(out, file), { force: true });
if (missing.length) {
  console.error(`faltou o pacote de: ${missing.join(', ')}`);
  process.exitCode = 1;
}
