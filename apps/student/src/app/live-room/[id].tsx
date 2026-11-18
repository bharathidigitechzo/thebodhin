/**
 * Live class room — mobile portrait first (the design was a desktop/landscape room).
 *  Stage (shared slides + instructor PiP) on top, Chat / Q&A / People in the middle,
 *  controls in the thumb zone. Wide screens (tablet/web) switch to stage + side panel.
 * Students get no whiteboard tools (those are tutor-only).
 *
 * Provider: `mock` (scripted room, default) or `livekit` (real, self-hosted, no third-party branding — docs/LIVE_CLASSES.md).
 * POC default: the room is simulated. DEVELOPER: implement `RoomProvider` with LiveKit (recommended:
 * custom UI like this) using the token from liveTab.join(). Past the interactive seats the learner gets broadcast view (live/scale.ts).
 * mode=recording plays the past session's recording instead.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, liveTab } from '@/api/client';
import { LIVE_SCALE, withRetry, type SeatMode } from '@/live/scale';
import type { Lesson } from '@/core/catalog';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { VideoSurface } from '@/ui/VideoSurface';
import { RoomVideo } from '@/ui/RoomVideo';
import { BoardView } from '@/ui/SmartBoard';
import { applyOp, type BoardItem } from '@/core/ink';
import { RoomClient, prepareNative, type PersonInfo } from '@/live/livekit';
import { makeRateLimiter, REACTIONS, type RoomMsg } from '@/live/protocol';
import { RealtimeRoomSession } from '@/live/realtimeRoom';

type Msg = { id: string; who: string; role: 'student' | 'instructor' | 'me' | 'system'; text: string; at: string };
type Panel = 'chat' | 'qa' | 'people' | 'files';

const SLIDES = [
  { title: 'SEO Strategy with AI Tools', points: ['Keyword research with AI', 'Content optimisation', 'Technical SEO basics', 'AI tools & workflow', 'Real-world case study'] },
  { title: 'Keyword research with AI', points: ['Seed → cluster → intent', 'Volume vs difficulty', 'Long-tail opportunities', 'Prompt: “Group these 200 keywords by intent”'] },
  { title: 'Content optimisation', points: ['One page, one intent', 'Answer the question first', 'Internal links from pillars', 'Refresh every 6 months'] },
];
const FILES = [
  { name: 'SEO AI Tools List.pdf', size: '2.4 MB' },
  { name: 'Keyword Cluster Template.xlsx', size: '180 KB' },
];
const clock = (d = new Date()) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export default function LiveRoom() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const info = liveTab.session(id);
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [state, setState] = useState<'joining' | 'in' | 'error'>(mode === 'recording' ? 'in' : 'joining');
  const [err, setErr] = useState('');
  const [viewers, setViewers] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [hand, setHand] = useState(false);
  const [panel, setPanel] = useState<Panel>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 'sys', who: 'Bodhin', role: 'system', text: 'You joined the room.', at: clock() }]);
  const [draft, setDraft] = useState('');
  const [slide, setSlide] = useState(0);
  const [stageMode, setStageMode] = useState<'slides' | 'screen' | 'board'>('slides');
  const [board, setBoard] = useState<BoardItem[]>([]);
  const [poll, setPoll] = useState<null | { q: string; options: string[]; votes: number[]; mine?: number }>(null);
  const [more, setMore] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [react, setReact] = useState<string | null>(null);
  const [real, setReal] = useState(false);
  const [people, setPeople] = useState<PersonInfo[]>([]);
  const [hostCam, setHostCam] = useState<MediaStream | null>(null);
  const [hostScreen, setHostScreen] = useState<MediaStream | null>(null);
  const [studentStream, setStudentStream] = useState<MediaStream | null>(null);
  const realtime = useRef<RealtimeRoomSession | null>(null);
  const room = useRef<RoomClient | null>(null);
  const allow = useRef(makeRateLimiter(5, 5000));
  const askLimit = useRef(makeRateLimiter(1, LIVE_SCALE.broadcastQaEveryMs));
  const [seat, setSeat] = useState<SeatMode>('interactive');
  const [joinNote, setJoinNote] = useState('');
  const bc = seat === 'broadcast';
  const joinedAt = useRef(Date.now());
  const list = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    if (mode === 'recording' || !info || !session) return;
    liveTab.join(userId, id).catch(() => {});
    const sess = new RealtimeRoomSession(id, {
      id: userId,
      name: session.user.name,
      role: 'student',
    }, {
      onParticipants: (pList) => {
        setPeople(pList.map((p) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          speaking: false,
          micOn: !!p.micOn,
          camOn: !!p.camOn,
        })));
        setViewers(pList.length);
      },
      onChat: (m) => {
        setMsgs((prev) => [...prev, { id: m.id, who: m.by, role: m.role, text: m.text, at: m.at }]);
      },
      onQA: (q) => {
        setMsgs((prev) => [...prev, { id: q.id, who: q.by, role: 'student', text: `❓ ${q.q}`, at: q.at }]);
      },
      onRemoteStream: (st) => {
        setHostCam(st);
      },
      onPoll: (p) => {
        setPoll(p);
      },
      onSlide: (idx) => {
        setSlide(idx);
      },
      onStage: (stg) => {
        setStageMode(stg);
      },
      onAllowSpeak: (who, allowed) => {
        if (who === session.user.name || who === userId) {
          setMsgs((prev) => [...prev, {
            id: `allow_${Date.now()}`,
            who: 'Bodhin',
            role: 'system',
            text: allowed ? 'The instructor has allowed you to speak. You can unmute now.' : 'You have been muted by the instructor.',
            at: clock(),
          }]);
        }
      },
    });

    realtime.current = sess;
    sess.announceJoin();
    setState('in');
    joinedAt.current = Date.now();

    const start = new Date(info.session.startsAt).getTime();
    const tick = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);

    return () => {
      clearInterval(tick);
      sess.dispose();
      realtime.current = null;
    };
  }, [id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [msgs.length, poll]);

  if (!info) return null;
  const { session: s, course, tutor } = info;

  const leave = () => {
    if (mode !== 'recording') liveTab.leave(userId, id, (Date.now() - joinedAt.current) / 6e4);
    router.canGoBack() ? router.back() : router.replace('/live');
  };

  /* ── recording mode ── */
  if (mode === 'recording') {
    const durationSec = (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 1000;
    const fake: Lesson = { id: `rec_${s.id}`, title: s.title, type: 'video', durationSec };
    return (
      <View style={{ flex: 1, backgroundColor: '#050B18' }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <TopBar title={s.title} sub={`Recording · ${new Date(s.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`} onBack={leave} />
          <View style={{ width: '100%', maxWidth: 960, alignSelf: 'center' }}>
            <VideoSurface course={course} lesson={fake} label="Class recording" startAt={0} speed={1} fullscreen={false} onTime={() => {}} onEnded={() => {}} onSpeed={() => {}} onQuality={() => {}} onFullscreen={() => {}} />
          </View>
          <View style={{ padding: 20, gap: 8 }}>
            <Txt variant="heading" color="#fff">{s.title}</Txt>
            <Txt variant="label" color="rgba(255,255,255,0.7)">{tutor.name} · {course.title}</Txt>
            <Txt variant="caption" color="rgba(255,255,255,0.55)">Chat and polls from the live session are kept with the recording on the tutor's side.</Txt>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (state === 'joining' || state === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: '#050B18', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        {state === 'joining' ? (
          <>
            <Pulse />
            <Txt variant="heading" color="#fff" center>Joining {s.title}…</Txt>
            <Txt variant="label" color="rgba(255,255,255,0.7)" center>{joinNote || 'You’ll join with mic and camera off.'}</Txt>
          </>
        ) : (
          <>
            <Banner text={err} />
            <Button title="Back" onPress={() => router.back()} />
          </>
        )}
      </View>
    );
  }

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    const msgId = `me${Date.now()}`;
    if (panel === 'qa') {
      realtime.current?.sendQA(t);
    } else {
      realtime.current?.sendChat(t);
    }
    setMsgs((m) => [...m, { id: msgId, who: 'You', role: 'me', text: panel === 'qa' ? `❓ ${t}` : t, at: clock() }]);
    setDraft('');
  };
  const vote = (i: number) => {
    const pid = (poll as any)?.id || 'poll';
    realtime.current?.votePoll(pid, i);
    setPoll((p) => (p && p.mine == null ? { ...p, mine: i, votes: p.votes.map((v, k) => (k === i ? v + 1 : v)) } : p));
  };
  const sendReaction = (e: string) => {
    setReact(e);
    setTimeout(() => setReact(null), 1600);
  };
  const toggleMic = async () => {
    const nextMic = !mic;
    setMic(nextMic);
    if (nextMic) {
      if (!studentStream) {
        const s = await realtime.current?.startCamera(cam, true);
        if (s) setStudentStream(s);
      } else {
        realtime.current?.setMic(true);
      }
    } else {
      realtime.current?.setMic(false);
    }
  };
  const toggleCam = async () => {
    const nextCam = !cam;
    setCam(nextCam);
    if (nextCam) {
      if (!studentStream) {
        const s = await realtime.current?.startCamera(true, mic);
        if (s) setStudentStream(s);
      } else {
        realtime.current?.setCam(true);
      }
    } else {
      realtime.current?.setCam(false);
    }
  };
  const toggleHand = () => {
    const nextHand = !hand;
    setHand(nextHand);
    realtime.current?.raiseHand(nextHand);
  };
  const mm = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const stage = (
    <View style={[styles.stage, wide && { flex: 1 }]}>
      <View style={styles.slideWrap}>
        {stageMode === 'board' ? (
          <View style={[styles.slide, { padding: 0, overflow: 'hidden', backgroundColor: '#fff' }]}><BoardView items={board} /></View>
        ) : hostScreen ? (
          <View style={[styles.slide, { padding: 0, overflow: 'hidden', backgroundColor: '#000' }]}>
            <RoomVideo stream={hostScreen} fit="contain" />
          </View>
        ) : (
          <View style={styles.slide}>
            <Txt variant="caption" color="#64748B" style={{ fontWeight: '700' }}>{tutor.name.toUpperCase()} IS SHARING</Txt>
            <Txt variant="title" color="#0E1B33" style={{ fontSize: wide ? 30 : 19, lineHeight: wide ? 36 : 24 }}>{SLIDES[slide]?.title ?? 'Live Session'}</Txt>
            <View style={{ width: 44, height: 3, backgroundColor: '#E8A21B', borderRadius: 2 }} />
            {(SLIDES[slide]?.points ?? []).map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Ionicons name="checkmark-circle" size={wide ? 20 : 15} color="#E8A21B" />
                <Txt variant={wide ? 'body' : 'caption'} color="#1E293B" style={{ fontWeight: '600' }}>{p}</Txt>
              </View>
            ))}
            <Txt variant="caption" color="#94A3B8" style={{ position: 'absolute', right: 12, bottom: 8 }}>{slide + 1} / {SLIDES.length}</Txt>
          </View>
        )}
        {hostCam ? (
          <View style={[styles.pip, wide && { width: 200, height: 130 }, { overflow: 'hidden', backgroundColor: '#000' }]}>
            <RoomVideo stream={hostCam} fit="cover" style={StyleSheet.absoluteFill} />
            <View style={styles.pipName}>
              <Ionicons name="videocam" size={11} color="#3FD17C" />
              <Txt variant="caption" color="#fff" style={{ fontSize: 10 }} numberOfLines={1}>{tutor.name}</Txt>
            </View>
          </View>
        ) : (
          <LinearGradient colors={[course.art.from, course.art.to]} style={[styles.pip, wide && { width: 200, height: 130 }]}>
            <Avatar name={tutor.name} color={tutor.color} size={wide ? 56 : 40} />
            <View style={styles.pipName}>
              <Ionicons name="mic" size={11} color="#3FD17C" />
              <Txt variant="caption" color="#fff" style={{ fontSize: 10 }} numberOfLines={1}>{tutor.name}</Txt>
            </View>
          </LinearGradient>
        )}
        {cam && studentStream && (
          <View style={[styles.pip, { top: undefined, bottom: 12, right: 12, width: 100, height: 75, overflow: 'hidden', backgroundColor: '#000' }]}>
            <RoomVideo stream={studentStream} muted={true} fit="cover" style={StyleSheet.absoluteFill} />
            <View style={styles.pipName}>
              <Txt variant="caption" color="#fff" style={{ fontSize: 9 }}>You</Txt>
            </View>
          </View>
        )}
        {react && (
          <View style={styles.reaction} pointerEvents="none">
            <Txt style={{ fontSize: 44 }}>{react}</Txt>
          </View>
        )}
      </View>
    </View>
  );

  const panelView = (
    <View style={[styles.panel, { backgroundColor: c.surface }, wide && { width: 380, borderRadius: 20, margin: 12 }]}>
      <View style={styles.panelTabs} accessibilityRole="tablist">
        {([
          ['chat', 'Chat'],
          ['qa', 'Q&A'],
          ['people', `People (${viewers})`],
          ['files', 'Files'],
        ] as const).filter(([k]) => !bc || k !== 'chat').map(([k, l]) => (
          <Pressable key={k} onPress={() => setPanel(k)} accessibilityRole="tab" accessibilityState={{ selected: panel === k }} style={[styles.pTab, panel === k && { backgroundColor: c.primary }]}>
            <Txt variant="caption" color={panel === k ? '#fff' : c.inkSoft} style={{ fontWeight: '700' }} numberOfLines={1}>{l}</Txt>
          </Pressable>
        ))}
      </View>

      {poll && (panel === 'chat' || panel === 'qa') && (
        <Pressable onPress={() => setPollOpen(true)} style={[styles.pollBanner, { backgroundColor: c.primarySoft, borderColor: c.primary }]} accessibilityRole="button">
          <Ionicons name="bar-chart" size={18} color={c.primary} />
          <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{poll.q}</Txt>
          <Txt variant="label" color={c.primary}>{poll.mine == null ? 'Vote' : 'Results'}</Txt>
        </Pressable>
      )}
      {panel === 'people' ? (
        <FlatList
          data={people.length ? people : [{ id: 'host', name: `${tutor.name} (Instructor)`, isHost: true, speaking: false, micOn: false, camOn: false }, { id: userId, name: session?.user.name ? `${session.user.name} (You)` : 'You', isHost: false, speaking: false, micOn: mic, camOn: cam }]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          renderItem={({ item }) => {
            const isSelf = item.id === userId || item.name.includes('(You)');
            const isHost = item.isHost || item.name.includes('(Instructor)');
            const label = isSelf ? `${session?.user.name ?? 'You'} (You)` : isHost ? `${item.name.replace(' (Instructor)', '')} (Instructor)` : item.name;
            return (
              <View style={[styles.person, { backgroundColor: isSelf ? c.primarySoft : c.surfaceMuted }]}>
                <Avatar name={label} size={34} color={isHost ? tutor.color : c.primary} />
                <Txt variant="label" style={{ flex: 1 }}>{label}</Txt>
                <Ionicons name={isHost ? 'videocam' : (isSelf ? (mic ? 'mic' : 'mic-off') : 'mic-off')} size={16} color={isHost ? c.success : c.muted} />
              </View>
            );
          }}
        />
      ) : panel === 'files' ? (
        <View style={{ padding: 12, gap: 8 }}>
          {FILES.map((f) => (
            <View key={f.name} style={[styles.file, { borderColor: c.border }]}>
              <Ionicons name="document-attach-outline" size={22} color={c.danger} />
              <View style={{ flex: 1 }}>
                <Txt variant="label">{f.name}</Txt>
                <Txt variant="caption" color={c.muted}>{f.size}</Txt>
              </View>
              <Ionicons name="download-outline" size={22} color={c.primary} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          ref={list}
          data={panel === 'qa' ? msgs.filter((m) => m.text.includes('?') || m.role === 'instructor' || m.role === 'system') : msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          renderItem={({ item: m }) =>
            m.role === 'system' ? (
              <Txt variant="caption" color={c.muted} center>{m.text}</Txt>
            ) : (
              <View style={[styles.msg, m.role === 'me' && { alignSelf: 'flex-end', backgroundColor: c.primary }, m.role === 'instructor' && { backgroundColor: c.accentSoft }, m.role === 'student' && { backgroundColor: c.surfaceMuted }]}>
                <Txt variant="caption" color={m.role === 'me' ? 'rgba(255,255,255,0.8)' : c.inkSoft} style={{ fontWeight: '700' }}>
                  {m.who}{m.role === 'instructor' ? ' · Instructor' : ''} <Txt variant="caption" color={m.role === 'me' ? 'rgba(255,255,255,0.6)' : c.muted} style={{ fontWeight: '400' }}>{m.at}</Txt>
                </Txt>
                <Txt variant="label" color={m.role === 'me' ? '#fff' : c.ink} style={{ fontWeight: '500' }}>{m.text}</Txt>
              </View>
            )
          }
        />
      )}

      {(panel === 'chat' || panel === 'qa') && (
        <View style={[styles.compose, { borderTopColor: c.border }]}>
          <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={send} placeholder={panel === 'qa' ? 'Ask the instructor a question…' : 'Message everyone…'} placeholderTextColor={c.muted} returnKeyType="send" accessibilityLabel={panel === 'qa' ? 'Ask a question' : 'Chat message'} style={[styles.input, { backgroundColor: c.surfaceMuted, color: c.ink }]} />
          <Pressable onPress={send} disabled={!draft.trim()} style={[styles.sendBtn, { backgroundColor: c.primary, opacity: draft.trim() ? 1 : 0.5 }]} accessibilityRole="button" accessibilityLabel="Send">
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#050B18' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TopBar title={s.title} sub={`${course.title}`} onBack={() => setLeaveAsk(true)} live viewers={viewers} time={mm} />
          {bc && (
            <View style={[styles.handBar, { backgroundColor: '#12407F' }]} accessibilityRole="text" accessibilityLabel="Broadcast view">
              <Ionicons name="radio-outline" size={16} color="#fff" />
              <Txt variant="label" color="#fff" style={{ flex: 1 }}>Broadcast view · about {LIVE_SCALE.broadcastDelay} behind · ask in Q&A</Txt>
            </View>
          )}
          {hand && (
            <View style={[styles.handBar, { backgroundColor: c.accent }]}>
              <Ionicons name="hand-left" size={16} color="#fff" />
              <Txt variant="label" color="#fff">Hand raised · the instructor has been notified</Txt>
            </View>
          )}
          <View style={[{ flex: 1 }, wide && { flexDirection: 'row' }]}>
            {stage}
            {panelView}
          </View>

          {/* controls — thumb zone */}
          <View style={styles.controls}>
            {!bc && <Ctl icon={mic ? 'mic' : 'mic-off'} label={mic ? 'Mute' : 'Unmute'} off={!mic} onPress={toggleMic} />}
            {!bc && <Ctl icon={cam ? 'videocam' : 'videocam-off'} label={cam ? 'Stop video' : 'Video'} off={!cam} onPress={toggleCam} />}
            {!bc && <Ctl icon="hand-left" label={hand ? 'Lower' : 'Raise hand'} active={hand} onPress={toggleHand} />}
            {!bc && <Ctl icon="happy-outline" label="React" onPress={() => sendReaction(REACTIONS[Math.floor(Math.random() * REACTIONS.length)])} />}
            {bc && <Ctl icon="chatbubble-ellipses-outline" label="Ask" onPress={() => setPanel('qa')} />}
            <Ctl icon="ellipsis-horizontal" label="More" onPress={() => setMore(true)} />
            <Pressable onPress={() => setLeaveAsk(true)} style={styles.leave} accessibilityRole="button" accessibilityLabel="Leave class">
              <Ionicons name="call" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <BottomSheet open={pollOpen && !!poll} onClose={() => setPollOpen(false)} title="Live poll">
        {poll && <Poll poll={poll} onVote={vote} />}
      </BottomSheet>

      <BottomSheet open={more} onClose={() => setMore(false)} title="More">
        {([
          ['information-circle-outline', 'Class info', `${s.title} · ${tutor.name}`, () => {}],
          ['bar-chart-outline', 'Live poll', poll ? 'Vote or see results' : 'No poll right now', () => { setMore(false); if (poll) setPollOpen(true); }],
          ['document-attach-outline', 'Class resources', `${FILES.length} files`, () => { setPanel('files'); setMore(false); }],
          ['flag-outline', 'Report a problem', 'Audio, video or behaviour', () => setMore(false)],
        ] as const).map(([icon, t, sub, fn]) => (
          <Pressable key={t} onPress={fn} style={styles.moreRow} accessibilityRole="button">
            <Ionicons name={icon} size={24} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{t}</Txt>
              <Txt variant="caption" color={c.muted}>{sub}</Txt>
            </View>
          </Pressable>
        ))}
      </BottomSheet>

      <BottomSheet
        open={leaveAsk}
        onClose={() => setLeaveAsk(false)}
        title="Leave this class?"
        footer={
          <>
            <Button title="Stay" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setLeaveAsk(false)} />
            <Button title="Leave" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={leave} />
          </>
        }
      >
        <Txt color={c.inkSoft}>Your attendance is saved. The recording will be in your Live tab after the class.</Txt>
      </BottomSheet>
    </View>
  );
}

function TopBar({ title, sub, onBack, live, viewers, time }: { title: string; sub: string; onBack: () => void; live?: boolean; viewers?: number; time?: string }) {
  return (
    <View style={styles.top}>
      <Pressable onPress={onBack} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Leave">
        <Ionicons name="chevron-back" size={22} color="#fff" />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" color="#fff" numberOfLines={1}>{title}</Txt>
        <Txt variant="caption" color="rgba(255,255,255,0.6)" numberOfLines={1}>{sub}</Txt>
      </View>
      {live && (
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Txt variant="caption" color="#fff" style={{ fontWeight: '800' }}>LIVE</Txt>
          </View>
          <Txt variant="caption" color="rgba(255,255,255,0.7)" style={{ fontVariant: ['tabular-nums'], fontSize: 11 }}>
            👁 {viewers} · {time}
          </Txt>
        </View>
      )}
    </View>
  );
}

function Ctl({ icon, label, onPress, off, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; off?: boolean; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.ctl} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }}>
      <View style={[styles.ctlIcon, off && { backgroundColor: 'rgba(229,56,59,0.18)' }, active && { backgroundColor: '#D99A1E' }]}>
        <Ionicons name={icon} size={22} color={off ? '#FF6B6E' : '#fff'} />
      </View>
      <Txt variant="caption" color="rgba(255,255,255,0.8)" style={{ fontSize: 10.5 }} numberOfLines={1}>{label}</Txt>
    </Pressable>
  );
}

function Poll({ poll, onVote }: { poll: { q: string; options: string[]; votes: number[]; mine?: number }; onVote: (i: number) => void }) {
  const { c } = useTheme();
  const total = poll.votes.reduce((a, b) => a + b, 0);
  return (
    <View style={[styles.poll, { borderColor: c.primary, backgroundColor: c.primarySoft }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="bar-chart" size={16} color={c.primary} />
        <Txt variant="caption" color={c.primary} style={{ fontWeight: '800' }}>LIVE POLL</Txt>
      </View>
      <Txt variant="bodyStrong">{poll.q}</Txt>
      {poll.options.map((o, i) => {
        const pct = Math.round((poll.votes[i] / total) * 100);
        const voted = poll.mine != null;
        return (
          <Pressable key={o} disabled={voted} onPress={() => onVote(i)} style={[styles.pollOpt, { borderColor: poll.mine === i ? c.primary : c.border, backgroundColor: c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: poll.mine === i }}>
            {voted && <View style={[StyleSheet.absoluteFill, { width: `${pct}%`, backgroundColor: poll.mine === i ? c.primarySoft : c.surfaceMuted, borderRadius: radius.md }]} />}
            <Txt variant="label" style={{ flex: 1 }}>{o}</Txt>
            {voted && <Txt variant="label" color={c.inkSoft}>{pct}%</Txt>}
          </Pressable>
        );
      })}
      <Txt variant="caption" color={c.muted}>{poll.mine != null ? `Thanks for voting · ${total} votes` : 'Tap an option to vote'}</Txt>
    </View>
  );
}

function Pulse() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(v, { toValue: 1, duration: 1200, useNativeDriver: true })).start();
  }, [v]);
  return (
    <View style={{ width: 90, height: 90, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: '#E5383B', opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) }] }} />
      <Ionicons name="radio" size={40} color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  topBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E5383B', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  handBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  stage: { padding: 12, paddingTop: 4, justifyContent: 'center' },
  slideWrap: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  slide: { aspectRatio: 16 / 9, backgroundColor: '#FFFBF3', borderRadius: 14, padding: 16, gap: 6, overflow: 'hidden' },
  pip: { position: 'absolute', right: 8, bottom: 8, width: 104, height: 72, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#3FD17C' },
  pipName: { position: 'absolute', left: 4, bottom: 3, right: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  reaction: { position: 'absolute', left: 0, right: 0, top: '30%', alignItems: 'center' },
  panel: { flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  panelTabs: { flexDirection: 'row', gap: 6, padding: 8 },
  pTab: { flex: 1, minHeight: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  msg: { maxWidth: '86%', padding: 10, borderRadius: 14, gap: 2, alignSelf: 'flex-start' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  compose: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderTopWidth: 1 },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: 999, paddingHorizontal: 16, fontSize: 15, outlineStyle: 'none' } as any,
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6, paddingTop: 10, paddingBottom: 8, backgroundColor: '#050B18' },
  ctl: { alignItems: 'center', gap: 4, minWidth: 54 },
  ctlIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  leave: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#E5383B', alignItems: 'center', justifyContent: 'center' },
  pollBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginBottom: 4, paddingHorizontal: 12, minHeight: 44, borderRadius: radius.md, borderWidth: 1.2 },
  poll: { borderWidth: 1.4, borderRadius: radius.lg, padding: 12, gap: 8, marginTop: 4 },
  pollOpt: { flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1.2, overflow: 'hidden' },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 },
});
