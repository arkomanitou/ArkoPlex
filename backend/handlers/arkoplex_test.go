package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gofiber/fiber/v3"
)

func arkoTestApp() *fiber.App {
	app := fiber.New()
	app.Get("/config", GetArkoPlexConfig)
	app.Put("/config", AuthMiddleware, PutArkoPlexConfig)
	app.Get("/logo/:mode", GetArkoPlexLogo)
	app.Put("/logo/:mode", AuthMiddleware, PutArkoPlexLogo)
	return app
}

func sendArko(t *testing.T, app *fiber.App, method, path, token string, data []byte) (int, []byte) {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return resp.StatusCode, body
}

func configureArkoTest(t *testing.T) {
	t.Helper()
	t.Setenv("ARKOPLEX_CONFIG_PATH", filepath.Join(t.TempDir(), "arkoplex", "config.json"))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/jellyfin/Users/Me" {
			t.Errorf("base path lost: %s", r.URL.Path)
			w.WriteHeader(404)
			return
		}
		if r.Header.Get("Authorization") == "invalid" {
			w.WriteHeader(401)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"Policy": map[string]bool{"IsAdministrator": r.Header.Get("Authorization") == "admin"}})
	}))
	t.Cleanup(server.Close)
	t.Setenv("SERVER_ADDRESS", server.URL+"/jellyfin/")
}

func TestArkoPlexPersistenceAndValidation(t *testing.T) {
	configureArkoTest(t)
	app := arkoTestApp()
	if status, body := sendArko(t, app, "GET", "/config", "", nil); status != 200 || string(body) != "{}" {
		t.Fatalf("fresh config: %d %s", status, body)
	}
	payload := []byte(`{"serverName":"ArkoPlex","nightPulseEnabled":true,"nightPulseMotion":"off","homeScreenSections":[{"type":"continueWatching","useSeriesImage":true}],"itemPage":{"seriesView":"seasons"},"futureOption":{"keep":true}}`)
	if status, body := sendArko(t, app, "PUT", "/config", "admin", payload); status != 200 {
		t.Fatalf("save: %d %s", status, body)
	}
	// New app instance, same disk: settings survive a restart and retain extensions.
	status, data := sendArko(t, arkoTestApp(), "GET", "/config", "", nil)
	var expected, actual any
	json.Unmarshal(payload, &expected)
	json.Unmarshal(data, &actual)
	if status != 200 || !jsonEqual(expected, actual) {
		t.Fatalf("round trip lost settings: %d %s", status, data)
	}
	info, err := os.Stat(os.Getenv("ARKOPLEX_CONFIG_PATH"))
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("config permissions: %v %v", info, err)
	}
	for _, invalid := range []string{`null`, `[]`, `{"serverName":3}`, `{"nightPulseMotion":"always"}`, `{"nightPulseEnabled":null}`, `{"seerrUrl":"javascript:alert(1)"}`, `{"logoDarkUrl":"//untrusted.test/image"}`} {
		if status, _ := sendArko(t, app, "PUT", "/config", "admin", []byte(invalid)); status != 400 {
			t.Errorf("accepted invalid config %s: %d", invalid, status)
		}
	}
	if status, _ := sendArko(t, app, "PUT", "/config", "admin", []byte(`{"x":"`+strings.Repeat("x", maxArkoPlexConfigSize)+`"}`)); status != 413 {
		t.Errorf("oversized config: %d", status)
	}
	_, after := sendArko(t, app, "GET", "/config", "", nil)
	if !bytes.Equal(data, after) {
		t.Fatal("invalid save changed the valid config")
	}
}

func jsonEqual(a, b any) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return bytes.Equal(x, y)
}

func TestArkoPlexAdminCannotBeAssertedByClient(t *testing.T) {
	configureArkoTest(t)
	app := arkoTestApp()
	var rogueCalls atomic.Int32
	rogue := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rogueCalls.Add(1)
		w.Write([]byte(`{"Policy":{"IsAdministrator":true}}`))
	}))
	defer rogue.Close()
	for _, token := range []string{"", "user", "invalid"} {
		status, _ := sendArko(t, app, "PUT", "/config?jellyfin_url="+rogue.URL, token, []byte(`{"serverName":"changed"}`))
		if status != 403 {
			t.Errorf("token %q bypassed admin guard: %d", token, status)
		}
	}
	if rogueCalls.Load() != 0 {
		t.Fatal("client-controlled authentication server was contacted")
	}
	t.Setenv("SERVER_ADDRESS", "")
	if status, _ := sendArko(t, app, "PUT", "/config?jellyfin_url="+rogue.URL, "admin", []byte(`{}`)); status != 403 {
		t.Fatal("unconfigured instance allowed writes")
	}
}

func TestArkoPlexAuthDoesNotFollowRedirects(t *testing.T) {
	configureArkoTest(t)
	var leaked atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaked.Add(1) }))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 302) }))
	defer redirect.Close()
	t.Setenv("SERVER_ADDRESS", redirect.URL)
	if status, _ := sendArko(t, arkoTestApp(), "PUT", "/config", "admin", []byte(`{}`)); status != 403 || leaked.Load() != 0 {
		t.Fatal("authentication followed a redirect")
	}
}

func TestArkoPlexLogoIsLocalAndRejectsSVG(t *testing.T) {
	configureArkoTest(t)
	app := arkoTestApp()
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=")
	if status, _ := sendArko(t, app, "PUT", "/logo/dark", "user", png); status != 403 {
		t.Fatal("non-admin logo upload allowed")
	}
	if status, _ := sendArko(t, app, "PUT", "/logo/dark", "admin", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)); status != 400 {
		t.Fatal("active image format accepted")
	}
	if status, data := sendArko(t, app, "PUT", "/logo/dark", "admin", png); status != 204 {
		t.Fatalf("logo upload: %d %s", status, data)
	}
	if status, data := sendArko(t, arkoTestApp(), "GET", "/logo/dark", "", nil); status != 200 || !bytes.Equal(data, png) {
		t.Fatal("uploaded logo was not retained")
	}
	if status, _ := sendArko(t, app, "PUT", "/logo/wrong-mode", "admin", png); status != 400 {
		t.Fatal("invalid logo mode accepted")
	}
}
