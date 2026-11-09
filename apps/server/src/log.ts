/** Uma linha por evento, chave=valor, para grep no container. */
export type Log = (event: string, fields?: Record<string, string | number | boolean | null | undefined>) => void;

export const consoleLog: Log = (event, fields = {}) => {
  const parts = [new Date().toISOString(), event];
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) parts.push(`${k}=${JSON.stringify(v)}`);
  console.log(parts.join(' '));
};

export const silentLog: Log = () => {};
