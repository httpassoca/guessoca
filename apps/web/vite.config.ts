import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    fs: { allow: ['../..'] },
    // em dev o servidor Bun roda ao lado (bun run dev na raiz); sala e WebSocket ficam na mesma origem como em produção
    proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000', '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  // dssoca@0.19 vanilla.css ainda tem `:where(:scope)a.ss-svc` — o lightningcss (minificador do Vite 8) rejeita; CSS fica sem minificar até isso ser corrigido no dssoca
  build: { cssMinify: false },
});
