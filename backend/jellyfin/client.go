package jellyfin

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
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
	// A client-supplied server must never be allowed to assert admin rights.
	jellyfinURLRaw := os.Getenv("SERVER_ADDRESS")
	if jellyfinURLRaw == "" {
		return false, errors.New("SERVER_ADDRESS must be configured before admin writes")
	}

	baseURL, err := url.Parse(jellyfinURLRaw)
	if err != nil || (baseURL.Scheme != "http" && baseURL.Scheme != "https") || baseURL.Host == "" || baseURL.User != nil || baseURL.RawQuery != "" || baseURL.Fragment != "" {
		return false, errors.New("invalid jellyfin_url")
	}

	baseURL.Path = strings.TrimRight(baseURL.Path, "/") + "/Users/Me"
	baseURL.RawPath = ""

	token := c.Get("Authorization")
	if token == "" {
		return false, errors.New("missing Authorization header")
	}

	req, err := http.NewRequest(http.MethodGet, baseURL.String(), nil)
	if err != nil {
		return false, err
	}

	req.Header.Set("Authorization", token)

	client := &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := client.Do(req)
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
	if err := json.NewDecoder(io.LimitReader(res.Body, 1024*1024)).Decode(&user); err != nil {
		return false, err
	}

	return user.Policy.IsAdministrator, nil
}
