package connectors

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

type HTTPConnector struct{}

func (h *HTTPConnector) Execute(action string, params map[string]interface{}) (interface{}, error) {
	switch action {
	case "get":
		url := params["url"].(string)
		resp, err := http.Get(url)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		body, err := ioutil.ReadAll(resp.Body)
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
