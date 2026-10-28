# Grandma's Recipe Story — Cloudflare Container image.
# The Next.js build (.next) is produced on the host with `npm run build`
# before `wrangler deploy`; this image only assembles the production
# runtime so no arch-specific compilation happens under emulation.
FROM node:24-trixie-slim
WORKDIR /app
ENV NODE_ENV=production \
    APP_MODE=sample \
    DATA_DIR=/data/app \
    PORT=8080 \
    HOSTNAME=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY next.config.mjs ./
COPY .next ./.next
COPY public ./public
COPY samples ./samples
RUN mkdir -p /data/app
EXPOSE 8080
CMD ["npx", "next", "start", "-p", "8080", "-H", "0.0.0.0"]
