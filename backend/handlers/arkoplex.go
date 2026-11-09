package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"pelagica-backend/models"
	"pelagica-backend/services"

	"github.com/gofiber/fiber/v3"
)

const maxArkoPlexConfigSize = 128 * 1024

func GetArkoPlexConfig(c fiber.Ctx) error {
	cfg, err := services.ReadArkoPlexConfig()
	if err != nil {
		return c.Status(500).JSON(models.APIError{Error: "Cannot read ArkoPlex configuration"})
	}
	c.Set("Cache-Control", "no-store")
	return c.JSON(cfg)
}

func safeConfigURL(raw string, relative bool) bool {
	if raw == "" {
		return true
	}
	u, err := url.Parse(raw)
	if err != nil || u.User != nil || strings.ContainsAny(raw, "\r\n") {
		return false
	}
	if relative && strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") {
		return u.Host == "" && u.Scheme == ""
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func PutArkoPlexConfig(c fiber.Ctx) error {
	if len(c.Body()) > maxArkoPlexConfigSize {
		return c.SendStatus(413)
	}
	var cfg map[string]json.RawMessage
	if json.Unmarshal(c.Body(), &cfg) != nil || cfg == nil {
		return c.Status(400).JSON(models.APIError{Error: "Configuration must be a JSON object"})
	}
	// Validate known fields without discarding future fields when saving.
	var typed models.AppConfig
	if json.Unmarshal(c.Body(), &typed) != nil {
		return c.Status(400).JSON(models.APIError{Error: "Invalid setting type"})
	}
	if len(typed.ServerName) > 120 || !safeConfigURL(typed.SeerrURL, false) ||
		!safeConfigURL(typed.StreamystatsURL, false) || !safeConfigURL(typed.LogoLightURL, true) ||
		!safeConfigURL(typed.LogoDarkURL, true) {
		return c.Status(400).JSON(models.APIError{Error: "Invalid name or URL"})
	}
	for _, link := range typed.Links {
		if !safeConfigURL(link.URL, false) {
			return c.Status(400).JSON(models.APIError{Error: "Invalid link URL"})
		}
	}
	if raw, ok := cfg["nightPulseMotion"]; ok {
		var mode string
		if json.Unmarshal(raw, &mode) != nil || (mode != "system" && mode != "off") {
			return c.Status(400).JSON(models.APIError{Error: "Invalid motion preference"})
		}
	}
	if raw, ok := cfg["nightPulseEnabled"]; ok {
		var enabled bool
		if json.Unmarshal(raw, &enabled) != nil || string(raw) == "null" {
			return c.Status(400).JSON(models.APIError{Error: "Invalid appearance setting"})
		}
	}
	if err := services.SaveArkoPlexConfig(cfg); err != nil {
		return c.Status(500).JSON(models.APIError{Error: "Cannot save ArkoPlex configuration"})
	}
	c.Set("Cache-Control", "no-store")
	return c.JSON(cfg)
}

func arkoLogoPath(mode string) string {
	return filepath.Join(filepath.Dir(services.ArkoPlexConfigPath()), "branding", "logo-"+mode)
}

func GetArkoPlexLogo(c fiber.Ctx) error {
	mode, err := resolveBrandingLogoMode(c.Params("mode"))
	if err != nil {
		return c.SendStatus(400)
	}
	data, err := os.ReadFile(arkoLogoPath(mode))
	if os.IsNotExist(err) {
		return c.SendStatus(404)
	}
	if err != nil {
		return c.SendStatus(500)
	}
	c.Set("Content-Type", http.DetectContentType(data))
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Cache-Control", "no-store")
	return c.Send(data)
}

func PutArkoPlexLogo(c fiber.Ctx) error {
	mode, err := resolveBrandingLogoMode(c.Params("mode"))
	if err != nil {
		return c.SendStatus(400)
	}
	data := c.Body()
	if len(data) == 0 || len(data) > 2*1024*1024 {
		return c.SendStatus(413)
	}
	switch http.DetectContentType(data) {
	case "image/png", "image/jpeg", "image/webp":
	default:
		return c.Status(400).JSON(models.APIError{Error: "Use a PNG, JPEG or WebP logo"})
	}
	if services.AtomicPrivateWrite(arkoLogoPath(mode), data) != nil {
		return c.SendStatus(500)
	}
	return c.SendStatus(204)
}
