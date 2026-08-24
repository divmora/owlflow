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
	"regexp"
	"strings"
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

	case "get_comments":
		issueKey, ok := params["issue_key"].(string)
		if !ok || issueKey == "" {
			return nil, fmt.Errorf("missing issue_key")
		}

		maxResults := 100
		if mr, ok := params["max_results"]; ok {
			switch v := mr.(type) {
			case int:
				maxResults = v
			case float64:
				maxResults = int(v)
			}
		}

		commentsURL := fmt.Sprintf("%s/rest/api/3/issue/%s/comment?maxResults=%d&orderBy=-created", baseURL, url.PathEscape(issueKey), maxResults)
		resp, err := j.makeRequest(client, "GET", commentsURL, username, token, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch comments: %w", err)
		}

		result, ok := resp.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("unexpected response format from jira comments endpoint")
		}

		rawComments, _ := result["comments"].([]interface{})
		parsedComments, authors, emails, accountIDs := parseJiraComments(rawComments)

		total := len(parsedComments)
		if t, ok := result["total"].(float64); ok {
			total = int(t)
		} else if t, ok := result["total"].(int); ok {
			total = t
		}

		return map[string]interface{}{
			"total":                  total,
			"comments":               parsedComments,
			"all_authors":            authors,
			"all_author_emails":      emails,
			"all_author_account_ids": accountIDs,
		}, nil

	case "check_user_comment":
		issueKey, ok := params["issue_key"].(string)
		if !ok || issueKey == "" {
			return nil, fmt.Errorf("missing issue_key")
		}

		targetUser, _ := params["user"].(string)
		if targetUser == "" {
			if tu, ok := params["target_user"].(string); ok {
				targetUser = tu
			}
		}
		targetAccountID, _ := params["account_id"].(string)
		targetEmail, _ := params["email"].(string)
		targetDisplayName, _ := params["display_name"].(string)
		targetUsername, _ := params["username_match"].(string)
		if targetUsername == "" {
			if un, ok := params["author_username"].(string); ok {
				targetUsername = un
			}
		}

		bodyContains, _ := params["body_contains"].(string)
		bodyRegex, _ := params["body_regex"].(string)

		maxResults := 100
		if mr, ok := params["max_results"]; ok {
			switch v := mr.(type) {
			case int:
				maxResults = v
			case float64:
				maxResults = int(v)
			}
		}

		commentsURL := fmt.Sprintf("%s/rest/api/3/issue/%s/comment?maxResults=%d&orderBy=-created", baseURL, url.PathEscape(issueKey), maxResults)
		resp, err := j.makeRequest(client, "GET", commentsURL, username, token, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch comments: %w", err)
		}

		result, ok := resp.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("unexpected response format from jira comments endpoint")
		}

		rawComments, _ := result["comments"].([]interface{})
		parsedComments, authors, emails, accountIDs := parseJiraComments(rawComments)

		var matchedComments []map[string]interface{}
		var compiledRegex *regexp.Regexp
		if bodyRegex != "" {
			var err error
			compiledRegex, err = regexp.Compile(bodyRegex)
			if err != nil {
				return nil, fmt.Errorf("invalid body_regex pattern: %w", err)
			}
		}

		for _, comment := range parsedComments {
			isAuthorMatch := false

			authorName := fmt.Sprintf("%v", comment["author_name"])
			authorEmail := fmt.Sprintf("%v", comment["author_email"])
			authorAccountID := fmt.Sprintf("%v", comment["author_account_id"])
			authorUsername := fmt.Sprintf("%v", comment["author_username"])

			if targetAccountID != "" && authorAccountID == targetAccountID {
				isAuthorMatch = true
			} else if targetEmail != "" && strings.EqualFold(authorEmail, targetEmail) {
				isAuthorMatch = true
			} else if targetDisplayName != "" && strings.EqualFold(authorName, targetDisplayName) {
				isAuthorMatch = true
			} else if targetUsername != "" && strings.EqualFold(authorUsername, targetUsername) {
				isAuthorMatch = true
			} else if targetUser != "" {
				if authorAccountID == targetUser ||
					strings.EqualFold(authorEmail, targetUser) ||
					strings.EqualFold(authorName, targetUser) ||
					strings.EqualFold(authorUsername, targetUser) {
					isAuthorMatch = true
				}
			} else if targetAccountID == "" && targetEmail == "" && targetDisplayName == "" && targetUsername == "" {
				// If no specific user filter is supplied, treat all comments as candidate for body match
				isAuthorMatch = true
			}

			if !isAuthorMatch {
				continue
			}

			bodyText := fmt.Sprintf("%v", comment["body_text"])

			if bodyContains != "" && !strings.Contains(strings.ToLower(bodyText), strings.ToLower(bodyContains)) {
				continue
			}

			if compiledRegex != nil && !compiledRegex.MatchString(bodyText) {
				continue
			}

			matchedComments = append(matchedComments, comment)
		}

		hasCommented := len(matchedComments) > 0
		var latestComment interface{}
		if hasCommented {
			latestComment = matchedComments[0]
		}

		return map[string]interface{}{
			"commented":              hasCommented,
			"found":                  hasCommented,
			"match_count":            len(matchedComments),
			"total_comments":         len(parsedComments),
			"matched_comments":       matchedComments,
			"latest_comment":         latestComment,
			"all_authors":            authors,
			"all_author_emails":      emails,
			"all_author_account_ids": accountIDs,
		}, nil

	default:
		return nil, fmt.Errorf("unsupported jira action: %s", action)
	}
}

func parseJiraComments(rawComments []interface{}) ([]map[string]interface{}, []string, []string, []string) {
	var parsed []map[string]interface{}
	authorMap := make(map[string]bool)
	emailMap := make(map[string]bool)
	accountIDMap := make(map[string]bool)

	var authors []string
	var emails []string
	var accountIDs []string

	for _, c := range rawComments {
		commentMap, ok := c.(map[string]interface{})
		if !ok {
			continue
		}

		id := fmt.Sprintf("%v", commentMap["id"])
		created := fmt.Sprintf("%v", commentMap["created"])
		updated := fmt.Sprintf("%v", commentMap["updated"])

		var authorName, authorEmail, authorAccountID, authorUsername string
		if author, ok := commentMap["author"].(map[string]interface{}); ok {
			if displayName, ok := author["displayName"].(string); ok {
				authorName = displayName
			}
			if email, ok := author["emailAddress"].(string); ok {
				authorEmail = email
			}
			if accountID, ok := author["accountId"].(string); ok {
				authorAccountID = accountID
			}
			if name, ok := author["name"].(string); ok {
				authorUsername = name
			} else if key, ok := author["key"].(string); ok {
				authorUsername = key
			}
		}

		if authorName != "" && !authorMap[authorName] {
			authorMap[authorName] = true
			authors = append(authors, authorName)
		}
		if authorEmail != "" && !emailMap[authorEmail] {
			emailMap[authorEmail] = true
			emails = append(emails, authorEmail)
		}
		if authorAccountID != "" && !accountIDMap[authorAccountID] {
			accountIDMap[authorAccountID] = true
			accountIDs = append(accountIDs, authorAccountID)
		}

		bodyText := extractCommentBodyText(commentMap["body"])

		parsed = append(parsed, map[string]interface{}{
			"id":                id,
			"created":           created,
			"updated":           updated,
			"author_name":       authorName,
			"author_email":      authorEmail,
			"author_account_id": authorAccountID,
			"author_username":   authorUsername,
			"body_text":         bodyText,
			"raw":               commentMap,
		})
	}

	return parsed, authors, emails, accountIDs
}

func extractCommentBodyText(body interface{}) string {
	if body == nil {
		return ""
	}
	switch v := body.(type) {
	case string:
		return v
	case map[string]interface{}:
		var sb strings.Builder
		extractADFText(v, &sb)
		res := strings.TrimSpace(sb.String())
		if res != "" {
			return res
		}
		b, _ := json.Marshal(v)
		return string(b)
	default:
		b, _ := json.Marshal(body)
		return string(b)
	}
}

func extractADFText(node map[string]interface{}, sb *strings.Builder) {
	if text, ok := node["text"].(string); ok {
		sb.WriteString(text)
		sb.WriteString(" ")
	}
	if content, ok := node["content"].([]interface{}); ok {
		for _, child := range content {
			if childMap, ok := child.(map[string]interface{}); ok {
				extractADFText(childMap, sb)
			}
		}
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
