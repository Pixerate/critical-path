---
"@critical-path/core": minor
---

Introduce Domain-Driven Design (DDD) constructs:
- Rich Domain Aggregates (`TaskEntity`, `ProjectEntity`, `BaseEntity`) encapsulating invariants, transitions, and uncommitted events.
- Typed `DomainEventBus` and domain event interfaces (`task.created`, `task.status_changed`, `time.logged`, `dependency.added`, etc.).
- DAG task dependency graph cycle detection (`detectDependencyCycle`, `CircularDependencyError`).
- Custom field value object validation (`validateCustomFieldValues`, `CustomFieldValidationError`).
- Interface segregation for discrete repositories (`ProjectRepository`, `TaskRepository`, `WorkflowRepository`, etc.).
