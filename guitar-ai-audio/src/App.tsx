/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { ScoreData, TabNote, GuitarString, ViewMode, TranscriptionJobSettings, MeasureChord } from './types/music';
import { TranscriptionItem } from './data/libraryData';
import { pickDefaultScore, getFeaturedScore } from './utils/librarySource';
import { guitarAudio } from './audio/guitarSynth';
import { Navbar } from './components/Navbar';
import { GuitarPlatformHome } from './components/GuitarPlatformHome';
import { TranscriptionListView } from './components/TranscriptionListView';
import { WizardModal } from './components/WizardModal';
import { TranscriptionProgressModal } from './components/TranscriptionProgressModal';
import { ScoreViewer } from './components/ScoreViewer';
import { GuitarFretboard } from './components/GuitarFretboard';
import { VideoPlayerWindow } from './components/VideoPlayerWindow';
import { TabEditorHUD } from './components/TabEditorHUD';
import { BottomPlaybackBar } from './components/BottomPlaybackBar';
import { DownloadModal } from './components/DownloadModal';
import { DemucsArchitectureModal } from './components/DemucsArchitectureModal';
import { useIsMobile } from './utils/useIsMobile';
import { UserProfile, UserRole, DEFAULT_USER, DEMO_USERS } from './types/auth';
import { SignInModal } from './components/SignInModal';
import { SignUpModal } from './components/SignUpModal';
import { AccountSettingsView } from './components/AccountSettingsView';
import { CurriculumStudioCMS } from './components/CurriculumStudioCMS';
import { PricingPlansView } from './components/PricingPlansView';
import { CreditsExceededModal } from './components/CreditsExceededModal';
import { CourseReturnContext } from './utils/scoreResolver';
import { backendService } from './utils/backendService';
import { ArrowLeft } from 'lucide-react';

export default function App() {
  const isMobile = useIsMobile(768);

  // App screen navigation: 'entrance' | 'library' | 'workspace' | 'account' | 'cms'
  const [currentScreen, setCurrentScreen] = useState<'entrance' | 'library' | 'workspace' | 'account' | 'cms'>('entrance');
  const [cmsTab, setCmsTab] = useState<'curriculum' | 'videos' | 'chords' | 'users'>('curriculum');

  // Course navigation context when jumping between curriculum chapter and practice score
  const [courseReturnContext, setCourseReturnContext] = useState<CourseReturnContext | null>(null);
  const [activeCourseIdForCMS, setActiveCourseIdForCMS] = useState<string | null>(null);
  const [activeChapterIdForCMS, setActiveChapterIdForCMS] = useState<string | null>(null);

  // User Profile Auth State (gardenartgz@gmail.com is set as super_admin to manage all functions)
  //
  // ⚠️ `guitarmate_user` 现在只当**会话指针**用（"这台浏览器上登的是谁"），
  // 资料本体一律以**后端**为准：
  // 原来是把整份 `UserProfile` 存本地并直接拿来当 state，于是
  // 「在另一台设备/另一个标签页改了积分或资料」之后，这里会一直显示旧值 ——
  // 而 `useState` 的初值**之后再也不会重新计算**，看起来就是"同步没生效"。
  // 现在：拿本地记录的 id 去后端缓存里取当前资料；取不到才退回本地那份。
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('guitarmate_user');
    let session: UserProfile | null = null;
    if (saved) {
      try {
        session = JSON.parse(saved) as UserProfile;
      } catch {
        // 坏数据就当没登过（下面会退回默认用户）
      }
    }

    // 以库为准：同一个账号在别处改过资料/积分，这里打开就是最新的
    const fromBackend = session
      ? backendService.getUsers().find((u) => u.id === session!.id || u.email === session!.email)
      : undefined;
    const base = fromBackend ?? session;

    if (base) {
      if (base.email === 'gardenartgz@gmail.com' || base.id === 'usr_gardenart') {
        const adminUser: UserProfile = {
          ...base,
          role: 'super_admin' as UserRole,
          name: 'Gardenart (超级管理员)',
          isLoggedIn: true,
        };
        localStorage.setItem('guitarmate_user', JSON.stringify(adminUser));
        return adminUser;
      }
      return { ...base, isLoggedIn: true };
    }
    return DEFAULT_USER;
  });

  const handleOpenCMS = (tab?: 'curriculum' | 'videos' | 'chords' | 'users') => {
    setCmsTab(tab || 'curriculum');
    setCurrentScreen('cms');
  };

  const handleUpdateUser = (updatedUser: UserProfile) => {
    setUser(updatedUser);
    localStorage.setItem('guitarmate_user', JSON.stringify(updatedUser));
  };

  const handleSwitchRole = (role: UserRole) => {
    const newUser = DEMO_USERS[role];
    setUser(newUser);
    localStorage.setItem('guitarmate_user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    const loggedOutUser: UserProfile = {
      ...user,
      isLoggedIn: false,
    };
    setUser(loggedOutUser);
    localStorage.setItem('guitarmate_user', JSON.stringify(loggedOutUser));
    setCurrentScreen('entrance');
  };

  // Auth Modals state
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [isSignUpOpen, setIsSignUpOpen] = useState(false);

  const handleSuccessAuth = (authUser: UserProfile) => {
    setUser(authUser);
    localStorage.setItem('guitarmate_user', JSON.stringify(authUser));
    setIsSignInOpen(false);
    setIsSignUpOpen(false);
  };

  // Global theme state ('light' | 'dark', defaulting to 'light' to perfectly unify with white score library & sheets)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('guitarmate_theme') as 'light' | 'dark') || 'light';
  });

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('guitarmate_theme', next);
      return next;
    });
  };

  // Library Items state (User generated + System library)
  //
  // ⚠️ 初始值来自后端（`main.tsx` 已经等 hydrate 完成才首次渲染），
  // 不再直接用源码里的 `INITIAL_LIBRARY_ITEMS` —— 否则「后端有数据但界面显示演示数据」。
  // 写入统一走 `setLibraryItems`：先更新本地 state（UI 立即响应），再写穿透到后端。
  const [libraryItems, setLibraryItemsState] = useState<TranscriptionItem[]>(() =>
    backendService.getLibraryItems(),
  );
  const setLibraryItems: React.Dispatch<React.SetStateAction<TranscriptionItem[]>> = (updater) =>
    setLibraryItemsState((prev) => {
      const next = typeof updater === 'function' ? (updater as (p: TranscriptionItem[]) => TranscriptionItem[])(prev) : updater;
      backendService.saveLibraryItems(next);
      return next;
    });

  // Active Score State
  //
  // ⚠️ 初始谱从**后端曲库**取（招牌演示曲 → 曲库第一条 → 空谱占位），
  // 不再直接用源码常量 `MACAROON_5_SCORE` —— 这样「练习乐谱」的来源就统一了：
  // 运营把这首换掉/改谱，前端不用改代码也不用发版。
  // 库里那份内容与原来的常量**逐字节相同**（迁移时做过 JSON 深度相等校验），所以界面不变。
  const [score, setScore] = useState<ScoreData>(() => pickDefaultScore());

  // Fretboard Height & Visibility State (Requirement 1)
  const [isFretboardVisible, setIsFretboardVisible] = useState(true);
  const [fretboardHeight, setFretboardHeight] = useState(210);
  const [isResizingFretboard, setIsResizingFretboard] = useState(false);

  // External Video Window State (Requirement 2)
  const hasVideoSource = score.sourceType === 'youtube' || score.sourceType === 'tiktok' || !!score.videoUrl;
  const [isVideoVisible, setIsVideoVisible] = useState(true);
  const [isVideoDocked, setIsVideoDocked] = useState(true);
  const [isVideoMinimized, setIsVideoMinimized] = useState(false);
  const [videoFloatingPos, setVideoFloatingPos] = useState({ x: 30, y: 120 });
  const [mobileBottomTab, setMobileBottomTab] = useState<'fretboard' | 'video'>('fretboard');

  // Handle fretboard vertical resize drag
  const handleResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingFretboard(true);
    const startY = e.clientY;
    const startH = fretboardHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY; // dragging upwards increases fretboard height
      const newH = Math.max(140, Math.min(420, startH + deltaY));
      setFretboardHeight(newH);
    };

    const handleMouseUp = () => {
      setIsResizingFretboard(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Wizard & Ingestion state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardSource, setWizardSource] = useState<{
    type: 'upload' | 'url' | 'record';
    name: string;
    file?: File;
    url?: string;
  }>({
    type: 'url',
    name: 'Macaroon 5 | YouTube Audio Library',
  });
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [activeJobSettings, setActiveJobSettings] = useState<TranscriptionJobSettings | null>(null);

  // Modals state
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [exceededCreditsModal, setExceededCreditsModal] = useState<{
    isOpen: boolean;
    type: 'transcription' | 'curriculum_publish';
    required: number;
  }>({
    isOpen: false,
    type: 'transcription',
    required: 30,
  });

  // Playback & Timing state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [playbackMeasure, setPlaybackMeasure] = useState(1);
  const [playbackBeat, setPlaybackBeat] = useState(0);
  const [activeSoundingNotes, setActiveSoundingNotes] = useState<TabNote[]>([]);
  const [audioTrack, setAudioTrack] = useState<'transcribed' | 'original'>('transcribed');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [transposeSemitones, setTransposeSemitones] = useState(0);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);

  // View & UI state
  const [viewMode, setViewMode] = useState<ViewMode>('page');
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [isEditMode, setIsEditMode] = useState(false);

  // Note & Chord Editor state
  const [selectedNote, setSelectedNote] = useState<TabNote | null>(null);
  const [selectedChord, setSelectedChord] = useState<{ measureId: string; chord: MeasureChord } | null>(null);
  const [hudPosition, setHudPosition] = useState<{ x: number; y: number } | null>(null);

  // Section Practice Loop State (A-B Looping by Measures)
  const [isLooping, setIsLooping] = useState(false);
  const [loopRange, setLoopRange] = useState<{ startMeasure: number; endMeasure: number }>({
    startMeasure: 1,
    endMeasure: 4,
  });

  // References for playback loop
  const playbackAnimFrameRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackOffsetSecRef = useRef<number>(0);
  const lastPlayedBeatRef = useRef<number>(-1);
  const scheduledNotesRef = useRef<Set<string>>(new Set());
  const currentMeasureRef = useRef<number>(1);

  // Calculation parameters:
  const secondsPerBeat = (60 / score.tempo) / playbackSpeed;
  const secondsPerMeasure = secondsPerBeat * 4;
  const totalScoreDuration = score.measures.length * secondsPerMeasure;

  const loopStartSec = (loopRange.startMeasure - 1) * secondsPerMeasure;
  const loopEndSec = loopRange.endMeasure * secondsPerMeasure;

  // Real-time Playback Animation & Audio Scheduler
  useEffect(() => {
    if (!isPlaying) {
      if (playbackAnimFrameRef.current) {
        cancelAnimationFrame(playbackAnimFrameRef.current);
      }
      scheduledNotesRef.current.clear();
      setActiveSoundingNotes([]);
      return;
    }

    playbackStartTimeRef.current = performance.now();

    const tick = () => {
      const now = performance.now();
      // Read current offset directly from ref to avoid stale closure when jumping measures
      const elapsedSec = (now - playbackStartTimeRef.current) / 1000 + playbackOffsetSecRef.current;

      // Handle Section Practice Loop (A-B Looping)
      if (isLooping && elapsedSec >= loopEndSec) {
        playbackStartTimeRef.current = performance.now();
        playbackOffsetSecRef.current = loopStartSec;
        setCurrentTimeSeconds(loopStartSec);
        setPlaybackMeasure(loopRange.startMeasure);
        setPlaybackBeat(0);
        lastPlayedBeatRef.current = Math.floor(loopStartSec / secondsPerBeat) - 1;
        scheduledNotesRef.current.clear();
        currentMeasureRef.current = loopRange.startMeasure;
        playbackAnimFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      if (elapsedSec >= totalScoreDuration) {
        // Reached end of score
        setIsPlaying(false);
        playbackStartTimeRef.current = performance.now();
        playbackOffsetSecRef.current = 0;
        setCurrentTimeSeconds(0);
        setPlaybackMeasure(1);
        setPlaybackBeat(0);
        lastPlayedBeatRef.current = -1;
        scheduledNotesRef.current.clear();
        currentMeasureRef.current = 1;
        setActiveSoundingNotes([]);
        return;
      }

      setCurrentTimeSeconds(elapsedSec);

      // Determine current measure and beat
      const mIdx = Math.floor(elapsedSec / secondsPerMeasure);
      const beatInMeasure = (elapsedSec % secondsPerMeasure) / secondsPerBeat;
      const currentMeasureNumber = mIdx + 1;

      if (currentMeasureNumber !== currentMeasureRef.current) {
        currentMeasureRef.current = currentMeasureNumber;
      }

      setPlaybackMeasure(currentMeasureNumber);
      setPlaybackBeat(beatInMeasure);

      // Sub-millisecond Lookahead Audio Scheduler:
      // Schedules audio notes ~120ms into the future directly to Web Audio API hardware clock.
      // Compensates for physical DAC & output buffer latency (~18ms) so the acoustic wavefront
      // hits the user's ears at the EXACT SAME INSTANT the visual cyan beam aligns with the notehead center.
      const ctx = guitarAudio.getContext();
      const audioNow = ctx.currentTime;
      const hardwareLatency = (ctx.outputLatency || 0.015) + (ctx.baseLatency || 0.006);
      const LOOKAHEAD_SEC = 0.12;
      const lookaheadWindowEnd = elapsedSec + LOOKAHEAD_SEC;

      const minM = Math.max(0, mIdx);
      const maxM = Math.min(score.measures.length - 1, mIdx + 1);

      for (let m = minM; m <= maxM; m++) {
        const mData = score.measures[m];
        if (!mData) continue;

        mData.notes.forEach((note) => {
          const noteStartSec = m * secondsPerMeasure + note.beat * secondsPerBeat;
          const noteKey = `${m}_${note.id}`;

          if (
            noteStartSec >= elapsedSec - 0.01 &&
            noteStartSec <= lookaheadWindowEnd &&
            !scheduledNotesRef.current.has(noteKey) &&
            !note.isTied
          ) {
            scheduledNotesRef.current.add(noteKey);
            const timeUntilNote = (noteStartSec - elapsedSec) / playbackSpeed;
            // Precise Web Audio hardware scheduling with DAC buffer latency compensation
            const targetAudioTime = audioNow + Math.max(0, timeUntilNote - hardwareLatency);
            const durationSec = note.durationBeats * secondsPerBeat * 1.5;
            const transposedMidi = note.midi + transposeSemitones;
            const isOriginal = audioTrack === 'original';
            guitarAudio.playNote(
              transposedMidi,
              durationSec,
              isOriginal ? 0.95 : 0.85,
              isOriginal ? 'electric' : 'acoustic',
              targetAudioTime,
              isOriginal
            );
          }
        });
      }

      // Discrete beat tick for metronome with hardware lookahead scheduling
      const currentBeatFloor = Math.floor(elapsedSec / secondsPerBeat);
      if (currentBeatFloor !== lastPlayedBeatRef.current) {
        lastPlayedBeatRef.current = currentBeatFloor;
        if (isMetronomeActive) {
          const isDownbeat = currentBeatFloor % 4 === 0;
          const beatTime = currentBeatFloor * secondsPerBeat;
          const timeUntilBeat = (beatTime - elapsedSec) / playbackSpeed;
          const targetAudioTime = audioNow + Math.max(0, timeUntilBeat - hardwareLatency);
          guitarAudio.playClick(isDownbeat, targetAudioTime);
        }
      }

      // Check which notes in current measure are sounding right now
      const currMeasureData = score.measures[mIdx];
      if (currMeasureData) {
        const activeNotesNow: TabNote[] = [];
        currMeasureData.notes.forEach((note) => {
          const noteStartSec = mIdx * secondsPerMeasure + note.beat * secondsPerBeat;
          const noteEndSec = noteStartSec + note.durationBeats * secondsPerBeat;

          if (elapsedSec >= noteStartSec - 0.005 && elapsedSec < noteEndSec) {
            activeNotesNow.push(note);
          }
        });

        setActiveSoundingNotes(activeNotesNow);
      } else {
        setActiveSoundingNotes([]);
      }

      playbackAnimFrameRef.current = requestAnimationFrame(tick);
    };

    playbackAnimFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (playbackAnimFrameRef.current) {
        cancelAnimationFrame(playbackAnimFrameRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, secondsPerBeat, secondsPerMeasure, totalScoreDuration, score, isMetronomeActive, transposeSemitones, isLooping, loopStartSec, loopEndSec, loopRange]);

  // Transport handlers
  const handleTogglePlay = () => {
    if (!isPlaying) {
      playbackStartTimeRef.current = performance.now();
      playbackOffsetSecRef.current = currentTimeSeconds;
      scheduledNotesRef.current.clear();
      setIsPlaying(true);
    } else {
      playbackOffsetSecRef.current = currentTimeSeconds;
      setIsPlaying(false);
      scheduledNotesRef.current.clear();
      setActiveSoundingNotes([]);
    }
  };

  const handleRewind = () => {
    setIsPlaying(false);
    playbackStartTimeRef.current = performance.now();
    playbackOffsetSecRef.current = 0;
    setCurrentTimeSeconds(0);
    setPlaybackMeasure(1);
    setPlaybackBeat(0);
    lastPlayedBeatRef.current = -1;
    scheduledNotesRef.current.clear();
    currentMeasureRef.current = 1;
    setActiveSoundingNotes([]);
  };

  const handleJumpToMeasure = (measureNum: number) => {
    const clampedMeasure = Math.max(1, Math.min(score.measures.length, measureNum));
    const targetSec = (clampedMeasure - 1) * secondsPerMeasure;
    playbackStartTimeRef.current = performance.now();
    playbackOffsetSecRef.current = targetSec;
    setCurrentTimeSeconds(targetSec);
    setPlaybackMeasure(clampedMeasure);
    setPlaybackBeat(0);
    lastPlayedBeatRef.current = Math.floor(targetSec / secondsPerBeat) - 1;
    scheduledNotesRef.current.clear();
    currentMeasureRef.current = clampedMeasure;
    setActiveSoundingNotes([]);
  };

  const handleToggleLoop = () => {
    setIsLooping((prev) => {
      const next = !prev;
      if (next) {
        // If current position is outside loop range, jump to loop start
        if (playbackMeasure < loopRange.startMeasure || playbackMeasure > loopRange.endMeasure) {
          handleJumpToMeasure(loopRange.startMeasure);
        }
      }
      return next;
    });
  };

  const handleSeek = (seconds: number) => {
    const clamped = Math.max(0, Math.min(totalScoreDuration, seconds));
    playbackStartTimeRef.current = performance.now();
    playbackOffsetSecRef.current = clamped;
    setCurrentTimeSeconds(clamped);
    const mIdx = Math.min(score.measures.length - 1, Math.floor(clamped / secondsPerMeasure));
    setPlaybackMeasure(mIdx + 1);
    setPlaybackBeat((clamped % secondsPerMeasure) / secondsPerBeat);
    lastPlayedBeatRef.current = Math.floor(clamped / secondsPerBeat) - 1;
    scheduledNotesRef.current.clear();
    currentMeasureRef.current = mIdx + 1;
  };

  // Note Selection & Editing Handlers
  const handleSelectNote = (note: TabNote, clientPos: { x: number; y: number }) => {
    setSelectedChord(null);
    setSelectedNote(note);
    setHudPosition(clientPos);
    // Audition note sound
    guitarAudio.playNote(note.midi + transposeSemitones, 1.0, 0.85);
  };

  const handleSelectChord = (measureId: string, chord: MeasureChord, clientPos: { x: number; y: number }) => {
    setSelectedNote(null);
    setSelectedChord({ measureId, chord });
    setHudPosition(clientPos);
  };

  const handleUpdateNote = (updatedProperties: Partial<TabNote>) => {
    if (!selectedNote) return;

    setScore((prev) => {
      const newMeasures = prev.measures.map((m) => {
        const noteIdx = m.notes.findIndex((n) => n.id === selectedNote.id);
        if (noteIdx !== -1) {
          const newNotes = [...m.notes];
          newNotes[noteIdx] = { ...newNotes[noteIdx], ...updatedProperties };
          return { ...m, notes: newNotes };
        }
        return m;
      });
      return { ...prev, measures: newMeasures };
    });

    setSelectedNote((prev) => (prev ? { ...prev, ...updatedProperties } : null));
  };

  const handleDeleteNote = (noteId: string) => {
    setScore((prev) => ({
      ...prev,
      measures: prev.measures.map((m) => ({
        ...m,
        notes: m.notes.filter((n) => n.id !== noteId),
      })),
    }));
    setSelectedNote(null);
  };

  const handleNavigateNote = (direction: 'up' | 'down' | 'left' | 'right' | 'nextBeat' | 'prevBeat') => {
    if (!selectedNote) return;

    // Find current note in score
    let currentMeasureIndex = -1;
    let currentNoteIndex = -1;

    for (let m = 0; m < score.measures.length; m++) {
      const idx = score.measures[m].notes.findIndex((n) => n.id === selectedNote.id);
      if (idx !== -1) {
        currentMeasureIndex = m;
        currentNoteIndex = idx;
        break;
      }
    }

    if (currentMeasureIndex === -1) return;

    const currMeasure = score.measures[currentMeasureIndex];

    if (direction === 'left') {
      if (currentNoteIndex > 0) {
        const prevNote = currMeasure.notes[currentNoteIndex - 1];
        setSelectedNote(prevNote);
        guitarAudio.playNote(prevNote.midi, 0.8, 0.85);
      } else if (currentMeasureIndex > 0) {
        const prevMeasure = score.measures[currentMeasureIndex - 1];
        if (prevMeasure.notes.length > 0) {
          const lastNote = prevMeasure.notes[prevMeasure.notes.length - 1];
          setSelectedNote(lastNote);
          guitarAudio.playNote(lastNote.midi, 0.8, 0.85);
        }
      }
    } else if (direction === 'right') {
      if (currentNoteIndex < currMeasure.notes.length - 1) {
        const nextNote = currMeasure.notes[currentNoteIndex + 1];
        setSelectedNote(nextNote);
        guitarAudio.playNote(nextNote.midi, 0.8, 0.85);
      } else if (currentMeasureIndex < score.measures.length - 1) {
        const nextMeasure = score.measures[currentMeasureIndex + 1];
        if (nextMeasure.notes.length > 0) {
          const firstNote = nextMeasure.notes[0];
          setSelectedNote(firstNote);
          guitarAudio.playNote(firstNote.midi, 0.8, 0.85);
        }
      }
    } else if (direction === 'nextBeat' || direction === 'prevBeat') {
      // Shift beat timing
      const delta = direction === 'nextBeat' ? 0.5 : -0.5;
      const newBeat = Math.max(0, Math.min(3.5, selectedNote.beat + delta));
      handleUpdateNote({ beat: newBeat });
    }
  };

  const handleUpdateChord = (measureId: string, chordName: string) => {
    setScore((prev) => ({
      ...prev,
      measures: prev.measures.map((m) => {
        if (m.id === measureId) {
          return {
            ...m,
            chord: {
              name: chordName,
              beat: m.chord?.beat || 0,
              diagramFret: chordName === 'Cm' ? 3 : chordName === 'Ab' ? 4 : 1,
            },
          };
        }
        return m;
      }),
    }));
  };

  const handleAddNoteAt = (measureId: string, string: GuitarString, beat: number) => {
    const newNoteId = `n-${Date.now()}`;
    const defaultFret = 3;
    const { midi, pitch } = { midi: 58, pitch: 'Bb3' };

    const newNote: TabNote = {
      id: newNoteId,
      string,
      fret: defaultFret,
      beat,
      duration: 'q',
      durationBeats: 1.0,
      midi,
      pitch,
      technique: 'none',
    };

    setScore((prev) => ({
      ...prev,
      measures: prev.measures.map((m) => {
        if (m.id === measureId) {
          return {
            ...m,
            notes: [...m.notes, newNote].sort((a, b) => a.beat - b.beat),
          };
        }
        return m;
      }),
    }));

    setSelectedNote(newNote);
    guitarAudio.playNote(midi, 0.8, 0.85);
  };

  // Fretboard click handler
  const handleFretboardClick = (string: GuitarString, fret: number) => {
    if (selectedNote && isEditMode) {
      // Assign clicked fretboard coordinate to currently edited note!
      const baseMidi = [0, 64, 59, 55, 50, 45, 40][string];
      const midi = baseMidi + fret;
      handleUpdateNote({ string, fret, midi });
    }
  };

  // Ingestion wizard workflow
  const handleStartWizard = (source: { type: 'upload' | 'url' | 'record'; name: string; file?: File; url?: string }) => {
    setWizardSource(source);
    setIsWizardOpen(true);
  };

  const handleStartTranscription = (settings: TranscriptionJobSettings) => {
    // Section 4.3: Pre-flight Balance Check for Audio Transcription
    const durationMin = 3; // typical short demo duration
    const requiredCredits = durationMin * 10; // 10 Credits / minute

    if (user.role !== 'super_admin' && !user.isUnlimitedCredits) {
      const balanceCheck = backendService.checkCredits(user.id, requiredCredits);
      if (!balanceCheck.hasEnough) {
        setIsWizardOpen(false);
        setExceededCreditsModal({
          isOpen: true,
          type: 'transcription',
          required: requiredCredits,
        });
        return;
      }
    }

    setActiveJobSettings(settings);
    setIsWizardOpen(false);
    setIsProgressOpen(true);
  };

  // Select a song from library or curriculum
  const handleSelectSong = (selectedScore: ScoreData, courseContext?: CourseReturnContext) => {
    setIsPlaying(false);
    playbackStartTimeRef.current = performance.now();
    playbackOffsetSecRef.current = 0;
    setCurrentTimeSeconds(0);
    setPlaybackMeasure(1);
    setPlaybackBeat(0);
    lastPlayedBeatRef.current = -1;
    scheduledNotesRef.current.clear();
    currentMeasureRef.current = 1;
    setActiveSoundingNotes([]);
    setScore(selectedScore);
    setCourseReturnContext(courseContext || null);
    const hasVid = selectedScore.sourceType === 'youtube' || selectedScore.sourceType === 'tiktok' || !!selectedScore.videoUrl;
    setIsVideoVisible(hasVid);
    setIsVideoDocked(true);
    setIsVideoMinimized(false);
    setCurrentScreen('workspace');
  };

  // Return to Course Chapter List handler
  const handleReturnToCourse = () => {
    setIsPlaying(false);
    if (courseReturnContext) {
      // If student or guest completed this practice, record task completion
      if (courseReturnContext.itemId && (user.role === 'student' || user.role === 'trial_guest')) {
        backendService.setUserTaskCompleted(user.id, courseReturnContext.itemId, true);
      }
      setActiveCourseIdForCMS(courseReturnContext.courseId);
      setActiveChapterIdForCMS(courseReturnContext.chapterId || null);
    }
    setCmsTab('curriculum');
    setCurrentScreen('cms');
  };

  // Audio track switch (Transcribed vs Original) as requested
  const handleAudioTrackChange = (track: 'transcribed' | 'original') => {
    setAudioTrack(track);
    if (track === 'transcribed') {
      // Transcribed: close/hide video, only play score music
      setIsVideoVisible(false);
    } else {
      // Original: open video, play background video/audio track
      setIsVideoVisible(true);
      setIsVideoMinimized(false);
    }
  };

  const handleToggleFavorite = (id: string) => {
    setLibraryItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
      )
    );
  };

  const handleTranscriptionFinished = () => {
    setIsProgressOpen(false);
    const newTitle = activeJobSettings?.sourceName || wizardSource.name || 'New Transcription';

    // Atomic Credits deduction (10 credits / minute, 3 min audio = 30 credits)
    if (user.role !== 'super_admin' && !user.isUnlimitedCredits) {
      const deduction = backendService.deductCredits(
        user.id,
        30,
        `AI 音频转录扒谱: ${newTitle} (3分钟)`,
        'transcription'
      );
      setUser((prev) => ({
        ...prev,
        credits: deduction.newBalance,
      }));
    }

    /**
     * ⚠️ 当前**没有真正的 AI 转录服务**，这里是「模拟转录」：
     * 以招牌演示曲为底，换掉标题/调号等元信息，产出一份"新转谱"。
     * 基准谱从**后端曲库**取（原来直接引用源码常量 `MACAROON_5_SCORE`）——
     * 内容一样，但来源统一，将来接上真 AI 接口时只需替换这一段。
     */
    const baseForSimulation = getFeaturedScore() ?? pickDefaultScore();

    const newSongScore: ScoreData = {
      ...baseForSimulation,
      id: `score-${Date.now()}`,
      title: newTitle,
      subtitle: `${activeJobSettings?.instrument || 'Guitar'} AI Transcription`,
      timeSignature: activeJobSettings?.timeSignature || '4/4',
      keySignature: activeJobSettings?.keySignature || 'Eb/Cm',
      transcribedBy: 'User (You)',
    };

    const newLibraryItem: TranscriptionItem = {
      id: `user-${Date.now()}`,
      title: newTitle,
      subtitle: '用户自录/上传音频 AI 高精转谱',
      artist: '我生成的转谱',
      coverUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=240&auto=format&fit=crop&q=80',
      instrument: (activeJobSettings?.instrument as any) || 'Acoustic Guitar',
      category: 'user',
      type: 'unlocked',
      badges: ['TAB', '自转谱', 'AI生成'],
      tempo: baseForSimulation.tempo,
      keySignature: activeJobSettings?.keySignature || 'Eb/Cm',
      capo: 0,
      durationSeconds: 30,
      createdAt: new Date().toISOString().split('T')[0],
      isFavorite: true,
      score: newSongScore,
    };

    setLibraryItems((prev) => [newLibraryItem, ...prev]);
    handleSelectSong(newSongScore);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-gray-900 select-none overflow-x-hidden">
      
      {/* SCREEN 1: Professional Guitar Teaching & Practice Platform Homepage */}
      {currentScreen === 'entrance' ? (
        <GuitarPlatformHome
          onStartWizard={handleStartWizard}
          onOpenDemo={(demoScore) => handleSelectSong(demoScore || getFeaturedScore() || pickDefaultScore())}
          onOpenLibrary={() => setCurrentScreen('library')}
          onSelectSong={handleSelectSong}
          user={user}
          onOpenSignIn={() => setIsSignInOpen(true)}
          onOpenSignUp={() => setIsSignUpOpen(true)}
          onOpenAccountSettings={() => setCurrentScreen('account')}
          onOpenCMS={handleOpenCMS}
          onOpenPricing={() => setIsPricingOpen(true)}
        />
      ) : currentScreen === 'cms' ? (
        /* SCREEN 5: Curriculum Studio CMS (guitarmate-studio-cms) */
        <CurriculumStudioCMS
          currentUser={user}
          initialTab={cmsTab}
          onSwitchUserRole={handleSwitchRole}
          onGoHome={() => setCurrentScreen('entrance')}
          onOpenLibrary={() => setCurrentScreen('library')}
          onSelectSong={handleSelectSong}
          initialCourseId={activeCourseIdForCMS}
          initialChapterId={activeChapterIdForCMS}
        />
      ) : currentScreen === 'account' ? (
        /* SCREEN 4: Account Settings (account.png) */
        <AccountSettingsView
          user={user}
          onUpdateUser={handleUpdateUser}
          onLogout={handleLogout}
          onGoHome={() => setCurrentScreen('entrance')}
          onOpenLibrary={() => setCurrentScreen('library')}
          onSwitchUserRole={handleSwitchRole}
          onOpenCMS={handleOpenCMS}
        />
      ) : currentScreen === 'library' ? (
        /* SCREEN 2: Transcription List View (my-transcription.png / my-collection.png / filter.png) */
        <TranscriptionListView
          libraryItems={libraryItems}
          onSelectSong={handleSelectSong}
          onNewTranscription={() => setIsWizardOpen(true)}
          onToggleFavorite={handleToggleFavorite}
          onGoHome={() => setCurrentScreen('entrance')}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenAccountSettings={() => setCurrentScreen('account')}
          onOpenCourse={(cid) => {
            if (cid) setActiveCourseIdForCMS(cid);
            setCmsTab('curriculum');
            setCurrentScreen('cms');
          }}
        />
      ) : (
        /* SCREEN 3: Score Viewer, Fretboard & Editor Workspace */
        <div className="flex flex-col h-screen overflow-hidden">
          {/* Top Navbar */}
          <Navbar
            score={score}
            isEditMode={isEditMode}
            onToggleEditMode={(mode) => {
               setIsEditMode(mode);
               if (!mode) setSelectedNote(null);
            }}
            onOpenArchitectureModal={() => setIsArchitectureOpen(true)}
            onOpenDownloadModal={() => setIsDownloadOpen(true)}
            onNewTranscription={() => setIsWizardOpen(true)}
            onOpenLibrary={() => setCurrentScreen('library')}
            onGoHome={() => {
              setIsPlaying(false);
              setCurrentScreen('entrance');
            }}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            courseReturnContext={courseReturnContext}
            onReturnToCourse={handleReturnToCourse}
            onOpenCourse={(cid) => {
              if (cid) setActiveCourseIdForCMS(cid);
              setCmsTab('curriculum');
              setCurrentScreen('cms');
            }}
            onOpenScore={(sid) => {
              const found = libraryItems.find((s) => s.id === sid) || backendService.getLibraryItems().find((s) => s.id === sid);
              if (found) handleSelectSong(found.score);
            }}
            onOpenPricing={() => setIsPricingOpen(true)}
          />

          {/* Sticky Course Return Banner when viewing a practice score from a curriculum chapter */}
          {courseReturnContext && (
            <div className="bg-linear-to-r from-[#0d4a3b] via-[#12634e] to-[#0f3b30] text-white px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-emerald-600/40 shadow-xs z-20 shrink-0">
              <div className="flex items-center space-x-2 text-xs">
                <span className="bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 px-2 py-0.5 rounded-full font-bold text-[10px]">
                  {courseReturnContext.fromRole === 'teacher' || courseReturnContext.fromRole === 'super_admin' ? '教师试奏模式' : '课程实战练习'}
                </span>
                <span className="font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                  《{courseReturnContext.courseTitle}》
                </span>
                <span className="text-emerald-300/60 hidden sm:inline">›</span>
                <span className="text-emerald-100 font-medium hidden sm:inline">{courseReturnContext.chapterTitle}</span>
                <span className="text-emerald-300/60 hidden sm:inline">›</span>
                <span className="text-emerald-200 truncate max-w-[180px]">{courseReturnContext.itemTitle}</span>
              </div>
              <button
                type="button"
                onClick={handleReturnToCourse}
                className="flex items-center space-x-1.5 px-3 py-1 bg-white hover:bg-emerald-50 text-emerald-900 font-extrabold text-xs rounded-lg shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-emerald-700" />
                <span>{courseReturnContext.fromRole === 'teacher' || courseReturnContext.fromRole === 'super_admin' ? '返回课程大纲' : '完成练习并返回课程章节'}</span>
              </button>
            </div>
          )}

          {/* Main Workspace: Dual Notation Score (Top) + Interactive Guitar Fretboard & Video (Bottom) */}
          <div className="flex-1 flex flex-col min-h-0 relative">
            
            {/* Upper Portion: Dual 5-line staff & 6-line TAB score */}
            <div className="flex-1 min-h-[200px] overflow-hidden relative flex flex-col">
              <ScoreViewer
                score={score}
                playbackMeasure={playbackMeasure}
                playbackBeat={playbackBeat}
                isPlaying={isPlaying}
                viewMode={viewMode}
                zoomLevel={zoomLevel}
                isEditMode={isEditMode}
                selectedNote={selectedNote}
                selectedChord={selectedChord}
                activeSoundingNotes={activeSoundingNotes}
                isLooping={isLooping}
                loopRange={loopRange}
                onSelectNote={handleSelectNote}
                onSelectChord={handleSelectChord}
                onAddNoteAt={handleAddNoteAt}
              />
            </div>

            {/* Note & Chord Editing HUD (transcription2.png / transcription4.png) */}
            <TabEditorHUD
              selectedNote={selectedNote}
              selectedChord={selectedChord}
              position={hudPosition}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onNavigateNote={handleNavigateNote}
              onUpdateChord={handleUpdateChord}
              onClose={() => {
                setSelectedNote(null);
                setSelectedChord(null);
              }}
            />

            {/* Resizer Drag Handle Bar between Score and Fretboard (Requirement 1) */}
            {isFretboardVisible && (
              <div 
                onMouseDown={handleResizerMouseDown}
                className={`h-2.5 w-full bg-[#1b1c1e] hover:bg-emerald-600/60 border-t border-b border-gray-700/80 cursor-row-resize flex items-center justify-center transition-colors select-none group relative z-20 shrink-0 ${
                  isResizingFretboard ? 'bg-emerald-600' : ''
                }`}
                title="上下拖拽调整琴把高度，点击右侧可收起"
              >
                <div className="w-14 h-1 rounded-full bg-gray-500 group-hover:bg-white transition-colors" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFretboardVisible(false);
                  }}
                  className="absolute right-3 px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-600 text-[10px] font-sans font-medium flex items-center space-x-1 cursor-pointer shadow-xs"
                  title="收起吉他琴把，全屏展示乐谱"
                >
                  <span>收起琴把</span>
                  <span>▾</span>
                </button>
              </div>
            )}

            {/* Lower Portion: Guitar Fretboard & Docked Video Window */}
            {isFretboardVisible && (
              <div 
                style={{ height: `${fretboardHeight}px` }}
                className="shrink-0 flex flex-col md:flex-row bg-[#1b1c1e] overflow-hidden relative"
              >
                {/* Mobile View: Switch between Fretboard and Video */}
                {isMobile && hasVideoSource && isVideoVisible && !isVideoMinimized ? (
                  <div className="flex flex-col h-full w-full">
                    {/* Mobile tab bar */}
                    <div className="flex items-center bg-[#121315] px-2 py-1 border-b border-gray-700 justify-between text-xs">
                      <div className="flex items-center space-x-1 bg-gray-800 p-0.5 rounded">
                        <button
                          onClick={() => setMobileBottomTab('fretboard')}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            mobileBottomTab === 'fretboard' ? 'bg-emerald-600 text-white' : 'text-gray-400'
                          }`}
                        >
                          🎸 吉他指板
                        </button>
                        <button
                          onClick={() => setMobileBottomTab('video')}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            mobileBottomTab === 'video' ? 'bg-emerald-600 text-white' : 'text-gray-400'
                          }`}
                        >
                          📺 外部原视频
                        </button>
                      </div>

                      <button
                        onClick={() => setIsFretboardVisible(false)}
                        className="text-gray-400 hover:text-white text-xs px-2 py-0.5"
                      >
                        ✕ 收起
                      </button>
                    </div>

                    <div className="flex-1 min-h-0">
                      {mobileBottomTab === 'video' ? (
                        <VideoPlayerWindow
                          videoUrl={score.videoUrl}
                          videoTitle={score.videoTitle || score.title}
                          videoArtist={score.videoArtist || score.transcribedBy}
                          videoThumbnail={score.videoThumbnail}
                          currentTimeSeconds={currentTimeSeconds}
                          totalDurationSeconds={totalScoreDuration}
                          isPlaying={isPlaying}
                          audioTrack={audioTrack}
                          isDocked={false}
                          isMinimized={false}
                          floatingPosition={videoFloatingPos}
                          onTogglePlay={handleTogglePlay}
                          onSeek={handleSeek}
                          onClose={() => setIsVideoVisible(false)}
                          onMinimize={() => setIsVideoMinimized(true)}
                          onRestore={() => setIsVideoMinimized(false)}
                          onDockToggle={() => setIsVideoDocked(!isVideoDocked)}
                          onPositionChange={setVideoFloatingPos}
                          isMobile={true}
                        />
                      ) : (
                        <GuitarFretboard
                          activeNotes={activeSoundingNotes}
                          selectedNote={selectedNote}
                          capoFret={score.capo}
                          tuning={score.tuning}
                          onFretClick={handleFretboardClick}
                          onCloseFretboard={() => setIsFretboardVisible(false)}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  /* Desktop / Standard Mode */
                  <>
                    {/* Left: Fretboard (Shows 16 frets if docked with video, or 21 frets if video undocked/closed/minimized) */}
                    <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
                      <GuitarFretboard
                        activeNotes={activeSoundingNotes}
                        selectedNote={selectedNote}
                        capoFret={score.capo}
                        tuning={score.tuning}
                        onFretClick={handleFretboardClick}
                        isDockedWithVideo={hasVideoSource && isVideoVisible && isVideoDocked && !isVideoMinimized && !isMobile}
                        onCloseFretboard={() => setIsFretboardVisible(false)}
                      />
                    </div>

                    {/* Right: Docked Video Window (Tail of Fretboard) OR Drop Slot to snap back */}
                    {!isMobile && hasVideoSource && isVideoVisible && !isVideoMinimized && (
                      isVideoDocked ? (
                        <VideoPlayerWindow
                          videoUrl={score.videoUrl}
                          videoTitle={score.videoTitle || score.title}
                          videoArtist={score.videoArtist || score.transcribedBy}
                          videoThumbnail={score.videoThumbnail}
                          currentTimeSeconds={currentTimeSeconds}
                          totalDurationSeconds={totalScoreDuration}
                          isPlaying={isPlaying}
                          audioTrack={audioTrack}
                          isDocked={true}
                          isMinimized={false}
                          floatingPosition={videoFloatingPos}
                          onTogglePlay={handleTogglePlay}
                          onSeek={handleSeek}
                          onClose={() => setIsVideoVisible(false)}
                          onMinimize={() => setIsVideoMinimized(true)}
                          onRestore={() => setIsVideoMinimized(false)}
                          onDockToggle={(forceDock?: boolean) => setIsVideoDocked(forceDock !== undefined ? forceDock : false)}
                          onPositionChange={setVideoFloatingPos}
                          isMobile={false}
                        />
                      ) : (
                        /* Visual drop slot to drag back or click to snap video back into fretboard tail */
                        <div 
                          onClick={() => setIsVideoDocked(true)}
                          className="w-44 sm:w-52 h-full shrink-0 border-2 border-dashed border-emerald-500/50 hover:border-emerald-400 bg-emerald-950/20 hover:bg-emerald-900/30 rounded-xl m-1 flex flex-col items-center justify-center text-center p-2 text-emerald-300 transition-all cursor-pointer group select-none"
                          title="点击或将视频窗口拖回此处黏回把位尾部"
                        >
                          <span className="text-xl mb-1 group-hover:scale-125 transition-transform">🧲</span>
                          <span className="text-[11px] font-bold">拖回此处黏回把位</span>
                          <span className="text-[9px] text-emerald-400/80">松开鼠标或点击黏回</span>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            )}

            {/* Re-expand Fretboard Floating Button when Fretboard is Hidden */}
            {!isFretboardVisible && (
              <button
                onClick={() => setIsFretboardVisible(true)}
                className="fixed bottom-20 right-4 z-40 flex items-center space-x-1.5 px-3 py-1.5 bg-[#165a4c] hover:bg-[#10473c] text-white rounded-xl border border-emerald-400/50 shadow-2xl text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer"
                title="重新展开底部吉他琴把指板"
              >
                <span>🎸</span>
                <span>展开琴把指板</span>
              </button>
            )}

            {/* Floating or Minimized Video Window (when undocked, minimized, or when fretboard is collapsed, Desktop ONLY) */}
            {hasVideoSource && isVideoVisible && (!isVideoDocked || isVideoMinimized || !isFretboardVisible) && !isMobile && (
              <VideoPlayerWindow
                videoUrl={score.videoUrl}
                videoTitle={score.videoTitle || score.title}
                videoArtist={score.videoArtist || score.transcribedBy}
                videoThumbnail={score.videoThumbnail}
                currentTimeSeconds={currentTimeSeconds}
                totalDurationSeconds={totalScoreDuration}
                isPlaying={isPlaying}
                audioTrack={audioTrack}
                isDocked={false}
                isMinimized={isVideoMinimized}
                floatingPosition={videoFloatingPos}
                onTogglePlay={handleTogglePlay}
                onSeek={handleSeek}
                onClose={() => setIsVideoVisible(false)}
                onMinimize={() => setIsVideoMinimized(true)}
                onRestore={() => setIsVideoMinimized(false)}
                onDockToggle={(forceDock?: boolean) => {
                  setIsVideoDocked(forceDock !== undefined ? forceDock : true);
                  setIsVideoMinimized(false);
                }}
                onPositionChange={setVideoFloatingPos}
                isMobile={false}
              />
            )}

          </div>

          {/* Bottom Fixed Playback Bar (transcription.png) */}
          <BottomPlaybackBar
            isPlaying={isPlaying}
            currentTimeSeconds={currentTimeSeconds}
            totalDurationSeconds={totalScoreDuration}
            audioTrack={audioTrack}
            playbackSpeed={playbackSpeed}
            transposeSemitones={transposeSemitones}
            isMetronomeActive={isMetronomeActive}
            viewMode={viewMode}
            zoomLevel={zoomLevel}
            playbackMeasure={playbackMeasure}
            totalMeasures={score.measures.length}
            isLooping={isLooping}
            loopRange={loopRange}
            onTogglePlay={handleTogglePlay}
            onRewind={handleRewind}
            onSeek={handleSeek}
            onJumpToMeasure={handleJumpToMeasure}
            onToggleLoop={handleToggleLoop}
            onChangeLoopRange={setLoopRange}
            onChangeAudioTrack={handleAudioTrackChange}
            onChangeSpeed={setPlaybackSpeed}
            onChangeTranspose={setTransposeSemitones}
            onToggleMetronome={() => setIsMetronomeActive(!isMetronomeActive)}
            onChangeViewMode={setViewMode}
            onChangeZoom={setZoomLevel}
          />
        </div>
      )}

      {/* 6-step Wizard Modal (entrance1.png to entrance6.png) */}
      <WizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        source={wizardSource}
        onStartTranscription={handleStartTranscription}
      />

      {/* Demucs Stem Separation & Slicing Task Progress Screen */}
      {isProgressOpen && activeJobSettings && (
        <TranscriptionProgressModal
          settings={activeJobSettings}
          onComplete={handleTranscriptionFinished}
        />
      )}

      {/* Download / Export Modal (PDF, MIDI, MusicXML, GuitarPro, Tab JSON) */}
      <DownloadModal
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
        score={score}
        currentUser={user}
        onOpenPricing={() => {
          setIsDownloadOpen(false);
          setIsPricingOpen(true);
        }}
      />

      {/* Demucs v4 AI & FFmpeg Architecture Technical Blueprint */}
      <DemucsArchitectureModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
      />

      {/* Credits Exceeded Modal (Section 4.3 Pre-flight check) */}
      {exceededCreditsModal.isOpen && (
        <CreditsExceededModal
          isOpen={exceededCreditsModal.isOpen}
          onClose={() => setExceededCreditsModal((prev) => ({ ...prev, isOpen: false }))}
          currentUser={user}
          type={exceededCreditsModal.type}
          requiredCredits={exceededCreditsModal.required}
          onOpenPricing={() => {
            setExceededCreditsModal((prev) => ({ ...prev, isOpen: false }));
            setIsPricingOpen(true);
          }}
          onRefreshUser={() => {
            const saved = backendService.getUsers().find((u) => u.id === user.id);
            if (saved) setUser(saved);
          }}
        />
      )}

      {/* Pricing Plans Modal (Roadmap Section 5.1 & 5.2) */}
      {isPricingOpen && (
        <PricingPlansView
          isModal={true}
          currentUser={user}
          onClose={() => setIsPricingOpen(false)}
          onSelectPlan={(planId) => {
            const planCredits = planId === 'pro' ? 3000 : planId === 'plus' ? 600 : planId === 'free' ? 600 : 999999;
            const updated: UserProfile = {
              ...user,
              plan: planId,
              role: planId === 'pro' ? 'student' : planId === 'plus' ? 'plus' : user.role,
              credits: Math.max(user.credits, planCredits),
              monthlyCreditQuota: planCredits,
              optOutAiTraining: planId !== 'free',
            };
            handleUpdateUser(updated);
            backendService.updateUserProfile(user.id, updated);
            setIsPricingOpen(false);
          }}
        />
      )}

      {/* User Authentication Modals (sign-in.png & sign-up.png) */}
      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        onSwitchToSignUp={() => {
          setIsSignInOpen(false);
          setIsSignUpOpen(true);
        }}
        onSuccessLogin={handleSuccessAuth}
      />

      <SignUpModal
        isOpen={isSignUpOpen}
        onClose={() => setIsSignUpOpen(false)}
        onSwitchToSignIn={() => {
          setIsSignUpOpen(false);
          setIsSignInOpen(true);
        }}
        onSuccessSignUp={handleSuccessAuth}
      />

    </div>
  );
}
