package metrics

import (
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
)

type Metrics struct {
	Registry *prometheus.Registry

	WorkflowExecutionsTotal    *prometheus.CounterVec
	WorkflowDurationSeconds    *prometheus.HistogramVec
	StepExecutionsTotal        *prometheus.CounterVec
	StepDurationSeconds        *prometheus.HistogramVec
	HTTPRequestsTotal          *prometheus.CounterVec
	HTTPRequestDurationSeconds *prometheus.HistogramVec
}

var (
	defaultMetrics *Metrics
	mu             sync.Mutex
)

// NewMetrics initializes and registers Prometheus collectors with the provided registry.
func NewMetrics(reg *prometheus.Registry) *Metrics {
	m := &Metrics{
		Registry: reg,
		WorkflowExecutionsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "owlflow",
				Subsystem: "workflow",
				Name:      "executions_total",
				Help:      "Total number of workflow executions partitioned by workflow ID and status.",
			},
			[]string{"workflow_id", "status"},
		),
		WorkflowDurationSeconds: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "owlflow",
				Subsystem: "workflow",
				Name:      "duration_seconds",
				Help:      "Duration of workflow executions in seconds partitioned by workflow ID and status.",
				Buckets:   prometheus.DefBuckets,
			},
			[]string{"workflow_id", "status"},
		),
		StepExecutionsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "owlflow",
				Subsystem: "step",
				Name:      "executions_total",
				Help:      "Total number of step executions partitioned by workflow ID, step ID, action, and status.",
			},
			[]string{"workflow_id", "step_id", "action", "status"},
		),
		StepDurationSeconds: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "owlflow",
				Subsystem: "step",
				Name:      "duration_seconds",
				Help:      "Duration of step executions in seconds partitioned by workflow ID, step ID, and action.",
				Buckets:   prometheus.DefBuckets,
			},
			[]string{"workflow_id", "step_id", "action"},
		),
		HTTPRequestsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "owlflow",
				Subsystem: "http",
				Name:      "requests_total",
				Help:      "Total number of HTTP requests processed partitioned by method, path, and status code.",
			},
			[]string{"method", "path", "status"},
		),
		HTTPRequestDurationSeconds: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "owlflow",
				Subsystem: "http",
				Name:      "request_duration_seconds",
				Help:      "Duration of HTTP requests in seconds partitioned by method and path.",
				Buckets:   prometheus.DefBuckets,
			},
			[]string{"method", "path"},
		),
	}

	reg.MustRegister(
		m.WorkflowExecutionsTotal,
		m.WorkflowDurationSeconds,
		m.StepExecutionsTotal,
		m.StepDurationSeconds,
		m.HTTPRequestsTotal,
		m.HTTPRequestDurationSeconds,
	)

	return m
}

// GetMetrics returns the default singleton Metrics instance.
func GetMetrics() *Metrics {
	mu.Lock()
	defer mu.Unlock()
	if defaultMetrics == nil {
		reg := prometheus.NewRegistry()
		reg.MustRegister(collectors.NewGoCollector())
		defaultMetrics = NewMetrics(reg)
	}
	return defaultMetrics
}

// ResetForTesting creates a fresh isolated registry and instance for testing.
func ResetForTesting() *Metrics {
	mu.Lock()
	defer mu.Unlock()
	reg := prometheus.NewRegistry()
	defaultMetrics = NewMetrics(reg)
	return defaultMetrics
}

func (m *Metrics) RecordWorkflow(workflowID, status string, durationSeconds float64) {
	if m == nil {
		return
	}
	m.WorkflowExecutionsTotal.WithLabelValues(workflowID, status).Inc()
	m.WorkflowDurationSeconds.WithLabelValues(workflowID, status).Observe(durationSeconds)
}

func (m *Metrics) RecordStep(workflowID, stepID, action, status string, durationSeconds float64) {
	if m == nil {
		return
	}
	m.StepExecutionsTotal.WithLabelValues(workflowID, stepID, action, status).Inc()
	m.StepDurationSeconds.WithLabelValues(workflowID, stepID, action).Observe(durationSeconds)
}

func (m *Metrics) RecordHTTP(method, path, status string, durationSeconds float64) {
	if m == nil {
		return
	}
	m.HTTPRequestsTotal.WithLabelValues(method, path, status).Inc()
	m.HTTPRequestDurationSeconds.WithLabelValues(method, path).Observe(durationSeconds)
}

// Middleware returns a Gin middleware for recording HTTP ingress request telemetry.
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		duration := time.Since(start).Seconds()

		path := c.FullPath()
		if path == "" {
			path = "unmatched"
		}
		status := strconv.Itoa(c.Writer.Status())
		GetMetrics().RecordHTTP(c.Request.Method, path, status, duration)
	}
}
