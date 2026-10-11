---
"@critical-path/core": patch
---

Workload: when no `endDate` is given, the date range now includes each undated task's derived end (start plus one day per 8 hours). Before, effort that ran past every recorded date (e.g. a task created on a weekend with no dates) fell outside every bucket and was dropped.
