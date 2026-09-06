//go:build !windows

package logging

import (
	"io"
	"log/syslog"
	"os"
)

func getSyslogWriter() (io.Writer, error) {
	network := os.Getenv("SYSLOG_NETWORK") // "udp", "tcp", or "" for local /dev/log
	addr := os.Getenv("SYSLOG_ADDR")       // e.g. "127.0.0.1:514" or "" for local
	tag := os.Getenv("SYSLOG_TAG")
	if tag == "" {
		tag = "owlflow"
	}

	if network != "" || addr != "" {
		return syslog.Dial(network, addr, syslog.LOG_INFO|syslog.LOG_DAEMON, tag)
	}
	return syslog.New(syslog.LOG_INFO|syslog.LOG_DAEMON, tag)
}
