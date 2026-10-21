---
name: triage-tasks
description: Review new, unprioritized or stale tasks and set priority, estimate, tags and blocked state consistently. Use when the user asks to triage, groom or clean up a backlog.
---

# Triage tasks

Make every task in scope actionable: a clear title, a priority, an estimate and an honest blocked state.

## 1. Gather the tasks

1. Get the `projectId` with `list_projects` if you do not have it, then `get_project` to learn the workflow status keys.
2. Call `list_tasks` with filters that match the request, for example:
   - untriaged: `priority: "none"`;
   - a backlog: `status` set to the backlog key from the workflow;
   - one person's work: `assigneeId`.
   Page with `nextCursor` until it is empty, or stop at a sensible batch (about 25) and say how many remain.
3. For tasks whose description is thin or which look blocked, read the discussion with `list_comments`.

## 2. Decide, task by task

| Field | Rule |
| --- | --- |
| `priority` | `urgent`: blocks other people now or a live problem. `high`: needed for the next deliverable. `medium`: planned work. `low`: nice to have. Reserve `urgent` for a handful of tasks. |
| `estimatedHours` | Effort in hours. If a task is over about 24 hours, propose splitting it instead of estimating it. |
| `tags` | Reuse tags already used in the project; do not invent a new scheme. |
| `isBlocked` / `blockedReason` | Blocked only when work cannot continue; the reason names what it waits for. |
| title | Starts with a verb and says the outcome. Rewrite only when it is unclear. |

Flag likely duplicates (same outcome, different words) instead of deleting them.

## 3. Propose, then apply

1. Show the user a table: task title, current values, proposed values, one-line reason.
2. After the user approves (all or some), apply each change with `update_task`, passing only the fields that change.
3. For any non-obvious change, record why with `add_comment` on the task.

## Guardrails

- Do not change `status` or `assigneeId` during triage unless the user asked for it.
- Never call `delete_task` during triage. Suggest canceling duplicates and let the user decide.
