/**
 * Live class room for learners — mobile portrait first; wide screens get stage + side panel.
 *
 * Flow: join check → lobby (real camera / microphone preview, your choice) → room.
 * In the room you see and hear your teacher (camera, shared screen or whiteboard), chat, ask questions, vote in
 * polls, raise your hand and — when allowed — speak and show your own camera. Nothing here is scripted:
 * everything on screen comes from the teacher and the other learners in the class.
 * mode=recording plays the past session's recording instead.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { DeviceCheck, useDeviceCheck } from '@/ui/DeviceCheck';
import { applyOp, type BoardItem } from '@/core/ink';
import { makeRateLimiter, REACTIONS, type RoomMsg } from '@/live/protocol';
import type { Person } from '@/live/room';
import { useLiveRoom, type LiveRoomOptions } from '@/live/useLiveRoom';
import { useDbTick } from '@/live/useDbTick';

type Msg = { id: string; who: string; role: 'student' | 'instructor' | 'me' | 'system'; text: string; at: string };
type QA = { id: string; who: string; text: string; me: boolean; answer?: string };
type PollState = { id: string; q: string; options: string[]; mine?: number; open: boolean };
type Panel = 'chat' | 'qa' | 'people';
type Media = { provider: Awaited<ReturnType<typeof liveTab.join>>['provider']; url: string; token: string; room: string; hostIds: string[] };

const clock = (d = new Date()) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const hms = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function LiveRoom() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const { c } = useTheme();
  const { session, ready } = useAuth();
  const userId = session?.user.id ?? '';
  const name = session?.user.name ?? 'Student';
  const tick = useDbTick(3000);
  const info = liveTab.session(id);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const check = useDeviceCheck({ mic: false, cam: false });

  const [phase, setPhase] = useState<'joining' | 'lobby' | 'in' | 'error'>(mode === 'recording' ? 'in' : 'joining');
  const [err, setErr] = useState('');
  const [media, setMedia] = useState<Media | null>(null);
  const [seat, setSeat] = useState<SeatMode>('interactive');
  const [joinNote, setJoinNote] = useState('');
  const [opts, setOpts] = useState<LiveRoomOptions | null>(null);
  const [panel, setPanel] = useState<Panel>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [qa, setQa] = useState<QA[]>([]);
  const [draft, setDraft] = useState('');
  const [board, setBoard] = useState<BoardItem[]>([]);
  const [stageMode, setStageMode] = useState<'slides' | 'screen' | 'board'>('slides');
  const [poll, setPoll] = useState<PollState | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [react, setReact] = useState<string | null>(null);
  const [hand, setHand] = useState(false);
  const [locked, setLocked] = useState(false); // the teacher muted the class
  const [ended, setEnded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const chatLimit = useRef(makeRateLimiter(5, 5000));
  const askLimit = useRef(makeRateLimiter(1, LIVE_SCALE.broadcastQaEveryMs));
  const joinedAt = useRef(Date.now());
  const left = useRef(false);
  const list = useRef<FlatList<Msg>>(null);
  const bc = seat === 'broadcast';
  const sys = (text: string) => setMsgs((m) => [...m, { id: `s${Date.now()}${Math.random()}`, who: 'Bodhin', role: 'system', text, at: clock() }]);

  /* 1) join check → lobby */
  useEffect(() => {
    if (mode === 'recording' || !info || !ready || !userId) return; // after a page refresh, wait until we know who is signed in
    let dead = false;
    withRetry(() => liveTab.join(userId, id), { onRetry: (n, ms) => setJoinNote(`Many learners are joining right now. Trying again in ${Math.ceil(ms / 1000)} s (${n}/${LIVE_SCALE.retry.tries - 1})…`) })
      .then((r) => {
        if (dead) return;
        setSeat((r.mode ?? 'interactive') as SeatMode);
        setMedia({ provider: r.provider, url: r.url, token: r.token, room: r.room, hostIds: r.hostIds });
        setPhase('lobby');
      })
      .catch((e) => {
        if (dead) return;
        setErr((e as ApiError).message ?? String(e));
        setPhase('error');
      });
    return () => {
      dead = true;
    };
  }, [id, ready, userId, !!info]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* 2) the room */
  const rt = useLiveRoom(opts, (m: RoomMsg, from: Person) => onRoomMsg(m, from));
  function onRoomMsg(m: RoomMsg, from: Person) {
    const host = from.role === 'host';
    if (m.t === 'chat') setMsgs((x) => [...x.slice(-300), { id: m.id, who: from.name, role: host ? 'instructor' : 'student', text: m.text, at: clock() }]);
    else if (m.t === 'qa') setQa((x) => (x.some((y) => y.id === m.id) ? x : [...x, { id: m.id, who: from.name, text: m.text, me: false }]));
    else if (m.t === 'qa_answer') setQa((x) => x.map((y) => (y.id === m.id ? { ...y, answer: m.text } : y)));
    else if (m.t === 'poll') {
      setPoll({ id: m.id, q: m.q, options: m.options, open: true });
      sys('Your teacher started a poll.');
    } else if (m.t === 'poll_close') setPoll((p) => (p && p.id === m.id ? { ...p, open: false } : p));
    else if (m.t === 'react') {
      setReact(m.emoji);
      setTimeout(() => setReact(null), 1600);
    } else if (m.t === 'stage') setStageMode(m.mode);
    else if (m.t === 'board_put' || m.t === 'board_del' || m.t === 'board_clear') {
      setBoard((b) => applyOp(b, m));
      if (m.t === 'board_put') setStageMode('board');
    } else if (m.t === 'allow_speak' && (m.who === userId || m.who === '*')) {
      if (m.on) {
        setLocked(false);
        setHand(false);
        sys(m.who === '*' ? 'You can unmute yourself again.' : 'The teacher allowed you to speak. You can unmute now.');
      } else {
        setLocked(true);
        void rt.setMic(false);
        void rt.setCam(false);
        sys('The teacher muted the class. Raise your hand to speak.');
      }
    } else if (m.t === 'end') setEnded(true);
  }

  const rs = liveTab.roomState(id); // re-evaluated on every data change (tick)
  void tick;
  const host = rt.people.find((p, i) => i > 0 && p.role === 'host') ?? null;
  const hostStreams = host ? rt.streams[host.id] : undefined;
  const hostName = rs.host?.name ?? host?.name ?? info?.tutor.name ?? 'your teacher';
  const classOver = ended || rs.state === 'ended' || rs.state === 'cancelled';
  const students = rt.people.filter((p, i) => i > 0 && p.role !== 'host');

  // Attendance minutes are saved once, however the learner leaves (button, back, closed tab).
  const leaveNow = () => {
    if (left.current || mode === 'recording') return;
    left.current = true;
    rt.leave();
    liveTab.leave(userId, id, (Date.now() - joinedAt.current) / 6e4);
  };
  useEffect(() => () => leaveNow(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    window.addEventListener('pagehide', leaveNow);
    return () => window.removeEventListener('pagehide', leaveNow);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [msgs.length]);

  const join = () => {
    if (!media || !info) return;
    const o: LiveRoomOptions = { provider: media.provider, url: media.url, token: media.token, room: media.room, userId, name, role: 'student', hostUserIds: media.hostIds, startMic: check.mic, startCam: check.cam, micDevice: check.micId, camDevice: check.camId };
    check.release(); // hand the devices to the room
    joinedAt.current = Date.now();
    setOpts(o);
    setPhase('in');
    setPanel(bc ? 'qa' : 'chat');
    if (bc) sys(`This class is full of interactive seats, so you are in view-only mode. You can still ask questions.`);
  };

  const leave = () => {
    leaveNow();
    router.canGoBack() ? router.back() : router.replace('/live');
  };

  if (!info) return null;
  const { session: s, course, tutor } = info;

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

  if (phase === 'joining' || phase === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: '#050B18', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        {phase === 'joining' ? (
          <>
            <Pulse />
            <Txt variant="heading" color="#fff" center>Opening {s.title}…</Txt>
            <Txt variant="label" color="rgba(255,255,255,0.7)" center>{joinNote || 'Checking your access.'}</Txt>
          </>
        ) : (
          <>
            <Banner text={err} />
            <Button title="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/live'))} />
          </>
        )}
      </View>
    );
  }

  /* ── lobby: check your camera and microphone, then join ── */
  if (phase === 'lobby') {
    const waiting = rs.state === 'waiting';
    return (
      <View style={{ flex: 1, backgroundColor: '#050B18' }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <TopBar title={s.title} sub={`${course.title} · ${tutor.name}`} onBack={leave} />
          <ScrollView contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
            <View style={{ width: '100%', maxWidth: 640, gap: 14 }}>
              {classOver ? (
                <Banner text={rs.state === 'cancelled' ? 'This class was cancelled.' : 'This class has ended. The recording will be in your Live tab → Past.'} />
              ) : waiting ? (
                <Banner tone="info" text={`${tutor.name.split(' ')[0]} hasn’t started the class yet. Set up your camera and microphone — you’ll see and hear them the moment they go live.`} />
              ) : (
                <Banner tone="success" text={`${hostName.split(' ')[0]} is live now. Check your devices and join.`} />
              )}
              <DeviceCheck check={check} name={name} dark />
              <Txt variant="caption" color="rgba(255,255,255,0.6)">You join with your microphone and camera off unless you turn them on here. You can change them any time in the class.</Txt>
            </View>
          </ScrollView>
          <View style={{ padding: 12, alignItems: 'center' }}>
            <Button title={waiting ? 'Join waiting room' : 'Join class'} iconLeft="enter-outline" disabled={classOver} onPress={join} style={{ width: '100%', maxWidth: 640, backgroundColor: '#E5383B' }} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  /* ── in the room ── */
  const elapsed = rs.startedAt ? Math.max(0, Math.floor((now - new Date(rs.startedAt).getTime()) / 1000)) : 0;
  const settings = rs.settings;

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    const mid = `${userId}-${Date.now()}`;
    if (panel === 'qa' || bc) {
      if (!settings.qa) return sys('Questions are turned off for this class.');
      if (bc && !askLimit.current(userId)) return sys('In a big class you can ask one question every 30 seconds.');
      rt.send({ t: 'qa', id: mid, by: name, text: t.slice(0, 500), at: Date.now() });
      setQa((x) => [...x, { id: mid, who: 'You', text: t, me: true }]);
    } else {
      if (!settings.chat) return sys('Chat is turned off for this class.');
      if (!chatLimit.current(userId)) return sys('Slow down a little — you are sending messages too fast.');
      rt.send({ t: 'chat', id: mid, by: name, text: t.slice(0, 500), at: Date.now() });
      setMsgs((m) => [...m, { id: mid, who: 'You', role: 'me', text: t, at: clock() }]);
    }
    setDraft('');
  };
  const vote = (i: number) => {
    if (!poll || poll.mine != null || !poll.open) return;
    rt.send({ t: 'vote', pollId: poll.id, option: i, by: name });
    setPoll({ ...poll, mine: i });
  };
  const sendReaction = (e: string) => {
    rt.send({ t: 'react', by: name, emoji: e });
    setReact(e);
    setReactOpen(false);
    setTimeout(() => setReact(null), 1600);
  };
  const needHand = () => sys('The teacher has muted the class. Raise your hand to speak.');
  const toggleMic = () => (locked && !rt.mic ? needHand() : void rt.setMic(!rt.mic));
  const toggleCam = () => (locked && !rt.cam ? needHand() : void rt.setCam(!rt.cam));
  const toggleHand = () => {
    const up = !hand;
    setHand(up);
    rt.send({ t: 'hand', by: name, up });
  };

  const showScreen = !!(host?.screen && hostStreams?.screen);
  const stage = (
    <View style={[styles.stage, wide && { flex: 1 }]}>
      <View style={styles.slideWrap}>
        <View style={[styles.slide, { padding: 0, backgroundColor: '#000' }]}>
          {showScreen ? (
            <RoomVideo stream={hostStreams!.screen} fit="contain" label="Shared screen" />
          ) : stageMode === 'board' ? (
            <View style={{ flex: 1, backgroundColor: '#fff' }}><BoardView items={board} /></View>
          ) : host?.cam && hostStreams?.camera ? (
            <RoomVideo stream={hostStreams.camera} label={`${host.name} camera`} />
          ) : (
            <View style={styles.center}>
              <Avatar name={hostName} color={tutor.color} size={72} />
              <Txt variant="label" color="#fff" center>
                {classOver ? 'The class has ended.' : !host ? (rs.state === 'live' ? `Connecting to ${hostName.split(' ')[0]}…` : `Waiting for ${hostName.split(' ')[0]} to start the class…`) : 'The teacher’s camera is off.'}
              </Txt>
            </View>
          )}
          {showScreen && host?.cam && hostStreams?.camera && (
            <View style={styles.pipHost}><RoomVideo stream={hostStreams.camera} label="Teacher camera" /></View>
          )}
          {host && !host.mic && !classOver && <View style={styles.mutedTag}><Ionicons name="mic-off" size={12} color="#fff" /></View>}
          {host?.speaking && <View style={styles.speakTag}><Ionicons name="mic" size={12} color="#3FD17C" /><Txt variant="caption" color="#fff" style={{ fontSize: 10 }}>{host.name.split(' ')[0]}</Txt></View>}
        </View>
        {rt.cam && rt.localCamera && (
          <View style={[styles.pip, wide && { width: 200, height: 130 }]}>
            <RoomVideo stream={rt.localCamera} mirror label="Your camera" />
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

  const questions = qa;
  const panelView = (
    <View style={[styles.panel, { backgroundColor: c.surface }, wide && { width: 380, borderRadius: 20, margin: 12 }]}>
      <View style={styles.panelTabs} accessibilityRole="tablist">
        {([
          ['chat', 'Chat'],
          ['qa', 'Q&A'],
          ['people', `People (${rt.people.length})`],
        ] as const).filter(([k]) => !bc || k !== 'chat').map(([k, l]) => (
          <Pressable key={k} onPress={() => setPanel(k)} accessibilityRole="tab" accessibilityState={{ selected: panel === k }} style={[styles.pTab, panel === k && { backgroundColor: c.primary }]}>
            <Txt variant="caption" color={panel === k ? '#fff' : c.inkSoft} style={{ fontWeight: '700' }} numberOfLines={1}>{l}</Txt>
          </Pressable>
        ))}
      </View>

      {poll && panel !== 'people' && (
        <Pressable onPress={() => setPollOpen(true)} style={[styles.pollBanner, { backgroundColor: c.primarySoft, borderColor: c.primary }]} accessibilityRole="button">
          <Ionicons name="bar-chart" size={18} color={c.primary} />
          <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{poll.q}</Txt>
          <Txt variant="label" color={c.primary}>{poll.mine == null && poll.open ? 'Vote' : poll.open ? 'Voted' : 'Closed'}</Txt>
        </Pressable>
      )}

      {panel === 'people' ? (
        <FlatList
          data={[...(host ? [host] : []), ...rt.people.filter((p, i) => i === 0), ...students]}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          ListEmptyComponent={<Txt variant="caption" color={c.muted} center>Nobody else is here yet.</Txt>}
          renderItem={({ item: p }) => (
            <View style={styles.person}>
              <Avatar name={p.name} size={34} color={p.role === 'host' ? tutor.color : undefined} />
              <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{p.id === rt.me?.id ? 'You' : p.name}{p.role === 'host' ? ' · Instructor' : ''}</Txt>
              <Ionicons name={p.cam ? 'videocam' : 'videocam-off-outline'} size={15} color={p.cam ? c.success : c.muted} />
              <Ionicons name={p.mic ? 'mic' : 'mic-off'} size={16} color={p.mic ? c.success : c.muted} />
            </View>
          )}
        />
      ) : panel === 'qa' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
          {!questions.length && <Txt variant="caption" color={c.muted} center>{settings.qa ? 'Ask your teacher a question. Answers appear right under it.' : 'Questions are turned off for this class.'}</Txt>}
          {questions.map((q) => (
            <View key={q.id} style={[styles.msg, { backgroundColor: q.me ? c.primarySoft : c.surfaceMuted, maxWidth: '100%', alignSelf: 'stretch' }]}>
              <Txt variant="caption" color={c.inkSoft} style={{ fontWeight: '700' }}>{q.who}</Txt>
              <Txt variant="label" style={{ fontWeight: '500' }}>{q.text}</Txt>
              {q.answer && <Txt variant="caption" color={c.success} style={{ fontWeight: '600' }}>↳ {q.answer}</Txt>}
            </View>
          ))}
        </ScrollView>
      ) : (
        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          ListEmptyComponent={<Txt variant="caption" color={c.muted} center>{settings.chat ? 'Say hello 👋 Messages here are seen by the whole class.' : 'Chat is turned off for this class.'}</Txt>}
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

      {panel !== 'people' && (
        <View style={[styles.compose, { borderTopColor: c.border }]}>
          <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={send} placeholder={panel === 'qa' ? 'Ask the instructor a question…' : 'Message everyone…'} placeholderTextColor={c.muted} returnKeyType="send" accessibilityLabel={panel === 'qa' ? 'Ask a question' : 'Chat message'} style={[styles.input, { backgroundColor: c.surfaceMuted, color: c.ink }]} />
          <Pressable onPress={send} disabled={!draft.trim()} style={[styles.sendBtn, { backgroundColor: c.primary, opacity: draft.trim() ? 1 : 0.5 }]} accessibilityRole="button" accessibilityLabel="Send">
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );

  const note = classOver ? null : rt.notice ?? (rt.status === 'error' ? rt.error : rt.status === 'reconnecting' ? 'Connection lost. Reconnecting…' : null);

  return (
    <View style={{ flex: 1, backgroundColor: '#050B18' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TopBar title={s.title} sub={course.title} onBack={() => setLeaveAsk(true)} live={!classOver && !!host} viewers={rt.people.length} time={hms(elapsed)} />
          {note && (
            <View style={[styles.handBar, { backgroundColor: '#8A2B2B' }]} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color="#fff" />
              <Txt variant="label" color="#fff" style={{ flex: 1 }}>{note}</Txt>
              {rt.notice && <Pressable onPress={rt.clearNotice} accessibilityRole="button" accessibilityLabel="Dismiss"><Ionicons name="close" size={18} color="#fff" /></Pressable>}
            </View>
          )}
          {bc && (
            <View style={[styles.handBar, { backgroundColor: '#12407F' }]} accessibilityRole="text">
              <Ionicons name="radio-outline" size={16} color="#fff" />
              <Txt variant="label" color="#fff" style={{ flex: 1 }}>View-only seat · ask in Q&A</Txt>
            </View>
          )}
          {hand && (
            <View style={[styles.handBar, { backgroundColor: c.accent }]}>
              <Ionicons name="hand-left" size={16} color="#fff" />
              <Txt variant="label" color="#fff">Hand raised · your teacher can see it</Txt>
            </View>
          )}
          <View style={[{ flex: 1 }, wide && { flexDirection: 'row' }]}>
            {stage}
            {panelView}
          </View>

          <View style={styles.controls}>
            {!bc && <Ctl icon={rt.mic ? 'mic' : 'mic-off'} label={rt.mic ? 'Mute' : 'Unmute'} off={!rt.mic} busy={rt.busy.mic} onPress={toggleMic} />}
            {!bc && <Ctl icon={rt.cam ? 'videocam' : 'videocam-off'} label={rt.cam ? 'Stop video' : 'Video'} off={!rt.cam} busy={rt.busy.cam} onPress={toggleCam} />}
            {!bc && <Ctl icon="hand-left" label={hand ? 'Lower' : 'Raise hand'} active={hand} onPress={toggleHand} />}
            {!bc && <Ctl icon="happy-outline" label="React" onPress={() => setReactOpen(true)} />}
            {bc && <Ctl icon="chatbubble-ellipses-outline" label="Ask" onPress={() => setPanel('qa')} />}
            <Ctl icon="ellipsis-horizontal" label="More" onPress={() => setMore(true)} />
            <Pressable onPress={() => setLeaveAsk(true)} style={styles.leave} accessibilityRole="button" accessibilityLabel="Leave class">
              <Ionicons name="call" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {classOver && (
        <View style={styles.endedOverlay}>
          <Ionicons name="checkmark-circle" size={56} color="#3FD17C" />
          <Txt variant="heading" color="#fff" center>{rs.state === 'cancelled' ? 'This class was cancelled' : 'The class has ended'}</Txt>
          <Txt variant="label" color="rgba(255,255,255,0.75)" center>Your attendance is saved. The recording appears in your Live tab → Past when the teacher publishes it.</Txt>
          <Button title="Back to Live" onPress={leave} style={{ minWidth: 200 }} />
        </View>
      )}

      <BottomSheet open={pollOpen && !!poll} onClose={() => setPollOpen(false)} title="Live poll">
        {poll && <PollView poll={poll} onVote={vote} />}
      </BottomSheet>

      <BottomSheet open={reactOpen} onClose={() => setReactOpen(false)} title="React">
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 }}>
          {REACTIONS.map((e) => (
            <Pressable key={e} onPress={() => sendReaction(e)} accessibilityRole="button" accessibilityLabel={`React ${e}`} style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 32, backgroundColor: c.surfaceMuted }}>
              <Txt style={{ fontSize: 30 }}>{e}</Txt>
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet open={more} onClose={() => setMore(false)} title="More">
        {([
          ['information-circle-outline', 'Class info', `${s.title} · ${tutor.name}`, () => setMore(false)],
          ['bar-chart-outline', 'Live poll', poll ? (poll.open ? 'Vote or see your answer' : 'This poll is closed') : 'No poll right now', () => { setMore(false); if (poll) setPollOpen(true); }],
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
        <Txt color={c.inkSoft}>Your attendance is saved. You can rejoin while the class is live. The recording will be in your Live tab after the class.</Txt>
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
            {viewers} in class · {time}
          </Txt>
        </View>
      )}
    </View>
  );
}

function Ctl({ icon, label, onPress, off, active, busy }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; off?: boolean; active?: boolean; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={[styles.ctl, busy && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active, busy: !!busy }}>
      <View style={[styles.ctlIcon, off && { backgroundColor: 'rgba(229,56,59,0.18)' }, active && { backgroundColor: '#D99A1E' }]}>
        <Ionicons name={icon} size={22} color={off ? '#FF6B6E' : '#fff'} />
      </View>
      <Txt variant="caption" color="rgba(255,255,255,0.8)" style={{ fontSize: 10.5 }} numberOfLines={1}>{label}</Txt>
    </Pressable>
  );
}

function PollView({ poll, onVote }: { poll: PollState; onVote: (i: number) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.poll, { borderColor: c.primary, backgroundColor: c.primarySoft }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="bar-chart" size={16} color={c.primary} />
        <Txt variant="caption" color={c.primary} style={{ fontWeight: '800' }}>{poll.open ? 'LIVE POLL' : 'POLL CLOSED'}</Txt>
      </View>
      <Txt variant="bodyStrong">{poll.q}</Txt>
      {poll.options.map((o, i) => {
        const mine = poll.mine === i;
        return (
          <Pressable key={o + i} disabled={poll.mine != null || !poll.open} onPress={() => onVote(i)} style={[styles.pollOpt, { borderColor: mine ? c.primary : c.border, backgroundColor: mine ? c.primarySoft : c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: mine }}>
            <Txt variant="label" style={{ flex: 1 }}>{o}</Txt>
            {mine && <Ionicons name="checkmark-circle" size={20} color={c.primary} />}
          </Pressable>
        );
      })}
      <Txt variant="caption" color={c.muted}>{poll.mine != null ? 'Thanks — your vote is in. Your teacher sees the results.' : poll.open ? 'Tap an option to vote' : 'The teacher closed this poll.'}</Txt>
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
  slide: { aspectRatio: 16 / 9, borderRadius: 14, gap: 6, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  pip: { position: 'absolute', right: 8, bottom: 8, width: 104, height: 72, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#3FD17C', backgroundColor: '#0B1426' },
  pipHost: { position: 'absolute', right: 8, top: 8, width: 110, height: 76, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  mutedTag: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(229,56,59,0.9)', borderRadius: 10, padding: 5 },
  speakTag: { position: 'absolute', left: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  reaction: { position: 'absolute', left: 0, right: 0, top: '30%', alignItems: 'center' },
  panel: { flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  panelTabs: { flexDirection: 'row', gap: 6, padding: 8 },
  pTab: { flex: 1, minHeight: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  msg: { maxWidth: '86%', padding: 10, borderRadius: 14, gap: 2, alignSelf: 'flex-start' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
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
  endedOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(5,11,24,0.94)', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
});
