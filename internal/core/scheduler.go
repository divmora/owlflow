package core

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
)

type Scheduler struct {
	cron      *cron.Cron
	workflows map[string]*Workflow
	entryIDs  map[string]cron.EntryID
	mu        sync.RWMutex
	ExecuteFn func(*Workflow)
}

func NewScheduler() *Scheduler {
	parser := cron.NewParser(
		cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor,
	)
	return &Scheduler{
		cron:      cron.New(cron.WithParser(parser)),
		workflows: make(map[string]*Workflow),
		entryIDs:  make(map[string]cron.EntryID),
	}
}

func (s *Scheduler) Start() {
	s.cron.Start()
}

func (s *Scheduler) Stop() {
	s.cron.Stop()
}

func (s *Scheduler) AddWorkflow(wf *Workflow) error {
	if wf == nil {
		return fmt.Errorf("workflow cannot be nil")
	}

	if wf.Trigger.Type != TriggerSchedule {
		return nil
	}

	if wf.Status != StatusActive {
		return nil
	}

	if wf.Trigger.Config == nil {
		return fmt.Errorf("missing trigger config for scheduled workflow")
	}

	// Parse cron schedule
	cronExpr, ok := wf.Trigger.Config["cron"].(string)
	if !ok || strings.TrimSpace(cronExpr) == "" {
		return fmt.Errorf("missing cron expression for scheduled workflow")
	}
	cronExpr = strings.TrimSpace(cronExpr)

	// Get timezone
	if tz, ok := wf.Trigger.Config["timezone"].(string); ok && strings.TrimSpace(tz) != "" {
		tz = strings.TrimSpace(tz)
		if _, err := time.LoadLocation(tz); err != nil {
			return fmt.Errorf("invalid timezone: %w", err)
		}
		if !strings.HasPrefix(cronExpr, "CRON_TZ=") && !strings.HasPrefix(cronExpr, "TZ=") {
			cronExpr = fmt.Sprintf("CRON_TZ=%s %s", tz, cronExpr)
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// If already registered, remove old schedule first
	if existingEntryID, exists := s.entryIDs[wf.ID]; exists {
		s.cron.Remove(existingEntryID)
		delete(s.entryIDs, wf.ID)
		delete(s.workflows, wf.ID)
	}

	// Add to cron
	entryID, err := s.cron.AddFunc(cronExpr, func() {
		if s.ExecuteFn != nil {
			s.ExecuteFn(wf)
		}
	})
	if err != nil {
		return err
	}

	s.workflows[wf.ID] = wf
	s.entryIDs[wf.ID] = entryID

	return nil
}

func (s *Scheduler) RemoveWorkflow(workflowID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	entryID, exists := s.entryIDs[workflowID]
	if !exists {
		return false
	}

	s.cron.Remove(entryID)
	delete(s.entryIDs, workflowID)
	delete(s.workflows, workflowID)
	return true
}

func (s *Scheduler) GetWorkflow(workflowID string) (*Workflow, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	wf, exists := s.workflows[workflowID]
	return wf, exists
}

func (s *Scheduler) ListWorkflows() []*Workflow {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]*Workflow, 0, len(s.workflows))
	for _, wf := range s.workflows {
		list = append(list, wf)
	}
	return list
}
