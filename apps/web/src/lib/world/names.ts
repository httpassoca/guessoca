import { t } from '../i18n.svelte';
import { character, properName } from '../sprites/characters';

/**
 * O nome de um personagem como a tela mostra (a etiqueta de um bot, a barra do chefão): o herói e o esqueleto pelo que
 * são (traduzido); os outros pelo nome próprio.
 */
export function characterName(n: number): string {
  const c = character(n);
  return c.model === 'hero' ? t('char.hero') : c.model === 'skeleton' ? t('char.skeleton') : properName(c.name);
}
