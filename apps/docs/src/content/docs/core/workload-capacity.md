---
title: Workload & Capacity Distribution
description: Headless time-series aggregation for team capacity planning, stacked area charts, and organic D3 streamgraphs.
---

When managing agile engineering sprints or studio project allocations, teams need to understand effort distribution across time, identify resource bottlenecks, and spot overallocation before deadlines slip.

**Critical Path** provides a headless workload and capacity distribution engine. Following the framework's core architectural principle, **chart rendering remains in consumer code** (via D3, Visx, Canvas, or pure SVG), while **time-series aggregation, effort spreading, and capacity calculations** are handled systematically by the library.

---

## 1. Architectural Model

```
+-----------------------------------------------------------------------------------------+
|                                    CRITICAL PATH CORE                                   |
|                                                                                         |
|  Tasks & Estimates  ──┐                                                                 |
|  Time Entries (Logs) ─┼──► calculateWorkloadDistribution() ──►  WorkloadDistribution    |
|  User/Team Capacity ──┘                                           - Contiguous Buckets  |
|                                                                   - Zero-filled series  |
|                                                                   - Capacity limits     |
|                                                                   - Utilization ratios  |
+-----------------------------------------------------------------------------------------+
                                           │
                                           ▼
+-----------------------------------------------------------------------------------------+
|                                CONSUMER RENDERING LAYER                                 |
|                                                                                         |
|  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐  |
|  │      D3 Streamgraph     │  │   Stacked Bar Chart     │  │  Team Heatmap / Table   │  |
|  │  (stackOffsetWiggle)    │  │   (Capacity Thresholds) │  │  (Overallocated Badges) │  |
|  └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘  |
+-----------------------------------------------------------------------------------------+
```

### Why Headless Streamgraphs?
Streamgraphs and stacked continuous visualizations have strict data requirements:
1. **Contiguous Time Buckets**: Missing days or weeks break curve interpolation.
2. **Tabular Zero-Filled Matrix**: Every bucket must have a numeric entry for every series key. If a team member has no logged or scheduled hours in a given week, the value must be `0`, never `undefined`, or D3's baseline offset algorithms (`d3.stackOffsetWiggle`) will evaluate to `NaN` and fail to render.
3. **Effort Spreading**: Tasks spanning multiple days or weeks need their estimated hours evenly distributed across the overlapping date boundaries.

---

## 2. Core Interfaces

```ts
type WorkloadInterval = 'day' | 'week' | 'month';
type WorkloadGroupBy = 'assignee' | 'team' | 'taskType' | 'priority' | 'status';
type WorkloadMetric = 'scheduled' | 'logged' | 'remaining' | 'blended';

interface WorkloadBucket {
  date: string;               // ISO date of bucket start (e.g. "2026-09-07")
  timestamp: number;          // Epoch milliseconds for D3 time scales
  totalHours: number;         // Sum of hours in this bucket
  values: Record<string, number>; // Dimension key -> hours (guaranteed non-empty, 0-filled)
  capacity?: Record<string, number>; // Dimension key -> capacity threshold
  totalCapacity?: number;     // Aggregate capacity for all series
  utilizationRatio?: number;  // totalHours / totalCapacity
}

interface WorkloadDistribution {
  projectId?: string;
  startDate: string;
  endDate: string;
  interval: WorkloadInterval;
  groupBy: WorkloadGroupBy;
  metric: WorkloadMetric;
  seriesKeys: string[];              // Sorted unique identifiers (e.g. ['u1', 'u2'])
  seriesLabels: Record<string, string>; // Human-readable names (e.g. { u1: 'Alice' })
  buckets: WorkloadBucket[];
  totalHours: number;
  totalCapacity?: number;
  averageUtilization?: number;
}
```

---

## 3. Metric Modes

- **`scheduled`**: Takes task estimates (`estimatedHours` or `estimatedDurationMinutes`) and spreads them linearly across the task's active calendar duration (`plannedStartDate` to `dueDate`).
- **`logged`**: Sums empirical `timeEntries` into the exact bucket corresponding to their `loggedAt` timestamp.
- **`remaining`**: Excludes completed or canceled tasks, calculating `max(0, estimatedHours - loggedHours)`.
- **`blended`**: Past buckets show empirical logged time from `timeEntries`, while current and future buckets spread the remaining scheduled effort.

---

## 4. Capacity & Utilization Modeling

You can set weekly capacity hours per user or team:

```ts
interface User {
  id: string;
  name: string;
  weeklyCapacityHours?: number; // e.g. 35 for 0.8 FTE, 40 for 1.0 FTE
}

interface Team {
  id: string;
  name: string;
  memberIds: string[];
  weeklyCapacityHours?: number; // e.g. 160 for a 4-person team
}
```

When generating buckets:
- For `week`: `capacity = weeklyCapacityHours`.
- For `day`: `capacity = weeklyCapacityHours / 5` (5-day standard working week).
- For `month`: normalized according to the days in the calendar month.
- Utilization ratios (`totalHours / totalCapacity`) are automatically calculated, allowing you to highlight overallocated buckets (ratio > `1.0`).

---

## 5. React Integration

```tsx
import { useWorkloadDistribution } from '@critical-path/react';

export function TeamWorkloadStreamgraph({ projectId }: { projectId: string }) {
  const {
    buckets,
    seriesKeys,
    seriesLabels,
    interval,
    setInterval,
    loading
  } = useWorkloadDistribution(projectId, {
    interval: 'week',
    groupBy: 'assignee',
    metric: 'blended'
  });

  if (loading) return <div>Calculating workload distribution...</div>;

  return (
    <div>
      <div className="controls">
        <button onClick={() => setInterval('day')}>Day</button>
        <button onClick={() => setInterval('week')}>Week</button>
        <button onClick={() => setInterval('month')}>Month</button>
      </div>

      <MyStreamgraphVisualizer
        data={buckets}
        keys={seriesKeys}
        labels={seriesLabels}
      />
    </div>
  );
}
```

---

## 6. Svelte 5 Integration

```svelte
<script lang="ts">
  import { useCriticalPathClient } from '@critical-path/svelte';
  import { createWorkloadState } from '@critical-path/svelte';

  const client = useCriticalPathClient();
  const workloadState = createWorkloadState(client, 'proj_123', {
    interval: 'week',
    groupBy: 'team',
    metric: 'blended'
  });

  $effect(() => {
    workloadState.fetch();
  });
</script>

{#if workloadState.loading}
  <p>Loading capacity...</p>
{:else}
  <h3>Average Utilization: {Math.round((workloadState.averageUtilization || 0) * 100)}%</h3>
  <Streamgraph
    data={workloadState.buckets}
    keys={workloadState.seriesKeys}
    labels={workloadState.seriesLabels}
  />
{/if}
```

---

## 7. D3 Streamgraph Recipe

Here is a complete pattern for rendering a streamgraph using D3 in your UI:

```ts
import * as d3 from 'd3';
import type { WorkloadDistribution } from '@critical-path/core';

export function renderStreamgraph(svgElement: SVGSVGElement, distribution: WorkloadDistribution) {
  const { buckets, seriesKeys } = distribution;
  const width = 800;
  const height = 400;

  // 1. Stack the buckets using D3 wiggle baseline
  const stack = d3.stack<any>()
    .keys(seriesKeys)
    .value((d, key) => d.values[key] || 0)
    .offset(d3.stackOffsetWiggle);

  const series = stack(buckets);

  // 2. Set up Scales
  const xScale = d3.scaleTime()
    .domain(d3.extent(buckets, (d) => new Date(d.timestamp)) as [Date, Date])
    .range([0, width]);

  const yMin = d3.min(series, (layer) => d3.min(layer, (d) => d[0])) || 0;
  const yMax = d3.max(series, (layer) => d3.max(layer, (d) => d[1])) || 0;

  const yScale = d3.scaleLinear()
    .domain([yMin, yMax])
    .range([height, 0]);

  const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
    .domain(seriesKeys);

  // 3. Define the smooth curved area
  const area = d3.area<any>()
    .x((d) => xScale(new Date(d.data.timestamp)))
    .y0((d) => yScale(d[0]))
    .y1((d) => yScale(d[1]))
    .curve(d3.curveBasis);

  // 4. Render paths into SVG
  const svg = d3.select(svgElement);
  svg.selectAll('path')
    .data(series)
    .join('path')
    .attr('d', area)
    .attr('fill', (d) => colorScale(d.key))
    .attr('opacity', 0.85);
}
```

---

## 8. MCP Tool Usage

Autonomous AI agents can query workload distribution directly through the Model Context Protocol:

```json
{
  "name": "get_workload_distribution",
  "arguments": {
    "projectId": "proj_123",
    "interval": "week",
    "groupBy": "assignee",
    "metric": "blended"
  }
}
```
