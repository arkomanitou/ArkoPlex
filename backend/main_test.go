package main

import (
	"bytes"
	"github.com/gofiber/fiber/v3"
	"net/http/httptest"
	"testing"
)

func TestAllAdministrativeRoutesFailClosed(t *testing.T) {
	t.Setenv("SERVER_ADDRESS", "")
	for _, auth := range []string{"", "false", "true"} {
		t.Setenv("ENABLE_AUTH", auth)
		app := fiber.New()
		registerRoutes(app)
		for _, route := range []struct{ method, path string }{
			{"PUT", "/api/arkoplex/config"}, {"PUT", "/api/arkoplex/branding/logo/dark"},
			{"POST", "/api/themes"}, {"PUT", "/api/themes/test"}, {"DELETE", "/api/themes/test"},
			{"POST", "/api/themes/test/install"}, {"POST", "/api/stats-consent?consent=true"},
		} {
			req := httptest.NewRequest(route.method, route.path, bytes.NewBufferString(`{}`))
			req.Header.Set("Content-Type", "application/json")
			res, err := app.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			res.Body.Close()
			if res.StatusCode != 403 {
				t.Fatalf("ENABLE_AUTH=%q %s %s: %d", auth, route.method, route.path, res.StatusCode)
			}
		}
	}
}

func TestEverySeerrMutationUsesBrowserGuard(t *testing.T) {
	t.Setenv("ARKOPLEX_PUBLIC_ORIGIN", "https://demo.invalid")
	t.Setenv("BASE_PATH", "")
	app := fiber.New()
	registerRoutes(app)
	for _, path := range []string{"login", "logout", "request", "quickconnect/initiate", "quickconnect/authenticate"} {
		req := httptest.NewRequest("POST", "/api/seerr/"+path, bytes.NewBufferString(`{}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "https://demo.invalid")
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 403 {
			t.Fatalf("missing guard on %s: %d", path, res.StatusCode)
		}
	}
}
