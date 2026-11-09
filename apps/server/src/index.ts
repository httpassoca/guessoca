import { resolve } from 'node:path';
import { consoleLog } from './log';
import { createServer } from './server';

const port = Number(process.env.PORT ?? 3000);
const distDir = process.env.DIST_DIR ?? resolve(import.meta.dir, '../../web/dist');
const dev = process.env.NODE_ENV !== 'production';
const { server } = createServer({ port, distDir, log: consoleLog, hostname: '0.0.0.0', dev });
consoleLog('server.listening', { url: server.url.toString(), dist: distDir, dev });
