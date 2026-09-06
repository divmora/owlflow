package logging

import (
	"bytes"
	"encoding/json"
	"log"
	"testing"
)

func TestJSONLogWriter(t *testing.T) {
	var buf bytes.Buffer
	writer := &jsonLogWriter{underlying: &buf}

	// 1. Test wrapping a plain string with [Component] prefix
	rawMsg := "[Executor] Executing step 'log_not_fingrid_branch' (action: logger.info)"
	_, err := writer.Write([]byte(rawMsg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var entry JSONLogEntry
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("failed to parse JSON log line: %v (raw: %s)", err, buf.String())
	}

	if entry.Component != "Executor" {
		t.Errorf("expected Component 'Executor', got %q", entry.Component)
	}
	if entry.Level != "INFO" {
		t.Errorf("expected Level 'INFO', got %q", entry.Level)
	}
	if entry.Message != "Executing step 'log_not_fingrid_branch' (action: logger.info)" {
		t.Errorf("unexpected Message: %q", entry.Message)
	}
	if entry.Timestamp == "" {
		t.Errorf("expected Timestamp to be set")
	}

	// 2. Test pre-formatted JSON pass-through
	buf.Reset()
	preformatted := `{"level":"WARN","message":"Direct JSON","custom":123}`
	_, err = writer.Write([]byte(preformatted))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(buf.Bytes(), &parsed); err != nil {
		t.Fatalf("failed to parse pass-through JSON: %v", err)
	}
	if parsed["message"] != "Direct JSON" {
		t.Errorf("expected pass-through message 'Direct JSON', got %v", parsed["message"])
	}

	// 3. Test log.Printf integration
	buf.Reset()
	log.SetOutput(writer)
	log.Printf("[JiraConnector] check_user_comment completed for issue PROJ-101: commented=true")

	var jiraEntry JSONLogEntry
	if err := json.Unmarshal(buf.Bytes(), &jiraEntry); err != nil {
		t.Fatalf("failed to parse log.Printf JSON: %v (raw: %s)", err, buf.String())
	}
	if jiraEntry.Component != "JiraConnector" {
		t.Errorf("expected Component 'JiraConnector', got %q", jiraEntry.Component)
	}
	if jiraEntry.Level != "INFO" {
		t.Errorf("expected Level 'INFO', got %q", jiraEntry.Level)
	}
}
