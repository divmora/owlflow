package logging

import (
	"io"
	"log"
	"os"
)

// Init initializes the application logging output based on environment settings.
func Init() {
	if os.Getenv("SYSLOG_ENABLED") == "true" || os.Getenv("USE_SYSLOG") == "true" || os.Getenv("SYSLOG_ADDR") != "" {
		w, err := getSyslogWriter()
		if err == nil && w != nil {
			if os.Getenv("SYSLOG_ONLY") == "true" || os.Getenv("SYSLOG_ONLY") == "1" {
				log.SetOutput(w)
			} else {
				log.SetOutput(io.MultiWriter(os.Stdout, w))
			}
			log.SetFlags(0)
			log.Println("[OwlFlow] System logger initialized with Syslog")
			return
		} else if err != nil {
			log.Printf("[OwlFlow] Warning: Failed to initialize Syslog: %v (falling back to stdout)", err)
		}
	}
}
