---
name: plan-project
description: Turn a goal, brief or feature list into a Critical Path project with deliverables and estimated, prioritized tasks. Use when the user asks to plan, scope or break down work.
---

# Plan a project

Turn a goal into deliverables (dated outcomes) and tasks (estimated units of work) the scheduler can use.

## 1. Find or create the project

1. Call `list_projects`. If a project already matches the goal, use it and read it with `get_project` to learn its workflow status keys and custom fields.
2. Only if none fits, and the user wants a new one, call `create_project` with a `name` and a short `key`.
3. Call `list_tasks` with the `projectId` and `list_deliverables` to see what already exists. Do not recreate it.

## 2. Draft the plan before writing anything

Break the goal down in your reply first and show it to the user:

- **Deliverables**: 2-6 outcomes someone could accept or reject, each with a due date if the user gave one.
- **Tasks** under each deliverable. Each task:
  - starts with a verb and is small enough for one person (about 2-24 hours);
  - has `estimatedHours` (effort, not elapsed time);
  - has a `priority`: `urgent` only for work that blocks others now, `high` for the critical outcome, `medium` by default, `low` for nice-to-haves;
  - lists the tasks it must wait for (its dependencies), so the schedule makes sense.
- Note anything you assumed (team size, dates, scope) as a question.

Ask the user to confirm or adjust before creating anything. A plan is cheap to change in chat and tedious to change once created.

## 3. Create it

1. Create tasks with `create_task` (`projectId`, `title`, `description` with acceptance criteria, `estimatedHours`, `priority`, `assigneeId` if known). Leave `status` out so tasks start in the workflow's default status.
2. Create each deliverable with `create_deliverable`, passing the ids of its tasks in `taskIds`.
3. Dependencies cannot be set through these tools. List the dependencies from your plan for the user (or the app) to add, or record them in each task's description as "Depends on: <task title>".

## 4. Check the result

1. Call `calculate_critical_path` for the project and report the forecast `projectEndDate` and the `criticalTaskIds` (by title).
2. If the end date misses a deliverable's due date, say so and suggest what to cut, split or reassign. The `analyze-schedule` skill covers this in depth.

## Guardrails

- Never invent user ids for `assigneeId`. Leave tasks unassigned unless the user named the person and you have their id.
- Keep the plan to what the user asked for; propose extra work as suggestions, not tasks.
