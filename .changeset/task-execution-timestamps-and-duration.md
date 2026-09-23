---
"@critical-path/core": minor
---

Add task execution timestamps and cumulative in-progress duration tracking:
- Introduce `actualDurationSeconds` and `inProgressSince` to `Task` and `TaskEntity`
- Automatically timestamp `actualStartDate` (retaining earliest) and begin session timer when transitioning to `in_progress`
- Automatically accumulate duration delta into `actualDurationSeconds` when leaving `in_progress` (pausing/completing)
- Automatically timestamp `actualEndDate` when entering `completed` or `canceled`, and reset `actualEndDate` to `undefined` upon reopening
- Mutually synchronize manual edits between `actualDurationSeconds` and `actualHours`
- Export `formatTaskDuration(seconds, options)` with dynamic scoping (`< 120s`, `< 1 day`, `>= 1 day`)
- Add `calendarDurationHours` and `actualDurationSeconds` to `TaskInferredActuals`
