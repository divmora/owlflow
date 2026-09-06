package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/divmora/owlflow/internal/connectors"
	"github.com/divmora/owlflow/internal/core"
	"github.com/divmora/owlflow/internal/logging"
	"github.com/divmora/owlflow/internal/server"
)

func init() {
	// Initialize connectors
	connectors.Registry["http"] = &connectors.HTTPConnector{}
	connectors.Registry["internal"] = &connectors.InternalConnector{}
	connectors.Registry["logger"] = &connectors.LoggerConnector{}
	//connectors.Registry["slack"] = &connectors.SlackConnector{}
}

func main() {
	// Initialize logging (with Syslog support if enabled)
	logging.Init()

	// Initialize scheduler
	scheduler := core.NewScheduler()
	scheduler.ExecuteFn = func(wf *core.Workflow) {
		executor := core.NewExecutor(wf, connectors.Registry)
		go func() {
			if err := executor.RunScheduled(); err != nil {
				logging.Error("Scheduled workflow execution failed", "workflow_id", wf.ID, "error", err)
			}
		}()
	}

	// Load workflows from config
	workflows := loadWorkflowsFromFS()
	for _, wf := range workflows {
		if wf.Trigger.Type == core.TriggerSchedule {
			if err := scheduler.AddWorkflow(wf); err != nil {
				logging.Error("Failed to schedule workflow", "workflow_id", wf.ID, "error", err)
			}
		}
	}

	scheduler.Start()
	defer scheduler.Stop()

	// Setup API router
	api := server.NewAPI()
	r := api.SetupRouter()

	if err := r.Run(":8080"); err != nil {
		logging.Error("Server stopped with error", "error", err)
		os.Exit(1)
	}
}

func loadWorkflowsFromFS() []*core.Workflow {
	var workflows []*core.Workflow
	configPath := "./configs/workflows"

	err := filepath.Walk(configPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		ext := filepath.Ext(path)
		if ext != ".yaml" && ext != ".yml" && ext != ".json" {
			return nil
		}

		// Read file content
		content, err := os.ReadFile(path)
		if err != nil {
			logging.Error("Failed to read workflow file", "path", path, "error", err)
			return nil
		}

		// Parse workflow
		var wf core.Workflow
		if ext == ".json" {
			if err := json.Unmarshal(content, &wf); err != nil {
				logging.Error("Failed to parse JSON workflow", "path", path, "error", err)
				return nil
			}
		} else {
			if err := yaml.Unmarshal(content, &wf); err != nil {
				logging.Error("Failed to parse YAML workflow", "path", path, "error", err)
				return nil
			}
		}

		// Get ID from filename
		filename := filepath.Base(path)
		id := strings.TrimSuffix(filename, filepath.Ext(filename))
		if wf.ID == "" {
			wf.ID = id
		}

		// Validate status
		if wf.Status == "" {
			wf.Status = core.StatusDraft
		}

		// Build steps map
		wf.StepsMap = make(map[string]*core.Step)
		for i := range wf.Steps {
			step := &wf.Steps[i]

			// Set default retries if not specified
			if step.Retries == 0 {
				step.Retries = 1
			}

			wf.StepsMap[step.ID] = step
		}

		workflows = append(workflows, &wf)
		return nil
	})

	if err != nil {
		logging.Error("Error walking through workflows dir", "error", err)
	}

	return workflows
}
