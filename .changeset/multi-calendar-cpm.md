---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
---

Critical path analysis can schedule each task on its assignee's calendar.

- `calculateCriticalPath(projectId, { calendars: 'assignee' })`, or `criticalPathCalendars: 'assignee'` on the engine, schedules each task on the assignee's `schedule` (from `users`), then the task team's schedule, then the project calendar. Passes run on dates, so a Friday-off assignee pushes their successors to Monday. Slack is measured in each task's own working hours, and each task reports the `scheduleId` it used. Without a project start date, assignee mode starts today (UTC midnight). Calendars are evaluated in UTC.
- The default `'project'` mode is unchanged.
- REST: `GET /projects/:id/critical-path?calendars=assignee` (unknown values return 400). Client: `calculateCriticalPath(id, { calendars })`. MCP: a `calendars` argument on `calculate_critical_path`.
- New calendar helpers `nextWorkingTime` and `previousWorkingTime`, and `resolveTaskSchedule`.
