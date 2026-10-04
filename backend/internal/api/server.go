package api

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"clonesoft/internal/auth"
	"clonesoft/internal/config"
	"clonesoft/internal/httpx"
	"clonesoft/internal/learning"
	"clonesoft/internal/middleware"
	"clonesoft/internal/push"
)

type Server struct {
	cfg      config.Config
	db       *pgxpool.Pool
	rdb      *redis.Client
	sessions *auth.Sessions
	limiter  *middleware.RateLimiter
	texts    *learning.Texts
	push     *push.Service
}

func New(cfg config.Config, db *pgxpool.Pool, rdb *redis.Client, pushSvc *push.Service) *Server {
	return &Server{
		cfg:      cfg,
		db:       db,
		rdb:      rdb,
		sessions: auth.NewSessions(rdb, cfg.Production()),
		limiter:  middleware.NewRateLimiter(rdb, cfg.TrustProxy),
		texts:    learning.NewTexts(db),
		push:     pushSvc,
	}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RequestID, chimw.Logger, chimw.Recoverer)
	r.Use(middleware.SecurityHeaders(s.cfg.Production()))

	r.Route("/api", func(r chi.Router) {
		r.Use(middleware.NoStore)
		r.Use(middleware.CheckOrigin(s.cfg.AllowedOrigins))
		r.Use(s.limiter.Limit("api", 300, time.Minute))

		r.Get("/health", s.health)

		r.Route("/auth", func(r chi.Router) {
			strict := s.limiter.Limit("auth", 10, time.Minute)
			r.With(strict).Post("/register", s.register)
			r.With(strict).Post("/login", s.login)
			r.Post("/logout", s.logout)
			r.With(s.sessions.RequireAuth).Get("/me", s.me)
		})

		r.Group(func(r chi.Router) {
			r.Use(s.sessions.RequireAuth)

			r.Get("/notes", s.listNotes)
			r.Post("/notes", s.createNote)
			r.Get("/notes/{id}", s.getNote)
			r.Patch("/notes/{id}", s.updateNote)
			r.Delete("/notes/{id}", s.deleteNote)

			r.Get("/todos", s.listTodos)
			r.Post("/todos", s.createTodo)
			r.Patch("/todos/{id}", s.updateTodo)
			r.Delete("/todos/{id}", s.deleteTodo)

			r.Get("/events", s.listEvents)
			r.Post("/events", s.createEvent)
			r.Get("/events/{id}", s.getEvent)
			r.Patch("/events/{id}", s.updateEvent)
			r.Delete("/events/{id}", s.deleteEvent)

			r.Get("/learning/texts", s.getTexts)
			r.Get("/learning/plans", s.listPlans)
			r.Post("/learning/plans", s.createPlan)
			r.Patch("/learning/plans/{id}", s.updatePlan)
			r.Delete("/learning/plans/{id}", s.deletePlan)
			r.Put("/learning/plans/{id}/progress/{day}", s.markDay)
			r.Delete("/learning/plans/{id}/progress/{day}", s.unmarkDay)
			r.Get("/learning/bookmarks", s.listBookmarks)
			r.Post("/learning/bookmarks", s.createBookmark)
			r.Delete("/learning/bookmarks/{id}", s.deleteBookmark)

			r.Get("/push/key", s.pushKey)
			r.Post("/push/subscriptions", s.subscribePush)
			r.Delete("/push/subscriptions", s.unsubscribePush)
			r.Post("/push/test", s.testPush)
		})

		r.NotFound(func(w http.ResponseWriter, r *http.Request) {
			httpx.Error(w, http.StatusNotFound, "not found")
		})
	})

	if s.cfg.StaticDir != "" {
		r.Handle("/*", spaHandler(s.cfg.StaticDir))
	}
	return r
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	status, code := map[string]string{"database": "ok", "redis": "ok"}, http.StatusOK
	if err := s.db.Ping(ctx); err != nil {
		status["database"], code = "unreachable", http.StatusServiceUnavailable
	}
	if err := s.rdb.Ping(ctx).Err(); err != nil {
		status["redis"], code = "unreachable", http.StatusServiceUnavailable
	}
	httpx.JSON(w, code, status)
}

// spaHandler serves the built frontend, falling back to index.html so client-side routes work on reload.
func spaHandler(dir string) http.Handler {
	fsys := http.Dir(dir)
	files := http.FileServer(fsys)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean("/" + r.URL.Path)
		if f, err := fsys.Open(p); err == nil {
			stat, statErr := f.Stat()
			f.Close()
			if statErr == nil && !stat.IsDir() {
				if strings.HasPrefix(p, "/assets/") {
					// Vite fingerprints asset filenames, so they can be cached forever
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				} else if p == "/sw.js" || p == "/manifest.webmanifest" {
					// Revalidate so a new service worker or manifest is picked up on the next visit
					w.Header().Set("Cache-Control", "no-cache")
				}
				files.ServeHTTP(w, r)
				return
			}
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	})
}

// --- shared handler helpers ---

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func validUUID(s string) bool { return uuidRe.MatchString(s) }

// pathID returns the {id} URL param, writing a 404 if it isn't a UUID.
func pathID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := chi.URLParam(r, "id")
	if !validUUID(id) {
		httpx.Error(w, http.StatusNotFound, "not found")
		return "", false
	}
	return id, true
}

func badRequest(w http.ResponseWriter, msg string) {
	httpx.Error(w, http.StatusBadRequest, msg)
}

func decodeOrBadRequest(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := httpx.Decode(w, r, dst); err != nil {
		badRequest(w, "invalid request body: "+err.Error())
		return false
	}
	return true
}

func serverError(w http.ResponseWriter, r *http.Request, err error) {
	slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
	httpx.Error(w, http.StatusInternalServerError, "internal server error")
}

// Postgres error codes we translate into client errors
const (
	pgUniqueViolation     = "23505"
	pgForeignKeyViolation = "23503"
	pgCheckViolation      = "23514"
)

func pgCode(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code
	}
	return ""
}

// writeDBError maps constraint violations to 400s and everything else to a 500.
func writeDBError(w http.ResponseWriter, r *http.Request, err error) {
	switch pgCode(err) {
	case pgForeignKeyViolation:
		badRequest(w, "linked note does not exist")
	case pgCheckViolation:
		badRequest(w, "invalid value: "+constraintName(err))
	default:
		serverError(w, r, err)
	}
}

func constraintName(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName == "events_time_order" {
		return "an event must end after it starts"
	}
	return "constraint violated"
}

// updateBuilder assembles the SET clause of a PATCH query from only the fields provided.
type updateBuilder struct {
	sets []string
	args []any
}

func (u *updateBuilder) set(column string, value any) {
	u.args = append(u.args, value)
	u.sets = append(u.sets, fmt.Sprintf("%s = $%d", column, len(u.args)))
}

func (u *updateBuilder) setRaw(expr string) { u.sets = append(u.sets, expr) }

// arg adds a positional argument and returns its placeholder.
func (u *updateBuilder) arg(value any) string {
	u.args = append(u.args, value)
	return fmt.Sprintf("$%d", len(u.args))
}

// whereOwned returns a WHERE clause restricting the update to one row owned by userID.
func (u *updateBuilder) whereOwned(id, userID string) string {
	return " WHERE id = " + u.arg(id) + " AND user_id = " + u.arg(userID)
}

func (u *updateBuilder) empty() bool { return len(u.sets) == 0 }

func (u *updateBuilder) clause() string { return strings.Join(u.sets, ", ") }

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

const dateLayout = "2006-01-02"

func validDate(s string) bool {
	_, err := time.Parse(dateLayout, s)
	return err == nil
}
