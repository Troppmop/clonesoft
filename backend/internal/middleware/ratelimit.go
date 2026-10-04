package middleware

import (
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"clonesoft/internal/httpx"
)

// RateLimiter is a fixed-window limiter keyed by client IP, backed by Redis so
// limits are shared across all running instances.
type RateLimiter struct {
	rdb        *redis.Client
	trustProxy bool
}

func NewRateLimiter(rdb *redis.Client, trustProxy bool) *RateLimiter {
	return &RateLimiter{rdb: rdb, trustProxy: trustProxy}
}

// Limit allows at most `limit` requests per `window` per client IP for the named bucket.
func (rl *RateLimiter) Limit(name string, limit int64, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			windowSecs := int64(window.Seconds())
			now := time.Now().Unix()
			bucket := now / windowSecs
			key := fmt.Sprintf("ratelimit:%s:%s:%d", name, rl.clientIP(r), bucket)

			pipe := rl.rdb.TxPipeline()
			incr := pipe.Incr(r.Context(), key)
			pipe.Expire(r.Context(), key, window)
			if _, err := pipe.Exec(r.Context()); err != nil {
				// Fail open: a Redis outage shouldn't take the whole API down
				slog.Warn("rate limiter unavailable, allowing request", "err", err)
				next.ServeHTTP(w, r)
				return
			}

			count := incr.Val()
			w.Header().Set("X-RateLimit-Limit", strconv.FormatInt(limit, 10))
			w.Header().Set("X-RateLimit-Remaining", strconv.FormatInt(max(limit-count, 0), 10))
			if count > limit {
				w.Header().Set("Retry-After", strconv.FormatInt((bucket+1)*windowSecs-now, 10))
				httpx.Error(w, http.StatusTooManyRequests, "too many requests, slow down")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (rl *RateLimiter) clientIP(r *http.Request) string {
	if rl.trustProxy {
		if ip := r.Header.Get("X-Real-IP"); ip != "" {
			return ip
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			// The rightmost entry is the one appended by our own proxy; earlier ones are client-controlled
			parts := strings.Split(xff, ",")
			return strings.TrimSpace(parts[len(parts)-1])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
