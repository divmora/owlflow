package core

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
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
	item := fmt.Sprintf("%v", args[0])
	pattern := fmt.Sprintf("%v", args[1])

	return matchRegex(item, pattern), nil
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
	if items == nil {
		return nil
	}
	val := reflect.ValueOf(items)
	for val.Kind() == reflect.Interface || val.Kind() == reflect.Pointer {
		if val.IsNil() {
			return nil
		}
		val = val.Elem()
	}
	if (val.Kind() == reflect.Slice || val.Kind() == reflect.Array) && val.Len() > 0 {
		return val.Index(0).Interface()
	}
	return items
}

func extractIndex(key interface{}) (int, bool) {
	if key == nil {
		return 0, false
	}
	k := reflect.ValueOf(key)
	for k.Kind() == reflect.Interface || k.Kind() == reflect.Pointer {
		if k.IsNil() {
			return 0, false
		}
		k = k.Elem()
	}
	switch k.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		val := k.Int()
		if val >= 0 && val <= int64(int(^uint(0)>>1)) {
			return int(val), true
		}
		return 0, false
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		val := k.Uint()
		if val <= uint64(int(^uint(0)>>1)) {
			return int(val), true
		}
		return 0, false
	case reflect.Float32, reflect.Float64:
		f := k.Float()
		if f >= 0 && f == float64(int(f)) && f <= float64(int(^uint(0)>>1)) {
			return int(f), true
		}
		return 0, false
	case reflect.String:
		s := strings.TrimSpace(k.String())
		if idx, err := strconv.Atoi(s); err == nil && idx >= 0 {
			return idx, true
		}
		return 0, false
	default:
		return 0, false
	}
}

func indexAccess(data interface{}, key interface{}) interface{} {
	if data == nil || key == nil {
		return nil
	}

	v := reflect.ValueOf(data)
	for v.Kind() == reflect.Interface || v.Kind() == reflect.Pointer {
		if v.IsNil() {
			return nil
		}
		v = v.Elem()
	}

	if !v.IsValid() {
		return nil
	}

	switch v.Kind() {
	case reflect.Slice, reflect.Array:
		if idx, ok := extractIndex(key); ok {
			if idx >= 0 && idx < v.Len() {
				return v.Index(idx).Interface()
			}
		}
		return nil

	case reflect.Map:
		k := reflect.ValueOf(key)
		for k.Kind() == reflect.Interface || k.Kind() == reflect.Pointer {
			if k.IsNil() {
				return nil
			}
			k = k.Elem()
		}
		if !k.IsValid() {
			return nil
		}
		if k.Type().AssignableTo(v.Type().Key()) {
			if val := v.MapIndex(k); val.IsValid() {
				return val.Interface()
			}
		} else if v.Type().Key().Kind() == reflect.String {
			strKey := reflect.ValueOf(fmt.Sprintf("%v", key))
			if val := v.MapIndex(strKey); val.IsValid() {
				return val.Interface()
			}
		}
		return nil
	}

	return nil
}

func isStructured(s string) bool {
	return strings.HasPrefix(s, "{") && strings.HasSuffix(s, "}") ||
		strings.HasPrefix(s, "[") && strings.HasSuffix(s, "]")
}
