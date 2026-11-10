// Package upstream bounds requests made to administrator-configured services.
package upstream

import (
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"time"
)

const MaxResponseBytes int64 = 4 << 20

// NewClient never forwards credentials through a redirect. Private destinations
// are intentional for self-hosted services; callers must select them from config.
func NewClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:       timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
		Transport: &http.Transport{
			Proxy:                  http.ProxyFromEnvironment,
			DialContext:            (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
			TLSHandshakeTimeout:    5 * time.Second,
			ResponseHeaderTimeout:  5 * time.Second,
			IdleConnTimeout:        30 * time.Second,
			MaxIdleConns:           32,
			MaxIdleConnsPerHost:    8,
			MaxResponseHeaderBytes: 64 << 10,
		},
	}
}

func ReadAll(r io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errors.New("upstream response exceeds limit")
	}
	return data, nil
}

func DecodeJSON(r io.Reader, limit int64, target any) error {
	data, err := ReadAll(r, limit)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}
