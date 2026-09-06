package connectors

import (
	"fmt"
	"io"
	"net/http"
)

type HTTPConnector struct{}

func (h *HTTPConnector) Execute(action string, params map[string]interface{}) (interface{}, error) {
	switch action {
	case "get":
		url, ok := params["url"].(string)
		if !ok || url == "" {
			return nil, fmt.Errorf("url parameter is required")
		}
		resp, err := http.Get(url)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("failed to read response body: %w", err)
		}
		return map[string]interface{}{
			"status_code": resp.StatusCode,
			"body":        string(body),
		}, nil
	}
	return nil, fmt.Errorf("unsupported HTTP action: %s", action)
}

func (h *HTTPConnector) Validate(params map[string]interface{}) error {
	// Validation logic
	return nil
}
