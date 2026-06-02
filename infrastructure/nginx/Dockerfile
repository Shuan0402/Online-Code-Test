# Stage 1: build React SPA
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: nginx serves the built dist/ + reverse-proxies /api, /grafana, /octest-submissions
FROM nginx:alpine
COPY infrastructure/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/dist /usr/share/nginx/html
EXPOSE 80
