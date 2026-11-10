// Package websecurity describes the browser-facing origin explicitly, without
// trusting forwarding headers from arbitrary clients or proxies.
package websecurity

import (
	"errors"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
)

type Policy struct {
	PublicOrigin string
	BasePath     string
}

var segment = regexp.MustCompile(`^[A-Za-z0-9._~-]+$`)

func FromEnv() (Policy, error) {
	var p Policy
	raw := os.Getenv("ARKOPLEX_PUBLIC_ORIGIN")
	if raw != "" {
		origin, err := Origin(raw)
		if err != nil {
			return p, errors.New("invalid ARKOPLEX_PUBLIC_ORIGIN")
		}
		p.PublicOrigin = origin
	}
	base := strings.TrimRight(os.Getenv("BASE_PATH"), "/")
	if base != "" {
		if !strings.HasPrefix(base, "/") {
			return p, errors.New("invalid BASE_PATH")
		}
		for _, part := range strings.Split(base[1:], "/") {
			if part == "." || part == ".." || !segment.MatchString(part) {
				return p, errors.New("invalid BASE_PATH")
			}
		}
	}
	p.BasePath = base
	return p, nil
}

// Origin normalizes a single HTTP(S) origin, never a URL containing credentials,
// a query or an application path. An optional slash is accepted for config.
func Origin(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.Opaque != "" || u.RawPath != "" || strings.HasSuffix(u.Host, ":") || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || (u.Path != "" && u.Path != "/") || strings.ContainsAny(raw, "\\ \t\r\n,#") {
		return "", errors.New("invalid origin")
	}
	host, port := strings.ToLower(u.Hostname()), u.Port()
	if port != "" {
		n, err := strconv.ParseUint(port, 10, 16)
		if err != nil || n == 0 {
			return "", errors.New("invalid origin port")
		}
	}
	if port == "80" && u.Scheme == "http" || port == "443" && u.Scheme == "https" {
		port = ""
	}
	if port != "" {
		host = net.JoinHostPort(host, port)
	} else if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	return u.Scheme + "://" + host, nil
}

func (p Policy) SeerrCookiePath() string { return p.BasePath + "/api/seerr" }

func (p Policy) SecureCookie(directTLS bool) bool {
	if p.PublicOrigin != "" {
		return strings.HasPrefix(p.PublicOrigin, "https://")
	}
	return directTLS
}
