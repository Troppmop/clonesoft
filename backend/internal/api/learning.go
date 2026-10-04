package api

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"clonesoft/internal/auth"
	"clonesoft/internal/httpx"
	"clonesoft/internal/learning"
)

const maxTextRefs = 80

// GET /api/learning/texts?ref=Genesis 1&ref=Genesis 2 returns those sections' Hebrew text, in order.
func (s *Server) getTexts(w http.ResponseWriter, r *http.Request) {
	refs := r.URL.Query()["ref"]
	if len(refs) == 0 || len(refs) > maxTextRefs {
		badRequest(w, "pass between 1 and 80 refs")
		return
	}
	for _, ref := range refs {
		if _, ok := learning.ParseRef(ref); !ok {
			badRequest(w, "unknown ref: "+ref)
			return
		}
	}
	texts, err := s.texts.Get(r.Context(), refs)
	if err != nil {
		if r.Context().Err() == nil {
			serverError(w, r, err)
		}
		return
	}
	// The texts are public and never change, so the browser and the service worker may keep them
	w.Header().Set("Cache-Control", "private, max-age=2592000, immutable")
	httpx.JSON(w, http.StatusOK, texts)
}

// --- reading plans ---

type Plan struct {
	ID           string    `json:"id"`
	Corpus       string    `json:"corpus"`
	Title        string    `json:"title"`
	StartDate    string    `json:"startDate"` // YYYY-MM-DD
	Days         int       `json:"days"`
	ReminderTime *string   `json:"reminderTime"` // HH:MM in Timezone, or null for no reminders
	Timezone     string    `json:"timezone"`
	Completed    []int     `json:"completed"` // completed day indexes, starting at 0
	CreatedAt    time.Time `json:"createdAt"`
}

const planSelect = `SELECT p.id, p.corpus, p.title, p.start_date::text, p.days, to_char(p.reminder_time, 'HH24:MI'),
	p.timezone, coalesce((SELECT array_agg(day_index ORDER BY day_index) FROM reading_progress r WHERE r.plan_id = p.id), '{}'),
	p.created_at FROM reading_plans p`

func scanPlan(row pgx.Row) (Plan, error) {
	var p Plan
	err := row.Scan(&p.ID, &p.Corpus, &p.Title, &p.StartDate, &p.Days, &p.ReminderTime, &p.Timezone, &p.Completed, &p.CreatedAt)
	return p, err
}

func (s *Server) loadPlan(ctx context.Context, id, userID string) (Plan, error) {
	return scanPlan(s.db.QueryRow(ctx, planSelect+` WHERE p.id = $1 AND p.user_id = $2`, id, userID))
}

func (s *Server) listPlans(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), planSelect+` WHERE p.user_id = $1 ORDER BY p.created_at LIMIT 100`,
		auth.UserID(r.Context()))
	if err != nil {
		serverError(w, r, err)
		return
	}
	plans, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Plan, error) { return scanPlan(row) })
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, plans)
}

var reminderTimeRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

func validatePlanTitle(title string) string {
	if n := utf8.RuneCountInString(strings.TrimSpace(title)); n < 1 || n > maxTitleLen {
		return "title must be between 1 and 200 characters"
	}
	return ""
}

// validTimezone asks Postgres, since the reminder query converts times with AT TIME ZONE and a
// name Postgres doesn't know would make that query fail for every plan.
func (s *Server) validTimezone(ctx context.Context, tz string) (bool, error) {
	if tz == "" || len(tz) > 64 {
		return false, nil
	}
	var ok bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = $1)`, tz).Scan(&ok)
	return ok, err
}

// Setting a reminder time that has already passed today shouldn't send a reminder right away,
// so last_reminded_on is marked as today in that case.
func lastRemindedExpr(reminderTime, timezone string) string {
	return "CASE WHEN " + reminderTime + " IS NOT NULL AND (now() AT TIME ZONE " + timezone + ")::time >= " + reminderTime +
		" THEN (now() AT TIME ZONE " + timezone + ")::date END"
}

func (s *Server) createPlan(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Corpus       string  `json:"corpus"`
		Title        string  `json:"title"`
		StartDate    string  `json:"startDate"`
		Days         int     `json:"days"`
		ReminderTime *string `json:"reminderTime"`
		Timezone     string  `json:"timezone"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	switch in.Corpus {
	case "tanakh", "mishnah", "bavli":
	default:
		badRequest(w, "corpus must be tanakh, mishnah or bavli")
		return
	}
	if msg := validatePlanTitle(in.Title); msg != "" {
		badRequest(w, msg)
		return
	}
	if !validDate(in.StartDate) {
		badRequest(w, "startDate must be a date (YYYY-MM-DD)")
		return
	}
	if in.Days < 1 || in.Days > 10000 {
		badRequest(w, "days must be between 1 and 10000")
		return
	}
	if in.ReminderTime != nil && !reminderTimeRe.MatchString(*in.ReminderTime) {
		badRequest(w, "reminderTime must be a time (HH:MM)")
		return
	}
	if ok, err := s.validTimezone(r.Context(), in.Timezone); err != nil {
		serverError(w, r, err)
		return
	} else if !ok {
		badRequest(w, "unknown timezone")
		return
	}

	var id string
	err := s.db.QueryRow(r.Context(), `
		INSERT INTO reading_plans (user_id, corpus, title, start_date, days, reminder_time, timezone, last_reminded_on)
		VALUES ($1, $2, $3, $4::date, $5, $6::time, $7, `+lastRemindedExpr("$6::time", "$7::text")+`)
		RETURNING id`,
		auth.UserID(r.Context()), in.Corpus, strings.TrimSpace(in.Title), in.StartDate, in.Days, in.ReminderTime, in.Timezone,
	).Scan(&id)
	if err != nil {
		writeDBError(w, r, err)
		return
	}
	plan, err := s.loadPlan(r.Context(), id, auth.UserID(r.Context()))
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, plan)
}

func (s *Server) updatePlan(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Title        *string                `json:"title"`
		ReminderTime httpx.Optional[string] `json:"reminderTime"`
		Timezone     *string                `json:"timezone"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}

	var u updateBuilder
	if in.Title != nil {
		if msg := validatePlanTitle(*in.Title); msg != "" {
			badRequest(w, msg)
			return
		}
		u.set("title", strings.TrimSpace(*in.Title))
	}
	if in.ReminderTime.Set {
		if !in.ReminderTime.Null && !reminderTimeRe.MatchString(in.ReminderTime.Value) {
			badRequest(w, "reminderTime must be a time (HH:MM)")
			return
		}
		u.setRaw("reminder_time = " + u.arg(in.ReminderTime.Ptr()) + "::time")
	}
	if in.Timezone != nil {
		if ok, err := s.validTimezone(r.Context(), *in.Timezone); err != nil {
			serverError(w, r, err)
			return
		} else if !ok {
			badRequest(w, "unknown timezone")
			return
		}
		u.set("timezone", *in.Timezone)
	}
	if u.empty() {
		badRequest(w, "nothing to update")
		return
	}
	u.setRaw("updated_at = now()")

	userID := auth.UserID(r.Context())
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		serverError(w, r, err)
		return
	}
	defer tx.Rollback(r.Context())
	tag, err := tx.Exec(r.Context(), `UPDATE reading_plans SET `+u.clause()+u.whereOwned(id, userID), u.args...)
	if err != nil {
		writeDBError(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "plan not found")
		return
	}
	if in.ReminderTime.Set || in.Timezone != nil {
		if _, err := tx.Exec(r.Context(), `UPDATE reading_plans SET last_reminded_on = `+
			lastRemindedExpr("reminder_time", "timezone")+` WHERE id = $1`, id); err != nil {
			serverError(w, r, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, r, err)
		return
	}
	plan, err := s.loadPlan(r.Context(), id, userID)
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, plan)
}

func (s *Server) deletePlan(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM reading_plans WHERE id = $1 AND user_id = $2`, id, auth.UserID(r.Context()))
	if err != nil {
		serverError(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "plan not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PUT and DELETE /api/learning/plans/{id}/progress/{day} mark a day's portion as read or unread.
func (s *Server) markDay(w http.ResponseWriter, r *http.Request)   { s.setDay(w, r, true) }
func (s *Server) unmarkDay(w http.ResponseWriter, r *http.Request) { s.setDay(w, r, false) }

func (s *Server) setDay(w http.ResponseWriter, r *http.Request, done bool) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	day, err := strconv.Atoi(chi.URLParam(r, "day"))
	if err != nil || day < 0 {
		badRequest(w, "day must be a non-negative number")
		return
	}
	userID := auth.UserID(r.Context())
	var days int
	err = s.db.QueryRow(r.Context(), `SELECT days FROM reading_plans WHERE id = $1 AND user_id = $2`, id, userID).Scan(&days)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "plan not found")
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	if day >= days {
		badRequest(w, "day is past the end of the plan")
		return
	}
	if done {
		_, err = s.db.Exec(r.Context(), `INSERT INTO reading_progress (plan_id, day_index) VALUES ($1, $2)
			ON CONFLICT DO NOTHING`, id, day)
	} else {
		_, err = s.db.Exec(r.Context(), `DELETE FROM reading_progress WHERE plan_id = $1 AND day_index = $2`, id, day)
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	plan, err := s.loadPlan(r.Context(), id, userID)
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, plan)
}

// --- bookmarks ---

type Bookmark struct {
	ID        string    `json:"id"`
	Ref       string    `json:"ref"`     // section ref, such as "Genesis 1" or "Berakhot 2a"
	Segment   *int      `json:"segment"` // 1-based verse or line within the section, or null for the whole section
	Label     string    `json:"label"`
	Corpus    string    `json:"corpus"`
	CreatedAt time.Time `json:"createdAt"`
}

const bookmarkColumns = "id, ref, segment, label, created_at"

func scanBookmark(row pgx.Row) (Bookmark, error) {
	var b Bookmark
	err := row.Scan(&b.ID, &b.Ref, &b.Segment, &b.Label, &b.CreatedAt)
	b.Corpus, _ = learning.ParseRef(b.Ref)
	return b, err
}

func (s *Server) listBookmarks(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT `+bookmarkColumns+` FROM bookmarks WHERE user_id = $1
		ORDER BY created_at DESC LIMIT 1000`, auth.UserID(r.Context()))
	if err != nil {
		serverError(w, r, err)
		return
	}
	list, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Bookmark, error) { return scanBookmark(row) })
	if err != nil {
		serverError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (s *Server) createBookmark(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Ref     string `json:"ref"`
		Segment *int   `json:"segment"`
		Label   string `json:"label"`
	}
	if !decodeOrBadRequest(w, r, &in) {
		return
	}
	if _, ok := learning.ParseRef(in.Ref); !ok {
		badRequest(w, "unknown ref")
		return
	}
	if in.Segment != nil && (*in.Segment < 1 || *in.Segment > 1000) {
		badRequest(w, "segment must be between 1 and 1000")
		return
	}
	if n := utf8.RuneCountInString(strings.TrimSpace(in.Label)); n < 1 || n > maxTitleLen {
		badRequest(w, "label must be between 1 and 200 characters")
		return
	}
	// Bookmarking the same place again just refreshes it
	b, err := scanBookmark(s.db.QueryRow(r.Context(), `
		INSERT INTO bookmarks (user_id, ref, segment, label) VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, ref, coalesce(segment, 0)) DO UPDATE SET label = EXCLUDED.label, created_at = now()
		RETURNING `+bookmarkColumns,
		auth.UserID(r.Context()), in.Ref, in.Segment, strings.TrimSpace(in.Label)))
	if err != nil {
		writeDBError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, b)
}

func (s *Server) deleteBookmark(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM bookmarks WHERE id = $1 AND user_id = $2`, id, auth.UserID(r.Context()))
	if err != nil {
		serverError(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "bookmark not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
