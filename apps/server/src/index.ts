import { resolve } from 'node:path';
import { consoleLog } from './log';
import { createServer } from './server';

const port = Number(process.env.PORT ?? 3000);
const distDir = process.env.DIST_DIR ?? resolve(import.meta.dir, '../../web/dist');
const dev = process.env.NODE_ENV !== 'production';
// as trocas de arquivos do sistema (`admin.ts`): no Docker, `/app/data` é um volume e sobrevive ao deploy. A senha do
// sistema vem só do ambiente (`GUESS_ADMIN_HASH`, o SHA-256 dela); sem a variável, o sistema fica desligado
const dataDir = process.env.GUESS_DATA_DIR ?? resolve(import.meta.dir, '../../../data');
const { server } = createServer({ port, distDir, dataDir, adminHash: process.env.GUESS_ADMIN_HASH, log: consoleLog, hostname: '0.0.0.0', dev });
consoleLog('server.listening', { url: server.url.toString(), dist: distDir, dev });
