package connectors

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHTTPConnector_Verbs(t *testing.T) {
	verbs := []struct {
		action         string
		expectedMethod string
	}{
		{"get", http.MethodGet},
		{"GET", http.MethodGet},
		{"post", http.MethodPost},
		{"POST", http.MethodPost},
		{"put", http.MethodPut},
		{"PUT", http.MethodPut},
		{"patch", http.MethodPatch},
		{"PATCH", http.MethodPatch},
		{"delete", http.MethodDelete},
		{"DELETE", http.MethodDelete},
	}

	for _, v := range verbs {
		t.Run("Action "+v.action, func(t *testing.T) {
			var recordedMethod string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				recordedMethod = r.Method
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"received": true}`))
			}))
			defer server.Close()

			connector := &HTTPConnector{}
			params := map[string]interface{}{
				"url":               server.URL,
				"allow_private_ips": true, // Allow loopback for httptest
			}

			res, err := connector.Execute(v.action, params)
			if err != nil {
				t.Fatalf("unexpected error executing %s: %v", v.action, err)
			}

			output, ok := res.(map[string]interface{})
			if !ok {
				t.Fatalf("expected output to be map[string]interface{}, got %T", res)
			}

			if output["status_code"] != http.StatusOK {
				t.Errorf("expected status_code 200, got %v", output["status_code"])
			}
			if output["body"] != `{"received": true}` {
				t.Errorf("expected body '{\"received\": true}', got %v", output["body"])
			}
			if recordedMethod != v.expectedMethod {
				t.Errorf("expected server to receive method %s, got %s", v.expectedMethod, recordedMethod)
			}
		})
	}
}

func TestHTTPConnector_CustomHeaders(t *testing.T) {
	var receivedAuth string
	var receivedCustom string
	var receivedContentType string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		receivedCustom = r.Header.Get("X-Custom-Header")
		receivedContentType = r.Header.Get("Content-Type")
		w.Header().Set("X-Server-Time", "test-time")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"created": true}`))
	}))
	defer server.Close()

	connector := &HTTPConnector{}
	params := map[string]interface{}{
		"url": server.URL,
		"headers": map[string]interface{}{
			"Authorization":   "Bearer token123",
			"X-Custom-Header": "custom-val",
			"Content-Type":    "application/xml",
		},
		"allow_private_ips": true,
	}

	res, err := connector.Execute("post", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	output := res.(map[string]interface{})
	if output["status_code"] != http.StatusCreated {
		t.Errorf("expected status_code 201, got %v", output["status_code"])
	}

	if receivedAuth != "Bearer token123" {
		t.Errorf("expected Authorization header 'Bearer token123', got %q", receivedAuth)
	}
	if receivedCustom != "custom-val" {
		t.Errorf("expected X-Custom-Header 'custom-val', got %q", receivedCustom)
	}
	if receivedContentType != "application/xml" {
		t.Errorf("expected Content-Type 'application/xml', got %q", receivedContentType)
	}

	respHeaders, ok := output["headers"].(map[string]string)
	if !ok {
		t.Fatalf("expected headers to be map[string]string, got %T", output["headers"])
	}
	if respHeaders["X-Server-Time"] != "test-time" {
		t.Errorf("expected response header X-Server-Time 'test-time', got %q", respHeaders["X-Server-Time"])
	}
}

func TestHTTPConnector_BodySerialization(t *testing.T) {
	t.Run("JSON Map Body with Auto Content-Type", func(t *testing.T) {
		var receivedBody string
		var receivedContentType string

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			b, _ := io.ReadAll(r.Body)
			receivedBody = string(b)
			receivedContentType = r.Header.Get("Content-Type")
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		connector := &HTTPConnector{}
		params := map[string]interface{}{
			"url": server.URL,
			"body": map[string]interface{}{
				"title": "New issue",
				"count": 42,
			},
			"allow_private_ips": true,
		}

		_, err := connector.Execute("post", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if receivedContentType != "application/json" {
			t.Errorf("expected Content-Type to default to application/json, got %q", receivedContentType)
		}

		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(receivedBody), &parsed); err != nil {
			t.Fatalf("failed to unmarshal received body: %v. Body was: %s", err, receivedBody)
		}
		if parsed["title"] != "New issue" || parsed["count"] != float64(42) {
			t.Errorf("unexpected body payload: %v", parsed)
		}
	})

	t.Run("Raw String Body", func(t *testing.T) {
		var receivedBody string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			b, _ := io.ReadAll(r.Body)
			receivedBody = string(b)
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		connector := &HTTPConnector{}
		rawPayload := "key1=val1&key2=val2"
		params := map[string]interface{}{
			"url":  server.URL,
			"body": rawPayload,
			"headers": map[string]string{
				"Content-Type": "application/x-www-form-urlencoded",
			},
			"allow_private_ips": true,
		}

		_, err := connector.Execute("post", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if receivedBody != rawPayload {
			t.Errorf("expected received body %q, got %q", rawPayload, receivedBody)
		}
	})

	t.Run("JSON Array Body", func(t *testing.T) {
		var receivedBody string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			b, _ := io.ReadAll(r.Body)
			receivedBody = string(b)
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		connector := &HTTPConnector{}
		params := map[string]interface{}{
			"url":               server.URL,
			"body":              []interface{}{"item1", "item2"},
			"allow_private_ips": true,
		}

		_, err := connector.Execute("put", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !strings.Contains(receivedBody, "item1") || !strings.Contains(receivedBody, "item2") {
			t.Errorf("expected JSON array body, got %q", receivedBody)
		}
	})
}

func TestHTTPConnector_Timeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	connector := &HTTPConnector{}

	t.Run("Timeout triggers when server is slower than timeout", func(t *testing.T) {
		params := map[string]interface{}{
			"url":               server.URL,
			"timeout":           "50ms",
			"allow_private_ips": true,
		}

		_, err := connector.Execute("get", params)
		if err == nil {
			t.Fatalf("expected timeout error, got nil")
		}
		if !strings.Contains(err.Error(), "context deadline exceeded") && !strings.Contains(err.Error(), "Timeout") && !strings.Contains(err.Error(), "timeout") {
			t.Errorf("expected timeout message in error, got: %v", err)
		}
	})

	t.Run("Succeeds when server responds within timeout", func(t *testing.T) {
		params := map[string]interface{}{
			"url":               server.URL,
			"timeout":           "1s",
			"allow_private_ips": true,
		}

		res, err := connector.Execute("get", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		output := res.(map[string]interface{})
		if output["status_code"] != http.StatusOK {
			t.Errorf("expected status 200, got %v", output["status_code"])
		}
	})
}

func TestHTTPConnector_SSRFProtection(t *testing.T) {
	connector := &HTTPConnector{}

	t.Run("Blocks localhost loopback by default", func(t *testing.T) {
		params := map[string]interface{}{
			"url": "http://127.0.0.1:8080/admin",
		}
		_, err := connector.Execute("get", params)
		if err == nil {
			t.Fatalf("expected SSRF block for 127.0.0.1, got nil")
		}
		if !strings.Contains(err.Error(), "SSRF protection") {
			t.Errorf("expected SSRF protection error, got: %v", err)
		}
	})

	t.Run("Blocks localhost hostname by default", func(t *testing.T) {
		params := map[string]interface{}{
			"url": "http://localhost:9000/internal",
		}
		_, err := connector.Execute("get", params)
		if err == nil {
			t.Fatalf("expected SSRF block for localhost, got nil")
		}
		if !strings.Contains(err.Error(), "SSRF protection") {
			t.Errorf("expected SSRF protection error, got: %v", err)
		}
	})

	t.Run("Blocks AWS/Cloud metadata IP (169.254.169.254)", func(t *testing.T) {
		params := map[string]interface{}{
			"url": "http://169.254.169.254/latest/meta-data/",
		}
		_, err := connector.Execute("get", params)
		if err == nil {
			t.Fatalf("expected SSRF block for cloud metadata, got nil")
		}
		if !strings.Contains(err.Error(), "SSRF protection") {
			t.Errorf("expected SSRF protection error, got: %v", err)
		}
	})

	t.Run("Blocks RFC1918 Class A (10.0.0.1)", func(t *testing.T) {
		params := map[string]interface{}{
			"url": "http://10.0.0.1/status",
		}
		_, err := connector.Execute("get", params)
		if err == nil {
			t.Fatalf("expected SSRF block for 10.0.0.1, got nil")
		}
		if !strings.Contains(err.Error(), "SSRF protection") {
			t.Errorf("expected SSRF protection error, got: %v", err)
		}
	})

	t.Run("Blocks RFC1918 Class B (172.16.0.1)", func(t *testing.T) {
		params := map[string]interface{}{
			"url": "http://172.16.0.1/api",
		}
		_, err := connector.Execute("get", params)
		if err == nil {
			t.Fatalf("expected SSRF block for 172.16.0.1, got nil")
		}
		if !strings.Contains(err.Error(), "SSRF protection") {
			t.Errorf("expected SSRF protection error, got: %v", err)
		}
	})

	t.Run("Blocks RFC1918 Class C (192.168.1.1)", func(t *testing.T) {
		params := map[string]interface{}{
			"url": "http://192.168.1.1/router",
		}
		_, err := connector.Execute("get", params)
		if err == nil {
			t.Fatalf("expected SSRF block for 192.168.1.1, got nil")
		}
		if !strings.Contains(err.Error(), "SSRF protection") {
			t.Errorf("expected SSRF protection error, got: %v", err)
		}
	})

	t.Run("Blocks IPv6 loopback [::1]", func(t *testing.T) {
		params := map[string]interface{}{
			"url": "http://[::1]:8080/data",
		}
		_, err := connector.Execute("get", params)
		if err == nil {
			t.Fatalf("expected SSRF block for [::1], got nil")
		}
		if !strings.Contains(err.Error(), "SSRF protection") {
			t.Errorf("expected SSRF protection error, got: %v", err)
		}
	})

	t.Run("Blocks non-HTTP scheme file://", func(t *testing.T) {
		params := map[string]interface{}{
			"url": "file:///etc/passwd",
		}
		_, err := connector.Execute("get", params)
		if err == nil {
			t.Fatalf("expected scheme error for file://, got nil")
		}
		if !strings.Contains(err.Error(), "only http and https are allowed") {
			t.Errorf("expected unsupported scheme error, got: %v", err)
		}
	})

	t.Run("Allows loopback when allow_private_ips parameter is true", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`"ok"`))
		}))
		defer server.Close()

		params := map[string]interface{}{
			"url":               server.URL,
			"allow_private_ips": true,
		}
		res, err := connector.Execute("get", params)
		if err != nil {
			t.Fatalf("unexpected error when allow_private_ips is true: %v", err)
		}
		output := res.(map[string]interface{})
		if output["status_code"] != http.StatusOK {
			t.Errorf("expected status 200, got %v", output["status_code"])
		}
	})

	t.Run("Allows loopback when HTTP_ALLOW_PRIVATE_IPS environment variable is true", func(t *testing.T) {
		t.Setenv("HTTP_ALLOW_PRIVATE_IPS", "true")

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`"env-ok"`))
		}))
		defer server.Close()

		params := map[string]interface{}{
			"url": server.URL,
		}
		res, err := connector.Execute("get", params)
		if err != nil {
			t.Fatalf("unexpected error when HTTP_ALLOW_PRIVATE_IPS=true: %v", err)
		}
		output := res.(map[string]interface{})
		if output["status_code"] != http.StatusOK {
			t.Errorf("expected status 200, got %v", output["status_code"])
		}
	})
}

func TestHTTPConnector_Validation(t *testing.T) {
	connector := &HTTPConnector{}

	tests := []struct {
		name        string
		params      map[string]interface{}
		expectError bool
		errorSubstr string
	}{
		{
			name:        "nil params",
			params:      nil,
			expectError: true,
			errorSubstr: "params cannot be nil",
		},
		{
			name:        "missing url param",
			params:      map[string]interface{}{},
			expectError: true,
			errorSubstr: "url parameter is required",
		},
		{
			name: "empty url string",
			params: map[string]interface{}{
				"url": "   ",
			},
			expectError: true,
			errorSubstr: "url parameter must be a non-empty string",
		},
		{
			name: "invalid url scheme",
			params: map[string]interface{}{
				"url": "gopher://example.com/item",
			},
			expectError: true,
			errorSubstr: "only http and https are allowed",
		},
		{
			name: "missing host in url",
			params: map[string]interface{}{
				"url": "http://",
			},
			expectError: true,
			errorSubstr: "URL missing host",
		},
		{
			name: "valid http url",
			params: map[string]interface{}{
				"url": "http://example.com/api",
			},
			expectError: false,
		},
		{
			name: "valid https url",
			params: map[string]interface{}{
				"url": "https://api.github.com/repos",
			},
			expectError: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := connector.Validate(tc.params)
			if tc.expectError {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.errorSubstr)
				}
				if !strings.Contains(err.Error(), tc.errorSubstr) {
					t.Errorf("expected error containing %q, got: %v", tc.errorSubstr, err)
				}
			} else {
				if err != nil {
					t.Errorf("expected valid params, got error: %v", err)
				}
			}
		})
	}
}

func TestHTTPConnector_UnsupportedAction(t *testing.T) {
	connector := &HTTPConnector{}
	params := map[string]interface{}{
		"url": "https://example.com",
	}

	_, err := connector.Execute("unsupported_verb", params)
	if err == nil {
		t.Fatalf("expected error for unsupported action, got nil")
	}
	if !strings.Contains(err.Error(), "unsupported HTTP action") {
		t.Errorf("expected 'unsupported HTTP action' error, got: %v", err)
	}
}
