package api

import (
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"clonesoft/internal/auth"
	"clonesoft/internal/httpx"
)

type Event struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	StartsAt    time.Time `json:"startsAt"`
	EndsAt      time.Time `json:"endsAt"`
	AllDay      bool      `json:"allDay"`
	Color       string    `json:"color"`
	NoteID      *string   `json:"noteId"`
	NoteTitle   *string   `json:"noteTitle"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

var eventColors = []string{"blue", "green", "red", "amber", "purple", "slate"}

const (
	maxDescriptionLen = 5000
	maxEventDuration  = 366 * 24 * time.Hour
)

// Every event query selects from an alias "e" joined to its note, so responses include the note title.
const eventSelect = `SELECT e.id, e.title, e.description, e.starts_at, e.ends_at, e.all_day, e.color,
	e.note_id, n.title, e.created_at, e.updated_at
	FROM e LEFT JOIN notes n ON n.id = e.note_id`

func scanEvent(row pgx.Row) (Event, error) {
	var e Event
	err := row.Scan(&e.ID, &e.Title, &e.Description, &e.StartsAt, &e.EndsAt, &e.AllDay, &e.Color,
		&e.NoteID, &e.NoteTitle, &e.CreatedAt, &e.UpdatedAt)
	return e, err
}

type eventInput struct {
	Title       *string                `json:"title"`
	Description *string                `json:"description"`
	StartsAt    *time.Time             `json:"startsAt"`
	EndsAt      *time.Time             `json:"endsAt"`
	AllDay      *bool                  `json:"allDay"`
	Color       *string                `json:"color"`
	NoteID      httpx.Optional[string] `json:"noteId"`
}

// validate checks the fields that are present. Start/end ordering is enforced by the database.
func (in *eventInput) validate() string {
	if in.Title != nil {
		if n := utf8.RuneCountInString(strings.TrimSpace(*in.Title)); n < 1 || n > maxTitleLen {
			return "title must be between 1 and 200 characters"
		}
	}
	if in.Description != nil && utf8.RuneCountInString(*in.Description) > maxDescriptionLen {
		return "description is too long"
	}
	if in.StartsAt != nil && in.EndsAt != nil && in.EndsAt.Sub(*in.StartsAt) > maxEventDuration {
		return "events can't be longer than a year"
	}
	if in.Color != nil && !slices.Contains(eventColors, *in.Color) {
		return "color must be one of " + strings.Join(eventColors, ", ")
	}
	if in.NoteID.Set && !in.NoteID.Null && !validUUID(in.NoteID.Value) {
		return "linked note does not exist"
	}
	return ""
}

// GET /api/events?from=RFC3339&to=RFC3339 returns events overlapping the range.
// GET /api/events?noteId= returns events linked to a note.
func (s *Server) listEvents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var b updateBuilder
	conds := []string{"user_id = " + b.arg(auth.UserID(r.Context()))}

	if noteID := q.Get("noteId"); noteID != "" {
		if !validUUID(noteID) {
			badRequest(w, "invalid noteId")
			return
		}
		conds = append(conds, "note_id = "+b.arg(noteID))
	} else {
		from, errFrom := time.Parse(time.RFC3339, q.Get("from"))
		to, errTo := time.Parse(time.RFC3339, q.Get("to"))
		if errFrom != nil || errTo != nil || !to.After(from) {
			badRequest(w, "from and to must be RFC3339 timestamps with from before to (or pass noteId)")
			return
		}
		if to.Sub(from) > 100*24*time.Hour {
			badRequest(w, "range can be at most 100 days")
			return
		}
		f, t := b.arg(from), b.arg(to)
		conds = append(conds, "starts_at < "+t, "(ends_at > "+f+" OR starts_at >= "+f+")")
	}

	query := `WITH e AS (SELECT * FROM events WHERE ` + strings.Join(conds, " AND ") + `) ` + eventSelect +
		` ORDER BY e.starts_at, e.created_at LIMIT 1000`
	rows, err := s.db.Query(r.Context(), query, b.args...)
	if err != nil {
		serverError(w, r, err)
		return
	}
	events, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Event, error) { return scanEvent(row) })
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, events)
}

func (s *Server) createEvent(w http.ResponseWriter, r *http.Request) {
	var in eventInput
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	if in.Title == nil || in.StartsAt == nil || in.EndsAt == nil {
		badRequest(w, "title, startsAt and endsAt are required")
		return
	}
	if msg := in.validate(); msg != "" {
		badRequest(w, msg)
		return
	}
	description, allDay, color := "", false, "blue"
	if in.Description != nil {
		description = *in.Description
	}
	if in.AllDay != nil {
		allDay = *in.AllDay
	}
	if in.Color != nil {
		color = *in.Color
	}
	e, err := scanEvent(s.db.QueryRow(r.Context(), `
		WITH e AS (
			INSERT INTO events (user_id, title, description, starts_at, ends_at, all_day, color, note_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING *
		) `+eventSelect,
		auth.UserID(r.Context()), strings.TrimSpace(*in.Title), description, *in.StartsAt, *in.EndsAt,
		allDay, color, in.NoteID.Ptr()))
	if err != nil {
		writeDBError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, e)
}

func (s *Server) getEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	e, err := scanEvent(s.db.QueryRow(r.Context(),
		`WITH e AS (SELECT * FROM events WHERE id = $1 AND user_id = $2) `+eventSelect,
		id, auth.UserID(r.Context())))
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, e)
}

func (s *Server) updateEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in eventInput
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	if msg := in.validate(); msg != "" {
		badRequest(w, msg)
		return
	}

	var u updateBuilder
	if in.Title != nil {
		u.set("title", strings.TrimSpace(*in.Title))
	}
	if in.Description != nil {
		u.set("description", *in.Description)
	}
	if in.StartsAt != nil {
		u.set("starts_at", *in.StartsAt)
	}
	if in.EndsAt != nil {
		u.set("ends_at", *in.EndsAt)
	}
	if in.AllDay != nil {
		u.set("all_day", *in.AllDay)
	}
	if in.Color != nil {
		u.set("color", *in.Color)
	}
	if in.NoteID.Set {
		u.set("note_id", in.NoteID.Ptr())
	}
	if u.empty() {
		badRequest(w, "nothing to update")
		return
	}
	u.setRaw("updated_at = now()")

	query := `WITH e AS (UPDATE events SET ` + u.clause() + u.whereOwned(id, auth.UserID(r.Context())) +
		` RETURNING *) ` + eventSelect
	e, err := scanEvent(s.db.QueryRow(r.Context(), query, u.args...))
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}
	if err != nil {
		writeDBError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, e)
}

func (s *Server) deleteEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM events WHERE id = $1 AND user_id = $2`, id, auth.UserID(r.Context()))
	if err != nil {
		serverError(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
