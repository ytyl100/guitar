import React, { useState } from 'react';
import { 
  Download, 
  Share2, 
  HelpCircle, 
  Sparkles, 
  Edit3, 
  Eye, 
  ChevronDown, 
  Music, 
  FileText, 
  Code2, 
  Check, 
  Disc,
  Star,
  FolderOpen,
  Home,
  Sun,
  Moon,
  ArrowLeft
} from 'lucide-react';
import { ScoreData } from '../types/music';
import { GuitarMateLogo } from './GuitarMateLogo';
import { CourseReturnContext } from '../utils/scoreResolver';
import { NotificationBell } from './NotificationBell';

interface NavbarProps {
  score: ScoreData;
  isEditMode: boolean;
  onToggleEditMode: (mode: boolean) => void;
  onOpenArchitectureModal: () => void;
  onOpenDownloadModal: () => void;
  onNewTranscription: () => void;
  onOpenLibrary: () => void;
  onGoHome: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  courseReturnContext?: CourseReturnContext | null;
  onReturnToCourse?: () => void;
  onOpenCourse?: (courseId?: string) => void;
  onOpenScore?: (scoreId?: string) => void;
  onOpenPricing?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  score,
  isEditMode,
  onToggleEditMode,
  onOpenArchitectureModal,
  onOpenDownloadModal,
  onNewTranscription,
  onOpenLibrary,
  onGoHome,
  theme = 'light',
  onToggleTheme,
  courseReturnContext,
  onReturnToCourse,
  onOpenCourse,
  onOpenScore,
  onOpenPricing,
}) => {
  const [rating, setRating] = useState(4);
  const [hoverRating, setHoverRating] = useState(0);
  const [showShareToast, setShowShareToast] = useState(false);

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2000);
  };

  return (
    <header className="h-14 border-b border-gray-200 bg-white px-2 sm:px-6 flex items-center justify-between sticky top-0 z-30 select-none shadow-xs">
      {/* Left: Brand & Navigation */}
      <div className="flex items-center space-x-1.5 sm:space-x-3">
        <button 
          onClick={onGoHome}
          className="transition-colors cursor-pointer"
          title="返回首页音频录入"
        >
          <GuitarMateLogo size="sm" />
        </button>

        {onOpenPricing && (
          <button
            onClick={onOpenPricing}
            className="flex items-center space-x-1 px-2 py-1 text-xs font-bold text-gray-700 hover:text-emerald-800 bg-gray-50 hover:bg-emerald-50 border border-gray-200 rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95"
            title="查看 Pricing 商业计划与额度"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Pricing</span>
          </button>
        )}

        <div className="h-4 w-px bg-gray-300 hidden sm:block"></div>

        {/* Back to Course Chapters Button (High Priority when navigated from curriculum) */}
        {courseReturnContext && onReturnToCourse && (
          <button
            onClick={onReturnToCourse}
            className="flex items-center space-x-1 sm:space-x-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#188065] hover:bg-[#136a53] border border-emerald-600 rounded-lg transition-all shadow-xs cursor-pointer active:scale-95 animate-in fade-in"
            title={`返回课程章节列表：${courseReturnContext.courseTitle} - ${courseReturnContext.chapterTitle}`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回课程章节</span>
          </button>
        )}

        {/* Back to Home / Audio Ingestion */}
        <button
          onClick={onGoHome}
          className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 text-xs font-bold text-gray-700 hover:text-emerald-800 bg-gray-100 hover:bg-emerald-50 border border-gray-200 rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95"
          title="返回首页音频录入页面"
        >
          <Home className="w-3.5 h-3.5 text-emerald-700" />
          <span className="hidden sm:inline">首页</span>
        </button>

        {/* Back to Library Button */}
        <button
          onClick={onOpenLibrary}
          className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95"
          title="返回曲谱列表"
        >
          <FolderOpen className="w-3.5 h-3.5 text-emerald-700" />
          <span>曲谱库</span>
        </button>

        {/* Current Score Info */}
        <div className="hidden md:flex items-center space-x-2 text-sm">
          <span className="font-semibold text-gray-800 truncate max-w-[220px] xl:max-w-md">
            {score.title}
          </span>
          <div className="flex items-center text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors px-2 py-0.5 rounded cursor-pointer">
            <span>Difficulty: <strong className="text-gray-700 font-medium">Original</strong></span>
            <ChevronDown className="w-3 h-3 ml-1 text-gray-500" />
          </div>
        </div>
      </div>

      {/* Middle: Rating feedback matching screenshot */}
      <div className="hidden lg:flex items-center space-x-2 text-xs text-gray-500">
        <span>How did we do?</span>
        <div className="flex items-center space-x-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(star)}
              className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  (hoverRating || rating) >= star
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Demucs Backend Architecture Button (Desktop & Tablet) */}
        <button
          onClick={onOpenArchitectureModal}
          className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-all cursor-pointer shadow-xs"
          title="View Demucs v4 + FFmpeg stem separation pipeline design"
        >
          <Sparkles className="w-3.5 h-3.5 text-teal-600 animate-pulse" />
          <span>AI Architecture</span>
        </button>

        {/* View / Edit Mode Switcher (Matching transcription screenshot top-right) */}
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md border border-gray-200 text-xs font-medium">
          <button
            onClick={() => onToggleEditMode(true)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-all cursor-pointer ${
              isEditMode
                ? 'bg-gray-900 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Edit3 className="w-3 h-3" />
            <span>Edit</span>
          </button>
          <button
            onClick={() => onToggleEditMode(false)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-all cursor-pointer ${
              !isEditMode
                ? 'bg-gray-900 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>View</span>
          </button>
        </div>

        {/* Download Button */}
        <button
          onClick={onOpenDownloadModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-md transition-all shadow-xs cursor-pointer active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download</span>
        </button>

        {/* Share Button with toast */}
        <div className="relative">
          <button
            onClick={handleShare}
            className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100 border border-gray-300 rounded-md transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-gray-500" />
            <span>Share</span>
          </button>
          {showShareToast && (
            <div className="absolute right-0 top-full mt-1.5 px-2.5 py-1 bg-gray-900 text-white text-[11px] rounded-lg shadow-lg whitespace-nowrap animate-in fade-in">
              Score link copied!
            </div>
          )}
        </div>

        {/* Day / Night Theme Switcher */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer border border-gray-200"
            title={theme === 'light' ? '切换为夜间深色模式' : '切换为日间明亮模式'}
          >
            {theme === 'light' ? <Moon className="w-3.5 h-3.5 text-gray-600" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
          </button>
        )}

        {/* Bell Notification in Navbar top right menu */}
        <NotificationBell
          onOpenCourse={onOpenCourse}
          onOpenScore={onOpenScore}
        />
      </div>
    </header>
  );
};
