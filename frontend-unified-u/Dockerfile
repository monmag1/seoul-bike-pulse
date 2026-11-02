# 실행 위치: frontend 디렉터리; docker build -t ... .
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN if test -f package-lock.json; then npm ci; else npm install --no-audit --no-fund; fi
COPY . .
RUN npm run build
FROM nginx:stable-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
