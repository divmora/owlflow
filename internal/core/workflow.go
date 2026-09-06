package core

import "fmt"

type WorkflowStatus string

const (
	StatusActive   WorkflowStatus = "active"
	StatusDisabled WorkflowStatus = "disabled"
	StatusDraft    WorkflowStatus = "draft"
)

type TriggerType string

const (
	TriggerWebhook  TriggerType = "webhook"
	TriggerSchedule TriggerType = "schedule"
	TriggerManual   TriggerType = "manual"
)

type Trigger struct {
	Type   TriggerType            `json:"type" yaml:"type"`
	Config map[string]interface{} `json:"config" yaml:"config"`
}

type ScheduleConfig struct {
	Cron     string `json:"cron"`
	Timezone string `json:"timezone"` // Optional
}

type NextStep struct {
	StepID    string `json:"step_id" yaml:"step_id"`
	Condition string `json:"condition"`
}

type Step struct {
	ID         string                 `json:"id" yaml:"id"`
	Action     string                 `json:"action" yaml:"action"`
	Params     map[string]interface{} `json:"params" yaml:"params"`
	NextSteps  []NextStep             `json:"next_steps" yaml:"next_steps"`
	PassOutput bool                   `json:"pass_output" yaml:"pass_output"`
	Retries    int                    `json:"retries" yaml:"retries"`
	Timeout    int                    `json:"timeout" yaml:"timeout"` // Seconds
}

type Workflow struct {
	ID      string                 `json:"id" yaml:"id"`
	Name    string                 `json:"name" yaml:"name"`
	Status  WorkflowStatus         `json:"status" yaml:"status"`
	Vars    map[string]interface{} `json:"vars" yaml:"vars"`
	Trigger Trigger                `json:"trigger" yaml:"trigger"`
	Steps   []Step                 `json:"steps" yaml:"steps"`
	// StepsMap for quick lookup
	StepsMap map[string]*Step `json:"-"`
}

func (w *Workflow) Validate() error {
	// Check initial step exists
	initialStep := w.Trigger.Config["initial_step"].(string)
	if _, exists := w.StepsMap[initialStep]; !exists {
		return fmt.Errorf("initial step %s not found", initialStep)
	}

	// Validate all next_steps references
	for _, step := range w.Steps {
		for _, next := range step.NextSteps {
			if _, exists := w.StepsMap[next.StepID]; !exists {
				return fmt.Errorf("step %s references invalid next step: %s",
					step.ID, next.StepID)
			}
		}
	}

	return nil
}
