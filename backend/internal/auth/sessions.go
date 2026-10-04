package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	"clonesoft/internal/httpx"
)

// Sessions are opaque random tokens kept in an HttpOnly cookie. Redis stores only a
// SHA-256 of the token, mapped to the user ID, so a Redis leak doesn't leak live sessions.
type Sessions struct {
	rdb    *redis.Client
	ttl    time.Duration
	secure bool
}

func NewSessions(rdb *redis.Client, secure bool) *Sessions {
	return &Sessions{rdb: rdb, ttl: 7 * 24 * time.Hour, secure: secure}
}

// The __Host- prefix makes browsers enforce Secure, Path=/ and no Domain, but it requires HTTPS.
func (s *Sessions) cookieName() string {
	if s.secure {
		return "__Host-session"
	}
	return "session"
}

func redisKey(token string) string {
	sum := sha256.Sum256([]byte(token))
	return "session:" + hex.EncodeToString(sum[:])
}

func (s *Sessions) Create(ctx context.Context, w http.ResponseWriter, userID string) error {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return err
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	if err := s.rdb.Set(ctx, redisKey(token), userID, s.ttl).Err(); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName(),
		Value:    token,
		Path:     "/",
		MaxAge:   int(s.ttl.Seconds()),
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
	return nil
}

// Lookup returns the session's user ID, or "" if there is no valid session.
// Each successful lookup slides the expiry forward.
func (s *Sessions) Lookup(ctx context.Context, r *http.Request) (string, error) {
	c, err := r.Cookie(s.cookieName())
	if err != nil || c.Value == "" {
		return "", nil
	}
	userID, err := s.rdb.GetEx(ctx, redisKey(c.Value), s.ttl).Result()
	if errors.Is(err, redis.Nil) {
		return "", nil
	}
	return userID, err
}

// Revoke deletes the request's session from Redis without touching the cookie.
func (s *Sessions) Revoke(ctx context.Context, r *http.Request) error {
	if c, err := r.Cookie(s.cookieName()); err == nil && c.Value != "" {
		return s.rdb.Del(ctx, redisKey(c.Value)).Err()
	}
	return nil
}

// Destroy revokes the session and clears the cookie.
func (s *Sessions) Destroy(ctx context.Context, w http.ResponseWriter, r *http.Request) error {
	err := s.Revoke(ctx, r)
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName(),
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
	return err
}

type ctxKey struct{}

// UserID returns the authenticated user's ID set by RequireAuth.
func UserID(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

// RequireAuth rejects requests without a valid session.
func (s *Sessions) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, err := s.Lookup(r.Context(), r)
		if err != nil {
			slog.Error("session lookup failed", "err", err)
			httpx.Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		if userID == "" {
			httpx.Error(w, http.StatusUnauthorized, "not authenticated")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, userID)))
	})
}
