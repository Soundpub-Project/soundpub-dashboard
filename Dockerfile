# Stage 1: Build stage
FROM node:22-alpine AS build

WORKDIR /app

# Deklarasikan build arguments untuk Environment Variables agar terbaca oleh Vite saat build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_DATABASE_SCHEMA
ARG VITE_SSO_BASE_URL
ARG VITE_SSO_REALM
ARG VITE_SSO_CLIENT_ID
ARG VITE_PDF_SERVICE_URL
ARG VITE_CONTRACT_BUCKET

# Map build arguments ke environment variables sistem
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_DATABASE_SCHEMA=$VITE_DATABASE_SCHEMA
ENV VITE_SSO_BASE_URL=$VITE_SSO_BASE_URL
ENV VITE_SSO_REALM=$VITE_SSO_REALM
ENV VITE_SSO_CLIENT_ID=$VITE_SSO_CLIENT_ID
ENV VITE_PDF_SERVICE_URL=$VITE_PDF_SERVICE_URL
ENV VITE_CONTRACT_BUCKET=$VITE_CONTRACT_BUCKET

# Salin manifest dan lockfile agar dependency build deterministik
COPY package*.json ./

# Fail fast kalau build arg kosong
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_PUBLISHABLE_KEY" && test -n "$VITE_SSO_BASE_URL" && test -n "$VITE_SSO_REALM" && test -n "$VITE_SSO_CLIENT_ID"

# Install dependency persis sesuai package-lock.json
RUN npm ci

# Salin semua source code
COPY . .

# Build aplikasi untuk production
RUN npm run build

# Stage 2: Production stage menggunakan Nginx
FROM nginx:stable-alpine AS production

# Salin hasil build dari stage sebelumnya ke direktori Nginx html
COPY --from=build /app/dist /usr/share/nginx/html

# Salin konfigurasi Nginx kustom
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
