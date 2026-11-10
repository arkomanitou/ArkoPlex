package handlers

import (
	"mime"
	"net/http"
	"pelagica-backend/models"
	"pelagica-backend/websecurity"
	"strings"

	"github.com/gofiber/fiber/v3"
)

// SeerrSecurity requires a custom header on every mutation, including login.
// Cross-origin browsers cannot send it without a successful CORS preflight;
// ArkoPlex does not enable CORS for these routes. Origin checks are independent
// of Host/Forwarded headers when an explicit public origin is configured.
func SeerrSecurity(c fiber.Ctx) error {
	policy, err := websecurity.FromEnv()
	if err != nil {
		return c.Status(503).JSON(models.APIError{Error: "Invalid browser security configuration"})
	}
	if c.Method() == http.MethodGet || c.Method() == http.MethodHead || c.Method() == http.MethodOptions {
		return c.Next()
	}
	if c.Get("X-ArkoPlex-Request") != "1" || strings.EqualFold(c.Get("Sec-Fetch-Site"), "cross-site") {
		return c.Status(403).JSON(models.APIError{Error: "Seerr request origin refused"})
	}
	if origin := c.Get("Origin"); origin != "" {
		expected := policy.PublicOrigin
		if expected == "" {
			scheme := "http"
			if c.RequestCtx().IsTLS() {
				scheme = "https"
			}
			expected, err = websecurity.Origin(scheme + "://" + c.Get("Host"))
			if err != nil {
				return c.SendStatus(403)
			}
		}
		actual, err := websecurity.Origin(origin)
		if err != nil || actual != expected {
			return c.Status(403).JSON(models.APIError{Error: "Seerr request origin refused"})
		}
	}
	if len(c.Body()) > 64<<10 {
		return c.SendStatus(413)
	}
	if len(c.Body()) > 0 {
		mediaType, _, err := mime.ParseMediaType(c.Get("Content-Type"))
		if err != nil || mediaType != "application/json" {
			return c.SendStatus(415)
		}
	}
	return c.Next()
}
