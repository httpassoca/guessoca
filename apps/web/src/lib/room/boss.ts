/**
 * A barra de vida do chefão (issue #60), pura: quem é o chefão no snapshot, os gomos da barra e quando ele levou um
 * golpe que contou (para a barra piscar e tremer). O servidor é quem conta os pontos (`BotView.hp` de `hpMax`); a tela
 * só mostra. Desenhada por `panels/BossBar.svelte`; testada em `apps/web/test/boss.test.ts`.
 */
import type { RoomSnapshot } from '@guess/protocol';

/** O chefão no telhado agora: quem é, o personagem e quantos empurrões ainda aguenta (`hp`) de quantos (`max`). */
export interface BossBar { id: string; character: number; hp: number; max: number }

/**
 * O chefão da sala, se há um: o bot que manda os pontos. Um servidor de antes da barra não manda, e então não há barra.
 * Pontos fora da barra ficam dentro dela.
 */
export function bossOf(room: RoomSnapshot | null): BossBar | null {
  for (const b of room?.bots ?? []) {
    if (typeof b.hp !== 'number' || typeof b.hpMax !== 'number' || !(b.hpMax > 0)) continue;
    return { id: b.id, character: b.character, hp: Math.max(0, Math.min(b.hpMax, Math.round(b.hp))), max: Math.round(b.hpMax) };
  }
  return null;
}

/** Os gomos da barra, da esquerda para a direita: cheio (`true`) cada empurrão que ainda aguenta. */
export const segments = (hp: number, max: number): boolean[] => Array.from({ length: max }, (_, i) => i < hp);

/** o espaço entre gomos, px: o normal, e o menor quando os gomos ficariam finos demais com ele (menos de `SEG_THIN`) */
const SEG_GAP = 2;
const SEG_THIN = 10;

/** O espaço entre os `n` gomos numa barra de `inner` px por dentro: 2, ou 1 se com 2 eles ficariam finos. */
export function segmentGap(inner: number, n: number): number {
  return n > 1 && (inner - (n - 1) * SEG_GAP) / n < SEG_THIN ? 1 : SEG_GAP;
}

/**
 * A largura de cada um dos `n` gomos, px inteiros (nítidos: um gomo fracionado borra a borda e deixa os espaços
 * desiguais), enchendo os `inner` px por dentro da barra com `gap` entre eles. Os pixels que sobram da divisão vão um a
 * mais em gomos espalhados pela barra, não todos de um lado. Sem medida (`inner` 0), nenhum: o CSS divide por igual.
 */
export function segmentWidths(inner: number, n: number, gap: number): number[] {
  const free = Math.floor(inner) - (n - 1) * gap;
  if (n <= 0 || free < n) return [];
  const base = Math.floor(free / n);
  const rest = free - base * n;
  return Array.from({ length: n }, (_, i) => base + (Math.floor(((i + 1) * rest) / n) - Math.floor((i * rest) / n)));
}

/**
 * Um vigia dos golpes: chamado a cada snapshot com o chefão de agora, diz se os pontos do mesmo chefão caíram desde a
 * última vez. Chegar, ir embora e trocar de chefão não são golpe.
 */
export function hitTracker(): (boss: BossBar | null) => boolean {
  let last: BossBar | null = null;
  return (boss) => {
    const hit = !!boss && !!last && last.id === boss.id && boss.hp < last.hp;
    last = boss;
    return hit;
  };
}
