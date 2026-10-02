package core

import (
	"context"
	"strings"
	"testing"

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
