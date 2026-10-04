package api

import (
	"net/http"
	"net/url"
	"strings"

	"clonesoft/internal/auth"
	"clonesoft/internal/httpx"
	"clonesoft/internal/push"
)

// The server POSTs to whatever endpoint a browser hands it, so endpoints are limited to the
// browser vendors' push services. Otherwise a user could make the server send requests to any host.
var pushHostSuffixes = []string{
	".googleapis.com",            // Chrome, Edge on Android, Samsung Internet, Opera, Brave
	".push.services.mozilla.com", // Firefox
	".notify.windows.com",        // Edge on Windows
	".push.apple.com",            // Safari
}

func validPushEndpoint(endpoint string) bool {
	if len(endpoint) > 1024 {
		return false
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.Port() != "" {
		return false
	}
	host := "." + strings.ToLower(u.Hostname())
	for _, suffix := range pushHostSuffixes {
		if strings.HasSuffix(host, suffix) {
			return true
		}
	}
	return false
}

func (s *Server) pushKey(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{"publicKey": s.push.PublicKey()})
}

// POST /api/push/subscriptions takes the JSON form of a browser PushSubscription.
func (s *Server) subscribePush(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint       string   `json:"endpoint"`
		ExpirationTime *float64 `json:"expirationTime"`
		Keys           struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	if !validPushEndpoint(in.Endpoint) {
		badRequest(w, "unsupported push service")
		return
	}
	if in.Keys.P256dh == "" || len(in.Keys.P256dh) > 200 || in.Keys.Auth == "" || len(in.Keys.Auth) > 100 {
		badRequest(w, "invalid subscription keys")
		return
	}
	// An endpoint belongs to one browser profile, so if another account subscribed it before, it moves here
	_, err := s.db.Exec(r.Context(), `
		INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
		ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
		auth.UserID(r.Context()), in.Endpoint, in.Keys.P256dh, in.Keys.Auth)
	if err != nil {
		serverError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) unsubscribePush(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint string `json:"endpoint"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	_, err := s.db.Exec(r.Context(), `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
		in.Endpoint, auth.UserID(r.Context()))
	if err != nil {
		serverError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) testPush(w http.ResponseWriter, r *http.Request) {
	sent, err := s.push.SendToUser(r.Context(), auth.UserID(r.Context()), push.Message{
		Title: "Reminders are on",
		Body:  "You'll get a reminder like this when a reading portion is waiting.",
		URL:   "/apps/learning",
		Tag:   "test",
	})
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"sent": sent})
}
