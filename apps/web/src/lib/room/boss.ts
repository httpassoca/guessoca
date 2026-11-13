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
