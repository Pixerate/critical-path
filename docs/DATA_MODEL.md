# Critical Path Data Model

`@critical-path` provides an agent-native, extensible project management schema and engine. This document outlines the core data entities, their relationships, and the foundational status framework.

## Entity Relationship Diagram

```mermaid
erDiagram
    PROJECT ||--o{ TASK : contains
    PROJECT ||--o{ TASK_CONTAINER : contains
    PROJECT ||--o{ ITERATION : contains
    PROJECT ||--o{ TEAM : assigned_to

    TEAM ||--o{ TASK : assigned_to

    TASK_CONTAINER ||--o{ TASK : groups
    TASK_CONTAINER ||--o{ TASK_CONTAINER : parent_of

    ITERATION ||--o{ TASK : includes

    USER ||--o{ PROJECT : owns
    USER ||--o{ TASK : assigned
    USER ||--o{ TASK : reported
    USER ||--o{ TASK : reviewed
    USER ||--o{ COMMENT : authored
    USER ||--o{ TIME_ENTRY : logged

    TASK ||--o{ TASK : parent_of
    TASK ||--o{ COMMENT : has
    TASK ||--o{ TIME_ENTRY : tracks
    TASK ||--o{ TASK_DEPENDENCY : dependent_on

    PROJECT {
        string id PK
        string key
        string name
        string description
        string ownerId FK
        string_array members
        string_array teamIds FK
        StatusDefinition_array statusDefinitions
        PriorityDefinition_array priorityDefinitions
        CustomFieldDefinition_array customFieldDefinitions
        datetime createdAt
        datetime updatedAt
    }

    TEAM {
        string id PK
        string name
        string description
        string leaderId FK
        string_array memberIds FK
        datetime createdAt
        datetime updatedAt
    }

    TASK_CONTAINER {
        string id PK
        string projectId FK
        string name
        string description
        string parentId FK
        string type "epic | group | section | folder"
        string color
        datetime createdAt
        datetime updatedAt
    }

    ITERATION {
        string id PK
        string projectId FK
        string name
        string goal
        string type "sprint | cycle | milestone"
        datetime startDate
        datetime endDate
        string status "planning | active | completed"
        datetime createdAt
    }

    TASK {
        string id PK
        string projectId FK
        string title
        string description
        string status
        string priority
        string assigneeId FK
        string reporterId FK
        string reviewerId FK
        string iterationId FK
        string teamId FK
        string containerId FK
        datetime plannedStartDate
        datetime actualStartDate
        datetime actualEndDate
        datetime dueDate
        number estimatedHours
        number loggedHours
        string_array tags
        object customFields
        string parentId FK
        datetime createdAt
        datetime updatedAt
    }

    TASK_DEPENDENCY {
        string id PK
        string taskId FK
        string dependsOnTaskId FK
        string type "blocking | blocked_by | relates_to"
    }

    COMMENT {
        string id PK
        string taskId FK
        string authorId FK
        string content
        datetime createdAt
        datetime updatedAt
    }

    TIME_ENTRY {
        string id PK
        string taskId FK
        string userId FK
        number hours
        string description
        datetime loggedAt
    }
```

---

## Core Entities

### 1. Project
Projects represent top-level workspaces or repositories of work. Projects configure custom workflows via `statusDefinitions` and `priorityDefinitions`.

### 2. Team
Teams group users together (`memberIds`). A project can be associated with multiple teams (`teamIds`), and individual tasks can be assigned directly to a team (`teamId`).

### 3. Task Container (`TaskContainer`)
Containers provide structural hierarchy within a project (e.g., Epics, Groups, Sections, Folders). Containers can nest inside other containers via `parentId`.

### 4. Iteration
Generalizes time-boxed or milestone-based planning units (e.g., Sprints, Cycles, Release Milestones). Configured with `type`, `startDate`, `endDate`, and `status`.

### 5. Task
The central unit of work. Tasks support:
- **Date Tracking**: `plannedStartDate`, `actualStartDate`, `actualEndDate`, `dueDate`.
- **People & Roles**: `assigneeId`, `reporterId`, `reviewerId`.
- **Associations**: `projectId`, `teamId`, `containerId`, `iterationId`.
- **Subtasks**: `parentId` pointing to parent task.
- **Custom Config & Metadata**: `status` (string key), `priority` (string key), `tags`, `customFields`.

### 6. Foundational Status & Lifecycle Framework
While consumers define custom task statuses (arbitrary string keys e.g. `'ready_for_qa'`), Critical Path maps every status to foundational states:
- **`completionState`**: `'done' | 'not_done'` (Is the task completed or canceled?).
- **`executionState`**: `'active' | 'inactive'` (Is someone currently actively working on the task?).

The engine evaluates these foundational states alongside task dates to derive lifecycle indicators:
- `isDone`: `completionState === 'done'`
- `isActive`: `executionState === 'active'`
- `isOverdue`: `!isDone` and `dueDate < currentTimestamp`
- `isUpcoming`: `!isDone` and `!isActive` and `plannedStartDate > currentTimestamp`

---

## Dependency Graph

Tasks can establish relationships using `TaskDependency`:
- `blocking`: `taskId` cannot proceed until `dependsOnTaskId` is completed.
- `blocked_by`: Inverse of blocking.
- `relates_to`: Informational link.

Querying `engine.getTaskDependencyGraph(taskId)` returns:
- `upstreamTasks`: Tasks that `taskId` depends on.
- `downstreamTasks`: Tasks that depend on `taskId`.
- `dependencies`: Raw dependency records.
