package connectors

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGitLabConnector_CheckMRCommitAuthor(t *testing.T) {
	mockCommits := []interface{}{
		map[string]interface{}{
			"id":              "c111111111111111111111111111111111111111",
			"short_id":        "c1111111",
			"title":           "Feat: add oauth service account authentication",
			"author_name":     "Alice Developer",
			"author_email":    "alice@company.com",
			"authored_date":   "2026-08-24T10:00:00.000Z",
			"committer_name":  "Alice Developer",
			"committer_email": "alice@company.com",
			"committed_date":  "2026-08-24T10:00:00.000Z",
			"message":         "Feat: add oauth service account authentication\n\nResolves #101",
		},
		map[string]interface{}{
			"id":              "c222222222222222222222222222222222222222",
			"short_id":        "c2222222",
			"title":           "Fix: resolve race condition in dag runner",
			"author_name":     "Bob Contributor",
			"author_email":    "bob@company.com",
			"authored_date":   "2026-08-24T11:00:00.000Z",
			"committer_name":  "Bob Contributor",
			"committer_email": "bob@company.com",
			"committed_date":  "2026-08-24T11:00:00.000Z",
			"message":         "Fix: resolve race condition in dag runner",
		},
		map[string]interface{}{
			"id":              "c333333333333333333333333333333333333333",
			"short_id":        "c3333333",
			"title":           "Chore: automated dependency update by bot",
			"author_name":     "bot-service-account",
			"author_email":    "bot-service-account@service.gitlab.internal",
			"authored_date":   "2026-08-24T12:00:00.000Z",
			"committer_name":  "bot-service-account",
			"committer_email": "bot-service-account@service.gitlab.internal",
			"committed_date":  "2026-08-24T12:00:00.000Z",
			"message":         "[BOT] automated dependencies update",
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/projects/123/merge_requests/42/commits" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(mockCommits)
			return
		}
		if r.URL.Path == "/projects/123/merge_requests/999/commits" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode([]interface{}{})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	connector := &GitLabConnector{}

	tests := []struct {
		name             string
		params           map[string]interface{}
		expectedIsAuthor bool
		expectedMatches  int
		expectedTotal    int
	}{
		{
			name: "Match Alice by email (case-insensitive)",
			params: map[string]interface{}{
				"project_id":         123,
				"merge_request_iid":  42,
				"email":              "ALICE@COMPANY.COM",
				"base_url":           server.URL,
			},
			expectedIsAuthor: true,
			expectedMatches:  1,
			expectedTotal:    3,
		},
		{
			name: "Match Bob by author_name",
			params: map[string]interface{}{
				"project_id":         123,
				"merge_request_iid":  42,
				"author_name":        "Bob Contributor",
				"base_url":           server.URL,
			},
			expectedIsAuthor: true,
			expectedMatches:  1,
			expectedTotal:    3,
		},
		{
			name: "Match service bot by general user parameter",
			params: map[string]interface{}{
				"project_id":         123,
				"merge_request_iid":  42,
				"user":               "bot-service-account",
				"base_url":           server.URL,
			},
			expectedIsAuthor: true,
			expectedMatches:  1,
			expectedTotal:    3,
		},
		{
			name: "Match Alice with message_contains filter",
			params: map[string]interface{}{
				"project_id":         123,
				"merge_request_iid":  42,
				"user":               "alice@company.com",
				"message_contains":   "Resolves #101",
				"base_url":           server.URL,
			},
			expectedIsAuthor: true,
			expectedMatches:  1,
			expectedTotal:    3,
		},
		{
			name: "No match for Alice when message_contains does not match",
			params: map[string]interface{}{
				"project_id":         123,
				"merge_request_iid":  42,
				"user":               "alice@company.com",
				"message_contains":   "non-existent tag",
				"base_url":           server.URL,
			},
			expectedIsAuthor: false,
			expectedMatches:  0,
			expectedTotal:    3,
		},
		{
			name: "Match all commits with message_regex",
			params: map[string]interface{}{
				"project_id":         123,
				"merge_request_iid":  42,
				"message_regex":      "(?i)^(feat|fix):",
				"base_url":           server.URL,
			},
			expectedIsAuthor: true,
			expectedMatches:  2,
			expectedTotal:    3,
		},
		{
			name: "Unknown user does not match",
			params: map[string]interface{}{
				"project_id":         123,
				"merge_request_iid":  42,
				"user":               "unknown@company.com",
				"base_url":           server.URL,
			},
			expectedIsAuthor: false,
			expectedMatches:  0,
			expectedTotal:    3,
		},
		{
			name: "Empty commits MR returns is_author=false",
			params: map[string]interface{}{
				"project_id":         123,
				"merge_request_iid":  999,
				"user":               "alice@company.com",
				"base_url":           server.URL,
			},
			expectedIsAuthor: false,
			expectedMatches:  0,
			expectedTotal:    0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := connector.Execute("check_mr_commit_author", tt.params)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			resMap, ok := res.(map[string]interface{})
			if !ok {
				t.Fatalf("expected map[string]interface{}, got %T", res)
			}

			if got := resMap["is_author"]; got != tt.expectedIsAuthor {
				t.Errorf("is_author = %v, want %v", got, tt.expectedIsAuthor)
			}
			if got := resMap["match_count"]; got != tt.expectedMatches {
				t.Errorf("match_count = %v, want %v", got, tt.expectedMatches)
			}
			if got := resMap["total_commits"]; got != tt.expectedTotal {
				t.Errorf("total_commits = %v, want %v", got, tt.expectedTotal)
			}
		})
	}
}

func TestGitLabConnector_GetMRCommits(t *testing.T) {
	mockCommits := []interface{}{
		map[string]interface{}{
			"id":           "abc12345",
			"short_id":     "abc1234",
			"title":        "Commit 1",
			"author_name":  "Alice",
			"author_email": "alice@company.com",
		},
		map[string]interface{}{
			"id":           "def67890",
			"short_id":     "def6789",
			"title":        "Commit 2",
			"author_name":  "Bob",
			"author_email": "bob@company.com",
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(mockCommits)
	}))
	defer server.Close()

	connector := &GitLabConnector{}
	res, err := connector.Execute("get_mr_commits", map[string]interface{}{
		"project_id":        "my-group/my-project",
		"merge_request_iid": 12,
		"base_url":          server.URL,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resMap, ok := res.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map[string]interface{}, got %T", res)
	}

	if got := resMap["total"]; got != 2 {
		t.Errorf("total = %v, want 2", got)
	}

	authors, ok := resMap["all_authors"].([]string)
	if !ok || len(authors) != 2 {
		t.Errorf("expected 2 authors, got %v", authors)
	}
}
