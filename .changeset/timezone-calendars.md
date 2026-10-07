---
"@critical-path/core": minor
---

Work schedules honour their time zone.

- **BREAKING:** `WorkSchedule.timezone` (IANA name, default UTC) now applies. Hours, weekdays and holiday dates are wall-clock rules in that zone. `addWorkingHours`, `subtractWorkingHours`, `getWorkingHoursBetween`, `nextWorkingTime` and `previousWorkingTime` follow its UTC offset and daylight-saving changes. Day-level helpers use the local date an instant falls on. Critical path analysis (both modes) and workload inherit this, so work handed from a London assignee to a New York one continues at the New York assignee's next working moment.
- **BREAKING:** date-only strings and date-times without an offset (`2026-10-05T09:00`) are read as wall-clock time in the schedule's zone (UTC by default), instead of the server's local zone.
- Unknown zones are rejected by `WorkScheduleSchema` and throw a `RangeError` in calendar functions. New `isValidTimeZone` helper.
- Calendar arithmetic caches each schedule's per-day working windows and zone offsets, making critical path analysis on long projects about 8× faster. Treat schedule objects as immutable once used.
