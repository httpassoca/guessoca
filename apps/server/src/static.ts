import { join, normalize } from 'node:path';

/** As pastas que só têm arquivos: nelas, o que não existe não cai no `index.html`. */
const ASSET_DIRS = /^[/\\](fonts|sprites|assets|music)[/\\]/;

/**
 * Serve o cliente buildado: arquivos de `dist`, e `index.html` para qualquer rota que não seja arquivo (SPA), menos nas
 * pastas de arquivos (`ASSET_DIRS`), onde o que falta é 404. Com
 * `overridesDir` (as trocas do sistema, `admin.ts`), um arquivo de `/sprites/` ou `/music/` que exista lá é servido no
 * lugar do original.
 */
export function staticHandler(distDir: string, overridesDir?: string) {
  const index = join(distDir, 'index.html');
  return async (pathname: string): Promise<Response> => {
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); } catch { return new Response('bad path', { status: 400 }); }
    const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    if (overridesDir && /^[/\\](sprites|music)[/\\][^/\\]+$/.test(safe)) {
      const over = Bun.file(join(overridesDir, safe));
      if (await over.exists()) return new Response(over, { headers: { 'cache-control': 'no-cache' } });
    }
    const file = Bun.file(join(distDir, safe));
    if (!safe.endsWith('/') && (await file.exists())) {
      const immutable = safe.startsWith('/assets/');
      return new Response(file, { headers: { 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' } });
    }
    // nas pastas de arquivos, o que falta é 404: a página no lugar de uma fonte ou imagem só vira um erro estranho no navegador
    if (ASSET_DIRS.test(safe)) return new Response('not found', { status: 404 });
    const html = Bun.file(index);
    if (!(await html.exists())) return new Response('cliente não buildado: rode `bun run build`', { status: 503 });
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
  };
}
