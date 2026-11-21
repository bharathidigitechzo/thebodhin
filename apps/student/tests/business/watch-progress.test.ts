// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Watching a video: progress % grows with watch time, "Continue Learning" is the course watched last,
   and the lesson resumes where the learner stopped (also after signing out — it's all in the shared db). */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { allLessons, contentLength, progressOf, resumeLesson } from '@/core/catalog';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x)?.slice(0, 200) : '')); } };

(async () => {
const U = 'u_arjun';
const mine = db.enrollments.filter((e) => e.userId === U);
ok(mine.length >= 2, 'learner has 2+ enrolled courses', mine.length);
const [eA, eB] = mine;
const cA = api.findCourse(eA.courseId), cB = api.findCourse(eB.courseId);
// Start clean: no completed lessons / positions in course B, course A most recent.
eB.completedLessonIds = [];
eB.lastLessonId = undefined;
for (const l of allLessons(cB)) delete db.positions[`${U}:${l.id}`];
eA.lastActiveAt = new Date().toISOString();
eB.lastActiveAt = new Date(Date.now() - 864e5).toISOString();

const home1 = await api.learning.home(U, null);
ok(home1.inProgress[0]?.course.id === cA.id, 'before: Continue shows course A', home1.inProgress[0]?.course.id);
const before = progressOf(cB, eB).pct;
ok(before === 0, 'course B starts at 0%', before);

// Open course B (no lesson given) and watch 39s, then 5 min, of its first video lesson.
const vid = allLessons(cB).find((l) => l.type === 'video');
const opened = api.player.open(U, cB.id);
ok(opened.lesson.id === allLessons(cB)[0].id, 'first open starts at lesson 1');
const len = vid.durationSec || 600;
const dur = vid.durationSec ? undefined : 600; // lessons without an entered length get it from the player
api.player.savePosition(U, vid.id, 39, dur ?? len, cB.id);
const p39 = progressOf(cB, eB).pct;
ok(p39 > 0, 'progress % grows after 39s of watching (no lesson completed)', p39);
api.player.savePosition(U, vid.id, Math.min(300, len - 30), dur ?? len, cB.id);
const p300 = progressOf(cB, eB).pct;
ok(p300 > p39, 'progress % keeps growing as more is watched', [p39, p300]);
ok(p300 < 100, 'partial watching never reaches 100%', p300);
ok(eB.completedLessonIds.length === 0, 'watching part of a lesson does not complete it');

// Continue Learning → course B, at that lesson, with the saved time.
const home2 = await api.learning.home(U, null);
const cont = home2.inProgress[0];
ok(cont?.course.id === cB.id, 'after watching: Continue shows course B', cont?.course.id);
ok(cont?.next.lesson.id === vid.id, 'Continue points to the lesson being watched', cont?.next.lesson.id);
ok(cont?.resumeAt === Math.floor(Math.min(300, len - 30)), 'Continue carries the resume time', cont?.resumeAt);
ok(cont?.progress.pct === p300, 'Continue card shows the same %', [cont?.progress.pct, p300]);

// "Sign out and back in": reload the player with no lesson → same lesson, same second.
const again = api.player.open(U, cB.id);
ok(again.lesson.id === vid.id, 'reopening resumes the same lesson', again.lesson.id);
ok(again.position === Math.floor(Math.min(300, len - 30)), 'reopening resumes at the saved second', again.position);
ok(resumeLesson(cB, eB).lesson.id === vid.id, 'course page Continue → same lesson');

// Measured length is used for "x of content" when the educator gave none.
if (!vid.durationSec) ok(contentLength(cB) !== '', 'content length known after playing', contentLength(cB));
ok(db.lessonSecs && typeof db.lessonSecs === 'object', 'video lengths stored in db (synced)');

// Watched to the end → starts over next time, and completing counts fully.
api.player.savePosition(U, vid.id, len - 2, dur ?? len, cB.id);
ok(api.player.open(U, cB.id, vid.id).position === 0, 'a video watched to the end restarts from 0');
api.player.setComplete(U, cB.id, vid.id, true);
const total = allLessons(cB).length;
ok(progressOf(cB, eB).pct === Math.min(99, Math.round(100 / total)) || total === 1, 'completed lesson counts as a full lesson', progressOf(cB, eB).pct);
ok(resumeLesson(cB, eB).lesson.id !== vid.id || total === 1, 'after completing, Continue moves to the next lesson');

// 100% only when every lesson is complete.
for (const l of allLessons(cB)) api.player.setComplete(U, cB.id, l.id, true);
ok(progressOf(cB, eB).pct === 100, 'all lessons complete → 100%');

// Junk input is ignored.
const snap = JSON.stringify(db.positions);
api.player.savePosition(U, vid.id, NaN, 0, cB.id);
api.player.savePosition('', vid.id, 10);
ok(JSON.stringify(db.positions) === snap, 'NaN / missing user positions are ignored');

// Ratings: a course nobody rated → avg 0 + count 0 (shown as "New"), never NaN.
const unrated = { ...cB, id: 'c_unrated_test', rating: 0, ratingCount: 0 };
db.courses.push(unrated);
const rv = await api.reviews.list('c_unrated_test');
ok(Number.isFinite(rv.avg) && rv.avg === 0 && rv.count === 0, 'unrated course: no NaN', rv.avg);
db.courses = db.courses.filter((c) => c.id !== 'c_unrated_test');

console.log(`\nwatch-progress: ${pass} passed, ${fail} failed`);
if (fail) { console.log(fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
})();
