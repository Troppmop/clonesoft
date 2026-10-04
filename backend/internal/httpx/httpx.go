// Package httpx holds small JSON request/response helpers shared by the handlers.
package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
)

const maxBodyBytes = 1 << 20 // 1 MiB

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}

// Decode reads a single JSON object into dst, rejecting unknown fields and oversized bodies.
func Decode(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	if dec.More() {
		return errors.New("body must contain a single JSON object")
	}
	return nil
}

// Optional distinguishes a JSON field that is absent from one explicitly set to null,
// which PATCH handlers need for clearing nullable columns.
type Optional[T any] struct {
	Set   bool
	Null  bool
	Value T
}

func (o *Optional[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		o.Null = true
		return nil
	}
	return json.Unmarshal(b, &o.Value)
}

// Ptr returns nil for an explicit null, otherwise a pointer to the value.
func (o Optional[T]) Ptr() *T {
	if o.Null {
		return nil
	}
	return &o.Value
}
