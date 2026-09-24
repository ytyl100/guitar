import React, { useState, useEffect, useRef } from 'react';
import { Course, LessonStep, Chapter } from '../types';
import { ChordDiagram } from './ChordDiagram';
import { audioEngine } from '../utils/audioSynth';
import { CHORD_DATABASE } from '../data/mockData';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  ChevronLeft,
  Play,
  Pause,
  CheckCircle2,
  Circle,
  Tv,
  Mic,
  MicOff,
  Compass,
  Sliders,
  Sparkles,
  Maximize2,
  X,
  Volume2,
  ArrowRight,
  RotateCcw,
  BookOpen,
  FileText,
} from 'lucide-react';

interface CourseTabProps {
  courses: Course[];
  onUpdateProgress: (courseId: string, stepId: string, completed: boolean) => void;
  onOpenTuner: () => void;
  onOpenArchitecturePlan?: () => void;
  initialPracticeChords?: string[] | null;
  onClearPracticeChords?: () => void;
  resetViewTrigger?: number;
}

export const CourseTab: React.FC<CourseTabProps> = ({
  courses,
  onUpdateProgress,
  onOpenTuner,
  onOpenArchitecturePlan,
  initialPracticeChords,
  onClearPracticeChords,
  resetViewTrigger,
}) => {
  const { isDark } = useTheme();
  const { t } = useLanguage();

  // DEFAULT TO NULL: Always enter Guitar courses overview first, NOT directly into course directory!
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [activeStep, setActiveStep] = useState<LessonStep | null>(null);

  // Reset to guitar courses list whenever user clicks Learn tab
  useEffect(() => {
    if (resetViewTrigger !== undefined && resetViewTrigger > 0) {
      setSelectedCourse(null);
      setActiveStep(null);
      setIsFreePracticeMode(false);
    }
  }, [resetViewTrigger]);

  // Video tutorial state (training_teacher.jpg)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoProgressSec, setVideoProgressSec] = useState(12);
  const videoTimerRef = useRef<number | null>(null);

  // Microphone Chord Trainer state (training_chor.jpg & training_chor_1.jpg)
  const [trainerChords, setTrainerChords] = useState<string[]>(['Em', 'D6/9']);
  const [currentChordIndex, setCurrentChordIndex] = useState(0);
  const [isMicListening, setIsMicListening] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [detectedPitchNote, setDetectedPitchNote] = useState<string>('');
  const [detectedFreq, setDetectedFreq] = useState<number>(0);
  const [matchSuccess, setMatchSuccess] = useState(false);
  const [trainerScore, setTrainerScore] = useState(0);
  const [enlargedChord, setEnlargedChord] = useState<string | null>(null);

  // Free practice mode (practice.jpg)
  const [isFreePracticeMode, setIsFreePracticeMode] = useState(false);
  const [customPracticeList, setCustomPracticeList] = useState<string[]>(['Em', 'D6/9', 'G', 'C']);

  // Handle external practice chords if sent from song detail
  useEffect(() => {
    if (initialPracticeChords && initialPracticeChords.length > 0) {
      setTrainerChords(initialPracticeChords);
      setCurrentChordIndex(0);
      setIsFreePracticeMode(true);
      if (onClearPracticeChords) onClearPracticeChords();
    }
  }, [initialPracticeChords, onClearPracticeChords]);

  // Video simulation playback
  useEffect(() => {
    if (isVideoPlaying) {
      videoTimerRef.current = window.setInterval(() => {
        setVideoProgressSec((prev) => {
          if (prev >= 180) {
            setIsVideoPlaying(false);
            return 180;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
    }
    return () => {
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
    };
  }, [isVideoPlaying]);

  // Handle starting/stopping microphone
  const toggleMicListening = async () => {
    if (isMicListening) {
      audioEngine.stopListening();
      setIsMicListening(false);
      setMicVolume(0);
      setDetectedPitchNote('');
    } else {
      const ok = await audioEngine.startListening((pitch) => {
        setMicVolume(pitch.volume);
        setDetectedPitchNote(pitch.note);
        setDetectedFreq(pitch.freq);

        // Analyze whether detected pitch matches chord harmonics
        const target = trainerChords[currentChordIndex];
        const chordDef = CHORD_DATABASE[target];
        if (chordDef && chordDef.notes && chordDef.notes.includes(pitch.note)) {
          triggerSuccessfulChordMatch();
        }
      });
      setIsMicListening(ok);
      if (!ok) {
        alert('请允许麦克风权限以开启和弦实时侦听识别！');
      }
    }
  };

  // Trigger chord match & advance
  const triggerSuccessfulChordMatch = () => {
    if (matchSuccess) return;
    setMatchSuccess(true);
    setTrainerScore((s) => s + 100);
    audioEngine.playChord(trainerChords[currentChordIndex]);

    setTimeout(() => {
      setMatchSuccess(false);
      setCurrentChordIndex((prev) => (prev + 1) % trainerChords.length);
    }, 1200);
  };

  // Clean up mic on unmount
  useEffect(() => {
    return () => {
      audioEngine.stopListening();
    };
  }, []);

  // -------------------------------------------------------------
  // VIEW: MIC CHORD TRAINER / PRACTICE (training_chor.jpg, training_chor_1.jpg)
  // -------------------------------------------------------------
  if (activeStep?.type === 'trainer' || isFreePracticeMode) {
    const targetChordName = trainerChords[currentChordIndex] || 'Em';
    const nextChordName = trainerChords[(currentChordIndex + 1) % trainerChords.length] || 'D6/9';

    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-[#1b2046] via-[#141733] to-[#0d0f22] text-white p-4 select-none relative overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between pt-2 pb-4">
          <button
            onClick={() => {
              audioEngine.stopListening();
              setIsMicListening(false);
              setIsFreePracticeMode(false);
              setActiveStep(null);
            }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white/90">
              {isFreePracticeMode ? '自定义自由和弦练习' : activeStep?.title || '和弦麦克风侦听练习'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold">
            <Sparkles size={14} />
            <span>{trainerScore} PTS</span>
          </div>
        </div>

        {/* Practice Instructions banner */}
        <div className="text-center my-2">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            {matchSuccess ? '太棒了！音色清脆完美！' : 'Play a chord to start.'}
          </h2>
          <p className="text-xs text-indigo-200/70 mt-1">
            扫响吉他对应和弦，麦克风将通过傅里叶泛音算法实时检测按弦准确度
          </p>
        </div>

        {/* Main Stage: Current Target Chord & Next Chord Cards */}
        <div className="flex-1 flex flex-col items-center justify-center relative my-4">
          <div className="flex items-center gap-4 max-w-sm w-full justify-center">
            {/* Current Target Chord Card */}
            <div className="relative group">
              {matchSuccess && (
                <div className="absolute -top-3 -right-3 z-30 px-3 py-1 rounded-full bg-emerald-500 text-black text-xs font-black shadow-lg animate-bounce">
                  PERFECT! ★
                </div>
              )}
              <ChordDiagram
                chordName={targetChordName}
                size="md"
                showPlayButton
                onEnlarge={() => setEnlargedChord(targetChordName)}
                isActive={matchSuccess}
              />
              <div className="text-center mt-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Target: {targetChordName}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <div className="text-white/40">
              <ArrowRight size={24} />
            </div>

            {/* Next Chord Card */}
            <div className="opacity-70 scale-95">
              <ChordDiagram
                chordName={nextChordName}
                size="sm"
                showPlayButton
                onEnlarge={() => setEnlargedChord(nextChordName)}
              />
              <div className="text-center mt-2">
                <span className="text-[11px] text-zinc-400 uppercase">
                  Next: {nextChordName}
                </span>
              </div>
            </div>
          </div>

          {/* Real-time Frequency & Mic Audio Detection feedback */}
          <div className="mt-6 w-full max-w-xs bg-black/40 backdrop-blur-md rounded-2xl p-3 border border-white/10 flex flex-col items-center">
            <div className="flex items-center justify-between w-full text-xs text-zinc-400 mb-2">
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isMicListening ? 'bg-emerald-400 mic-live-pulse' : 'bg-zinc-600'
                  }`}
                />
                <span className="font-semibold text-zinc-200">
                  {isMicListening ? '● 麦克风实时侦听中' : '○ 麦克风已关闭'}
                </span>
              </div>
              <span className="font-mono text-emerald-400">
                {detectedPitchNote ? `${detectedPitchNote} (${detectedFreq}Hz)` : '等待拨弦...'}
              </span>
            </div>

            {/* Mic Volume bar */}
            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mb-3">
              <div
                className="bg-emerald-400 h-full transition-all duration-100"
                style={{ width: `${Math.min(100, micVolume * 100)}%` }}
              />
            </div>

            {/* Primary Action Buttons */}
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={toggleMicListening}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  isMicListening
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                    : 'bg-emerald-500 text-black hover:bg-emerald-400'
                }`}
              >
                {isMicListening ? <MicOff size={14} /> : <Mic size={14} />}
                <span>{isMicListening ? '关闭麦克风' : '开启麦克风听音'}</span>
              </button>

              {/* Pluck / Simulate button if testing without physical guitar nearby */}
              <button
                onClick={triggerSuccessfulChordMatch}
                title="无琴模拟：直接模拟拨弦测试通关"
                className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-zinc-200 flex items-center gap-1"
              >
                <Volume2 size={14} />
                <span>模拟弹奏</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Chord Quick Switching Bar (practice.jpg) */}
        <div className="bg-black/50 backdrop-blur-md rounded-2xl p-3 border border-white/10 mb-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span className="font-semibold text-zinc-200">自由切换训练和弦:</span>
            <span className="text-[11px] text-zinc-400">点击和弦即刻切换</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {['Em', 'D6/9', 'G', 'C', 'D', 'Am', 'A', 'F'].map((c) => {
              const isSelected = trainerChords.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => {
                    if (trainerChords.includes(c)) {
                      if (trainerChords.length > 1) {
                        setTrainerChords(trainerChords.filter((item) => item !== c));
                      }
                    } else {
                      setTrainerChords([...trainerChords, c]);
                    }
                    audioEngine.playChord(c);
                  }}
                  className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition shrink-0 ${
                    c === targetChordName
                      ? 'bg-emerald-500 text-black shadow-md ring-2 ring-emerald-300'
                      : isSelected
                      ? 'bg-indigo-600/60 text-white border border-indigo-400/50'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* Enlarged Chord Modal (training_chor_1.jpg) */}
        {enlargedChord && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 max-w-sm w-full flex flex-col items-center relative shadow-2xl">
              <button
                onClick={() => setEnlargedChord(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X size={20} />
              </button>

              <h3 className="text-xl font-extrabold text-white mb-1">
                {enlargedChord} 和弦高精度放大图
              </h3>
              <p className="text-xs text-zinc-400 mb-4 text-center">
                清晰观察按弦手指编号与品位细节
              </p>

              <ChordDiagram
                chordName={enlargedChord}
                size="lg"
                showPlayButton
                isActive
              />

              <div className="mt-4 w-full bg-zinc-800/60 rounded-xl p-3 text-xs text-zinc-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">手指编号:</span>
                  <span className="font-semibold text-zinc-200">1食指 2中指 3无名指 4小指</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">标记提示:</span>
                  <span className="font-semibold text-zinc-200">✕静音不弹  ○空弦发声</span>
                </div>
              </div>

              <button
                onClick={() => {
                  audioEngine.playChord(enlargedChord);
                  setEnlargedChord(null);
                }}
                className="mt-5 w-full py-3 rounded-2xl bg-emerald-500 text-black font-extrabold text-sm hover:bg-emerald-400 transition"
              >
                拨奏发声并返回
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: TEACHER VIDEO LESSON (training_teacher.jpg)
  // -------------------------------------------------------------
  if (activeStep?.type === 'video' && activeStep.videoData) {
    const vd = activeStep.videoData;
    return (
      <div className="flex flex-col h-full bg-[#101217] text-white p-4 select-none relative overflow-y-auto pb-28">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
          <button
            onClick={() => setActiveStep(null)}
            className="p-1 rounded-full text-zinc-300 hover:text-white"
          >
            <ChevronLeft size={24} />
          </button>
          <h2 className="text-base font-bold text-white truncate max-w-[220px]">
            {activeStep.title}
          </h2>
          <div className="w-6" />
        </div>

        {/* Video Player Canvas / Snapshot (training_teacher.jpg) */}
        <div className="relative rounded-2xl overflow-hidden bg-black border border-zinc-800 my-4 shadow-xl">
          <div className="relative aspect-video w-full">
            <img
              src={vd.videoPoster}
              alt={activeStep.title}
              className="w-full h-full object-cover brightness-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

            {/* Video center play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => setIsVideoPlaying(!isVideoPlaying)}
                className="w-16 h-16 rounded-full bg-emerald-500/90 text-black flex items-center justify-center shadow-2xl hover:scale-105 transition"
              >
                {isVideoPlaying ? (
                  <Pause size={28} className="fill-black" />
                ) : (
                  <Play size={28} className="fill-black ml-1" />
                )}
              </button>
            </div>

            {/* Video overlay controls */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white">
              <span className="font-mono bg-black/60 px-2 py-0.5 rounded">
                {Math.floor(videoProgressSec / 60)}:
                {String(videoProgressSec % 60).padStart(2, '0')} / 03:00
              </span>
              <span className="bg-emerald-500/80 text-black font-bold px-2 py-0.5 rounded text-[11px]">
                1080P 高清示范
              </span>
            </div>
          </div>
        </div>

        {/* Teacher profile */}
        <div className="bg-zinc-900/90 rounded-2xl p-4 border border-zinc-800 mb-4 flex items-center gap-3.5">
          <img
            src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80"
            alt={vd.teacherName}
            className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500/50 shrink-0"
          />
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>{vd.teacherName}</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
                主讲认证
              </span>
            </h4>
            <p className="text-xs text-zinc-400 truncate mt-0.5">{vd.teacherTitle}</p>
          </div>
        </div>

        {/* Key Takeaway Bullet points */}
        <div className="bg-zinc-900/60 rounded-2xl p-4 border border-zinc-800 mb-6">
          <h3 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
            <Sparkles size={16} /> 本节核心教学要点
          </h3>
          <ul className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
            {vd.keyPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                  {idx + 1}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Button: Mark Completed and Next */}
        <div className="mt-auto space-y-2.5">
          <button
            onClick={() => {
              if (selectedCourse) {
                onUpdateProgress(selectedCourse.id, activeStep.id, true);
              }
              setActiveStep(null);
            }}
            className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition"
          >
            <CheckCircle2 size={18} />
            <span>完成本课时并打卡 (+50积分)</span>
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: COURSE DETAIL WITH 13 STEPS (training_1.jpg, 2, 3, 4)
  // -------------------------------------------------------------
  if (selectedCourse && selectedCourse.chapters && selectedCourse.chapters.length > 0) {
    const totalSteps = selectedCourse.totalSteps;
    const completedCount = selectedCourse.chapters.reduce(
      (acc, ch) => acc + ch.steps.filter((s) => s.completed).length,
      0
    );

    return (
      <div
        className={`flex flex-col h-full overflow-y-auto px-4 pb-28 pt-3 select-none transition-colors duration-200 ${
          isDark ? 'bg-[#101217] text-white' : 'bg-slate-50 text-zinc-900'
        }`}
      >
        {/* Top Back & Actions */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setSelectedCourse(null)}
            className={`flex items-center gap-1 p-1 rounded-full transition ${
              isDark ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <ChevronLeft size={22} />
            <span className="text-xs font-bold">{t('learn.coursesTitle')}</span>
          </button>
          <span className={`text-xs font-semibold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {t('learn.courseCatalog')}
          </span>
          <div className="flex items-center gap-1.5">
            {onOpenArchitecturePlan && (
              <button
                onClick={onOpenArchitecturePlan}
                className={`px-2.5 py-1 rounded-full border text-xs font-semibold flex items-center gap-1 transition ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-750 text-emerald-400 hover:bg-zinc-800'
                    : 'bg-white border-zinc-300 text-emerald-600 hover:bg-zinc-100 shadow-xs'
                }`}
                title="课程编写与教务管理体系规划方案"
              >
                <FileText size={12} /> 教研方案
              </button>
            )}
            <button
              onClick={() => setIsFreePracticeMode(true)}
              className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-400 dark:text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1"
            >
              <Sparkles size={12} /> {t('learn.freePractice')}
            </button>
          </div>
        </div>

        {/* Course Header Banner */}
        <div className="mb-4">
          <h1
            className={`text-2xl font-black tracking-tight ${
              isDark ? 'text-white' : 'text-zinc-900'
            }`}
          >
            {selectedCourse.title}
          </h1>
          <p
            className={`text-xs mt-1 leading-relaxed ${
              isDark ? 'text-zinc-400' : 'text-zinc-600'
            }`}
          >
            {selectedCourse.description}
          </p>
        </div>

        {/* Progress Bar Card */}
        <div
          className={`rounded-2xl p-4 border mb-5 shadow-sm transition-colors duration-200 ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800'
              : 'bg-white border-zinc-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-xs font-bold ${
                isDark ? 'text-zinc-300' : 'text-zinc-700'
              }`}
            >
              {t('learn.courseProgress')}: {completedCount} / {totalSteps}
            </span>
            <span className="text-xs font-mono text-emerald-500 font-bold">
              {Math.round((completedCount / totalSteps) * 100)}%
            </span>
          </div>

          <div
            className={`w-full h-2.5 rounded-full overflow-hidden mb-4 ${
              isDark ? 'bg-zinc-800' : 'bg-zinc-100'
            }`}
          >
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / totalSteps) * 100}%` }}
            />
          </div>

          <button
            onClick={() => {
              // Find first uncompleted step
              for (const ch of selectedCourse.chapters) {
                const uncompleted = ch.steps.find((s) => !s.completed);
                if (uncompleted) {
                  if (uncompleted.type === 'tuner') {
                    onOpenTuner();
                  } else {
                    setActiveStep(uncompleted);
                  }
                  return;
                }
              }
              // If all completed, open step 1
              setActiveStep(selectedCourse.chapters[0].steps[0]);
            }}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm transition flex items-center justify-center gap-1.5 shadow-md active:scale-[0.99]"
          >
            <span>{t('learn.continueCourse')}</span>
            <ArrowRight size={16} />
          </button>
        </div>

        {/* Chapters & Lessons (training_1.jpg to training_4.jpg) */}
        <div className="space-y-6">
          {selectedCourse.chapters.map((chapter) => (
            <div key={chapter.id} className="space-y-2.5">
              {/* Chapter Header */}
              <div className="flex items-center justify-between">
                <h3
                  className={`text-xs font-bold uppercase tracking-wider ${
                    isDark ? 'text-zinc-400' : 'text-zinc-500'
                  }`}
                >
                  {t('learn.chapter')} {chapter.chapterNumber} {t('learn.chapterSuffix')}: {chapter.title}
                </h3>
              </div>

              {/* Special Song Reference Card for Chapter 3 */}
              {chapter.songReference && (
                <div
                  className={`relative rounded-2xl overflow-hidden border p-3 flex items-center gap-3 transition-colors duration-200 ${
                    isDark
                      ? 'bg-zinc-900 border-zinc-800'
                      : 'bg-white border-zinc-200 shadow-sm'
                  }`}
                >
                  <img
                    src="https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=400&auto=format&fit=crop&q=80"
                    alt={chapter.songReference.title}
                    className="w-12 h-12 rounded-xl object-cover"
                  />
                  <div>
                    <span className="text-[10px] text-emerald-500 font-bold uppercase">
                      {t('learn.practiceSong')}
                    </span>
                    <h4
                      className={`text-sm font-bold ${
                        isDark ? 'text-white' : 'text-zinc-900'
                      }`}
                    >
                      {chapter.songReference.title}
                    </h4>
                    <p
                      className={`text-xs ${
                        isDark ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      {chapter.songReference.artist}
                    </p>
                  </div>
                </div>
              )}

              {/* Chapter Steps List */}
              <div className="space-y-2">
                {chapter.steps.map((step) => {
                  return (
                    <div
                      key={step.id}
                      onClick={() => {
                        if (step.type === 'tuner') {
                          onOpenTuner();
                        } else {
                          setActiveStep(step);
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition active:scale-[0.99] ${
                        isDark
                          ? 'bg-zinc-900/60 hover:bg-zinc-850 border-zinc-800/80'
                          : 'bg-white hover:bg-zinc-50 border-zinc-200 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Type Icon Badge */}
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            step.type === 'video'
                              ? 'bg-blue-500/20 text-blue-500'
                              : step.type === 'trainer'
                              ? 'bg-emerald-500/20 text-emerald-500'
                              : 'bg-amber-500/20 text-amber-500'
                          }`}
                        >
                          {step.type === 'video' ? (
                            <Play size={16} />
                          ) : step.type === 'trainer' ? (
                            <Mic size={16} />
                          ) : (
                            <Compass size={16} />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                isDark
                                  ? 'text-zinc-400 bg-zinc-800'
                                  : 'text-zinc-600 bg-zinc-100'
                              }`}
                            >
                              {step.typeLabel}
                            </span>
                            <span
                              className={`text-xs font-mono ${
                                isDark ? 'text-zinc-500' : 'text-zinc-400'
                              }`}
                            >
                              {step.durationMin} min
                            </span>
                          </div>
                          <h4
                            className={`text-sm font-bold truncate mt-0.5 ${
                              isDark ? 'text-white' : 'text-zinc-900'
                            }`}
                          >
                            {step.title}
                          </h4>
                        </div>
                      </div>

                      {/* Completion status check */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateProgress(
                            selectedCourse.id,
                            step.id,
                            !step.completed
                          );
                        }}
                        className="p-1 rounded-full transition"
                      >
                        {step.completed ? (
                          <CheckCircle2
                            size={22}
                            className="text-emerald-500 fill-emerald-500/20"
                          />
                        ) : (
                          <Circle
                            size={22}
                            className={isDark ? 'text-zinc-600' : 'text-zinc-300'}
                          />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: COURSES CATALOGUE (training_course.jpg)
  // -------------------------------------------------------------
  return (
    <div
      className={`flex flex-col h-full overflow-y-auto px-4 pb-28 pt-3 select-none transition-colors duration-200 ${
        isDark ? 'bg-[#101217] text-white' : 'bg-slate-50 text-zinc-900'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1
            className={`text-3xl font-extrabold tracking-tight ${
              isDark ? 'text-white' : 'text-zinc-900'
            }`}
          >
            {t('learn.coursesTitle')}
          </h1>
          <p
            className={`text-xs mt-0.5 ${
              isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            {t('learn.coursesSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenArchitecturePlan && (
            <button
              onClick={onOpenArchitecturePlan}
              className={`px-3 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1 transition ${
                isDark
                  ? 'bg-zinc-900 border-zinc-750 text-emerald-400 hover:bg-zinc-850 hover:border-emerald-500/50'
                  : 'bg-white border-zinc-300 text-emerald-600 hover:bg-zinc-100 shadow-xs'
              }`}
              title="查看完整的吉他课程编写与教务管理体系规划方案"
            >
              <FileText size={13} /> 课程教研方案
            </button>
          )}
          <button
            onClick={() => setIsFreePracticeMode(true)}
            className="px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 dark:text-emerald-300 text-xs font-bold flex items-center gap-1 hover:bg-emerald-500/30 transition"
          >
            <Sparkles size={14} /> {t('learn.chordTest')}
          </button>
        </div>
      </div>

      {/* Courses List matching training_course.jpg */}
      <div className="space-y-4">
        {courses.map((course) => {
          return (
            <div
              key={course.id}
              onClick={() => setSelectedCourse(course)}
              className={`group relative rounded-3xl overflow-hidden border cursor-pointer shadow-lg transition active:scale-[0.99] ${
                isDark
                  ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                  : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-sm'
              }`}
            >
              {/* Snapshot Banner */}
              <div className="h-44 w-full relative">
                <img
                  src={course.coverImage}
                  alt={course.title}
                  className="w-full h-full object-cover brightness-85 group-hover:scale-105 transition duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

                {/* Level badge */}
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
                  {course.level}
                </div>

                {/* Title & info over banner */}
                <div className="absolute bottom-3 left-4 right-4">
                  <h3 className="text-xl font-extrabold text-white tracking-tight">
                    {course.title}
                  </h3>
                  <p className="text-xs text-zinc-200 mt-0.5">
                    {course.subtitle}
                  </p>
                </div>
              </div>

              {/* Bottom footer bar */}
              <div
                className={`px-4 py-3 flex items-center justify-between border-t transition-colors duration-200 ${
                  isDark
                    ? 'bg-zinc-900/90 border-zinc-800/80'
                    : 'bg-zinc-50 border-zinc-200'
                }`}
              >
                <div
                  className={`flex items-center gap-2 text-xs ${
                    isDark ? 'text-zinc-400' : 'text-zinc-600'
                  }`}
                >
                  <BookOpen size={14} className="text-emerald-500" />
                  <span>
                    {course.totalSteps} {t('learn.stepCountLabel')}
                  </span>
                </div>
                <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                  {t('learn.enterStudy')} <ArrowRight size={14} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
