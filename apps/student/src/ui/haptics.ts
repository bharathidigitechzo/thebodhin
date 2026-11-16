/**
 * Haptics (vibration feedback), one place for the whole app.
 *
 * | kind    | when                                             | iOS                     | Android (haptics engine) |
 * |---------|--------------------------------------------------|-------------------------|--------------------------|
 * | tap     | a button is pressed                              | impact light            | virtual-key              |
 * | select  | a tab, chip, day or option is picked             | selection               | segment-tick             |
 * | toggle  | a switch / checkbox changes                      | selection               | toggle-on / toggle-off   |
 * | success | payment done, saved, published, class joined     | notification success    | confirm                  |
 * | warning | a limit is near, something needs attention       | notification warning    | reject (soft)            |
 * | error   | wrong OTP / password / number, a field is wrong  | notification error      | reject                   |
 *
 * Users can turn vibration off (Profile → Settings → Vibration). Web uses the browser's vibration API where it exists.
 * Expo docs (SDK 58): Android prefers performAndroidHapticsAsync (device haptics engine, no VIBRATE permission).
 */
import { Platform } from 'react-native';
import * as H from 'expo-haptics';

export type HapticKind = 'tap' | 'select' | 'toggle' | 'toggleOff' | 'success' | 'warning' | 'error';

const KEY = 'bodhin.haptics';
const read = () => {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};
let enabled = read();
let last: { kind: HapticKind; at: number } = { kind: 'tap', at: 0 };

export const hapticsEnabled = () => enabled;
export function setHapticsEnabled(v: boolean) {
  enabled = v;
  try {
    globalThis.localStorage?.setItem(KEY, v ? 'on' : 'off');
  } catch {
    /* private mode */
  }
  if (v) haptic('toggle');
}

/** Gap per kind so one mistake gives one buzz, even if a field and a banner both report it. */
const GAP: Record<HapticKind, number> = { tap: 40, select: 40, toggle: 40, toggleOff: 40, success: 400, warning: 400, error: 400 };

export function haptic(kind: HapticKind) {
  if (!enabled) return;
  const now = Date.now();
  if (now - last.at < GAP[kind] && (last.kind === kind || kind === 'tap')) return;
  // an error/success just fired: don't let the button tap that caused it bury it
  if (kind === 'tap' && now - last.at < 120 && (last.kind === 'error' || last.kind === 'success')) return;
  last = { kind, at: now };
  const log = ((globalThis as unknown as { __bodhinHaptics?: HapticKind[] }).__bodhinHaptics ??= []);
  log.push(kind);
  if (log.length > 300) log.splice(0, log.length - 300);
  try {
    let p: Promise<void>;
    if (Platform.OS === 'android') {
      const A = H.AndroidHaptics;
      const map: Record<HapticKind, H.AndroidHaptics> = { tap: A.Virtual_Key, select: A.Segment_Tick, toggle: A.Toggle_On, toggleOff: A.Toggle_Off, success: A.Confirm, warning: A.Reject, error: A.Reject };
      p = H.performAndroidHapticsAsync(map[kind]);
    } else if (kind === 'success' || kind === 'warning' || kind === 'error') {
      p = H.notificationAsync(kind === 'success' ? H.NotificationFeedbackType.Success : kind === 'warning' ? H.NotificationFeedbackType.Warning : H.NotificationFeedbackType.Error);
    } else if (kind === 'tap') {
      p = H.impactAsync(H.ImpactFeedbackStyle.Light);
    } else {
      p = H.selectionAsync();
    }
    p?.catch(() => {});
  } catch {
    /* no haptics hardware (desktop browser) — silently skip */
  }
}
