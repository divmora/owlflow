//go:build windows

package logging

import (
	"fmt"
	"io"
	"net"
	"os"
	"sync"
	"time"
)

type windowsSyslogWriter struct {
	conn net.Conn
	mu   sync.Mutex
	tag  string
}

func (w *windowsSyslogWriter) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.conn == nil {
		return len(p), nil
	}
	msg := fmt.Sprintf("<14>%s %s: %s", time.Now().Format(time.Stamp), w.tag, string(p))
	return w.conn.Write([]byte(msg))
}

func getSyslogWriter() (io.Writer, error) {
	network := os.Getenv("SYSLOG_NETWORK")
	if network == "" {
		network = "udp"
	}
	addr := os.Getenv("SYSLOG_ADDR")
	if addr == "" {
		addr = "127.0.0.1:514"
	}
	tag := os.Getenv("SYSLOG_TAG")
	if tag == "" {
		tag = "owlflow"
	}

	conn, err := net.Dial(network, addr)
	if err != nil {
		return nil, err
	}
	return &windowsSyslogWriter{conn: conn, tag: tag}, nil
}
