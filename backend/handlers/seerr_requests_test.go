package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"pelagica-backend/services"
)

func TestOwnSeerrRequestsAreScopedAndMinimized(t *testing.T) {
	for _, owner := range []int{7, 8} {
		t.Run(fmt.Sprint(owner), func(t *testing.T) {
			t.Setenv("ARKOPLEX_CONFIG_PATH", filepath.Join(t.TempDir(), "config.json"))
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				cookie, err := r.Cookie("connect.sid")
				if err != nil || cookie.Value != "fixture-session" {
					t.Error("session not forwarded")
				}
				switch r.URL.Path {
				case "/prefix/api/v1/auth/me":
					fmt.Fprint(w, `{"id":7,"permissions":2,"email":"private@example.invalid"}`)
				case "/prefix/api/v1/request":
					q := r.URL.Query()
					if q.Get("requestedBy") != "7" || q.Get("skip") != "20" || q.Get("take") != "20" {
						t.Errorf("unexpected query %s", r.URL.RawQuery)
					}
					fmt.Fprintf(w, `{"pageInfo":{"results":21},"results":[{"id":31,"status":1,"createdAt":"2026-11-10","media":{"tmdbId":42,"mediaType":"tv","status":2,"internalSecret":"hidden"},"seasons":[{"seasonNumber":2}],"requestedBy":{"id":%d,"email":"other@example.invalid"}}]}`, owner)
				default:
					t.Errorf("unexpected path %s", r.URL.Path)
					w.WriteHeader(404)
				}
			}))
			defer server.Close()
			raw, _ := json.Marshal(server.URL + "/prefix")
			if err := services.SaveArkoPlexConfig(map[string]json.RawMessage{"seerrUrl": raw}); err != nil {
				t.Fatal(err)
			}
			app := fiber.New()
			app.Get("/requests", GetSeerrOwnRequests)
			req := httptest.NewRequest("GET", "/requests?skip=20&requestedBy=999&take=999", nil)
			req.AddCookie(&http.Cookie{Name: seerSessionCookieName, Value: "fixture-session"})
			resp, err := app.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)
			if calls != 2 || resp.Header.Get("Cache-Control") != "no-store" {
				t.Fatal("unexpected calls or caching")
			}
			if owner == 8 {
				if resp.StatusCode != 502 || strings.Contains(string(body), "other@") {
					t.Fatal("wrong owner not rejected")
				}
				return
			}
			if resp.StatusCode != 200 {
				t.Fatalf("status %d %s", resp.StatusCode, body)
			}
			if strings.Contains(string(body), "requestedBy") || strings.Contains(string(body), "email") || strings.Contains(string(body), "internalSecret") {
				t.Fatal("unneeded data exposed")
			}
			var result struct {
				Total   int `json:"total"`
				Results []struct {
					ID    int `json:"id"`
					Media struct {
						TMDBID int `json:"tmdbId"`
					} `json:"media"`
				} `json:"results"`
			}
			if json.Unmarshal(body, &result) != nil || result.Total != 21 || len(result.Results) != 1 || result.Results[0].ID != 31 || result.Results[0].Media.TMDBID != 42 {
				t.Fatalf("bad normalized response %s", body)
			}
		})
	}
}

func TestOwnSeerrRequestsRejectMissingSessionAndInvalidOffsets(t *testing.T) {
	app := fiber.New()
	app.Get("/requests", GetSeerrOwnRequests)
	for _, tc := range []struct {
		query  string
		cookie bool
		status int
	}{{"", false, 401}, {"?skip=-1", true, 400}, {"?skip=abc", true, 400}, {"?skip=100001", true, 400}} {
		req := httptest.NewRequest("GET", "/requests"+tc.query, nil)
		if tc.cookie {
			req.AddCookie(&http.Cookie{Name: seerSessionCookieName, Value: "fixture"})
		}
		resp, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != tc.status {
			t.Fatalf("%s: %d", tc.query, resp.StatusCode)
		}
	}
}

func TestOwnSeerrRequestsFailClosedOnExpiredOrInvalidIdentity(t *testing.T) {
	for _, tc := range []struct {
		status int
		body   string
		want   int
	}{{401, `{}`, 401}, {403, `{}`, 403}, {200, `{"id":0}`, 502}, {200, `not json`, 502}, {302, `{}`, 502}} {
		t.Run(fmt.Sprint(tc.status, tc.body), func(t *testing.T) {
			t.Setenv("ARKOPLEX_CONFIG_PATH", filepath.Join(t.TempDir(), "config.json"))
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/v1/auth/me" {
					t.Error("request listing called without verified identity")
				}
				w.WriteHeader(tc.status)
				fmt.Fprint(w, tc.body)
			}))
			defer server.Close()
			raw, _ := json.Marshal(server.URL)
			if err := services.SaveArkoPlexConfig(map[string]json.RawMessage{"seerrUrl": raw}); err != nil {
				t.Fatal(err)
			}
			app := fiber.New()
			app.Get("/requests", GetSeerrOwnRequests)
			req := httptest.NewRequest("GET", "/requests", nil)
			req.AddCookie(&http.Cookie{Name: seerSessionCookieName, Value: "fixture"})
			resp, err := app.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.want {
				t.Fatalf("status %d", resp.StatusCode)
			}
		})
	}
}

func TestDiscoverPaginationIsValidatedAndForwarded(t *testing.T) {
	t.Setenv("ARKOPLEX_CONFIG_PATH", filepath.Join(t.TempDir(), "config.json"))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/discover/movies" || r.URL.RawQuery != "page=2" {
			t.Errorf("unexpected target %s", r.URL.String())
		}
		fmt.Fprint(w, `{"results":[],"page":2,"totalPages":3}`)
	}))
	defer server.Close()
	raw, _ := json.Marshal(server.URL)
	if err := services.SaveArkoPlexConfig(map[string]json.RawMessage{"seerrUrl": raw}); err != nil {
		t.Fatal(err)
	}
	app := fiber.New()
	app.Get("/discover", GetSeerDiscoverMovies)
	for _, tc := range []struct {
		query  string
		status int
	}{{"?page=2&unexpected=ignored", 200}, {"?page=0", 400}, {"?page=501", 400}, {"?page=abc", 400}} {
		resp, err := app.Test(httptest.NewRequest("GET", "/discover"+tc.query, nil))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != tc.status {
			t.Fatalf("%s: %d", tc.query, resp.StatusCode)
		}
	}
}
