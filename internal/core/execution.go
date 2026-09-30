package core

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/divmora/owlflow/internal/connectors"
	"github.com/divmora/owlflow/internal/logging"
)

type ExecutionContext struct {
	WorkflowID    string
	ExecutionID   string
	TriggerData   map[string]interface{}
	StepsData     map[string]interface{}
	Vars          map[string]interface{}
	ParentOutputs []interface{}
}

type ExecutionState struct {
	Context     ExecutionContext
	Queue       []string
	ParentSteps []string
}

type Executor struct {
	Workflow   *Workflow
	Connectors map[string]connectors.Connector
	Context    ExecutionContext
}

func NewExecutor(wf *Workflow, connectors map[string]connectors.Connector) *Executor {
	logging.Init()
	var vars map[string]interface{}
	if wf != nil {
		vars = wf.Vars
	}
	return &Executor{
		Workflow:   wf,
		Connectors: connectors,
		Context: ExecutionContext{
			StepsData: make(map[string]interface{}),
			Vars:      vars,
		},
	}
}

func (e *Executor) Run(ctx context.Context, initialData ExecutionContext) error {
	logging.Init()
	if e.Workflow == nil {
		return fmt.Errorf("workflow cannot be nil")
	}

	if e.Workflow.StepsMap == nil {
		e.Workflow.InitStepsMap()
	}

	if e.Workflow.Trigger.Config == nil {
		return fmt.Errorf("workflow trigger config is missing")
	}

	rawInitialStep, ok := e.Workflow.Trigger.Config["initial_step"]
	if !ok || rawInitialStep == nil {
		return fmt.Errorf("missing 'initial_step' in trigger config")
	}

	initialStep, ok := rawInitialStep.(string)
	if !ok || strings.TrimSpace(initialStep) == "" {
		return fmt.Errorf("trigger config 'initial_step' must be a non-empty string")
	}

	if _, exists := e.Workflow.StepsMap[initialStep]; !exists {
		return fmt.Errorf("initial step '%s' not found in workflow", initialStep)
	}

	// Initialize with root execution
	execStates := []*ExecutionState{
		{
			Context:     initialData,
			Queue:       []string{initialStep},
			ParentSteps: []string{},
		},
	}

	for len(execStates) > 0 {
		state := execStates[0]
		execStates = execStates[1:]

		if len(state.Queue) == 0 {
			continue
		}

		currentStepID := state.Queue[0]
		state.Queue = state.Queue[1:]

		step, exists := e.Workflow.StepsMap[currentStepID]
		if !exists || step == nil {
			log.Printf("[Executor] Step '%s' not found in workflow steps map", currentStepID)
			continue
		}

		// Execute step with isolated context
		output, err := e.executeStep(ctx, step, state.Context.Copy())
		if err != nil {
			log.Printf("[Executor] Error executing step %s: %v", currentStepID, err)
			continue
		}

		// Update context for children
		newContext := state.Context.Copy()

		// Always store in StepsData with .output wrapper for template consistency
		newContext.StepsData[currentStepID] = map[string]interface{}{
			"output": output,
		}

		if step.PassOutput {
			// Also store raw if PassOutput is true (backwards compatibility or specific use cases)
		} else {
			newContext.ParentOutputs = []interface{}{output}
		}

		// Create new branches for each valid next step
		for _, next := range step.NextSteps {
			if _, nextExists := e.Workflow.StepsMap[next.StepID]; !nextExists {
				log.Printf("[Executor] Step '%s' references non-existent next step '%s'", currentStepID, next.StepID)
				continue
			}
			ok, err := evaluateCondition(next.Condition, newContext)
			if err != nil {
				log.Printf("[Executor] Error evaluating condition for step %s: %v", currentStepID, err)
				continue
			}
			if !ok {
				continue
			}

			// Create isolated branch context
			branchContext := newContext.Copy()

			execStates = append(execStates, &ExecutionState{
				Context:     branchContext,
				Queue:       []string{next.StepID},
				ParentSteps: append(state.ParentSteps, currentStepID),
			})
		}
	}
	return nil
}

func (e *Executor) RunScheduled() error {
	if e.Workflow == nil {
		return fmt.Errorf("workflow cannot be nil")
	}
	var tz interface{}
	if e.Workflow.Trigger.Config != nil {
		tz = e.Workflow.Trigger.Config["timezone"]
	}
	// Create execution context with schedule data
	execData := ExecutionContext{
		WorkflowID: e.Workflow.ID,
		TriggerData: map[string]interface{}{
			"type":     "schedule",
			"time":     time.Now().UTC(),
			"timezone": tz,
		},
		StepsData: make(map[string]interface{}),
		Vars:      e.Workflow.Vars,
	}

	return e.Run(context.Background(), execData)
}

func (e *Executor) executeStep(ctx context.Context, step *Step, execData ExecutionContext) (interface{}, error) {
	if step == nil {
		return nil, fmt.Errorf("step cannot be nil")
	}
	log.Printf("[Executor] Executing step '%s' (action: %s)", step.ID, step.Action)
	// Resolve parameters with templating
	params, err := resolveParams(step.Params, execData)
	if err != nil {
		log.Printf("[Executor] Error resolving params for step '%s': %v", step.ID, err)
		return nil, err
	}

	// Get connector
	parts := strings.Split(step.Action, ".")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid action format")
	}
	connector, ok := e.Connectors[parts[0]]
	if !ok || connector == nil {
		return nil, fmt.Errorf("connector '%s' not found", parts[0])
	}

	// Execute with retries
	var output interface{}
	err = retry(step, func() error {
		result, err := connector.Execute(parts[1], params)
		if err != nil {
			log.Printf("[Executor] Error executing step '%s': %v", step.ID, err)
			return err
		}
		output = result
		return nil
	})

	log.Printf("[Executor] Step '%s' completed successfully", step.ID)

	return output, err
}

// Copy Deep copy implementation for ExecutionContext
func (ec ExecutionContext) Copy() ExecutionContext {
	// Copy StepsData
	stepsCopy := make(map[string]interface{})
	for k, v := range ec.StepsData {
		stepsCopy[k] = deepCopy(v)
	}

	// Copy ParentOutputs
	parentCopy := make([]interface{}, len(ec.ParentOutputs))
	for i, v := range ec.ParentOutputs {
		parentCopy[i] = deepCopy(v)
	}

	// Copy Vars
	varsCopy := make(map[string]interface{})
	for k, v := range ec.Vars {
		varsCopy[k] = deepCopy(v)
	}

	return ExecutionContext{
		WorkflowID:    ec.WorkflowID,
		TriggerData:   deepCopy(ec.TriggerData).(map[string]interface{}),
		StepsData:     stepsCopy,
		Vars:          varsCopy,
		ParentOutputs: parentCopy,
		ExecutionID:   ec.ExecutionID,
	}
}

func deepCopy(value interface{}) interface{} {
	switch v := value.(type) {
	case map[string]interface{}:
		copy := make(map[string]interface{})
		for key, val := range v {
			copy[key] = deepCopy(val)
		}
		return copy
	case []interface{}:
		copy := make([]interface{}, len(v))
		for i, val := range v {
			copy[i] = deepCopy(val)
		}
		return copy
	default:
		// For simple types and structs that don't need deep copying
		return v
	}
}
