package api

import (
	"errors"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"clonesoft/internal/auth"
	"clonesoft/internal/httpx"
)

type Note struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type NoteSummary struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Preview   string    `json:"preview"`
	UpdatedAt time.Time `json:"updatedAt"`
}

const (
	noteColumns       = "id, title, content, created_at, updated_at"
	maxTitleLen       = 200
	maxNoteContentLen = 100_000
)

func scanNote(row pgx.Row) (Note, error) {
	var n Note
	err := row.Scan(&n.ID, &n.Title, &n.Content, &n.CreatedAt, &n.UpdatedAt)
	return n, err
}

func validateNoteFields(title, content *string) string {
	if title != nil && utf8.RuneCountInString(*title) > maxTitleLen {
		return "title is too long"
	}
	if content != nil && utf8.RuneCountInString(*content) > maxNoteContentLen {
		return "note is too long"
	}
	return ""
}

// GET /api/notes?q=search
func (s *Server) listNotes(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	rows, err := s.db.Query(r.Context(), `
		SELECT id, title, left(content, 160), updated_at
		FROM notes
		WHERE user_id = $1 AND ($2 = '' OR title ILIKE $3 OR content ILIKE $3)
		ORDER BY updated_at DESC
		LIMIT 500`,
		auth.UserID(r.Context()), q, "%"+escapeLike(q)+"%")
	if err != nil {
		serverError(w, r, err)
		return
	}
	notes, err := pgx.CollectRows(rows, pgx.RowToStructByPos[NoteSummary])
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, notes)
}

func (s *Server) createNote(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	if msg := validateNoteFields(&in.Title, &in.Content); msg != "" {
		badRequest(w, msg)
		return
	}
	n, err := scanNote(s.db.QueryRow(r.Context(),
		`INSERT INTO notes (user_id, title, content) VALUES ($1, $2, $3) RETURNING `+noteColumns,
		auth.UserID(r.Context()), in.Title, in.Content))
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, n)
}

func (s *Server) getNote(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	n, err := scanNote(s.db.QueryRow(r.Context(),
		`SELECT `+noteColumns+` FROM notes WHERE id = $1 AND user_id = $2`, id, auth.UserID(r.Context())))
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "note not found")
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, n)
}

func (s *Server) updateNote(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Title   *string `json:"title"`
		Content *string `json:"content"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	if msg := validateNoteFields(in.Title, in.Content); msg != "" {
		badRequest(w, msg)
		return
	}
	var u updateBuilder
	if in.Title != nil {
		u.set("title", *in.Title)
	}
	if in.Content != nil {
		u.set("content", *in.Content)
	}
	if u.empty() {
		badRequest(w, "nothing to update")
		return
	}
	u.setRaw("updated_at = now()")
	query := `UPDATE notes SET ` + u.clause() + u.whereOwned(id, auth.UserID(r.Context())) + ` RETURNING ` + noteColumns
	n, err := scanNote(s.db.QueryRow(r.Context(), query, u.args...))
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "note not found")
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, n)
}

// Deleting a note keeps its linked todos and events; their link is cleared by the foreign key.
func (s *Server) deleteNote(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM notes WHERE id = $1 AND user_id = $2`, id, auth.UserID(r.Context()))
	if err != nil {
		serverError(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "note not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
