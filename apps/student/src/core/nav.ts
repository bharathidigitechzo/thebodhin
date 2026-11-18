/**
 * One navigation model for every dashboard (Nov 16 change request, Part 3).
 * Each role sees only its own modules, in order of priority and how often they are used.
 * Used by the desktop sidebar, the phone/tablet module grid and the bar that stays on every inner page.
 */
export type NavRole = 'learner' | 'tutor' | 'owner' | 'admin';
export type NavArea = 'learner' | 'educator' | 'admin';

export interface NavItem {
  key: string;
  href: string;
  title: string;
  icon: string; // Ionicons base name (the "-outline" variant is used when not selected)
  /** Other paths that belong to this module (highlights it). */
  match?: string[];
  /** Shown in the 5-slot bottom bar on phones. */
  primary?: boolean;
}

const L: NavItem[] = [
  { key: 'home', href: '/home', title: 'Home', icon: 'home', primary: true },
  { key: 'explore', href: '/explore', title: 'Explore', icon: 'compass', match: ['/course/', '/checkout', '/search', '/bundle/'], primary: true },
  { key: 'learning', href: '/learning', title: 'My Learning', icon: 'play-circle', match: ['/result'], primary: true },
  { key: 'live', href: '/live', title: 'Live', icon: 'radio', match: ['/webinar', '/book/'], primary: true },
  { key: 'notifications', href: '/notifications', title: 'Notifications', icon: 'notifications' },
  { key: 'quizzes', href: '/quizzes', title: 'Quizzes', icon: 'help-circle', match: ['/quiz/'] },
  { key: 'assignments', href: '/assignments', title: 'Assignments', icon: 'document-text', match: ['/assignment/'] },
  { key: 'mentorship', href: '/mentorship', title: '1:1 mentorship', icon: 'person-circle', match: ['/mentor-room'] },
  { key: 'community', href: '/community', title: 'Community', icon: 'chatbubbles' },
  { key: 'playground', href: '/playground', title: 'Playground', icon: 'code-slash' },
  { key: 'certificates', href: '/certificates', title: 'Certificates', icon: 'ribbon', match: ['/certificate/'] },
  { key: 'profile', href: '/profile', title: 'Profile', icon: 'person', match: ['/payments', '/downloads', '/help', '/my-purchases', '/product/', '/site/', '/refer'], primary: true },
];

/** Teaching first (requirement 1.2): dashboard, courses, create, live, quizzes, assignments, community … business last. */
const E: (NavItem & { owner?: boolean; module?: string })[] = [
  { key: 'home', href: '/educator/home', title: 'Dashboard', icon: 'grid', primary: true },
  { key: 'courses', href: '/educator/courses', title: 'Courses', icon: 'layers', match: ['/edu/course', '/edu/lesson'], primary: true },
  { key: 'create', href: '/edu/new-course', title: 'Create course', icon: 'add-circle' },
  { key: 'live', href: '/educator/live', title: 'Live classes', icon: 'radio', match: ['/edu/schedule', '/edu/summary', '/edu/host', '/edu/prejoin'], primary: true },
  { key: 'timetable', href: '/edu/timetable', title: 'Timetable', icon: 'calendar' },
  { key: 'quizzes', href: '/edu/assess?kind=quiz', title: 'Quizzes', icon: 'help-circle', match: ['/edu/assess'] },
  { key: 'assignments', href: '/edu/assess?kind=assignment', title: 'Assignments', icon: 'document-text', match: ['/edu/grade', '/edu/grading'] },
  { key: 'batches', href: '/educator/batches', title: 'Batches', icon: 'people', match: ['/edu/batch'], primary: true },
  { key: 'students', href: '/edu/students', title: 'Students', icon: 'school', match: ['/edu/student/'] },
  { key: 'community', href: '/edu/community', title: 'Community', icon: 'chatbubbles', module: 'community' },
  { key: 'mentorship', href: '/edu/mentorship', title: '1:1 mentorship', icon: 'person-circle' },
  { key: 'doubts', href: '/edu/doubts', title: 'Doubts', icon: 'chatbubble-ellipses' },
  { key: 'team', href: '/edu/team', title: 'Team & tutors', icon: 'people-circle', owner: true },
  { key: 'certificates', href: '/edu/certificates', title: 'Certificates', icon: 'ribbon', match: ['/edu/certificate'], owner: true },
  { key: 'earnings', href: '/edu/earnings', title: 'Earnings', icon: 'wallet', owner: true },
  { key: 'grow', href: '/edu/grow', title: 'Grow', icon: 'rocket', owner: true },
  { key: 'more', href: '/educator/more', title: 'More', icon: 'menu', match: ['/edu/'], primary: true },
];

const A: NavItem[] = [
  { key: 'home', href: '/admin', title: 'Home', icon: 'speedometer', primary: true },
  { key: 'inbox', href: '/admin/inbox', title: 'Inbox', icon: 'file-tray-full', match: ['/admin/review'], primary: true },
  { key: 'tenants', href: '/admin/tenants', title: 'Tenants', icon: 'business', match: ['/admin/tenant/'], primary: true },
  { key: 'money', href: '/admin/money', title: 'Money', icon: 'wallet', primary: true },
  { key: 'courses', href: '/admin/content', title: 'Bodhin courses', icon: 'layers', match: ['/edu/course', '/edu/lesson'] },
  { key: 'quizzes', href: '/edu/assess?kind=quiz', title: 'Quizzes', icon: 'help-circle', match: ['/edu/assess'] },
  { key: 'assignments', href: '/edu/assess?kind=assignment', title: 'Assignments', icon: 'document-text', match: ['/edu/grade', '/edu/grading'] },
  { key: 'live', href: '/admin/classes', title: 'Live classes', icon: 'radio', match: ['/edu/schedule', '/edu/host', '/edu/prejoin', '/edu/summary', '/edu/timetable'] },
  { key: 'mentorship', href: '/edu/mentorship', title: '1:1 mentorship', icon: 'person-circle' },
  { key: 'certificates', href: '/edu/certificates', title: 'Certificates', icon: 'ribbon', match: ['/edu/certificate'] },
  { key: 'students', href: '/edu/students', title: 'Students', icon: 'school', match: ['/edu/student/'] },
  { key: 'more', href: '/admin/more', title: 'More', icon: 'menu', match: ['/admin/', '/edu/'], primary: true },
];

export function navFor(role: NavRole, opts: { modulesOff?: string[] } = {}): NavItem[] {
  if (role === 'learner') return L;
  if (role === 'admin') return A;
  const off = new Set(opts.modulesOff ?? []);
  return E.filter((x) => (role === 'owner' || !x.owner) && !(x.module && off.has(x.module))).map(({ owner: _o, module: _m, ...x }) => x);
}

export const areaOfRole = (r: NavRole): NavArea => (r === 'learner' ? 'learner' : r === 'admin' ? 'admin' : 'educator');

/** The 5 items of the phone bottom bar (same as the tab screens). */
export const primaryOf = (items: NavItem[]) => items.filter((x) => x.primary);

const pathOnly = (href: string) => href.split('?')[0];

/** Which item a path belongs to: exact match first, then the longest matching extra prefix. */
export function activeKey(items: NavItem[], path: string, query = ''): string {
  if (!items || items.length === 0) return '';
  const full = query ? `${path}?${query}` : path;
  const exactQ = items.find((x) => x.href.includes('?') && full.startsWith(x.href));
  if (exactQ) return exactQ.key;
  const first = items[0];
  if (!first) return '';
  const root = pathOnly(first.href);
  const exact = items.find((x) => !x.href.includes('?') && (path === pathOnly(x.href) || (pathOnly(x.href) !== root && path.startsWith(pathOnly(x.href) + '/'))));
  if (exact) return exact.key;
  let best: [string, number] | null = null;
  for (const x of items) {
    const pre = [...(x.match ?? []), ...(x.href.includes('?') ? [pathOnly(x.href)] : [])];
    for (const p of pre) if (path.startsWith(p) && (!best || p.length > best[1])) best = [x.key, p.length];
  }
  return best?.[0] ?? first.key ?? '';
}

/** Tab-screen roots (they already show the tab bar); every other signed-in page gets the persistent bar on phones. */
export const TAB_ROOTS = ['/home', '/explore', '/learning', '/live', '/profile', '/educator/home', '/educator/courses', '/educator/batches', '/educator/live', '/educator/more', '/admin', '/admin/inbox', '/admin/tenants', '/admin/money', '/admin/more'];
