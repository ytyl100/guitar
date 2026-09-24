import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Upload,
  Radio,
  Sliders,
  Sparkles,
  Bookmark,
  Plus,
  Trash2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Info,
  Check,
  Disc,
  Headphones,
  BellRing,
  Music,
  Edit3,
  ArrowLeft,
  GitBranch,
  CheckCircle2,
  FileEdit,
  Archive,
  Save,
  ExternalLink,
  ChevronRight,
  X,
  FileJson,
  CloudUpload,
  Tags,
  Scissors,
  ListChecks,
  AlertTriangle,
  Loader2,
  PlayCircle,
  Link2,
  Layers,
} from 'lucide-react';
import { AudioTabSyncConfig, TabNote, MusicTrack, MusicStatus, MusicVersion } from '../../types';
import { audioEngine } from '../../utils/audioEngine';
import { detectBarres, extractChordMarkers, type DetectedBarre } from '../../utils/barreDetector';
import { importSoloTraceFile, SoloTraceParseError } from '../../utils/soloTraceImporter';
import { NoteOverlay, type NoteOverlayMarker } from './tablature/NoteOverlay';
import { ChordPanel } from './tablature/ChordPanel';
import { MeasureSlicer } from './tablature/MeasureSlicer';
import { TabRenderer } from './tablature/TabRenderer';
import { api, ApiError, type ApiScore, type PublishMeasuresPayload } from '../../services/api';

interface AudioTabSyncStudioProps {
  config: AudioTabSyncConfig;
  onChangeConfig: (newConfig: AudioTabSyncConfig) => void;
  darkMode: boolean;
  currentTrack?: MusicTrack;
  onUpdateTrack?: (updatedTrack: MusicTrack) => void;
  onReturnToLibrary?: () => void;
  /**
   * 从「六线谱导入工作台」跳转过来时携带的 scoreId —— 挂载后自动加载曲目列表并绑定该曲目，
   * 管理员只需填音频路径即可发布（不用手工复制 Score ID / Track ID）。
   */
  initialRemoteScoreId?: string;
}

/**
 * 练习声道选项 —— 决定 C 端 Simplified 模式播放哪一条分轨。
 * value 与后端 Track.instrument / MeasureTrack.channel 枚举保持一致。
 */
export const PRACTICE_CHANNELS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'guitar', label: '吉他 (guitar)', hint: '默认声道：木吉他 / 综合吉他分轨' },
  { value: 'guitar_lead', label: '主音吉他 (guitar_lead)', hint: 'Solo / 旋律声部' },
  { value: 'guitar_rhythm', label: '节奏吉他 (guitar_rhythm)', hint: '扫弦 / 分解和弦声部' },
  { value: 'bass', label: '贝斯 (bass)', hint: '低音声部' },
  { value: 'piano', label: '钢琴 (piano)', hint: '键盘声部' },
  { value: 'other', label: '其他 (other)', hint: '不在此列表内的自定义声部' },
];

/** 声道 value → 中文短名 */
export const practiceChannelLabel = (value?: string): string =>
  PRACTICE_CHANNELS.find((c) => c.value === (value || 'guitar'))?.label.split(' ')[0] || '吉他';

/**
 * 判定一个音频地址是否为「占位地址」（种子数据用的 cdn.example.com 等）。
 * 这类地址永远不可达，不应自动填入表单，否则会把原声发布成不可播放的引用。
 */
const isPlaceholderAudioUrl = (url?: string | null): boolean => {
  if (!url) return true;
  return /(^|\/\/)(cdn\.example\.com|example\.com|localhost:0)/i.test(url);
};

export const AudioTabSyncStudio: React.FC<AudioTabSyncStudioProps> = ({
  config,
  onChangeConfig,
  darkMode,
  currentTrack,
  onUpdateTrack,
  onReturnToLibrary,
  initialRemoteScoreId,
}) => {
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // 1x to 2.5x
  const [metronomeActive, setMetronomeActive] = useState<boolean>(false);
  const [isTapMode, setIsTapMode] = useState<boolean>(true); // Spacebar tap-to-align
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState<number | null>(null);
  const [draggingMeasureIndex, setDraggingMeasureIndex] = useState<number | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Version Control modal state
  const [isSaveVersionModalOpen, setIsSaveVersionModalOpen] = useState(false);
  const [versionNoteInput, setVersionNoteInput] = useState('');
  const [versionTagInput, setVersionTagInput] = useState('');

  // Note Modal Editor state
  const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState(false);
  const [newNoteString, setNewNoteString] = useState<number>(1);
  const [newNoteFret, setNewNoteFret] = useState<number>(0);
  const [newNoteTechnique, setNewNoteTechnique] = useState<TabNote['technique']>('normal');

  // ── 转录 / 标注 / 发布 (文档五: 管理后台六线谱标注器) ──────────────
  const [isAnnotationModalOpen, setIsAnnotationModalOpen] = useState(false); // 和弦 & 横按标注面板
  const [isMeasureSlicerModalOpen, setIsMeasureSlicerModalOpen] = useState(false); // 小节框选切分
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false); // 发布确认 (含谱面预览)
  const [importingJson, setImportingJson] = useState(false);
  const [autoDetectBarres, setAutoDetectBarres] = useState<DetectedBarre[]>([]);
  const [chordMarkers, setChordMarkers] = useState<
    Array<{ id: string; chordName: string; startTime: number }>
  >([]);
  const [confidenceFocusId, setConfidenceFocusId] = useState<string | null>(null);
  const [showConfidenceOnly, setShowConfidenceOnly] = useState(false); // 只显示低置信度节点
  const [remoteScores, setRemoteScores] = useState<ApiScore[]>([]);
  const [loadingScores, setLoadingScores] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [publishPreviewMeasureIndex, setPublishPreviewMeasureIndex] = useState<number>(0);
  /** 允许音频不可访问时仍然发布（仅入库谱面标注） */
  const [allowMissingAudio, setAllowMissingAudio] = useState(false);
  /** 正在按标注合成对齐示范音频 */
  const [renderingAudio, setRenderingAudio] = useState(false);
  /** 正在按标注合成原声（含贝斯/鼓） */
  const [renderingBandAudio, setRenderingBandAudio] = useState(false);

  // Animation & Audio references
  const animFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const waveformContainerRef = useRef<HTMLDivElement | null>(null);
  const tablatureScrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const soloTraceInputRef = useRef<HTMLInputElement | null>(null);
  const publishingRef = useRef<boolean>(false);
  const metronomeLastBeatRef = useRef<number>(-1);

  // Show quick toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  // Ensure synthetic buffer or sound is ready
  useEffect(() => {
    // initialize synthetic background preview if needed
    audioEngine.createSyntheticDemoAudioBuffer(config.audioDurationSec, config.bpm || 80);
  }, [config.audioDurationSec, config.bpm]);

  // Main 60 FPS RequestAnimationFrame clock
  const updatePlayback = useCallback(
    (timestamp: number) => {
      if (!lastTickTimeRef.current) {
        lastTickTimeRef.current = timestamp;
      }
      const deltaSec = ((timestamp - lastTickTimeRef.current) / 1000) * playbackRate;
      lastTickTimeRef.current = timestamp;

      setCurrentTimeSec((prevTime) => {
        let nextTime = prevTime + deltaSec;

        // A-B Loop Handling
        if (config.loopRegion?.enabled) {
          if (nextTime >= config.loopRegion.endSec) {
            nextTime = config.loopRegion.startSec;
            showToast(`A-B 循环触发: 回到 ${config.loopRegion.startSec.toFixed(2)}s`);
          }
        } else if (nextTime >= config.audioDurationSec) {
          setIsPlaying(false);
          return 0;
        }

        // Metronome sync calculation
        if (metronomeActive && config.bpm) {
          const beatDuration = 60 / config.bpm;
          const currentBeat = Math.floor(nextTime / beatDuration);
          if (currentBeat !== metronomeLastBeatRef.current) {
            metronomeLastBeatRef.current = currentBeat;
            const isDownbeat = currentBeat % (config.timeSignature ? config.timeSignature[0] : 4) === 0;
            audioEngine.playClick(isDownbeat);
          }
        }

        return nextTime;
      });

      if (isPlaying) {
        animFrameRef.current = requestAnimationFrame(updatePlayback);
      }
    },
    [isPlaying, playbackRate, config.loopRegion, config.audioDurationSec, metronomeActive, config.bpm, config.timeSignature]
  );

  useEffect(() => {
    if (isPlaying) {
      lastTickTimeRef.current = performance.now();
      animFrameRef.current = requestAnimationFrame(updatePlayback);
    } else {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      lastTickTimeRef.current = 0;
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, updatePlayback]);

  // Sync tablature scrolling automatically with audio playhead
  useEffect(() => {
    if (!tablatureScrollRef.current) return;
    const effectiveTime = Math.max(0, currentTimeSec + config.playbackOffsetMs / 1000);
    const progressRatio = effectiveTime / (config.audioDurationSec || 1);
    const scrollWidth = tablatureScrollRef.current.scrollWidth - tablatureScrollRef.current.clientWidth;
    if (scrollWidth > 0 && isPlaying) {
      tablatureScrollRef.current.scrollLeft = progressRatio * scrollWidth;
    }
  }, [currentTimeSec, config.audioDurationSec, config.playbackOffsetMs, isPlaying]);

  // Tap-to-Align (Spacebar) or Play/Pause handling
  const handleTapToAlign = useCallback(() => {
    const tapTime = Number(currentTimeSec.toFixed(2));
    // Check if within 0.3s of existing measure
    const existing = config.measureTimestamps.find((t) => Math.abs(t - tapTime) < 0.35);
    if (existing !== undefined) {
      showToast(`跟敲打点: 接近已有小节线 (${existing.toFixed(2)}s)`);
      return;
    }

    const updated = [...config.measureTimestamps, tapTime].sort((a, b) => a - b);
    onChangeConfig({
      ...config,
      measureTimestamps: updated,
    });
    showToast(`🎯 Tap-to-Align 成功! 已于 ${tapTime.toFixed(2)}s 新增小节标记线`);
  }, [currentTimeSec, config, onChangeConfig]);

  // Global Keyboard event handler (Spacebar, A, B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (isTapMode && isPlaying) {
          handleTapToAlign();
        } else {
          setIsPlaying((prev) => !prev);
        }
      } else if (e.key === 'a' || e.key === 'A') {
        // Set Loop Start
        e.preventDefault();
        const start = Number(currentTimeSec.toFixed(2));
        const end = Math.max(start + 2.0, config.loopRegion?.endSec || start + 4.0);
        onChangeConfig({
          ...config,
          loopRegion: {
            startSec: start,
            endSec: end,
            enabled: true,
          },
        });
        showToast(`设定 A 点循环起点: ${start.toFixed(2)}s`);
      } else if (e.key === 'b' || e.key === 'B') {
        // Set Loop End
        e.preventDefault();
        const end = Number(currentTimeSec.toFixed(2));
        const start = Math.min(end - 1.0, config.loopRegion?.startSec || 0);
        onChangeConfig({
          ...config,
          loopRegion: {
            startSec: Math.max(0, start),
            endSec: end,
            enabled: true,
          },
        });
        showToast(`设定 B 点循环终点: ${end.toFixed(2)}s`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTapMode, isPlaying, handleTapToAlign, currentTimeSec, config, onChangeConfig]);

  // Seek handler from Waveform click or drag
  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformContainerRef.current) return;
    const rect = waveformContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = Number((ratio * config.audioDurationSec).toFixed(3));
    setCurrentTimeSec(targetSec);

    // Find active measure
    const measureIdx = config.measureTimestamps.findIndex((t, i) => {
      const nextT = config.measureTimestamps[i + 1] ?? config.audioDurationSec;
      return targetSec >= t && targetSec < nextT;
    });
    setSelectedMeasureIndex(measureIdx !== -1 ? measureIdx : null);
  };

  // Handle Note Click -> bidirectional seek & pluck sound
  const handleNoteClick = (note: TabNote, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNoteId(note.id);
    setCurrentTimeSec(note.timestampSec);
    // Pluck guitar sound!
    const freq = audioEngine.getGuitarFrequency(note.stringIndex, note.fret);
    audioEngine.pluckString(freq, note.durationSec || 1.2, 0.85);
    showToast(`跳转音符: ${note.stringIndex}弦 ${note.fret}品 (${note.timestampSec.toFixed(2)}s)`);
  };

  // Handle Measure Line Drag micro-adjustment
  const handleMeasureDragStart = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingMeasureIndex(index);
  };

  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingMeasureIndex === null || !waveformContainerRef.current) return;
    const rect = waveformContainerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTimestamp = Number((ratio * config.audioDurationSec).toFixed(2));

    const updated = [...config.measureTimestamps];
    updated[draggingMeasureIndex] = newTimestamp;
    updated.sort((a, b) => a - b);
    onChangeConfig({
      ...config,
      measureTimestamps: updated,
    });
  };

  const handleContainerMouseUp = () => {
    if (draggingMeasureIndex !== null) {
      setDraggingMeasureIndex(null);
      showToast('小节对齐时间戳微调已保存');
    }
  };

  // Real Audio File Upload & Web Audio peak extraction
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    showToast(`正在通过 Web Audio API 解析 ${file.name} 声学数据...`);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await audioEngine.extractWaveformPeaks(arrayBuffer, 128);

      // 按当前 BPM / 拍号推导小节长度（每小节 = beats * 60/bpm 秒），
      // 不再硬编码 2.4s —— 否则小节线会与 BPM 网格错位，导致「音频与节点节奏对不上」
      const uploadBpm = config.bpm && config.bpm > 0 ? config.bpm : 80;
      const [beatsPerBar, beatValue] = config.timeSignature || [4, 4];
      const barSec = (60 / uploadBpm) * beatsPerBar * (4 / beatValue);
      const measureCount = Math.max(1, Math.ceil(result.duration / barSec));
      const autoMeasures: number[] = [];
      for (let i = 0; i < measureCount; i++) {
        autoMeasures.push(Number((i * barSec).toFixed(3)));
      }

      onChangeConfig({
        ...config,
        audioTitle: file.name,
        audioDurationSec: Number(result.duration.toFixed(2)),
        waveformPeaks: result.peaks,
        measureTimestamps: autoMeasures,
      });
      setCurrentTimeSec(0);
      showToast(
        `✅ 音频解析完成！提取 128 个能量峰值，时长 ${result.duration.toFixed(1)}s` +
          ` · 已按 ${uploadBpm} BPM / ${beatsPerBar}/${beatValue} 生成 ${autoMeasures.length} 个小节 (每小节 ${barSec.toFixed(2)}s)`,
      );
    } catch {
      showToast('⚠️ 音频文件格式解析失败，请确保为标准 MP3/WAV 格式');
    } finally {
      setUploadLoading(false);
    }
  };

  // Generate synthetic acoustic backing preset
  const handleGenerateSyntheticAudio = async () => {
    setUploadLoading(true);
    showToast('正在利用 Web Audio 物理建模合成吉他示范伴奏...');
    try {
      const buffer = await audioEngine.createSyntheticDemoAudioBuffer(19.2, 80);
      const peaks = audioEngine.generateSyntheticPeaks(128);
      onChangeConfig({
        ...config,
        audioDurationSec: 19.2,
        waveformPeaks: peaks,
        audioTitle: '《示范伴奏：民谣吉他核心手型与分解节奏》',
      });
      setCurrentTimeSec(0);
      showToast('✅ 吉他声学合成伴奏已生成并挂载！');
    } finally {
      setUploadLoading(false);
    }
  };

  // Add new note to current playhead position
  const handleSaveNewNote = () => {
    const currentMeasure = config.measureTimestamps.findIndex((t, i) => {
      const nextT = config.measureTimestamps[i + 1] ?? config.audioDurationSec;
      return currentTimeSec >= t && currentTimeSec < nextT;
    });

    const newNote: TabNote = {
      id: `note-${Date.now()}`,
      measureIndex: currentMeasure !== -1 ? currentMeasure : 0,
      stringIndex: newNoteString,
      fret: newNoteFret,
      timestampSec: Number(currentTimeSec.toFixed(2)),
      durationSec: 0.5,
      technique: newNoteTechnique,
      velocity: 90,
    };

    const updatedNotes = [...config.noteTimestamps, newNote].sort((a, b) => a.timestampSec - b.timestampSec);
    onChangeConfig({
      ...config,
      noteTimestamps: updatedNotes,
    });
    setIsAddNoteModalOpen(false);
    showToast(`已在 ${currentTimeSec.toFixed(2)}s 挂载 ${newNoteString}弦 ${newNoteFret}品 音符`);
  };

  // Delete note
  const handleDeleteNote = (noteId: string) => {
    onChangeConfig({
      ...config,
      noteTimestamps: config.noteTimestamps.filter((n) => n.id !== noteId),
    });
    if (selectedNoteId === noteId) setSelectedNoteId(null);
    showToast('音符已删除');
  };

  // ─────────────────────────────────────────────────────────────
  // 转录导入 / 标注 / 小节切分 / 发布 (文档五 管理后台六线谱标注器)
  // ─────────────────────────────────────────────────────────────

  /** 当前拍号 (默认 4/4) */
  const timeSignature: [number, number] = config.timeSignature || [4, 4];
  const timeSignatureLabel = `${timeSignature[0]}/${timeSignature[1]}`;
  const effectiveBpm = config.bpm || 80;

  /** 由音符推算 MIDI 音高 (SoloTrace 未提供 pitch 时的兜底) */
  const noteToMidi = (stringIndex: number, fret: number | string): number => {
    const freq = audioEngine.getGuitarFrequency(stringIndex, fret);
    if (!freq || freq <= 0) return 0;
    return Math.round(69 + 12 * Math.log2(freq / 440));
  };

  /** 把 'h' / 'X' 等技巧标记安全地转成数字品位 */
  const toNumericFret = (fret: number | string): number => {
    if (typeof fret === 'number') return fret;
    const m = String(fret).match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  };

  /** 小节索引查找 */
  const findMeasureIndexAt = (timeSec: number): number => {
    let idx = 0;
    for (let i = 0; i < config.measureTimestamps.length; i++) {
      if (timeSec >= config.measureTimestamps[i]) idx = i;
      else break;
    }
    return idx;
  };

  /** 1) 导入 SoloTrace / Basic Pitch 转录 JSON */
  const handleSoloTraceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingJson(true);
    try {
      const result = await importSoloTraceFile(file);
      onChangeConfig({
        ...config,
        bpm: result.bpm,
        timeSignature: result.timeSignature,
        audioDurationSec: result.audioDurationSec || config.audioDurationSec,
        audioTitle: config.audioTitle || file.name.replace(/\.json$/i, ''),
        measureTimestamps: result.measureTimestamps,
        noteTimestamps: result.notes,
        transcriptionFileName: result.fileName || file.name,
        lowConfidenceCount: result.lowConfidenceCount,
      });
      setAutoDetectBarres(result.barres);
      setChordMarkers([]);
      setCurrentTimeSec(0);
      setSelectedNoteId(null);
      setSelectedMeasureIndex(0);
      showToast(
        `✅ 转录导入成功：${result.notes.length} 个音符 · ${result.measureTimestamps.length} 个小节 · 自动检测 ${result.barres.length} 处横按` +
          (result.lowConfidenceCount > 0
            ? `（⚠️ ${result.lowConfidenceCount} 个低置信度音符待复核）`
            : ''),
      );
    } catch (err: any) {
      const msg =
        err instanceof SoloTraceParseError
          ? err.message
          : err?.message || '转录 JSON 导入失败';
      showToast(`⚠️ ${msg}`);
    } finally {
      setImportingJson(false);
      if (soloTraceInputRef.current) soloTraceInputRef.current.value = '';
    }
  };

  /** 2) 手动/重新执行横按自动检测 */
  const handleDetectBarres = () => {
    const detected = detectBarres(config.noteTimestamps, {
      toleranceMs: 30,
      measureStartTime: 0,
      measureDuration: config.audioDurationSec,
    });
    setAutoDetectBarres(detected);
    showToast(
      detected.length > 0
        ? `🎯 横按自动检测完成：识别到 ${detected.length} 处横按，请人工确认后发布`
        : '未检测到横按（同一品位需覆盖连续多根弦）',
    );
  };

  /** 3) 和弦标注插入 */
  const handleAddChordMarker = (chordName: string, timeSec: number) => {
    const startTime = Number(timeSec.toFixed(2));
    const marker = { id: `cm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, chordName, startTime };

    // 同步把和弦名挂到最近的音符上（<1s），用于谱面内联展示
    let nearest: TabNote | null = null;
    for (const n of config.noteTimestamps) {
      if (!nearest || Math.abs(n.timestampSec - startTime) < Math.abs(nearest.timestampSec - startTime)) {
        nearest = n;
      }
    }
    const shouldTagNote = nearest !== null && Math.abs(nearest.timestampSec - startTime) <= 1.0;

    setChordMarkers((prev) => [...prev, marker].sort((a, b) => a.startTime - b.startTime));
    if (shouldTagNote && nearest) {
      const targetId = (nearest as TabNote).id;
      onChangeConfig({
        ...config,
        noteTimestamps: config.noteTimestamps.map((n) =>
          n.id === targetId ? { ...n, chordName } : n,
        ),
      });
    }
    showToast(`已在 ${startTime.toFixed(2)}s 标注和弦 ${chordName}`);
  };

  const handleRemoveChordMarker = (id: string) => {
    setChordMarkers((prev) => prev.filter((c) => c.id !== id));
    showToast('和弦标记已删除');
  };

  /** 4) 从后端拉取曲目列表，用于绑定发布目标 */
  const handleLoadRemoteScores = async () => {
    setLoadingScores(true);
    setPublishError(null);
    try {
      const scores = await api.getScores();
      setRemoteScores(scores);
      showToast(`已从后端加载 ${scores.length} 首曲目`);
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '加载后端曲目失败';
      setPublishError(msg);
      showToast(`⚠️ ${msg}`);
    } finally {
      setLoadingScores(false);
    }
  };

  /** 绑定一个后端曲目：带出 Track / 音频路径 / 声道 / BPM */
  const applyRemoteScore = (score: ApiScore) => {
    const track = score.tracks?.[0];
    onChangeConfig({
      ...config,
      remoteScoreId: score.id,
      remoteTrackId: track?.id || config.remoteTrackId,
      remoteAudioPath:
        (isPlaceholderAudioUrl(track?.audioUrl) ? '' : track?.audioUrl) ||
        (isPlaceholderAudioUrl(score.originalAudio) ? '' : score.originalAudio) ||
        config.remoteAudioPath,
      // 练习声道默认 guitar；若后端分轨已标注 instrument 则沿用该值
      remoteChannel: track?.instrument || config.remoteChannel || 'guitar',
      // 原声（Original 模式）优先用曲目自带的 originalAudio；占位地址不自动填入
      remoteOriginalAudioPath: isPlaceholderAudioUrl(score.originalAudio)
        ? config.remoteOriginalAudioPath
        : score.originalAudio,
      bpm: score.bpm || config.bpm,
    });
    showToast(`已绑定后端曲目《${score.title}》${track ? ` · 分轨 ${track.instrument}` : ''}`);
  };

  /** 选择后端曲目后自动带出 Track */
  const handleSelectRemoteScore = (scoreId: string) => {
    const score = remoteScores.find((s) => s.id === scoreId);
    if (!score) return;
    applyRemoteScore(score);
  };

  /**
   * 从「六线谱导入工作台」跳转过来时，自动拉取曲目列表并绑定该 scoreId。
   * 用 ref 去重，保证同一个 scoreId 只自动绑定一次，不会覆盖管理员随后的手工修改。
   */
  const autoBoundScoreRef = useRef<string>('');
  useEffect(() => {
    const target = (initialRemoteScoreId || '').trim();
    if (!target || autoBoundScoreRef.current === target) return;
    autoBoundScoreRef.current = target;

    (async () => {
      setLoadingScores(true);
      setPublishError(null);
      try {
        const list = await api.getScores();
        setRemoteScores(list);
        const score = list.find((s) => s.id === target);
        if (score) {
          applyRemoteScore(score);
          showToast(`📥 已从导入工作台带入曲目《${score.title}》—— 填好音频路径即可发布`);
        } else {
          showToast(`⚠️ 后端找不到曲目 ${target}，请点「从后端加载曲目」手动选择`);
        }
      } catch (err: any) {
        const msg = err instanceof ApiError ? err.message : '自动绑定导入曲目失败';
        setPublishError(msg);
        showToast(`⚠️ ${msg}`);
      } finally {
        setLoadingScores(false);
      }
    })();
    // 只在 initialRemoteScoreId 变化时执行；applyRemoteScore 每次渲染都会重建，故不入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRemoteScoreId]);

  /** 5) 组装并提交发布载荷 (POST /api/measures/publish) */
  const handlePublishMeasures = async () => {
    // 防重复提交：发布包含音频切片+上传，耗时较长，避免误触导致重复入库
    if (publishingRef.current) return;

    const scoreId = config.remoteScoreId?.trim();
    const trackId = config.remoteTrackId?.trim();
    const trackAudioPath = config.remoteAudioPath?.trim();

    if (!scoreId || !trackId || !trackAudioPath) {
      setPublishError('请先填写后端 Score ID / Track ID / 分轨音频路径');
      return;
    }
    if (config.measureTimestamps.length === 0) {
      setPublishError('当前没有小节线，请先执行小节切分');
      return;
    }

    publishingRef.current = true;
    setPublishing(true);
    setPublishError(null);
    setPublishSuccess(null);

    try {
      const sortedMeasures = [...config.measureTimestamps].sort((a, b) => a - b);
      const measureDurationFallback =
        (60 / effectiveBpm) * timeSignature[0] * (4 / timeSignature[1]);

      const measures = sortedMeasures.map((start, idx) => {
        const end =
          idx + 1 < sortedMeasures.length ? sortedMeasures[idx + 1] : config.audioDurationSec;
        const duration = Math.max(0.05, end - start);

        const measureNotes = config.noteTimestamps
          .filter((n) => n.timestampSec >= start && n.timestampSec < end)
          .sort((a, b) => a.timestampSec - b.timestampSec);

        return {
          index: idx + 1,
          label: `第 ${idx + 1} 小节`,
          startTime: Number(start.toFixed(3)),
          endTime: Number(end.toFixed(3)),
          notes: measureNotes.map((n, ni) => {
            const fretNum = toNumericFret(n.fret);
            return {
              id: n.id || `n_${idx + 1}_${ni}`,
              audioTime: Number(n.timestampSec.toFixed(4)),
              string: n.stringIndex,
              fret: fretNum,
              pitch: n.pitch ?? noteToMidi(n.stringIndex, fretNum),
              duration: n.durationSec || 0.5,
              confidence: n.confidence ?? 1.0,
              x: Number(Math.max(0, Math.min(1, (n.timestampSec - start) / duration)).toFixed(4)),
              y: Number(Math.max(0, Math.min(1, (n.stringIndex - 1) / 5)).toFixed(4)),
            };
          }),
          // 横按: startTime 转为相对本小节的秒数，x 归一化到本小节内
          barres: autoDetectBarres
            .filter((b) => b.startTime >= start - 0.001 && b.startTime < end)
            .map((b) => ({
              instrument: b.instrument || 'guitar',
              fret: b.fret,
              fromString: b.fromString,
              toString: b.toString,
              startTime: Number(Math.max(0, b.startTime).toFixed(4)),
              duration: b.duration,
              x: Number(Math.max(0, Math.min(1, b.startTime / duration)).toFixed(4)),
              y: b.y,
            })),
          // 和弦: startTime 使用相对本小节的秒数 (小程序端与 note.relativeTime 对比)
          chords: chordMarkers
            .filter((c) => c.startTime >= start - 0.001 && c.startTime < end)
            .map((c) => ({
              instrument: 'guitar',
              chordName: c.chordName,
              startTime: Number(Math.max(0, c.startTime - start).toFixed(4)),
              duration: Number(Math.max(0.2, duration * 0.5).toFixed(4)),
              x: Number(Math.max(0, Math.min(1, (c.startTime - start) / duration)).toFixed(4)),
              y: 0.06,
            })),
          tabImageUrl: '',
        };
      });

      const payload: PublishMeasuresPayload = {
        scoreId,
        trackId,
        trackAudioPath,
        // 练习声道（Simplified）默认 guitar
        channel: config.remoteChannel || 'guitar',
        // 原声（Original）；留空时后端回退到 Score.originalAudio
        originalAudioPath: config.remoteOriginalAudioPath?.trim() || undefined,
        bpm: Math.round(effectiveBpm),
        timeSignature: timeSignatureLabel,
        measures,
        allowMissingAudio: allowMissingAudio || undefined,
      };

      const res = await api.publishMeasures(payload);

      // 后端在音频切片失败时会降级返回 `原始音频#t=start,end`，需要提示教研老师
      const degraded =
        res.degradedAudioCount ??
        (res.measures || []).filter((m) =>
          (m.trackData || []).some((t) => t.audioUrl?.includes('#t=')),
        ).length;

      const channelLabel =
        PRACTICE_CHANNELS.find((c) => c.value === (res.channel || payload.channel))?.label ||
        res.channel ||
        'guitar';

      setPublishSuccess(
        `发布成功：${res.measures?.length ?? measures.length} 个小节已入库 (音频切片 + OSS 上传 + SQLite 写入)\n` +
          `· Simplified 声道：${channelLabel}\n` +
          `· Original 原声：${
            res.hasOriginalAudio
              ? '已同步发布（含鼓 / 贝斯 / 电琴等全轨混音）'
              : '未发布，C 端切到 Original 时会回退到上面的 Simplified 声道'
          }` +
          (degraded > 0
            ? `\n⚠️ 其中 ${degraded} 个小节的音频切片失败，已降级为「原始音频 + 时间片段」。` +
              `请确认「分轨音频路径 / URL」是后端可访问的本地绝对路径或公网地址，否则 C 端将无法播放。`
            : ''),
      );

      // 同步把后端状态标记为已发布
      if (currentTrack && onUpdateTrack) {
        onUpdateTrack({
          ...currentTrack,
          status: 'published',
          tabConfig: config,
          updatedAt: new Date().toISOString().split('T')[0],
        });
        try {
          await api.updateScoreStatus(scoreId, 'published');
        } catch {
          /* 状态回写失败不阻塞发布结果展示 */
        }
      }
      showToast('🚀 小节数据已发布至后端，C端小程序可立即拉取练习');
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : err?.message || '发布失败';
      setPublishError(msg);
      showToast(`⚠️ 发布失败: ${msg}`);
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  };

  /** 低置信度节点叠加层标记 (归一化 x/y) */
  const overlayMarkers: NoteOverlayMarker[] = config.noteTimestamps.map((n) => ({
    id: n.id,
    x: config.audioDurationSec > 0 ? n.timestampSec / config.audioDurationSec : 0,
    y: (n.stringIndex - 1) / 5,
    confidence: n.confidence ?? 1,
    fret: n.fret,
    stringIndex: n.stringIndex,
  }));

  const lowConfidenceCount =
    config.lowConfidenceCount ??
    config.noteTimestamps.filter((n) => (n.confidence ?? 1) < 0.6).length;

  /** 定位到某个低置信度音符 */
  const handleFocusConfidenceNote = (noteId: string) => {
    const note = config.noteTimestamps.find((n) => n.id === noteId);
    if (!note) return;
    setConfidenceFocusId(noteId);
    setSelectedNoteId(noteId);
    setCurrentTimeSec(note.timestampSec);
    setSelectedMeasureIndex(findMeasureIndexAt(note.timestampSec));
    const freq = audioEngine.getGuitarFrequency(note.stringIndex, note.fret);
    audioEngine.pluckString(freq, 1.0, 0.7);
  };

  /** 6) 一键填入后端内置示例音频，便于联调验证发布链路 */
  const handleUseDemoAudio = async () => {
    try {
      const demo = await api.getDemoAudio();
      if (!demo.available) {
        setPublishError(demo.hint || '示例音频不可用，请在后端执行 npm run demo:audio');
        return;
      }
      onChangeConfig({ ...config, remoteAudioPath: demo.suggestedPath });
      setPublishError(null);
      showToast(`已填入示例音频：${demo.suggestedPath}`);
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '获取示例音频信息失败';
      setPublishError(msg);
    }
  };

  /** 6.1) 按当前标注生成「与节点精确对齐」的示范音频（仅吉他 → Simplified 声道） */
  const handleRenderAlignedAudio = async () => {
    const scoreId = config.remoteScoreId?.trim();
    if (!scoreId) {
      setPublishError('请先选择/填写后端 Score ID（需已发布小节，后端才能读取标注）');
      return;
    }
    setRenderingAudio(true);
    setPublishError(null);
    setPublishSuccess(null);
    try {
      const res = await api.renderDemoAudioFromAnnotations(scoreId, `render_${scoreId}`);
      onChangeConfig({ ...config, remoteAudioPath: res.suggestedPath });
      setPublishSuccess(
        `已按 ${res.noteCount} 个音符标注合成对齐示范音频（${res.durationSec}s，${res.measureCount} 个小节）。\n` +
          `路径已自动填入：${res.suggestedPath}\n` +
          `现在「确认发布」即可得到与节点完全对齐的小节音频。`,
      );
      showToast('🎵 对齐示范音频已生成并填入路径');
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '合成示范音频失败';
      setPublishError(msg);
    } finally {
      setRenderingAudio(false);
    }
  };

  /** 6.2) 按当前标注生成「与节点精确对齐」的原声（吉他 + 贝斯 + 鼓 → Original 声道） */
  const handleRenderBandAudio = async () => {
    const scoreId = config.remoteScoreId?.trim();
    if (!scoreId) {
      setPublishError('请先选择/填写后端 Score ID（需已发布小节，后端才能读取标注）');
      return;
    }
    setRenderingBandAudio(true);
    setPublishError(null);
    setPublishSuccess(null);
    try {
      const res = await api.renderDemoAudioFromAnnotations(
        scoreId,
        `render_band_${scoreId}`,
        true,
      );
      onChangeConfig({ ...config, remoteOriginalAudioPath: res.suggestedPath });
      setPublishSuccess(
        `已按 ${res.noteCount} 个音符标注合成「原声（全轨混音）」示范音频（${res.durationSec}s）。\n` +
          `· 吉他沿用同一批节点，落在完全相同的时刻\n` +
          `· 额外叠加贝斯 + 鼓，节拍网格 = 小节窗口 ÷ ${res.beatsPerBar ?? 4} 拍\n` +
          `路径已自动填入「Original 原声路径」：${res.suggestedPath}`,
      );
      showToast('🥁 原声（含贝斯/鼓）已生成并填入 Original 路径');
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '合成原声失败的';
      setPublishError(msg);
    } finally {
      setRenderingBandAudio(false);
    }
  };

  /** 7) 清空该曲目已发布的小节（重新发布前清理旧数据） */
  const handleClearPublishedMeasures = async () => {
    const scoreId = config.remoteScoreId?.trim();
    if (!scoreId) {
      setPublishError('请先选择/填写要清理的后端 Score ID');
      return;
    }
    if (!window.confirm(`确定清空该曲目已发布的全部小节？此操作不可撤销。\nScore ID: ${scoreId}`)) {
      return;
    }

    setPublishing(true);
    setPublishError(null);
    setPublishSuccess(null);
    try {
      const res = await api.clearMeasuresByScore(scoreId);
      setPublishSuccess(`已清空 ${res.deleted} 个已发布小节，现在可以重新发布。`);
      showToast(`🧹 ${res.message}`);
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : err?.message || '清空失败';
      setPublishError(msg);
    } finally {
      setPublishing(false);
    }
  };

  // Status and version management handlers
  const handleSaveDraft = () => {
    if (currentTrack && onUpdateTrack) {
      onUpdateTrack({
        ...currentTrack,
        status: 'draft',
        tabConfig: config,
        updatedAt: new Date().toISOString().split('T')[0],
      });
      showToast('✅ 已保存为草稿 (draft)，待教研打点完善');
    } else {
      showToast('✅ 当前六线谱已缓存为草稿');
    }
  };

  const handlePublishToCend = () => {
    if (currentTrack && onUpdateTrack) {
      onUpdateTrack({
        ...currentTrack,
        status: 'published',
        tabConfig: config,
        updatedAt: new Date().toISOString().split('T')[0],
      });
      showToast('🚀 已成功发布！C端学员曲库列表已同步生效');
    } else {
      showToast('🚀 已发布生效');
    }
  };

  const handleArchiveTrack = () => {
    if (currentTrack && onUpdateTrack) {
      onUpdateTrack({
        ...currentTrack,
        status: 'archive',
        tabConfig: config,
        updatedAt: new Date().toISOString().split('T')[0],
      });
      showToast('📦 已归档至历史库');
    }
  };

  const handleSaveNewVersionSubmit = () => {
    if (!versionTagInput.trim()) return;
    if (currentTrack && onUpdateTrack) {
      const newVer: MusicVersion = {
        versionNumber: versionTagInput.trim(),
        note: versionNoteInput.trim() || '教研六线谱微调版',
        updatedAt: new Date().toLocaleString(),
        status: currentTrack.status,
        config: config,
      };
      onUpdateTrack({
        ...currentTrack,
        currentVersion: newVer.versionNumber,
        tabConfig: config,
        versions: [...currentTrack.versions, newVer],
        updatedAt: new Date().toISOString().split('T')[0],
      });
      setIsSaveVersionModalOpen(false);
      setVersionNoteInput('');
      setVersionTagInput('');
      showToast(`🎉 成功创建并保存新版本 ${newVer.versionNumber}！`);
    } else {
      setIsSaveVersionModalOpen(false);
      showToast(`🎉 成功保存新版本 ${versionTagInput}！`);
    }
  };

  // Effective cursor position taking bluetooth latency compensation into account
  const visualTimeSec = Math.max(0, Math.min(config.audioDurationSec, currentTimeSec + config.playbackOffsetMs / 1000));
  const visualProgressPercent = (visualTimeSec / (config.audioDurationSec || 1)) * 100;

  // Active measure highlight
  const currentMeasureIndex = config.measureTimestamps.findIndex((t, i) => {
    const nextT = config.measureTimestamps[i + 1] ?? config.audioDurationSec;
    return visualTimeSec >= t && visualTimeSec < nextT;
  });

  return (
    <div
      id="audio-tab-sync-studio"
      className="flex-1 flex flex-col h-full overflow-hidden select-none"
      onMouseMove={handleContainerMouseMove}
      onMouseUp={handleContainerMouseUp}
    >
      {/* Toast alert banner */}
      {toastMessage && (
        <div className="absolute top-20 right-6 z-50 px-4 py-2 rounded-xl text-xs font-medium bg-slate-900/95 text-amber-300 border border-amber-500/40 shadow-xl shadow-black/40 flex items-center gap-2 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Breadcrumb Navigation & Track Version / Status Bar */}
      <div
        className={`px-5 py-2.5 border-b flex items-center justify-between gap-3 text-xs shrink-0 ${
          darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-100 border-slate-200'
        }`}
      >
        {/* Breadcrumb with Return to Library */}
        <div className="flex items-center gap-2.5">
          {onReturnToLibrary && (
            <button
              onClick={onReturnToLibrary}
              className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-amber-400 font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回音乐库列表</span>
            </button>
          )}
          <span className="text-slate-600">/</span>
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200">
              {currentTrack ? currentTrack.title : config.audioTitle || '未命名曲目'}
            </span>
            {currentTrack && (
              <span className="px-2 py-0.5 rounded-full font-mono text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                {currentTrack.currentVersion}
              </span>
            )}
            {currentTrack && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border flex items-center gap-1 ${
                  currentTrack.status === 'published'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : currentTrack.status === 'draft'
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                }`}
              >
                {currentTrack.status === 'published'
                  ? '● 已发布 (C端学员可见)'
                  : currentTrack.status === 'draft'
                  ? '● 草稿 (打点中)'
                  : '● 已存档'}
              </span>
            )}
          </div>
        </div>

        {/* Status & Version Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveDraft}
            className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-amber-300 flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
            title="保存为草稿，不开放给C端学员"
          >
            <FileEdit className="w-3.5 h-3.5" />
            <span>保存草稿 (Draft)</span>
          </button>
          <button
            onClick={handlePublishToCend}
            className="px-3.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 font-bold shadow-xs transition-colors cursor-pointer"
            title="发布曲目，C端学员即可在曲库列表中获取"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>发布至 C 端 (Publish)</span>
          </button>
          <button
            onClick={() => {
              setPublishError(null);
              setPublishSuccess(null);
              setIsPublishModalOpen(true);
            }}
            className="px-3.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 font-bold shadow-xs transition-colors cursor-pointer"
            title="将小节切片(音频+音符+横按+和弦)发布至 guitarmate-audio-backend 后端"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            <span>发布小节至后端</span>
          </button>
          <button
            onClick={() => {
              const cur = currentTrack?.currentVersion || 'v1.0';
              const num = parseFloat(cur.replace('v', ''));
              setVersionTagInput(`v${isNaN(num) ? '1.1' : (num + 0.1).toFixed(1)}`);
              setVersionNoteInput('');
              setIsSaveVersionModalOpen(true);
            }}
            className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
            title="保存为新版本并记录修改备注"
          >
            <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
            <span>另存为新版本</span>
          </button>
        </div>
      </div>

      {/* Top Toolbar: Transport Controls & Audio Parameters */}
      <div
        className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-4 transition-colors shrink-0 ${
          darkMode ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        {/* Left: Playback Transport */}
        <div className="flex items-center gap-2.5">
          {/* Play/Pause */}
          <button
            id="btn-transport-play"
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold flex items-center justify-center shadow-md shadow-amber-500/30 transition-transform active:scale-95"
            title="播放 / 暂停 (快捷键: 空格键 Space)"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          {/* Reset to 0 */}
          <button
            id="btn-transport-reset"
            onClick={() => {
              setIsPlaying(false);
              setCurrentTimeSec(0);
            }}
            className={`p-2.5 rounded-xl border transition-colors ${
              darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
            }`}
            title="停止并返回起始点 00:00.00"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Timecode display */}
          <div
            className={`px-3 py-1.5 rounded-xl border font-mono flex items-baseline gap-1 ${
              darkMode ? 'bg-slate-950 border-slate-800 text-amber-400' : 'bg-slate-100 border-slate-300 text-slate-900'
            }`}
          >
            <span className="text-sm font-bold tracking-wider">
              {Math.floor(currentTimeSec / 60)
                .toString()
                .padStart(2, '0')}
              :
              {(currentTimeSec % 60).toFixed(2).padStart(5, '0')}
            </span>
            <span className="text-[10px] text-slate-500">/</span>
            <span className="text-xs text-slate-400">
              {Math.floor(config.audioDurationSec / 60)
                .toString()
                .padStart(2, '0')}
              :
              {(config.audioDurationSec % 60).toFixed(2).padStart(5, '0')}
            </span>
          </div>

          {/* Tap-to-Align Trigger Button */}
          <button
            id="btn-tap-align"
            onClick={handleTapToAlign}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 shadow-sm transition-all active:scale-95 border border-indigo-400/40"
            title="播放中点击或按空格打点：以当前毫秒时钟创建小节分割线"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>跟敲打点 (Tap-to-Align)</span>
            <kbd className="text-[10px] bg-indigo-800/80 px-1.5 py-0.5 rounded text-indigo-200">Space</kbd>
          </button>

          {/* Metronome */}
          <button
            id="btn-toggle-metronome"
            onClick={() => setMetronomeActive(!metronomeActive)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              metronomeActive
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                : darkMode
                ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>节拍器 {config.bpm} BPM</span>
          </button>

          {/* Speed selector */}
          <div className="flex items-center rounded-lg border border-inherit overflow-hidden text-xs font-mono">
            {[0.5, 0.75, 1.0, 1.25].map((rate) => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={`px-2 py-1.5 transition-colors ${
                  playbackRate === rate
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : darkMode
                    ? 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        {/* Right: Audio Latency slider & Upload actions */}
        <div className="flex items-center gap-3">
          {/* Bluetooth Headset Latency Offset (±200ms) */}
          <div
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs ${
              darkMode ? 'bg-slate-800/60 border-slate-700/80 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-700'
            }`}
          >
            <Headphones className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="whitespace-nowrap font-medium">耳麦微调:</span>
            <input
              id="slider-playback-offset"
              type="range"
              min="-200"
              max="200"
              step="5"
              value={config.playbackOffsetMs}
              onChange={(e) =>
                onChangeConfig({
                  ...config,
                  playbackOffsetMs: parseInt(e.target.value, 10),
                })
              }
              className="w-20 accent-cyan-400 cursor-pointer"
              title="校准蓝牙/有线耳麦音频延迟 (±200ms)"
            />
            <span className="font-mono text-cyan-400 w-12 text-right">
              {config.playbackOffsetMs > 0 ? `+${config.playbackOffsetMs}` : config.playbackOffsetMs}ms
            </span>
          </div>

          {/* A-B Loop toggle button */}
          <button
            id="btn-toggle-ab-loop"
            onClick={() =>
              onChangeConfig({
                ...config,
                loopRegion: {
                  startSec: config.loopRegion?.startSec || 2.4,
                  endSec: config.loopRegion?.endSec || 7.2,
                  enabled: !config.loopRegion?.enabled,
                },
              })
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              config.loopRegion?.enabled
                ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                : darkMode
                ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
            }`}
            title="A-B 片段循环标记（用于圈定 Solo 或难点小节）"
          >
            <Bookmark className="w-3.5 h-3.5 text-purple-400" />
            <span>A-B 循环 [{config.loopRegion?.startSec.toFixed(1)}s ~ {config.loopRegion?.endSec.toFixed(1)}s]</span>
          </button>

          {/* Upload Real Audio */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".mp3,.wav,.ogg,.m4a"
            className="hidden"
            onChange={handleAudioUpload}
          />
          <button
            id="btn-upload-audio"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLoading}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              darkMode
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
            }`}
            title="支持 MP3/WAV 上传，在浏览器端即时提取 128 点声学波形图"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>{uploadLoading ? '解析中...' : '音频直传'}</span>
          </button>

          {/* Synthetic Demo generator */}
          <button
            id="btn-generate-demo-audio"
            onClick={handleGenerateSyntheticAudio}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 flex items-center gap-1.5"
            title="利用 Web Audio 合成吉他原声伴奏示范音频"
          >
            <Disc className="w-3.5 h-3.5" />
            <span>示范原声伴奏</span>
          </button>
        </div>
      </div>

      {/* Main Studio Viewport (Waveform + Tablature) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-4">
        {/* Section 1: 128-point Acoustic Waveform Timeline */}
        <div
          className={`rounded-2xl border p-4 transition-all relative ${
            darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          {/* Header of waveform */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wide uppercase text-amber-500">
                128 点声学波形解析与对齐主时钟
              </span>
              <span className="text-[11px] text-slate-400">
                {config.audioTitle || '当前音轨'} · 128 Acoustic Peaks · 60 FPS Cursor
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <span>小节数: {config.measureTimestamps.length}</span>
              <span>·</span>
              <span>缩放:</span>
              <button
                onClick={() => setZoomLevel((z) => Math.max(1, z - 0.25))}
                className="p-1 hover:text-slate-200"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="w-8 text-center">{zoomLevel.toFixed(1)}x</span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                className="p-1 hover:text-slate-200"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Waveform Canvas Container */}
          <div
            ref={waveformContainerRef}
            onClick={handleWaveformClick}
            className={`relative h-28 rounded-xl overflow-hidden border cursor-crosshair group ${
              darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            {/* Waveform Bars (128 points) */}
            <div
              className="absolute inset-0 flex items-center justify-between px-2 gap-[2px]"
              style={{ transform: `scaleX(${zoomLevel})`, transformOrigin: 'left center' }}
            >
              {config.waveformPeaks.map((peak, idx) => {
                const barTime = (idx / config.waveformPeaks.length) * config.audioDurationSec;
                const isPassed = barTime <= visualTimeSec;
                const isInsideLoop =
                  config.loopRegion?.enabled &&
                  barTime >= config.loopRegion.startSec &&
                  barTime <= config.loopRegion.endSec;

                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center justify-center h-full group/bar"
                  >
                    <div
                      className={`w-full rounded-full transition-all duration-75 ${
                        isInsideLoop
                          ? 'bg-purple-400 shadow-sm shadow-purple-500/50'
                          : isPassed
                          ? 'bg-amber-400 shadow-sm shadow-amber-500/40'
                          : darkMode
                          ? 'bg-slate-700/80 hover:bg-slate-600'
                          : 'bg-slate-300 hover:bg-slate-400'
                      }`}
                      style={{ height: `${Math.max(8, peak * 88)}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Measure Marker Lines & Numbers Overlay */}
            {config.measureTimestamps.map((time, idx) => {
              const leftPercent = (time / config.audioDurationSec) * 100 * zoomLevel;
              if (leftPercent > 100 * zoomLevel) return null;
              const isSelected = selectedMeasureIndex === idx;

              return (
                <div
                  key={`measure-${idx}`}
                  className="absolute top-0 bottom-0 z-10 flex flex-col items-center pointer-events-auto"
                  style={{ left: `${leftPercent}%` }}
                >
                  <div
                    onMouseDown={(e) => handleMeasureDragStart(idx, e)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-ew-resize select-none border transition-colors ${
                      isSelected
                        ? 'bg-indigo-500 text-white border-indigo-400'
                        : darkMode
                        ? 'bg-slate-800/90 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600 hover:text-white'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-600 hover:text-white'
                    }`}
                    title={`第 ${idx + 1} 小节起点: ${time.toFixed(2)}s (按住拖拽微调)`}
                  >
                    M{idx + 1}
                  </div>
                  <div
                    onMouseDown={(e) => handleMeasureDragStart(idx, e)}
                    className={`w-[2px] flex-1 cursor-ew-resize transition-all ${
                      isSelected
                        ? 'bg-indigo-400 shadow-lg shadow-indigo-500'
                        : 'bg-indigo-500/50 hover:bg-indigo-400 hover:w-[3px]'
                    }`}
                  />
                </div>
              );
            })}

            {/* A-B Loop Region Overlay */}
            {config.loopRegion?.enabled && (
              <div
                className="absolute top-0 bottom-0 bg-purple-500/15 border-x-2 border-purple-400 pointer-events-none z-10"
                style={{
                  left: `${(config.loopRegion.startSec / config.audioDurationSec) * 100 * zoomLevel}%`,
                  width: `${
                    ((config.loopRegion.endSec - config.loopRegion.startSec) / config.audioDurationSec) *
                    100 *
                    zoomLevel
                  }%`,
                }}
              >
                <div className="absolute top-1 left-1.5 px-1 py-0.5 rounded bg-purple-600 text-white text-[9px] font-mono font-bold">
                  A-B 循环区间
                </div>
              </div>
            )}

            {/* Real-time 60 FPS Playhead Cursor */}
            <div
              className="absolute top-0 bottom-0 w-[2.5px] bg-amber-400 z-20 pointer-events-none shadow-[0_0_12px_rgba(251,191,36,0.9)] flex flex-col items-center"
              style={{
                left: `${visualProgressPercent * zoomLevel}%`,
                transition: isPlaying ? 'none' : 'left 0.1s ease-out',
              }}
            >
              <div className="w-3.5 h-3.5 -mt-1 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md" />
            </div>
          </div>
        </div>

        {/* Section 2: 6-Line Tablature (六线谱挂音乐进度条对齐网格) */}
        <div
          className={`rounded-2xl border p-4 transition-all flex flex-col ${
            darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          {/* Tablature Header */}
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold tracking-wide uppercase text-amber-500 flex items-center gap-1.5">
                <Music className="w-4 h-4" />
                标准吉他六线谱 (Tablature) 毫秒级双向 Seek
              </span>
              <span className="text-[11px] text-slate-400">
                1弦 (高音E) ~ 6弦 (低音E) · 点击音符即可试听发声与毫秒对齐
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* 转录 JSON 导入 (SoloTrace / Basic Pitch) */}
              <input
                type="file"
                ref={soloTraceInputRef}
                accept=".json,application/json"
                className="hidden"
                onChange={handleSoloTraceUpload}
              />
              <button
                id="btn-import-solotrace-json"
                onClick={() => soloTraceInputRef.current?.click()}
                disabled={importingJson}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white flex items-center gap-1 font-semibold shadow-sm"
                title="导入 Mac 工作站 SoloTrace 导出的转录 JSON (notes/beatMap)"
              >
                {importingJson ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileJson className="w-3.5 h-3.5" />
                )}
                <span>{importingJson ? '解析中...' : '导入转录 JSON'}</span>
              </button>

              {/* 低置信度复核开关 */}
              <button
                id="btn-toggle-low-confidence"
                onClick={() => setShowConfidenceOnly((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                  showConfidenceOnly
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                    : darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
                title="仅显示置信度低于 0.6 的音符节点，便于优先人工复核"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>低置信度复核 ({lowConfidenceCount})</span>
              </button>

              {/* 横按自动检测 */}
              <button
                id="btn-detect-barres"
                onClick={handleDetectBarres}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                  autoDetectBarres.length > 0
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
                title="按 30ms 容差聚合同品位的连续弦，自动识别横按"
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>横按检测 ({autoDetectBarres.length})</span>
              </button>

              {/* 和弦标注面板 */}
              <button
                id="btn-open-chord-panel"
                onClick={() => setIsAnnotationModalOpen(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                  chordMarkers.length > 0
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                    : darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
                title="打开常用和弦面板，在当前游标位置标注和弦"
              >
                <Tags className="w-3.5 h-3.5" />
                <span>和弦标注 ({chordMarkers.length})</span>
              </button>

              {/* 小节框选切分 */}
              <button
                id="btn-open-measure-slicer"
                onClick={() => setIsMeasureSlicerModalOpen(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
                title="按 BPM 自动生成小节线，并支持合并 / 拆分练习小节"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>小节切分</span>
              </button>

              <button
                id="btn-add-note-dialog"
                onClick={() => setIsAddNoteModalOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 font-semibold shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>在当前游标添加音符</span>
              </button>
            </div>
          </div>

          {/* Interactive 6-Line Tab Grid Canvas with scroll */}
          <div
            ref={tablatureScrollRef}
            className={`relative rounded-xl border p-4 overflow-x-auto custom-scrollbar min-h-[260px] ${
              darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
            }`}
          >
            {/* Guitar String Names on the left */}
            <div className="sticky left-0 z-20 flex flex-col justify-between h-[180px] w-8 pr-2 pointer-events-none select-none">
              {['e (1)', 'B (2)', 'G (3)', 'D (4)', 'A (5)', 'E (6)'].map((strName, idx) => (
                <div key={idx} className="text-[11px] font-mono font-bold text-slate-400">
                  {strName}
                </div>
              ))}
            </div>

            {/* Tab measures track */}
            <div
              className="absolute top-4 left-10 right-4 h-[180px]"
              style={{ width: `${Math.max(1200, config.audioDurationSec * 90 * zoomLevel)}px` }}
            >
              {/* The 6 horizontal string lines */}
              {[0, 1, 2, 3, 4, 5].map((sIndex) => {
                const topPercent = (sIndex / 5) * 100;
                return (
                  <div
                    key={sIndex}
                    className={`absolute left-0 right-0 h-[1px] ${
                      darkMode ? 'bg-slate-700/80' : 'bg-slate-300'
                    }`}
                    style={{ top: `${topPercent}%` }}
                  />
                );
              })}

              {/* Measure dividing bars */}
              {config.measureTimestamps.map((measureTime, mIdx) => {
                const nextMeasureTime = config.measureTimestamps[mIdx + 1] ?? config.audioDurationSec;
                const leftPos = (measureTime / config.audioDurationSec) * 100;
                const widthPercent = ((nextMeasureTime - measureTime) / config.audioDurationSec) * 100;
                const isCurrentMeasure = currentMeasureIndex === mIdx;

                return (
                  <div
                    key={`bar-${mIdx}`}
                    onClick={() => {
                      setCurrentTimeSec(measureTime);
                      setSelectedMeasureIndex(mIdx);
                      showToast(`跳转至第 ${mIdx + 1} 小节 (${measureTime.toFixed(2)}s)`);
                    }}
                    className={`absolute top-0 bottom-0 border-l cursor-pointer transition-colors group/measure ${
                      isCurrentMeasure
                        ? 'bg-amber-500/10 border-amber-400'
                        : 'border-slate-600 hover:bg-slate-800/30'
                    }`}
                    style={{ left: `${leftPos}%`, width: `${widthPercent}%` }}
                  >
                    {/* Measure number badge */}
                    <div
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 inline-block rounded-br border-b border-r ${
                        isCurrentMeasure
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : darkMode
                          ? 'bg-slate-800/80 text-slate-400 border-slate-700'
                          : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}
                    >
                      第 {mIdx + 1} 小节 · {measureTime.toFixed(1)}s
                    </div>
                  </div>
                );
              })}

              {/* Notes Placed on Tablature */}
              {config.noteTimestamps.map((note) => {
                const noteLeftPercent = (note.timestampSec / config.audioDurationSec) * 100;
                // String 1 is top, String 6 is bottom -> (stringIndex - 1) / 5
                const noteTopPercent = ((note.stringIndex - 1) / 5) * 100;
                const isSelected = selectedNoteId === note.id;
                const isActiveInPlayback = Math.abs(visualTimeSec - note.timestampSec) < 0.25;

                return (
                  <div
                    key={note.id}
                    onClick={(e) => handleNoteClick(note, e)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer group/note"
                    style={{ left: `${noteLeftPercent}%`, top: `${noteTopPercent}%` }}
                  >
                    {/* Chord tag if present */}
                    {note.chordName && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                        {note.chordName}
                      </div>
                    )}

                    {/* Fret circle / box */}
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center font-mono text-xs font-bold transition-transform duration-100 ${
                        isActiveInPlayback
                          ? 'bg-amber-400 text-slate-950 scale-125 ring-4 ring-amber-400/40 shadow-lg'
                          : isSelected
                          ? 'bg-indigo-500 text-white scale-110 ring-2 ring-white'
                          : darkMode
                          ? 'bg-slate-800 text-amber-300 border border-slate-600 hover:border-amber-400 hover:scale-110'
                          : 'bg-white text-slate-900 border border-slate-300 hover:border-amber-500 hover:scale-110 shadow-xs'
                      }`}
                    >
                      {note.fret}
                    </div>

                    {/* Technique indicator (e.g. h, p, /, ~) */}
                    {note.technique && note.technique !== 'normal' && (
                      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-400">
                        {note.technique === 'hammer-on'
                          ? 'H'
                          : note.technique === 'pull-off'
                          ? 'P'
                          : note.technique === 'slide'
                          ? '/'
                          : note.technique === 'vibrato'
                          ? '~'
                          : note.technique === 'harmonic'
                          ? '◇'
                          : note.technique}
                      </div>
                    )}

                    {/* Delete note button on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-500 text-white items-center justify-center hidden group-hover/note:flex shadow-xs text-[10px]"
                      title="删除此音符"
                    >
                      ×
                    </button>
                  </div>
                );
              })}

              {/* Tablature Cursor line */}
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-amber-400 z-10 pointer-events-none shadow-[0_0_10px_rgba(251,191,36,0.8)]"
                style={{
                  left: `${visualProgressPercent}%`,
                  transition: isPlaying ? 'none' : 'left 0.1s ease-out',
                }}
              />

              {/* 横按标记叠加层 (自动检测结果，publish 时写入后端 Barre 表) */}
              {autoDetectBarres.map((b) => {
                const leftPercent = (b.startTime / (config.audioDurationSec || 1)) * 100;
                const topPercent = ((b.fromString - 1) / 5) * 100;
                const heightPercent = ((b.toString - b.fromString) / 5) * 100;
                return (
                  <div
                    key={b.id}
                    className="absolute w-[5px] rounded-full pointer-events-none z-20"
                    style={{
                      left: `${leftPercent}%`,
                      top: `${topPercent}%`,
                      height: `${Math.max(4, heightPercent)}%`,
                      transform: 'translate(-50%, -50%)',
                      background: 'rgba(239,68,68,0.75)',
                      boxShadow: '0 0 8px rgba(239,68,68,0.6)',
                    }}
                    title={`横按: ${b.fret}品 ${b.fromString}~${b.toString}弦 @ ${b.startTime.toFixed(2)}s`}
                  />
                );
              })}

              {/* 节点置信度标注叠加层 (>=0.8 绿 / >=0.6 黄 / <0.6 红) */}
              <NoteOverlay
                markers={overlayMarkers}
                selectedId={confidenceFocusId}
                onSelect={handleFocusConfidenceNote}
                showLegend
                onlyBelowConfidence={showConfidenceOnly ? 0.8 : undefined}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Notes & Measures Alignment Inspector */}
        <div
          className={`rounded-2xl border p-4 transition-all ${
            darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              小节与音符时间戳对齐表格 (双向编辑)
            </span>
            <span className="text-xs text-slate-400">
              共 {config.noteTimestamps.length} 个音符标记点 · {config.measureTimestamps.length} 个小节
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Measure Timestamps List */}
            <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-xs font-semibold mb-2 flex items-center justify-between text-indigo-400">
                <span>小节切片表 (Measures)</span>
                <button
                  onClick={() => {
                    const newMeasure = Number(currentTimeSec.toFixed(2));
                    if (!config.measureTimestamps.includes(newMeasure)) {
                      onChangeConfig({
                        ...config,
                        measureTimestamps: [...config.measureTimestamps, newMeasure].sort((a, b) => a - b),
                      });
                      showToast(`已于 ${newMeasure.toFixed(2)}s 添加小节`);
                    }
                  }}
                  className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
                >
                  + 在当前游标加小节
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                {config.measureTimestamps.map((mTime, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setCurrentTimeSec(mTime);
                      setSelectedMeasureIndex(idx);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-2 cursor-pointer border ${
                      currentMeasureIndex === idx
                        ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                        : darkMode
                        ? 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <span>M{idx + 1}: {mTime.toFixed(2)}s</span>
                    {config.measureTimestamps.length > 2 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeConfig({
                            ...config,
                            measureTimestamps: config.measureTimestamps.filter((_, i) => i !== idx),
                          });
                        }}
                        className="text-slate-400 hover:text-rose-400"
                        title="删除该小节线"
                      >
                        ×
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Note Inspector */}
            <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-xs font-semibold mb-2 flex items-center justify-between text-amber-400">
                <span>音符采样明细 (Tab Notes)</span>
                <span className="text-[11px] text-slate-400">单击音符试听弦音</span>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                {config.noteTimestamps.slice(0, 15).map((note) => (
                  <div
                    key={note.id}
                    onClick={(e) => handleNoteClick(note, e)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center justify-between cursor-pointer border ${
                      selectedNoteId === note.id
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                        : darkMode
                        ? 'bg-slate-800/40 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold">{note.stringIndex}弦</span>
                      <span>{note.fret}品</span>
                      {note.technique && note.technique !== 'normal' && (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                          {note.technique}
                        </span>
                      )}
                      {note.chordName && (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300">
                          {note.chordName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <span>{note.timestampSec.toFixed(2)}s</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNote(note.id);
                        }}
                        className="hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Add Note Editor */}
      {isAddNoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-all ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Music className="w-4 h-4 text-amber-500" />
                <span>挂载新音符至六线谱</span>
              </h3>
              <span className="text-xs font-mono text-amber-400">
                时间点: {currentTimeSec.toFixed(2)}s
              </span>
            </div>

            <div className="space-y-4 text-xs">
              {/* Select String */}
              <div>
                <label className="block font-medium mb-1.5 text-slate-400">
                  选择琴弦 (1=最细高音E, 6=最粗低音E)
                </label>
                <div className="grid grid-cols-6 gap-1.5">
                  {[1, 2, 3, 4, 5, 6].map((s) => (
                    <button
                      key={s}
                      onClick={() => setNewNoteString(s)}
                      className={`py-2 rounded-lg font-mono font-bold border ${
                        newNoteString === s
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : darkMode
                          ? 'bg-slate-800 border-slate-700 text-slate-300'
                          : 'bg-slate-100 border-slate-300 text-slate-700'
                      }`}
                    >
                      {s}弦
                    </button>
                  ))}
                </div>
              </div>

              {/* Fret number */}
              <div>
                <label className="block font-medium mb-1.5 text-slate-400">
                  品位 (0=空弦, 1~24)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="15"
                    value={newNoteFret}
                    onChange={(e) => setNewNoteFret(parseInt(e.target.value, 10))}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="w-10 text-center font-mono font-bold text-sm text-amber-400">
                    {newNoteFret}品
                  </span>
                </div>
              </div>

              {/* Technique */}
              <div>
                <label className="block font-medium mb-1.5 text-slate-400">
                  吉他技巧标记 (Technique)
                </label>
                <select
                  value={newNoteTechnique}
                  onChange={(e) => setNewNoteTechnique(e.target.value as TabNote['technique'])}
                  className={`w-full p-2 rounded-lg border font-mono ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-800'
                  }`}
                >
                  <option value="normal">标准原音 (Normal Pick)</option>
                  <option value="hammer-on">击弦 (Hammer-on / H)</option>
                  <option value="pull-off">勾弦 (Pull-off / P)</option>
                  <option value="slide">滑音 (Slide / S)</option>
                  <option value="vibrato">揉弦 (Vibrato / ~)</option>
                  <option value="harmonic">自然泛音 (Harmonic / ◇)</option>
                  <option value="palm-mute">右手闷音 (Palm Mute / P.M.)</option>
                </select>
              </div>

              {/* Sound test button */}
              <button
                type="button"
                onClick={() => {
                  const freq = audioEngine.getGuitarFrequency(newNoteString, newNoteFret);
                  audioEngine.pluckString(freq, 1.2, 0.85);
                }}
                className="w-full py-2 rounded-lg border border-amber-500/40 text-amber-400 bg-amber-500/10 font-semibold flex items-center justify-center gap-2"
              >
                <Volume2 className="w-4 h-4" />
                <span>试听当前设定音色</span>
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setIsAddNoteModalOpen(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                  darkMode ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                }`}
              >
                取消
              </button>
              <button
                onClick={handleSaveNewNote}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm"
              >
                确认挂载到此时间戳
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Save as New Version */}
      {isSaveVersionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-5 select-none">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <GitBranch className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">另存为新版本</h3>
                  <p className="text-xs text-slate-400">保留当前六线谱打点快照至版本链</p>
                </div>
              </div>
              <button
                onClick={() => setIsSaveVersionModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">版本编号 (如 v1.2, v2.0)</label>
                <input
                  type="text"
                  value={versionTagInput}
                  onChange={(e) => setVersionTagInput(e.target.value)}
                  placeholder="v1.2"
                  className={`w-full p-2.5 rounded-xl border font-mono ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">版本修改备注 / 升级要点</label>
                <textarea
                  rows={3}
                  value={versionNoteInput}
                  onChange={(e) => setVersionNoteInput(e.target.value)}
                  placeholder="例如：对齐了前奏第3小节的揉弦与击弦，修正小节线偏移 +120ms..."
                  className={`w-full p-2.5 rounded-xl border leading-relaxed ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsSaveVersionModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs"
              >
                取消
              </button>
              <button
                onClick={handleSaveNewVersionSubmit}
                disabled={!versionTagInput.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs"
              >
                确认创建新版本
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: 和弦标注面板 */}
      {isAnnotationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-5 select-none">
          <div
            className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Tags className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">和弦标注面板</h3>
                  <p className="text-xs text-slate-400">
                    点击和弦即可插入到当前播放游标位置，发布时写入 ChordMarker 表
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAnnotationModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ChordPanel
              onInsert={handleAddChordMarker}
              activeTime={currentTimeSec}
              darkMode={darkMode}
              chords={chordMarkers}
              onRemoveChord={handleRemoveChordMarker}
            />

            {/* 横按检测结果 */}
            <div
              className={`p-3 rounded-lg border space-y-1.5 ${
                darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400">
                <span>横按自动检测结果 ({autoDetectBarres.length})</span>
                <button
                  onClick={handleDetectBarres}
                  className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                >
                  重新检测
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                {autoDetectBarres.length === 0 && (
                  <div className="text-[11px] text-slate-500 py-1">
                    暂无横按，点击“重新检测”或先导入转录 JSON
                  </div>
                )}
                {autoDetectBarres.map((b) => (
                  <div
                    key={b.id}
                    className={`px-2 py-1 rounded font-mono text-[11px] flex items-center justify-between border ${
                      darkMode
                        ? 'bg-slate-800/40 border-slate-700/60 text-slate-300'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="text-rose-400 font-bold">横按 {b.fret}品</span>
                    <span>
                      {b.fromString} ~ {b.toString} 弦
                    </span>
                    <span className="text-slate-500">{b.startTime.toFixed(2)}s</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 低置信度音符清单 */}
            <div
              className={`p-3 rounded-lg border space-y-1.5 ${
                darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="text-[11px] font-semibold text-rose-400">
                低置信度音符待复核 ({lowConfidenceCount})
              </div>
              <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                {config.noteTimestamps
                  .filter((n) => (n.confidence ?? 1) < 0.8)
                  .sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1))
                  .map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleFocusConfidenceNote(n.id)}
                      className={`px-2 py-1 rounded font-mono text-[11px] flex items-center justify-between cursor-pointer border ${
                        selectedNoteId === n.id
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-200'
                          : darkMode
                          ? 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                      title="点击定位并试听该音符"
                    >
                      <span className="flex items-center gap-2">
                        <PlayCircle className="w-3 h-3 text-amber-400" />
                        <span>
                          {n.stringIndex}弦 {String(n.fret)}品
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>
                          {n.timestampSec.toFixed(2)}s
                        </span>
                        <span
                          className={`font-bold ${
                            (n.confidence ?? 1) >= 0.6 ? 'text-amber-400' : 'text-rose-400'
                          }`}
                        >
                          {(((n.confidence ?? 1) * 100) | 0)}%
                        </span>
                      </span>
                    </div>
                  ))}
                {config.noteTimestamps.filter((n) => (n.confidence ?? 1) < 0.8).length === 0 && (
                  <div className="text-[11px] text-slate-500 py-1">
                    暂无低置信度音符（导入 SoloTrace JSON 后自动标记）
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setIsAnnotationModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
              >
                完成标注
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: 小节框选切分 */}
      {isMeasureSlicerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-5 select-none">
          <div
            className={`w-full max-w-xl rounded-2xl border p-5 shadow-2xl space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Scissors className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">小节切分与练习段落编排</h3>
                  <p className="text-xs text-slate-400">
                    按 BPM 自动生成小节线，支持合并 (Merge) 与拆分 (Split)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMeasureSlicerModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <MeasureSlicer
              notes={config.noteTimestamps}
              bpm={effectiveBpm}
              timeSignature={timeSignature}
              audioDurationSec={config.audioDurationSec}
              measureTimestamps={config.measureTimestamps}
              onChangeMeasures={(timestamps) => {
                onChangeConfig({ ...config, measureTimestamps: timestamps });
              }}
              darkMode={darkMode}
              onShowToast={showToast}
            />

            <div className="flex justify-end">
              <button
                onClick={() => setIsMeasureSlicerModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
              >
                确认小节切分
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: 发布小节数据至后端 (含谱面预览) */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-5 select-none">
          <div
            className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-2xl border p-5 shadow-2xl space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <CloudUpload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">发布小节数据至后端</h3>
                  <p className="text-xs text-slate-400">
                    后端依次执行：ffmpeg 切片 → OSS 上传 → 计算 relativeTime → 写入 SQLite
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPublishModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 后端绑定信息 */}
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-400 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  后端数据绑定 (guitarmate-audio-backend)
                </span>
                <button
                  onClick={handleLoadRemoteScores}
                  disabled={loadingScores}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center gap-1.5 disabled:opacity-60"
                  title="从后端 /api/scores 拉取曲目列表"
                >
                  {loadingScores ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Radio className="w-3.5 h-3.5" />
                  )}
                  <span>{loadingScores ? '加载中...' : '从后端加载曲目'}</span>
                </button>
              </div>

              {remoteScores.length > 0 && (
                <select
                  onChange={(e) => handleSelectRemoteScore(e.target.value)}
                  value={config.remoteScoreId || ''}
                  className={`w-full p-2 rounded-lg border font-mono ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                  }`}
                >
                  <option value="">-- 选择要绑定的后端曲目 --</option>
                  {remoteScores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} {s.artist ? `· ${s.artist}` : ''} [{s.status}]
                    </option>
                  ))}
                </select>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] text-slate-500">Score ID</span>
                  <input
                    type="text"
                    value={config.remoteScoreId || ''}
                    onChange={(e) => onChangeConfig({ ...config, remoteScoreId: e.target.value })}
                    placeholder="cmu8g2bpf0000..."
                    className={`w-full p-2 rounded-lg border font-mono text-[11px] ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-slate-500">Track ID</span>
                  <input
                    type="text"
                    value={config.remoteTrackId || ''}
                    onChange={(e) => onChangeConfig({ ...config, remoteTrackId: e.target.value })}
                    placeholder="cmu8g2bpg0001..."
                    className={`w-full p-2 rounded-lg border font-mono text-[11px] ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-slate-500 flex items-center justify-between gap-2">
                    <span>分轨音频路径 / URL</span>
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleRenderAlignedAudio}
                        disabled={renderingAudio}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-60 flex items-center gap-1"
                        title="读取该曲目已发布小节的音符标注，合成与节点精确对齐的示范音频（没有标注的时间点不会有声音）"
                      >
                        {renderingAudio ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <Music className="w-2.5 h-2.5" />
                        )}
                        {renderingAudio ? '合成中...' : '按标注生成对齐音频'}
                      </button>
                      <button
                        type="button"
                        onClick={handleUseDemoAudio}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                        title="填入后端内置的示例音频 uploads/demo/demo_guitar.wav（通用伴奏，节奏与标注无关）"
                      >
                        使用示例音频
                      </button>
                    </span>
                  </span>
                  <input
                    type="text"
                    value={config.remoteAudioPath || ''}
                    onChange={(e) => onChangeConfig({ ...config, remoteAudioPath: e.target.value })}
                    placeholder="uploads/demo/demo_guitar.wav 或 /Users/me/guitar.wav 或 https://..."
                    className={`w-full p-2 rounded-lg border font-mono text-[11px] ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </label>
              </div>

              {/* 双声道发布：Simplified(练习声道) + Original(原声全轨混音) */}
              <div
                className={`p-3 rounded-xl border space-y-2 ${
                  darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span className={`text-[11px] font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    双声道发布 · C 端 Simplified / Original 切换音源
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-500">
                      Simplified 声道（默认吉他）
                    </span>
                    <select
                      value={config.remoteChannel || 'guitar'}
                      onChange={(e) =>
                        onChangeConfig({ ...config, remoteChannel: e.target.value })
                      }
                      className={`w-full p-2 rounded-lg border text-[11px] ${
                        darkMode
                          ? 'bg-slate-800 border-slate-700 text-slate-100'
                          : 'bg-slate-50 border-slate-300'
                      }`}
                      title="C 端小程序顶部选择 Simplified 时播放该声道的音频"
                    >
                      {PRACTICE_CHANNELS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span className={`text-[10px] block ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {PRACTICE_CHANNELS.find((c) => c.value === (config.remoteChannel || 'guitar'))
                        ?.hint || ''}
                    </span>
                  </label>

                  <label className="space-y-1 md:col-span-2">
                    <span className="text-[11px] text-slate-500 flex items-center justify-between gap-2">
                      <span>Original 原声路径 / URL（含鼓 / 贝斯 / 电琴等全轨混音）</span>
                      <span className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleRenderBandAudio}
                          disabled={renderingBandAudio}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-60 flex items-center gap-1"
                          title="按已发布小节的音符标注合成「吉他 + 贝斯 + 鼓」原声：吉他与 Simplified 用同一批节点，鼓/贝斯按小节窗口推导的节拍网格对齐，因此整轨都落在节点上"
                        >
                          {renderingBandAudio ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          ) : (
                            <Music className="w-2.5 h-2.5" />
                          )}
                          {renderingBandAudio ? '合成中...' : '按标注生成原声(加鼓/贝斯)'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeConfig({ ...config, remoteOriginalAudioPath: '' })
                          }
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200"
                          title="清空后：后端自动回退到曲目的 originalAudio；若也为空则 C 端 Original 回退到 Simplified 声道"
                        >
                          清空
                        </button>
                      </span>
                    </span>
                    <input
                      type="text"
                      value={config.remoteOriginalAudioPath || ''}
                      onChange={(e) =>
                        onChangeConfig({ ...config, remoteOriginalAudioPath: e.target.value })
                      }
                      placeholder="uploads/demo/demo_guitar.wav 或 /path/to/full_mix.wav 或 https://..."
                      className={`w-full p-2 rounded-lg border font-mono text-[11px] ${
                        darkMode
                          ? 'bg-slate-800 border-slate-700 text-slate-100'
                          : 'bg-slate-50 border-slate-300'
                      }`}
                    />
                    <span className={`text-[10px] block ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      留空时自动使用该曲目的 <span className="font-mono">originalAudio</span>。
                      点「按标注生成原声」可直接合成一段与节点对齐的吉他 + 贝斯 + 鼓示例；
                      原声不可访问不会阻断发布，但 C 端 Original 会回退到 Simplified 声道。
                    </span>
                  </label>
                </div>
              </div>

              {/* 音频校验开关 */}
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowMissingAudio}
                  onChange={(e) => setAllowMissingAudio(e.target.checked)}
                  className="mt-0.5 accent-amber-500"
                />
                <span className={`text-[11px] leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  允许音频不可访问时仍然发布（<span className="text-amber-400">仅入库谱面标注，C 端将无法播放</span>）
                  <br />
                  默认关闭：后端会先校验音频来源，不可访问时直接报错并终止发布，避免产生「能看不能听」的小节。
                </span>
              </label>
            </div>

            {/* 谱面预览 */}
            <div
              className={`p-3 rounded-xl border ${
                darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-amber-400">
                  发布预览 · 共 {config.measureTimestamps.length} 个小节
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      setPublishPreviewMeasureIndex((i) => Math.max(0, i - 1))
                    }
                    className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]"
                  >
                    ◀
                  </button>
                  <span className="font-mono text-[11px] text-slate-400">
                    M{Math.min(publishPreviewMeasureIndex + 1, config.measureTimestamps.length)} /{' '}
                    {config.measureTimestamps.length}
                  </span>
                  <button
                    onClick={() =>
                      setPublishPreviewMeasureIndex((i) =>
                        Math.min(config.measureTimestamps.length - 1, i + 1),
                      )
                    }
                    className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]"
                  >
                    ▶
                  </button>
                </div>
              </div>

              <PublishMeasurePreview
                notes={config.noteTimestamps}
                measureTimestamps={config.measureTimestamps}
                audioDurationSec={config.audioDurationSec}
                bpm={effectiveBpm}
                timeSignature={timeSignatureLabel}
                barres={autoDetectBarres}
                chordMarkers={chordMarkers}
                measureIndex={Math.min(
                  publishPreviewMeasureIndex,
                  Math.max(0, config.measureTimestamps.length - 1),
                )}
                isDark={darkMode}
              />
            </div>

            {/* 发布状态 */}
            {publishError && (
              <div className="px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="whitespace-pre-line leading-relaxed">{publishError}</span>
              </div>
            )}
            {publishSuccess && (
              <div className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="whitespace-pre-line leading-relaxed">{publishSuccess}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-[11px] text-slate-500 font-mono">
                音符 {config.noteTimestamps.length} · 横按 {autoDetectBarres.length} · 和弦{' '}
                {chordMarkers.length} · {effectiveBpm} BPM {timeSignatureLabel}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleClearPublishedMeasures}
                  disabled={publishing}
                  className="px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 disabled:opacity-60 text-xs flex items-center gap-1.5"
                  title="删除该曲目已发布的全部小节（含旧的无音频数据），便于重新发布"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清空已发布小节</span>
                </button>
                <button
                  onClick={() => setIsPublishModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs"
                >
                  取消
                </button>
                <button
                  onClick={handlePublishMeasures}
                  disabled={publishing}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white font-bold text-xs flex items-center gap-2"
                >
                  {publishing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CloudUpload className="w-3.5 h-3.5" />
                  )}
                  <span>{publishing ? '发布中...' : '确认发布'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 发布预览: 单小节六线谱渲染 (TabRenderer)
// ─────────────────────────────────────────────────────────────
interface PublishMeasurePreviewProps {
  notes: TabNote[];
  measureTimestamps: number[];
  audioDurationSec: number;
  bpm: number;
  timeSignature: string;
  barres: DetectedBarre[];
  chordMarkers: Array<{ id: string; chordName: string; startTime: number }>;
  measureIndex: number;
  isDark: boolean;
}

const PublishMeasurePreview: React.FC<PublishMeasurePreviewProps> = ({
  notes,
  measureTimestamps,
  audioDurationSec,
  bpm,
  timeSignature,
  barres,
  chordMarkers,
  measureIndex,
  isDark,
}) => {
  if (measureTimestamps.length === 0) {
    return <div className="text-[11px] text-slate-500 py-3 text-center">暂无可预览的小节</div>;
  }

  const start = measureTimestamps[measureIndex] ?? 0;
  const end =
    measureIndex + 1 < measureTimestamps.length
      ? measureTimestamps[measureIndex + 1]
      : audioDurationSec;
  const duration = Math.max(0.05, end - start);

  const rendererNotes = notes
    .filter((n) => n.timestampSec >= start && n.timestampSec < end)
    .map((n) => ({
      id: n.id,
      string: n.stringIndex,
      fret: n.fret,
      relativeTime: n.timestampSec - start,
      duration: n.durationSec || 0.5,
    }));

  const rendererBarres = barres
    .filter((b) => b.startTime >= start - 0.001 && b.startTime < end)
    .map((b) => ({
      id: b.id,
      fret: b.fret,
      fromString: b.fromString,
      toString: b.toString,
      startTime: Math.max(0, b.startTime - start),
      duration: b.duration,
    }));

  const rendererChords = chordMarkers
    .filter((c) => c.startTime >= start - 0.001 && c.startTime < end)
    .map((c) => ({
      id: c.id,
      chordName: c.chordName,
      startTime: Math.max(0, c.startTime - start),
    }));

  return (
    <TabRenderer
      notes={rendererNotes}
      measureDuration={duration}
      bpm={bpm}
      timeSignature={timeSignature}
      barres={rendererBarres}
      chordMarkers={rendererChords}
      isDark={isDark}
      height={200}
    />
  );
};

export default AudioTabSyncStudio;
