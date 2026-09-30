package core

import (
	"strings"
	"testing"
)

func TestWorkflowValidate_Success(t *testing.T) {
	wf := &Workflow{
		ID:     "valid-wf",
		Name:   "Valid Workflow",
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
				NextSteps: []NextStep{
					{StepID: "step2"},
				},
			},
			{
				ID:     "step2",
				Action: "logger.info",
			},
		},
	}

	if err := wf.Validate(); err != nil {
		t.Fatalf("expected valid workflow to pass, got error: %v", err)
	}

	if wf.StepsMap == nil {
		t.Fatalf("expected StepsMap to be initialized by Validate")
	}

	if _, ok := wf.StepsMap["step1"]; !ok {
		t.Errorf("expected step1 in StepsMap")
	}
}

func TestWorkflowValidate_MissingSteps(t *testing.T) {
	wf := &Workflow{
		ID:     "no-steps",
		Status: StatusActive,
		Trigger: Trigger{
			Type: TriggerWebhook,
			Config: map[string]interface{}{
				"initial_step": "step1",
			},
		},
		Steps: []Step{},
	}

	err := wf.Validate()
	if err == nil {
		t.Fatal("expected error for empty steps, got nil")
	}
	if !strings.Contains(err.Error(), "at least one step") {
		t.Errorf("expected 'at least one step' error, got: %v", err)
	}
}

func TestWorkflowValidate_NilTriggerConfig(t *testing.T) {
	wf := &Workflow{
		ID:     "nil-config",
		Status: StatusActive,
		Trigger: Trigger{
			Type:   TriggerWebhook,
			Config: nil,
		},
		Steps: []Step{
			{ID: "step1", Action: "logger.info"},
		},
	}

	// Must not panic
	err := wf.Validate()
	if err == nil {
		t.Fatal("expected error for nil trigger config, got nil")
	}
	if !strings.Contains(err.Error(), "trigger config is required") {
		t.Errorf("expected 'trigger config is required' error, got: %v", err)
	}
}

func TestWorkflowValidate_MissingInitialStep(t *testing.T) {
	wf := &Workflow{
		ID:     "missing-initial-step",
		Status: StatusActive,
		Trigger: Trigger{
			Type:   TriggerWebhook,
			Config: map[string]interface{}{},
		},
		Steps: []Step{
			{ID: "step1", Action: "logger.info"},
		},
	}

	// Must not panic
	err := wf.Validate()
	if err == nil {
		t.Fatal("expected error for missing initial_step, got nil")
	}
	if !strings.Contains(err.Error(), "missing required 'initial_step'") {
		t.Errorf("expected 'missing required initial_step' error, got: %v", err)
	}
}

func TestWorkflowValidate_NonStringInitialStep(t *testing.T) {
	testCases := []struct {
		name string
		val  interface{}
	}{
		{"nil value", nil},
		{"integer value", 123},
		{"boolean value", true},
		{"empty string", ""},
		{"whitespace string", "   "},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			wf := &Workflow{
				ID:     "invalid-initial-step",
				Status: StatusActive,
				Trigger: Trigger{
					Type: TriggerWebhook,
					Config: map[string]interface{}{
						"initial_step": tc.val,
					},
				},
				Steps: []Step{
					{ID: "step1", Action: "logger.info"},
				},
			}

			// Must not panic
			err := wf.Validate()
			if err == nil {
				t.Fatalf("expected error for initial_step=%v, got nil", tc.val)
			}
		})
	}
}

func TestWorkflowValidate_InitialStepNotFound(t *testing.T) {
	wf := &Workflow{
		ID:     "not-found-initial",
		Status: StatusActive,
		Trigger: Trigger{
			Type: TriggerWebhook,
			Config: map[string]interface{}{
				"initial_step": "non_existent_step",
			},
		},
		Steps: []Step{
			{ID: "step1", Action: "logger.info"},
		},
	}

	err := wf.Validate()
	if err == nil {
		t.Fatal("expected error for non-existent initial step, got nil")
	}
	if !strings.Contains(err.Error(), "initial step 'non_existent_step' not found") {
		t.Errorf("expected 'initial step not found' error, got: %v", err)
	}
}

func TestWorkflowValidate_InvalidNextStepReference(t *testing.T) {
	wf := &Workflow{
		ID:     "invalid-next-step",
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
				NextSteps: []NextStep{
					{StepID: "ghost_step"},
				},
			},
		},
	}

	err := wf.Validate()
	if err == nil {
		t.Fatal("expected error for invalid next_step reference, got nil")
	}
	if !strings.Contains(err.Error(), "references invalid next step: ghost_step") {
		t.Errorf("expected 'references invalid next step' error, got: %v", err)
	}
}
