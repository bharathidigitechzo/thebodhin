# Timetable and live-class scheduling

Every class time in Bodhin passes the same clash rules, whether a tutor schedules a class, moves it, or creates a batch. The rules are pure functions in `src/core/timetable.ts`. They must also run on the server when the backend is connected.

## Rules

| Situation | Rule | Message the tutor sees |
|---|---|---|
| Same batch, overlapping time | Blocked | "Clashes with "Class 4" in this batch (Sat, 21 Nov, 4:00 pm)." |
| Same instructor, another batch, overlapping time | Blocked | "Rajesh Kumar is already teaching "Class 4" (DM & AI – Weekend) at …" |
| Back-to-back (one ends 7:00, next starts 7:00) | Allowed | |
| Cancelled or already-held classes | Never clash | |
| New batch: two weekly slots overlap on the same day | Blocked | "Two weekly slots overlap on the same day." |
| New batch: a generated class clashes with the lead instructor's other classes | Blocked | "… is already teaching … Change the weekly slot or the lead instructor." |
| Moving a class | At least 5 minutes ahead, 15 min to 5 h, same clash rules, room-hours checked if it gets longer | |
| Class already started | No "Change date / time" button | |

The instructor of a class is the one chosen when it was scheduled. If none was chosen, it is the batch's first instructor (`instructorOf`).

## Who sees what

| Person | Where | What |
|---|---|---|
| Tutor | Educator → Live → Week timetable, or More → Timetable (`/edu/timetable`) | All batches they teach, Monday to Sunday, with clashes flagged in red. Tapping a class opens its batch schedule. |
| Tutor | Batch → Schedule → tap a class → Change date / time | Move sheet with date, time and duration. Students are notified of the old → new time. |
| Learner | Live → Timetable tab | Their own classes for the week: live, upcoming and done. In-person classes say "In person" and have no Join button. |
| Super Admin | Admin → More → Live classes (`/admin/live`) | Live now, today's timetable across academies, room-hours per academy, and any instructor double-bookings left over from older data or imports. |

## Fixes made in this round

- A tutor could be booked for two batches at the same time. This is now blocked.
- In-person classes showed an online "Join" button to learners. Now they show "In person", and online joining is refused.
- Learners added to a batch by the tutor (for example, an offline payment with no purchase in the app) could not join online classes. Batch membership now counts.
- There was no way to move a class, only cancel it. "Change date / time" has been added.

## Backend notes

- Run `findClash` inside the same transaction as the insert or update, so that two tutors saving at the same moment cannot both win. Add an exclusion constraint on `(instructor_id, tstzrange(starts_at, ends_at))` where `status = 'scheduled'` as a safety net.
- Store times in UTC (`timestamptz`) and show them in the viewer's time zone.
- Send the "Class time changed" notification and update the calendar-sync event in the same job.

## Tests

- `tests/business/timetable.test.ts`: 40 checks on the rules, moving, batch creation, in-person classes, batch-member join, week views, the admin monitor and admin permissions.
- `tests/e2e/timetable.py`: 14 checks in a real browser covering the tutor timetable, moving a class, the learner Timetable tab and the admin monitor.
