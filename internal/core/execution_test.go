package core

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/divmora/owlflow/internal/connectors"
)

func TestExecutor_Run_NilWorkflow(t *testing.T) {
	executor := NewExecutor(nil, connectors.Registry)
	err := executor.Run(context.Background(), ExecutionContext{})
	if err == nil {
		t.Fatal("expected error when workflow is nil, got nil")
	}
	if !strings.Contains(err.Error(), "workflow cannot be nil") {
		t.Errorf("expected 'workflow cannot be nil' error, got: %v", err)
	}
}

func TestExecutor_Run_MissingInitialStep(t *testing.T) {
	wf := &Workflow{
		ID:     "no-initial-step",
		Status: StatusActive,
		Trigger: Trigger{
			Type:   TriggerWebhook,
			Config: map[string]interface{}{},
		},
		Steps: []Step{
			{ID: "step1", Action: "logger.info"},
		},
	}

	executor := NewExecutor(wf, connectors.Registry)
	// Must not panic
	err := executor.Run(context.Background(), ExecutionContext{})
	if err == nil {
		t.Fatal("expected error when initial_step is missing, got nil")
	}
	if !strings.Contains(err.Error(), "missing 'initial_step'") {
		t.Errorf("expected 'missing initial_step' error, got: %v", err)
	}
}

func TestExecutor_Run_InitialStepNotFound(t *testing.T) {
	wf := &Workflow{
		ID:     "missing-step-ref",
		Status: StatusActive,
		Trigger: Trigger{
			Type: TriggerWebhook,
			Config: map[string]interface{}{
				"initial_step": "non_existent",
			},
		},
		Steps: []Step{
			{ID: "step1", Action: "logger.info"},
		},
	}

	executor := NewExecutor(wf, connectors.Registry)
	// Must not panic
	err := executor.Run(context.Background(), ExecutionContext{})
	if err == nil {
		t.Fatal("expected error when initial step does not exist, got nil")
	}
	if !strings.Contains(err.Error(), "initial step 'non_existent' not found") {
		t.Errorf("expected not found error, got: %v", err)
	}
}

func TestExecutor_ExecuteStep_UnknownConnector(t *testing.T) {
	wf := &Workflow{
		ID:     "unknown-connector-wf",
		Status: StatusActive,
		Trigger: Trigger{
			Type: TriggerWebhook,
			Config: map[string]interface{}{
				"initial_step": "step1",
			},
		},
		Steps: []Step{
			{
				ID:     "step1",
				Action: "nonexistent_connector.do_something",
				Params: map[string]interface{}{},
			},
		},
	}

	executor := NewExecutor(wf, connectors.Registry)
	// Must not panic
	err := executor.Run(context.Background(), ExecutionContext{})
	if err != nil {
		t.Errorf("Run should complete loop even if step fails, got: %v", err)
	}
}

func TestExecutor_RunScheduled_NilConfig(t *testing.T) {
	wf := &Workflow{
		ID:     "scheduled-nil-config",
		Status: StatusActive,
		Trigger: Trigger{
			Type:   TriggerSchedule,
			Config: nil,
		},
		Steps: []Step{
			{ID: "step1", Action: "logger.info"},
		},
	}

	executor := NewExecutor(wf, connectors.Registry)
	// Must not panic
	err := executor.RunScheduled()
	if err == nil {
		t.Fatal("expected error when schedule trigger config is nil, got nil")
	}
}

func TestExecutor_ExecuteStep_ConnectorValidationFailure(t *testing.T) {
	wf := &Workflow{
		ID:     "validation-failure-wf",
		Status: StatusActive,
		Trigger: Trigger{
			Type: TriggerWebhook,
			Config: map[string]interface{}{
				"initial_step": "step1",
			},
		},
		Steps: []Step{
			{
				ID:     "step1",
				Action: "logger.info",
				Params: map[string]interface{}{}, // missing required "message" param
			},
		},
	}

	executor := NewExecutor(wf, connectors.Registry)
	ctx := context.Background()
	_, err := executor.executeStep(ctx, &wf.Steps[0], ExecutionContext{})
	if err == nil {
		t.Fatal("expected error when parameter validation fails, got nil")
	}
	if !strings.Contains(err.Error(), "parameter validation failed") {
		t.Errorf("expected 'parameter validation failed' error, got: %v", err)
	}
}

func TestExecutor_ExecuteStep_ConnectorValidationSuccess(t *testing.T) {
	wf := &Workflow{
		ID:     "validation-success-wf",
		Status: StatusActive,
		Trigger: Trigger{
			Type: TriggerWebhook,
			Config: map[string]interface{}{
				"initial_step": "step1",
			},
		},
		Steps: []Step{
			{
				ID:      "step1",
				Action:  "logger.info",
				Retries: 1,
				Params: map[string]interface{}{
					"message": "valid message",
				},
			},
		},
	}

	executor := NewExecutor(wf, connectors.Registry)
	ctx := context.Background()
	_, err := executor.executeStep(ctx, &wf.Steps[0], ExecutionContext{})
	if err != nil {
		t.Fatalf("unexpected error when validation succeeds: %v", err)
	}
}

func TestRetry_RetriesZero_Success(t *testing.T) {
	step := &Step{
		ID:      "step-zero",
		Retries: 0,
	}
	calls := 0
	err := retry(step, func() error {
		calls++
		return nil
	})
	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected exactly 1 call when retries=0, got: %d", calls)
	}
}

func TestRetry_RetriesZero_Failure(t *testing.T) {
	step := &Step{
		ID:      "step-zero-fail",
		Retries: 0,
	}
	expectedErr := errors.New("upstream service unavailable")
	calls := 0
	err := retry(step, func() error {
		calls++
		return expectedErr
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, expectedErr) {
		t.Fatalf("expected errors.Is(err, expectedErr) to be true, got: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected exactly 1 call when retries=0, got: %d", calls)
	}
}

func TestRetry_RetriesTwo_SucceedsOnThirdAttempt(t *testing.T) {
	step := &Step{
		ID:      "step-retry-success",
		Retries: 2,
	}
	calls := 0
	err := retryWithBackoff(context.Background(), step, time.Millisecond, func() error {
		calls++
		if calls < 3 {
			return errors.New("temporary network blip")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("expected nil error on 3rd attempt, got: %v", err)
	}
	if calls != 3 {
		t.Fatalf("expected 3 total calls (1 initial + 2 retries), got: %d", calls)
	}
}

func TestRetry_RetriesTwo_ExhaustedRetries_PreservesRootCause(t *testing.T) {
	step := &Step{
		ID:      "step-retry-exhausted",
		Retries: 2,
	}
	rootErr := errors.New("database connection refused: 5432")
	calls := 0
	err := retryWithBackoff(context.Background(), step, time.Millisecond, func() error {
		calls++
		return rootErr
	})
	if err == nil {
		t.Fatal("expected error when retries exhausted, got nil")
	}
	if !errors.Is(err, rootErr) {
		t.Fatalf("expected wrapped error to match rootErr via errors.Is, got: %v", err)
	}
	if !strings.Contains(err.Error(), "max retries exceeded") {
		t.Errorf("expected error message to mention 'max retries exceeded', got: %v", err)
	}
	if !strings.Contains(err.Error(), rootErr.Error()) {
		t.Errorf("expected error message to contain root error text, got: %v", err)
	}
	if calls != 3 {
		t.Fatalf("expected 3 total attempts (1 initial + 2 retries), got: %d", calls)
	}
}

func TestRetry_NegativeRetries_TreatedAsZero(t *testing.T) {
	step := &Step{
		ID:      "step-negative-retries",
		Retries: -5,
	}
	calls := 0
	err := retry(step, func() error {
		calls++
		return nil
	})
	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected exactly 1 attempt for negative retries, got: %d", calls)
	}
}

func TestRetry_ContextCancellation(t *testing.T) {
	step := &Step{
		ID:      "step-ctx-cancel",
		Retries: 5,
	}
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	err := retryWithBackoff(ctx, step, 50*time.Millisecond, func() error {
		calls++
		cancel() // Cancel context during first failure
		return errors.New("fail attempt")
	})
	if err == nil {
		t.Fatal("expected error on cancelled context, got nil")
	}
	if calls > 2 {
		t.Fatalf("expected retry loop to abort promptly after context cancellation, got %d calls", calls)
	}
}

func TestRetry_NilStep(t *testing.T) {
	err := retry(nil, func() error {
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "step cannot be nil") {
		t.Fatalf("expected 'step cannot be nil' error, got: %v", err)
	}
}

func TestExecutor_ExecuteStep_RetriesZeroSuccess(t *testing.T) {
	wf := &Workflow{
		ID:     "retries-zero-wf",
		Status: StatusActive,
		Trigger: Trigger{
			Type: TriggerWebhook,
			Config: map[string]interface{}{
				"initial_step": "step1",
			},
		},
		Steps: []Step{
			{
				ID:      "step1",
				Action:  "logger.info",
				Retries: 0,
				Params: map[string]interface{}{
					"message": "zero retries works",
				},
			},
		},
	}

	executor := NewExecutor(wf, connectors.Registry)
	ctx := context.Background()
	_, err := executor.executeStep(ctx, &wf.Steps[0], ExecutionContext{})
	if err != nil {
		t.Fatalf("unexpected error when executing step with retries=0: %v", err)
	}
}
