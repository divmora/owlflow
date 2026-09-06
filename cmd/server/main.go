package main

import (
	"encoding/json"
	"log"
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
		go executor.RunScheduled()
	}

	// Load workflows from config
	workflows := loadWorkflowsFromFS()
	for _, wf := range workflows {
		if wf.Trigger.Type == core.TriggerSchedule {
			if err := scheduler.AddWorkflow(wf); err != nil {
				log.Printf("Failed to schedule workflow %s: %v", wf.ID, err)
			}
		}
	}

	scheduler.Start()
	defer scheduler.Stop()

	// Setup API router
	api := server.NewAPI()
	r := api.SetupRouter()

	r.Run(":8080")
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
			log.Printf("failed to read %s: %v", path, err)
			return nil
		}

		// Parse workflow
		var wf core.Workflow
		if ext == ".json" {
			if err := json.Unmarshal(content, &wf); err != nil {
				log.Printf("failed to parse JSON workflow %s: %v", path, err)
				return nil
			}
		} else {
			if err := yaml.Unmarshal(content, &wf); err != nil {
				log.Printf("failed to parse YAML workflow %s: %v", path, err)
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
		log.Printf("Error walking through workflows dir: %v", err)
	}

	return workflows
}
