package api

import (
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"clonesoft/internal/auth"
	"clonesoft/internal/httpx"
)

type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"createdAt"`
}

const userColumns = "id, email, display_name, role, created_at"

func scanUser(row pgx.Row, extra ...any) (User, error) {
	var u User
	err := row.Scan(append([]any{&u.ID, &u.Email, &u.DisplayName, &u.Role, &u.CreatedAt}, extra...)...)
	return u, err
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	name := strings.TrimSpace(in.DisplayName)

	if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email || len(email) > 254 {
		badRequest(w, "enter a valid email address")
		return
	}
	// bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently truncated
	if len(in.Password) < 8 || len(in.Password) > 72 {
		badRequest(w, "password must be between 8 and 72 characters")
		return
	}
	if n := utf8.RuneCountInString(name); n < 1 || n > 60 {
		badRequest(w, "display name must be between 1 and 60 characters")
		return
	}

	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		serverError(w, r, err)
		return
	}
	// role is never taken from the request; it always gets the column default ('user')
	u, err := scanUser(s.db.QueryRow(r.Context(),
		`INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING `+userColumns,
		email, hash, name))
	if pgCode(err) == pgUniqueViolation {
		httpx.Error(w, http.StatusConflict, "an account with this email already exists")
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	if err := s.sessions.Create(r.Context(), w, u.ID); err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, u)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	var hash string
	u, err := scanUser(s.db.QueryRow(r.Context(),
		`SELECT `+userColumns+`, password_hash FROM users WHERE lower(email) = lower($1)`,
		strings.TrimSpace(in.Email)), &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		auth.BurnPasswordCheck(in.Password)
		httpx.Error(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	if !auth.CheckPassword(hash, in.Password) {
		httpx.Error(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	// Rotate: drop any session the browser already had before issuing a new one
	if err := s.sessions.Revoke(r.Context(), r); err != nil {
		serverError(w, r, err)
		return
	}
	if err := s.sessions.Create(r.Context(), w, u.ID); err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, u)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if err := s.sessions.Destroy(r.Context(), w, r); err != nil {
		serverError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, err := scanUser(s.db.QueryRow(r.Context(),
		`SELECT `+userColumns+` FROM users WHERE id = $1`, auth.UserID(r.Context())))
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, u)
}
