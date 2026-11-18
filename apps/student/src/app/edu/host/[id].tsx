/**
 * Host live room. Stage: slides · screen share · whiteboard (draw with finger/mouse).
 * Panel: Chat · Q&A · Polls · People (raised hands). Phone: stage on top, panel below, controls in thumb zone.
 * ≥900px: stage left, panel right. Media/realtime are simulated in the POC (real: WebRTC SFU + websocket).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { liveAdmin } from '@/api/client';
import type { LiveSummary } from '@/core/batch';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { RoomClient, prepareNative } from '@/live/livekit';
import { RoomVideo } from '@/ui/RoomVideo';
import { SmartBoard } from '@/ui/SmartBoard';
import { RealtimeRoomSession, type RoomParticipant } from '@/live/realtimeRoom';

type Stage = 'slides' | 'screen' | 'board';
type PanelTab = 'chat' | 'qa' | 'polls' | 'people';
type Msg = { id: string; by: string; text: string; me?: boolean; sys?: boolean };
type Q = { id: string; q: string; by: string; votes: number; answered: boolean; a?: string };
type Poll = { q: string; options: string[]; votes: number[]; open: boolean };
type Stroke = { color: string; w: number; pts: [number, number][] };

const COLORS = ['#0E1B33', '#E5383B', '#1D5FD0', '#15803D', '#E8A21B'];
const fmt = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
let seq = 0;
const nid = () => `x${++seq}`;

export default function HostRoom() {
  const { id, cam: camP, mic: micP } = useLocalSearchParams<{ id: string; cam?: string; mic?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const info = useMemo(() => liveAdmin.get(userId, id), [userId, id]);
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState<Stage>('slides');
  const [slide, setSlide] = useState(0);
  const [mic, setMic] = useState(micP !== '0');
  const [cam, setCam] = useState(camP !== '0');
  const [rec, setRec] = useState(!!info?.session.settings.record);
  const [tab, setTab] = useState<PanelTab>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 'w', by: 'Bodhin', text: 'Class is live. Students have been notified.', sys: true }]);
  const [draft, setDraft] = useState('');
  const [qs, setQs] = useState<Q[]>([]);
  const [answering, setAnswering] = useState<Q | null>(null);
  const [answer, setAnswer] = useState('');
  const [poll, setPoll] = useState<Poll | null>(null);
  const [pastPolls, setPastPolls] = useState<Poll[]>([]);
  const [pollForm, setPollForm] = useState(false);
  const [pq, setPq] = useState('');
  const [popts, setPopts] = useState(['', '']);
  const [joined, setJoined] = useState(0);
  const [peak, setPeak] = useState(0);
  const [hands, setHands] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [mutedAll, setMutedAll] = useState(false);
  const [chapters, setChapters] = useState<LiveSummary['chapters']>([{ atSec: 0, label: 'Class introduction' }]);
  const [materials, setMaterials] = useState<LiveSummary['materials']>([]);
  const [unread, setUnread] = useState(0);
  const [ending, setEnding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [pen, setPen] = useState(COLORS[0]);
  const live = useRef<Stroke | null>(null);
  const [, force] = useState(0);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const audience = info?.audience ?? [];
  const names = audience.map((p) => p.name);
  const slides = useMemo(() => {
    if (!info) return [];
    const lessons = info.course.modules.flatMap((m) => m.lessons.filter((l) => l.type === 'video').map((l) => l.title)).slice(0, 5);
    return [{ t: info.session.title, s: info.course.title }, { t: 'Today’s agenda', s: lessons.slice(0, 3).join(' · ') }, ...lessons.map((l) => ({ t: l, s: info.session.topic })), { t: 'Questions?', s: 'Use Q&A — upvote what you want answered' }];
  }, [info]);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2000);
  };
  const chapter = (label: string) => setChapters((x) => (x[x.length - 1]?.label === label ? x : [...x, { atSec: elapsed, label }]));

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [attendees, setAttendees] = useState<RoomParticipant[]>([]);
  const realtime = useRef<RealtimeRoomSession | null>(null);

  useEffect(() => {
    if (!info || !session) return;
    const sess = new RealtimeRoomSession(id, {
      id: userId,
      name: session.user.name,
      role: 'host',
    }, {
      onParticipants: (pList) => {
        const studentParticipants = pList.filter((p) => !p.isHost && p.id !== userId);
        setAttendees(studentParticipants);
        setJoined(studentParticipants.length);
        setPeak((p) => Math.max(p, studentParticipants.length));
      },
      onChat: (m) => {
        setMsgs((prev) => [...prev.slice(-60), { id: m.id, by: m.by, text: m.text }]);
        if (tabRef.current !== 'chat') setUnread((u) => u + 1);
      },
      onQA: (q) => {
        setQs((prev) => [...prev, { id: q.id, q: q.q, by: q.by, votes: q.votes, answered: false }]);
      },
      onHand: (who, up) => {
        setHands((h) => (up ? (h.includes(who) ? h : [...h, who]) : h.filter((x) => x !== who)));
      },
      onPoll: (p) => {
        if (p) setPoll(p);
      },
    });

    realtime.current = sess;
    sess.announceJoin();

    // Start local camera & mic
    sess.startCamera(cam, mic).then((st) => {
      setLocalStream(st);
    });

    return () => {
      sess.dispose();
      realtime.current = null;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tx = (m: any) => {
    if (m.t === 'slide') realtime.current?.changeSlide(m.index);
    else if (m.t === 'stage') realtime.current?.changeStage(m.mode);
    else if (m.t === 'allow_speak') realtime.current?.allowSpeak(m.who, m.on);
    else if (m.t === 'chat') realtime.current?.sendChat(m.text);
    else if (m.t === 'poll') realtime.current?.launchPoll(m.id, m.q, m.options);
    else if (m.t === 'poll_close') realtime.current?.closePoll(m.id);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          live.current = { color: penRef.current, w: penRef.current === 'eraser' ? 18 : 3, pts: [[e.nativeEvent.locationX, e.nativeEvent.locationY]] };
          force((n) => n + 1);
        },
        onPanResponderMove: (e) => {
          live.current?.pts.push([e.nativeEvent.locationX, e.nativeEvent.locationY]);
          force((n) => n + 1);
        },
        onPanResponderRelease: () => {
          const s = live.current;
          live.current = null;
          if (s) {
            txRef.current?.({ t: 'stroke', color: s.color, w: s.w, pts: s.pts.slice(0, 400) as [number, number][] });
            setStrokes((x) => [...x, s]);
            setRedo([]);
          }
        },
      }),
    [],
  );
  const pollId = useRef('');
  const txRef = useRef<typeof tx | null>(null);
  txRef.current = tx;
  const penRef = useRef(pen);
  penRef.current = pen;

  if (!info || !session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="You can’t host this class." />
        <Button title="Back to Live" onPress={() => router.replace('/educator/live')} />
      </SafeAreaView>
    );
  }
  const s = info.session;
  const toPath = (st: Stroke) => st.pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

  const sendChat = () => {
    if (!draft.trim()) return;
    const mid = nid();
    tx({ t: 'chat', id: `${userId}-${Date.now()}`, by: session.user.name, text: draft.trim().slice(0, 500), at: Date.now() });
    setMsgs((m) => [...m, { id: mid, by: session.user.name, text: draft.trim(), me: true }]);
    setDraft('');
  };
  const launchPoll = () => {
    const options = popts.map((o) => o.trim()).filter(Boolean);
    if (pq.trim().length < 4 || options.length < 2) return flash('Add a question and at least 2 options');
    pollId.current = `poll${Date.now()}`;
    tx({ t: 'poll', id: pollId.current, q: pq.trim().slice(0, 200), options: options.slice(0, 6) });
    setPoll({ q: pq.trim(), options, votes: options.map(() => 0), open: true });
    setPollForm(false);
    setPq('');
    setPopts(['', '']);
    chapter(`Poll: ${pq.trim()}`);
  };
  const stopPoll = () => {
    if (!poll) return;
    tx({ t: 'poll_close', id: pollId.current });
    setPastPolls((x) => [...x, { ...poll, open: false }]);
    setPoll(null);
    flash('Poll closed · results shared with class');
  };
  const shareFile = () => {
    const m = { name: `${s.topic} – Slides.pdf`, size: '3.2 MB', kind: 'pdf' as const };
    if (materials.some((x) => x.name === m.name)) return flash('Already shared');
    setMaterials((x) => [...x, m]);
    setMsgs((x) => [...x, { id: nid(), by: 'Bodhin', text: `📎 ${m.name} shared with the class`, sys: true }]);
    flash('File shared in chat');
  };
  const end = () => {
    const allPolls = [...pastPolls, ...(poll ? [poll] : [])].map((p) => ({ q: p.q, options: p.options, votes: p.votes }));
    liveAdmin.end(userId, id, {
      elapsedSec: Math.max(elapsed, 60) * (elapsed < 120 ? 25 : 1), // POC: short demo sessions are scaled to a realistic length
      peak: Math.max(peak, joined),
      chapters,
      materials,
      qa: qs.map((q) => ({ q: q.q, by: q.by, a: q.a, votes: q.votes })),
      polls: allPolls,
      chatCount: msgs.filter((m) => !m.sys).length,
    });
    router.replace({ pathname: '/edu/summary/[id]', params: { id, fresh: '1' } });
  };

  const stageView = (
    <View style={[styles.stage, stage === 'board' && { aspectRatio: undefined, height: 560 }, { backgroundColor: stage === 'board' ? c.ivory : '#0B1426' }]}>
      {stage === 'slides' && (
        <View style={styles.slide}>
          <Txt variant="caption" color="rgba(255,255,255,0.6)">{info.course.title.toUpperCase()}</Txt>
          <Txt variant="title" color="#fff" center numberOfLines={3}>{slides[slide]?.t}</Txt>
          <Txt variant="body" color="rgba(255,255,255,0.75)" center numberOfLines={2}>{slides[slide]?.s}</Txt>
          <Txt variant="caption" color="rgba(255,255,255,0.5)" style={{ position: 'absolute', bottom: 8, right: 12 }}>{slide + 1} / {slides.length}</Txt>
        </View>
      )}
      {stage === 'screen' && (
        <View style={styles.slide}>
          {screenStream ? (
            <RoomVideo stream={screenStream} fit="contain" style={{ width: '100%', height: '100%' }} />
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <Ionicons name="desktop-outline" size={48} color="#fff" />
              <Txt variant="title" color="#fff">Ready to share screen</Txt>
              <Button title="Start sharing screen" onPress={async () => { const scr = await realtime.current?.startScreen(); setScreenStream(scr ?? null); }} />
            </View>
          )}
          <View style={{ position: 'absolute', bottom: 12, left: 12 }}>
            <Pill text="You are sharing your screen" tone="info" icon="desktop-outline" />
          </View>
        </View>
      )}
      {stage === 'board' && (
        <View style={[StyleSheet.absoluteFill, { padding: 8, backgroundColor: c.ivory }]}>
          <SmartBoard compact onOp={(op) => tx(op)} />
        </View>
      )}
      {stage !== 'board' && (
        <View style={styles.selfTile} pointerEvents="none">
          {cam && localStream ? (
            <RoomVideo stream={localStream} muted={true} style={StyleSheet.absoluteFill} />
          ) : cam ? (
            <Ionicons name="videocam" size={28} color="rgba(255,255,255,0.7)" />
          ) : (
            <Avatar name={session.user.name} size={36} />
          )}
          {!mic && <Ionicons name="mic-off" size={12} color="#fff" style={styles.selfMic} />}
        </View>
      )}
      {speaking && <View style={styles.speaking} pointerEvents="none"><Pill text={`${speaking.split(' ')[0]} is speaking`} tone="success" icon="mic" /></View>}
    </View>
  );

  const stageTools = (
    <View style={styles.tools}>
      <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]}>
        {([['slides', 'easel-outline', 'Slides'], ['screen', 'desktop-outline', 'Screen'], ['board', 'brush-outline', 'Board']] as const).map(([k, ic, l]) => (
          <Pressable
            key={k}
            onPress={async () => {
              setStage(k);
              tx({ t: 'stage', mode: k });
              chapter(k === 'board' ? 'Whiteboard explanation' : k === 'screen' ? 'Live demo (screen share)' : slides[slide].t);
              if (k === 'screen') {
                const scr = await realtime.current?.startScreen();
                setScreenStream(scr ?? null);
              } else {
                realtime.current?.stopScreen();
                setScreenStream(null);
              }
            }}
            style={[styles.segBtn, stage === k && { backgroundColor: c.surface }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: stage === k }}
          >
            <Ionicons name={ic} size={16} color={stage === k ? c.primary : c.inkSoft} />
            <Txt variant="label" color={stage === k ? c.primary : c.inkSoft}>{l}</Txt>
          </Pressable>
        ))}
      </View>
      {stage === 'slides' && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Small icon="chevron-back" label="Previous slide" disabled={slide === 0} onPress={() => { const n = Math.max(0, slide - 1); setSlide(n); tx({ t: 'slide', index: n }); }} />
          <Small icon="chevron-forward" label="Next slide" disabled={slide >= slides.length - 1} onPress={() => { const n = Math.min(slides.length - 1, slide + 1); setSlide(n); tx({ t: 'slide', index: n }); chapter(slides[n].t); }} />
        </View>
      )}
    </View>
  );

  const openQs = qs.filter((q) => !q.answered).sort((a, b) => b.votes - a.votes);
  const panel = (
    <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }, wide ? { width: 360 } : { flex: 1 }]}>
      <View style={[styles.ptabs, { borderBottomColor: c.border }]}>
        {([['chat', 'Chat', unread], ['qa', 'Q&A', openQs.length], ['polls', 'Polls', poll ? 1 : 0], ['people', 'People', hands.length]] as const).map(([k, l, n]) => (
          <Pressable key={k} onPress={() => { setTab(k); if (k === 'chat') setUnread(0); }} style={[styles.ptab, tab === k && { borderBottomColor: c.primary }]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Txt variant="label" color={tab === k ? c.primary : c.inkSoft}>{l}</Txt>
            {n > 0 && <View style={[styles.badge, { backgroundColor: k === 'people' ? c.warning : c.live }]}><Txt variant="caption" color="#fff" style={{ fontSize: 10, lineHeight: 12 }}>{n}</Txt></View>}
          </Pressable>
        ))}
      </View>

      {tab === 'chat' && (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }} ref={(r) => { r?.scrollToEnd({ animated: false }); }}>
            {!s.settings.chat && <Txt variant="caption" color={c.muted} center>Chat is turned off for this class.</Txt>}
            {msgs.map((m) => (m.sys ? (
              <Txt key={m.id} variant="caption" color={c.muted} center>{m.text}</Txt>
            ) : (
              <View key={m.id} style={[styles.msg, { backgroundColor: m.me ? c.primarySoft : c.surfaceMuted, alignSelf: m.me ? 'flex-end' : 'flex-start' }]}>
                <Txt variant="caption" color={m.me ? c.primary : c.inkSoft} style={{ fontWeight: '700' }}>{m.me ? 'You' : m.by}</Txt>
                <Txt variant="label" style={{ fontWeight: '400' }}>{m.text}</Txt>
              </View>
            )))}
          </ScrollView>
          <View style={[styles.composer, { borderTopColor: c.border }]}>
            <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={sendChat} placeholder="Message the class…" placeholderTextColor={c.muted} style={[styles.input, { backgroundColor: c.surfaceMuted, color: c.ink }]} accessibilityLabel="Chat message" returnKeyType="send" />
            <Pressable onPress={sendChat} style={[styles.send, { backgroundColor: c.primary }]} accessibilityRole="button" accessibilityLabel="Send"><Ionicons name="send" size={18} color="#fff" /></Pressable>
          </View>
        </>
      )}

      {tab === 'qa' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
          {!qs.length && <Txt variant="caption" color={c.muted} center>Questions from students appear here, most upvoted first.</Txt>}
          {[...openQs, ...qs.filter((q) => q.answered)].map((q) => (
            <View key={q.id} style={[styles.qcard, { borderColor: c.border, opacity: q.answered ? 0.65 : 1 }]}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.votes, { backgroundColor: c.surfaceMuted }]}>
                  <Ionicons name="arrow-up" size={14} color={c.primary} />
                  <Txt variant="label">{q.votes}</Txt>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong">{q.q}</Txt>
                  <Txt variant="caption" color={c.muted}>{q.by}{q.answered ? ' · Answered' : ''}</Txt>
                  {q.a && <Txt variant="caption" color={c.inkSoft}>↳ {q.a}</Txt>}
                </View>
              </View>
              {!q.answered && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Answered live" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setQs((x) => x.map((y) => (y.id === q.id ? { ...y, answered: true } : y))); chapter(`Q&A: ${q.q}`); }} />
                  <Button title="Type answer" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setAnswering(q); setAnswer(''); }} />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'polls' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
          {poll ? (
            <View style={[styles.qcard, { borderColor: c.primary }]}>
              <Pill text="LIVE POLL" tone="live" />
              <Txt variant="bodyStrong">{poll.q}</Txt>
              <PollBars poll={poll} />
              <Button title="End poll & show results" size="md" onPress={stopPoll} />
            </View>
          ) : (
            <Button title="Create a poll" iconLeft="add" size="md" onPress={() => setPollForm(true)} />
          )}
          {pastPolls.map((p, i) => (
            <View key={i} style={[styles.qcard, { borderColor: c.border }]}>
              <Txt variant="caption" color={c.muted}>Closed</Txt>
              <Txt variant="bodyStrong">{p.q}</Txt>
              <PollBars poll={p} />
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'people' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt variant="label">{attendees.length} joined</Txt>
            <Button title={mutedAll ? 'All muted' : 'Mute all'} size="md" variant="outline" iconLeft="mic-off-outline" onPress={() => { setMutedAll(true); setSpeaking(null); flash('Everyone is muted'); }} />
          </View>
          {hands.map((h) => (
            <View key={h} style={[styles.person, { backgroundColor: c.warningBg }]}>
              <Txt style={{ fontSize: 18 }}>✋</Txt>
              <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{h}</Txt>
              <Button title="Allow to speak" size="md" onPress={() => { setSpeaking(h); setMutedAll(false); tx({ t: 'allow_speak', who: h, on: true }); setHands((x) => x.filter((y) => y !== h)); }} />
              <Pressable onPress={() => setHands((x) => x.filter((y) => y !== h))} accessibilityRole="button" accessibilityLabel={`Lower ${h}'s hand`} style={styles.iconHit}><Ionicons name="close" size={18} color={c.inkSoft} /></Pressable>
            </View>
          ))}
          {speaking && (
            <View style={[styles.person, { backgroundColor: c.successBg }]}>
              <Ionicons name="mic" size={18} color={c.success} />
              <Txt variant="bodyStrong" style={{ flex: 1 }}>{speaking}</Txt>
              <Button title="Mute" size="md" variant="outline" onPress={() => setSpeaking(null)} />
            </View>
          )}
          {attendees.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
              <Ionicons name="people-outline" size={32} color={c.muted} />
              <Txt color={c.muted} center>Waiting for students to join…</Txt>
              <Txt variant="caption" color={c.inkSoft} center>Students enrolled will see the live class and can join now.</Txt>
            </View>
          ) : (
            attendees.map((p) => (
              <View key={p.id} style={styles.person}>
                <Avatar name={p.name} size={32} />
                <Txt style={{ flex: 1 }} numberOfLines={1}>{p.name}</Txt>
                <Pill text="Live" tone="success" />
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );

  const controls = (
    <View style={[styles.controls, { backgroundColor: '#0B1426' }]}>
      <Ctrl icon={mic ? 'mic' : 'mic-off'} label={mic ? 'Mute' : 'Unmute'} off={!mic} onPress={() => { setMic(!mic); realtime.current?.setMic(!mic); }} />
      <Ctrl icon={cam ? 'videocam' : 'videocam-off'} label={cam ? 'Camera' : 'Camera off'} off={!cam} onPress={() => { setCam(!cam); realtime.current?.setCam(!cam); }} />
      <Ctrl icon="bookmark-outline" label="Bookmark" onPress={() => { chapter(stage === 'slides' ? slides[slide].t : `Bookmark at ${fmt(elapsed)}`); flash('Chapter added to recording'); }} />
      <Ctrl icon="attach" label="Share file" onPress={shareFile} />
      <Ctrl icon={rec ? 'pause-circle' : 'radio-button-on'} label={rec ? 'Pause rec' : 'Record'} off={!rec} onPress={() => { setRec(!rec); flash(rec ? 'Recording paused' : 'Recording resumed'); }} />
      <Pressable onPress={() => setEnding(true)} style={[styles.endBtn, { backgroundColor: c.live }]} accessibilityRole="button" accessibilityLabel="End class">
        <Ionicons name="call" size={18} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        <Txt variant="label" color="#fff">End</Txt>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pill text={`LIVE · ${fmt(elapsed)}`} tone="live" icon="radio" />
          {rec && <Pill text="REC" tone="live" icon="ellipse" />}
          <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>{s.title}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="people" size={16} color={c.inkSoft} />
            <Txt variant="label">{joined}</Txt>
          </View>
        </View>
        {wide ? (
          <View style={{ flex: 1, flexDirection: 'row', gap: 12, padding: 12, paddingTop: 0 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>{stageView}</View>
              {stageTools}
              {controls}
            </View>
            {panel}
          </View>
        ) : (
          <View style={{ flex: 1, gap: 8, paddingHorizontal: 10 }}>
            {stageView}
            {stageTools}
            {panel}
            {controls}
          </View>
        )}
        {toast && <View style={[styles.toast, { backgroundColor: c.ink }]} pointerEvents="none"><Txt variant="label" color="#fff" center>{toast}</Txt></View>}
      </SafeAreaView>

      <BottomSheet open={ending} onClose={() => setEnding(false)} title="End class for everyone?" footer={<>
        <Button title="Keep teaching" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setEnding(false)} />
        <Button title="End class" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={end} />
      </>}>
        <View style={{ gap: 8 }}>
          <Txt color={c.inkSoft}>{fmt(elapsed)} live · {Math.max(peak, joined)} students at peak · {qs.length} questions · {pastPolls.length + (poll ? 1 : 0)} polls</Txt>
          {s.settings.trackAttendance && <Txt variant="caption" color={c.muted}>Attendance will be marked automatically from who joined. You can edit it later.</Txt>}
          {rec && <Txt variant="caption" color={c.muted}>The recording will be processed with {chapters.length} chapters{s.settings.saveToCourse ? ' and added to the course' : ''}.</Txt>}
        </View>
      </BottomSheet>

      <BottomSheet open={pollForm} onClose={() => setPollForm(false)} title="New poll" footer={<Button title="Launch poll" size="md" style={{ flex: 1 }} onPress={launchPoll} />}>
        <View style={{ gap: 8 }}>
          <TextInput value={pq} onChangeText={setPq} placeholder="Question" placeholderTextColor={c.muted} style={[styles.field, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Poll question" />
          {popts.map((o, i) => (
            <TextInput key={i} value={o} onChangeText={(v) => setPopts((x) => x.map((y, j) => (j === i ? v : y)))} placeholder={`Option ${i + 1}`} placeholderTextColor={c.muted} style={[styles.field, { borderColor: c.border, color: c.ink }]} accessibilityLabel={`Option ${i + 1}`} />
          ))}
          {popts.length < 4 && <Button title="Add option" variant="outline" size="md" iconLeft="add" onPress={() => setPopts((x) => [...x, ''])} />}
        </View>
      </BottomSheet>

      <BottomSheet open={!!answering} onClose={() => setAnswering(null)} title="Answer in writing" footer={<Button title="Post answer" size="md" style={{ flex: 1 }} onPress={() => { if (!answering || !answer.trim()) return; tx({ t: 'qa_answer', id: answering.id, text: answer.trim().slice(0, 500) }); setQs((x) => x.map((y) => (y.id === answering.id ? { ...y, answered: true, a: answer.trim() } : y))); setAnswering(null); }} />}>
        <Txt variant="bodyStrong">{answering?.q}</Txt>
        <TextInput value={answer} onChangeText={setAnswer} multiline placeholder="Your answer (students see it under the question)" placeholderTextColor={c.muted} style={[styles.field, { borderColor: c.border, color: c.ink, minHeight: 90, textAlignVertical: 'top', marginTop: 8 }]} accessibilityLabel="Answer" />
      </BottomSheet>
    </View>
  );
}

function PollBars({ poll }: { poll: Poll }) {
  const { c } = useTheme();
  const total = poll.votes.reduce((a, b) => a + b, 0) || 1;
  return (
    <View style={{ gap: 6 }}>
      {poll.options.map((o, i) => {
        const pct = Math.round((poll.votes[i] / total) * 100);
        return (
          <View key={i} style={[styles.bar, { backgroundColor: c.surfaceMuted }]}>
            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: c.primarySoft }]} />
            <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{o}</Txt>
            <Txt variant="label">{pct}% · {poll.votes[i]}</Txt>
          </View>
        );
      })}
    </View>
  );
}

function Small({ icon, label, onPress, disabled, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.small, { backgroundColor: active ? c.primarySoft : c.surface, borderColor: active ? c.primary : c.border, opacity: disabled ? 0.4 : 1 }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={c.ink} />
    </Pressable>
  );
}

function Ctrl({ icon, label, onPress, off }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; off?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.ctrl} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.ctrlIcon, { backgroundColor: off ? '#E5383B' : 'rgba(255,255,255,0.12)' }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <Txt variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={1} style={{ fontSize: 10 }}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  stage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', maxHeight: 620 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  fakeWin: { width: '80%', borderRadius: 8, overflow: 'hidden' },
  selfTile: { position: 'absolute', right: 8, top: 8, width: 64, height: 48, borderRadius: 10, backgroundColor: '#1E3A5F', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  selfMic: { position: 'absolute', bottom: 2, left: 3, backgroundColor: '#E5383B', borderRadius: 6, padding: 1 },
  speaking: { position: 'absolute', left: 8, top: 8 },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 38, borderRadius: 10 },
  small: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 3 },
  panel: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', minHeight: 180 },
  ptabs: { flexDirection: 'row', borderBottomWidth: 1 },
  ptab: { flex: 1, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  badge: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  msg: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  composer: { flexDirection: 'row', gap: 8, padding: 8, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qcard: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  votes: { width: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 12, paddingHorizontal: 8 },
  iconHit: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, minHeight: 40, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, paddingHorizontal: 8, paddingVertical: 6, gap: 2, marginBottom: 4 },
  ctrl: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52, justifyContent: 'center' },
  ctrlIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  endBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 44, borderRadius: 22, marginLeft: 4 },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48, fontSize: 15 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 110, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
});
