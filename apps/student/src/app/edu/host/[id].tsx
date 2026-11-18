/**
 * Host live room (teacher or owner). Everything here is real: your camera, microphone and screen go to the
 * students who join; the people list, raised hands, chat, Q&A and polls come from the students in the room.
 * Stage: your camera · your shared screen · whiteboard. Panel: Chat · Q&A · Polls · People.
 * Phone: stage on top, panel below, controls in the thumb zone. ≥900px: stage left, panel right.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, liveAdmin, liveTab } from '@/api/client';
import type { LiveSummary } from '@/core/batch';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { RoomVideo } from '@/ui/RoomVideo';
import { SmartBoard } from '@/ui/SmartBoard';
import { screenShareSupported } from '@/live/media';
import type { RoomMsg } from '@/live/protocol';
import { announceLive } from '@/live/registry';
import type { Person } from '@/live/room';
import { useLiveRoom, type LiveRoomOptions } from '@/live/useLiveRoom';

type Stage = 'camera' | 'screen' | 'board';
type PanelTab = 'chat' | 'qa' | 'polls' | 'people';
type Msg = { id: string; by: string; text: string; me?: boolean; sys?: boolean };
type Q = { id: string; q: string; by: string; answered: boolean; a?: string };
type Poll = { id: string; q: string; options: string[]; votes: number[]; open: boolean };

const fmt = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
let seq = 0;
const nid = () => `x${Date.now().toString(36)}${++seq}`;
const stageMode = (s: Stage): 'slides' | 'screen' | 'board' => (s === 'camera' ? 'slides' : s); // protocol keeps the old name for "camera"

export default function HostRoom() {
  const { id, cam: camP, mic: micP, camDev, micDev } = useLocalSearchParams<{ id: string; cam?: string; mic?: string; camDev?: string; micDev?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const info = useMemo(() => liveAdmin.get(userId, id), [userId, id]);
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [boot, setBoot] = useState<{ opts: LiveRoomOptions; startedAt: number } | null>(null);
  const [bootErr, setBootErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [stage, setStage] = useState<Stage>('camera');
  const [tab, setTab] = useState<PanelTab>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 'w', by: 'Bodhin', text: 'Class is live. Your students have been notified.', sys: true }]);
  const [draft, setDraft] = useState('');
  const [qs, setQs] = useState<Q[]>([]);
  const [answering, setAnswering] = useState<Q | null>(null);
  const [answer, setAnswer] = useState('');
  const [poll, setPoll] = useState<Poll | null>(null);
  const [pastPolls, setPastPolls] = useState<Poll[]>([]);
  const [pollForm, setPollForm] = useState(false);
  const [pq, setPq] = useState('');
  const [popts, setPopts] = useState(['', '']);
  const [peak, setPeak] = useState(0);
  const [hands, setHands] = useState<Record<string, { name: string; at: number }>>({});
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const [lockedAll, setLockedAll] = useState(false);
  const [chapters, setChapters] = useState<LiveSummary['chapters']>([{ atSec: 0, label: 'Class started' }]);
  const [unread, setUnread] = useState(0);
  const [ending, setEnding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const voters = useRef(new Set<string>());
  const chatCount = useRef(0);
  const seen = useRef(new Set<string>());
  const stageRef = useRef<Stage>('camera');
  stageRef.current = stage;

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };
  const elapsed = boot ? Math.max(0, Math.floor((now - boot.startedAt) / 1000)) : 0;
  const chapter = (label: string) => setChapters((x) => (x[x.length - 1]?.label === label ? x : [...x, { atSec: elapsed, label }]));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 1) Go live (idempotent: students are only notified the first time) and get access to the room.
  useEffect(() => {
    if (!info || !session) return;
    let dead = false;
    let stopAnnounce: ((ended?: boolean) => void) | null = null;
    (async () => {
      try {
        liveAdmin.start(userId, id);
        const m = await liveAdmin.joinHost(userId, id);
        if (dead) return;
        const st = liveTab.roomState(id);
        const startedAt = st.state === 'live' && st.startedAt ? new Date(st.startedAt).getTime() : Date.now();
        setBoot({
          startedAt,
          opts: { provider: m.provider, url: m.url, token: m.token, room: m.room, userId, name: session.user.name, role: 'host', hostUserIds: m.hostIds, startMic: micP !== '0', startCam: camP !== '0', micDevice: micDev, camDevice: camDev },
        });
        stopAnnounce = announceLive({ sessionId: id, title: info.session.title, hostId: userId, hostName: session.user.name });
      } catch (e) {
        if (!dead) setBootErr(e instanceof ApiError ? e.message : 'Could not open the live room.');
      }
    })();
    return () => {
      dead = true;
      stopAnnounce?.(endedRef.current);
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const endedRef = useRef(false);

  // 2) The room: real media + data.
  const rt = useLiveRoom(boot?.opts ?? null, (m: RoomMsg, from: Person) => {
    if (m.t === 'chat') {
      chatCount.current += 1;
      setMsgs((x) => [...x.slice(-200), { id: m.id, by: from.name, text: m.text }]);
      if (tabRef.current !== 'chat') setUnread((u) => u + 1);
    } else if (m.t === 'qa') setQs((q) => (q.some((y) => y.id === m.id) ? q : [...q, { id: m.id, q: m.text, by: from.name, answered: false }]));
    else if (m.t === 'hand') setHands((h) => { const n = { ...h }; if (m.up) n[from.userId] = { name: from.name, at: Date.now() }; else delete n[from.userId]; return n; });
    else if (m.t === 'vote') {
      setPoll((p) => {
        const key = `${m.pollId}:${from.userId}`;
        if (!p || !p.open || p.id !== m.pollId || m.option >= p.votes.length || voters.current.has(key)) return p;
        voters.current.add(key);
        return { ...p, votes: p.votes.map((v, i) => (i === m.option ? v + 1 : v)) };
      });
    }
  });
  const students = rt.people.filter((p, i) => i > 0 && p.role === 'student');
  const tx = (m: RoomMsg) => rt.send(m);

  // Who joined / left, and the peak.
  useEffect(() => {
    setPeak((p) => Math.max(p, students.length));
    const cur = new Set(students.map((p) => p.id));
    students.forEach((p) => {
      if (!seen.current.has(p.id)) {
        seen.current.add(p.id);
        setMsgs((x) => [...x, { id: nid(), by: 'Bodhin', text: `${p.name} joined`, sys: true }]);
        // a late joiner needs to know what the stage is showing
        tx({ t: 'stage', mode: stageMode(stageRef.current) });
        if (lockedAll) tx({ t: 'allow_speak', who: p.userId, on: false });
      }
    });
    [...seen.current].forEach((sid) => {
      if (!cur.has(sid)) {
        seen.current.delete(sid);
        const left = rt.people.find((p) => p.id === sid);
        void left;
        setMsgs((x) => [...x, { id: nid(), by: 'Bodhin', text: 'A student left', sys: true }]);
      }
    });
  }, [students.map((p) => p.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stage follows the screen share.
  useEffect(() => {
    if (rt.screen) setStage('screen');
    else if (stageRef.current === 'screen' && rt.status === 'connected') setStage('camera');
  }, [rt.screen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (bootErr || !info || !session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text={bootErr ?? 'You can’t host this class.'} />
        <Button title="Back to Live" onPress={() => router.replace('/educator/live')} />
      </SafeAreaView>
    );
  }
  const s = info.session;
  const speakers = students.filter((p) => p.speaking);
  const onCam = students.filter((p) => p.cam && rt.streams[p.id]?.camera);

  const setStageTo = (st: Stage) => {
    setStage(st);
    tx({ t: 'stage', mode: stageMode(st) });
    chapter(st === 'board' ? 'Whiteboard explanation' : st === 'screen' ? 'Screen share' : 'Back to camera');
  };
  const toggleScreen = async () => {
    if (rt.screen) return rt.setScreen(false);
    await rt.setScreen(true);
  };
  const sendChat = () => {
    const t = draft.trim();
    if (!t) return;
    tx({ t: 'chat', id: `${userId}-${Date.now()}`, by: session.user.name, text: t.slice(0, 500), at: Date.now() });
    chatCount.current += 1;
    setMsgs((m) => [...m, { id: nid(), by: session.user.name, text: t, me: true }]);
    setDraft('');
  };
  const launchPoll = () => {
    const options = popts.map((o) => o.trim()).filter(Boolean);
    if (pq.trim().length < 4 || options.length < 2) return flash('Add a question and at least 2 options');
    const pid = `poll${Date.now()}`;
    tx({ t: 'poll', id: pid, q: pq.trim().slice(0, 200), options: options.slice(0, 6).map((o) => o.slice(0, 100)) });
    setPoll({ id: pid, q: pq.trim(), options, votes: options.map(() => 0), open: true });
    setPollForm(false);
    chapter(`Poll: ${pq.trim()}`);
    setPq('');
    setPopts(['', '']);
  };
  const stopPoll = () => {
    if (!poll) return;
    tx({ t: 'poll_close', id: poll.id });
    setPastPolls((x) => [...x, { ...poll, open: false }]);
    setPoll(null);
    flash('Poll closed');
  };
  const allow = (p: Person, on: boolean) => {
    tx({ t: 'allow_speak', who: p.userId, on });
    setAllowed((a) => ({ ...a, [p.userId]: on }));
    if (on) setHands((h) => { const n = { ...h }; delete n[p.userId]; return n; });
  };
  const muteAll = () => {
    tx({ t: 'allow_speak', who: '*', on: false });
    setLockedAll(true);
    setAllowed({});
    flash('Everyone is muted. They can raise a hand to speak.');
  };
  const unlockAll = () => {
    tx({ t: 'allow_speak', who: '*', on: true });
    setLockedAll(false);
    flash('Students can unmute themselves again.');
  };
  const end = () => {
    const allPolls = [...pastPolls, ...(poll ? [poll] : [])].map((p) => ({ q: p.q, options: p.options, votes: p.votes }));
    endedRef.current = true;
    tx({ t: 'end' });
    liveAdmin.end(userId, id, {
      elapsedSec: Math.max(elapsed, 60),
      peak,
      chapters,
      materials: [],
      qa: qs.map((q) => ({ q: q.q, by: q.by, a: q.a, votes: 0 })),
      polls: allPolls,
      chatCount: chatCount.current,
    });
    // give the "class ended" message a moment to reach everyone before the room closes
    setTimeout(() => router.replace({ pathname: '/edu/summary/[id]', params: { id, fresh: '1' } }), 700);
  };

  const stageView = (
    <View style={[styles.stage, stage === 'board' && { aspectRatio: undefined, flex: 1, minHeight: 340, maxHeight: undefined }, { backgroundColor: stage === 'board' ? c.ivory : '#0B1426' }]}>
      {stage === 'camera' && (
        rt.localCamera && rt.cam ? <RoomVideo stream={rt.localCamera} mirror label="Your camera" /> : (
          <View style={styles.slide}>
            <Avatar name={session.user.name} size={96} />
            <Txt variant="label" color="rgba(255,255,255,0.8)">{rt.status === 'connecting' ? 'Connecting…' : 'Your camera is off. Students see your initials.'}</Txt>
          </View>
        )
      )}
      {stage === 'screen' && (
        rt.localScreen && rt.screen ? <RoomVideo stream={rt.localScreen} fit="contain" label="Your shared screen" /> : (
          <View style={styles.slide}>
            <Ionicons name="desktop-outline" size={44} color="rgba(255,255,255,0.7)" />
            <Txt variant="label" color="#fff" center>Share a window, tab or your whole screen with the class.</Txt>
            {screenShareSupported() ? <Button title="Share screen" size="md" iconLeft="share-outline" onPress={toggleScreen} /> : <Txt variant="caption" color="rgba(255,255,255,0.6)" center>Screen sharing needs a desktop browser.</Txt>}
          </View>
        )
      )}
      {stage === 'board' && (
        <View style={[StyleSheet.absoluteFill, { padding: 8, backgroundColor: c.ivory }]}>
          <SmartBoard compact onOp={(op) => tx(op)} />
        </View>
      )}
      {stage === 'screen' && rt.screen && (
        <View style={styles.selfTile}>
          {rt.cam && rt.localCamera ? <RoomVideo stream={rt.localCamera} mirror label="Your camera" /> : <Avatar name={session.user.name} size={36} />}
        </View>
      )}
      {stage !== 'board' && !rt.mic && <View style={styles.micOff}><Pill text="Your mic is off" tone="warning" icon="mic-off" /></View>}
      {speakers.length > 0 && <View style={styles.speaking} pointerEvents="none"><Pill text={`${speakers[0].name.split(' ')[0]} is speaking`} tone="success" icon="mic" /></View>}
    </View>
  );

  const studentStrip = onCam.length > 0 && (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
      {onCam.map((p) => (
        <View key={p.id} style={[styles.tile, p.speaking && { borderColor: '#3FD17C' }]}>
          <RoomVideo stream={rt.streams[p.id]?.camera ?? null} label={`${p.name} camera`} />
          <View style={styles.tileName}><Txt variant="caption" color="#fff" style={{ fontSize: 10 }} numberOfLines={1}>{p.name}</Txt></View>
        </View>
      ))}
    </ScrollView>
  );

  const stageTools = (
    <View style={styles.tools}>
      <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]}>
        {([['camera', 'videocam-outline', 'Camera'], ['screen', 'desktop-outline', 'Screen'], ['board', 'brush-outline', 'Board']] as const).map(([k, ic, l]) => (
          <Pressable key={k} onPress={() => setStageTo(k)} style={[styles.segBtn, stage === k && { backgroundColor: c.surface }]} accessibilityRole="tab" accessibilityState={{ selected: stage === k }}>
            <Ionicons name={ic} size={16} color={stage === k ? c.primary : c.inkSoft} />
            <Txt variant="label" color={stage === k ? c.primary : c.inkSoft}>{l}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const openQs = qs.filter((q) => !q.answered);
  const handList = Object.entries(hands).sort((a, b) => a[1].at - b[1].at);
  const panel = (
    <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }, wide ? { width: 360 } : { flex: 1 }]}>
      <View style={[styles.ptabs, { borderBottomColor: c.border }]}>
        {([['chat', 'Chat', unread], ['qa', 'Q&A', openQs.length], ['polls', 'Polls', poll ? 1 : 0], ['people', `People ${students.length}`, handList.length]] as const).map(([k, l, n]) => (
          <Pressable key={k} onPress={() => { setTab(k); if (k === 'chat') setUnread(0); }} style={[styles.ptab, tab === k && { borderBottomColor: c.primary }]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Txt variant="label" color={tab === k ? c.primary : c.inkSoft} numberOfLines={1}>{l}</Txt>
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
          {!qs.length && <Txt variant="caption" color={c.muted} center>{s.settings.qa ? 'Questions from students appear here.' : 'Q&A is turned off for this class.'}</Txt>}
          {[...openQs, ...qs.filter((q) => q.answered)].map((q) => (
            <View key={q.id} style={[styles.qcard, { borderColor: c.border, opacity: q.answered ? 0.65 : 1 }]}>
              <Txt variant="bodyStrong">{q.q}</Txt>
              <Txt variant="caption" color={c.muted}>{q.by}{q.answered ? ' · Answered' : ''}</Txt>
              {q.a && <Txt variant="caption" color={c.inkSoft}>↳ {q.a}</Txt>}
              {!q.answered && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Answered live" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setQs((x) => x.map((y) => (y.id === q.id ? { ...y, answered: true } : y))); chapter(`Q&A: ${q.q.slice(0, 60)}`); }} />
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Txt variant="label">{students.length} of {info.audience.length} joined</Txt>
            {lockedAll ? <Button title="Let students unmute" size="md" variant="outline" iconLeft="mic-outline" onPress={unlockAll} /> : <Button title="Mute all" size="md" variant="outline" iconLeft="mic-off-outline" onPress={muteAll} />}
          </View>
          {students.length === 0 && <Txt variant="caption" color={c.muted} center style={{ paddingVertical: 14 }}>No one has joined yet. Students were notified — they appear here the moment they join.</Txt>}
          {handList.map(([uid, h]) => {
            const p = students.find((x) => x.userId === uid);
            if (!p) return null;
            return (
              <View key={uid} style={[styles.person, { backgroundColor: c.warningBg }]}>
                <Txt style={{ fontSize: 18 }}>✋</Txt>
                <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{h.name}</Txt>
                <Button title="Allow to speak" size="md" onPress={() => allow(p, true)} />
                <Pressable onPress={() => setHands((x) => { const n = { ...x }; delete n[uid]; return n; })} accessibilityRole="button" accessibilityLabel={`Lower ${h.name}'s hand`} style={styles.iconHit}><Ionicons name="close" size={18} color={c.inkSoft} /></Pressable>
              </View>
            );
          })}
          {students.map((p) => (
            <View key={p.id} style={styles.person}>
              <Avatar name={p.name} size={32} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt numberOfLines={1}>{p.name}</Txt>
                {(allowed[p.userId] || p.speaking) && <Txt variant="caption" color={c.success}>{p.speaking ? 'Speaking' : 'Allowed to speak'}</Txt>}
              </View>
              <Ionicons name={p.cam ? 'videocam' : 'videocam-off-outline'} size={16} color={p.cam ? c.success : c.muted} />
              <Ionicons name={p.mic ? 'mic' : 'mic-off-outline'} size={16} color={p.mic ? c.success : c.muted} />
              {lockedAll && (allowed[p.userId] ? <Button title="Mute" size="md" variant="outline" onPress={() => allow(p, false)} /> : <Button title="Allow" size="md" variant="outline" onPress={() => allow(p, true)} />)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const controls = (
    <View style={[styles.controls, { backgroundColor: '#0B1426' }]}>
      <Ctrl icon={rt.mic ? 'mic' : 'mic-off'} label={rt.mic ? 'Mute' : 'Unmute'} off={!rt.mic} busy={rt.busy.mic} onPress={() => rt.setMic(!rt.mic)} />
      <Ctrl icon={rt.cam ? 'videocam' : 'videocam-off'} label={rt.cam ? 'Camera' : 'Camera off'} off={!rt.cam} busy={rt.busy.cam} onPress={() => rt.setCam(!rt.cam)} />
      {screenShareSupported() && <Ctrl icon="desktop-outline" label={rt.screen ? 'Stop share' : 'Share'} active={rt.screen} busy={rt.busy.screen} onPress={() => (rt.screen ? rt.setScreen(false) : (setStage('screen'), toggleScreen()))} />}
      <Ctrl icon="bookmark-outline" label="Bookmark" onPress={() => { chapter(`Bookmark at ${fmt(elapsed)}`); flash('Chapter added'); }} />
      <Pressable onPress={() => setEnding(true)} style={[styles.endBtn, { backgroundColor: c.live }]} accessibilityRole="button" accessibilityLabel="End class">
        <Ionicons name="call" size={18} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        <Txt variant="label" color="#fff">End</Txt>
      </Pressable>
    </View>
  );

  const statusNote = rt.status === 'error' ? rt.error : rt.status === 'connecting' ? 'Opening the room…' : rt.status === 'reconnecting' ? 'Connection lost. Reconnecting…' : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pill text={`LIVE · ${fmt(elapsed)}`} tone="live" icon="radio" />
          <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>{s.title}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={`${students.length} students in the class`}>
            <Ionicons name="people" size={16} color={c.inkSoft} />
            <Txt variant="label">{students.length}</Txt>
          </View>
        </View>
        {(statusNote || rt.notice) && (
          <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
            <Banner tone={rt.status === 'error' || rt.notice ? 'danger' : 'info'} text={rt.notice ?? statusNote ?? ''} />
          </View>
        )}
        {wide ? (
          <View style={{ flex: 1, flexDirection: 'row', gap: 12, padding: 12, paddingTop: 0 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
              <View style={{ flex: 1, minHeight: 0, justifyContent: 'center', alignItems: stage === 'board' ? 'stretch' : 'center' }}>{stageView}</View>
              {studentStrip}
              {stageTools}
              {controls}
            </View>
            {panel}
          </View>
        ) : (
          <View style={{ flex: 1, gap: 8, paddingHorizontal: 10 }}>
            {stageView}
            {studentStrip}
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
          <Txt color={c.inkSoft}>{fmt(elapsed)} live · {peak} {peak === 1 ? 'student' : 'students'} at peak · {qs.length} questions · {pastPolls.length + (poll ? 1 : 0)} polls</Txt>
          {s.settings.trackAttendance && <Txt variant="caption" color={c.muted}>Attendance is marked automatically from who joined. You can edit it later.</Txt>}
          {s.settings.record && boot?.opts.provider === 'mesh' && <Txt variant="caption" color={c.warning}>Recording needs the Bodhin live server, which is not connected. This class is not being recorded.</Txt>}
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

function Ctrl({ icon, label, onPress, off, active, busy }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; off?: boolean; active?: boolean; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={[styles.ctrl, busy && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: !!busy }}>
      <View style={[styles.ctrlIcon, { backgroundColor: off ? '#E5383B' : active ? '#1D5FD0' : 'rgba(255,255,255,0.12)' }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <Txt variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={1} style={{ fontSize: 10 }}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  stage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', maxHeight: 620 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  selfTile: { position: 'absolute', right: 8, top: 8, width: 96, height: 72, borderRadius: 10, backgroundColor: '#1E3A5F', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  micOff: { position: 'absolute', left: 8, bottom: 8 },
  speaking: { position: 'absolute', left: 8, top: 8 },
  tile: { width: 120, height: 68, borderRadius: 10, overflow: 'hidden', backgroundColor: '#0B1426', borderWidth: 2, borderColor: 'transparent' },
  tileName: { position: 'absolute', left: 4, bottom: 3, right: 4, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6, paddingHorizontal: 4 },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 38, borderRadius: 10 },
  panel: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', minHeight: 180 },
  ptabs: { flexDirection: 'row', borderBottomWidth: 1 },
  ptab: { flex: 1, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  badge: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  msg: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  composer: { flexDirection: 'row', gap: 8, padding: 8, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qcard: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 12, paddingHorizontal: 8 },
  iconHit: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, minHeight: 40, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, paddingHorizontal: 8, paddingVertical: 6, gap: 2, marginBottom: 4 },
  ctrl: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52, justifyContent: 'center' },
  ctrlIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  endBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 44, borderRadius: 22, marginLeft: 4 },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48, fontSize: 15 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 110, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
});
