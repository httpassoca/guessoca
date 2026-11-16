/**
 * O cliente da API do sistema (`apps/server/src/admin.ts`): a lista dos arquivos, baixar, trocar e desfazer. Toda chamada
 * leva a senha no cabeçalho `x-admin-pass`; quem guarda a senha (na aba) é a página. `fetchFn` é trocável nos testes.
 */

/** Um arquivo gerenciado, como o servidor descreve (`AssetInfo` em `admin.ts`). */
export interface AssetInfo {
  path: string; format: string; bytes: number; originalBytes: number; width?: number; height?: number; overridden: boolean; overriddenAt?: number;
}
/** O estado do servidor que a página mostra. */
export interface ServerInfo { rooms: number; startedAt: number; now: number; dev: boolean; bun: string }
export interface AssetList { assets: AssetInfo[]; server: ServerInfo }

/** As estatísticas de uso (`apps/server/src/usage.ts`): os contadores de um dia. */
export type UsageCounts = Partial<Record<
  'roomsCreated' | 'gamesStarted' | 'gamesFinished' | 'gamesAbandoned' | 'players' | 'gameMs' | 'shoves' | 'falls' | 'claims' | 'guessed' | 'gaveUp'
  | 'ghosts' | 'chats' | 'bossesSpawned' | 'bossesDown' | 'floodKicks' | 'limited' | 'groqRequests' | 'groqTokens' | 'groq429' | 'groqTimeouts'
  | 'groqErrors' | 'botLines' | 'botLinesDropped', number>>;
export interface UsageDay { day: string; counts: UsageCounts; visitors: number; peakOnline: number }
export interface GroqWindow { requests: number; tokens: number }
/** O que `GET /api/admin/usage` devolve: o agora, os últimos 30 dias e o orçamento do Groq (null sem `GROQ_API_KEY`). */
export interface UsageReport {
  live: { rooms: number; lobby: number; playing: number; ended: number; players: number; visitors: number; bots: number; online: number; startedAt: number; now: number; uptimeMs: number; memory: { rss: number; heapUsed: number } };
  usage: { days: UsageDay[]; totals: UsageCounts; topCharacters: { character: number; picks: number }[]; since: string | null; today: string };
  groq: { model: string | null; budget: { limits: { rpm: number; rpd: number; tpm: number; tpd: number }; minute: GroqWindow; day: GroqWindow; blockedUntil: number } } | null;
}

/** Um erro da API: `status` 401 é senha errada; `message` é o texto que o servidor mandou (em português). */
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** As chamadas do sistema com a senha `pass`. */
export function systemApi(pass: string, fetchFn: Fetch = (u, i) => fetch(u, i)) {
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetchFn(`/api/admin/${path}`, { ...init, headers: { 'x-admin-pass': pass, ...init.headers } });
    if (!r.ok) throw new ApiError(r.status, (await r.text().catch(() => '')) || `erro ${r.status}`);
    return r;
  };
  const at = (path: string) => `assets/${path.split('/').map(encodeURIComponent).join('/')}`;
  return {
    /** a lista e o estado do servidor; 401 se a senha está errada */
    list: async (): Promise<AssetList> => (await call('assets')).json() as Promise<AssetList>,
    /** as estatísticas de uso */
    usage: async (): Promise<UsageReport> => (await call('usage')).json() as Promise<UsageReport>,
    /** os bytes do que está valendo, ou do original */
    download: async (path: string, original = false): Promise<Uint8Array<ArrayBuffer>> => new Uint8Array(await (await call(at(path) + (original ? '?original=1' : ''))).arrayBuffer()),
    /** troca o arquivo pelo que o dono escolheu */
    replace: async (path: string, file: Blob): Promise<void> => { await call(at(path), { method: 'PUT', body: file }); },
    /** desfaz a troca: volta o original do deploy */
    restore: async (path: string): Promise<void> => { await call(at(path), { method: 'DELETE' }); },
  };
}

/** Bytes em texto curto: `812 B`, `436 KB`, `1,3 MB`. */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Um tempo em texto curto: `42 s`, `17 min`, `3 h 05 min`, `2 d 4 h`. */
export function agoText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
}

/** Faz o navegador baixar `bytes` como `name`. */
export function saveBytes(name: string, bytes: Uint8Array<ArrayBuffer> | string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
