package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestMetrics_RecordWorkflow(t *testing.T) {
	m := ResetForTesting()

	m.RecordWorkflow("ci-pipeline", "success", 1.25)
	m.RecordWorkflow("ci-pipeline", "failure", 0.50)

	// Gather metrics from registry
	families, err := m.Registry.Gather()
	if err != nil {
		t.Fatalf("failed to gather metrics: %v", err)
	}

	foundCounter := false
	foundHistogram := false

	for _, fam := range families {
		if fam.GetName() == "owlflow_workflow_executions_total" {
			foundCounter = true
			if len(fam.GetMetric()) != 2 {
				t.Errorf("expected 2 metric series for workflow executions, got %d", len(fam.GetMetric()))
			}
		}
		if fam.GetName() == "owlflow_workflow_duration_seconds" {
			foundHistogram = true
			if len(fam.GetMetric()) != 2 {
				t.Errorf("expected 2 metric series for workflow duration, got %d", len(fam.GetMetric()))
			}
		}
	}

	if !foundCounter {
		t.Errorf("expected owlflow_workflow_executions_total metric family to exist")
	}
	if !foundHistogram {
		t.Errorf("expected owlflow_workflow_duration_seconds metric family to exist")
	}
}

func TestMetrics_RecordStep(t *testing.T) {
	m := ResetForTesting()

	m.RecordStep("wf-1", "step-1", "logger.info", "success", 0.05)
	m.RecordStep("wf-1", "step-2", "http.get", "failure", 2.10)

	families, err := m.Registry.Gather()
	if err != nil {
		t.Fatalf("failed to gather metrics: %v", err)
	}

	foundCounter := false
	foundHistogram := false

	for _, fam := range families {
		if fam.GetName() == "owlflow_step_executions_total" {
			foundCounter = true
			if len(fam.GetMetric()) != 2 {
				t.Errorf("expected 2 metric series for step executions, got %d", len(fam.GetMetric()))
			}
		}
		if fam.GetName() == "owlflow_step_duration_seconds" {
			foundHistogram = true
		}
	}

	if !foundCounter {
		t.Errorf("expected owlflow_step_executions_total metric family to exist")
	}
	if !foundHistogram {
		t.Errorf("expected owlflow_step_duration_seconds metric family to exist")
	}
}

func TestMetrics_RecordHTTP_And_Middleware(t *testing.T) {
	m := ResetForTesting()

	router := gin.New()
	router.Use(Middleware())
	router.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "pong")
	})
	router.GET("/webhook/:id", func(c *gin.Context) {
		c.String(http.StatusAccepted, "received")
	})
	router.GET("/metrics", func(c *gin.Context) {
		promhttp.HandlerFor(m.Registry, promhttp.HandlerOpts{}).ServeHTTP(c.Writer, c.Request)
	})

	// Test static path
	req1 := httptest.NewRequest(http.MethodGet, "/ping", nil)
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Errorf("expected HTTP 200, got %d", w1.Code)
	}

	// Test parameterized path (preserves low cardinality /webhook/:id)
	req2 := httptest.NewRequest(http.MethodGet, "/webhook/my-flow-123", nil)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	if w2.Code != http.StatusAccepted {
		t.Errorf("expected HTTP 202, got %d", w2.Code)
	}

	// Test 404 unmatched path
	req3 := httptest.NewRequest(http.MethodGet, "/non-existent", nil)
	w3 := httptest.NewRecorder()
	router.ServeHTTP(w3, req3)
	if w3.Code != http.StatusNotFound {
		t.Errorf("expected HTTP 404, got %d", w3.Code)
	}

	// Now check /metrics output
	reqMetrics := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	wMetrics := httptest.NewRecorder()
	router.ServeHTTP(wMetrics, reqMetrics)

	if wMetrics.Code != http.StatusOK {
		t.Fatalf("expected /metrics HTTP 200, got %d", wMetrics.Code)
	}

	body := wMetrics.Body.String()
	if !strings.Contains(body, "owlflow_http_requests_total") {
		t.Errorf("expected output to contain owlflow_http_requests_total, got: %s", body)
	}
	if !strings.Contains(body, `path="/webhook/:id"`) {
		t.Errorf("expected output to preserve parameterized path /webhook/:id, got: %s", body)
	}
	if !strings.Contains(body, `path="unmatched"`) {
		t.Errorf("expected output to handle unmatched 404 routes as 'unmatched', got: %s", body)
	}
}

func TestMetrics_NilSafety(t *testing.T) {
	var m *Metrics
	// Should not panic on nil receiver
	m.RecordWorkflow("wf", "success", 1.0)
	m.RecordStep("wf", "st", "act", "success", 1.0)
	m.RecordHTTP("GET", "/", "200", 1.0)
}

func TestGetMetrics_Singleton(t *testing.T) {
	m1 := GetMetrics()
	m2 := GetMetrics()
	if m1 == nil || m2 == nil {
		t.Fatalf("expected non-nil metrics instances")
	}
	if m1 != m2 {
		t.Errorf("expected GetMetrics to return singleton instance")
	}
}
