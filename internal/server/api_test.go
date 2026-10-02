package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/divmora/owlflow/internal/core"
	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupTestWorkflowDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	// 1. Active workflow with secret
	activeYaml := `
id: active-wf
name: Active Workflow
status: active
trigger:
  type: webhook
  config:
    initial_step: step1
    secret: supersecret123
steps:
  - id: step1
    action: logger.info
    params:
      message: "hello"
`
	if err := os.WriteFile(filepath.Join(dir, "active-wf.yaml"), []byte(activeYaml), 0644); err != nil {
		t.Fatalf("failed to create test workflow: %v", err)
	}

	// 2. Draft workflow
	draftYaml := `
id: draft-wf
name: Draft Workflow
status: draft
trigger:
  type: webhook
  config:
    initial_step: step1
steps:
  - id: step1
    action: logger.info
    params:
      message: "draft hello"
`
	if err := os.WriteFile(filepath.Join(dir, "draft-wf.yaml"), []byte(draftYaml), 0644); err != nil {
		t.Fatalf("failed to create test draft workflow: %v", err)
	}

	return dir
}

func TestWorkflowIDRegexValidation(t *testing.T) {
	validIDs := []string{
		"active-wf",
		"github_monitor",
		"workflow-123",
		"wf_test_A",
		"MY-WORKFLOW-99",
	}

	for _, id := range validIDs {
		if !validWorkflowIDRegex.MatchString(id) {
			t.Errorf("expected valid ID '%s' to match regex, but it did not", id)
		}
	}

	invalidIDs := []string{
		"",
		"../workflow",
		"../../etc/passwd",
		"workflow/sub",
		"workflow*",
		"workflow?",
		"workflow[1]",
		"workflow$name",
		"workflow name",
		"workflow;rm",
		"workflow.yaml",
	}

	for _, id := range invalidIDs {
		if validWorkflowIDRegex.MatchString(id) {
			t.Errorf("expected invalid ID '%s' to be rejected by regex, but it matched", id)
		}
	}
}

func TestLoadWorkflowByID_Security(t *testing.T) {
	dir := setupTestWorkflowDir(t)

	api := NewAPI()
	api.WorkflowConfigPath = dir

	t.Run("Loads valid workflow", func(t *testing.T) {
		wf, err := api.loadWorkflowByID("active-wf")
		if err != nil {
			t.Fatalf("expected to load workflow successfully, got: %v", err)
		}
		if wf.ID != "active-wf" {
			t.Errorf("expected workflow ID 'active-wf', got '%s'", wf.ID)
		}
		if wf.Status != core.StatusActive {
			t.Errorf("expected status 'active', got '%s'", wf.Status)
		}
	})

	t.Run("Rejects path traversal via relative navigation", func(t *testing.T) {
		_, err := api.loadWorkflowByID("../main")
		if err == nil {
			t.Fatalf("expected error for path traversal, got nil")
		}
		if !strings.Contains(err.Error(), "invalid workflow ID") {
			t.Errorf("expected 'invalid workflow ID' error, got: %v", err)
		}
	})

	t.Run("Rejects glob wildcards", func(t *testing.T) {
		_, err := api.loadWorkflowByID("*")
		if err == nil {
			t.Fatalf("expected error for glob wildcard, got nil")
		}
		if !strings.Contains(err.Error(), "invalid workflow ID") {
			t.Errorf("expected 'invalid workflow ID' error, got: %v", err)
		}
	})

	t.Run("Returns not found for non-existent valid ID", func(t *testing.T) {
		_, err := api.loadWorkflowByID("non-existent-wf")
		if err == nil {
			t.Fatalf("expected error for non-existent workflow, got nil")
		}
		if !strings.Contains(err.Error(), "workflow not found") {
			t.Errorf("expected 'workflow not found' error, got: %v", err)
		}
	})
}

func TestHandleWebhook_PathTraversalAndValidation(t *testing.T) {
	dir := setupTestWorkflowDir(t)

	api := NewAPI()
	api.WorkflowConfigPath = dir
	router := api.SetupRouter()

	t.Run("Path traversal ID returns 400 Bad Request", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/webhook/..main", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected HTTP 400 for path traversal, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Invalid workflow ID characters returns 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/webhook/invalid*id", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected HTTP 400 for invalid characters, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Non-existent workflow returns 404 Not Found", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/webhook/missing-wf", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Errorf("expected HTTP 404 for missing workflow, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Draft workflow returns 403 Forbidden", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/webhook/draft-wf", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("expected HTTP 403 for draft workflow, got %d. Body: %s", w.Code, w.Body.String())
		}
	})
}

func TestVerifyWebhook_ConstantTimeComparison(t *testing.T) {
	dir := setupTestWorkflowDir(t)

	api := NewAPI()
	api.WorkflowConfigPath = dir
	router := api.SetupRouter()

	t.Run("GitLab token correct secret succeeds authentication", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(`{"hello":"world"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Gitlab-Token", "supersecret123")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusAccepted && w.Code != http.StatusOK {
			t.Errorf("expected HTTP 202/200 with valid token, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("GitLab token incorrect secret returns 401 Unauthorized", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(`{"hello":"world"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Gitlab-Token", "wrongsecret")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected HTTP 401 with wrong token, got %d. Body: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "invalid gitlab token") {
			t.Errorf("expected error message to contain 'invalid gitlab token', got: %s", w.Body.String())
		}
	})

	t.Run("HMAC SHA256 signature verification passes when valid", func(t *testing.T) {
		payload := `{"test":"payload"}`
		mac := hmac.New(sha256.New, []byte("supersecret123"))
		mac.Write([]byte(payload))
		sig := fmt.Sprintf("sha256=%s", hex.EncodeToString(mac.Sum(nil)))

		// Set up an active workflow without double-read issue or check verifyWebhook directly
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(payload))
		req.Header.Set("X-Hub-Signature-256", sig)
		c.Request = req

		wf, err := api.loadWorkflowByID("active-wf")
		if err != nil {
			t.Fatalf("failed to load workflow: %v", err)
		}

		if err := api.verifyWebhook(c, wf); err != nil {
			t.Errorf("expected HMAC verification to succeed, got: %v", err)
		}
	})

	t.Run("HMAC SHA256 signature verification fails when signature is wrong", func(t *testing.T) {
		payload := `{"test":"payload"}`
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(payload))
		req.Header.Set("X-Hub-Signature-256", "sha256=invalidmacvalue")
		c.Request = req

		wf, err := api.loadWorkflowByID("active-wf")
		if err != nil {
			t.Fatalf("failed to load workflow: %v", err)
		}

		if err := api.verifyWebhook(c, wf); err == nil {
			t.Errorf("expected HMAC verification to fail for invalid signature, got nil")
		}
	})
}

func TestHealthCheckEndpoints(t *testing.T) {
	api := NewAPI()
	router := api.SetupRouter()

	endpoints := []struct {
		path           string
		expectedStatus int
		expectedKey    string
		expectedVal    string
	}{
		{"/healthz", http.StatusOK, "status", "ok"},
		{"/readyz", http.StatusOK, "status", "ready"},
		{"/health", http.StatusOK, "status", "ok"},
	}

	for _, ep := range endpoints {
		t.Run("GET "+ep.path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, ep.path, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != ep.expectedStatus {
				t.Errorf("expected HTTP %d, got %d", ep.expectedStatus, w.Code)
			}

			if !strings.Contains(w.Body.String(), fmt.Sprintf(`"%s":"%s"`, ep.expectedKey, ep.expectedVal)) {
				t.Errorf("expected body to contain '%s':'%s', got: %s", ep.expectedKey, ep.expectedVal, w.Body.String())
			}
		})
	}
}

func TestHandleWebhook_HMACAuthenticationAndDoubleRead(t *testing.T) {
	dir := setupTestWorkflowDir(t)

	api := NewAPI()
	api.WorkflowConfigPath = dir
	router := api.SetupRouter()

	secret := "supersecret123"

	calcHMAC := func(payload string) string {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte(payload))
		return fmt.Sprintf("sha256=%s", hex.EncodeToString(mac.Sum(nil)))
	}

	t.Run("Valid HMAC authenticated JSON webhook succeeds (resolves double-read issue)", func(t *testing.T) {
		payload := `{"event":"push","ref":"refs/heads/main"}`
		sig := calcHMAC(payload)

		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Hub-Signature-256", sig)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusAccepted {
			t.Fatalf("expected HTTP 202 Accepted, got %d. Body: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), `"status":"accepted"`) {
			t.Errorf("expected response to contain '\"status\":\"accepted\"', got: %s", w.Body.String())
		}
	})

	t.Run("Valid HMAC authenticated webhook executes synchronously in AWS Lambda environment", func(t *testing.T) {
		t.Setenv("AWS_LAMBDA_FUNCTION_NAME", "owlflow-lambda-test")

		payload := `{"event":"lambda_trigger","action":"deploy"}`
		sig := calcHMAC(payload)

		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Hub-Signature-256", sig)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected HTTP 200 OK in Lambda environment, got %d. Body: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), `"status":"completed"`) {
			t.Errorf("expected response to contain '\"status\":\"completed\"', got: %s", w.Body.String())
		}
	})

	t.Run("Valid HMAC authenticated form-urlencoded webhook succeeds", func(t *testing.T) {
		payload := "user=alice&action=login"
		sig := calcHMAC(payload)

		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("X-Hub-Signature-256", sig)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusAccepted {
			t.Fatalf("expected HTTP 202 Accepted, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Valid HMAC authenticated raw text webhook succeeds", func(t *testing.T) {
		payload := "plain text raw payload"
		sig := calcHMAC(payload)

		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(payload))
		req.Header.Set("Content-Type", "text/plain")
		req.Header.Set("X-Hub-Signature-256", sig)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusAccepted {
			t.Fatalf("expected HTTP 202 Accepted, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Missing HMAC signature returns 401 Unauthorized", func(t *testing.T) {
		payload := `{"event":"push"}`

		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected HTTP 401 Unauthorized for missing signature, got %d. Body: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "missing signature") {
			t.Errorf("expected 'missing signature' error, got: %s", w.Body.String())
		}
	})

	t.Run("Invalid HMAC signature returns 401 Unauthorized", func(t *testing.T) {
		payload := `{"event":"push"}`

		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Hub-Signature-256", "sha256=badsignature")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected HTTP 401 Unauthorized for invalid signature, got %d. Body: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "invalid signature") {
			t.Errorf("expected 'invalid signature' error, got: %s", w.Body.String())
		}
	})

	t.Run("Empty body is handled gracefully without error", func(t *testing.T) {
		payload := ""
		sig := calcHMAC(payload)

		req := httptest.NewRequest(http.MethodPost, "/webhook/active-wf", strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Hub-Signature-256", sig)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusAccepted {
			t.Fatalf("expected HTTP 202 Accepted, got %d. Body: %s", w.Code, w.Body.String())
		}
	})
}

func TestGetRequestBody_CachingAndRewind(t *testing.T) {
	api := NewAPI()
	bodyContent := `{"test":"caching"}`

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(bodyContent))

	// First read
	first, err := api.getRequestBody(c)
	if err != nil {
		t.Fatalf("unexpected error on first read: %v", err)
	}
	if string(first) != bodyContent {
		t.Fatalf("expected '%s', got '%s'", bodyContent, string(first))
	}

	// Second read (from cache)
	second, err := api.getRequestBody(c)
	if err != nil {
		t.Fatalf("unexpected error on second read: %v", err)
	}
	if string(second) != bodyContent {
		t.Fatalf("expected '%s', got '%s'", bodyContent, string(second))
	}

	// Verify c.Request.Body was rewound and can still be read directly
	readDirect, err := io.ReadAll(c.Request.Body)
	if err != nil {
		t.Fatalf("unexpected error reading rewound request body: %v", err)
	}
	if string(readDirect) != bodyContent {
		t.Fatalf("expected '%s' from direct body read, got '%s'", bodyContent, string(readDirect))
	}
}
