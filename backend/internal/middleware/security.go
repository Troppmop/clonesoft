package middleware

import (
	"net/http"
	"net/url"
	"slices"

	"clonesoft/internal/httpx"
)

const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; " +
	"frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

func SecurityHeaders(production bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("Content-Security-Policy", contentSecurityPolicy)
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
			h.Set("Cross-Origin-Opener-Policy", "same-origin")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			if production {
				h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

// CheckOrigin blocks cross-site state-changing requests (CSRF). It complements the
// SameSite=Lax session cookie: browsers always send Origin on cross-origin POST/PATCH/DELETE.
func CheckOrigin(allowed []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}
			origin := r.Header.Get("Origin")
			if origin == "" {
				// Non-browser clients omit Origin; fall back to Fetch Metadata when present
				if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
					httpx.Error(w, http.StatusForbidden, "cross-site request blocked")
					return
				}
				next.ServeHTTP(w, r)
				return
			}
			if u, err := url.Parse(origin); err == nil && u.Host == r.Host || slices.Contains(allowed, origin) {
				next.ServeHTTP(w, r)
				return
			}
			httpx.Error(w, http.StatusForbidden, "cross-site request blocked")
		})
	}
}

// NoStore prevents API responses (which contain private user data) from being cached.
func NoStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}
