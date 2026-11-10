package websecurity

import "testing"

func TestOriginsRejectPathsCredentialsAndAmbiguity(t *testing.T) {
	for _, raw := range []string{"null", "", "//demo.invalid", "https://u:p@demo.invalid", "https://demo.invalid/app", "https://demo.invalid?", "https://demo.invalid#", "https://demo.invalid/%2f", "https://demo.invalid/%2F", "https://demo.invalid:0", "https://demo.invalid:99999", "https://demo.invalid:", "https://demo.invalid https://other.invalid", "https://demo.invalid,https://other.invalid", "https://demo.invalid\\x"} {
		if _, err := Origin(raw); err == nil {
			t.Fatalf("accepted %q", raw)
		}
	}
	for raw, expected := range map[string]string{"https://DEMO.invalid:443/": "https://demo.invalid", "http://localhost:80": "http://localhost", "https://[::1]:443": "https://[::1]", "http://localhost:8800": "http://localhost:8800"} {
		value, err := Origin(raw)
		if err != nil || value != expected {
			t.Fatalf("%s -> %s (%v)", raw, value, err)
		}
	}
}
func TestPolicyPathsAndSecureCookies(t *testing.T) {
	t.Setenv("ARKOPLEX_PUBLIC_ORIGIN", "")
	for _, bad := range []string{"app", "//app", "/a//b", "/../b", "/a/./b", "/a?x=1", "/a%2fb", "/a b", "/a\\b"} {
		t.Setenv("BASE_PATH", bad)
		if _, err := FromEnv(); err == nil {
			t.Fatalf("accepted prefix %q", bad)
		}
	}
	for _, base := range []string{"", "/", "/arkoplex/", "/media/arkoplex"} {
		t.Setenv("BASE_PATH", base)
		p, err := FromEnv()
		if err != nil {
			t.Fatal(err)
		}
		if p.SecureCookie(false) || !p.SecureCookie(true) {
			t.Fatal("direct TLS ignored")
		}
		if p.SeerrCookiePath() != p.BasePath+"/api/seerr" {
			t.Fatal("cookie path inconsistent")
		}
	}
	t.Setenv("ARKOPLEX_PUBLIC_ORIGIN", "https://demo.invalid")
	p, err := FromEnv()
	if err != nil || !p.SecureCookie(false) {
		t.Fatal("HTTPS origin did not secure cookie")
	}
	t.Setenv("ARKOPLEX_PUBLIC_ORIGIN", "http://localhost:8800")
	p, err = FromEnv()
	if err != nil || p.SecureCookie(false) {
		t.Fatal("explicit local HTTP cookie wrong")
	}
	t.Setenv("ARKOPLEX_PUBLIC_ORIGIN", "https://demo.invalid/app")
	if _, err := FromEnv(); err == nil {
		t.Fatal("public origin accepted a path")
	}
}
