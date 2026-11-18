/**
 * Real-time Live Class Room Engine for Web & Hybrid.
 * Provides:
 *  1. Real camera & microphone media acquisition via `navigator.mediaDevices.getUserMedia`
 *  2. Real screen sharing via `navigator.mediaDevices.getDisplayMedia`
 *  3. Real audio level analysis via Web Audio API (AnalyserNode)
 *  4. Direct cross-tab WebRTC peer-to-peer video/audio streaming between Educator and Students
 *  5. Real-time synchronized chat, Q&A, hand raises, polls, and slide/stage navigation via BroadcastChannel
 *  6. Real participant presence tracking (no dummy bot accounts or fake viewer numbers)
 */
import { Platform } from 'react-native';

export interface RoomParticipant {
  id: string;
  name: string;
  role: 'host' | 'student';
  isHost: boolean;
  joinedAt: number;
  camOn?: boolean;
  micOn?: boolean;
}

export interface RoomChatMessage {
  id: string;
  by: string;
  role: 'instructor' | 'student' | 'system' | 'me';
  text: string;
  at: string;
}

export interface RoomQA {
  id: string;
  by: string;
  q: string;
  a?: string;
  votes: number;
  answered: boolean;
  at: string;
}

export interface RoomPoll {
  id: string;
  q: string;
  options: string[];
  votes: number[];
  open: boolean;
  mine?: number;
}

export type StageMode = 'slides' | 'screen' | 'board';

export interface RoomEventHandlers {
  onParticipants?: (participants: RoomParticipant[]) => void;
  onChat?: (msg: RoomChatMessage) => void;
  onQA?: (qa: RoomQA) => void;
  onHand?: (who: string, up: boolean) => void;
  onPoll?: (poll: RoomPoll | null) => void;
  onSlide?: (index: number) => void;
  onStage?: (stage: StageMode) => void;
  onRemoteStream?: (stream: MediaStream | null) => void;
  onAllowSpeak?: (who: string, on: boolean) => void;
}

const clock = (d = new Date()) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export class RealtimeRoomSession {
  private channel: BroadcastChannel | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private audioMeterCleanup: (() => void) | null = null;
  private participants: RoomParticipant[] = [];
  private disposed = false;

  constructor(
    public readonly sessionId: string,
    public readonly user: { id: string; name: string; role: 'host' | 'student' },
    private handlers: RoomEventHandlers = {},
  ) {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(`bodhin_live_room_${sessionId}`);
      this.channel.onmessage = (event) => this.handleMessage(event.data);
    }

    // Register self
    const selfParticipant: RoomParticipant = {
      id: user.id,
      name: user.name,
      role: user.role,
      isHost: user.role === 'host',
      joinedAt: Date.now(),
    };
    this.participants = [selfParticipant];
  }

  /** Starts local camera and mic */
  async startCamera(video = true, audio = true): Promise<MediaStream | null> {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }
    try {
      if (this.localStream) {
        this.stopCamera();
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: audio,
      });
      this.localStream = stream;

      // Update peer connections if active
      this.peerConnections.forEach((pc) => {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      });

      return stream;
    } catch (err) {
      console.warn('[RealtimeRoom] Camera/Mic access denied or unavailable:', err);
      // Try audio only if video failed
      if (video && audio) {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.localStream = audioOnly;
          return audioOnly;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /** Starts screen sharing */
  async startScreen(): Promise<MediaStream | null> {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      return null;
    }
    try {
      const scr = await navigator.mediaDevices.getDisplayMedia({ video: true });
      this.screenStream = scr;
      scr.getVideoTracks()[0]?.addEventListener('ended', () => {
        this.stopScreen();
        this.handlers.onStage?.('slides');
      });
      return scr;
    } catch (e) {
      console.warn('[RealtimeRoom] Screen share cancelled:', e);
      return null;
    }
  }

  stopScreen() {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
  }

  stopCamera() {
    this.audioMeterCleanup?.();
    this.audioMeterCleanup = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }

  setMic(on: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = on;
      });
    }
  }

  setCam(on: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((t) => {
        t.enabled = on;
      });
    }
  }

  getLocalStream() {
    return this.localStream;
  }

  getScreenStream() {
    return this.screenStream;
  }

  /** Set up real-time audio volume monitoring */
  monitorAudioLevel(onLevel: (level: number) => void): () => void {
    if (Platform.OS !== 'web' || !this.localStream || !this.localStream.getAudioTracks().length) {
      return () => {};
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return () => {};
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(this.localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let animId: number;
      let active = true;

      const loop = () => {
        if (!active) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        onLevel(Math.min(1, Math.max(0, avg / 128)));
        animId = requestAnimationFrame(loop);
      };
      loop();

      const cleanup = () => {
        active = false;
        cancelAnimationFrame(animId);
        try {
          source.disconnect();
          analyser.disconnect();
          ctx.close();
        } catch {}
      };
      this.audioMeterCleanup = cleanup;
      return cleanup;
    } catch {
      return () => {};
    }
  }

  /** Announce presence into room */
  announceJoin() {
    this.post({
      t: this.user.role === 'host' ? 'host_join' : 'student_join',
      user: {
        id: this.user.id,
        name: this.user.name,
        role: this.user.role,
        isHost: this.user.role === 'host',
        joinedAt: Date.now(),
      },
    });
  }

  sendChat(text: string) {
    const msgId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const msg: RoomChatMessage = {
      id: msgId,
      by: this.user.name,
      role: this.user.role === 'host' ? 'instructor' : 'student',
      text,
      at: clock(),
    };
    this.post({ t: 'chat', msg });
  }

  sendQA(question: string) {
    const qId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const qa: RoomQA = {
      id: qId,
      by: this.user.name,
      q: question,
      votes: 1,
      answered: false,
      at: clock(),
    };
    this.post({ t: 'qa', qa });
  }

  answerQA(id: string, answer: string) {
    this.post({ t: 'qa_answer', id, answer, by: this.user.name });
  }

  raiseHand(up: boolean) {
    this.post({ t: 'hand', by: this.user.name, up });
  }

  allowSpeak(who: string, on: boolean) {
    this.post({ t: 'allow_speak', who, on });
  }

  launchPoll(id: string, q: string, options: string[]) {
    const poll: RoomPoll = {
      id,
      q,
      options,
      votes: options.map(() => 0),
      open: true,
    };
    this.post({ t: 'poll', poll });
  }

  votePoll(id: string, optionIndex: number) {
    this.post({ t: 'vote', id, option: optionIndex, by: this.user.name });
  }

  closePoll(id: string) {
    this.post({ t: 'poll_close', id });
  }

  changeSlide(index: number) {
    this.post({ t: 'slide', index });
  }

  changeStage(mode: StageMode) {
    this.post({ t: 'stage', mode });
  }

  private post(msg: any) {
    if (this.disposed || !this.channel) return;
    try {
      this.channel.postMessage(msg);
    } catch (e) {
      console.warn('[RealtimeRoom] broadcast failed:', e);
    }
  }

  private async handleMessage(msg: any) {
    if (!msg || typeof msg !== 'object') return;

    switch (msg.t) {
      case 'student_join': {
        const u = msg.user as RoomParticipant;
        if (!this.participants.some((p) => p.id === u.id)) {
          this.participants = [...this.participants, u];
          this.handlers.onParticipants?.(this.participants);
        }
        // If we are host, reply with presence so student gets the host and room state
        if (this.user.role === 'host') {
          this.post({
            t: 'host_presence',
            user: { id: this.user.id, name: this.user.name, role: 'host', isHost: true, joinedAt: Date.now() },
            participants: this.participants,
          });
          // Initiate WebRTC connection to this student if we have video/audio
          if (this.localStream) {
            this.initiateWebRTC(u.id);
          }
        }
        break;
      }

      case 'host_join':
      case 'host_presence': {
        const host = msg.user as RoomParticipant;
        if (!this.participants.some((p) => p.id === host.id)) {
          this.participants = [host, ...this.participants.filter((p) => p.id !== host.id)];
        }
        if (Array.isArray(msg.participants)) {
          // Merge unique participants
          const map = new Map<string, RoomParticipant>();
          this.participants.forEach((p) => map.set(p.id, p));
          msg.participants.forEach((p: RoomParticipant) => map.set(p.id, p));
          this.participants = Array.from(map.values());
        }
        this.handlers.onParticipants?.(this.participants);
        break;
      }

      case 'student_leave': {
        this.participants = this.participants.filter((p) => p.id !== msg.id);
        this.handlers.onParticipants?.(this.participants);
        const pc = this.peerConnections.get(msg.id);
        if (pc) {
          pc.close();
          this.peerConnections.delete(msg.id);
        }
        break;
      }

      case 'chat':
        if (msg.msg) {
          this.handlers.onChat?.(msg.msg);
        }
        break;

      case 'qa':
        if (msg.qa) {
          this.handlers.onQA?.(msg.qa);
        }
        break;

      case 'qa_answer':
        // Host answered a question
        this.handlers.onChat?.({
          id: `ans_${Date.now()}`,
          by: msg.by || 'Instructor',
          role: 'instructor',
          text: `Q&A: ${msg.answer}`,
          at: clock(),
        });
        break;

      case 'hand':
        this.handlers.onHand?.(msg.by, !!msg.up);
        break;

      case 'allow_speak':
        this.handlers.onAllowSpeak?.(msg.who, !!msg.on);
        break;

      case 'poll':
        this.handlers.onPoll?.(msg.poll);
        break;

      case 'poll_close':
        this.handlers.onPoll?.(null);
        break;

      case 'slide':
        this.handlers.onSlide?.(msg.index);
        break;

      case 'stage':
        this.handlers.onStage?.(msg.mode);
        break;

      case 'webrtc_signal':
        if (msg.target === this.user.id) {
          this.handleWebRTCSignal(msg.from, msg.signal);
        }
        break;
    }
  }

  /** Set up peer-to-peer WebRTC connection between host and student */
  private async initiateWebRTC(studentId: string) {
    if (Platform.OS !== 'web' || typeof RTCPeerConnection === 'undefined') return;
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      this.peerConnections.set(studentId, pc);

      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => pc.addTrack(t, this.localStream!));
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.post({
            t: 'webrtc_signal',
            from: this.user.id,
            target: studentId,
            signal: { type: 'candidate', candidate: e.candidate },
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.post({
        t: 'webrtc_signal',
        from: this.user.id,
        target: studentId,
        signal: { type: 'offer', sdp: offer.sdp },
      });
    } catch (e) {
      console.warn('[RealtimeRoom] WebRTC initiate failed:', e);
    }
  }

  private async handleWebRTCSignal(from: string, signal: any) {
    if (Platform.OS !== 'web' || typeof RTCPeerConnection === 'undefined') return;
    try {
      let pc = this.peerConnections.get(from);

      if (signal.type === 'offer') {
        if (!pc) {
          pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          });
          this.peerConnections.set(from, pc);

          pc.onicecandidate = (e) => {
            if (e.candidate) {
              this.post({
                t: 'webrtc_signal',
                from: this.user.id,
                target: from,
                signal: { type: 'candidate', candidate: e.candidate },
              });
            }
          };

          pc.ontrack = (e) => {
            if (e.streams[0]) {
              this.handlers.onRemoteStream?.(e.streams[0]);
            }
          };
        }

        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.post({
          t: 'webrtc_signal',
          from: this.user.id,
          target: from,
          signal: { type: 'answer', sdp: answer.sdp },
        });
      } else if (signal.type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      }
    } catch (e) {
      console.warn('[RealtimeRoom] WebRTC signal handle failed:', e);
    }
  }

  dispose() {
    this.disposed = true;
    if (this.user.role === 'student') {
      this.post({ t: 'student_leave', id: this.user.id });
    }
    this.stopCamera();
    this.stopScreen();
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.channel?.close();
    this.channel = null;
  }
}
