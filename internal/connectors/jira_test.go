package connectors

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJiraConnector_CheckUserComment(t *testing.T) {
	mockCommentsResponse := map[string]interface{}{
		"startAt":    0,
		"maxResults": 100,
		"total":      3,
		"comments": []interface{}{
			map[string]interface{}{
				"id":      "1001",
				"created": "2026-08-24T10:00:00.000+0000",
				"updated": "2026-08-24T10:00:00.000+0000",
				"author": map[string]interface{}{
					"accountId":    "acc-alice-123",
					"displayName":  "Alice Smith",
					"emailAddress": "alice@example.com",
					"name":         "asmith",
				},
				"body": "LGTM! Approved for staging release.",
			},
			map[string]interface{}{
				"id":      "1002",
				"created": "2026-08-24T11:00:00.000+0000",
				"updated": "2026-08-24T11:00:00.000+0000",
				"author": map[string]interface{}{
					"accountId":    "acc-bob-456",
					"displayName":  "Bob Jones",
					"emailAddress": "bob@example.com",
					"name":         "bjones",
				},
				"body": map[string]interface{}{
					"version": 1,
					"type":    "doc",
					"content": []interface{}{
						map[string]interface{}{
							"type": "paragraph",
							"content": []interface{}{
								map[string]interface{}{
									"type": "text",
									"text": "Please fix unit test before merge.",
								},
							},
						},
					},
				},
			},
			map[string]interface{}{
				"id":      "1003",
				"created": "2026-08-24T12:00:00.000+0000",
				"updated": "2026-08-24T12:00:00.000+0000",
				"author": map[string]interface{}{
					"accountId":    "acc-charlie-789",
					"displayName":  "Charlie Brown",
					"emailAddress": "charlie@example.com",
					"name":         "cbrown",
				},
				"body": "LGTM from QA side.",
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/rest/api/3/issue/PROJ-101/comment" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(mockCommentsResponse)
			return
		}
		if r.URL.Path == "/rest/api/3/issue/EMPTY-1/comment" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"startAt":    0,
				"maxResults": 100,
				"total":      0,
				"comments":   []interface{}{},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	connector := &JiraConnector{}

	tests := []struct {
		name              string
		params            map[string]interface{}
		expectedCommented bool
		expectedMatches   int
		expectedTotal     int
	}{
		{
			name: "Match Alice by accountId",
			params: map[string]interface{}{
				"issue_key":  "PROJ-101",
				"account_id": "acc-alice-123",
				"base_url":   server.URL,
			},
			expectedCommented: true,
			expectedMatches:   1,
			expectedTotal:     3,
		},
		{
			name: "Match Alice by email (case-insensitive)",
			params: map[string]interface{}{
				"issue_key": "PROJ-101",
				"email":     "ALICE@EXAMPLE.COM",
				"base_url":  server.URL,
			},
			expectedCommented: true,
			expectedMatches:   1,
			expectedTotal:     3,
		},
		{
			name: "Match Bob by displayName with ADF body extraction",
			params: map[string]interface{}{
				"issue_key":    "PROJ-101",
				"display_name": "Bob Jones",
				"base_url":     server.URL,
			},
			expectedCommented: true,
			expectedMatches:   1,
			expectedTotal:     3,
		},
		{
			name: "Match Charlie by general user parameter",
			params: map[string]interface{}{
				"issue_key": "PROJ-101",
				"user":      "charlie@example.com",
				"base_url":  server.URL,
			},
			expectedCommented: true,
			expectedMatches:   1,
			expectedTotal:     3,
		},
		{
			name: "Match Alice by general user with body_contains filter",
			params: map[string]interface{}{
				"issue_key":     "PROJ-101",
				"user":          "alice@example.com",
				"body_contains": "Approved",
				"base_url":      server.URL,
			},
			expectedCommented: true,
			expectedMatches:   1,
			expectedTotal:     3,
		},
		{
			name: "No match for Alice with non-matching body_contains filter",
			params: map[string]interface{}{
				"issue_key":     "PROJ-101",
				"user":          "alice@example.com",
				"body_contains": "Rejected",
				"base_url":      server.URL,
			},
			expectedCommented: false,
			expectedMatches:   0,
			expectedTotal:     3,
		},
		{
			name: "Match all comments matching body_regex (LGTM)",
			params: map[string]interface{}{
				"issue_key":  "PROJ-101",
				"body_regex": "(?i)LGTM",
				"base_url":   server.URL,
			},
			expectedCommented: true,
			expectedMatches:   2,
			expectedTotal:     3,
		},
		{
			name: "Unknown user does not match",
			params: map[string]interface{}{
				"issue_key": "PROJ-101",
				"user":      "unknown-user@company.com",
				"base_url":  server.URL,
			},
			expectedCommented: false,
			expectedMatches:   0,
			expectedTotal:     3,
		},
		{
			name: "Empty comments ticket returns commented=false",
			params: map[string]interface{}{
				"issue_key": "EMPTY-1",
				"user":      "alice@example.com",
				"base_url":  server.URL,
			},
			expectedCommented: false,
			expectedMatches:   0,
			expectedTotal:     0,
		},
		{
			name: "Match service account by email prefix when Jira omits emailAddress",
			params: map[string]interface{}{
				"issue_key": "PROJ-101",
				"email":     "alice-123@serviceaccount.atlassian.com",
				"base_url":  server.URL,
			},
			expectedCommented: true,
			expectedMatches:   1,
			expectedTotal:     3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := connector.Execute("check_user_comment", tt.params)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			resMap, ok := res.(map[string]interface{})
			if !ok {
				t.Fatalf("expected map[string]interface{}, got %T", res)
			}

			if got := resMap["commented"]; got != tt.expectedCommented {
				t.Errorf("commented = %v, want %v", got, tt.expectedCommented)
			}
			if got := resMap["match_count"]; got != tt.expectedMatches {
				t.Errorf("match_count = %v, want %v", got, tt.expectedMatches)
			}
			if got := resMap["total_comments"]; got != tt.expectedTotal {
				t.Errorf("total_comments = %v, want %v", got, tt.expectedTotal)
			}
		})
	}
}

func TestJiraConnector_GetComments(t *testing.T) {
	mockCommentsResponse := map[string]interface{}{
		"startAt":    0,
		"maxResults": 100,
		"total":      2,
		"comments": []interface{}{
			map[string]interface{}{
				"id":      "1001",
				"created": "2026-08-24T10:00:00.000+0000",
				"author": map[string]interface{}{
					"accountId":    "acc-1",
					"displayName":  "Alice",
					"emailAddress": "alice@example.com",
				},
				"body": "First comment",
			},
			map[string]interface{}{
				"id":      "1002",
				"created": "2026-08-24T11:00:00.000+0000",
				"author": map[string]interface{}{
					"accountId":    "acc-2",
					"displayName":  "Bob",
					"emailAddress": "bob@example.com",
				},
				"body": "Second comment",
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(mockCommentsResponse)
	}))
	defer server.Close()

	connector := &JiraConnector{}
	res, err := connector.Execute("get_comments", map[string]interface{}{
		"issue_key": "PROJ-101",
		"base_url":  server.URL,
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
