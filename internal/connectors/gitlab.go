package connectors

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
)

type GitLabConnector struct{}

func (g *GitLabConnector) Execute(action string, params map[string]interface{}) (interface{}, error) {
	token := os.Getenv("GITLAB_TOKEN")
	if token == "" {
		// fallback to param if not in env, though env is safer
		if t, ok := params["token"].(string); ok {
			token = t
		}
	}

	baseURL := "https://gitlab.com/api/v4"
	if url, ok := params["base_url"].(string); ok {
		baseURL = url
	}

	client := &http.Client{}

	switch action {
	case "get_project":
		projectID := params["project_id"]
		return g.makeRequest(client, "GET", fmt.Sprintf("%s/projects/%v", baseURL, projectID), token, nil)

	case "create_merge_request":
		projectID := params["project_id"]
		sourceBranch := params["source_branch"].(string)
		targetBranch := params["target_branch"].(string)
		title := params["title"].(string)

		payload := map[string]interface{}{
			"source_branch": sourceBranch,
			"target_branch": targetBranch,
			"title":         title,
		}
		return g.makeRequest(client, "POST", fmt.Sprintf("%s/projects/%v/merge_requests", baseURL, projectID), token, payload)

	case "get_user":
		username := params["username"].(string)
		resp, err := g.makeRequest(client, "GET", fmt.Sprintf("%s/users?username=%s", baseURL, username), token, nil)
		if err != nil {
			return nil, err
		}

		// get_user returns a list, we need the first item
		if list, ok := resp.([]interface{}); ok {
			if len(list) == 0 {
				return nil, fmt.Errorf("user not found: %s", username)
			}
			return list[0], nil
		}
		return nil, fmt.Errorf("unexpected response format from get_user")

	case "update_merge_request":
		projectID := params["project_id"]
		mrIID := params["merge_request_iid"]

		payload := map[string]interface{}{}
		if reviewerIDs, ok := params["reviewer_ids"].([]interface{}); ok {
			payload["reviewer_ids"] = reviewerIDs
		}
		return g.makeRequest(client, "PUT", fmt.Sprintf("%s/projects/%v/merge_requests/%v", baseURL, projectID, mrIID), token, payload)

	case "add_reviewer":
		projectID := params["project_id"]
		mrIID := params["merge_request_iid"]
		userID, err := toInt(params["user_id"])
		if err != nil {
			return nil, fmt.Errorf("invalid user_id: %w", err)
		}

		existingReviewers := []int{}
		alreadyReviewer := false
		shouldFetch := true

		// Check if current_reviewer_ids is provided (optimization)
		if idsParam, ok := params["current_reviewer_ids"]; ok {
			var idsList []interface{}
			if s, ok := idsParam.(string); ok {
				var list []interface{}
				if err := json.Unmarshal([]byte(s), &list); err == nil {
					idsList = list
				}
			} else if list, ok := idsParam.([]interface{}); ok {
				idsList = list
			}

			if idsList != nil {
				shouldFetch = false
				for _, r := range idsList {
					if id, err := toInt(r); err == nil {
						existingReviewers = append(existingReviewers, id)
						if id == userID {
							alreadyReviewer = true
						}
					}
				}
			}
		}

		// Check if current_reviewers is provided (optimization, fallback)
		if shouldFetch {
			if currentReviewersParam, ok := params["current_reviewers"]; ok {
				// It might be a string (JSON) or already parsed list
				var reviewersList []interface{}
				if s, ok := currentReviewersParam.(string); ok {
					var list []interface{}
					if err := json.Unmarshal([]byte(s), &list); err == nil {
						reviewersList = list
					}
				} else if list, ok := currentReviewersParam.([]interface{}); ok {
					reviewersList = list
				}

				if reviewersList != nil {
					shouldFetch = false
					for _, r := range reviewersList {
						if reviewer, ok := r.(map[string]interface{}); ok {
							if id, ok := reviewer["id"].(float64); ok {
								idInt := int(id)
								existingReviewers = append(existingReviewers, idInt)
								if idInt == userID {
									alreadyReviewer = true
								}
							}
						}
					}
				}
			}
		}

		if shouldFetch {
			// 1. Get current MR
			mrResp, err := g.makeRequest(client, "GET", fmt.Sprintf("%s/projects/%v/merge_requests/%v", baseURL, projectID, mrIID), token, nil)
			if err != nil {
				return nil, err
			}

			mr, ok := mrResp.(map[string]interface{})
			if !ok {
				return nil, fmt.Errorf("unexpected response format fetching mr")
			}

			if reviewers, ok := mr["reviewers"].([]interface{}); ok {
				for _, r := range reviewers {
					if reviewer, ok := r.(map[string]interface{}); ok {
						if id, ok := reviewer["id"].(float64); ok {
							idInt := int(id)
							existingReviewers = append(existingReviewers, idInt)
							if idInt == userID {
								alreadyReviewer = true
							}
						}
					}
				}
			}
		}

		if alreadyReviewer {
			return map[string]interface{}{"status": "already_reviewer"}, nil
		}

		// 3. Append new user
		existingReviewers = append(existingReviewers, userID)

		// 4. Update MR
		payload := map[string]interface{}{
			"reviewer_ids": existingReviewers,
		}
		return g.makeRequest(client, "PUT", fmt.Sprintf("%s/projects/%v/merge_requests/%v", baseURL, projectID, mrIID), token, payload)

	case "close_mr":
		projectID := params["project_id"]
		mrIID := params["merge_request_iid"]

		payload := map[string]interface{}{
			"state_event": "close",
		}
		return g.makeRequest(client, "PUT", fmt.Sprintf("%s/projects/%v/merge_requests/%v", baseURL, projectID, mrIID), token, payload)

	case "add_mr_note":
		projectID := params["project_id"]
		mrIID := params["merge_request_iid"]
		body := params["body"].(string)

		payload := map[string]interface{}{
			"body": body,
		}
		return g.makeRequest(client, "POST", fmt.Sprintf("%s/projects/%v/merge_requests/%v/notes", baseURL, projectID, mrIID), token, payload)
	case "approve_mr":
		projectID := params["project_id"]
		mrIID := params["merge_request_iid"]

		// Check if already approved if user_id is provided
		if userID, err := toInt(params["user_id"]); err == nil {
			approvalsResp, err := g.makeRequest(client, "GET", fmt.Sprintf("%s/projects/%v/merge_requests/%v/approvals", baseURL, projectID, mrIID), token, nil)
			if err == nil {
				if approvals, ok := approvalsResp.(map[string]interface{}); ok {
					if approvedBy, ok := approvals["approved_by"].([]interface{}); ok {
						for _, a := range approvedBy {
							if entry, ok := a.(map[string]interface{}); ok {
								if user, ok := entry["user"].(map[string]interface{}); ok {
									if id, ok := user["id"].(float64); ok {
										if int(id) == userID {
											return map[string]interface{}{"status": "already_approved"}, nil
										}
									}
								}
							}
						}
					}
				}
			}
		}

		return g.makeRequest(client, "POST", fmt.Sprintf("%s/projects/%v/merge_requests/%v/approve", baseURL, projectID, mrIID), token, nil)

	case "get_mr_commits":
		projectID, ok := params["project_id"]
		if !ok || projectID == nil {
			return nil, fmt.Errorf("missing project_id")
		}

		mrIID, ok := params["merge_request_iid"]
		if !ok || mrIID == nil {
			return nil, fmt.Errorf("missing merge_request_iid")
		}

		perPage := 100
		if pp, ok := params["per_page"]; ok {
			if v, err := toInt(pp); err == nil && v > 0 {
				perPage = v
			}
		}

		commitsURL := fmt.Sprintf("%s/projects/%v/merge_requests/%v/commits?per_page=%d", baseURL, url.PathEscape(fmt.Sprintf("%v", projectID)), mrIID, perPage)
		resp, err := g.makeRequest(client, "GET", commitsURL, token, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch MR commits: %w", err)
		}

		rawCommits, ok := resp.([]interface{})
		if !ok {
			return nil, fmt.Errorf("unexpected response format from gitlab MR commits endpoint")
		}

		parsedCommits, authors, authorEmails, committers, committerEmails := parseGitLabCommits(rawCommits)

		return map[string]interface{}{
			"total":                len(parsedCommits),
			"commits":              parsedCommits,
			"all_authors":          authors,
			"all_author_emails":    authorEmails,
			"all_committers":       committers,
			"all_committer_emails": committerEmails,
		}, nil

	case "check_mr_commit_author":
		projectID, ok := params["project_id"]
		if !ok || projectID == nil {
			return nil, fmt.Errorf("missing project_id")
		}

		mrIID, ok := params["merge_request_iid"]
		if !ok || mrIID == nil {
			return nil, fmt.Errorf("missing merge_request_iid")
		}

		targetUser, _ := params["user"].(string)
		if targetUser == "" {
			if tu, ok := params["target_user"].(string); ok {
				targetUser = tu
			}
		}
		targetEmail, _ := params["email"].(string)
		if targetEmail == "" {
			if te, ok := params["author_email"].(string); ok {
				targetEmail = te
			}
		}
		targetAuthorName, _ := params["author_name"].(string)
		if targetAuthorName == "" {
			if tan, ok := params["name"].(string); ok {
				targetAuthorName = tan
			}
		}
		targetCommitterEmail, _ := params["committer_email"].(string)

		messageContains, _ := params["message_contains"].(string)
		messageRegex, _ := params["message_regex"].(string)

		log.Printf("[GitLabConnector] check_mr_commit_author initiated: project_id=%v, mr_iid=%v, target_user=%q, email=%q, author_name=%q, committer_email=%q, message_contains=%q, message_regex=%q",
			projectID, mrIID, targetUser, targetEmail, targetAuthorName, targetCommitterEmail, messageContains, messageRegex)

		perPage := 100
		if pp, ok := params["per_page"]; ok {
			if v, err := toInt(pp); err == nil && v > 0 {
				perPage = v
			}
		}

		commitsURL := fmt.Sprintf("%s/projects/%v/merge_requests/%v/commits?per_page=%d", baseURL, url.PathEscape(fmt.Sprintf("%v", projectID)), mrIID, perPage)
		resp, err := g.makeRequest(client, "GET", commitsURL, token, nil)
		if err != nil {
			log.Printf("[GitLabConnector] check_mr_commit_author error fetching commits from %s: %v", commitsURL, err)
			return nil, fmt.Errorf("failed to fetch MR commits: %w", err)
		}

		rawCommits, ok := resp.([]interface{})
		if !ok {
			log.Printf("[GitLabConnector] check_mr_commit_author unexpected response format")
			return nil, fmt.Errorf("unexpected response format from gitlab MR commits endpoint")
		}

		parsedCommits, authors, authorEmails, committers, committerEmails := parseGitLabCommits(rawCommits)

		log.Printf("[GitLabConnector] project %v MR %v has %d total commit(s). Authors: %v | AuthorEmails: %v | Committers: %v",
			projectID, mrIID, len(parsedCommits), authors, authorEmails, committers)

		var matchedCommits []map[string]interface{}
		var compiledRegex *regexp.Regexp
		if messageRegex != "" {
			var err error
			compiledRegex, err = regexp.Compile(messageRegex)
			if err != nil {
				log.Printf("[GitLabConnector] invalid message_regex pattern %q: %v", messageRegex, err)
				return nil, fmt.Errorf("invalid message_regex pattern: %w", err)
			}
		}

		extractPrefix := func(s string) string {
			if idx := strings.Index(s, "@"); idx > 0 {
				return s[:idx]
			}
			return s
		}

		for idx, commit := range parsedCommits {
			isAuthorMatch := false
			matchReason := ""

			cAuthorName := fmt.Sprintf("%v", commit["author_name"])
			cAuthorEmail := fmt.Sprintf("%v", commit["author_email"])
			cCommitterName := fmt.Sprintf("%v", commit["committer_name"])
			cCommitterEmail := fmt.Sprintf("%v", commit["committer_email"])
			cID := fmt.Sprintf("%v", commit["short_id"])
			cTitle := fmt.Sprintf("%v", commit["title"])

			if targetEmail != "" && (strings.EqualFold(cAuthorEmail, targetEmail) || strings.EqualFold(cCommitterEmail, targetEmail)) {
				isAuthorMatch = true
				matchReason = fmt.Sprintf("exact email match (%s)", targetEmail)
			} else if targetAuthorName != "" && (strings.EqualFold(cAuthorName, targetAuthorName) || strings.EqualFold(cCommitterName, targetAuthorName)) {
				isAuthorMatch = true
				matchReason = fmt.Sprintf("exact author name match (%s)", targetAuthorName)
			} else if targetCommitterEmail != "" && strings.EqualFold(cCommitterEmail, targetCommitterEmail) {
				isAuthorMatch = true
				matchReason = fmt.Sprintf("exact committer email match (%s)", targetCommitterEmail)
			} else if targetUser != "" {
				if strings.EqualFold(cAuthorEmail, targetUser) || strings.EqualFold(cCommitterEmail, targetUser) {
					isAuthorMatch = true
					matchReason = fmt.Sprintf("user matched email (%s)", targetUser)
				} else if strings.EqualFold(cAuthorName, targetUser) || strings.EqualFold(cCommitterName, targetUser) {
					isAuthorMatch = true
					matchReason = fmt.Sprintf("user matched name (%s)", targetUser)
				} else if strings.Contains(targetUser, "@") {
					prefix := extractPrefix(targetUser)
					if prefix != "" && (strings.Contains(strings.ToLower(cAuthorName), strings.ToLower(prefix)) ||
						strings.Contains(strings.ToLower(cAuthorEmail), strings.ToLower(prefix)) ||
						strings.Contains(strings.ToLower(cCommitterName), strings.ToLower(prefix))) {
						isAuthorMatch = true
						matchReason = fmt.Sprintf("email prefix match (%s)", prefix)
					}
				}
			} else if targetEmail == "" && targetAuthorName == "" && targetCommitterEmail == "" && targetUser == "" {
				// No author filter specified -> matches all commits (for message inspection)
				isAuthorMatch = true
				matchReason = "no author filter specified"
			}

			if !isAuthorMatch {
				log.Printf("[GitLabConnector] commit #%d (%s) did not match author: author=%q <%s>, committer=%q <%s>",
					idx+1, cID, cAuthorName, cAuthorEmail, cCommitterName, cCommitterEmail)
				continue
			}

			msg := fmt.Sprintf("%v", commit["message"])
			if messageContains != "" && !strings.Contains(strings.ToLower(msg), strings.ToLower(messageContains)) {
				log.Printf("[GitLabConnector] commit #%d (%s) matched author (%s), but failed message_contains %q",
					idx+1, cID, matchReason, messageContains)
				continue
			}

			if compiledRegex != nil && !compiledRegex.MatchString(msg) {
				log.Printf("[GitLabConnector] commit #%d (%s) matched author (%s), but failed message_regex %q",
					idx+1, cID, matchReason, messageRegex)
				continue
			}

			log.Printf("[GitLabConnector] -> MATCH SUCCESS on commit #%d (%s) by %s: author=%q <%s>, title=%q",
				idx+1, cID, matchReason, cAuthorName, cAuthorEmail, cTitle)

			matchedCommits = append(matchedCommits, commit)
		}

		isAuthor := len(matchedCommits) > 0
		var latestCommit interface{}
		if isAuthor {
			latestCommit = matchedCommits[0]
		}

		log.Printf("[GitLabConnector] check_mr_commit_author completed: is_author=%t, match_count=%d, total_commits=%d",
			isAuthor, len(matchedCommits), len(parsedCommits))

		return map[string]interface{}{
			"is_author":            isAuthor,
			"found":                isAuthor,
			"match_count":          len(matchedCommits),
			"total_commits":        len(parsedCommits),
			"matched_commits":      matchedCommits,
			"latest_commit":        latestCommit,
			"all_authors":          authors,
			"all_author_emails":    authorEmails,
			"all_committers":       committers,
			"all_committer_emails": committerEmails,
		}, nil
	}

	return nil, fmt.Errorf("unsupported gitlab action: %s", action)
}

func parseGitLabCommits(rawCommits []interface{}) ([]map[string]interface{}, []string, []string, []string, []string) {
	var parsed []map[string]interface{}
	authorMap := make(map[string]bool)
	authorEmailMap := make(map[string]bool)
	committerMap := make(map[string]bool)
	committerEmailMap := make(map[string]bool)

	var authors []string
	var authorEmails []string
	var committers []string
	var committerEmails []string

	for _, c := range rawCommits {
		cMap, ok := c.(map[string]interface{})
		if !ok {
			continue
		}

		id := fmt.Sprintf("%v", cMap["id"])
		shortID := fmt.Sprintf("%v", cMap["short_id"])
		title := fmt.Sprintf("%v", cMap["title"])
		authorName := fmt.Sprintf("%v", cMap["author_name"])
		authorEmail := fmt.Sprintf("%v", cMap["author_email"])
		authoredDate := fmt.Sprintf("%v", cMap["authored_date"])
		committerName := fmt.Sprintf("%v", cMap["committer_name"])
		committerEmail := fmt.Sprintf("%v", cMap["committer_email"])
		committedDate := fmt.Sprintf("%v", cMap["committed_date"])
		message := fmt.Sprintf("%v", cMap["message"])

		if authorName != "" && !authorMap[authorName] {
			authorMap[authorName] = true
			authors = append(authors, authorName)
		}
		if authorEmail != "" && !authorEmailMap[authorEmail] {
			authorEmailMap[authorEmail] = true
			authorEmails = append(authorEmails, authorEmail)
		}
		if committerName != "" && !committerMap[committerName] {
			committerMap[committerName] = true
			committers = append(committers, committerName)
		}
		if committerEmail != "" && !committerEmailMap[committerEmail] {
			committerEmailMap[committerEmail] = true
			committerEmails = append(committerEmails, committerEmail)
		}

		parsed = append(parsed, map[string]interface{}{
			"id":               id,
			"short_id":         shortID,
			"title":            title,
			"author_name":      authorName,
			"author_email":     authorEmail,
			"authored_date":    authoredDate,
			"committer_name":   committerName,
			"committer_email":  committerEmail,
			"committed_date":   committedDate,
			"message":          message,
			"raw":              cMap,
		})
	}

	return parsed, authors, authorEmails, committers, committerEmails
}

func toInt(v interface{}) (int, error) {
	switch val := v.(type) {
	case int:
		return val, nil
	case int64:
		return int(val), nil
	case float64:
		return int(val), nil
	case string:
		return strconv.Atoi(val)
	default:
		return 0, fmt.Errorf("cannot convert %T to int", v)
	}
}

func (g *GitLabConnector) makeRequest(client *http.Client, method, url, token string, payload interface{}) (interface{}, error) {
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

	if token != "" {
		req.Header.Set("PRIVATE-TOKEN", token)
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
		return nil, fmt.Errorf("gitlab api error (%d): %s", resp.StatusCode, string(respBody))
	}

	var result interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func (g *GitLabConnector) Validate(params map[string]interface{}) error {
	if _, ok := params["project_id"]; !ok {
		return fmt.Errorf("missing project_id")
	}
	return nil
}
