# syntax=docker/dockerfile:1
# Um container serve o cliente buildado e o WebSocket (ADR 0001). Duas etapas: a primeira instala tudo e
# builda o cliente com o Vite; a segunda leva só as dependências de produção, o motor, o protocolo, o
# servidor (Bun roda o TypeScript direto) e o `dist` do cliente.
FROM oven/bun:1.4 AS build
WORKDIR /app

# Só os manifestos primeiro: o `bun install` fica em cache enquanto o lockfile não muda.
COPY package.json bun.lock ./
COPY packages/rules/package.json packages/rules/
COPY packages/world/package.json packages/world/
COPY packages/protocol/package.json packages/protocol/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.4-slim
WORKDIR /app
# O deploy poda as imagens penduradas por esta etiqueta, sem tocar nas do passoca-api nem nas do trucossoca.
LABEL app=guessoca
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json bun.lock tsconfig.base.json ./
COPY packages/rules/package.json packages/rules/
COPY packages/world/package.json packages/world/
COPY packages/protocol/package.json packages/protocol/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN bun install --frozen-lockfile --production

COPY packages ./packages
COPY apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3000
# `docker ps` mostra (healthy) quando o servidor responde; o deploy também sonda de fora.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD bun -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["bun", "apps/server/src/index.ts"]
