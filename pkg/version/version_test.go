package version

import (
	"strings"
	"testing"
)

func TestGet(t *testing.T) {
	info := Get()
	if info.Version == "" {
		t.Error("expected non-empty version")
	}
	if info.GoVersion == "" {
		t.Error("expected non-empty go version")
	}
	if info.Platform == "" {
		t.Error("expected non-empty platform")
	}
}

func TestString(t *testing.T) {
	info := Get()
	str := info.String()
	if !strings.Contains(str, "OwlFlow") {
		t.Errorf("expected string to contain 'OwlFlow', got %s", str)
	}
}

func TestJSON(t *testing.T) {
	info := Get()
	jsonStr, err := info.JSON()
	if err != nil {
		t.Fatalf("unexpected error marshaling JSON: %v", err)
	}
	if !strings.Contains(jsonStr, `"version"`) {
		t.Errorf("expected JSON to contain '\"version\"', got %s", jsonStr)
	}
}
