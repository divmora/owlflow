package connectors

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
)

type JiraConnector struct{}

func (j *JiraConnector) Execute(action string, params map[string]interface{}) (interface{}, error) {
	username := os.Getenv("JIRA_USER")
	token := os.Getenv("JIRA_TOKEN")
	baseURL := os.Getenv("JIRA_BASE_URL")

	if username == "" {
		if u, ok := params["username"].(string); ok {
			username = u
		}
	}
	if token == "" {
		if t, ok := params["token"].(string); ok {
			token = t
		}
	}
	if baseURL == "" {
		if b, ok := params["base_url"].(string); ok {
			baseURL = b
		}
	}

	client := &http.Client{}

	switch action {
	case "transition_issue":
		issueKey, ok := params["issue_key"].(string)
		if !ok {
			return nil, fmt.Errorf("missing issue_key")
		}

		// Optional: check current status first
		if fromStatusID, ok := params["from_status_id"]; ok {
			issueResp, err := j.makeRequest(client, "GET", fmt.Sprintf("%s/rest/api/3/issue/%s", baseURL, issueKey), username, token, nil)
			if err != nil {
				return nil, fmt.Errorf("failed to fetch issue for status check: %w", err)
			}

			issue, ok := issueResp.(map[string]interface{})
			if !ok {
				return nil, fmt.Errorf("unexpected response format from jira issue fetch")
			}

			fields, ok := issue["fields"].(map[string]interface{})
			if !ok {
				return nil, fmt.Errorf("missing fields in jira issue response")
			}

			status, ok := fields["status"].(map[string]interface{})
			if !ok {
				return nil, fmt.Errorf("missing status in jira issue fields")
			}

			currentStatusID := status["id"]
			if fmt.Sprintf("%v", currentStatusID) != fmt.Sprintf("%v", fromStatusID) {
				return map[string]interface{}{
					"status": "skipped",
					"reason": fmt.Sprintf("current status %v does not match from_status_id %v", currentStatusID, fromStatusID),
				}, nil
			}
		}

		transitionID := params["transition_id"]

		payload := map[string]interface{}{
			"transition": map[string]interface{}{
				"id": transitionID,
			},
		}

		return j.makeRequest(client, "POST", fmt.Sprintf("%s/rest/api/3/issue/%s/transitions", baseURL, issueKey), username, token, payload)

	case "search_issues":
		jql, ok := params["jql"].(string)
		if !ok {
			return nil, fmt.Errorf("missing jql")
		}

		searchURL := fmt.Sprintf("%s/rest/api/3/search/jql?jql=%s&maxResults=100", baseURL, url.QueryEscape(jql))
		resp, err := j.makeRequest(client, "GET", searchURL, username, token, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to search issues: %w", err)
		}

		result, ok := resp.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("unexpected response format from jira search")
		}

		issues, _ := result["issues"].([]interface{})
		count := len(issues)

		return map[string]interface{}{
			"total": count,
			"found": count > 0,
		}, nil

	default:
		return nil, fmt.Errorf("unsupported jira action: %s", action)
	}
}

func (j *JiraConnector) makeRequest(client *http.Client, method, url, username, token string, payload interface{}) (interface{}, error) {
	var body []byte
	var err error

	if payload != nil {
		body, err = json.Marshal(payload)
		if err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequest(method, url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}

	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	if username != "" && token != "" {
		auth := base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", username, token)))
		req.Header.Set("Authorization", fmt.Sprintf("Basic %s", auth))
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("jira api error (%d): %s", resp.StatusCode, string(respBody))
	}

	// Transitions API often returns 204 No Content
	if len(respBody) == 0 {
		return map[string]interface{}{"status": "success"}, nil
	}

	var result interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func (j *JiraConnector) Validate(params map[string]interface{}) error {
	return nil
}
