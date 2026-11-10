package jellyfin

import (
	"errors"
	"net/url"
	"os"
	"strings"
)

// ServerURL validates an administrator-provided HTTP(S) base URL, retaining
// any Jellyfin sub-path. It must never be called on an untrusted routing target.
func ServerURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.ContainsAny(raw, "\\\r\n") {
		return nil, errors.New("invalid configured server URL")
	}
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	u.Path = strings.TrimRight(u.Path, "/")
	u.RawPath = ""
	return u, nil
}

func ConfiguredServer() (*url.URL, error) {
	return ServerURL(os.Getenv("SERVER_ADDRESS"))
}

// ValidateRequestedServer accepts the configured public address only. Query
// parameters are compatibility hints and never select a network destination.
func ValidateRequestedServer(raw string) (*url.URL, error) {
	configured, err := ConfiguredServer()
	if err != nil {
		return nil, err
	}
	if raw != "" {
		requested, err := ServerURL(raw)
		if err != nil || requested.String() != configured.String() {
			return nil, errors.New("Jellyfin server is not configured for this instance")
		}
	}
	return configured, nil
}

func BackendServer() (*url.URL, error) {
	if raw := os.Getenv("JELLYFIN_BACKEND_URL"); raw != "" {
		return ServerURL(raw)
	}
	return ConfiguredServer()
}

func Endpoint(base *url.URL, path string) string {
	u := *base
	u.Path = strings.TrimRight(u.Path, "/") + "/" + strings.TrimLeft(path, "/")
	u.RawPath = ""
	return u.String()
}
