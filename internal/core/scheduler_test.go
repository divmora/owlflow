package core

import (
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestScheduler_Standard5FieldCron(t *testing.T) {
	s := NewScheduler()

	fiveFieldCrons := []string{
		"0 * * * *",
		"*/5 * * * *",
		"30 4 1 * *",
		"0 0 * * 0",
		"15 14 1 * *",
	}

	for _, expr := range fiveFieldCrons {
		wf := &Workflow{
			ID:     "wf-" + expr,
			Status: StatusActive,
			Trigger: Trigger{
				Type: TriggerSchedule,
				Config: map[string]interface{}{
					"cron": expr,
				},
			},
		}

		err := s.AddWorkflow(wf)
		if err != nil {
			t.Errorf("expected 5-field cron '%s' to be accepted, got error: %v", expr, err)
		}
	}

	if len(s.ListWorkflows()) != len(fiveFieldCrons) {
		t.Errorf("expected %d scheduled workflows, got %d", len(fiveFieldCrons), len(s.ListWorkflows()))
	}
}

func TestScheduler_6FieldCronWithSeconds(t *testing.T) {
	s := NewScheduler()

	sixFieldCrons := []string{
		"*/5 * * * * *",
		"30 0 * * * *",
		"0 0 12 * * ?",
		"10 30 9 * * 1-5",
	}

	for _, expr := range sixFieldCrons {
		wf := &Workflow{
			ID:     "wf-6-" + expr,
			Status: StatusActive,
			Trigger: Trigger{
				Type: TriggerSchedule,
				Config: map[string]interface{}{
					"cron": expr,
				},
			},
		}

		err := s.AddWorkflow(wf)
		if err != nil {
			t.Errorf("expected 6-field cron '%s' to be accepted, got error: %v", expr, err)
		}
	}
}

func TestScheduler_Descriptors(t *testing.T) {
	s := NewScheduler()

	descriptors := []string{
		"@hourly",
		"@daily",
		"@weekly",
		"@every 1m",
	}

	for _, desc := range descriptors {
		wf := &Workflow{
			ID:     "wf-desc-" + desc,
			Status: StatusActive,
			Trigger: Trigger{
				Type: TriggerSchedule,
				Config: map[string]interface{}{
					"cron": desc,
				},
			},
		}

		err := s.AddWorkflow(wf)
		if err != nil {
			t.Errorf("expected descriptor '%s' to be accepted, got error: %v", desc, err)
		}
	}
}

func TestScheduler_Timezone(t *testing.T) {
	s := NewScheduler()

	t.Run("Valid timezone", func(t *testing.T) {
		wf := &Workflow{
			ID:     "tz-valid",
			Status: StatusActive,
			Trigger: Trigger{
				Type: TriggerSchedule,
				Config: map[string]interface{}{
					"cron":     "0 9 * * *",
					"timezone": "America/New_York",
				},
			},
		}

		err := s.AddWorkflow(wf)
		if err != nil {
			t.Fatalf("expected valid timezone to succeed, got: %v", err)
		}
	})

	t.Run("Invalid timezone returns error", func(t *testing.T) {
		wf := &Workflow{
			ID:     "tz-invalid",
			Status: StatusActive,
			Trigger: Trigger{
				Type: TriggerSchedule,
				Config: map[string]interface{}{
					"cron":     "0 9 * * *",
					"timezone": "Invalid/Timezone_Not_Real",
				},
			},
		}

		err := s.AddWorkflow(wf)
		if err == nil {
			t.Fatal("expected error for invalid timezone, got nil")
		}
		if !strings.Contains(err.Error(), "invalid timezone") {
			t.Errorf("expected 'invalid timezone' error, got: %v", err)
		}
	})
}

func TestScheduler_WorkflowLifecycle(t *testing.T) {
	s := NewScheduler()

	wf := &Workflow{
		ID:     "scheduled-wf-1",
		Status: StatusActive,
		Trigger: Trigger{
			Type: TriggerSchedule,
			Config: map[string]interface{}{
				"cron": "0 * * * *",
			},
		},
	}

	// 1. Add workflow
	if err := s.AddWorkflow(wf); err != nil {
		t.Fatalf("failed to add workflow: %v", err)
	}

	// 2. Get workflow
	retrieved, exists := s.GetWorkflow("scheduled-wf-1")
	if !exists || retrieved == nil {
		t.Fatalf("expected workflow to be retrieved")
	}
	if retrieved.ID != "scheduled-wf-1" {
		t.Errorf("expected ID 'scheduled-wf-1', got '%s'", retrieved.ID)
	}

	// 3. List workflows
	list := s.ListWorkflows()
	if len(list) != 1 {
		t.Fatalf("expected 1 workflow in list, got %d", len(list))
	}

	// 4. Update workflow with new cron schedule
	updatedWf := &Workflow{
		ID:     "scheduled-wf-1",
		Status: StatusActive,
		Trigger: Trigger{
			Type: TriggerSchedule,
			Config: map[string]interface{}{
				"cron": "*/10 * * * *",
			},
		},
	}
	if err := s.AddWorkflow(updatedWf); err != nil {
		t.Fatalf("failed to update workflow: %v", err)
	}
	if len(s.ListWorkflows()) != 1 {
		t.Errorf("updating existing workflow should maintain 1 entry, got %d", len(s.ListWorkflows()))
	}

	// 5. Remove workflow
	removed := s.RemoveWorkflow("scheduled-wf-1")
	if !removed {
		t.Errorf("expected RemoveWorkflow to return true for existing workflow")
	}

	_, exists = s.GetWorkflow("scheduled-wf-1")
	if exists {
		t.Errorf("expected workflow to be removed from workflows map")
	}

	if s.RemoveWorkflow("non-existent") {
		t.Errorf("expected RemoveWorkflow to return false for non-existent workflow")
	}
}

func TestScheduler_StatusAndValidation(t *testing.T) {
	s := NewScheduler()

	t.Run("Non-active workflow is ignored", func(t *testing.T) {
		wf := &Workflow{
			ID:     "draft-sched",
			Status: StatusDraft,
			Trigger: Trigger{
				Type: TriggerSchedule,
				Config: map[string]interface{}{
					"cron": "* * * * *",
				},
			},
		}
		err := s.AddWorkflow(wf)
		if err != nil {
			t.Fatalf("unexpected error for draft workflow: %v", err)
		}
		if len(s.ListWorkflows()) != 0 {
			t.Errorf("draft workflow should not be registered in scheduler")
		}
	})

	t.Run("Nil workflow returns error", func(t *testing.T) {
		err := s.AddWorkflow(nil)
		if err == nil {
			t.Fatal("expected error for nil workflow, got nil")
		}
	})

	t.Run("Missing cron expression returns error", func(t *testing.T) {
		wf := &Workflow{
			ID:     "no-cron",
			Status: StatusActive,
			Trigger: Trigger{
				Type:   TriggerSchedule,
				Config: map[string]interface{}{},
			},
		}
		err := s.AddWorkflow(wf)
		if err == nil {
			t.Fatal("expected error for missing cron, got nil")
		}
	})
}

func TestScheduler_ExecutionTrigger(t *testing.T) {
	s := NewScheduler()

	var executed atomic.Int32
	s.ExecuteFn = func(wf *Workflow) {
		executed.Add(1)
	}

	wf := &Workflow{
		ID:     "rapid-trigger",
		Status: StatusActive,
		Trigger: Trigger{
			Type: TriggerSchedule,
			Config: map[string]interface{}{
				"cron": "@every 1s",
			},
		},
	}

	if err := s.AddWorkflow(wf); err != nil {
		t.Fatalf("failed to add workflow: %v", err)
	}

	s.Start()
	defer s.Stop()

	// Wait up to 1500ms for 1s cron to fire at least once
	deadline := time.Now().Add(1500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if executed.Load() > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	if executed.Load() == 0 {
		t.Errorf("expected scheduled workflow to execute at least once")
	}
}
