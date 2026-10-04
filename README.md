# Clonesoft

A web desktop of software clones. Signed-in users open apps from a searchable home screen.
The apps are **Notes**, **Todo**, **Calendar** and **Learning**. The first three share data:

- Todos and events can be linked to a note. A note shows its linked todos and events, and you can add them from the note.
- Todos with a due date appear on the calendar, next to that day's events.
- An event can create a linked meeting note in one click.
- The home screen shows today's events, todos that are due or overdue, and recent notes.

**Learning** is a reader for Tanach, Mishna and Talmud Bavli in Hebrew only, with no commentary:

- A reading plan divides a corpus into daily portions over any timespan. The presets are Tanach or Mishna in a month and the Talmud in a year, plus paces like 2 mishnayot or 1 daf a day. Tanach and Mishna chapters are weighted by their number of verses or mishnayot, so each day is about the same length. Every amud of Talmud counts the same, as in the daf yomi.
- Each portion can be marked as read. The plan shows how far behind you are, and when a cycle ends you can start the next one.
- Tap a verse to bookmark it. The library opens any chapter or daf outside a plan.
- Reminders are sent as Web Push notifications at a time you choose, only on days with unread portions.
- The site is installable as an app (PWA). The Learning page invites you to install it, and on iPhone and iPad it explains how, because push only works there from the installed app.

The texts come from [Sefaria](https://www.sefaria.org)'s API: Miqra according to the Masorah (CC BY-SA) for Tanach, Torat Emet (public domain) for Mishna, and the vocalized William Davidson Edition (CC BY-NC) for the Talmud. The backend caches each chapter in Postgres the first time someone opens it. `scripts/build-learning-catalog.mjs` regenerates the book catalogs the portions are computed from, and `scripts/build-icons.mjs` redraws the app icons.

## Stack

| Part     | Tech                                                         |
| -------- | ------------------------------------------------------------ |
| Frontend | React, TypeScript, Vite, Tailwind v4, React Router, TanStack Query |
| Backend  | Go (chi, pgx), in `backend/`                                 |
| Database | Postgres, with SQL migrations in `backend/internal/db/migrations/` |
| Cache    | Redis, for sessions and rate limiting                        |

## Local development

```sh
cp .env.example .env     # first time only
docker compose up --build
```

- App: http://localhost:5173 (the Vite dev server, which forwards `/api` to the backend)
- API: http://localhost:8080/api/health

Both the backend and the frontend reload when you save a file. If you change `go.mod` or `package.json`, rebuild with `docker compose up --build -V`. The `-V` replaces the frontend container's saved `node_modules`, which would otherwise keep the old packages.

## Production and Railway

The root `Dockerfile` builds one image. The Go server serves the API under `/api` and the built frontend from `/`, so there's no nginx or separate frontend service.

To set it up on Railway:
1. Create a project from this repository. Railway reads `railway.json` and builds from the `Dockerfile`.
2. Add the **PostgreSQL** and **Redis** plugins.
3. On the app service, set these variables:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `REDIS_URL=${{Redis.REDIS_URL}}`
4. Generate a public domain for the service.

Railway sets `PORT` automatically. Migrations run when the server starts.

## Configuration (backend environment variables)

| Variable          | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`    | Postgres connection URL (required)                                   |
| `REDIS_URL`       | Redis connection URL (required)                                      |
| `PORT`            | Port to listen on (default `8080`)                                   |
| `APP_ENV`         | Set to `production` for Secure cookies and HSTS (the Docker image sets it) |
| `STATIC_DIR`      | Folder of built frontend files to serve (the Docker image sets it)   |
| `TRUST_PROXY`     | Read the client IP from proxy headers (the Docker image sets it)     |
| `ALLOWED_ORIGINS` | Comma-separated extra origins allowed to send POST, PATCH and DELETE requests |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push key pair. If unset, a pair is generated on first start and stored in the database |
| `VAPID_SUBJECT`   | Contact email or `https:` URL sent to push services (default `admin@example.com`; set a real one in production) |

## Security

- **Sessions:** a random token in an HttpOnly, SameSite=Lax cookie, with a `__Host-` prefix in production. Redis stores only a SHA-256 hash of the token. Logging in replaces the previous session.
- **Passwords:** hashed with bcrypt (cost 12). A failed login takes the same time whether or not the email exists, so response timing doesn't reveal which emails have accounts.
- **CSRF:** the server checks the Origin header on every POST, PATCH and DELETE request.
- **Rate limiting:** limits are kept in Redis, so they apply across every running instance. The API allows 300 requests per minute per IP, and login and registration allow 10 per minute.
- **No privilege escalation:** the `role` column can only be changed in the database. The API rejects request fields it doesn't recognize.
- **Data isolation:** every query is scoped to the signed-in user. Composite foreign keys stop a user from linking a todo or event to another user's note, even if the API has a bug.
- **Headers:** CSP, HSTS, frame-ancestors none, nosniff, and `no-store` on API responses. The exception is Sefaria texts, which are public and cached for 30 days.
- **Outbound requests:** the server only fetches whole chapters or amudim of books in its catalog from Sefaria, so the shared text cache can't be filled with arbitrary content. It only sends push messages to the browser vendors' push services (Google, Mozilla, Microsoft and Apple), so a user can't make the server send requests to any other host.

## Adding an app

1. Create `frontend/src/apps/<name>/`.
2. Register it in `frontend/src/apps/registry.ts`.
3. Add its route in `frontend/src/App.tsx`.
4. Add backend handlers in `backend/internal/api/`, and register their routes in `server.go`.
5. Add a new numbered migration. Never edit a migration that has already been applied.
