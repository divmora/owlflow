package core

import (
	"bytes"
	"testing"
)

func TestIndexAccess_Slice_ValidIndices(t *testing.T) {
	data := []string{"alpha", "bravo", "charlie"}

	testCases := []struct {
		name     string
		key      interface{}
		expected interface{}
	}{
		{"int zero", 0, "alpha"},
		{"int one", 1, "bravo"},
		{"int two", 2, "charlie"},
		{"int8", int8(1), "bravo"},
		{"int16", int16(2), "charlie"},
		{"int32", int32(0), "alpha"},
		{"int64", int64(1), "bravo"},
		{"uint", uint(2), "charlie"},
		{"uint8", uint8(0), "alpha"},
		{"uint16", uint16(1), "bravo"},
		{"uint32", uint32(2), "charlie"},
		{"uint64", uint64(0), "alpha"},
		{"float64 exact integer", float64(1.0), "bravo"},
		{"float32 exact integer", float32(2.0), "charlie"},
		{"numeric string zero", "0", "alpha"},
		{"numeric string with whitespace", " 1 ", "bravo"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			res := indexAccess(data, tc.key)
			if res != tc.expected {
				t.Errorf("expected %v, got %v", tc.expected, res)
			}
		})
	}
}

func TestIndexAccess_Slice_NegativeIndex_NoPanic(t *testing.T) {
	data := []string{"alpha", "bravo", "charlie"}

	negativeKeys := []interface{}{
		-1,
		-2,
		-999,
		int64(-1),
		int32(-1),
		float64(-1.0),
		"-1",
	}

	for _, key := range negativeKeys {
		t.Run("negative index", func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("unexpected panic on negative index %v: %v", key, r)
				}
			}()
			res := indexAccess(data, key)
			if res != nil {
				t.Errorf("expected nil for negative index %v, got %v", key, res)
			}
		})
	}
}

func TestIndexAccess_Slice_OutOfBounds_NoPanic(t *testing.T) {
	data := []string{"alpha", "bravo", "charlie"}

	outOfBoundsKeys := []interface{}{
		3,
		4,
		1000,
		int64(3),
		float64(5.0),
		"10",
	}

	for _, key := range outOfBoundsKeys {
		t.Run("out of bounds index", func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("unexpected panic on out of bounds index %v: %v", key, r)
				}
			}()
			res := indexAccess(data, key)
			if res != nil {
				t.Errorf("expected nil for out of bounds index %v, got %v", key, res)
			}
		})
	}
}

func TestIndexAccess_FractionalFloat(t *testing.T) {
	data := []string{"alpha", "bravo", "charlie"}

	fractionalKeys := []interface{}{
		0.5,
		1.99,
		float32(2.1),
	}

	for _, key := range fractionalKeys {
		res := indexAccess(data, key)
		if res != nil {
			t.Errorf("expected nil for fractional float key %v, got %v", key, res)
		}
	}
}

func TestIndexAccess_Array(t *testing.T) {
	data := [3]string{"first", "second", "third"}

	if res := indexAccess(data, 0); res != "first" {
		t.Errorf("expected 'first', got %v", res)
	}
	if res := indexAccess(data, 2); res != "third" {
		t.Errorf("expected 'third', got %v", res)
	}
	if res := indexAccess(data, -1); res != nil {
		t.Errorf("expected nil for negative index on array, got %v", res)
	}
	if res := indexAccess(data, 5); res != nil {
		t.Errorf("expected nil for out of bounds index on array, got %v", res)
	}
}

func TestIndexAccess_Map(t *testing.T) {
	strMap := map[string]interface{}{
		"env":     "production",
		"version": 2,
		"100":     "hundred",
	}

	if res := indexAccess(strMap, "env"); res != "production" {
		t.Errorf("expected 'production', got %v", res)
	}
	if res := indexAccess(strMap, "nonexistent"); res != nil {
		t.Errorf("expected nil for nonexistent map key, got %v", res)
	}
	// Fallback conversion for integer key on string map
	if res := indexAccess(strMap, 100); res != "hundred" {
		t.Errorf("expected 'hundred' via string conversion, got %v", res)
	}
	// Nil key should return nil without panicking
	if res := indexAccess(strMap, nil); res != nil {
		t.Errorf("expected nil for nil key on map, got %v", res)
	}

	intMap := map[int]string{
		1: "one",
		2: "two",
	}
	if res := indexAccess(intMap, 1); res != "one" {
		t.Errorf("expected 'one', got %v", res)
	}
}

func TestIndexAccess_NilAndInvalidData(t *testing.T) {
	if res := indexAccess(nil, 0); res != nil {
		t.Errorf("expected nil for nil data, got %v", res)
	}
	if res := indexAccess([]string{"a"}, nil); res != nil {
		t.Errorf("expected nil for nil key, got %v", res)
	}
	if res := indexAccess(12345, 0); res != nil {
		t.Errorf("expected nil for int data, got %v", res)
	}
}

func TestFirstElement(t *testing.T) {
	slice := []string{"first_slice", "second_slice"}
	if res := firstElement(slice); res != "first_slice" {
		t.Errorf("expected 'first_slice', got %v", res)
	}

	array := [2]string{"first_arr", "second_arr"}
	if res := firstElement(array); res != "first_arr" {
		t.Errorf("expected 'first_arr', got %v", res)
	}

	emptySlice := []string{}
	res := firstElement(emptySlice)
	if sliceRes, ok := res.([]string); !ok || len(sliceRes) != 0 {
		t.Errorf("expected empty slice, got %v", res)
	}

	if res := firstElement(nil); res != nil {
		t.Errorf("expected nil for nil items, got %v", res)
	}

	scalar := "single_string"
	if res := firstElement(scalar); res != "single_string" {
		t.Errorf("expected 'single_string', got %v", res)
	}
}

func TestTemplateExecution_Integration(t *testing.T) {
	tmpl := createTemplate()

	data := map[string]interface{}{
		"items": []string{"item0", "item1", "item2"},
		"dict": map[string]interface{}{
			"title": "OwlFlow",
		},
		"idx": float64(1), // Common JSON unmarshal type
	}

	testCases := []struct {
		name     string
		expr     string
		expected string
	}{
		{"index integer", `{{ index .items 0 }}`, "item0"},
		{"index float", `{{ index .items .idx }}`, "item1"},
		{"index string", `{{ index .items "2" }}`, "item2"},
		{"index negative no panic", `{{ index .items -1 }}`, "<no value>"},
		{"index out of bounds no panic", `{{ index .items 99 }}`, "<no value>"},
		{"first element", `{{ first .items }}`, "item0"},
		{"map index", `{{ index .dict "title" }}`, "OwlFlow"},
		{"toJson", `{{ toJson .items }}`, `["item0","item1","item2"]`},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			parsed, err := tmpl.Parse(tc.expr)
			if err != nil {
				t.Fatalf("failed to parse template: %v", err)
			}
			var buf bytes.Buffer
			if err := parsed.Execute(&buf, data); err != nil {
				t.Fatalf("failed to execute template: %v", err)
			}
			if buf.String() != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, buf.String())
			}
		})
	}
}
