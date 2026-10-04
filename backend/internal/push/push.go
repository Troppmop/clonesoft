// Package push sends Web Push notifications and runs the Learning app's daily reading reminders.
package push

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Message is the JSON payload the service worker (frontend/public/sw.js) turns into a notification.
type Message struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`           // page to open when the notification is clicked
	Tag   string `json:"tag,omitempty"` // a newer notification with the same tag replaces the older one
}

type Service struct {
	db         *pgxpool.Pool
	publicKey  string
	privateKey string
	subject    string
	client     *http.Client
}

// New uses the configured VAPID key pair, or else one generated on first start and kept in the
// database, so push subscriptions keep working across restarts without any configuration.
func New(ctx context.Context, db *pgxpool.Pool, publicKey, privateKey, subject string) (*Service, error) {
	s := &Service{db: db, subject: subject, client: &http.Client{Timeout: 15 * time.Second}}
	if publicKey != "" && privateKey != "" {
		s.publicKey, s.privateKey = publicKey, privateKey
		return s, nil
	}
	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return nil, err
	}
	// If several instances start at once, the first insert wins and everyone reads that pair back
	if _, err := db.Exec(ctx, `INSERT INTO app_secrets (name, value) VALUES
		('vapid_public_key', $1), ('vapid_private_key', $2) ON CONFLICT (name) DO NOTHING`, pub, priv); err != nil {
		return nil, err
	}
	err = db.QueryRow(ctx, `SELECT
		(SELECT value FROM app_secrets WHERE name = 'vapid_public_key'),
		(SELECT value FROM app_secrets WHERE name = 'vapid_private_key')`).Scan(&s.publicKey, &s.privateKey)
	return s, err
}

func (s *Service) PublicKey() string { return s.publicKey }

// SendToUser delivers msg to every device the user subscribed, returning how many accepted it.
// Subscriptions the push service reports as gone are deleted.
func (s *Service) SendToUser(ctx context.Context, userID string, msg Message) (int, error) {
	payload, err := json.Marshal(msg)
	if err != nil {
		return 0, err
	}
	rows, err := s.db.Query(ctx, `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, userID)
	if err != nil {
		return 0, err
	}
	subs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (webpush.Subscription, error) {
		var sub webpush.Subscription
		err := row.Scan(&sub.Endpoint, &sub.Keys.P256dh, &sub.Keys.Auth)
		return sub, err
	})
	if err != nil {
		return 0, err
	}

	sent := 0
	for _, sub := range subs {
		res, err := webpush.SendNotificationWithContext(ctx, payload, &sub, &webpush.Options{
			HTTPClient:      s.client,
			Subscriber:      s.subject,
			VAPIDPublicKey:  s.publicKey,
			VAPIDPrivateKey: s.privateKey,
			Topic:           topic(msg.Tag),
			TTL:             12 * 60 * 60,
			Urgency:         webpush.UrgencyNormal,
		})
		if err != nil {
			slog.Warn("push failed", "err", err)
			continue
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 4096))
		res.Body.Close()
		switch {
		case res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone:
			if _, err := s.db.Exec(ctx, `DELETE FROM push_subscriptions WHERE endpoint = $1`, sub.Endpoint); err != nil {
				slog.Error("delete expired push subscription", "err", err)
			}
		case res.StatusCode >= 300:
			slog.Warn("push rejected", "status", res.StatusCode)
		default:
			sent++
		}
	}
	return sent, nil
}

// topic turns a tag into a valid Topic header: at most 32 URL-safe characters. It keeps the last
// 32 alphanumerics, so "plan-<uuid>" becomes the UUID's hex digits.
func topic(tag string) string {
	var out []byte
	for i := 0; i < len(tag); i++ {
		if c := tag[i]; c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' {
			out = append(out, c)
		}
	}
	return string(out[max(0, len(out)-32):])
}

// RunReminders checks every minute for reading plans whose local reminder time has passed today,
// and reminds their owners if they haven't read every portion due so far. It returns when ctx ends.
func (s *Service) RunReminders(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		if err := s.sendDueReminders(ctx); err != nil && !errors.Is(err, context.Canceled) {
			slog.Error("reading reminders", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

type dueReminder struct {
	planID, userID, title string
	days, dayIndex, done  int
}

func (s *Service) sendDueReminders(ctx context.Context) error {
	// Claiming plans by setting last_reminded_on in the same statement means each plan is reminded
	// once per local day, even with several server instances running this loop.
	rows, err := s.db.Query(ctx, `
		UPDATE reading_plans p SET last_reminded_on = (now() AT TIME ZONE p.timezone)::date
		WHERE p.reminder_time IS NOT NULL
			AND (now() AT TIME ZONE p.timezone)::time >= p.reminder_time
			AND (now() AT TIME ZONE p.timezone)::date BETWEEN p.start_date AND p.start_date + p.days - 1
			AND (p.last_reminded_on IS NULL OR p.last_reminded_on < (now() AT TIME ZONE p.timezone)::date)
		RETURNING p.id, p.user_id, p.title, p.days,
			(now() AT TIME ZONE p.timezone)::date - p.start_date,
			(SELECT count(*) FROM reading_progress r WHERE r.plan_id = p.id
				AND r.day_index <= (now() AT TIME ZONE p.timezone)::date - p.start_date)`)
	if err != nil {
		return err
	}
	due, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (dueReminder, error) {
		var d dueReminder
		err := row.Scan(&d.planID, &d.userID, &d.title, &d.days, &d.dayIndex, &d.done)
		return d, err
	})
	if err != nil {
		return err
	}

	for _, d := range due {
		behind := d.dayIndex + 1 - d.done
		if behind <= 0 {
			continue
		}
		body := fmt.Sprintf("Today's portion is ready: day %d of %d.", d.dayIndex+1, d.days)
		if behind > 1 {
			body = fmt.Sprintf("You have %d portions to catch up on (day %d of %d).", behind, d.dayIndex+1, d.days)
		}
		msg := Message{
			Title: d.title,
			Body:  body,
			URL:   "/apps/learning/plans/" + d.planID + "/day/next",
			Tag:   "plan-" + d.planID,
		}
		if _, err := s.SendToUser(ctx, d.userID, msg); err != nil {
			slog.Error("send reading reminder", "plan", d.planID, "err", err)
		}
	}
	return nil
}
