---
title: Ladder of Abstraction & CPM
description: Ladder of Abstraction applied to timelines, Gantt charts, and Critical Path Method (CPM) analysis.
---

The principle of **moving up and down the ladder of abstraction** emphasizes enabling users to smoothly transition between high-level macro summaries and concrete, granular ground truth without losing context or changing views.

In **Critical Path**, this is materialized as a multi-scale timeline framework combining rigorous **Critical Path Method (CPM)** graph scheduling with tangible evidence grounding.

---

## The Three Rungs

```
+------------------------------------------------------------------------+
| 1. Macro Rung (High Abstraction - Bird's Eye View)                    |
|    - Project & Phase Envelopes (duration, progress %, on_track/at_risk)|
|    - High-level executive questions: "Are we on track? When is launch?"|
+-----------------------------------▲------------------------------------+
                                    │
                                    ▼
+------------------------------------------------------------------------+
| 2. Standard Rung (Middle Abstraction - CPM Gantt Schedule)            |
|    - Directed Acyclic Graph (DAG) topological sorting                  |
|    - Early Start (ES), Early Finish (EF), Late Start (LS), Late Finish |
|    - Total Float / Slack & Zero-Float Bottleneck Identification        |
|    - Tactical questions: "How do pieces fit together? Where is danger?"|
+-----------------------------------▲------------------------------------+
                                    │
                                    ▼
+------------------------------------------------------------------------+
| 3. Concrete Rung (Low Abstraction - Tangible Ground Truth)            |
|    - Physical Deliverables (format specs, resolutions, output URLs)   |
|    - Real-world Attachments & File Assets (render frames, Figma, docs) |
|    - Daily Effort Distributions & Timesheet Work Logs                  |
|    - Reality Delta: Planned vs. Actual duration & schedule drift       |
|    - Ground-truth questions: "What was actually built? Show me output!"|
+------------------------------------------------------------------------+
```

### 1. Macro Rung: Phase Rollups & High-Level Health
Answers executive questions: *Are we on track? What is the projected completion?*
- Automatic phase synthesis grouped by parent tasks, deliverable containers, or sprints.
- Health states: `on_track`, `at_risk`, `delayed`, `completed`.
- Total estimated hours vs. logged hours, overall percentage progress, and bottleneck critical path duration.

### 2. Standard Rung: Topological CPM Gantt
Answers tactical questions: *How do parts connect, and where are the real bottlenecks?*
- Graph topological sort of task dependencies.
- Forward pass computing **Early Start ($ES$)** and **Early Finish ($EF$)**.
- Backward pass computing **Late Start ($LS$)** and **Late Finish ($LF$)**.
- **Total Slack / Float**: Identifies tasks where $\text{slack} = 0$ (the critical path).

### 3. Concrete Rung: Tangible Ground Truth & Reality Delta
Answers empirical questions: *What was actually built? Where is the real work?*
- Links tasks to concrete deliverables (render specs, resolution, output URLs).
- Aggregates file attachments and uploaded assets.
- Timesheet log breakdown by day (`dailyEffort`).
- **Reality Delta**: Calculates exact variance between planned estimates and actual logged hours (`hoursDelta`, `scheduleStatus`).

---

## Engine Usage

```typescript
import { CriticalPathEngine, SQLiteStore } from '@critical-path/core';

const engine = new CriticalPathEngine({
  store: new SQLiteStore({ filename: './projects.db' })
});

// Calculate CPM schedule and critical bottleneck tasks
const cpm = await engine.calculateCriticalPath('project_1');
console.log('Bottleneck tasks:', cpm.criticalTaskIds);
console.log('Total project duration:', cpm.totalDurationHours);

// Retrieve multi-scale timeline ladder
const ladder = await engine.getTimelineLadder('project_1', { level: 'all' });
console.log('Macro phase rollups:', ladder.macro?.phases);
console.log('Standard Gantt items:', ladder.standard?.tasks);
console.log('Concrete evidence:', ladder.concrete);

// Drill down into single task ladder slice
const taskLadder = await engine.getTaskLadder('task_123');
```

---

## Frontend Integration

### React (`@critical-path/react`)

```tsx
import { useTimelineLadder, useCriticalPath } from '@critical-path/react';

export function TimelineView({ projectId }: { projectId: string }) {
  const { ladder, level, setLevel, macro, standard, concrete } = useTimelineLadder(projectId);
  const { analysis } = useCriticalPath(projectId);

  return (
    <div>
      <div className="controls">
        <button onClick={() => setLevel('macro')}>Macro</button>
        <button onClick={() => setLevel('standard')}>Standard</button>
        <button onClick={() => setLevel('concrete')}>Concrete</button>
      </div>

      {macro && <div className="banner">Health: {macro.health}</div>}
      {standard && <div className="gantt">Tasks: {standard.tasks.length}</div>}
      {concrete && <div className="evidence">Ground Truth Evidence Loaded</div>}
    </div>
  );
}
```

### Svelte 5 (`@critical-path/svelte`)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createTimelineLadderState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const ladderState = createTimelineLadderState(client, 'proj_1');

  onMount(() => {
    ladderState.fetch();
  });
</script>

{#if ladderState.macro}
  <div class="macro">Status: {ladderState.macro.health}</div>
{/if}
```
