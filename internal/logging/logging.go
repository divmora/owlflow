package logging

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"sync"
	"time"
)

var (
	syslogWriter io.Writer
	destWriter   io.Writer
	mu           sync.Mutex
	initialized  bool
)

func init() {
	Init()
}

// JSONLogEntry represents a structured JSON log line.
type JSONLogEntry struct {
	Timestamp string                 `json:"timestamp"`
	Level     string                 `json:"level"`
	Component string                 `json:"component,omitempty"`
	Workflow  string                 `json:"workflow,omitempty"`
	Step      string                 `json:"step,omitempty"`
	Message   string                 `json:"message"`
	Fields    map[string]interface{} `json:"fields,omitempty"`
}

type jsonLogWriter struct {
	underlying io.Writer
}

func (w *jsonLogWriter) Write(p []byte) (n int, err error) {
	raw := strings.TrimSpace(string(p))
	if raw == "" {
		return len(p), nil
	}

	// If already valid JSON object, write as-is
	if strings.HasPrefix(raw, "{") && strings.HasSuffix(raw, "}") {
		var js map[string]interface{}
		if json.Unmarshal([]byte(raw), &js) == nil {
			_, err = fmt.Fprintln(w.underlying, raw)
			return len(p), err
		}
	}

	// Parse level and component from conventional prefixes
	level := "INFO"
	component := "OwlFlow"
	message := raw

	// Check for log prefixes like [Executor], [JiraConnector], etc.
	if strings.HasPrefix(raw, "[") && strings.Contains(raw, "]") {
		endIdx := strings.Index(raw, "]")
		component = strings.TrimSpace(raw[1:endIdx])
		message = strings.TrimSpace(raw[endIdx+1:])
	}

	// Detect level keywords in message
	msgLower := strings.ToLower(message)
	if strings.Contains(msgLower, "error") || strings.Contains(msgLower, "failed") {
		level = "ERROR"
	} else if strings.Contains(msgLower, "warning") || strings.Contains(msgLower, "warn") {
		level = "WARN"
	} else if strings.Contains(msgLower, "debug") {
		level = "DEBUG"
	}

	entry := JSONLogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level,
		Component: component,
		Message:   message,
	}

	b, jsonErr := json.Marshal(entry)
	if jsonErr != nil {
		_, err = fmt.Fprintln(w.underlying, raw)
		return len(p), err
	}

	_, err = fmt.Fprintln(w.underlying, string(b))
	return len(p), err
}

// IsSyslogEnabled returns true if any standard Syslog environment variable is active.
func IsSyslogEnabled() bool {
	check := func(key string) bool {
		v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
		return v == "true" || v == "1" || v == "yes"
	}
	return check("SYSLOG_ENABLED") ||
		check("USE_SYSLOG") ||
		check("ENABLE_SYSLOG") ||
		check("SYSLOG") ||
		os.Getenv("SYSLOG_ADDR") != ""
}

// Init initializes the application logging output to format all logs as structured JSON lines.
func Init() {
	mu.Lock()
	defer mu.Unlock()

	var baseWriter io.Writer = os.Stdout

	if IsSyslogEnabled() {
		w, err := getSyslogWriter()
		if err == nil && w != nil {
			syslogWriter = w
			if os.Getenv("SYSLOG_ONLY") == "true" || os.Getenv("SYSLOG_ONLY") == "1" {
				baseWriter = w
			} else {
				baseWriter = io.MultiWriter(os.Stdout, w)
			}
		} else if err != nil && !initialized {
			log.Printf("[OwlFlow] Warning: Failed to initialize Syslog: %v (falling back to stdout)", err)
		}
	}

	destWriter = baseWriter
	log.SetFlags(0)
	log.SetOutput(&jsonLogWriter{underlying: destWriter})

	if !initialized {
		initialized = true
	}
}

// Log emits a structured JSON log entry.
func Log(level, component, message string, fields map[string]interface{}) {
	entry := JSONLogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     strings.ToUpper(level),
		Component: component,
		Message:   message,
		Fields:    fields,
	}
	b, err := json.Marshal(entry)
	if err == nil {
		mu.Lock()
		w := destWriter
		if w == nil {
			w = os.Stdout
		}
		mu.Unlock()
		fmt.Fprintln(w, string(b))
	} else {
		log.Println(message)
	}
}

// Info emits a structured INFO level JSON log line.
func Info(component, message string, fields ...map[string]interface{}) {
	var f map[string]interface{}
	if len(fields) > 0 {
		f = fields[0]
	}
	Log("INFO", component, message, f)
}

// Infof formats and emits a structured INFO level JSON log line.
func Infof(component, format string, args ...interface{}) {
	Info(component, fmt.Sprintf(format, args...))
}

// Warn emits a structured WARN level JSON log line.
func Warn(component, message string, fields ...map[string]interface{}) {
	var f map[string]interface{}
	if len(fields) > 0 {
		f = fields[0]
	}
	Log("WARN", component, message, f)
}

// Warnf formats and emits a structured WARN level JSON log line.
func Warnf(component, format string, args ...interface{}) {
	Warn(component, fmt.Sprintf(format, args...))
}

// Error emits a structured ERROR level JSON log line.
func Error(component, message string, fields ...map[string]interface{}) {
	var f map[string]interface{}
	if len(fields) > 0 {
		f = fields[0]
	}
	Log("ERROR", component, message, f)
}

// Errorf formats and emits a structured ERROR level JSON log line.
func Errorf(component, format string, args ...interface{}) {
	Error(component, fmt.Sprintf(format, args...))
}

// Debug emits a structured DEBUG level JSON log line.
func Debug(component, message string, fields ...map[string]interface{}) {
	var f map[string]interface{}
	if len(fields) > 0 {
		f = fields[0]
	}
	Log("DEBUG", component, message, f)
}

// Debugf formats and emits a structured DEBUG level JSON log line.
func Debugf(component, format string, args ...interface{}) {
	Debug(component, fmt.Sprintf(format, args...))
}

// GetSyslogWriter returns the active syslog writer or attempts to create one.
func GetSyslogWriter() (io.Writer, error) {
	mu.Lock()
	defer mu.Unlock()
	if syslogWriter != nil {
		return syslogWriter, nil
	}
	return getSyslogWriter()
}

// SendToSyslog explicitly sends a string message to Syslog.
func SendToSyslog(msg string) error {
	w, err := GetSyslogWriter()
	if err != nil {
		return err
	}
	if w == nil {
		return fmt.Errorf("syslog writer unavailable")
	}
	_, err = fmt.Fprintln(w, msg)
	return err
}
