---
title: Dependencies & Critical Path Method
description: How Critical Path models task dependencies as a DAG, detects circular loops, and computes the critical path duration.
---

Task dependencies in Critical Path are modeled as a **Directed Acyclic Graph (DAG)**.

---

## Adding Dependencies

A dependency has two tasks and a type:

- `blocking`: `taskId` cannot start until `dependsOnTaskId` finishes. This is the edge the critical path, lifecycle state and auto-unblocking use.
- `relates_to`: an informational link. It never affects the schedule, never blocks, and never forms a cycle.

A `blocking` dependency can carry `lagHours`: working hours to wait after the other task finishes (negative for a lead). See [start constraints and lag](/core/calendars-and-schedules/#start-constraints-and-lag). Two links between the same tasks that differ only in lag are separate dependencies; the longer wait applies.

```typescript
// The frontend waits for the wireframes
await engine.addDependency({
  taskId: 'task-frontend-ui',
  dependsOnTaskId: 'task-wireframes',
  type: 'blocking'
});
```

Releases before 0.53 also had `blocked_by` (the same edge with the ids swapped). New `blocked_by` dependencies are rejected; records already stored with it are still read in the right direction. To migrate them, swap `taskId` and `dependsOnTaskId` and set `type: 'blocking'`.

---

## Cycle Detection & Prevention

Circular dependencies cause infinite loops and project deadlocks (e.g. Task A depends on Task B, which depends on Task A).

Critical Path checks every new `blocking` dependency against the existing scheduling edges before adding it:

```typescript
try {
  // task-a already waits for task-b, so task-b cannot wait for task-a
  await engine.addDependency({ taskId: 'task-b', dependsOnTaskId: 'task-a', type: 'blocking' });
} catch (error) {
  console.error(error.message);
  // Cannot add dependency from "task-b" to "task-a" because it would create a circular dependency cycle ...
}
```

`calculateCPM` is a pure function, so it can be handed cyclic data that never went through the engine. It still completes, scheduling the affected tasks in input order, and lists them in `cyclicTaskIds`; their dates are not reliable.

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

## Blocking and automatic unblocking

A task can be blocked in two independent ways:

- **By dependencies (derived).** `getTaskLifecycleState(taskId)` lists `blockingTaskIds`: upstream `blocking` tasks that are not completed or canceled. Nothing is stored for this; it is always computed from the graph.
- **By hand (stored).** `isBlocked` and `blockedReason` record a block the graph does not know about, such as "waiting on client sign-off". Only a person or your code clears them.

`isBlocked` in the lifecycle state is true when either applies.

When a task is completed or canceled, the engine publishes `task.unblocked` for each downstream task whose upstream tasks are now all completed or canceled, so it is free to start. The task itself is not changed: a manual block stays in place.

- Each task's status is read with its own project's status definitions, so dependencies across projects with different workflows work.
- Upstream tasks the caller cannot read still count, so nothing is announced early.
- Canceled upstream tasks count as satisfied, here, in lifecycle state and in critical path analysis.

Adding a dependency that already exists (same tasks and type) returns the existing one instead of creating a duplicate. Both tasks must exist.

