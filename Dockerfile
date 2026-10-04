# Production image (used by Railway): builds the frontend, then a Go binary that
# serves both the API (/api) and the built frontend from a single container.

FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.27-alpine AS backend
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend /server /app/server
COPY --from=frontend /src/dist /app/public
ENV APP_ENV=production \
    STATIC_DIR=/app/public \
    TRUST_PROXY=true
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app/server"]
