package core

import (
	"testing"
)

func TestEvaluateCondition(t *testing.T) {
	ctx := ExecutionContext{
		TriggerData: map[string]interface{}{
			"payload": map[string]interface{}{
				"repo":   "divmora/owlflow",
				"branch": "feat/new-ui",
				"action": "opened",
				"count":  5,
				"object_attributes": map[string]interface{}{
					"source_branch": "feature/login-fix",
					"target_branch": "main",
				},
				"project": map[string]interface{}{
					"default_branch": "main",
				},
			},
		},
		StepsData: map[string]interface{}{
			"check_commit": map[string]interface{}{
				"output": map[string]interface{}{
					"status_code": 200,
					"name":        "owlflow-step",
				},
			},
			"error_step": map[string]interface{}{
				"output": map[string]interface{}{
					"status_code": 500,
					"name":        "",
				},
			},
		},
		Vars: map[string]interface{}{
			"env":       "production",
			"is_active": true,
		},
	}

	tests := []struct {
		name      string
		condition string
		expected  bool
	}{
		{
			name:      "Empty condition evaluates to true",
			condition: "",
			expected:  true,
		},
		{
			name:      "Equality check",
			condition: `{{ .steps.check_commit.output.status_code }} == 200`,
			expected:  true,
		},
		{
			name:      "Inequality check",
			condition: `{{ .steps.check_commit.output.status_code }} != 500`,
			expected:  true,
		},
		{
			name:      "hasPrefix true",
			condition: `hasPrefix {{ .trigger.payload.branch }} "feat/"`,
			expected:  true,
		},
		{
			name:      "hasPrefix false",
			condition: `hasPrefix {{ .trigger.payload.branch }} "fix/"`,
			expected:  false,
		},
		{
			name:      "!hasPrefix true when not matching",
			condition: `!hasPrefix {{ .trigger.payload.branch }} "fix/"`,
			expected:  true,
		},
		{
			name:      "!hasPrefix false when matching",
			condition: `!hasPrefix {{ .trigger.payload.branch }} "feat/"`,
			expected:  false,
		},
		{
			name:      "User MR branch validation condition - valid branch",
			condition: `{{ .trigger.payload.object_attributes.target_branch }} == {{ .trigger.payload.project.default_branch }} && !hasPrefix {{ .trigger.payload.object_attributes.source_branch }} "ai/" && {{ .trigger.payload.object_attributes.source_branch }} != "pre-prod" && {{ .trigger.payload.object_attributes.source_branch }} != "staging"`,
			expected:  true,
		},
		{
			name:      "Relational operators",
			condition: `{{ .trigger.payload.count }} >= 5 && {{ .trigger.payload.count }} < 10`,
			expected:  true,
		},
		{
			name:      "Logical OR",
			condition: `{{ .steps.check_commit.output.status_code }} == 500 || {{ .vars.env }} == "production"`,
			expected:  true,
		},
		{
			name:      "regexMatch with JS-style literal and case-insensitive flag",
			condition: `regexMatch "CR/pre-prod-123" "/^cr\\/pre-prod-\\d+$/i"`,
			expected:  true,
		},
		{
			name:      "regexMatch with RE2 flag",
			condition: `regexMatch "cr/pre-prod-456" "(?i)^cr/pre-prod-\\d+$"`,
			expected:  true,
		},
		{
			name:      "regexMatch non-matching branch",
			condition: `regexMatch "feature/my-feat" "/^cr\\/pre-prod-\\d+$/i"`,
			expected:  false,
		},
		{
			name:      "!regexMatch on non-matching branch",
			condition: `!regexMatch "feature/my-feat" "/^cr\\/pre-prod-\\d+$/i"`,
			expected:  true,
		},
		{
			name:      "!regexMatch on matching branch",
			condition: `!regexMatch "cr/pre-prod-12" "/^cr\\/pre-prod-\\d+$/i"`,
			expected:  false,
		},
		{
			name:      "matches alias functional syntax",
			condition: `matches("CR/PRE-PROD-99", "/^cr\\/pre-prod-\\d+$/i")`,
			expected:  true,
		},
		{
			name:      "!matches with template variables and chained boolean",
			condition: `{{ .trigger.payload.object_attributes.target_branch }} == "main" && !matches {{ .trigger.payload.object_attributes.source_branch }} "/^cr\\/pre-prod-\\d+$/i"`,
			expected:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := evaluateCondition(tt.condition, ctx)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.expected {
				t.Errorf("evaluateCondition(%q) = %v, want %v", tt.condition, got, tt.expected)
			}
		})
	}
}

func TestEvaluateCondition_InvalidBranches(t *testing.T) {
	// Test when source_branch starts with ai/
	ctxAI := ExecutionContext{
		TriggerData: map[string]interface{}{
			"payload": map[string]interface{}{
				"object_attributes": map[string]interface{}{
					"source_branch": "ai/auto-gen",
					"target_branch": "main",
				},
				"project": map[string]interface{}{
					"default_branch": "main",
				},
			},
		},
	}

	userCondition := `{{ .trigger.payload.object_attributes.target_branch }} == {{ .trigger.payload.project.default_branch }} && !hasPrefix {{ .trigger.payload.object_attributes.source_branch }} "ai/" && {{ .trigger.payload.object_attributes.source_branch }} != "pre-prod" && {{ .trigger.payload.object_attributes.source_branch }} != "staging"`

	got, err := evaluateCondition(userCondition, ctxAI)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != false {
		t.Errorf("expected condition to be false for 'ai/' source branch, got true")
	}

	// Test when source_branch is pre-prod
	ctxPreProd := ExecutionContext{
		TriggerData: map[string]interface{}{
			"payload": map[string]interface{}{
				"object_attributes": map[string]interface{}{
					"source_branch": "pre-prod",
					"target_branch": "main",
				},
				"project": map[string]interface{}{
					"default_branch": "main",
				},
			},
		},
	}

	got, err = evaluateCondition(userCondition, ctxPreProd)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != false {
		t.Errorf("expected condition to be false for 'pre-prod' source branch, got true")
	}
}
