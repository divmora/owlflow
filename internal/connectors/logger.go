package connectors

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/divmora/owlflow/internal/logging"
)

type LoggerConnector struct {
	MinLevel string // Configurable minimum log level
}

type LogEntry struct {
	Timestamp time.Time              `json:"timestamp"`
	Level     string                 `json:"level"`
	Workflow  string                 `json:"workflow,omitempty"`
	Message   string                 `json:"message"`
	Fields    map[string]interface{} `json:"fields,omitempty"`
}

var levels = map[string]int{
	"debug": 1,
	"info":  2,
	"warn":  3,
	"error": 4,
}

func (l *LoggerConnector) Execute(action string, params map[string]interface{}) (interface{}, error) {
	// Validate log level
	level := strings.ToLower(action)
	if _, valid := levels[level]; !valid {
		return nil, fmt.Errorf("invalid log level: %s", action)
	}

	// Check against minimum level
	if levels[level] < levels[l.MinLevel] {
		return nil, nil
	}

	// Parse parameters
	message, ok := params["message"].(string)
	if !ok || message == "" {
		return nil, fmt.Errorf("missing required 'message' parameter")
	}

	fields := make(map[string]interface{})
	if f, exists := params["fields"]; exists {
		if fm, ok := f.(map[string]interface{}); ok {
			fields = fm
		}
	}

	// Create log entry
	entry := LogEntry{
		Timestamp: time.Now().UTC(),
		Level:     strings.ToUpper(level),
		Message:   message,
		Fields:    fields,
	}

	// Add workflow ID if available
	if wf, exists := params["__workflow_id"]; exists {
		entry.Workflow = wf.(string)
	}

	// Generate JSON output
	jsonData, err := json.Marshal(entry)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal log entry: %w", err)
	}

	log.Println(string(jsonData))

	if explicitSyslog, ok := params["syslog"].(bool); ok && explicitSyslog && !logging.IsSyslogEnabled() {
		_ = logging.SendToSyslog(string(jsonData))
	}

	return nil, nil
}

func (l *LoggerConnector) Validate(params map[string]interface{}) error {
	if _, exists := params["message"]; !exists {
		return fmt.Errorf("missing required 'message' parameter")
	}
	return nil
}
