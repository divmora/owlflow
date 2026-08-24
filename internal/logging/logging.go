package logging

import (
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"sync"
)

var (
	syslogWriter io.Writer
	mu           sync.Mutex
	initialized  bool
)

func init() {
	Init()
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

// Init initializes the application logging output based on environment settings.
func Init() {
	mu.Lock()
	defer mu.Unlock()

	if IsSyslogEnabled() {
		w, err := getSyslogWriter()
		if err == nil && w != nil {
			syslogWriter = w
			if os.Getenv("SYSLOG_ONLY") == "true" || os.Getenv("SYSLOG_ONLY") == "1" {
				log.SetOutput(w)
			} else {
				log.SetOutput(io.MultiWriter(os.Stdout, w))
			}
			log.SetFlags(0)
			if !initialized {
				log.Println("[OwlFlow] System logger initialized with Syslog")
			}
			initialized = true
			return
		} else if err != nil && !initialized {
			log.Printf("[OwlFlow] Warning: Failed to initialize Syslog: %v (falling back to stdout)", err)
		}
	}
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
