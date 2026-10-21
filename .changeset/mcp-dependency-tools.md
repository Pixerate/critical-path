---
'@critical-path/mcp': minor
---

Agents can now order work. New `add_dependency` and `remove_dependency` tools (core toolset) make a task wait for another, identified by the two task ids; adding an existing link returns it, a link that would form a loop is refused with a recovery hint, and removing a missing link returns `{ removed: 0 }`. `get_task` takes `includeDependencies: true` to return `dependencies: { dependsOn, dependents }` with each linked task's id, title, status and link type. The `plan-project` skill now creates the dependencies in its plan instead of asking the user to add them, and `analyze-schedule` and `investigate-task` read them from `get_task`. Hosts that expose the `core` toolset get the two new tools.
