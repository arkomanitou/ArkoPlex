package handlers

import (
	"bytes"
	"fmt"
	"github.com/gofiber/fiber/v3"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func guardRequest(t *testing.T, app *fiber.App, method string, headers map[string]string, body string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, "http://localhost:8800/api/seerr/action", strings.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return res
}
func TestSeerrMutationGuardRejectsCrossSiteAndSimpleForms(t *testing.T) {
	t.Setenv("ARKOPLEX_PUBLIC_ORIGIN", "https://demo.invalid")
	t.Setenv("BASE_PATH", "")
	app := fiber.New()
	app.Use("/api/seerr", SeerrSecurity)
	app.Post("/api/seerr/action", func(c fiber.Ctx) error { return c.SendStatus(204) })
	cases := []struct {
		name, origin, guard, site, ctype, body string
		status                                 int
	}{
		{"same-origin", "https://demo.invalid", "1", "same-origin", "application/json", `{}`, 204},
		{"canonical-origin", "https://DEMO.invalid:443", "1", "same-origin", "application/json", `{}`, 204},
		{"native-client", "", "1", "", "", "", 204},
		{"no-guard", "https://demo.invalid", "", "same-origin", "application/json", `{}`, 403},
		{"other-origin", "https://evil.invalid", "1", "", "application/json", `{}`, 403},
		{"null-origin", "null", "1", "", "application/json", `{}`, 403},
		{"wrong-scheme", "http://demo.invalid", "1", "", "application/json", `{}`, 403},
		{"wrong-port", "https://demo.invalid:444", "1", "", "application/json", `{}`, 403},
		{"origin-path", "https://demo.invalid/path", "1", "", "application/json", `{}`, 403},
		{"cross-site", "https://demo.invalid", "1", "cross-site", "application/json", `{}`, 403},
		{"simple-form", "https://demo.invalid", "1", "same-origin", "application/x-www-form-urlencoded", "x=y", 415},
		{"oversize", "https://demo.invalid", "1", "same-origin", "application/json", strings.Repeat("x", 64<<10+1), 413},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := guardRequest(t, app, "POST", map[string]string{"Origin": tc.origin, "X-ArkoPlex-Request": tc.guard, "Sec-Fetch-Site": tc.site, "Content-Type": tc.ctype, "X-Forwarded-Host": "evil.invalid", "X-Forwarded-Proto": "https", "Forwarded": "proto=https;host=evil.invalid"}, tc.body)
			if res.StatusCode != tc.status {
				t.Fatalf("status %d, want %d", res.StatusCode, tc.status)
			}
		})
	}
}
func TestSeerrLocalGuardUsesDirectHostAndIgnoresForwardedHeaders(t *testing.T) {
	t.Setenv("ARKOPLEX_PUBLIC_ORIGIN", "")
	t.Setenv("BASE_PATH", "")
	app := fiber.New()
	app.Use(SeerrSecurity)
	app.Post("/api/seerr/action", func(c fiber.Ctx) error { return c.SendStatus(204) })
	for origin, status := range map[string]int{"http://localhost:8800": 204, "https://localhost:8800": 403, "http://localhost": 403, "https://evil.invalid": 403} {
		res := guardRequest(t, app, "POST", map[string]string{"Origin": origin, "X-ArkoPlex-Request": "1", "X-Forwarded-Proto": "https", "X-Forwarded-Host": "evil.invalid"}, "")
		if res.StatusCode != status {
			t.Fatalf("%s returned %d", origin, res.StatusCode)
		}
	}
}
func TestSeerrPreflightDoesNotGrantCrossOriginPermission(t *testing.T) {
	t.Setenv("ARKOPLEX_PUBLIC_ORIGIN", "https://demo.invalid")
	t.Setenv("BASE_PATH", "")
	app := fiber.New()
	app.Use(SeerrSecurity)
	res := guardRequest(t, app, "OPTIONS", map[string]string{"Origin": "https://evil.invalid", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "X-ArkoPlex-Request"}, "")
	if res.Header.Get("Access-Control-Allow-Origin") != "" || res.Header.Get("Access-Control-Allow-Headers") != "" {
		t.Fatal("cross-origin preflight granted")
	}
}
func TestSeerrInvalidSecurityConfigurationFailsClosed(t *testing.T) {
	t.Setenv("ARKOPLEX_PUBLIC_ORIGIN", "https://demo.invalid/app")
	t.Setenv("BASE_PATH", "")
	app := fiber.New()
	app.Use(SeerrSecurity)
	app.Post("/api/seerr/action", func(c fiber.Ctx) error { return c.SendStatus(204) })
	res := guardRequest(t, app, "POST", map[string]string{"X-ArkoPlex-Request": "1"}, "")
	if res.StatusCode != 503 {
		t.Fatal("invalid config allowed a mutation")
	}
}
func TestSeerrCookiesHonorHTTPSPrefixAndLogoutPaths(t *testing.T) {
	for _, base := range []string{"", "/arkoplex"} {
		for _, secure := range []bool{false, true} {
			t.Run(fmt.Sprintf("base=%s/secure=%t", base, secure), func(t *testing.T) {
				t.Setenv("BASE_PATH", base)
				origin := "http://localhost:8800"
				if secure {
					origin = "https://demo.invalid"
				}
				t.Setenv("ARKOPLEX_PUBLIC_ORIGIN", origin)
				app := fiber.New()
				app.Post("/login", func(c fiber.Ctx) error {
					resp := &http.Response{Header: http.Header{}}
					resp.Header.Add("Set-Cookie", (&http.Cookie{Name: "connect.sid", Value: "fixture-session", Expires: time.Now().Add(time.Hour), MaxAge: 3600}).String())
					if err := setSeerSessionCookie(c, resp); err != nil {
						return err
					}
					return c.SendStatus(204)
				})
				app.Post("/logout", func(c fiber.Ctx) error {
					if err := clearSeerSessionCookie(c); err != nil {
						return err
					}
					return c.SendStatus(204)
				})
				req := httptest.NewRequest("POST", "http://localhost:8800/login", bytes.NewReader(nil))
				req.Header.Set("X-Forwarded-Proto", "https")
				res, err := app.Test(req)
				if err != nil {
					t.Fatal(err)
				}
				defer res.Body.Close()
				found := false
				for _, cookie := range res.Cookies() {
					if cookie.Path != base+"/api/seerr" {
						continue
					}
					found = true
					if cookie.Value != "fixture-session" || cookie.Secure != secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Domain != "" || cookie.MaxAge != 3600 {
						t.Fatalf("incorrect cookie: %+v", cookie)
					}
				}
				if !found {
					t.Fatal("current-path session cookie missing")
				}
				res, err = app.Test(httptest.NewRequest("POST", "/logout", nil))
				if err != nil {
					t.Fatal(err)
				}
				defer res.Body.Close()
				paths := map[string]bool{}
				for _, cookie := range res.Cookies() {
					if cookie.MaxAge >= 0 || cookie.Expires.After(time.Now()) || cookie.Secure != secure || !cookie.HttpOnly {
						t.Fatalf("logout cookie invalid: %+v", cookie)
					}
					paths[cookie.Path] = true
				}
				if !paths[base+"/api/seerr"] || !paths["/api/seerr"] {
					t.Fatal("logout did not clear all paths")
				}
			})
		}
	}
}
