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

type Msg = { id: string; who: string; role: 'student' | 'instructor' | 'me' | 'system'; text: string; at: string };
type Panel = 'chat' | 'qa' | 'people' | 'files';

const BOT_LINES: Omit<Msg, 'id' | 'at'>[] = [
  { who: 'Priya S.', role: 'student', text: 'The AI keyword tool you mentioned, is it free to use?' },
  { who: 'Rajesh Kumar', role: 'instructor', text: 'Yes, the basic version is free. I’ll share the link in the resources.' },
  { who: 'Arun K.', role: 'student', text: 'Can we use the same strategy for local business SEO?' },
  { who: 'Rajesh Kumar', role: 'instructor', text: 'Absolutely! It works very well for local businesses too.' },
  { who: 'Kavya R.', role: 'student', text: 'Will this session be recorded?' },
  { who: 'Rajesh Kumar', role: 'instructor', text: 'Yes — recording will be in your Live tab within an hour.' },
  { who: 'Vignesh M.', role: 'student', text: 'This slide is gold 🔥' },
];
const SLIDES = [
  { title: 'SEO Strategy with AI Tools', points: ['Keyword research with AI', 'Content optimisation', 'Technical SEO basics', 'AI tools & workflow', 'Real-world case study'] },
  { title: 'Keyword research with AI', points: ['Seed → cluster → intent', 'Volume vs difficulty', 'Long-tail opportunities', 'Prompt: “Group these 200 keywords by intent”'] },
  { title: 'Content optimisation', points: ['One page, one intent', 'Answer the question first', 'Internal links from pillars', 'Refresh every 6 months'] },
];
const PEOPLE = ['Priya S.', 'Arun K.', 'Kavya R.', 'Vignesh M.', 'Divya M.', 'Harini P.', 'Sanjay K.', 'Meena V.'];
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
  const [viewers, setViewers] = useState(247);
  const [elapsed, setElapsed] = useState(0);
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [hand, setHand] = useState(false);
  const [panel, setPanel] = useState<Panel>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 'sys', who: 'Bodhin', role: 'system', text: 'You joined muted. Use Raise hand to speak.', at: clock() }]);
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
  const room = useRef<RoomClient | null>(null);
  const allow = useRef(makeRateLimiter(5, 5000));
  const askLimit = useRef(makeRateLimiter(1, LIVE_SCALE.broadcastQaEveryMs));
  const [seat, setSeat] = useState<SeatMode>('interactive');
  const [joinNote, setJoinNote] = useState('');
  const bc = seat === 'broadcast';
  const joinedAt = useRef(Date.now());
  const botI = useRef(0);
  const list = useRef<FlatList<Msg>>(null);

  // join (mock: instant; livekit: connect the real room)
  const connectReal = async (r: { url: string; token: string }) => {
    await prepareNative();
    room.current?.disconnect();
    const lr = new RoomClient({
      onState: (st) => st === 'disconnected' && setMsgs((m) => [...m, { id: `d${Date.now()}`, who: 'Bodhin', role: 'system', text: 'Connection lost. Reconnecting…', at: clock() }]),
      onPeople: (p) => {
        setPeople(p);
        setViewers(p.length);
      },
      onVideo: (v) => {
        setHostCam(v.hostCamera);
        setHostScreen(v.hostScreen);
      },
      onMsg: (m, from) => onRoomMsg(m, from),
    });
    room.current = lr;
    await lr.connect(r.url, r.token);
  };
  const onRoomMsg = (m: RoomMsg, from: PersonInfo) => {
    if (m.t === 'chat' || m.t === 'qa') setMsgs((x) => [...x, { id: m.id, who: from.name, role: from.isHost ? 'instructor' : 'student', text: m.t === 'qa' ? `❓ ${m.text}` : m.text, at: clock() }]);
    else if (m.t === 'qa_answer') setMsgs((x) => [...x, { id: `a${m.id}`, who: from.name, role: 'instructor', text: m.text, at: clock() }]);
    else if (m.t === 'poll') setPoll({ q: m.q, options: m.options, votes: m.options.map(() => 0), id: m.id } as never);
    else if (m.t === 'poll_close') setPoll(null);
    else if (m.t === 'react') {
      setReact(m.emoji);
      setTimeout(() => setReact(null), 1600);
    }
    else if (m.t === 'slide') setSlide(m.index % SLIDES.length);
    else if (m.t === 'stage') setStageMode(m.mode);
    else if (m.t === 'board_put' || m.t === 'board_del' || m.t === 'board_clear') { setBoard((b) => applyOp(b, m)); if (m.t === 'board_put') setStageMode('board'); }
    else if (m.t === 'allow_speak' && m.who === userId) {
      setMsgs((x) => [...x, { id: `s${Date.now()}`, who: 'Bodhin', role: 'system', text: m.on ? 'The instructor allowed you to speak. You can unmute now.' : 'The instructor muted you.', at: clock() }]);
      if (m.on) liveTab.join(userId, id).then(async (r) => { if (r.provider === 'livekit') await connectReal(r); }).catch(() => {});
    }
  };
  useEffect(() => {
    if (mode === 'recording' || !info) return;
    withRetry(() => liveTab.join(userId, id), { onRetry: (n, ms) => setJoinNote(`Many learners are joining right now. Trying again in ${Math.ceil(ms / 1000)} s (${n}/${LIVE_SCALE.retry.tries - 1})…`) })
      .then(async (r) => {
        const sm = (r.mode ?? 'interactive') as SeatMode;
        setSeat(sm);
        if (sm === 'broadcast') {
          setPanel('qa');
          setMsgs((m) => [...m.filter((x) => x.id !== 'sys'), { id: 'bc', who: 'Bodhin', role: 'system', text: `This class is full of interactive seats, so you are watching the broadcast (${LIVE_SCALE.broadcastDelay} behind). You can still ask questions and vote in polls.`, at: clock() }]);
        } else if (r.provider === 'livekit') {
          await connectReal(r);
          setReal(true);
        }
        setViewers(r.participants);
        setState('in');
        joinedAt.current = Date.now();
      })
      .catch((e) => {
        setErr((e as ApiError).message ?? String(e));
        setState('error');
      });
    return () => {
      room.current?.disconnect();
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // simulated room activity
  useEffect(() => {
    if (state !== 'in' || mode === 'recording' || !info || real) return;
    const start = new Date(info.session.startsAt).getTime();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
      setViewers((v) => Math.max(200, v + Math.round(Math.random() * 4 - 1.6)));
    }, 1000);
    const chat = setInterval(() => {
      const line = BOT_LINES[botI.current % BOT_LINES.length];
      botI.current += 1;
      setMsgs((m) => [...m, { ...line, id: `b${Date.now()}`, at: clock() }]);
    }, 5500);
    const pollT = setTimeout(() => setPoll({ q: 'Which tool do you use most for keyword research?', options: ['Google Keyword Planner', 'Ahrefs / Semrush', 'ChatGPT / AI tools', 'Not started yet'], votes: [38, 21, 52, 17] }), 9000);
    const slideT = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 14000);
    return () => {
      clearInterval(tick);
      clearInterval(chat);
      clearTimeout(pollT);
      clearInterval(slideT);
    };
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // instructor acknowledges a raised hand
  useEffect(() => {
    if (real) {
      if (state === 'in') room.current?.send({ t: 'hand', by: session?.user.name ?? 'Student', up: hand });
      return;
    }
    if (!hand) return;
    const t = setTimeout(() => {
      setMsgs((m) => [...m, { id: `h${Date.now()}`, who: info?.tutor.name ?? 'Instructor', role: 'instructor', text: `${session?.user.name.split(' ')[0]}, I see your hand — please type your question, I’ll take it next.`, at: clock() }]);
      setHand(false);
    }, 6000);
    return () => clearTimeout(t);
  }, [hand]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (bc) {
      // Broadcast viewers ask over HTTP (real: POST live-question, rate-limited server-side too); no open chat.
      if (!askLimit.current(userId)) {
        setMsgs((m) => [...m, { id: msgId, who: 'Bodhin', role: 'system', text: 'In a big class you can ask one question every 30 seconds.', at: clock() }]);
        return;
      }
    } else if (real) {
      if (!allow.current(userId)) {
        setMsgs((m) => [...m, { id: msgId, who: 'Bodhin', role: 'system', text: 'Slow down a little — you are sending messages too fast.', at: clock() }]);
        return;
      }
      room.current?.send({ t: panel === 'qa' ? 'qa' : 'chat', id: msgId, by: session?.user.name ?? 'Student', text: t.slice(0, 500), at: Date.now() });
    }
    setMsgs((m) => [...m, { id: msgId, who: 'You', role: 'me', text: panel === 'qa' ? `❓ ${t}` : t, at: clock() }]);
    setDraft('');
  };
  const vote = (i: number) => {
    const pid = (poll as unknown as { id?: string } | null)?.id;
    if (real && pid) room.current?.send({ t: 'vote', pollId: pid, option: i, by: session?.user.name ?? 'Student' });
    setPoll((p) => (p && p.mine == null ? { ...p, mine: i, votes: p.votes.map((v, k) => (k === i ? v + 1 : v)) } : p));
  };
  const sendReaction = (e: string) => {
    if (real) room.current?.send({ t: 'react', by: session?.user.name ?? 'Student', emoji: e });
    setReact(e);
    setTimeout(() => setReact(null), 1600);
  };
  const toggleMic = () => {
    if (!real) return setMic((m) => !m);
    room.current
      ?.setMic(!mic)
      .then(() => setMic((m) => !m))
      .catch(() => setMsgs((m) => [...m, { id: `p${Date.now()}`, who: 'Bodhin', role: 'system', text: 'You can speak after the instructor allows it. Use Raise hand.', at: clock() }]));
  };
  const toggleCam = () => {
    if (!real) return setCam((v) => !v);
    room.current
      ?.setCam(!cam)
      .then(() => setCam((v) => !v))
      .catch(() => setMsgs((m) => [...m, { id: `p${Date.now()}`, who: 'Bodhin', role: 'system', text: 'Your video can be turned on after the instructor allows it.', at: clock() }]));
  };
  const mm = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const stage = (
    <View style={[styles.stage, wide && { flex: 1 }]}>
      <View style={styles.slideWrap}>
        {stageMode === 'board' ? (
          <View style={[styles.slide, { padding: 0, overflow: 'hidden', backgroundColor: '#fff' }]}><BoardView items={board} /></View>
        ) : real ? (
          <View style={[styles.slide, { padding: 0, overflow: 'hidden', backgroundColor: '#000' }]}>
            <RoomVideo stream={hostScreen ?? hostCam} fit={hostScreen ? 'contain' : 'cover'} />
            {!hostScreen && !hostCam && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Avatar name={tutor.name} color={tutor.color} size={64} />
                <Txt variant="label" color="#fff">Waiting for {tutor.name.split(' ')[0]} to start video…</Txt>
              </View>
            )}
          </View>
        ) : (
        <View style={styles.slide}>
          <Txt variant="caption" color="#64748B" style={{ fontWeight: '700' }}>{tutor.name.toUpperCase()} IS SHARING</Txt>
          <Txt variant="title" color="#0E1B33" style={{ fontSize: wide ? 30 : 19, lineHeight: wide ? 36 : 24 }}>{SLIDES[slide].title}</Txt>
          <View style={{ width: 44, height: 3, backgroundColor: '#E8A21B', borderRadius: 2 }} />
          {SLIDES[slide].points.map((p) => (
            <View key={p} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle" size={wide ? 20 : 15} color="#E8A21B" />
              <Txt variant={wide ? 'body' : 'caption'} color="#1E293B" style={{ fontWeight: '600' }}>{p}</Txt>
            </View>
          ))}
          <Txt variant="caption" color="#94A3B8" style={{ position: 'absolute', right: 12, bottom: 8 }}>{slide + 1} / 24</Txt>
        </View>
        )}
        {!real && <LinearGradient colors={[course.art.from, course.art.to]} style={[styles.pip, wide && { width: 200, height: 130 }]}>
          <Avatar name={tutor.name} color={tutor.color} size={wide ? 56 : 40} />
          <View style={styles.pipName}>
            <Ionicons name="mic" size={11} color="#3FD17C" />
            <Txt variant="caption" color="#fff" style={{ fontSize: 10 }} numberOfLines={1}>{tutor.name}</Txt>
          </View>
        </LinearGradient>}
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
          data={real ? people.map((p) => (p.isHost ? `${p.name} (Instructor)` : p.id === userId ? 'You' : p.name)) : [`${tutor.name} (Instructor)`, 'You', ...PEOPLE]}
          keyExtractor={(x) => x}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          ListFooterComponent={real ? undefined : <Txt variant="caption" color={c.muted} center style={{ marginTop: 8 }}>+ {viewers - PEOPLE.length - 2} more</Txt>}
          renderItem={({ item, index }) => (
            <View style={styles.person}>
              <Avatar name={item} size={34} color={index === 0 ? tutor.color : c.inkSoft} />
              <Txt variant="label" style={{ flex: 1 }}>{item}</Txt>
              <Ionicons name={index === 0 ? 'mic' : 'mic-off'} size={16} color={index === 0 ? c.success : c.muted} />
            </View>
          )}
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
            {!bc && <Ctl icon="hand-left" label={hand ? 'Lower' : 'Raise hand'} active={hand} onPress={() => setHand((h) => !h)} />}
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
