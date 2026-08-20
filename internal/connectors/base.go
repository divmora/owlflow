package connectors

type Connector interface {
	Execute(action string, params map[string]interface{}) (interface{}, error)
	Validate(params map[string]interface{}) error
}

var Registry = map[string]Connector{
	"internal": &InternalConnector{},
	"http":     &HTTPConnector{},
	"gitlab":   &GitLabConnector{},
	"jira":     &JiraConnector{},
	"logger": &LoggerConnector{
		MinLevel: "info", // Set default minimum level
	},
	//"slack": &SlackConnector{},
}
