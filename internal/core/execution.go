package core

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/divmora/owlflow/internal/connectors"
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
	return &Executor{
		Workflow:   wf,
		Connectors: connectors,
		Context: ExecutionContext{
			StepsData: make(map[string]interface{}),
			Vars:      wf.Vars,
		},
	}
}

func (e *Executor) Run(ctx context.Context, initialData ExecutionContext) error {
	// Initialize with root execution
	execStates := []*ExecutionState{
		{
			Context:     initialData,
			Queue:       []string{e.Workflow.Trigger.Config["initial_step"].(string)},
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

		// Execute step with isolated context
		output, err := e.executeStep(ctx, e.Workflow.StepsMap[currentStepID], state.Context.Copy())
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

		if e.Workflow.StepsMap[currentStepID].PassOutput {
			// Also store raw if PassOutput is true (backwards compatibility or specific use cases)
		} else {
			newContext.ParentOutputs = []interface{}{output}
		}

		// Create new branches for each valid next step
		for _, next := range e.Workflow.StepsMap[currentStepID].NextSteps {
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
	// Create execution context with schedule data
	execData := ExecutionContext{
		WorkflowID: e.Workflow.ID,
		TriggerData: map[string]interface{}{
			"type":     "schedule",
			"time":     time.Now().UTC(),
			"timezone": e.Workflow.Trigger.Config["timezone"],
		},
		StepsData: make(map[string]interface{}),
		Vars:      e.Workflow.Vars,
	}

	return e.Run(context.Background(), execData)
}

func (e *Executor) executeStep(ctx context.Context, step *Step, execData ExecutionContext) (interface{}, error) {
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
	connector := e.Connectors[parts[0]]

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
