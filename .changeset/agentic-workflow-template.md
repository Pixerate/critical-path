---
"@critical-path/core": minor
---

Add the `planning` status, the `DEFAULT_AGENTIC_WORKFLOW` template (`planning -> todo -> in_progress -> in_review -> done`) and `resolveBuiltInWorkflow()`.

A project whose `workflowId` exactly matches a built-in workflow id now uses that built-in when no workflow with that id is stored for its tenant, instead of falling back to the tenant's default. Any other missing `workflowId` still falls back to the tenant's default.
