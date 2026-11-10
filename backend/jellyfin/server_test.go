package jellyfin

import "testing"

func TestServerURLRejectsUnsupportedAndAmbiguousInputs(t *testing.T) {
	for _, raw := range []string{"", "file:///tmp/test", "ftp://example.invalid", "//example.invalid", "http://user:secret@example.invalid", "http://example.invalid?x=1", "http://example.invalid?", "http://example.invalid/#fragment", "http://example.invalid\\other", "http://example.invalid\n"} {
		if _, err := ServerURL(raw); err == nil {
			t.Fatalf("accepted %q", raw)
		}
	}
}
func TestRequestedServerCannotChangeAuthorityOrBasePath(t *testing.T) {
	t.Setenv("SERVER_ADDRESS", "https://JELLYFIN.example.invalid/jellyfin/")
	for _, raw := range []string{"", "https://jellyfin.example.invalid/jellyfin", "https://jellyfin.example.invalid/jellyfin/"} {
		base, err := ValidateRequestedServer(raw)
		if err != nil {
			t.Fatal(err)
		}
		if Endpoint(base, "Users/Me") != "https://jellyfin.example.invalid/jellyfin/Users/Me" {
			t.Fatal("sub-path lost")
		}
	}
	for _, raw := range []string{"https://other.example.invalid/jellyfin", "http://jellyfin.example.invalid/jellyfin", "https://jellyfin.example.invalid/", "https://jellyfin.example.invalid:444/jellyfin"} {
		if _, err := ValidateRequestedServer(raw); err == nil {
			t.Fatalf("accepted %q", raw)
		}
	}
	t.Setenv("JELLYFIN_BACKEND_URL", "http://backend.example.invalid:8096/private/")
	base, err := BackendServer()
	if err != nil || Endpoint(base, "Users/Me") != "http://backend.example.invalid:8096/private/Users/Me" {
		t.Fatal("configured backend lost")
	}
}
