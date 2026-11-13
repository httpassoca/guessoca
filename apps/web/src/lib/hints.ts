import { local, readKey, writeKey } from './identity';

/**
 * As dicas de primeira vez: o cartão das teclas no telhado aparece até a pessoa fechá-lo, uma vez por navegador
 * (localStorage). Sem armazenamento (modo privado bloqueado), aparece a cada sala, e fecha do mesmo jeito.
 */
type MaybeStore = Parameters<typeof readKey>[0];
const KEYS_HINT_KEY = 'guess.keysHintSeen';

export const keysHintSeenIn = (store: MaybeStore) => readKey(store, KEYS_HINT_KEY) === '1';
export const rememberKeysHintSeenIn = (store: MaybeStore) => writeKey(store, KEYS_HINT_KEY, '1');

export const keysHintSeen = () => keysHintSeenIn(local());
export const rememberKeysHintSeen = () => rememberKeysHintSeenIn(local());
