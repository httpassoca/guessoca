/**
 * Limites de ritmo, puros (a hora vem de fora). `TokenBucket`: até `burst` de uma vez, depois `perSecond`. `KeyedBuckets`:
 * um balde por chave (um IP), que esquece os cheios quando o mapa passa de `maxKeys`.
 */
export class TokenBucket {
  private tokens: number;
  constructor(private readonly burst: number, private readonly perSecond: number, private at: number) { this.tokens = burst; }

  private refill(now: number) {
    if (now > this.at) this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.perSecond);
    this.at = Math.max(this.at, now);
  }

  /** Gasta uma ficha, se há; devolve se passou. */
  take(now: number): boolean {
    this.refill(now);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  /** Já recarregou tudo: esquecer este balde é o mesmo que guardá-lo. */
  full(now: number): boolean { this.refill(now); return this.tokens >= this.burst; }
}

export class KeyedBuckets {
  private readonly buckets = new Map<string, TokenBucket>();
  constructor(private readonly burst: number, private readonly perSecond: number, private readonly maxKeys = 10_000) {}

  get size() { return this.buckets.size; }

  take(key: string, now: number): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) for (const [k, old] of this.buckets) if (old.full(now)) this.buckets.delete(k);
      // ainda cheio de chaves com pressa: a mais velha sai (ganha uma rajada nova, mas o mapa não cresce sem fim)
      if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!);
      b = new TokenBucket(this.burst, this.perSecond, now);
      this.buckets.set(key, b);
    }
    return b.take(now);
  }
}

/** Loopback e redes privadas: de onde o nginx (no host, pela ponte do Docker) chega ao container. */
const PRIVATE = [/^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^::1$/, /^f[cd][0-9a-f]{2}:/i, /^fe80:/i];
const isPrivate = (ip: string) => PRIVATE.some((re) => re.test(ip.replace(/^::ffff:/i, '')));

/**
 * O IP de quem pede. O container só escuta no loopback do VPS (`docker:start`), atrás do nginx, que põe o endereço de
 * verdade em `X-Real-IP` e o acrescenta ao fim do `X-Forwarded-For` (`deploy/guess.passoca.dev.nginx`). Esses
 * cabeçalhos só valem quando a conexão vem de lá (loopback ou rede privada); de qualquer outro lugar, quem pede escreve
 * o que quiser neles, então vale o endereço da conexão. `peer`: `server.requestIP(req)?.address`.
 */
export function clientIp(req: Request, peer: string | null | undefined): string {
  if (!peer) return '?';
  if (!isPrivate(peer)) return peer;
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return forwarded || peer;
}
