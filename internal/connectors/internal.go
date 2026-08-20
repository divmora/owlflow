package connectors

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

type InternalConnector struct{}

func (i *InternalConnector) Execute(action string, params map[string]interface{}) (interface{}, error) {
	switch action {
	case "parseJson":
		return i.parseJSON(params)
	case "getField":
		return i.getField(params)
	case "contains":
		return i.contains(params)
	case "startsWith":
		return i.startsWith(params)
	case "regexMatch":
		return i.regexMatch(params)
	default:
		return nil, fmt.Errorf("unknown internal action: %s", action)
	}
}

func (i *InternalConnector) Validate(params map[string]interface{}) error {
	// Validation logic
	return nil
}

func (i *InternalConnector) parseJSON(params map[string]interface{}) (interface{}, error) {
	data, ok := params["data"].(string)
	if !ok {
		return nil, fmt.Errorf("parseJSON requires a 'data' string parameter")
	}

	var result interface{}
	if err := json.Unmarshal([]byte(data), &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	return result, nil
}

func (i *InternalConnector) getField(params map[string]interface{}) (interface{}, error) {
	data, ok := params["data"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("getField requires a 'data' object parameter")
	}

	field, ok := params["field"].(string)
	if !ok {
		return nil, fmt.Errorf("getField requires a 'field' string parameter")
	}

	value, exists := data[field]
	if !exists {
		return nil, fmt.Errorf("field '%s' not found in data", field)
	}

	return value, nil
}

func (i *InternalConnector) contains(params map[string]interface{}) (interface{}, error) {
	var list []interface{}
	switch v := params["list"].(type) {
	case []interface{}:
		list = v
	case string:
		if err := json.Unmarshal([]byte(v), &list); err != nil {
			// Ignore unmarshal error and treat as empty if it's literal null or invalid
			if v != "null" {
				return nil, fmt.Errorf("contains requires a valid JSON array for 'list': %w", err)
			}
		}
	case nil:
		list = []interface{}{}
	default:
		return nil, fmt.Errorf("contains requires a 'list' parameter of type array or JSON string")
	}

	item, ok := params["item"].(string)
	if !ok {
		// try to convert item to string if it's not?
		// for now strict
		return nil, fmt.Errorf("contains requires an 'item' string parameter")
	}

	for _, v := range list {
		if s, ok := v.(string); ok {
			if s == item {
				return map[string]bool{"found": true}, nil
			}
		}
	}

	return map[string]bool{"found": false}, nil
}

func (i *InternalConnector) startsWith(params map[string]interface{}) (interface{}, error) {
	var list []interface{}
	switch v := params["list"].(type) {
	case []interface{}:
		list = v
	case string:
		if err := json.Unmarshal([]byte(v), &list); err != nil {
			if v != "null" {
				return nil, fmt.Errorf("startsWith requires a valid JSON array for 'list': %w", err)
			}
		}
	case nil:
		list = []interface{}{}
	default:
		return nil, fmt.Errorf("startsWith requires a 'list' parameter of type array or JSON string")
	}

	item, ok := params["item"].(string)
	if !ok {
		return nil, fmt.Errorf("startsWith requires an 'item' string parameter")
	}

	for _, v := range list {
		if prefix, ok := v.(string); ok {
			if strings.HasPrefix(item, prefix) {
				return map[string]bool{"found": true}, nil
			}
		}
	}

	return map[string]bool{"found": false}, nil
}

func (i *InternalConnector) regexMatch(params map[string]interface{}) (interface{}, error) {
	regexStr, ok := params["regex"].(string)
	if !ok {
		return nil, fmt.Errorf("regexMatch requires a 'regex' string parameter")
	}

	item, ok := params["item"].(string)
	if !ok {
		return nil, fmt.Errorf("regexMatch requires an 'item' string parameter")
	}

	match, err := regexp.MatchString(regexStr, item)
	if err != nil {
		return nil, fmt.Errorf("invalid regex '%s': %w", regexStr, err)
	}

	return map[string]bool{"match": match}, nil
}
