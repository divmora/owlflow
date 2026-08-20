package connectors

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"strconv"
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
	}

	return nil, fmt.Errorf("unsupported gitlab action: %s", action)
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
