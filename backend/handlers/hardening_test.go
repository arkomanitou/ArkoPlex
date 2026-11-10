package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/gofiber/fiber/v3"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"pelagica-backend/services"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func studiosApp() *fiber.App { app := fiber.New(); app.Get("/studios", GetStudios); return app }
func resetStudiosCache(t *testing.T) {
	t.Helper()
	studiosCache.mu.Lock()
	studiosCache.entries = map[string]studiosCacheEntry{}
	studiosCache.mu.Unlock()
	t.Cleanup(func() {
		studiosCache.mu.Lock()
		studiosCache.entries = map[string]studiosCacheEntry{}
		studiosCache.mu.Unlock()
	})
}
func TestStudiosRejectsUnconfiguredOriginsBeforeNetwork(t *testing.T) {
	var calls atomic.Int32
	rogue := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer rogue.Close()
	t.Setenv("SERVER_ADDRESS", "https://jellyfin.example.invalid/base")
	t.Setenv("JELLYFIN_BACKEND_URL", rogue.URL)
	for _, query := range []string{
		"jellyfin_url=" + url.QueryEscape(rogue.URL),
		"jellyfin_backend_url=" + url.QueryEscape(rogue.URL),
		"jellyfin_url=" + url.QueryEscape("https://jellyfin.example.invalid/other"),
		"jellyfin_url=" + url.QueryEscape("https://jellyfin.example.invalid/base?secret=x"),
		"jellyfin_url=" + url.QueryEscape("file:///etc/passwd"),
	} {
		status, _ := sendArko(t, studiosApp(), "GET", "/studios?"+query, "token", nil)
		if status != 400 {
			t.Fatalf("query %q accepted: %d", query, status)
		}
	}
	if calls.Load() != 0 {
		t.Fatal("unapproved target contacted")
	}
	t.Setenv("SERVER_ADDRESS", "")
	if status, _ := sendArko(t, studiosApp(), "GET", "/studios", "token", nil); status != 400 {
		t.Fatal("unconfigured server allowed")
	}
	if calls.Load() != 0 {
		t.Fatal("unconfigured server contacted")
	}
}
func TestStudiosConfiguredBackendRetainsBasePathAndAuth(t *testing.T) {
	resetStudiosCache(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("ApiKey") != "local-test-token" {
			t.Error("token lost")
		}
		switch r.URL.Path {
		case "/jellyfin/Users/Me":
			fmt.Fprint(w, `{"Id":"test-user"}`)
		case "/jellyfin/Users/test-user/Items":
			fmt.Fprint(w, `{"Items":[{"Studios":[{"Id":"s1","Name":"Example"}]}]}`)
		default:
			t.Errorf("base path lost: %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	t.Setenv("SERVER_ADDRESS", "https://jellyfin.example.invalid/public/")
	t.Setenv("JELLYFIN_BACKEND_URL", server.URL+"/jellyfin/")
	for i := 0; i < 2; i++ {
		status, body := sendArko(t, studiosApp(), "GET", "/studios?jellyfin_url="+url.QueryEscape("https://jellyfin.example.invalid/public"), `MediaBrowser Client="test", Token="local-test-token"`, nil)
		if status != 200 || !strings.Contains(string(body), "Example") {
			t.Fatalf("studios: %d %s", status, body)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("cache ineffective: %d calls", calls.Load())
	}
}
func TestStudiosRejectsRedirectAndOversizedPayload(t *testing.T) {
	resetStudiosCache(t)
	var leaks atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaks.Add(1) }))
	defer target.Close()
	for _, mode := range []string{"redirect", "oversize", "invalid-user"} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch mode {
			case "redirect":
				http.Redirect(w, r, target.URL, 302)
			case "oversize":
				fmt.Fprint(w, `{"Id":"user"}`+strings.Repeat(" ", 1<<20))
			case "invalid-user":
				fmt.Fprint(w, `{"Id":"../admin"}`)
			}
		}))
		t.Setenv("SERVER_ADDRESS", server.URL)
		t.Setenv("JELLYFIN_BACKEND_URL", "")
		status, body := sendArko(t, studiosApp(), "GET", "/studios", "test-token", nil)
		server.Close()
		if status != 502 || strings.Contains(string(body), "test-token") {
			t.Fatalf("mode %s: %d %s", mode, status, body)
		}
	}
	if leaks.Load() != 0 {
		t.Fatal("credentials forwarded on redirect")
	}
}
func TestStudiosCacheIsBoundedAndPurgesExpiredKeys(t *testing.T) {
	resetStudiosCache(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/Users/Me" {
			fmt.Fprint(w, `{"Id":"user"}`)
		} else {
			fmt.Fprint(w, `{"Items":[]}`)
		}
	}))
	defer server.Close()
	for i := 0; i < maxStudiosCacheEntries+3; i++ {
		if _, err := getStudiosWithCache(context.Background(), server.URL, fmt.Sprintf("secret-%d", i)); err != nil {
			t.Fatal(err)
		}
	}
	studiosCache.mu.Lock()
	defer studiosCache.mu.Unlock()
	if len(studiosCache.entries) != maxStudiosCacheEntries {
		t.Fatalf("unbounded cache: %d", len(studiosCache.entries))
	}
	for key, entry := range studiosCache.entries {
		if strings.Contains(key, "secret-") || len(key) != 64 {
			t.Fatal("raw token retained in cache key")
		}
		entry.expiresAt = time.Now().Add(-time.Second)
		studiosCache.entries[key] = entry
	}
	purgeStudiosCache(time.Now())
	if len(studiosCache.entries) != 0 {
		t.Fatal("expired entries retained")
	}
}
func TestThemeReadsCannotCreateNamespaces(t *testing.T) {
	root := filepath.Join(t.TempDir(), "not-created")
	t.Setenv("SERVERS_DIR", root)
	t.Setenv("SERVER_ADDRESS", "https://jellyfin.example.invalid/base")
	app := fiber.New()
	app.Get("/themes", GetThemes)
	app.Get("/themes/:id", GetTheme)
	for i := 0; i < 30; i++ {
		if status, _ := sendArko(t, app, "GET", fmt.Sprintf("/themes?jellyfin_url=https://other%d.example.invalid", i), "", nil); status != 400 {
			t.Fatal("unconfigured namespace allowed")
		}
	}
	if status, body := sendArko(t, app, "GET", "/themes", "", nil); status != 200 || string(body) != "[]" {
		t.Fatalf("empty themes: %d %s", status, body)
	}
	if status, _ := sendArko(t, app, "GET", "/themes/missing", "", nil); status != 404 {
		t.Fatal("missing theme not 404")
	}
	if _, err := os.Stat(root); !os.IsNotExist(err) {
		t.Fatal("reads created directories")
	}
}
func TestSeerrRejectsLargeResponsesAndDoesNotFollowRedirect(t *testing.T) {
	configureArkoTest(t)
	var leaks atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaks.Add(1) }))
	defer target.Close()
	for _, mode := range []string{"redirect", "oversize", "success"} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/seerr/api/v1/auth/jellyfin" {
				t.Error("Seerr base path lost")
			}
			if mode == "redirect" {
				http.Redirect(w, r, target.URL, 307)
				return
			}
			if mode == "oversize" {
				fmt.Fprint(w, strings.Repeat("x", int(4<<20)+1))
				return
			}
			fmt.Fprint(w, `{"id":1}`)
		}))
		raw, _ := json.Marshal(server.URL + "/seerr")
		if err := services.SaveArkoPlexConfig(map[string]json.RawMessage{"seerrUrl": raw}); err != nil {
			t.Fatal(err)
		}
		app := fiber.New()
		app.Post("/login", SeerLogin)
		status, _ := sendArko(t, app, "POST", "/login", "", []byte(`{"username":"test","password":"fixture"}`))
		server.Close()
		expected := 200
		if mode == "redirect" {
			expected = 307
		}
		if mode == "oversize" {
			expected = 502
		}
		if status != expected {
			t.Fatalf("%s status: %d", mode, status)
		}
	}
	if leaks.Load() != 0 {
		t.Fatal("Seerr credentials leaked on redirect")
	}
}

func TestStatsConsentRequiresAdminAndReportsEffectiveOverride(t *testing.T) {
	configureArkoTest(t)
	path := filepath.Join(t.TempDir(), "consent")
	t.Setenv("COLLECTOR_STATS_CONSENT_FILE", path)
	t.Setenv("COLLECTOR_STATS_CONSENT", "false")
	app := fiber.New()
	app.Post("/consent", AuthMiddleware, PostStatsConsent)
	for _, token := range []string{"", "user", "invalid"} {
		if status, _ := sendArko(t, app, "POST", "/consent?consent=true", token, nil); status != 403 {
			t.Fatal("consent allowed without admin")
		}
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("denied request persisted consent")
	}
	status, body := sendArko(t, app, "POST", "/consent?consent=true", "admin", nil)
	var result struct {
		Consent       int  `json:"consent"`
		StoredConsent bool `json:"storedConsent"`
	}
	json.Unmarshal(body, &result)
	if status != 200 || result.Consent != 2 || !result.StoredConsent {
		t.Fatalf("env override lost: %d %s", status, body)
	}
	data, err := os.ReadFile(path)
	if err != nil || strings.TrimSpace(string(data)) != "true" {
		t.Fatal("admin consent not persisted")
	}
}

func TestThemeRepositoryFetchHasBoundsAndRetainsSubpath(t *testing.T) {
	configureArkoTest(t)
	t.Setenv("SERVERS_DIR", filepath.Join(t.TempDir(), "servers"))
	var leaks atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaks.Add(1) }))
	defer target.Close()
	for _, mode := range []string{"redirect", "oversize-index", "oversize-theme", "success"} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/repo/index.json":
				if mode == "redirect" {
					http.Redirect(w, r, target.URL, 302)
					return
				}
				if mode == "oversize-index" {
					fmt.Fprint(w, strings.Repeat(" ", 1<<20)+`{}`)
					return
				}
				fmt.Fprint(w, `{"themes":[{"id":"sample","path":"sample.json"}]}`)
			case "/repo/sample.json":
				if mode == "oversize-theme" {
					fmt.Fprint(w, strings.Repeat(" ", 1<<20)+`{}`)
					return
				}
				fmt.Fprint(w, `{"name":"Sample","author":"Test","description":"Fixture","version":"1","modes":["dark"],"colors":{"dark":{"background":"#000000"}}}`)
			default:
				t.Errorf("repo subpath lost: %s", r.URL.Path)
				w.WriteHeader(404)
			}
		}))
		t.Setenv("THEMES_REPO_BASE_URL", server.URL+"/repo/")
		app := fiber.New()
		app.Post("/theme/:id/install", AuthMiddleware, InstallTheme)
		status, body := sendArko(t, app, "POST", "/theme/sample/install", "admin", nil)
		server.Close()
		expected := 500
		if mode == "success" {
			expected = 204
		}
		if status != expected {
			t.Fatalf("%s: %d %s", mode, status, body)
		}
	}
	if leaks.Load() != 0 {
		t.Fatal("theme redirects followed")
	}
}
