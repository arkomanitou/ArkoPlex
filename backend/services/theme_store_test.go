package services

import (
	"os"
	"path/filepath"
	"pelagica-backend/models"
	"strings"
	"testing"
)

func TestThemeReadsDoNotCreateStorage(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "missing", "themes")
	store, err := NewThemeStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(store.GetAll()) != 0 {
		t.Fatal("fresh themes not empty")
	}
	if _, err := store.Get("missing"); err == nil {
		t.Fatal("missing theme returned")
	}
	if _, err := os.Stat(filepath.Dir(dir)); !os.IsNotExist(err) {
		t.Fatal("read created storage")
	}
}
func TestThemeIDsCannotEscapeStorage(t *testing.T) {
	root := t.TempDir()
	store, err := NewThemeStore(filepath.Join(root, "themes"))
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"../escape", "..", "/absolute", `a\b`, "%2e%2e%2fescape", "a/b", "a.json", strings.Repeat("x", 129)} {
		if _, err := store.Write(id, models.Theme{Name: "test"}); err == nil {
			t.Fatalf("write accepted %q", id)
		}
		if err := store.Delete(id); err == nil {
			t.Fatalf("delete accepted %q", id)
		}
	}
	files, _ := os.ReadDir(root)
	if len(files) != 0 {
		t.Fatal("invalid IDs wrote files")
	}
}
func TestThemePersistenceIsPrivateAndVisibleOnNextRead(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "themes")
	store, err := NewThemeStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"night-city_v1", "6e037bcf-1920-4b5f-adbc-854bb4e6ba02"} {
		if _, err := store.Write(id, models.Theme{Name: id}); err != nil {
			t.Fatal(err)
		}
		fi, err := os.Stat(filepath.Join(dir, id+".json"))
		if err != nil || fi.Mode().Perm() != 0600 {
			t.Fatal("theme not private", err)
		}
		reload, err := NewThemeStore(dir)
		if err != nil {
			t.Fatal(err)
		}
		theme, err := reload.Get(id)
		if err != nil || theme.Name != id {
			t.Fatal("write lost")
		}
		if err := reload.Delete(id); err != nil {
			t.Fatal(err)
		}
		next, _ := NewThemeStore(dir)
		if len(next.GetAll()) != 0 {
			t.Fatal("stale theme cache")
		}
	}
}
