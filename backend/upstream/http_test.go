package upstream

import (
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestReadAllEnforcesExactLimit(t *testing.T) {
	for _, size := range []int{0, 16, 17} {
		data, err := ReadAll(strings.NewReader(strings.Repeat("a", size)), 16)
		if (err != nil) != (size > 16) {
			t.Fatalf("size %d: %v", size, err)
		}
		if err == nil && len(data) != size {
			t.Fatal("body truncated")
		}
	}
}
func TestDecodeJSONChecksWholeResponse(t *testing.T) {
	for _, body := range []string{`{} trailing`, `{} {}`, `{`, `{}` + strings.Repeat(" ", 17)} {
		var target any
		if DecodeJSON(strings.NewReader(body), 16, &target) == nil {
			t.Fatalf("accepted %q", body)
		}
	}
	var target any
	if err := DecodeJSON(strings.NewReader(`{"ok":true}`), 16, &target); err != nil {
		t.Fatal(err)
	}
}
func TestClientNeverFollowsRedirects(t *testing.T) {
	var calls atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer target.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer source.Close()
	client := NewClient(time.Second)
	defer client.CloseIdleConnections()
	req, _ := http.NewRequest(http.MethodPost, source.URL, strings.NewReader("private-password"))
	req.Header.Set("Authorization", "test-secret")
	req.AddCookie(&http.Cookie{Name: "session", Value: "private-cookie"})
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 307 || calls.Load() != 0 {
		t.Fatal("redirect followed")
	}
}
func TestClientTimeoutAndContextCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer server.Close()
	client := NewClient(40 * time.Millisecond)
	defer client.CloseIdleConnections()
	if res, err := client.Get(server.URL); err == nil {
		res.Body.Close()
		t.Fatal("timeout missing")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	if res, err := client.Do(req); err == nil {
		res.Body.Close()
		t.Fatal("cancelled request sent")
	}
}
func TestLimitAppliesToDecompressedBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		zipped := gzip.NewWriter(w)
		io.WriteString(zipped, `{}`+strings.Repeat(" ", 1024))
		zipped.Close()
	}))
	defer server.Close()
	client := NewClient(time.Second)
	defer client.CloseIdleConnections()
	response, err := client.Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if !response.Uncompressed {
		t.Fatal("fixture was not automatically decompressed")
	}
	var target any
	if DecodeJSON(response.Body, 16, &target) == nil {
		t.Fatal("decompression escaped body limit")
	}
}
