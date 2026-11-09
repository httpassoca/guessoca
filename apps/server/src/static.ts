import { join, normalize } from 'node:path';

/** Serve o cliente buildado: arquivos de `dist`, e `index.html` para qualquer rota que não seja arquivo (SPA). */
export function staticHandler(distDir: string) {
  const index = join(distDir, 'index.html');
  return async (pathname: string): Promise<Response> => {
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); } catch { return new Response('bad path', { status: 400 }); }
    const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    const file = Bun.file(join(distDir, safe));
    if (!safe.endsWith('/') && (await file.exists())) {
      const immutable = safe.startsWith('/assets/');
      return new Response(file, { headers: { 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' } });
    }
    const html = Bun.file(index);
    if (!(await html.exists())) return new Response('cliente não buildado: rode `bun run build`', { status: 503 });
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
  };
}
