# Production frontend image — static Vite build served by nginx.
# Staging/prod: build with VITE_API_BASE_URL pointing at the public API URL.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
ARG VITE_APP_NAME=Master Ball
# Empty = same-origin (production proxy). Local compose uses Dockerfile.dev instead.
ARG VITE_API_BASE_URL=
ARG VITE_ENVIRONMENT=production
ARG VITE_SENTRY_DSN=
ARG VITE_POSTHOG_KEY=
ARG VITE_POSTHOG_HOST=
ENV VITE_APP_NAME=$VITE_APP_NAME \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_ENVIRONMENT=$VITE_ENVIRONMENT \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY \
    VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
