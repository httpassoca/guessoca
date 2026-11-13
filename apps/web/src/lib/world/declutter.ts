/**
 * Os post-its sobre as cabeças não se cobrem: quando dois se encostam na tela, o de quem está mais à frente fica onde está
 * e o de trás sobe até ficar acima dele. Quem está falando (`pin`) escolhe antes de todos: a etiqueta dele, com o balão,
 * fica sobre a própria cabeça, e o rabicho do balão aponta para quem falou, não para o vizinho. Puro: recebe onde cada um quer ficar (o ponto de baixo, no meio) e o tamanho, e
 * devolve quanto cada um sobe. Tudo em pixels da tela (o `y` cresce para baixo); `runtime.ts` usa a cada quadro.
 * Testado em `apps/web/test/world-declutter.test.ts`.
 */
/** Um post-it: `x, y` o meio da base, `w, h` o tamanho, em pixels da tela. */
export interface Tag { id: string; x: number; y: number; w: number; h: number; /** profundidade: maior = mais ao fundo */ z: number; /** está falando: fica no lugar */ pin?: boolean }

/** espaço entre dois post-its empilhados, px da tela (no olho: separa sem parecer solto) */
export const TAG_GAP = 4;

/** Quanto (px da tela, ≥ 0) cada post-it sobe, por id; o mais à frente (`z` menor) nunca sobe. */
export function declutter(tags: readonly Tag[], gap = TAG_GAP): Map<string, number> {
  const placed: { left: number; right: number; top: number; bottom: number }[] = [];
  const lift = new Map<string, number>();
  // quem fala primeiro; depois da frente para o fundo: quem está na frente escolhe primeiro
  for (const t of [...tags].sort((a, b) => Number(!!b.pin) - Number(!!a.pin) || a.z - b.z || a.id.localeCompare(b.id))) {
    const left = t.x - t.w / 2, right = t.x + t.w / 2;
    let bottom = t.y;
    for (let moved = true, guard = 0; moved && guard < tags.length + 1; guard++) {
      moved = false;
      for (const p of placed) {
        const top = bottom - t.h;
        if (left < p.right && right > p.left && top < p.bottom && bottom > p.top) { bottom = p.top - gap; moved = true; }
      }
    }
    placed.push({ left, right, top: bottom - t.h, bottom });
    lift.set(t.id, t.y - bottom);
  }
  return lift;
}
