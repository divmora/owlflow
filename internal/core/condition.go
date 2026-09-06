package core

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func evaluateCondition(condition string, ctx ExecutionContext) (bool, error) {
	if condition == "" {
		return true, nil
	}

	tmpl, err := createTemplate().Parse(condition)
	if err != nil {
		return false, err
	}

	var buf bytes.Buffer
	err = tmpl.Execute(&buf, map[string]interface{}{
		"trigger": ctx.TriggerData,
		"steps":   ctx.StepsData,
		"vars":    ctx.Vars,
		"parent":  ctx.ParentOutputs,
	})

	rendered := strings.TrimSpace(buf.String())
	if rendered == "" {
		return true, nil
	}

	if result, err := strconv.ParseBool(rendered); err == nil {
		return result, nil
	}

	// Try to evaluate basic expressions (e.g., "true == true", "val == \"val\"")
	return evalSimpleExpr(rendered), nil
}

func evalSimpleExpr(expr string) bool {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return true
	}

	// Handle OR
	if strings.Contains(expr, " || ") {
		parts := strings.Split(expr, " || ")
		for _, part := range parts {
			if evalSimpleExpr(part) {
				return true
			}
		}
		return false
	}

	// Handle AND
	if strings.Contains(expr, " && ") {
		parts := strings.Split(expr, " && ")
		for _, part := range parts {
			if !evalSimpleExpr(part) {
				return false
			}
		}
		return true
	}

	// Handle Equality
	if strings.Contains(expr, " == ") {
		parts := strings.Split(expr, " == ")
		if len(parts) == 2 {
			return normalizeExprValue(parts[0]) == normalizeExprValue(parts[1])
		}
	}

	// Handle Inequality
	if strings.Contains(expr, " != ") {
		parts := strings.Split(expr, " != ")
		if len(parts) == 2 {
			return normalizeExprValue(parts[0]) != normalizeExprValue(parts[1])
		}
	}

	// Handle Relational operators (<=, >=, <, >)
	if strings.Contains(expr, " <= ") {
		parts := strings.Split(expr, " <= ")
		if len(parts) == 2 {
			v1, err1 := strconv.ParseFloat(normalizeExprValue(parts[0]), 64)
			v2, err2 := strconv.ParseFloat(normalizeExprValue(parts[1]), 64)
			if err1 == nil && err2 == nil {
				return v1 <= v2
			}
		}
	}
	if strings.Contains(expr, " >= ") {
		parts := strings.Split(expr, " >= ")
		if len(parts) == 2 {
			v1, err1 := strconv.ParseFloat(normalizeExprValue(parts[0]), 64)
			v2, err2 := strconv.ParseFloat(normalizeExprValue(parts[1]), 64)
			if err1 == nil && err2 == nil {
				return v1 >= v2
			}
		}
	}
	if strings.Contains(expr, " < ") {
		parts := strings.Split(expr, " < ")
		if len(parts) == 2 {
			v1, err1 := strconv.ParseFloat(normalizeExprValue(parts[0]), 64)
			v2, err2 := strconv.ParseFloat(normalizeExprValue(parts[1]), 64)
			if err1 == nil && err2 == nil {
				return v1 < v2
			}
		}
	}
	if strings.Contains(expr, " > ") {
		parts := strings.Split(expr, " > ")
		if len(parts) == 2 {
			v1, err1 := strconv.ParseFloat(normalizeExprValue(parts[0]), 64)
			v2, err2 := strconv.ParseFloat(normalizeExprValue(parts[1]), 64)
			if err1 == nil && err2 == nil {
				return v1 > v2
			}
		}
	}

	// Handle Negation (!)
	if strings.HasPrefix(expr, "!") {
		return !evalSimpleExpr(strings.TrimSpace(expr[1:]))
	}

	// Handle hasPrefix (support both "hasPrefix item prefix" and "hasPrefix(item, prefix)")
	if strings.HasPrefix(expr, "hasPrefix ") || strings.HasPrefix(expr, "hasPrefix(") {
		if strings.HasPrefix(expr, "hasPrefix(") && strings.HasSuffix(expr, ")") {
			inner := strings.TrimSuffix(strings.TrimPrefix(expr, "hasPrefix("), ")")
			parts := strings.SplitN(inner, ",", 2)
			if len(parts) == 2 {
				item := normalizeExprValue(parts[0])
				prefix := normalizeExprValue(parts[1])
				return strings.HasPrefix(item, prefix)
			}
		} else {
			parts := strings.SplitN(expr, " ", 3)
			if len(parts) == 3 {
				item := normalizeExprValue(parts[1])
				prefix := normalizeExprValue(parts[2])
				return strings.HasPrefix(item, prefix)
			}
		}
	}

	// Handle regexMatch and matches (support both prefix and functional syntax)
	for _, fn := range []string{"regexMatch", "matches"} {
		prefixSpace := fn + " "
		prefixParen := fn + "("
		if strings.HasPrefix(expr, prefixSpace) || strings.HasPrefix(expr, prefixParen) {
			if strings.HasPrefix(expr, prefixParen) && strings.HasSuffix(expr, ")") {
				inner := strings.TrimSuffix(strings.TrimPrefix(expr, prefixParen), ")")
				parts := strings.SplitN(inner, ",", 2)
				if len(parts) == 2 {
					item := normalizeExprValue(parts[0])
					pattern := normalizeExprValue(parts[1])
					return matchRegex(item, pattern)
				}
			} else {
				parts := strings.SplitN(expr, " ", 3)
				if len(parts) == 3 {
					item := normalizeExprValue(parts[1])
					pattern := normalizeExprValue(parts[2])
					return matchRegex(item, pattern)
				}
			}
		}
	}

	// Fallback to literal boolean check
	b, err := strconv.ParseBool(expr)
	return err == nil && b
}

func parseRegexPattern(pattern string) (string, error) {
	pattern = strings.TrimSpace(pattern)
	pattern = strings.Trim(pattern, "\"")
	pattern = strings.Trim(pattern, "'")
	pattern = strings.TrimSpace(pattern)

	// Check for JS-style regex literal: /pattern/flags
	if strings.HasPrefix(pattern, "/") && strings.LastIndex(pattern, "/") > 0 {
		lastSlash := strings.LastIndex(pattern, "/")
		body := pattern[1:lastSlash]
		flags := pattern[lastSlash+1:]

		// unescape \/ to /
		body = strings.ReplaceAll(body, `\/`, `/`)

		flagPrefix := ""
		if strings.Contains(flags, "i") && !strings.Contains(body, "(?i)") {
			flagPrefix += "i"
		}
		if strings.Contains(flags, "m") && !strings.Contains(body, "(?m)") {
			flagPrefix += "m"
		}
		if strings.Contains(flags, "s") && !strings.Contains(body, "(?s)") {
			flagPrefix += "s"
		}

		if flagPrefix != "" {
			body = "(?" + flagPrefix + ")" + body
		}
		return body, nil
	}

	return pattern, nil
}

func matchRegex(item, pattern string) bool {
	parsedPattern, err := parseRegexPattern(pattern)
	if err != nil {
		return false
	}
	re, err := regexp.Compile(parsedPattern)
	if err != nil {
		// Fallback: try unescaping double backslashes
		unescaped := strings.ReplaceAll(parsedPattern, `\\`, `\`)
		re, err = regexp.Compile(unescaped)
		if err != nil {
			return false
		}
	}

	matched := re.MatchString(item)
	if !matched && strings.Contains(parsedPattern, `\\`) {
		unescaped := strings.ReplaceAll(parsedPattern, `\\`, `\`)
		if re2, err2 := regexp.Compile(unescaped); err2 == nil {
			return re2.MatchString(item)
		}
	}

	return matched
}

func normalizeExprValue(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "\"")
	s = strings.Trim(s, "'")
	return s
}

func resolveParams(params map[string]interface{}, ctx ExecutionContext) (map[string]interface{}, error) {
	resolved := make(map[string]interface{})

	for key, value := range params {
		var err error
		resolved[key], err = resolveValue(value, ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve param '%s': %w", key, err)
		}
	}
	return resolved, nil
}

func resolveValue(value interface{}, ctx ExecutionContext) (interface{}, error) {
	switch v := value.(type) {
	case string:
		return processStringTemplate(v, ctx)

	case map[string]interface{}:
		return processMap(v, ctx)

	case []interface{}:
		return processSlice(v, ctx)

	default:
		// Return primitives (numbers, booleans) as-is
		return value, nil
	}
}

func processStringTemplate(s string, ctx ExecutionContext) (interface{}, error) {
	if !strings.Contains(s, "{{") {
		return parsePotentialJSON(s)
	}

	tmpl, err := createTemplate().Parse(s)
	if err != nil {
		return nil, fmt.Errorf("template parse error: %w", err)
	}

	// Execute template
	var buf bytes.Buffer
	err = tmpl.Execute(&buf, map[string]interface{}{
		"trigger": ctx.TriggerData,
		"steps":   ctx.StepsData,
		"vars":    ctx.Vars,
		"parent":  ctx.ParentOutputs,
	})
	if err != nil {
		return nil, fmt.Errorf("template execution error: %w", err)
	}

	rendered := buf.String()
	parsed, err := parsePotentialJSON(rendered)
	if err != nil {
		return nil, err
	}

	// Recursively resolve parsed JSON structures
	return resolveValue(parsed, ctx)
}

func processMap(m map[string]interface{}, ctx ExecutionContext) (map[string]interface{}, error) {
	resolved := make(map[string]interface{})
	for key, value := range m {
		var err error
		resolved[key], err = resolveValue(value, ctx)
		if err != nil {
			return nil, err
		}
	}
	return resolved, nil
}

func processSlice(s []interface{}, ctx ExecutionContext) ([]interface{}, error) {
	resolved := make([]interface{}, len(s))
	for i, value := range s {
		var err error
		resolved[i], err = resolveValue(value, ctx)
		if err != nil {
			return nil, err
		}
	}
	return resolved, nil
}

func parsePotentialJSON(s string) (interface{}, error) {
	if isStructured(s) {
		var jsonValue interface{}
		if err := json.Unmarshal([]byte(s), &jsonValue); err == nil {
			return jsonValue, nil
		}
	}
	return s, nil
}

func retry(step *Step, fn func() error) error {
	maxRetries := step.Retries
	backoff := time.Second
	for i := 0; i < maxRetries; i++ {
		err := fn()
		if err == nil {
			return nil
		}
		time.Sleep(backoff)
		backoff *= 2
	}
	return fmt.Errorf("max retries exceeded")
}
