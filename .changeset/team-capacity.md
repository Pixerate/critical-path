---
"@critical-path/core": minor
---

Team capacity pools in resource levelling.

- New `Team.headcount`: how many people the team can put on work at once. Default: its member count.
- When levelling, team-only tasks use slots in their team's pool, and tasks assigned to members also use slots in every team the member belongs to. Teams with no members and no `headcount` stay unconstrained. A delayed task is linked to the task whose finish freed its capacity, so slack follows the chain that caused the delay.
- **BREAKING (types):** `Overallocation.assigneeId` is optional. Entries have `teamId` for pools and a new `capacity` field (1 for a person, headcount for a team).
- Assignee-mode analysis only uses teams from the project's tenant.
