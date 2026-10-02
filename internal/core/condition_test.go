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
		{
			name:      "Quoted OR operator in comparison value (non-matching)",
			condition: `{{ .vars.env }} == "prod || staging"`,
			expected:  false,
		},
		{
			name:      "Quoted OR operator in comparison value (matching)",
			condition: `"prod || staging" == "prod || staging"`,
			expected:  true,
		},
		{
			name:      "Quoted AND operator in comparison value",
			condition: `"foo && bar" == "foo && bar"`,
			expected:  true,
		},
		{
			name:      "Quoted equality operator in string literal",
			condition: `"x == 1" == "x == 1"`,
			expected:  true,
		},
		{
			name:      "Quoted inequality operator in string literal",
			condition: `"x != 1" == "x != 1"`,
			expected:  true,
		},
		{
			name:      "Quoted relational operator in string literal",
			condition: `"count < 10" == "count < 10"`,
			expected:  true,
		},
		{
			name:      "Chained expressions with quoted operators",
			condition: `{{ .steps.check_commit.output.status_code }} == 200 && "{{ .vars.env }}" == "production" || "{{ .vars.env }}" == "prod || staging"`,
			expected:  true,
		},
		{
			name:      "hasPrefix with quoted argument containing spaces",
			condition: `hasPrefix "feature branch name" "feature "`,
			expected:  true,
		},
		{
			name:      "hasPrefix functional syntax with comma inside quotes",
			condition: `hasPrefix("hello, world", "hello, ")`,
			expected:  true,
		},
		{
			name:      "matches functional syntax with comma inside quotes",
			condition: `matches("branch,name", "^branch,name$")`,
			expected:  true,
		},
		{
			name:      "Single-quoted string literal containing OR operator",
			condition: `'prod || staging' == 'prod || staging'`,
			expected:  true,
		},
		{
			name:      "Single-quoted string literal containing AND operator",
			condition: `'foo && bar' == 'foo && bar'`,
			expected:  true,
		},
		{
			name:      "Escaped quotes within string literal",
			condition: `"foo \"bar\"" == "foo \"bar\""`,
			expected:  true,
		},
		{
			name:      "Regex operand order strictness in condition: item with metacharacters does not match literal pattern",
			condition: `regexMatch "foo.*bar" "foo123bar"`,
			expected:  false,
		},
		{
			name:      "Regex operand order strictness in condition: literal item matches regex pattern",
			condition: `regexMatch "foo123bar" "foo.*bar"`,
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

func TestTokenizer_SplitOutsideQuotes(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		sep      string
		expected []string
	}{
		{
			name:     "Splits OR outside quotes",
			input:    `a == 1 || b == 2`,
			sep:      " || ",
			expected: []string{"a == 1", "b == 2"},
		},
		{
			name:     "Does not split OR inside double quotes",
			input:    `a == "prod || staging" || b == "dev"`,
			sep:      " || ",
			expected: []string{`a == "prod || staging"`, `b == "dev"`},
		},
		{
			name:     "Does not split OR inside single quotes",
			input:    `a == 'prod || staging' || b == 'dev'`,
			sep:      " || ",
			expected: []string{`a == 'prod || staging'`, `b == 'dev'`},
		},
		{
			name:     "Does not split AND inside quotes",
			input:    `a == "foo && bar" && b == 2`,
			sep:      " && ",
			expected: []string{`a == "foo && bar"`, `b == 2`},
		},
		{
			name:     "Handles escaped quotes properly",
			input:    `a == "hello \" || world" || b == 1`,
			sep:      " || ",
			expected: []string{`a == "hello \" || world"`, `b == 1`},
		},
		{
			name:     "Comma splitting outside quotes for functional syntax",
			input:    `"hello, world", "hello"`,
			sep:      ",",
			expected: []string{`"hello, world"`, ` "hello"`},
		},
		{
			name:     "Empty sep returns slice with original string",
			input:    `test string`,
			sep:      "",
			expected: []string{"test string"},
		},
		{
			name:     "Sep longer than input",
			input:    `a`,
			sep:      " || ",
			expected: []string{"a"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitOutsideQuotes(tt.input, tt.sep)
			if len(got) != len(tt.expected) {
				t.Fatalf("splitOutsideQuotes(%q, %q) returned %d parts, want %d: %v", tt.input, tt.sep, len(got), len(tt.expected), got)
			}
			for i := range got {
				if got[i] != tt.expected[i] {
					t.Errorf("part %d = %q, want %q", i, got[i], tt.expected[i])
				}
			}
		})
	}
}

func TestTokenizer_SplitWhitespaceOutsideQuotes(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "Basic whitespace separation",
			input:    `hasPrefix item prefix`,
			expected: []string{"hasPrefix", "item", "prefix"},
		},
		{
			name:     "Preserves spaces inside double quotes",
			input:    `hasPrefix "hello world" "hello"`,
			expected: []string{"hasPrefix", `"hello world"`, `"hello"`},
		},
		{
			name:     "Preserves spaces inside single quotes",
			input:    `hasPrefix 'hello world' 'hello'`,
			expected: []string{"hasPrefix", `'hello world'`, `'hello'`},
		},
		{
			name:     "Multiple consecutive spaces",
			input:    `regexMatch   "item with   spaces"   "^item"`,
			expected: []string{"regexMatch", `"item with   spaces"`, `"^item"`},
		},
		{
			name:     "Empty input",
			input:    `   `,
			expected: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitWhitespaceOutsideQuotes(tt.input)
			if len(got) != len(tt.expected) {
				t.Fatalf("splitWhitespaceOutsideQuotes(%q) returned %d tokens, want %d: %v", tt.input, len(got), len(tt.expected), got)
			}
			for i := range got {
				if got[i] != tt.expected[i] {
					t.Errorf("token %d = %q, want %q", i, got[i], tt.expected[i])
				}
			}
		})
	}
}

func TestTokenizer_IsQuoted(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantOk    bool
		wantQuote byte
	}{
		{"Double quoted", `"hello"`, true, '"'},
		{"Single quoted", `'hello'`, true, '\''},
		{"Empty double quoted", `""`, true, '"'},
		{"Empty single quoted", `''`, true, '\''},
		{"Unquoted text", `hello`, false, 0},
		{"Single char quote", `"`, false, 0},
		{"Mismatch quotes", `"hello'`, false, 0},
		{"Quote closed early", `"hello" "world"`, false, 0},
		{"Escaped closing quote", `"hello\"`, false, 0},
		{"Escaped backslash before closing quote", `"hello\\"`, true, '"'},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ok, q := isQuoted(tt.input)
			if ok != tt.wantOk || q != tt.wantQuote {
				t.Errorf("isQuoted(%q) = (%v, %q), want (%v, %q)", tt.input, ok, q, tt.wantOk, tt.wantQuote)
			}
		})
	}
}

func TestTokenizer_NormalizeExprValue(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"Number unquoted", "200", "200"},
		{"Double quotes stripped", `"production"`, "production"},
		{"Single quotes stripped", `'staging'`, "staging"},
		{"Escaped double quotes unescaped", `"hello \"world\""`, `hello "world"`},
		{"Escaped single quotes unescaped", `'hello \'world\''`, `hello 'world'`},
		{"Whitespace trimmed around quotes", `  "val"  `, "val"},
		{"Quotes inside unquoted text preserved", `foo"bar`, `foo"bar`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeExprValue(tt.input)
			if got != tt.expected {
				t.Errorf("normalizeExprValue(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}
