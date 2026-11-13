/**
 * Quais folhas de personagem o telhado tem decodificadas, e quando largar cada uma. Puro (o carregar e o soltar de
 * verdade vêm de fora, `load` e `free`); testado em `apps/web/test/world-sheet-cache.test.ts`. Quem usa: `scene.ts`,
 * com texturas do Pixi.
 *
 * Antes, a cena carregava as folhas dos trinta personagens ao abrir: uns 250 MB de RGBA na memória, e mais na placa,
 * para desenhar os poucos que estão no telhado. Agora uma folha só é carregada quando alguém a pede (`get`: um corpo
 * daquele personagem apareceu, ou a turma e os bots o têm), e é solta (`sweep`) depois de `keepMs` sem ninguém pedir.
 *
 * Também diz quanto encolher uma folha que não cabe na placa (`fitFactor`): a maior textura que uma placa aceita é o
 * `MAX_TEXTURE_SIZE` dela; uma textura maior não sobe, e o Pixi, que desenha tudo em lotes, pinta de preto o lote
 * inteiro (o telhado do meio, as caixas, o letreiro e quem estiver lá). As folhas geradas têm no máximo 8192 de lado, o
 * que toda placa de computador aceita; o encolher é uma defesa para uma placa menor, e só na memória da placa: o
 * arquivo continua com os pixels da arte (`docs/art.md`).
 */

/** O tamanho de uma folha, em pixels. */
export interface SheetSize { w: number; h: number }

/**
 * Quanto encolher uma folha de `size` para caber numa textura de até `max` pixels de lado: 1 se cabe; senão a fração
 * que deixa o maior lado em `max` (arredondada para baixo, para nunca passar).
 */
export function fitFactor(size: SheetSize, max: number): number {
  const side = Math.max(size.w, size.h);
  if (side <= max) return 1;
  return Math.floor((max / side) * 1e6) / 1e6;
}

/** O que a cena precisa para carregar e soltar uma folha. */
export interface SheetCacheOptions<T> {
  /** carrega a folha `url` (baixa, decodifica, cria a textura) */
  load: (url: string) => Promise<T>;
  /** solta o que `load` deu (a textura, a imagem decodificada) */
  free: (value: T) => void;
  /** quanto uma folha fica carregada sem ninguém pedir, ms */
  keepMs: number;
  /** uma folha que falhou é tentada de novo depois disto, ms (o padrão: `keepMs`) */
  retryMs?: number;
}

type Entry<T> = { state: 'loading' | 'ready' | 'failed'; value?: T; used: number; at: number };

/** As folhas carregadas, por endereço. `now` em ms (o relógio da cena). */
export class SheetCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private disposed = false;

  constructor(private readonly o: SheetCacheOptions<T>) {}

  /** A folha `url`, se já está pronta; senão null, e ela começa a carregar (se não está carregando). Marca como usada. */
  get(url: string, now: number): T | null {
    const e = this.entries.get(url);
    if (e) {
      e.used = now;
      return e.state === 'ready' ? e.value! : null;
    }
    const entry: Entry<T> = { state: 'loading', used: now, at: now };
    this.entries.set(url, entry);
    this.o.load(url).then(
      (value) => {
        // solta se ninguém quer mais (a cena fechou, ou a folha foi largada enquanto carregava)
        if (this.disposed || this.entries.get(url) !== entry) { this.o.free(value); return; }
        entry.state = 'ready';
        entry.value = value;
      },
      (err) => {
        if (this.entries.get(url) !== entry) return;
        console.warn(`folha ${url} não carregou`, err);
        entry.state = 'failed';
        entry.at = entry.used;
      },
    );
    return null;
  }

  /** A folha `url` falhou (não carregou, ou não decodificou)? Quem desenha usa outra coisa no lugar. */
  failed(url: string): boolean { return this.entries.get(url)?.state === 'failed'; }

  /** Já pedida e ainda carregando? */
  loading(url: string): boolean { return this.entries.get(url)?.state === 'loading'; }

  /** O que está pronto agora, por endereço. */
  ready(): string[] { return [...this.entries].filter(([, e]) => e.state === 'ready').map(([url]) => url); }

  /**
   * Solta as folhas que ninguém pede há mais de `keepMs` (e esquece as que falharam há mais de `retryMs`, para tentar de
   * novo na próxima vez). Uma que ainda carrega fica: o `load` solta quando acabar, se não tiver sido pedida de novo.
   * Devolve os endereços soltos.
   */
  sweep(now: number): string[] {
    const out: string[] = [];
    for (const [url, e] of this.entries) {
      if (e.state === 'ready' && now - e.used > this.o.keepMs) {
        this.o.free(e.value!);
        this.entries.delete(url);
        out.push(url);
      } else if (e.state === 'failed' && now - e.at > (this.o.retryMs ?? this.o.keepMs)) {
        this.entries.delete(url);
      }
    }
    return out;
  }

  /** Solta tudo (a cena fechou). */
  dispose() {
    this.disposed = true;
    for (const e of this.entries.values()) if (e.state === 'ready') this.o.free(e.value!);
    this.entries.clear();
  }
}

/**
 * Os personagens que o telhado vai desenhar: o de cada membro da turma que escolheu um, e o de cada bot que está lá (o
 * chefão é um deles). Sem repetir, na ordem em que aparecem. A cena carrega as folhas deles antes de o corpo aparecer.
 */
export function presentCharacters(room: { members: readonly { character: number | null }[]; bots?: readonly { character: number }[] } | null): number[] {
  if (!room) return [];
  const out = new Set<number>();
  for (const m of room.members) if (m.character !== null) out.add(m.character);
  for (const b of room.bots ?? []) out.add(b.character);
  return [...out];
}
