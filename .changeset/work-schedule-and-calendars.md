---
"@critical-path/core": minor
---

Add comprehensive Work Schedule, Working Hours, Working Days & Holidays subsystem:
- Added `WorkSchedule`, `DaySchedule`, `WorkingHoursRange`, and `Holiday` types supporting custom shifts, weekend configurations, and organization/regional holidays.
- Integrated hierarchical calendar resolution: Task Assignee/Team -> Project -> Engine/Default (`DEFAULT_WORK_SCHEDULE`).
- Enhanced Critical Path Method (CPM) with calendar working-hours math (`earlyStartDate`, `earlyFinishDate`, `lateStartDate`, `lateFinishDate`, `totalWorkingHours`, `projectEndDate`) skipping weekends and holidays.
- Enhanced Workload & Capacity Engine with working-day effort distribution and holiday capacity deductions.
- Added working-days schedule variance (`scheduleVarianceWorkingDays`) to Reality Deltas in the Ladder of Abstraction.
