package services

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

var configMu sync.RWMutex

func ArkoPlexConfigPath() string {
	if path := os.Getenv("ARKOPLEX_CONFIG_PATH"); path != "" {
		return path
	}
	dir := os.Getenv("SERVERS_DIR")
	if dir == "" {
		dir = "servers"
	}
	return filepath.Join(dir, "arkoplex", "config.json")
}

// Retain all JSON fields, including settings introduced by a newer frontend.
func ReadArkoPlexConfig() (map[string]json.RawMessage, error) {
	configMu.RLock()
	defer configMu.RUnlock()
	data, err := os.ReadFile(ArkoPlexConfigPath())
	if errors.Is(err, os.ErrNotExist) {
		return map[string]json.RawMessage{}, nil
	}
	if err != nil {
		return nil, err
	}
	var cfg map[string]json.RawMessage
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if cfg == nil {
		return nil, errors.New("configuration must be a JSON object")
	}
	return cfg, nil
}

func SaveArkoPlexConfig(cfg map[string]json.RawMessage) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	configMu.Lock()
	defer configMu.Unlock()
	return AtomicPrivateWrite(ArkoPlexConfigPath(), append(data, '\n'))
}

// A failed write must not truncate a previously valid configuration or logo.
func AtomicPrivateWrite(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, ".arkoplex-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
