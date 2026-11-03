package monitor

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"

	"conx/pkg/database"
)

// VMHealth represents the real-time health probe result for a virtual machine
type VMHealth struct {
	VMID      string    `json:"vmId"`
	Status    string    `json:"status"` // online, degraded, offline
	LatencyMs int64     `json:"latencyMs"`
	LastCheck time.Time `json:"lastCheck"`
	Error     string    `json:"error,omitempty"`
}

// FleetSummary aggregates high-level telemetry across all VMs
type FleetSummary struct {
	TotalNodes    int   `json:"totalNodes"`
	OnlineNodes   int   `json:"onlineNodes"`
	DegradedNodes int   `json:"degradedNodes"`
	OfflineNodes  int   `json:"offlineNodes"`
	AvgLatencyMs  int64 `json:"avgLatencyMs"`
}

// Poller runs periodic health probes on configured virtual machines
type Poller struct {
	ctx          context.Context
	cancel       context.CancelFunc
	storage      *database.Storage
	onUpdate     func(map[string]VMHealth)
	interval     time.Duration
	mu           sync.RWMutex
	latestHealth map[string]VMHealth
}

// NewPoller initializes a new VM health poller
func NewPoller(ctx context.Context, storage *database.Storage, onUpdate func(map[string]VMHealth)) *Poller {
	pollCtx, cancel := context.WithCancel(ctx)
	return &Poller{
		ctx:          pollCtx,
		cancel:       cancel,
		storage:      storage,
		onUpdate:     onUpdate,
		interval:     20 * time.Second,
		latestHealth: make(map[string]VMHealth),
	}
}

// Start begins the periodic background health checking loop
func (p *Poller) Start() {
	go func() {
		// Run initial check after 2 seconds
		select {
		case <-time.After(2 * time.Second):
			p.ProbeAll()
		case <-p.ctx.Done():
			return
		}

		ticker := time.NewTicker(p.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				p.ProbeAll()
			case <-p.ctx.Done():
				return
			}
		}
	}()
}

// Stop cleanly terminates the poller background goroutine
func (p *Poller) Stop() {
	if p.cancel != nil {
		p.cancel()
	}
}

// ProbeVM checks connectivity to a single VM via TCP handshake
func (p *Poller) ProbeVM(vm database.VirtualMachine) VMHealth {
	port := vm.Port
	if port == 0 {
		port = 22
	}
	addr := net.JoinHostPort(vm.Host, fmt.Sprintf("%d", port))

	start := time.Now()
	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	latency := time.Since(start).Milliseconds()

	health := VMHealth{
		VMID:      vm.ID,
		LastCheck: time.Now(),
	}

	if err != nil {
		health.Status = "offline"
		health.LatencyMs = 0
		health.Error = err.Error()
	} else {
		_ = conn.Close()
		health.LatencyMs = latency
		if latency > 250 {
			health.Status = "degraded"
		} else {
			health.Status = "online"
		}
	}

	return health
}

// ProbeAll executes concurrent health probes across all configured VMs
func (p *Poller) ProbeAll() map[string]VMHealth {
	if p.storage == nil {
		return nil
	}

	vms, err := p.storage.ListVMs()
	if err != nil || len(vms) == 0 {
		return nil
	}

	results := make(map[string]VMHealth)
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, vm := range vms {
		wg.Add(1)
		go func(v database.VirtualMachine) {
			defer wg.Done()
			h := p.ProbeVM(v)

			mu.Lock()
			results[v.ID] = h
			mu.Unlock()

			// Update persistent status in SQLite
			v.Status = h.Status
			v.LastLatencyMs = h.LatencyMs
			_ = p.storage.SaveVM(v)
		}(vm)
	}

	wg.Wait()

	p.mu.Lock()
	p.latestHealth = results
	p.mu.Unlock()

	if p.onUpdate != nil {
		p.onUpdate(results)
	}

	return results
}

// GetSummary calculates high-level fleet metrics
func (p *Poller) GetSummary() FleetSummary {
	p.mu.RLock()
	defer p.mu.RUnlock()

	total := len(p.latestHealth)
	if total == 0 {
		return FleetSummary{}
	}

	online := 0
	degraded := 0
	offline := 0
	var sumLatency int64

	for _, h := range p.latestHealth {
		switch h.Status {
		case "online":
			online++
			sumLatency += h.LatencyMs
		case "degraded":
			degraded++
			sumLatency += h.LatencyMs
		default:
			offline++
		}
	}

	var avgLatency int64
	responsive := online + degraded
	if responsive > 0 {
		avgLatency = sumLatency / int64(responsive)
	}

	return FleetSummary{
		TotalNodes:    total,
		OnlineNodes:   online,
		DegradedNodes: degraded,
		OfflineNodes:  offline,
		AvgLatencyMs:  avgLatency,
	}
}
