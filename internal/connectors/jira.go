package connectors

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
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

		log.Printf("[JiraConnector] check_user_comment initiated: issue_key=%s, target_user=%q, email=%q, account_id=%q, display_name=%q, username=%q, body_contains=%q, body_regex=%q",
			issueKey, targetUser, targetEmail, targetAccountID, targetDisplayName, targetUsername, bodyContains, bodyRegex)

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
			log.Printf("[JiraConnector] check_user_comment error fetching comments from %s: %v", commentsURL, err)
			return nil, fmt.Errorf("failed to fetch comments: %w", err)
		}

		result, ok := resp.(map[string]interface{})
		if !ok {
			log.Printf("[JiraConnector] check_user_comment unexpected response payload format")
			return nil, fmt.Errorf("unexpected response format from jira comments endpoint")
		}

		rawComments, _ := result["comments"].([]interface{})
		parsedComments, authors, emails, accountIDs := parseJiraComments(rawComments)

		log.Printf("[JiraConnector] issue %s has %d total comment(s). Authors in Jira: %v | AccountIDs: %v | Emails: %v",
			issueKey, len(parsedComments), authors, accountIDs, emails)

		var matchedComments []map[string]interface{}
		var compiledRegex *regexp.Regexp
		if bodyRegex != "" {
			var err error
			compiledRegex, err = regexp.Compile(bodyRegex)
			if err != nil {
				log.Printf("[JiraConnector] invalid body_regex %q: %v", bodyRegex, err)
				return nil, fmt.Errorf("invalid body_regex pattern: %w", err)
			}
		}

		// Helper for extracting email username prefix (e.g. "fingrid-7efpyys0kh" from "fingrid-7efpyys0kh@serviceaccount.atlassian.com")
		extractPrefix := func(s string) string {
			if idx := strings.Index(s, "@"); idx > 0 {
				return s[:idx]
			}
			return s
		}

		for idx, comment := range parsedComments {
			isAuthorMatch := false
			matchReason := ""

			authorName := fmt.Sprintf("%v", comment["author_name"])
			authorEmail := fmt.Sprintf("%v", comment["author_email"])
			authorAccountID := fmt.Sprintf("%v", comment["author_account_id"])
			authorUsername := fmt.Sprintf("%v", comment["author_username"])
			commentID := fmt.Sprintf("%v", comment["id"])
			bodyPreview := fmt.Sprintf("%v", comment["body_text"])
			if len(bodyPreview) > 60 {
				bodyPreview = bodyPreview[:60] + "..."
			}

			if targetAccountID != "" && authorAccountID == targetAccountID {
				isAuthorMatch = true
				matchReason = fmt.Sprintf("exact accountId match (%s)", targetAccountID)
			} else if targetEmail != "" && authorEmail != "" && strings.EqualFold(authorEmail, targetEmail) {
				isAuthorMatch = true
				matchReason = fmt.Sprintf("exact email match (%s)", targetEmail)
			} else if targetDisplayName != "" && strings.EqualFold(authorName, targetDisplayName) {
				isAuthorMatch = true
				matchReason = fmt.Sprintf("exact displayName match (%s)", targetDisplayName)
			} else if targetUsername != "" && authorUsername != "" && strings.EqualFold(authorUsername, targetUsername) {
				isAuthorMatch = true
				matchReason = fmt.Sprintf("exact username match (%s)", targetUsername)
			} else if targetUser != "" {
				if authorAccountID != "" && authorAccountID == targetUser {
					isAuthorMatch = true
					matchReason = fmt.Sprintf("user matched accountId (%s)", targetUser)
				} else if authorEmail != "" && strings.EqualFold(authorEmail, targetUser) {
					isAuthorMatch = true
					matchReason = fmt.Sprintf("user matched email (%s)", targetUser)
				} else if authorName != "" && strings.EqualFold(authorName, targetUser) {
					isAuthorMatch = true
					matchReason = fmt.Sprintf("user matched displayName (%s)", targetUser)
				} else if authorUsername != "" && strings.EqualFold(authorUsername, targetUser) {
					isAuthorMatch = true
					matchReason = fmt.Sprintf("user matched username (%s)", targetUser)
				} else if strings.Contains(targetUser, "@") {
					// Fallback for Jira Cloud where emailAddress is masked/omitted for service accounts
					userPrefix := extractPrefix(targetUser)
					if userPrefix != "" && (strings.Contains(strings.ToLower(authorName), strings.ToLower(userPrefix)) ||
						strings.Contains(strings.ToLower(authorAccountID), strings.ToLower(userPrefix)) ||
						strings.Contains(strings.ToLower(authorUsername), strings.ToLower(userPrefix))) {
						isAuthorMatch = true
						matchReason = fmt.Sprintf("serviceaccount prefix fallback match (%s)", userPrefix)
					}
				}
			} else if targetEmail != "" && strings.Contains(targetEmail, "@") {
				// Fallback when email parameter was passed but Jira Cloud omitted emailAddress from author JSON
				emailPrefix := extractPrefix(targetEmail)
				if emailPrefix != "" && (strings.Contains(strings.ToLower(authorName), strings.ToLower(emailPrefix)) ||
					strings.Contains(strings.ToLower(authorAccountID), strings.ToLower(emailPrefix)) ||
					strings.Contains(strings.ToLower(authorUsername), strings.ToLower(emailPrefix))) {
					isAuthorMatch = true
					matchReason = fmt.Sprintf("email prefix fallback match (%s)", emailPrefix)
				}
			} else if targetAccountID == "" && targetEmail == "" && targetDisplayName == "" && targetUsername == "" {
				// If no specific user filter is supplied, treat all comments as candidate for body match
				isAuthorMatch = true
				matchReason = "no user filter specified (matching all authors)"
			}

			if !isAuthorMatch {
				log.Printf("[JiraConnector] comment #%d (ID: %s) did not match author criteria: authorName=%q, authorAccountID=%q, authorEmail=%q",
					idx+1, commentID, authorName, authorAccountID, authorEmail)
				continue
			}

			bodyText := fmt.Sprintf("%v", comment["body_text"])

			if bodyContains != "" && !strings.Contains(strings.ToLower(bodyText), strings.ToLower(bodyContains)) {
				log.Printf("[JiraConnector] comment #%d (ID: %s) matched author by %s, but failed body_contains filter %q",
					idx+1, commentID, matchReason, bodyContains)
				continue
			}

			if compiledRegex != nil && !compiledRegex.MatchString(bodyText) {
				log.Printf("[JiraConnector] comment #%d (ID: %s) matched author by %s, but failed body_regex filter %q",
					idx+1, commentID, matchReason, bodyRegex)
				continue
			}

			log.Printf("[JiraConnector] -> MATCH SUCCESS on comment #%d (ID: %s) by %s: authorName=%q, authorAccountID=%q, snippet=%q",
				idx+1, commentID, matchReason, authorName, authorAccountID, bodyPreview)

			matchedComments = append(matchedComments, comment)
		}

		hasCommented := len(matchedComments) > 0
		var latestComment interface{}
		if hasCommented {
			latestComment = matchedComments[0]
		}

		log.Printf("[JiraConnector] check_user_comment completed for issue %s: commented=%t, match_count=%d, total_comments=%d",
			issueKey, hasCommented, len(matchedComments), len(parsedComments))

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
