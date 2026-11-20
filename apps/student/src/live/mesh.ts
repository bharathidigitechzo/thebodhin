/**
 * Built-in live room: WebRTC between the teacher and every learner (a star: learners connect to the teacher,
 * not to each other), signalled over live/signal.ts. Camera, microphone and screen share are real; nothing
 * is simulated. Good for normal class sizes; for very large classes use the LiveKit provider.
 *
 * Each teacher↔learner link has three fixed transceivers, in this order:  [0] audio · [1] camera · [2] screen.
 * Tracks are swapped with replaceTrack(), so turning the mic or camera on/off never renegotiates the call.
 */
import { decodeMsg, isAllowedFrom, type RoomMsg } from './protocol';
import { MediaError, openCam, openMic, openScreen, stopTrack, watchLevel } from './media';
import { iceServers, type ConnState, type LiveRoom, type Person, type PersonStreams, type RoomEvents, type RoomOptions } from './room';
import { openBus, type Bus, type Envelope } from './signal';

const HEARTBEAT_MS = 4000;
const STALE_MS = 14000;
const ICE_WAIT_MS = 2500;

interface Peer {
  person: Person;
  lastSeen: number;
  pc: RTCPeerConnection | null;
  senders: { audio?: RTCRtpSender; camera?: RTCRtpSender; screen?: RTCRtpSender };
  streams: { camera: MediaStream; screen: MediaStream };
  hasMedia: { camera: boolean; screen: boolean };
  audioEl: HTMLAudioElement | null;
  stopLevel: (() => void) | null;
  pendingIce: RTCIceCandidateInit[];
  callId: string;
}

type Hello = { name: string; userId: string; role: 'host' | 'student'; mic: boolean; cam: boolean; screen: boolean; joinedAt: number };

const inst = () => Math.random().toString(36).slice(2, 7);
const hasRTC = () => typeof RTCPeerConnection !== 'undefined';
const mk = () => (typeof MediaStream !== 'undefined' ? new MediaStream() : (null as unknown as MediaStream));

export class MeshRoom implements LiveRoom {
  private bus: Bus | null = null;
  private off: (() => void) | null = null;
  private peers = new Map<string, Peer>();
  private me: Person;
  private timer: ReturnType<typeof setInterval> | null = null;
  private mic: MediaStreamTrack | null = null;
  private cam: MediaStreamTrack | null = null;
  private scr: MediaStreamTrack | null = null;
  private camStream: MediaStream | null = null;
  private scrStream: MediaStream | null = null;
  private closed = false;
  private rtcOk = hasRTC();

  constructor(private o: RoomOptions, private ev: RoomEvents) {
    this.me = { id: `${o.userId}.${inst()}`, userId: o.userId, name: o.name, role: o.role, mic: false, cam: false, screen: false, speaking: false, joinedAt: Date.now() };
  }

  /* ───────────── lifecycle ───────────── */

  async connect() {
    this.ev.onState('connecting');
    this.bus = openBus(`room:${this.o.room}`, this.me.id);
    this.off = this.bus.on((e) => this.onEnvelope(e));
    this.hello();
    this.timer = setInterval(() => {
      this.hello();
      this.sweep();
    }, HEARTBEAT_MS);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.bye);
    this.push();
    this.ev.onState('connected');
  }

  disconnect() {
    if (this.closed) return;
    this.closed = true;
    this.bye();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.bye);
    if (this.timer) clearInterval(this.timer);
    this.off?.();
    this.peers.forEach((_, id) => this.dropPeer(id, false));
    [this.mic, this.cam, this.scr].forEach(stopTrack);
    this.mic = this.cam = this.scr = null;
    this.bus?.close();
    this.bus = null;
    this.ev.onState('disconnected');
  }

  private bye = () => {
    try {
      this.bus?.send('bye', {});
    } catch {
      /* closing */
    }
  };

  /* ───────────── presence ───────────── */

  private helloBody(): Hello {
    return { name: this.me.name, userId: this.me.userId, role: this.me.role, mic: this.me.mic, cam: this.me.cam, screen: this.me.screen, joinedAt: this.me.joinedAt };
  }
  private hello(to?: string) {
    this.bus?.send('hello', this.helloBody(), to);
  }
  private sweep() {
    const now = Date.now();
    let changed = false;
    this.peers.forEach((p, id) => {
      if (now - p.lastSeen > STALE_MS) {
        this.dropPeer(id, false);
        changed = true;
      }
    });
    if (changed) this.push();
  }

  /** Role comes from who the user *is*, never from what the peer claims. */
  private roleOf(userId: string): 'host' | 'student' {
    return this.o.hostUserIds.includes(userId) ? 'host' : 'student';
  }

  private onEnvelope(e: Envelope) {
    if (this.closed) return;
    switch (e.k) {
      case 'hello':
        return this.onHello(e);
      case 'bye':
        if (this.peers.has(e.from)) {
          this.dropPeer(e.from, true);
        }
        return;
      case 'data':
        return this.onData(e);
      case 'offer':
        return void this.onOffer(e);
      case 'answer':
        return void this.onAnswer(e);
      case 'ice':
        return void this.onIce(e);
    }
  }

  private onHello(e: Envelope) {
    const h = e.p as Hello;
    if (!h || typeof h.userId !== 'string' || typeof h.name !== 'string') return;
    let peer = this.peers.get(e.from);
    const isNew = !peer;
    if (!peer) {
      peer = {
        person: { id: e.from, userId: h.userId, name: h.name.slice(0, 80), role: this.roleOf(h.userId), mic: false, cam: false, screen: false, speaking: false, joinedAt: h.joinedAt || Date.now() },
        lastSeen: Date.now(),
        pc: null,
        senders: {},
        streams: { camera: mk(), screen: mk() },
        hasMedia: { camera: false, screen: false },
        audioEl: null,
        stopLevel: null,
        pendingIce: [],
        callId: '',
      };
      this.peers.set(e.from, peer);
    }
    const before = JSON.stringify([peer.person.mic, peer.person.cam, peer.person.screen, peer.person.name]);
    peer.lastSeen = Date.now();
    peer.person.mic = !!h.mic;
    peer.person.cam = !!h.cam;
    peer.person.screen = !!h.screen;
    peer.person.name = h.name.slice(0, 80);
    // a newcomer needs to learn about us right away (not after the next heartbeat)
    if (isNew) this.hello(e.from);
    // The teacher starts every call, once, when a learner (or a restarted teacher tab) appears.
    if (this.me.role === 'host' && peer.person.role === 'student' && !peer.pc && this.rtcOk) void this.call(peer);
    if (isNew || before !== JSON.stringify([peer.person.mic, peer.person.cam, peer.person.screen, peer.person.name])) this.push();
  }

  private dropPeer(id: string, notify: boolean) {
    const p = this.peers.get(id);
    if (!p) return;
    p.stopLevel?.();
    try {
      p.pc?.close();
    } catch {
      /* closed */
    }
    p.audioEl?.remove();
    this.peers.delete(id);
    if (notify) this.push();
  }

  /* ───────────── WebRTC ───────────── */

  private newPc(peer: Peer) {
    const pc = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: 'max-bundle' });
    peer.pc = pc;
    pc.ontrack = (t) => this.onTrack(peer, pc, t);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && !this.closed) {
        // Rebuild the call; the teacher side re-offers on the next heartbeat.
        peer.pc = null;
        try {
          pc.close();
        } catch {
          /* closed */
        }
        if (this.me.role === 'host') setTimeout(() => !this.closed && this.peers.get(peer.person.id) === peer && !peer.pc && void this.call(peer), 1500);
      }
    };
    return pc;
  }

  private wireSenders(peer: Peer, pc: RTCPeerConnection) {
    const [a, c, s] = pc.getTransceivers();
    peer.senders = { audio: a?.sender, camera: c?.sender, screen: s?.sender };
    void a?.sender.replaceTrack(this.mic).catch(() => {});
    void c?.sender.replaceTrack(this.cam).catch(() => {});
    void s?.sender.replaceTrack(this.scr).catch(() => {});
  }

  private waitIce(pc: RTCPeerConnection) {
    return new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      };
      const check = () => pc.iceGatheringState === 'complete' && done();
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(done, ICE_WAIT_MS);
    });
  }

  private async call(peer: Peer) {
    try {
      const pc = this.newPc(peer);
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });
      this.wireSenders(peer, pc);
      peer.callId = inst();
      await pc.setLocalDescription(await pc.createOffer());
      await this.waitIce(pc);
      this.bus?.send('offer', { callId: peer.callId, sdp: pc.localDescription?.sdp }, peer.person.id);
    } catch (err) {
      console.warn('[live] call failed', err);
      peer.pc = null;
    }
  }

  private async onOffer(e: Envelope) {
    const p = e.p as { callId?: string; sdp?: string };
    const peer = this.peers.get(e.from);
    if (!peer || peer.person.role !== 'host' || !p?.sdp || !this.rtcOk) return; // only the teacher may call a learner
    try {
      try {
        peer.pc?.close();
      } catch {
        /* closed */
      }
      const pc = this.newPc(peer);
      peer.callId = p.callId ?? '';
      await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
      const [a, c, s] = pc.getTransceivers();
      if (a) a.direction = 'sendrecv';
      if (c) c.direction = 'sendrecv';
      if (s) s.direction = 'recvonly'; // learners never share a screen
      this.wireSenders(peer, pc);
      await pc.setLocalDescription(await pc.createAnswer());
      await this.waitIce(pc);
      this.bus?.send('answer', { callId: peer.callId, sdp: pc.localDescription?.sdp }, peer.person.id);
      await this.flushIce(peer);
    } catch (err) {
      console.warn('[live] answer failed', err);
    }
  }

  private async onAnswer(e: Envelope) {
    const p = e.p as { callId?: string; sdp?: string };
    const peer = this.peers.get(e.from);
    if (!peer?.pc || !p?.sdp || p.callId !== peer.callId) return;
    try {
      if (peer.pc.signalingState === 'have-local-offer') await peer.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
      await this.flushIce(peer);
    } catch (err) {
      console.warn('[live] bad answer', err);
    }
  }

  private async onIce(e: Envelope) {
    const peer = this.peers.get(e.from);
    const c = e.p as RTCIceCandidateInit;
    if (!peer || !c) return;
    if (peer.pc?.remoteDescription) await peer.pc.addIceCandidate(c).catch(() => {});
    else peer.pendingIce.push(c);
  }
  private async flushIce(peer: Peer) {
    const q = peer.pendingIce.splice(0);
    for (const c of q) await peer.pc?.addIceCandidate(c).catch(() => {});
  }

  private onTrack(peer: Peer, pc: RTCPeerConnection, t: RTCTrackEvent) {
    const idx = pc.getTransceivers().indexOf(t.transceiver);
    if (idx === 2) {
      if (!peer.streams.screen.getTracks().includes(t.track)) peer.streams.screen.addTrack(t.track);
      peer.hasMedia.screen = true;
    } else {
      if (!peer.streams.camera.getTracks().includes(t.track)) peer.streams.camera.addTrack(t.track);
      if (idx === 1) peer.hasMedia.camera = true;
      if (idx === 0 && t.track.kind === 'audio') this.playAudio(peer, t.track);
    }
    this.push();
  }

  /** Remote voices play through a hidden <audio> element (web). Browsers allow it because the user clicked "Join". */
  private playAudio(peer: Peer, track: MediaStreamTrack) {
    if (typeof document === 'undefined') return;
    peer.audioEl?.remove();
    peer.stopLevel?.();
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', 'true');
    el.style.display = 'none';
    el.srcObject = new MediaStream([track]);
    document.body.appendChild(el);
    void el.play().catch(() => {});
    peer.audioEl = el;
    peer.stopLevel = watchLevel(track, (lv) => {
      const speaking = peer.person.mic && lv > 0.12;
      if (speaking !== peer.person.speaking) {
        peer.person.speaking = speaking;
        this.push();
      }
    }, 200);
  }

  /* ───────────── data ───────────── */

  send(m: RoomMsg) {
    this.bus?.send('data', m);
  }

  private onData(e: Envelope) {
    const peer = this.peers.get(e.from);
    if (!peer) return;
    const m = decodeMsg(JSON.stringify(e.p));
    if (!m || !isAllowedFrom(m, peer.person.role)) return;
    this.ev.onMsg(m, peer.person);
  }

  /* ───────────── local media ───────────── */

  private publish(kind: 'audio' | 'camera' | 'screen', track: MediaStreamTrack | null) {
    this.peers.forEach((p) => {
      const s = p.senders[kind];
      if (s) void s.replaceTrack(track).catch(() => {});
    });
  }

  async setMic(on: boolean, deviceId?: string) {
    if (on) {
      if (!this.mic || this.mic.readyState === 'ended' || deviceId) {
        stopTrack(this.mic);
        this.mic = await openMic(deviceId);
        this.publish('audio', this.mic);
      }
      this.mic.enabled = true;
    } else if (this.mic) {
      // Muting releases the device, so the browser's "recording" dot goes away; unmuting reopens it.
      stopTrack(this.mic);
      this.mic = null;
      this.publish('audio', null);
    }
    this.me.mic = on && !!this.mic;
    this.afterLocalChange();
  }

  async setCam(on: boolean, deviceId?: string) {
    if (on) {
      stopTrack(this.cam);
      this.cam = await openCam(deviceId, this.me.name);
      this.camStream = new MediaStream([this.cam]);
      this.cam.onended = () => {
        if (this.cam && this.cam.readyState === 'ended') void this.setCam(false).catch(() => {});
      };
      this.publish('camera', this.cam);
    } else {
      stopTrack(this.cam);
      this.cam = null;
      this.camStream = null;
      this.publish('camera', null);
    }
    this.me.cam = on && !!this.cam;
    this.afterLocalChange();
  }

  async setScreen(on: boolean) {
    if (this.me.role !== 'host') throw new MediaError('unsupported', 'Only the teacher can share a screen.');
    if (on) {
      stopTrack(this.scr);
      this.scr = await openScreen();
      this.scrStream = new MediaStream([this.scr]);
      this.scr.onended = () => void this.setScreen(false).catch(() => {});
      this.publish('screen', this.scr);
    } else {
      stopTrack(this.scr);
      this.scr = null;
      this.scrStream = null;
      this.publish('screen', null);
    }
    this.me.screen = on && !!this.scr;
    this.afterLocalChange();
  }

  private afterLocalChange() {
    this.hello();
    this.push();
  }

  localCamera() {
    return this.camStream;
  }
  localScreen() {
    return this.scrStream;
  }

  /* ───────────── events to the screen ───────────── */

  private lastPeople = '';
  private push() {
    if (this.closed) return;
    const people = [this.me, ...[...this.peers.values()].map((p) => p.person).sort((a, b) => a.joinedAt - b.joinedAt)].map((p) => ({ ...p }));
    const sig = JSON.stringify(people);
    const streams: Record<string, PersonStreams> = {};
    this.peers.forEach((p, id) => {
      streams[id] = { camera: p.streams.camera && (p.hasMedia.camera || p.streams.camera.getAudioTracks().length) ? p.streams.camera : null, screen: p.streams.screen && p.person.screen && p.hasMedia.screen ? p.streams.screen : null };
    });
    if (sig !== this.lastPeople) {
      this.lastPeople = sig;
      this.ev.onPeople(people);
    }
    this.ev.onStreams(streams);
  }

  state(): ConnState {
    return this.closed ? 'disconnected' : 'connected';
  }
}
