---
title: Task Metrics & Progress Inference
description: Inferred actuals, actuals vs estimate reality delta, earned value management (EVM), and time-series progress history.
---

Task progress in real-world engineering and creative production is rarely a simple manual slider. Team members forget to stamp actual start/end dates, estimates diverge from logged effort, and tasks advance in non-linear bursts.

**Critical Path** provides a comprehensive task metrics engine that computes **inferred actuals**, **multi-dimensional variance**, **smart progress inference**, **Earned Value Management (EVM)**, and **time-series progress curve profiling**.

---

## 1. Inferred Actuals & Lifecycle Auto-Stamping

When tasks transition across workflow statuses, Critical Path automatically captures operational timestamps without requiring manual data entry:

```
+-----------------------------------------------------------------------------+
| Task Lifecycle Event                     Inferred Actual Attribute          |
+-----------------------------------------------------------------------------+
| Task moved to `in_progress` (first time) ───► actualStartDate stamped       |
| Task moved to `completed`                ───► actualEndDate stamped         |
| Task re-opened (completed -> in_progress)───► actualEndDate reset to null   |
+-----------------------------------------------------------------------------+
```

### Fallback Inference
If a task is completed or in progress but has no explicit `actualStartDate` or `actualEndDate`:
- **`actualStartDate`**: Inferred from the earliest `task.transition` activity log moving the task to `in_progress`, or falling back to `task.createdAt`.
- **`actualEndDate`**: Inferred from the latest `task.transition` activity log moving the task to `completed`, or falling back to `task.updatedAt`.
- **`activeWorkingHours`**: Calculated as the elapsed business/working duration between `actualStartDate` and `actualEndDate` (or current time if still in progress).

---

## 2. Actuals vs. Estimate (Reality Delta)

Every task evaluates the difference between planned expectations and empirical reality:

```ts
interface RealityDelta {
  estimatedHours: number;
  loggedHours: number;
  varianceHours: number;       // loggedHours - estimatedHours
  effortVarianceHours: number; // loggedHours - estimatedHours
  durationVarianceHours?: number; // activeWorkingHours - plannedDurationHours
  accuracyRatio?: number;      // loggedHours / estimatedHours
  isOverdue: boolean;
  isOverEstimate: boolean;
}
```

- **Effort Variance**: Positive when more hours were logged than budgeted; negative when under budget.
- **Accuracy Ratio**: An accuracy ratio of $1.0$ indicates perfect alignment; $> 1.0$ indicates scope creep or underestimation; $< 1.0$ indicates efficiency or overestimation.
- **Overdue Detection**: Automatically flags tasks whose planned `dueDate` has passed while `semanticStatus !== 'completed'`.

---

## 3. Smart Progress Inference

Tasks can have multiple indicators of completion. Critical Path resolves progress via a deterministic waterfall:

```
┌────────────────────────────────────────────────────────┐
│ 1. Explicit Progress Slider (> 0%)                     │
│    User or external system explicitly set progress     │
└───────────────────────────┬────────────────────────────┘
                            │ (if zero or undefined)
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. Checklist / Todo Ratio                              │
│    Completed todos / Total todos                       │
└───────────────────────────┬────────────────────────────┘
                            │ (if no checklist)
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Effort Logged vs. Estimate                          │
│    min(100, (loggedHours / estimatedHours) * 100)      │
└───────────────────────────┬────────────────────────────┘
                            │ (if no time logged)
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Schedule Elapsed Duration                           │
│    Elapsed time between planned start and due date     │
└────────────────────────────────────────────────────────┘
```

The resulting `TaskProgressInference` object details both the resolved percentage and the exact breakdown:

```ts
interface TaskProgressInference {
  progressPercentage: number; // 0 - 100
  source: 'explicit' | 'todos' | 'time_effort' | 'schedule_elapsed' | 'default';
  isExplicit: boolean;
  breakdown: {
    explicitProgress?: number;
    todoProgress?: number;
    effortProgress?: number;
    scheduleProgress?: number;
  };
}
```

---

## 4. Earned Value Management (EVM)

Critical Path applies standard project management EVM formulas at the individual task level:

$$\text{Planned Value } (PV) = \text{Budgeted Effort (Hours)}$$
$$\text{Earned Value } (EV) = PV \times \frac{\text{Progress } \%}{100}$$
$$\text{Actual Cost } (AC) = \text{Logged Effort (Hours)}$$
$$\text{Cost Variance } (CV) = EV - AC$$
$$\text{Schedule Variance } (SV) = EV - PV$$
$$\text{Cost Performance Index } (CPI) = \frac{EV}{AC}$$
$$\text{Schedule Performance Index } (SPI) = \frac{EV}{PV}$$

---

## 5. Time-Series Progress History & Curve Profiles

By replaying activity logs and status changes, Critical Path reconstructs historical progress snapshots:

```ts
interface TaskProgressHistoryPoint {
  timestamp: string;
  progress: number;
  status: TaskStatus;
  semanticStatus: SemanticStatus;
  action: string;
}
```

### Curve Shape Classification
Using piecewise linear interpolation across quartile checkpoints ($t_{25\%}, t_{50\%}, t_{75\%}$), the engine classifies the task's trajectory into one of five profiles:

- **`linear`**: Steady, uniform velocity throughout the task lifecycle.
- **`s_curve`**: Slow start, rapid acceleration during the middle phase, tapering off at completion.
- **`early_surge`**: Rapid initial velocity (front-loaded progress) with long tail of refinement.
- **`late_rush`**: Little initial activity followed by a steep spike near the deadline.
- **`stalled`**: Active task that has flatlined or made no forward progress over recent activity windows.

---

## 6. Accessing Task Metrics

### Core Engine
```ts
import { CriticalPathEngine, SQLiteStore } from '@critical-path/core';

const engine = new CriticalPathEngine({ store: new SQLiteStore({ filename: 'app.db' }) });

const metrics = await engine.getTaskMetrics('task-123');
const history = await engine.getTaskProgressHistory('task-123');
```

### REST API
```http
GET /api/critical-path/tasks/:id/metrics
GET /api/critical-path/tasks/:id/progress-history
```

### Client SDK
```ts
import { CriticalPathClient } from '@critical-path/client';

const client = new CriticalPathClient({ baseUrl: 'http://localhost:3000/api/critical-path' });

const metrics = await client.getTaskMetrics('task-123');
const history = await client.getTaskProgressHistory('task-123');
```

### React Hook
```tsx
import { useTaskMetrics } from '@critical-path/react';

function TaskAnalyticsWidget({ taskId }: { taskId: string }) {
  const { metrics, history, progress, evm, curveProfile, loading } = useTaskMetrics(taskId);

  if (loading) return <div>Analyzing task metrics...</div>;
  if (!metrics) return <div>No metrics available</div>;

  return (
    <div className="metrics-card">
      <h3>Progress: {progress?.progressPercentage}% ({progress?.source})</h3>
      <p>Curve Profile: {curveProfile}</p>
      <p>Cost Performance Index (CPI): {evm?.costPerformanceIndex.toFixed(2)}</p>
      <p>Effort Variance: {metrics.realityDelta.effortVarianceHours}h</p>
    </div>
  );
}
```

### Svelte 5 Runes
```svelte
<script lang="ts">
  import { createTaskMetricsState } from '@critical-path/svelte';
  import { client } from './client';

  let { taskId } = $props<{ taskId: string }>();
  const state = createTaskMetricsState(client, taskId);

  $effect(() => {
    state.fetchAll();
  });
</script>

{#if state.loading}
  <p>Loading metrics...</p>
{:else if state.metrics}
  <div>
    <h4>Earned Value (EV): {state.evm?.earnedValue}h</h4>
    <p>Curve: {state.curveProfile}</p>
  </div>
{/if}
```

### Model Context Protocol (MCP)
Agents can inspect metrics and progress history using native MCP tools:
- `get_task_metrics({ taskId: '...' })`
- `get_task_progress_history({ taskId: '...' })`
