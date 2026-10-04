package api

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"clonesoft/internal/auth"
	"clonesoft/internal/httpx"
)

type Todo struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Done        bool       `json:"done"`
	DueDate     *string    `json:"dueDate"` // YYYY-MM-DD
	Priority    int        `json:"priority"`
	NoteID      *string    `json:"noteId"`
	NoteTitle   *string    `json:"noteTitle"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	CompletedAt *time.Time `json:"completedAt"`
}

// Every todo query selects from an alias "t" joined to its note, so responses include the note title.
const todoSelect = `SELECT t.id, t.title, t.done, t.due_date::text, t.priority, t.note_id, n.title,
	t.created_at, t.updated_at, t.completed_at
	FROM t LEFT JOIN notes n ON n.id = t.note_id`

func scanTodo(row pgx.Row) (Todo, error) {
	var t Todo
	err := row.Scan(&t.ID, &t.Title, &t.Done, &t.DueDate, &t.Priority, &t.NoteID, &t.NoteTitle,
		&t.CreatedAt, &t.UpdatedAt, &t.CompletedAt)
	return t, err
}

func validateTodoTitle(title string) string {
	if n := utf8.RuneCountInString(strings.TrimSpace(title)); n < 1 || n > maxTitleLen {
		return "title must be between 1 and 200 characters"
	}
	return ""
}

// GET /api/todos?status=open|done&from=YYYY-MM-DD&to=YYYY-MM-DD&noteId=
// from/to filter on due date (inclusive) and exclude todos without one.
func (s *Server) listTodos(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var b updateBuilder
	conds := []string{"user_id = " + b.arg(auth.UserID(r.Context()))}

	switch q.Get("status") {
	case "open":
		conds = append(conds, "NOT done")
	case "done":
		conds = append(conds, "done")
	case "", "all":
	default:
		badRequest(w, "status must be open, done or all")
		return
	}
	for param, op := range map[string]string{"from": ">=", "to": "<="} {
		if v := q.Get(param); v != "" {
			if !validDate(v) {
				badRequest(w, param+" must be a date (YYYY-MM-DD)")
				return
			}
			conds = append(conds, "due_date "+op+" "+b.arg(v)+"::date")
		}
	}
	if v := q.Get("noteId"); v != "" {
		if !validUUID(v) {
			badRequest(w, "invalid noteId")
			return
		}
		conds = append(conds, "note_id = "+b.arg(v))
	}

	query := `WITH t AS (SELECT * FROM todos WHERE ` + strings.Join(conds, " AND ") + `) ` + todoSelect +
		` ORDER BY t.done, t.due_date NULLS LAST, t.priority DESC, t.created_at DESC LIMIT 1000`
	rows, err := s.db.Query(r.Context(), query, b.args...)
	if err != nil {
		serverError(w, r, err)
		return
	}
	todos, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Todo, error) { return scanTodo(row) })
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, todos)
}

func (s *Server) createTodo(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Title    string  `json:"title"`
		DueDate  *string `json:"dueDate"`
		Priority int     `json:"priority"`
		NoteID   *string `json:"noteId"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	if msg := validateTodoTitle(in.Title); msg != "" {
		badRequest(w, msg)
		return
	}
	if in.DueDate != nil && !validDate(*in.DueDate) {
		badRequest(w, "dueDate must be a date (YYYY-MM-DD)")
		return
	}
	if in.Priority < 0 || in.Priority > 3 {
		badRequest(w, "priority must be between 0 and 3")
		return
	}
	if in.NoteID != nil && !validUUID(*in.NoteID) {
		badRequest(w, "linked note does not exist")
		return
	}
	t, err := scanTodo(s.db.QueryRow(r.Context(), `
		WITH t AS (
			INSERT INTO todos (user_id, title, due_date, priority, note_id)
			VALUES ($1, $2, $3::date, $4, $5)
			RETURNING *
		) `+todoSelect,
		auth.UserID(r.Context()), strings.TrimSpace(in.Title), in.DueDate, in.Priority, in.NoteID))
	if err != nil {
		writeDBError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, t)
}

func (s *Server) updateTodo(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Title    *string                `json:"title"`
		Done     *bool                  `json:"done"`
		DueDate  httpx.Optional[string] `json:"dueDate"`
		Priority *int                   `json:"priority"`
		NoteID   httpx.Optional[string] `json:"noteId"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}

	var u updateBuilder
	if in.Title != nil {
		if msg := validateTodoTitle(*in.Title); msg != "" {
			badRequest(w, msg)
			return
		}
		u.set("title", strings.TrimSpace(*in.Title))
	}
	if in.Done != nil {
		done := u.arg(*in.Done)
		u.setRaw("done = " + done)
		u.setRaw("completed_at = CASE WHEN " + done + "::boolean THEN coalesce(completed_at, now()) ELSE NULL END")
	}
	if in.DueDate.Set {
		if !in.DueDate.Null && !validDate(in.DueDate.Value) {
			badRequest(w, "dueDate must be a date (YYYY-MM-DD)")
			return
		}
		u.setRaw("due_date = " + u.arg(in.DueDate.Ptr()) + "::date")
	}
	if in.Priority != nil {
		if *in.Priority < 0 || *in.Priority > 3 {
			badRequest(w, "priority must be between 0 and 3")
			return
		}
		u.set("priority", *in.Priority)
	}
	if in.NoteID.Set {
		if !in.NoteID.Null && !validUUID(in.NoteID.Value) {
			badRequest(w, "linked note does not exist")
			return
		}
		u.set("note_id", in.NoteID.Ptr())
	}
	if u.empty() {
		badRequest(w, "nothing to update")
		return
	}
	u.setRaw("updated_at = now()")

	query := `WITH t AS (UPDATE todos SET ` + u.clause() + u.whereOwned(id, auth.UserID(r.Context())) +
		` RETURNING *) ` + todoSelect
	t, err := scanTodo(s.db.QueryRow(r.Context(), query, u.args...))
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "todo not found")
		return
	}
	if err != nil {
		writeDBError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, t)
}

func (s *Server) deleteTodo(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM todos WHERE id = $1 AND user_id = $2`, id, auth.UserID(r.Context()))
	if err != nil {
		serverError(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "todo not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
