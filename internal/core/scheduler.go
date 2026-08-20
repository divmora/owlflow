package core

import (
	"fmt"
	"strings"
	"time"

	"github.com/robfig/cron/v3"
)

type Scheduler struct {
	cron      *cron.Cron
	workflows map[string]*Workflow
	ExecuteFn func(*Workflow)
}

func NewScheduler() *Scheduler {
	return &Scheduler{
		cron:      cron.New(cron.WithSeconds()), // Allow seconds precision
		workflows: make(map[string]*Workflow),
	}
}

func (s *Scheduler) Start() {
	s.cron.Start()
}

func (s *Scheduler) Stop() {
	s.cron.Stop()
}

func (s *Scheduler) AddWorkflow(wf *Workflow) error {
	if wf.Trigger.Type != TriggerSchedule {
		return nil
	}

	if wf.Status != StatusActive {
		return nil
	}

	// Parse cron schedule
	cronExpr, ok := wf.Trigger.Config["cron"].(string)
	if !ok || cronExpr == "" {
		return fmt.Errorf("missing cron expression for scheduled workflow")
	}

	// Get timezone
	if tz, ok := wf.Trigger.Config["timezone"].(string); ok && tz != "" {
		if _, err := time.LoadLocation(tz); err != nil {
			return fmt.Errorf("invalid timezone: %w", err)
		}
		if !strings.HasPrefix(cronExpr, "CRON_TZ=") && !strings.HasPrefix(cronExpr, "TZ=") {
			cronExpr = fmt.Sprintf("CRON_TZ=%s %s", tz, cronExpr)
		}
	}

	// Add to cron
	_, err := s.cron.AddFunc(cronExpr, func() {
		s.ExecuteFn(wf)
	})

	return err
}
