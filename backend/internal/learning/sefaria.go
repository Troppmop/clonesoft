package learning

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Text is one section of Hebrew text, split into its segments (verses, mishnayot or Talmud lines).
type Text struct {
	Ref      string   `json:"ref"`
	HeRef    string   `json:"heRef"`
	Segments []string `json:"segments"`
}

// Texts loads Hebrew texts from Sefaria, caching them in Postgres for every user.
type Texts struct {
	db     *pgxpool.Pool
	client *http.Client
}

func NewTexts(db *pgxpool.Pool) *Texts {
	return &Texts{db: db, client: &http.Client{Timeout: 20 * time.Second}}
}

const fetchConcurrency = 6

// Get returns the texts for refs, in the same order. Refs must already be validated with ParseRef.
func (t *Texts) Get(ctx context.Context, refs []string) ([]Text, error) {
	found := map[string]Text{}
	rows, err := t.db.Query(ctx, `SELECT ref, he_ref, segments FROM text_cache WHERE ref = ANY($1)`, refs)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var txt Text
		if err := rows.Scan(&txt.Ref, &txt.HeRef, &txt.Segments); err != nil {
			rows.Close()
			return nil, err
		}
		found[txt.Ref] = txt
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var missing []string
	for _, ref := range refs {
		if _, ok := found[ref]; !ok && !slices.Contains(missing, ref) {
			missing = append(missing, ref)
		}
	}
	if len(missing) > 0 {
		var (
			mu       sync.Mutex
			wg       sync.WaitGroup
			firstErr error
			sem      = make(chan struct{}, fetchConcurrency)
		)
		for _, ref := range missing {
			wg.Add(1)
			go func() {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				txt, version, err := t.fetch(ctx, ref)
				if err == nil {
					_, err = t.db.Exec(ctx, `INSERT INTO text_cache (ref, he_ref, segments, version)
						VALUES ($1, $2, $3, $4) ON CONFLICT (ref) DO NOTHING`, txt.Ref, txt.HeRef, txt.Segments, version)
				}
				mu.Lock()
				defer mu.Unlock()
				if err != nil {
					if firstErr == nil {
						firstErr = fmt.Errorf("load %s: %w", ref, err)
					}
					return
				}
				found[ref] = txt
			}()
		}
		wg.Wait()
		if firstErr != nil {
			return nil, firstErr
		}
	}

	out := make([]Text, len(refs))
	for i, ref := range refs {
		out[i] = found[ref]
	}
	return out, nil
}

// fetch reads one section's primary Hebrew version from Sefaria. return_format=text_only makes
// Sefaria strip HTML, footnotes and inline notes, so only the bare text remains.
func (t *Texts) fetch(ctx context.Context, ref string) (Text, string, error) {
	u := "https://www.sefaria.org/api/v3/texts/" + url.PathEscape(ref) + "?version=hebrew&return_format=text_only"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return Text{}, "", err
	}
	req.Header.Set("Accept", "application/json")
	res, err := t.client.Do(req)
	if err != nil {
		return Text{}, "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Text{}, "", fmt.Errorf("sefaria returned %s", res.Status)
	}

	var body struct {
		HeRef    string `json:"heRef"`
		Versions []struct {
			Language     string          `json:"language"`
			VersionTitle string          `json:"versionTitle"`
			Text         json.RawMessage `json:"text"`
		} `json:"versions"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 8<<20)).Decode(&body); err != nil {
		return Text{}, "", err
	}
	for _, v := range body.Versions {
		if v.Language != "he" {
			continue
		}
		var raw any
		if err := json.Unmarshal(v.Text, &raw); err != nil {
			return Text{}, "", err
		}
		var segments []string
		flatten(raw, &segments)
		if len(segments) == 0 {
			break
		}
		for i, s := range segments {
			segments[i] = clean(s)
		}
		return Text{Ref: ref, HeRef: body.HeRef, Segments: segments}, v.VersionTitle, nil
	}
	return Text{}, "", errors.New("no Hebrew text available")
}

func flatten(v any, out *[]string) {
	switch v := v.(type) {
	case string:
		*out = append(*out, v)
	case []any:
		for _, item := range v {
			flatten(item, out)
		}
	}
}

var (
	tagRe   = regexp.MustCompile(`<[^>]*>`)
	spaceRe = regexp.MustCompile(`\s+`)
	// Open and closed paragraph markers in the Masoretic text, which only matter for scribes
	parashaRe = regexp.MustCompile(`\{[פס]\}`)
)

// clean is a second line of defense in case any markup survives text_only.
func clean(s string) string {
	s = tagRe.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	s = parashaRe.ReplaceAllString(s, "")
	return strings.TrimSpace(spaceRe.ReplaceAllString(s, " "))
}
