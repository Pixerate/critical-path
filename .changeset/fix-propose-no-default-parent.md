---
"@critical-path/client": patch
---

Do not default parentId to active task in `critical-path propose` so staged follow-up recommendations appear as top-level draft cards instead of subtasks unless `--parent` is explicitly specified.
