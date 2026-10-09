import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Youtube, 
  Instagram,
  Mic, 
  FolderOpen, 
  Settings, 
  Sparkles, 
  ChevronRight,
  User,
  BookOpen,
  Users,
  Shield
} from 'lucide-react';
import { GuitarMateLogo } from './GuitarMateLogo';
import { ScoreData } from '../types/music';
import { MACAROON_5_SCORE } from '../data/macaroon5Demo';
import { UserProfile } from '../types/auth';
import { NotificationBell } from './NotificationBell';
import { INITIAL_LIBRARY_ITEMS } from '../data/libraryData';

interface GuitarPlatformHomeProps {
  onStartWizard: (source: { type: 'upload' | 'url' | 'record'; name: string; file?: File; url?: string }) => void;
  onOpenDemo: (score?: ScoreData) => void;
  onOpenLibrary: () => void;
  onSelectSong: (score: ScoreData) => void;
  user: UserProfile;
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  onOpenAccountSettings: () => void;
  onOpenCMS: (tab?: 'curriculum' | 'videos' | 'chords' | 'users') => void;
  onOpenPricing?: () => void;
}

export const GuitarPlatformHome: React.FC<GuitarPlatformHomeProps> = ({
  onStartWizard,
  onOpenDemo,
  onOpenLibrary,
  onSelectSong,
  user,
  onOpenSignIn,
  onOpenSignUp,
  onOpenAccountSettings,
  onOpenCMS,
  onOpenPricing,
}) => {
  // Audio Ingestion Form state
  const [urlInput, setUrlInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dynamic greeting based on current local hour
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onStartWizard({
        type: 'upload',
        name: file.name,
        file,
      });
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onStartWizard({
        type: 'upload',
        name: file.name,
        file,
      });
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    onStartWizard({
      type: 'url',
      name: urlInput.includes('youtube') || urlInput.includes('youtu.be') ? 'YouTube 吉他演奏原声' : '网络音视频链接',
      url: urlInput,
    });
  };

  const toggleRecording = () => {
    if (!isRecording) {
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      setIsRecording(false);
      onStartWizard({
        type: 'record',
        name: `吉他录音采样_${new Date().toLocaleTimeString().replace(/:/g, '-')}.wav`,
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900 flex flex-col font-sans select-none antialiased">
      
      {/* 1. TOP GLOBAL NAVIGATION */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-gray-200/90 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <GuitarMateLogo size="md" variant="light" />
          <div className="h-4 w-px bg-gray-200 hidden sm:block" />
          {/* Logo-adjacent Pricing Navigation (Roadmap 5.1) */}
          {onOpenPricing && (
            <button
              onClick={onOpenPricing}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-700 hover:text-emerald-800 hover:bg-emerald-50/60 border border-gray-200/90 shadow-2xs transition-all cursor-pointer"
              title="查看 Free / Plus / Pro / Enterprise 付费计划与 Credits 规则"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pricing 套餐</span>
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* If NOT Logged in: Sign In & Sign Up buttons */}
          {!user.isLoggedIn ? (
            <>
              <button
                onClick={onOpenSignIn}
                className="px-3 py-1.5 text-xs sm:text-sm font-semibold text-gray-700 hover:text-[#188065] transition-colors cursor-pointer"
              >
                Sign In
              </button>
              <button
                onClick={onOpenSignUp}
                className="px-3.5 py-1.5 bg-[#188065] hover:bg-[#136a53] text-white text-xs sm:text-sm font-semibold rounded-lg shadow-2xs transition-all cursor-pointer"
              >
                Sign Up
              </button>
            </>
          ) : (
            /* If LOGGED IN: CMS (Curriculum & Users), My Library, Setting */
            <>
              {/* Direct entry to Curriculum for all logged-in roles */}
              <button
                onClick={() => onOpenCMS('curriculum')}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 shadow-2xs transition-all cursor-pointer"
                title={user.role === 'student' ? '进入我的吉他课程大纲与跟练' : user.role === 'trial_guest' ? '浏览系统基础吉他课纲' : '进入课程大纲管理与编排 (CMS)'}
              >
                <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {user.role === 'super_admin' || user.role === 'teacher'
                    ? '课程大纲管理'
                    : user.role === 'institution'
                    ? '机构大纲查阅'
                    : user.role === 'student'
                    ? '我的课程大纲'
                    : '探索基础课纲'}
                </span>
              </button>

              {/* Direct entry to User Management (for Super Admin & Institution) */}
              {(user.role === 'super_admin' || user.role === 'institution') && (
                <button
                  onClick={() => onOpenCMS('users')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-800 hover:text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-2xs transition-all cursor-pointer"
                  title="进入5大用户组权限与教务关系管理"
                >
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  <span>用户管理</span>
                </button>
              )}

              <button
                onClick={onOpenLibrary}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 shadow-2xs transition-all cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                <span>我的曲谱库</span>
              </button>

              <button
                onClick={onOpenAccountSettings}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 shadow-2xs transition-all cursor-pointer group"
                title="Account Settings (账户设置)"
              >
                <Settings className="w-3.5 h-3.5 text-gray-500 group-hover:rotate-45 transition-transform" />
                <span>Setting</span>
              </button>

              {/* Bell Notification in Homepage Header */}
              <NotificationBell
                onOpenCourse={() => onOpenCMS('curriculum')}
                onOpenScore={(sid) => {
                  const found = INITIAL_LIBRARY_ITEMS.find((s) => s.id === sid);
                  if (found) {
                    onSelectSong(found.score);
                  }
                }}
              />
            </>
          )}
        </div>
      </header>

      {/* 2. HERO PLATFORM STATEMENT */}
      <section className="relative w-full pt-10 pb-12 px-4 sm:px-8 max-w-5xl mx-auto flex flex-col items-center text-center">
        {/* Ambient subtle glow background */}
        <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-25 pointer-events-none overflow-hidden">
          <div className="w-[600px] h-[280px] bg-linear-to-r from-emerald-500/15 via-teal-400/10 to-amber-300/10 rounded-full blur-3xl" />
        </div>

        <div className="text-xs uppercase tracking-widest font-mono text-emerald-800 font-bold mb-3 flex items-center space-x-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>Professional Guitar Academy &amp; Practice Studio</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-950 tracking-tight leading-tight max-w-3xl mb-4">
          让每一次拨弦都看得见
          <span className="block text-transparent bg-clip-text bg-linear-to-r from-emerald-800 via-teal-700 to-emerald-900 mt-1">
            AI 音频扒谱与吉他教学练习平台
          </span>
        </h1>

        <p className="text-sm sm:text-base text-gray-600 max-w-2xl leading-relaxed mb-6">
          一键将吉他音频转化为高精度双行乐谱（五线谱 &amp; 六线 TAB）；融合阶梯式体系化课程、真实指板动态音位映射与循环练习管理，为吉他手与教师打造专业成长闭环。
        </p>

        {/* Clean Typographic Feature Separators (Anti-Pill Discipline) */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-gray-500 font-medium">
          <span>AI 多轨音高分轨</span>
          <span aria-hidden="true" className="text-gray-300">·</span>
          <span>双行谱表毫秒级同步</span>
          <span aria-hidden="true" className="text-gray-300">·</span>
          <span>阶梯教学课程体系</span>
          <span aria-hidden="true" className="text-gray-300">·</span>
          <span>把位同步循环陪练</span>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. PART 1: 音频导入中心 (对应 after-sign-in.png: 无页签切换，三合一同一版面) */}
      {/* ========================================================================= */}
      <section id="part-transcription" className="w-full bg-[#f1f5f9]/70 border-t border-b border-gray-200/90 py-14 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          
          {/* User Account Greeting (Matching after-sign-in.png) */}
          <div className="flex flex-col items-center mb-6 text-center">
            {/* Minimal App Emblem from after-sign-in.png */}
            <div className="mb-2">
              <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                <rect x="4" y="11" width="3" height="14" rx="1.5" fill="#18181b" />
                <rect x="11" y="7" width="3.2" height="22" rx="1.6" fill="#18181b" />
                <rect x="18" y="4" width="3.5" height="28" rx="1.75" fill="#18181b" />
                <rect x="25" y="7" width="3.2" height="22" rx="1.6" fill="#18181b" />
                <rect x="32" y="11" width="3" height="14" rx="1.5" fill="#18181b" />
              </svg>
            </div>

            {/* Greeting: e.g. "Good evening, Gardenart" (Clickable to open Account Settings) */}
            <button
              onClick={user.isLoggedIn ? onOpenAccountSettings : onOpenSignIn}
              className="group flex items-center space-x-2 text-xl sm:text-2xl font-bold text-gray-900 tracking-tight hover:text-[#188065] transition-colors cursor-pointer"
              title="点击查看账户信息 (Account Settings)"
            >
              <span>{getGreeting()}, {user.isLoggedIn ? user.name : 'Guest'}</span>
              {user.isLoggedIn && (
                <User className="w-4 h-4 text-gray-400 group-hover:text-[#188065] transition-colors" />
              )}
            </button>

            {/* Direct Quick-Action Links under Greeting for Super Admin */}
            {user.isLoggedIn && (
              <div className="flex items-center space-x-2 mt-2">
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                  <Shield className="w-3 h-3 text-emerald-700" />
                  <span>
                    {user.role === 'super_admin' ? '👑 超级管理员' :
                     user.role === 'institution' ? '🏛️ 教学机构' :
                     user.role === 'teacher' ? '🎸 认证教师' : '🎓 学员'}
                  </span>
                </span>
                
                <button
                  onClick={() => onOpenCMS('curriculum')}
                  className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                >
                  {user.role === 'student' ? '我的课程大纲与跟练' : user.role === 'trial_guest' ? '基础课程大纲' : '课程大纲管理'}
                </button>
                <span className="text-gray-300">·</span>

                {(user.role === 'super_admin' || user.role === 'institution') && (
                  <>
                    <button
                      onClick={() => onOpenCMS('users')}
                      className="text-xs font-semibold text-indigo-800 hover:text-indigo-950 underline cursor-pointer"
                    >
                      用户管理
                    </button>
                    <span className="text-gray-300">·</span>
                  </>
                )}

                <button
                  onClick={onOpenAccountSettings}
                  className="text-xs font-semibold text-gray-600 hover:text-gray-900 underline cursor-pointer"
                >
                  账户设置
                </button>
              </div>
            )}
          </div>

          {/* Centered Integrated Audio Import Box (Matching after-sign-in.png) */}
          <div id="audio-import-box" className="w-full max-w-[480px]">
            <div className="bg-[#18826c] rounded-2xl p-6 sm:p-7 shadow-2xl border-4 border-[#126856] text-white">
              
              {/* TOP BLOCK: File Drag & Drop + Upload Audio Button */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-xl py-8 px-4 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  isDraggingFile
                    ? 'border-emerald-200 bg-[#126e5a]/80 scale-101'
                    : 'border-[#30a890] hover:border-emerald-200 bg-[#136d59]/50 hover:bg-[#136d59]/75'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="audio/*,video/*,.mp3,.wav,.m4a,.flac,.mp4"
                  className="hidden"
                />

                {/* Upload Arrow Icon matching after-sign-in.png */}
                <div className="mb-4 text-emerald-200 hover:text-white transition-colors">
                  <Upload className="w-7 h-7" strokeWidth={2.4} />
                </div>

                {/* Yellow Upload Button matching after-sign-in.png */}
                <button
                  type="button"
                  className="bg-[#fae69e] hover:bg-[#faeec5] text-gray-900 font-bold px-7 py-2.5 rounded-lg text-xs sm:text-sm shadow-md transition-all mb-2 pointer-events-none"
                >
                  Upload your audio
                </button>

                <p className="text-xs text-emerald-100 font-medium tracking-wide">
                  Or drag and drop here
                </p>
              </div>

              {/* DIVIDER 1: OR */}
              <div className="relative my-4 flex items-center justify-center">
                <div className="border-t border-[#319e87] w-full absolute" />
                <span className="bg-[#18826c] px-3 text-[11px] font-bold text-amber-200/90 uppercase tracking-widest relative">
                  OR
                </span>
              </div>

              {/* MIDDLE BLOCK: YouTube, Instagram, or TikTok URL Input */}
              <form onSubmit={handleUrlSubmit} className="relative">
                <div className="bg-[#157762] border border-[#279f86] rounded-xl px-3 py-2.5 flex items-center space-x-2 focus-within:ring-2 focus-within:ring-emerald-300 transition-all">
                  <div className="flex items-center space-x-1.5 text-emerald-200 shrink-0">
                    <Youtube className="w-4 h-4 text-red-400" />
                    <Instagram className="w-3.5 h-3.5 text-pink-300" />
                    {/* TikTok small glyph */}
                    <span className="text-[11px] font-black font-mono text-cyan-200 tracking-tighter">TT</span>
                  </div>

                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="YouTube, Instagram, or TikTok URL"
                    className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-emerald-200/80 focus:outline-none"
                  />

                  {urlInput.trim() && (
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      Go
                    </button>
                  )}
                </div>
              </form>

              {/* DIVIDER 2: OR */}
              <div className="relative my-4 flex items-center justify-center">
                <div className="border-t border-[#319e87] w-full absolute" />
                <span className="bg-[#18826c] px-3 text-[11px] font-bold text-amber-200/90 uppercase tracking-widest relative">
                  OR
                </span>
              </div>

              {/* BOTTOM BLOCK: Record Audio Button */}
              <button
                type="button"
                onClick={toggleRecording}
                className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-md ${
                  isRecording
                    ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                    : 'bg-[#105646] hover:bg-[#0c4638] text-white border border-[#1b735f]'
                }`}
              >
                <Mic className={`w-4 h-4 ${isRecording ? 'text-white' : 'text-emerald-200'}`} />
                <span>
                  {isRecording ? `Recording... (${recordingSeconds}s) Click to Stop` : 'Record Audio'}
                </span>
              </button>

              {/* Direct Demo Launch Bar */}
              <div className="mt-5 pt-3.5 border-t border-[#299881] flex items-center justify-between text-xs">
                <span className="text-emerald-100 font-medium">即刻试听体验：</span>
                <button
                  type="button"
                  onClick={() => onOpenDemo(MACAROON_5_SCORE)}
                  className="flex items-center space-x-1 text-amber-200 hover:text-white font-bold transition-colors cursor-pointer"
                >
                  <span>试练 Macaroon 5 乐谱</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. PART 2: 课程教学管理 */}
      {/* ========================================================================= */}
      <section id="part-curriculum" className="w-full py-16 px-4 sm:px-8 max-w-4xl mx-auto text-center">
        <div className="text-xs font-mono font-bold text-emerald-800 uppercase tracking-wider mb-2">
          Part 02 · Curriculum &amp; Practice Management
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight mb-3">
          吉他课程教学与智能练习管理
        </h2>
        <p className="text-xs sm:text-sm text-gray-600 max-w-2xl mx-auto leading-relaxed mb-4">
          结合体系化阶梯进阶课程，打通学员每日练琴打卡、循环慢速练习，以及教师作业分发与音视频批注。
        </p>

        {/* Dynamic buttons for all roles to open Curriculum */}
        <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => onOpenCMS('curriculum')}
            className="inline-flex items-center space-x-2 px-5 py-2.5 bg-[#188065] hover:bg-[#136a53] text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>
              {user.role === 'student'
                ? '查看我的吉他课纲与 13 章节跟练'
                : user.role === 'trial_guest'
                ? '浏览初级吉他基础课纲 (免费开放)'
                : '进入课程大纲管理与编排 (CMS)'}
            </span>
          </button>

          {(user.role === 'super_admin' || user.role === 'institution') && (
            <button
              onClick={() => onOpenCMS('users')}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-2xs cursor-pointer"
            >
              <Users className="w-4 h-4 text-emerald-700" />
              <span>进入用户权限与教务关系管理</span>
            </button>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. BOTTOM CTA BANNER (已取消‘开启吉他练习工作台’，退出登录点击跳转登录) */}
      {/* ========================================================================= */}
      <section className="w-full bg-white border-t border-gray-200 py-12 px-4 sm:px-8 text-center transition-colors">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-950 mb-2">
            准备好拿上手中的吉他了吗？
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 max-w-xl mb-6">
            进入互动乐谱工作台：五线谱/六线谱对照、真实把位亮起、原声视频同步、节拍器与 AB 循环变速，随时进入专注心流。
          </p>

          <div className="flex items-center justify-center">
            {/* 未登录情况下点击跳转登录，已登录情况下进入乐谱库 */}
            <button
              onClick={user.isLoggedIn ? onOpenLibrary : onOpenSignIn}
              className="flex items-center space-x-2 px-6 py-3 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 shadow-2xs transition-all hover:scale-102 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-emerald-600" />
              <span>浏览全部乐谱库</span>
            </button>
          </div>
        </div>
      </section>

      {/* 6. CLEAN FOOTER */}
      <footer className="w-full border-t border-gray-200 bg-[#f8fafc] py-6 px-4 sm:px-8 text-center text-xs text-gray-500 transition-colors">
        <div className="flex flex-col sm:flex-row items-center justify-between max-w-5xl mx-auto gap-3">
          <GuitarMateLogo size="sm" variant="light" />
          <div className="flex items-center space-x-4 text-[11px]">
            <span>AI 音频吉他扒谱引擎</span>
            <span aria-hidden="true">·</span>
            <span>互动吉他把位练习</span>
            <span aria-hidden="true">·</span>
            <span>名师课程教学体系</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">&copy; 2026 GuitarMate Studio</span>
        </div>
      </footer>

    </div>
  );
};
