package logging

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"
)

var (
	syslogWriter io.Writer
	destWriter   io.Writer
	slogLogger   *slog.Logger
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

// Init initializes the application logging output using Go's native log/slog with JSON formatting.
func Init() {
	mu.Lock()
	defer mu.Unlock()

	var baseWriter io.Writer = os.Stdout

	if IsSyslogEnabled() {
		w, err := getSyslogWriter()
		if err == nil {
			syslogWriter = w
			if os.Getenv("SYSLOG_ONLY") == "true" || os.Getenv("SYSLOG_ONLY") == "1" {
				baseWriter = w
			} else {
				baseWriter = io.MultiWriter(os.Stdout, w)
			}
		} else if !initialized {
			log.Printf("[OwlFlow] Warning: Failed to initialize Syslog: %v (falling back to stdout)", err)
		}
	}

	destWriter = baseWriter

	// Configure standard library slog handler
	handler := slog.NewJSONHandler(destWriter, &slog.HandlerOptions{
		Level: slog.LevelInfo,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				if t, ok := a.Value.Any().(time.Time); ok {
					return slog.String(slog.TimeKey, t.UTC().Format(time.RFC3339Nano))
				}
			}
			return a
		},
	})
	slogLogger = slog.New(handler)
	slog.SetDefault(slogLogger)

	// Redirect standard log library through jsonLogWriter to ensure uniform JSON formatting
	log.SetFlags(0)
	log.SetOutput(&jsonLogWriter{underlying: destWriter})

	if !initialized {
		initialized = true
	}
}

// Logger returns the global native *slog.Logger instance.
func Logger() *slog.Logger {
	mu.Lock()
	defer mu.Unlock()
	if slogLogger == nil {
		return slog.Default()
	}
	return slogLogger
}

// Info logs at LevelInfo using standard log/slog.
func Info(msg string, args ...any) {
	slog.Info(msg, args...)
}

// Warn logs at LevelWarn using standard log/slog.
func Warn(msg string, args ...any) {
	slog.Warn(msg, args...)
}

// Error logs at LevelError using standard log/slog.
func Error(msg string, args ...any) {
	slog.Error(msg, args...)
}

// Debug logs at LevelDebug using standard log/slog.
func Debug(msg string, args ...any) {
	slog.Debug(msg, args...)
}

// With returns a new Logger that includes the given attributes.
func With(args ...any) *slog.Logger {
	return slog.Default().With(args...)
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
