package jellyfin

import (
	"errors"
	"net/http"
	"pelagica-backend/upstream"
	"time"

	"github.com/gofiber/fiber/v3"
)

type UserMeResponse struct {
	Id     string `json:"Id"`
	Name   string `json:"Name"`
	Policy struct {
		IsAdministrator bool `json:"IsAdministrator"`
	} `json:"Policy"`
}

func AuthenticateByToken(c fiber.Ctx) (bool, error) {
	baseURL, err := ConfiguredServer()
	if err != nil {
		return false, errors.New("SERVER_ADDRESS must be configured before admin writes")
	}

	token := c.Get("Authorization")
	if token == "" {
		return false, errors.New("missing Authorization header")
	}

	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, Endpoint(baseURL, "Users/Me"), nil)
	if err != nil {
		return false, err
	}

	req.Header.Set("Authorization", token)

	res, err := authHTTPClient.Do(req)
	if err != nil {
		return false, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		if res.StatusCode == http.StatusUnauthorized {
			return false, errors.New("unauthorized: invalid Jellyfin token")
		}
		return false, errors.New("failed to authenticate with Jellyfin: " + res.Status)
	}

	var user UserMeResponse
	if err := upstream.DecodeJSON(res.Body, 1<<20, &user); err != nil {
		return false, err
	}

	return user.Policy.IsAdministrator, nil
}

var authHTTPClient = upstream.NewClient(5 * time.Second)
