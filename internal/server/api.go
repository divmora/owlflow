package server

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/divmora/owlflow/internal/connectors"
	"github.com/divmora/owlflow/internal/core"
	"github.com/divmora/owlflow/internal/logging"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

const (
	WorkflowConfigPath = "./configs/workflows"
)

type API struct {
	Workflows  map[string]*core.Workflow
	Connectors map[string]connectors.Connector
}

func NewAPI() *API {
	logging.Init()
	return &API{
		Workflows:  make(map[string]*core.Workflow),
		Connectors: connectors.Registry,
	}
}

func (a *API) SetupRouter() *gin.Engine {
	logging.Init()
	if logging.IsSyslogEnabled() {
		gin.DefaultWriter = log.Writer()
		gin.DefaultErrorWriter = log.Writer()
	}
	r := gin.Default()

	//r.POST("/workflows/:id/execute", a.executeWorkflow)
	r.POST("/webhook/:id", a.handleWebhook)

	return r
}

func (a *API) Start() {
	r := a.SetupRouter()
	r.Run(":8080")
}

func (a *API) handleWebhook(c *gin.Context) {
	workflowID := c.Param("id")

	// 1. Load workflow from filesystem
	wf, err := a.loadWorkflowByID(workflowID)
	if err != nil {
		c.JSON(404, gin.H{"error": "Workflow not found"})
		return
	}

	// Validate workflow structure
	if err := wf.Validate(); err != nil {
		c.JSON(400, gin.H{"error": "Invalid workflow: " + err.Error()})
		return
	}

	// 2. Check workflow status
	if wf.Status != core.StatusActive {
		c.JSON(403, gin.H{"error": "Workflow is not active"})
		return
	}

	// 3. Verify webhook security
	if err := a.verifyWebhook(c, wf); err != nil {
		c.JSON(401, gin.H{"error": err.Error()})
		return
	}

	// 4. Parse payload
	payload, err := a.parseWebhookPayload(c)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid payload"})
		return
	}

	// 5. Create execution context
	execData := core.ExecutionContext{
		WorkflowID: workflowID,
		TriggerData: map[string]interface{}{
			"payload": payload,
			"headers": c.Request.Header,
			"query":   c.Request.URL.Query(),
		},
		Vars: wf.Vars,
	}

	// 6. Execute workflow
	if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
		// Run synchronously in Lambda to avoid container freezing before background goroutines finish
		execData.ExecutionID = uuid.New().String()
		executor := core.NewExecutor(wf, a.Connectors)
		if err := executor.Run(context.Background(), execData); err != nil {
			log.Printf("Workflow execution failed: %v", err)
			c.JSON(500, gin.H{"error": "Execution failed"})
			return
		}
		c.JSON(200, gin.H{"status": "completed"})
	} else {
		// Run async for standard server to respond quickly
		go func() {
			execData.ExecutionID = uuid.New().String()
			executor := core.NewExecutor(wf, a.Connectors)
			if err := executor.Run(context.Background(), execData); err != nil {
				log.Printf("Workflow execution failed: %v", err)
			}
		}()
		c.JSON(202, gin.H{"status": "accepted"})
	}
}

func (a *API) loadWorkflowByID(id string) (*core.Workflow, error) {
	// Search for workflow files with matching ID
	pattern := filepath.Join(WorkflowConfigPath, id+".*")
	matches, err := filepath.Glob(pattern)
	if err != nil || len(matches) == 0 {
		return nil, fmt.Errorf("workflow not found")
	}

	content, err := os.ReadFile(matches[0])
	if err != nil {
		return nil, err
	}

	var wf core.Workflow
	ext := filepath.Ext(matches[0])
	switch ext {
	case ".json":
		err = json.Unmarshal(content, &wf)
	case ".yaml", ".yml":
		err = yaml.Unmarshal(content, &wf)
	default:
		return nil, fmt.Errorf("unsupported format")
	}

	if err != nil {
		return nil, err
	}

	// After unmarshalling the workflow
	wf.StepsMap = make(map[string]*core.Step)
	for i := range wf.Steps {
		step := &wf.Steps[i]

		// Ensure next_steps exists
		if step.NextSteps == nil {
			step.NextSteps = make([]core.NextStep, 0)
		}

		// Set default retries if not specified
		if step.Retries == 0 {
			step.Retries = 1
		}

		wf.StepsMap[step.ID] = step
	}

	// Verify workflow ID matches filename
	if wf.ID != id {
		return nil, fmt.Errorf("workflow ID mismatch")
	}

	return &wf, nil
}

func (a *API) verifyWebhook(c *gin.Context, wf *core.Workflow) error {
	secret, ok := wf.Trigger.Config["secret"].(string)
	if !ok || secret == "" {
		return nil // No secret configured
	}

	// GitLab Check
	gitlabToken := c.GetHeader("X-Gitlab-Token")
	if gitlabToken != "" {
		if gitlabToken != secret {
			return fmt.Errorf("invalid gitlab token")
		}
		return nil
	}

	// Get request signature (GitHub-style example)
	signature := c.GetHeader("X-Hub-Signature-256")
	if signature == "" {
		return fmt.Errorf("missing signature")
	}

	// Read raw body
	body, err := c.GetRawData()
	if err != nil {
		return fmt.Errorf("failed to read body")
	}

	// Verify HMAC signature
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expectedMAC := hex.EncodeToString(mac.Sum(nil))
	expectedSignature := fmt.Sprintf("sha256=%s", expectedMAC)

	if !hmac.Equal([]byte(signature), []byte(expectedSignature)) {
		return fmt.Errorf("invalid signature")
	}

	return nil
}

func (a *API) parseWebhookPayload(c *gin.Context) (interface{}, error) {
	contentType := c.GetHeader("Content-Type")

	// Read raw body again after verification
	body, err := c.GetRawData()
	if err != nil {
		return nil, err
	}

	log.Printf("[Webhook Payload Log] ContentType: %s, Body: %s", contentType, string(body))

	switch {
	case strings.Contains(contentType, "application/json"):
		var jsonData interface{}
		if err := json.Unmarshal(body, &jsonData); err != nil {
			log.Printf("[Webhook Payload Log] JSON unmarshal error: %v", err)
			return nil, err
		}
		return jsonData, nil
	case strings.Contains(contentType, "application/x-www-form-urlencoded"):
		values, err := url.ParseQuery(string(body))
		if err != nil {
			log.Printf("[Webhook Payload Log] URL parse error: %v", err)
			return nil, err
		}
		return values, nil
	default:
		// Return raw body as string
		return string(body), nil
	}
}
