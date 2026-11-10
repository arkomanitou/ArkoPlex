package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"pelagica-backend/models"
	"pelagica-backend/upstream"
	"strconv"

	"github.com/gofiber/fiber/v3"
)

// Only expose the signed-in Seerr account's requests, including for admins.
// Never accept a requestedBy value from the browser or forward user profiles.
func GetSeerrOwnRequests(c fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")
	if c.Cookies(seerSessionCookieName) == "" {
		return c.SendStatus(http.StatusUnauthorized)
	}
	skip := 0
	if raw := c.Query("skip"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 0 || value > 100000 {
			return c.SendStatus(http.StatusBadRequest)
		}
		skip = value
	}
	base, err := getSeerURL(c)
	if err != nil {
		return c.Status(502).JSON(models.APIError{Error: "Seerr not configured"})
	}
	read := func(path string, target any) int {
		req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, base+path, nil)
		if err != nil {
			return 502
		}
		req.AddCookie(&http.Cookie{Name: "connect.sid", Value: c.Cookies(seerSessionCookieName)})
		resp, err := seerHTTPClient.Do(req)
		if err != nil {
			return 502
		}
		defer resp.Body.Close()
		body, err := upstream.ReadAll(resp.Body, upstream.MaxResponseBytes)
		if err != nil {
			return 502
		}
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			return resp.StatusCode
		}
		if resp.StatusCode != 200 || json.Unmarshal(body, target) != nil {
			return 502
		}
		return 200
	}
	var me struct {
		ID int `json:"id"`
	}
	if status := read("/api/v1/auth/me", &me); status != 200 {
		return c.SendStatus(status)
	}
	if me.ID <= 0 {
		return c.SendStatus(502)
	}
	type season struct {
		SeasonNumber int `json:"seasonNumber"`
	}
	type media struct {
		TMDBID          int    `json:"tmdbId"`
		MediaType       string `json:"mediaType"`
		Status          int    `json:"status"`
		Status4K        int    `json:"status4k,omitempty"`
		JellyfinMediaID string `json:"jellyfinMediaId,omitempty"`
	}
	type request struct {
		ID        int      `json:"id"`
		Status    int      `json:"status"`
		CreatedAt string   `json:"createdAt"`
		Is4K      bool     `json:"is4k"`
		Media     media    `json:"media"`
		Seasons   []season `json:"seasons,omitempty"`
	}
	var page struct {
		PageInfo struct {
			Results int `json:"results"`
		} `json:"pageInfo"`
		Results []struct {
			request
			RequestedBy struct {
				ID int `json:"id"`
			} `json:"requestedBy"`
		} `json:"results"`
	}
	const take = 20
	path := fmt.Sprintf("/api/v1/request?take=%d&skip=%d&sort=added&requestedBy=%d", take, skip, me.ID)
	if status := read(path, &page); status != 200 {
		return c.SendStatus(status)
	}
	if len(page.Results) > take || page.PageInfo.Results < 0 {
		return c.SendStatus(502)
	}
	results := make([]request, 0, len(page.Results))
	for _, result := range page.Results {
		if result.RequestedBy.ID != me.ID {
			return c.Status(502).JSON(models.APIError{Error: "Unexpected request owner"})
		}
		results = append(results, result.request)
	}
	return c.JSON(fiber.Map{"results": results, "total": page.PageInfo.Results, "skip": skip, "take": take})
}
