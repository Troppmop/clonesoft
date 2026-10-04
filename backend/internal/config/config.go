package config

import (
	"errors"
	"os"
	"strings"
)

type Config struct {
	Env            string // "development" or "production"
	Port           string
	DatabaseURL    string
	RedisURL       string
	StaticDir      string   // directory containing the built frontend; empty disables static serving
	AllowedOrigins []string // extra origins allowed to make state-changing requests (e.g. the Vite dev server)
	TrustProxy     bool     // read the client IP from proxy headers (enable behind Railway's proxy)

	// Web Push (VAPID) keys. When unset, a key pair is generated once and stored in the database.
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string // contact email or https URL sent to push services
}

func (c Config) Production() bool { return c.Env == "production" }

func Load() (Config, error) {
	c := Config{
		Env:         getenv("APP_ENV", "development"),
		Port:        getenv("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		RedisURL:    os.Getenv("REDIS_URL"),
		StaticDir:   os.Getenv("STATIC_DIR"),
		TrustProxy:  os.Getenv("TRUST_PROXY") == "true",

		VAPIDPublicKey:  os.Getenv("VAPID_PUBLIC_KEY"),
		VAPIDPrivateKey: os.Getenv("VAPID_PRIVATE_KEY"),
		VAPIDSubject:    getenv("VAPID_SUBJECT", "admin@example.com"),
	}
	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.AllowedOrigins = append(c.AllowedOrigins, o)
		}
	}
	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	if c.RedisURL == "" {
		return c, errors.New("REDIS_URL is required")
	}
	return c, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
