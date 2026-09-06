package core

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"text/template"
)

func createTemplate() *template.Template {
	return template.New("param").Funcs(template.FuncMap{
		"toJson":       toJson,
		"toPrettyJson": toPrettyJson,
		"first":        firstElement,
		"index":        indexAccess,
		"hasPrefix":    strings.HasPrefix,
		"regexMatch":   templateRegexMatch,
		"matches":      templateRegexMatch,
	})
}

func templateRegexMatch(args ...interface{}) (bool, error) {
	if len(args) < 2 {
		return false, fmt.Errorf("regexMatch requires 2 arguments (item and regex)")
	}
	s1 := fmt.Sprintf("%v", args[0])
	s2 := fmt.Sprintf("%v", args[1])

	if matchRegex(s1, s2) {
		return true, nil
	}
	if matchRegex(s2, s1) {
		return true, nil
	}
	return false, nil
}

func toJson(data interface{}) (string, error) {
	bytes, err := json.Marshal(data)
	return string(bytes), err
}

func toPrettyJson(data interface{}) (string, error) {
	bytes, err := json.MarshalIndent(data, "", "  ")
	return string(bytes), err
}

func firstElement(items interface{}) interface{} {
	val := reflect.ValueOf(items)
	if val.Kind() == reflect.Slice && val.Len() > 0 {
		return val.Index(0).Interface()
	}
	return items
}

func indexAccess(data interface{}, key interface{}) interface{} {
	v := reflect.ValueOf(data)
	k := reflect.ValueOf(key)

	switch v.Kind() {
	case reflect.Map:
		if value := v.MapIndex(k); value.IsValid() {
			return value.Interface()
		}
	case reflect.Slice, reflect.Array:
		if k.Kind() == reflect.Int && k.Int() < int64(v.Len()) {
			return v.Index(int(k.Int())).Interface()
		}
	}
	return nil
}

func isStructured(s string) bool {
	return strings.HasPrefix(s, "{") && strings.HasSuffix(s, "}") ||
		strings.HasPrefix(s, "[") && strings.HasSuffix(s, "]")
}
