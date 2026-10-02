package connectors

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

var privateIPBlocks []*net.IPNet

func init() {
	cidrs := []string{
		"127.0.0.0/8",        // IPv4 loopback
		"::1/128",            // IPv6 loopback
		"10.0.0.0/8",         // RFC1918 Class A
		"172.16.0.0/12",      // RFC1918 Class B
		"192.168.0.0/16",     // RFC1918 Class C
		"169.254.0.0/16",     // RFC3927 link-local / cloud instance metadata (169.254.169.254)
		"fe80::/10",          // IPv6 link-local unicast
		"fc00::/7",           // IPv6 unique local address (ULA)
		"0.0.0.0/8",          // IPv4 unspecified / current network
		"255.255.255.255/32", // IPv4 broadcast
		"::/128",             // IPv6 unspecified
	}
	for _, cidr := range cidrs {
		_, block, err := net.ParseCIDR(cidr)
		if err == nil {
			privateIPBlocks = append(privateIPBlocks, block)
		}
	}
}

// isPrivateOrLoopbackIP determines whether the provided IP address is private,
// loopback, link-local, or cloud instance metadata.
func isPrivateOrLoopbackIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return true
	}
	for _, block := range privateIPBlocks {
		if block.Contains(ip) {
			return true
		}
	}
	return false
}

// isBlockedHost checks for standard localhost and local-domain hostnames.
func isBlockedHost(host string) bool {
	lower := strings.ToLower(strings.TrimSpace(host))
	return lower == "localhost" ||
		strings.HasSuffix(lower, ".localhost") ||
		strings.HasSuffix(lower, ".local") ||
		strings.HasSuffix(lower, ".internal")
}

// shouldAllowPrivateIPs checks if private and loopback requests are explicitly allowed
// via workflow parameter or HTTP_ALLOW_PRIVATE_IPS environment variable.
func shouldAllowPrivateIPs(params map[string]interface{}) bool {
	if val, ok := params["allow_private_ips"]; ok {
		if b, ok := val.(bool); ok {
			return b
		}
		if s, ok := val.(string); ok {
			lower := strings.ToLower(strings.TrimSpace(s))
			return lower == "true" || lower == "1" || lower == "yes"
		}
	}
	env := strings.ToLower(strings.TrimSpace(os.Getenv("HTTP_ALLOW_PRIVATE_IPS")))
	return env == "true" || env == "1" || env == "yes"
}

// parseTimeout extracts and parses the request timeout from parameters, defaulting to 30 seconds.
func parseTimeout(params map[string]interface{}) time.Duration {
	const defaultTimeout = 30 * time.Second
	raw, ok := params["timeout"]
	if !ok || raw == nil {
		return defaultTimeout
	}

	switch v := raw.(type) {
	case int:
		if v > 0 {
			return time.Duration(v) * time.Second
		}
	case int64:
		if v > 0 {
			return time.Duration(v) * time.Second
		}
	case float64:
		if v > 0 {
			return time.Duration(v * float64(time.Second))
		}
	case string:
		v = strings.TrimSpace(v)
		if v != "" {
			if d, err := time.ParseDuration(v); err == nil && d > 0 {
				return d
			}
			if secs, err := strconv.Atoi(v); err == nil && secs > 0 {
				return time.Duration(secs) * time.Second
			}
		}
	}
	return defaultTimeout
}

// extractHeaders retrieves custom request headers from parameters.
func extractHeaders(params map[string]interface{}) map[string]string {
	headers := make(map[string]string)
	rawHeaders, ok := params["headers"]
	if !ok || rawHeaders == nil {
		return headers
	}

	switch h := rawHeaders.(type) {
	case map[string]string:
		for k, v := range h {
			headers[k] = v
		}
	case map[string]interface{}:
		for k, v := range h {
			headers[k] = fmt.Sprintf("%v", v)
		}
	}
	return headers
}

// parseRequestBody converts request body parameter into raw bytes and notes if it was JSON.
func parseRequestBody(bodyParam interface{}) ([]byte, bool, error) {
	if bodyParam == nil {
		return nil, false, nil
	}
	switch v := bodyParam.(type) {
	case string:
		return []byte(v), false, nil
	case []byte:
		return v, false, nil
	case map[string]interface{}, []interface{}:
		b, err := json.Marshal(v)
		if err != nil {
			return nil, false, fmt.Errorf("failed to marshal request body to JSON: %w", err)
		}
		return b, true, nil
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return []byte(fmt.Sprintf("%v", v)), false, nil
		}
		return b, true, nil
	}
}

// validateURL checks URL scheme, syntax, and hostname.
func validateURL(rawURL string) (*url.URL, error) {
	if strings.TrimSpace(rawURL) == "" {
		return nil, fmt.Errorf("url parameter is required")
	}

	u, err := url.ParseRequestURI(rawURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL %q: %w", rawURL, err)
	}

	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, fmt.Errorf("unsupported URL scheme %q: only http and https are allowed", u.Scheme)
	}

	if u.Hostname() == "" {
		return nil, fmt.Errorf("URL missing host: %q", rawURL)
	}

	return u, nil
}

// createHTTPClient builds an HTTP client with configurable timeout and transport-level SSRF guards.
func createHTTPClient(timeout time.Duration, allowPrivate bool) *http.Client {
	dialer := &net.Dialer{
		Timeout:   timeout,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, fmt.Errorf("invalid network address %q: %w", addr, err)
			}

			if !allowPrivate && isBlockedHost(host) {
				return nil, fmt.Errorf("request to host %q blocked by SSRF protection", host)
			}

			// Direct IP literal
			if ip := net.ParseIP(host); ip != nil {
				if !allowPrivate && isPrivateOrLoopbackIP(ip) {
					return nil, fmt.Errorf("request to IP %s blocked by SSRF protection", ip.String())
				}
				return dialer.DialContext(ctx, network, addr)
			}

			// DNS lookup
			ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
			if err != nil {
				return nil, fmt.Errorf("DNS resolution failed for %q: %w", host, err)
			}
			if len(ips) == 0 {
				return nil, fmt.Errorf("no IP addresses resolved for %q", host)
			}

			var dialIP net.IP
			for _, ip := range ips {
				if !allowPrivate && isPrivateOrLoopbackIP(ip) {
					return nil, fmt.Errorf("request to resolved IP %s for %q blocked by SSRF protection", ip.String(), host)
				}
				if dialIP == nil {
					dialIP = ip
				}
			}

			// Dial the resolved, verified IP directly to prevent DNS rebinding
			dialAddr := net.JoinHostPort(dialIP.String(), port)
			return dialer.DialContext(ctx, network, dialAddr)
		},
	}

	return &http.Client{
		Transport: transport,
		Timeout:   timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("stopped after 10 redirects")
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return fmt.Errorf("redirect to unsupported scheme %q blocked", req.URL.Scheme)
			}
			if !allowPrivate && isBlockedHost(req.URL.Hostname()) {
				return fmt.Errorf("redirect to host %q blocked by SSRF protection", req.URL.Hostname())
			}
			return nil
		},
	}
}

type HTTPConnector struct{}

func (h *HTTPConnector) Execute(action string, params map[string]interface{}) (interface{}, error) {
	normAction := strings.ToLower(strings.TrimSpace(action))

	var method string
	switch normAction {
	case "get":
		method = http.MethodGet
	case "post":
		method = http.MethodPost
	case "put":
		method = http.MethodPut
	case "patch":
		method = http.MethodPatch
	case "delete":
		method = http.MethodDelete
	default:
		return nil, fmt.Errorf("unsupported HTTP action: %s", action)
	}

	rawURL, ok := params["url"].(string)
	if !ok || strings.TrimSpace(rawURL) == "" {
		return nil, fmt.Errorf("url parameter is required")
	}

	parsedURL, err := validateURL(rawURL)
	if err != nil {
		return nil, err
	}

	timeout := parseTimeout(params)
	allowPrivate := shouldAllowPrivateIPs(params)

	bodyBytes, isJSON, err := parseRequestBody(params["body"])
	if err != nil {
		return nil, err
	}

	var bodyReader io.Reader
	if len(bodyBytes) > 0 {
		bodyReader = bytes.NewReader(bodyBytes)
	}

	req, err := http.NewRequestWithContext(context.Background(), method, parsedURL.String(), bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create HTTP request: %w", err)
	}

	// Apply custom headers
	for k, v := range extractHeaders(params) {
		req.Header.Set(k, v)
	}

	// If body was marshaled from JSON and Content-Type was not explicitly provided, default to application/json
	if isJSON && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	client := createHTTPClient(timeout, allowPrivate)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Limit response reading to 10MB to avoid memory exhaustion
	const maxResponseBodyBytes = 10 * 1024 * 1024
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Extract response headers
	respHeaders := make(map[string]string, len(resp.Header))
	for k, v := range resp.Header {
		if len(v) > 0 {
			respHeaders[k] = v[0]
		}
	}

	return map[string]interface{}{
		"status_code": resp.StatusCode,
		"body":        string(respBody),
		"headers":     respHeaders,
	}, nil
}

func (h *HTTPConnector) Validate(params map[string]interface{}) error {
	if params == nil {
		return fmt.Errorf("params cannot be nil")
	}
	rawURL, ok := params["url"]
	if !ok || rawURL == nil {
		return fmt.Errorf("url parameter is required")
	}
	urlStr, ok := rawURL.(string)
	if !ok || strings.TrimSpace(urlStr) == "" {
		return fmt.Errorf("url parameter must be a non-empty string")
	}
	if _, err := validateURL(urlStr); err != nil {
		return err
	}
	return nil
}
