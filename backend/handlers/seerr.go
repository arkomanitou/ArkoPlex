package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"pelagica-backend/upstream"
	"pelagica-backend/websecurity"
	"strings"
	"time"

	"pelagica-backend/models"
	"pelagica-backend/services"

	"github.com/gofiber/fiber/v3"
)

const seerSessionCookieName = "seer_session"

var seerHTTPClient = upstream.NewClient(15 * time.Second)

func getSeerURL(c fiber.Ctx) (string, error) {
	cfgData, err := services.ReadArkoPlexConfig()
	if err != nil {
		return "", err
	}
	raw, ok := cfgData["seerrUrl"]
	if !ok {
		return "", errors.New("seer URL not configured")
	}
	var address string
	if err := json.Unmarshal(raw, &address); err != nil || address == "" || !safeConfigURL(address, false) {
		return "", errors.New("seer URL not configured")
	}
	return strings.TrimRight(address, "/"), nil
}

type seerLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func SeerLogin(c fiber.Ctx) error {
	var req seerLoginRequest
	if err := c.Bind().Body(&req); err != nil || req.Username == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIError{Error: "Username and password are required"})
	}

	seerURL, err := getSeerURL(c)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Seer not configured"})
	}

	payload, err := json.Marshal(map[string]string{
		"username": req.Username,
		"password": req.Password,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIError{Error: "Failed to build Seer request"})
	}

	resp, err := seerPost(c, seerURL+"/api/v1/auth/jellyfin", "application/json", bytes.NewReader(payload))
	if err != nil {
		slog.Error("Seer login failed", "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Failed to reach Seer"})
	}
	defer resp.Body.Close()

	body, err := upstream.ReadAll(resp.Body, upstream.MaxResponseBytes)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Failed to read Seer response"})
	}

	if resp.StatusCode != http.StatusOK {
		return c.Status(resp.StatusCode).Type("json").Send(body)
	}

	if err := setSeerSessionCookie(c, resp); err != nil {
		return c.Status(503).JSON(models.APIError{Error: "Invalid browser security configuration"})
	}

	return c.Status(fiber.StatusOK).Type("json").Send(body)
}

func setSeerSessionCookie(c fiber.Ctx, resp *http.Response) error {
	policy, err := websecurity.FromEnv()
	if err != nil {
		return err
	}
	for _, cookie := range resp.Cookies() {
		if cookie.Name != "connect.sid" {
			continue
		}
		if policy.BasePath != "" {
			expireSeerCookie(c, "/api/seerr", policy.SecureCookie(c.RequestCtx().IsTLS()))
		}
		appendSeerCookie(c, &http.Cookie{
			Name: seerSessionCookieName, Value: cookie.Value,
			Path: policy.SeerrCookiePath(), HttpOnly: true, SameSite: http.SameSiteLaxMode,
			Secure:  policy.SecureCookie(c.RequestCtx().IsTLS()),
			Expires: cookie.Expires, MaxAge: cookie.MaxAge,
		})
		return nil
	}
	return nil
}

func SeerQuickConnectInitiate(c fiber.Ctx) error {
	seerURL, err := getSeerURL(c)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Seer not configured"})
	}

	resp, err := seerPost(c, seerURL+"/api/v1/auth/jellyfin/quickconnect/initiate", "application/json", nil)
	if err != nil {
		slog.Error("Seer quick connect initiate failed", "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Failed to reach Seer"})
	}
	defer resp.Body.Close()

	body, err := upstream.ReadAll(resp.Body, upstream.MaxResponseBytes)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Failed to read Seer response"})
	}

	return c.Status(resp.StatusCode).Type("json").Send(body)
}

type seerQuickConnectAuthenticateRequest struct {
	Secret string `json:"secret"`
}

// SeerQuickConnectAuthenticate exchanges a Quick Connect secret, authorized
// through Jellyfin, for a Seer session.
func SeerQuickConnectAuthenticate(c fiber.Ctx) error {
	var req seerQuickConnectAuthenticateRequest
	if err := c.Bind().Body(&req); err != nil || req.Secret == "" {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIError{Error: "Secret is required"})
	}

	seerURL, err := getSeerURL(c)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Seer not configured"})
	}

	payload, err := json.Marshal(map[string]string{"secret": req.Secret})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIError{Error: "Failed to build Seer request"})
	}

	resp, err := seerPost(c, seerURL+"/api/v1/auth/jellyfin/quickconnect/authenticate", "application/json", bytes.NewReader(payload))
	if err != nil {
		slog.Error("Seer quick connect authenticate failed", "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Failed to reach Seer"})
	}
	defer resp.Body.Close()

	body, err := upstream.ReadAll(resp.Body, upstream.MaxResponseBytes)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Failed to read Seer response"})
	}

	if resp.StatusCode != http.StatusOK {
		return c.Status(resp.StatusCode).Type("json").Send(body)
	}

	if err := setSeerSessionCookie(c, resp); err != nil {
		return c.Status(503).JSON(models.APIError{Error: "Invalid browser security configuration"})
	}

	return c.Status(fiber.StatusOK).Type("json").Send(body)
}

type seerQuickConnectSupportedResponse struct {
	Supported bool `json:"supported"`
}

// GetSeerQuickConnectSupported probes Seer for Quick Connect support. Versions
// with Quick Connect reject a malformed secret with 400, older ones don't know the route.
func GetSeerQuickConnectSupported(c fiber.Ctx) error {
	seerURL, err := getSeerURL(c)
	if err != nil {
		return c.JSON(seerQuickConnectSupportedResponse{Supported: false})
	}

	resp, err := seerGet(c, seerURL+"/api/v1/auth/jellyfin/quickconnect/check?secret=-")
	if err != nil {
		return c.JSON(seerQuickConnectSupportedResponse{Supported: false})
	}
	defer resp.Body.Close()
	_, err = upstream.ReadAll(resp.Body, upstream.MaxResponseBytes)
	if err != nil {
		return c.JSON(seerQuickConnectSupportedResponse{Supported: false})
	}

	return c.JSON(seerQuickConnectSupportedResponse{Supported: resp.StatusCode == http.StatusBadRequest})
}

func expireSeerCookie(c fiber.Ctx, path string, secure bool) {
	appendSeerCookie(c, &http.Cookie{
		Name: seerSessionCookieName, Value: "", Path: path,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: secure,
		Expires: time.Unix(0, 0), MaxAge: -1,
	})
}

func clearSeerSessionCookie(c fiber.Ctx) error {
	policy, err := websecurity.FromEnv()
	if err != nil {
		return err
	}
	expireSeerCookie(c, policy.SeerrCookiePath(), policy.SecureCookie(c.RequestCtx().IsTLS()))
	if policy.BasePath != "" {
		expireSeerCookie(c, "/api/seerr", policy.SecureCookie(c.RequestCtx().IsTLS()))
	}
	return nil
}

func SeerLogout(c fiber.Ctx) error {
	session := c.Cookies(seerSessionCookieName)

	if err := clearSeerSessionCookie(c); err != nil {
		return c.Status(503).JSON(models.APIError{Error: "Invalid browser security configuration"})
	}

	if session == "" {
		return c.SendStatus(fiber.StatusNoContent)
	}

	seerURL, err := getSeerURL(c)
	if err != nil {
		return c.SendStatus(fiber.StatusNoContent)
	}

	req, err := http.NewRequestWithContext(c.Context(), http.MethodPost, seerURL+"/api/v1/auth/logout", nil)
	if err != nil {
		slog.Error("Failed to build Seer logout request", "error", err)
		return c.SendStatus(fiber.StatusNoContent)
	}
	req.AddCookie(&http.Cookie{Name: "connect.sid", Value: session})

	resp, err := seerHTTPClient.Do(req)
	if err != nil {
		slog.Error("Seer logout failed", "error", err)
		return c.SendStatus(fiber.StatusNoContent)
	}
	defer resp.Body.Close()

	return c.SendStatus(fiber.StatusNoContent)
}

func proxySeerRequest(c fiber.Ctx, seerPath string) error {
	seerURL, err := getSeerURL(c)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Seer not configured"})
	}

	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, seerURL+seerPath, nil)
	if err != nil {
		slog.Error("Failed to build Seer request", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIError{Error: "Failed to build Seer request"})
	}

	if session := c.Cookies(seerSessionCookieName); session != "" {
		req.AddCookie(&http.Cookie{Name: "connect.sid", Value: session})
	}

	resp, err := seerHTTPClient.Do(req)
	if err != nil {
		slog.Error("Seer request failed", "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Failed to reach Seer"})
	}
	defer resp.Body.Close()

	body, err := upstream.ReadAll(resp.Body, upstream.MaxResponseBytes)
	if err != nil {
		slog.Error("Failed to read Seer response", "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Failed to read Seer response"})
	}

	return c.Status(resp.StatusCode).Type("json").Send(body)
}

func GetSeerMovieRecommendations(c fiber.Ctx) error {
	tmdbId := c.Params("tmdbId")
	return proxySeerRequest(c, "/api/v1/movie/"+tmdbId+"/recommendations")
}

func GetSeerTvRecommendations(c fiber.Ctx) error {
	tvId := c.Params("tvId")
	return proxySeerRequest(c, "/api/v1/tv/"+tvId+"/recommendations")
}

func GetSeerMovieDetails(c fiber.Ctx) error {
	tmdbId := c.Params("tmdbId")
	return proxySeerRequest(c, "/api/v1/movie/"+tmdbId)
}

func GetSeerTvDetails(c fiber.Ctx) error {
	tvId := c.Params("tvId")
	return proxySeerRequest(c, "/api/v1/tv/"+tvId)
}

func GetSeerPersonCombinedCredits(c fiber.Ctx) error {
	personId := c.Params("personId")
	return proxySeerRequest(c, "/api/v1/person/"+personId+"/combined_credits")
}

func GetSeerDiscoverTrending(c fiber.Ctx) error {
	return proxySeerRequest(c, "/api/v1/discover/trending")
}

func GetSeerDiscoverMovies(c fiber.Ctx) error {
	return proxySeerRequest(c, "/api/v1/discover/movies")
}

func GetSeerDiscoverTv(c fiber.Ctx) error {
	return proxySeerRequest(c, "/api/v1/discover/tv")
}

func PostSeerRequest(c fiber.Ctx) error {
	body := c.Body()

	seerURL, err := getSeerURL(c)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Seer not configured"})
	}

	req, err := http.NewRequestWithContext(c.Context(), http.MethodPost, seerURL+"/api/v1/request", bytes.NewReader(body))
	if err != nil {
		slog.Error("Failed to build Seer request", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIError{Error: "Failed to build Seer request"})
	}
	req.Header.Set("Content-Type", "application/json")

	if session := c.Cookies(seerSessionCookieName); session != "" {
		req.AddCookie(&http.Cookie{Name: "connect.sid", Value: session})
	}

	resp, err := seerHTTPClient.Do(req)
	if err != nil {
		slog.Error("Seer request failed", "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Failed to reach Seer"})
	}
	defer resp.Body.Close()

	respBody, err := upstream.ReadAll(resp.Body, upstream.MaxResponseBytes)
	if err != nil {
		slog.Error("Failed to read Seer response", "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(models.APIError{Error: "Failed to read Seer response"})
	}

	return c.Status(resp.StatusCode).Type("json").Send(respBody)
}

func GetSeerSearch(c fiber.Ctx) error {
	query := c.Query("query")
	if query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIError{Error: "Query is required"})
	}
	encodedQuery := strings.ReplaceAll(url.QueryEscape(query), "+", "%20")
	return proxySeerRequest(c, "/api/v1/search?query="+encodedQuery)
}

type seerrStatusResponse struct {
	LoggedIn bool `json:"loggedIn"`
}

func GetSeerrStatus(c fiber.Ctx) error {
	session := c.Cookies(seerSessionCookieName)
	if session == "" {
		return c.JSON(seerrStatusResponse{LoggedIn: false})
	}

	seerURL, err := getSeerURL(c)
	if err != nil {
		return c.JSON(seerrStatusResponse{LoggedIn: false})
	}

	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, seerURL+"/api/v1/auth/me", nil)
	if err != nil {
		slog.Error("Failed to build Seer status request", "error", err)
		return c.JSON(seerrStatusResponse{LoggedIn: false})
	}
	req.AddCookie(&http.Cookie{Name: "connect.sid", Value: session})

	resp, err := seerHTTPClient.Do(req)
	if err != nil {
		slog.Error("Seer status check failed", "error", err)
		return c.JSON(seerrStatusResponse{LoggedIn: false})
	}
	defer resp.Body.Close()
	_, err = upstream.ReadAll(resp.Body, upstream.MaxResponseBytes)
	if err != nil {
		return c.JSON(seerrStatusResponse{LoggedIn: false})
	}

	if resp.StatusCode != http.StatusOK {
		if err := clearSeerSessionCookie(c); err != nil {
			return c.Status(503).JSON(models.APIError{Error: "Invalid browser security configuration"})
		}
		return c.JSON(seerrStatusResponse{LoggedIn: false})
	}

	return c.JSON(seerrStatusResponse{LoggedIn: true})
}

func seerPost(c fiber.Ctx, target, contentType string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequestWithContext(c.Context(), http.MethodPost, target, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	return seerHTTPClient.Do(req)
}

func seerGet(c fiber.Ctx, target string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	return seerHTTPClient.Do(req)
}

// Add emits separate Set-Cookie fields for the current and legacy paths.
// Fiber's Cookie helper replaces by name, which would lose one of the paths.
func appendSeerCookie(c fiber.Ctx, cookie *http.Cookie) {
	c.Response().Header.Add("Set-Cookie", cookie.String())
}
