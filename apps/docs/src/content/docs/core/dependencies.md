---
title: Dependencies & Critical Path Method
description: How Critical Path models task dependencies as a DAG, detects circular loops, and computes the critical path duration.
---

Task dependencies in Critical Path are modeled as a **Directed Acyclic Graph (DAG)**.

---

## Adding Dependencies

A dependency indicates that a **target task** depends on a **source task** (the prerequisite).

```typescript
await engine.addDependency({
  projectId: 'proj-1',
  sourceTaskId: 'task-wireframes',
  targetTaskId: 'task-frontend-ui',
  type: 'finish_to_start',
  lagHours: 0,
});
```

---

## Cycle Detection & Prevention

Circular dependencies cause infinite loops and project deadlocks (e.g. Task A depends on Task B, which depends on Task A).

Critical Path performs an automatic topological cycle check before adding or updating any dependency edge:

```typescript
try {
  // If task-a already depends on task-b:
  await engine.addDependency({
    projectId: 'proj-1',
    sourceTaskId: 'task-b',
    targetTaskId: 'task-a',
    type: 'finish_to_start',
  });
} catch (error) {
  console.error(error.message);
  // Throws: "Circular dependency detected: task-a -> task-b -> task-a"
}
```

---

## The Critical Path Method (CPM)

The **Critical Path** is the sequence of dependent tasks that determines the minimum total time required to complete the project. Any delay on the critical path directly pushes back the project deadline.

### Algorithm Steps:
1. **Forward Pass**: Calculates the earliest possible start time (`earlyStart`) and finish time (`earlyFinish`) for every task.
2. **Backward Pass**: Calculates the latest allowable start time (`lateStart`) and finish time (`lateFinish`) without delaying project completion.
3. **Total Slack**: The difference between `lateFinish` and `earlyFinish` (`slack = lateFinish - earlyFinish`).
4. **Critical Path Identification**: Tasks with `totalSlack === 0` form the Critical Path.

```typescript
const result = await engine.calculateCriticalPath('proj-1');

console.log(`Project Completion Time: ${result.totalDurationHours} hours`);
console.log(`Bottleneck Tasks:`, result.criticalTaskIds);
```
