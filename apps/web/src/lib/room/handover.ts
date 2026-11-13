/**
 * O aviso "agora você é o moderador": snapshot a snapshot, diz se o papel acabou de chegar a mim (passado por alguém,
 * ou assumido porque o moderador caiu). Quem já era moderador ao abrir a sala (criou, ou voltou) não é avisado.
 */
export function moderatorTracker() {
  let prev: string | null | undefined;
  return (moderator: string | null, me: string | null): boolean => {
    const before = prev;
    prev = moderator;
    return me !== null && moderator === me && before !== undefined && before !== me;
  };
}
