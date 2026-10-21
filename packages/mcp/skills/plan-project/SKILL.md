---
name: plan-project
description: Turn a goal, brief or feature list into a Critical Path project with deliverables, estimated and prioritized tasks, and the dependencies between them. Use when the user asks to plan, scope or break down work.
---

# Plan a project

Turn a goal into deliverables (dated outcomes), tasks (estimated units of work) and dependencies (which task waits for which) the scheduler can use.

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
  - lists the tasks it must wait for (its dependencies). Only add a dependency when the work truly cannot start earlier; every extra one lengthens the schedule.
- Note anything you assumed (team size, dates, scope) as a question.

Ask the user to confirm or adjust before creating anything. A plan is cheap to change in chat and tedious to change once created.

## 3. Create it

1. Create tasks with `create_task` (`projectId`, `title`, `description` with acceptance criteria, `estimatedHours`, `priority`, `assigneeId` if known). Leave `status` out so tasks start in the workflow's default status.
2. Create each deliverable with `create_deliverable`, passing the ids of its tasks in `taskIds`.
3. Add each dependency from your plan with `add_dependency`: `taskId` is the task that waits, `dependsOnTaskId` the task that must finish first. Use the ids `create_task` returned. If one is refused as circular, your plan has a loop: fix the order with the user instead of retrying.
4. If the project already had tasks, check what they wait for with `get_task` and `includeDependencies: true` before linking new work to them.

## 4. Check the result

1. Call `calculate_critical_path` for the project and report the forecast `projectEndDate` and the `criticalTaskIds` (by title). If every task is critical or the end date looks too early, a dependency is probably missing or reversed.
2. If the end date misses a deliverable's due date, say so and suggest what to cut, split or reassign. The `analyze-schedule` skill covers this in depth.

## Guardrails

- Never invent user ids for `assigneeId`. Leave tasks unassigned unless the user named the person and you have their id.
- Keep the plan to what the user asked for; propose extra work as suggestions, not tasks.
