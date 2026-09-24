import React, { useState } from 'react';
import { UserProfile, PaymentRecord, Course } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Award,
  Calendar,
  Clock,
  Music2,
  BookOpen,
  CreditCard,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  FileCode,
  Smartphone,
  Sparkles,
  Sun,
  Moon,
  Languages,
  Sliders,
} from 'lucide-react';

interface ProfileTabProps {
  userProfile: UserProfile;
  paymentRecords: PaymentRecord[];
  currentCourse: Course | null;
  onResumeCourse: () => void;
  onOpenDocModal: () => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  userProfile,
  paymentRecords,
  currentCourse,
  onResumeCourse,
  onOpenDocModal,
}) => {
  const { theme, setTheme, isDark } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [showOrderModal, setShowOrderModal] = useState<PaymentRecord | null>(null);

  return (
    <div
      className={`flex flex-col h-full overflow-y-auto px-4 pb-28 pt-4 select-none transition-colors duration-200 ${
        isDark ? 'bg-[#101217] text-white' : 'bg-slate-50 text-zinc-900'
      }`}
    >
      {/* User Header Profile Card */}
      <div
        className={`relative rounded-3xl border p-5 mb-5 shadow-xl overflow-hidden transition-colors duration-200 ${
          isDark
            ? 'bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border-zinc-800'
            : 'bg-white border-zinc-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={userProfile.avatar}
              alt={userProfile.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-emerald-500 shadow-md"
            />
            <span
              className={`absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 rounded-full border-2 ${
                isDark ? 'border-zinc-950' : 'border-white'
              }`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2
                className={`text-lg font-black truncate ${
                  isDark ? 'text-white' : 'text-zinc-900'
                }`}
              >
                {userProfile.name}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-500 dark:text-amber-300 text-[10px] font-bold shrink-0">
                {userProfile.memberStatus}
              </span>
            </div>
            <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {t('profile.validUntil')}：{userProfile.vipExpiryDate}
            </p>
          </div>
        </div>

        {/* Practice Metrics Grid */}
        <div
          className={`grid grid-cols-4 gap-2 mt-5 pt-4 border-t ${
            isDark ? 'border-zinc-800/80' : 'border-zinc-100'
          }`}
        >
          <div className="flex flex-col items-center">
            <span
              className={`text-xl font-black font-mono ${
                isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              {userProfile.daysStreak}
            </span>
            <span className={`text-[10px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {t('profile.streak')}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xl font-black text-emerald-500 font-mono">
              {userProfile.totalPracticeMins}
            </span>
            <span className={`text-[10px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {t('profile.practiceMins')}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xl font-black text-blue-500 font-mono">
              {userProfile.masteredChordsCount}
            </span>
            <span className={`text-[10px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {t('profile.masteredChords')}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xl font-black text-amber-500 font-mono">
              {userProfile.completedSongsCount}
            </span>
            <span className={`text-[10px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {t('profile.completedSongs')}
            </span>
          </div>
        </div>
      </div>

      {/* App Appearance & Language Preferences Section */}
      <div
        className={`rounded-2xl p-4 border mb-5 shadow-sm transition-colors duration-200 ${
          isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="flex items-center gap-1.5 mb-3">
          <Sliders size={14} className="text-emerald-500" />
          <h3
            className={`text-xs font-bold uppercase tracking-wider ${
              isDark ? 'text-zinc-400' : 'text-zinc-600'
            }`}
          >
            {t('profile.settings')}
          </h3>
        </div>

        {/* 1. Theme Setting Toggle (白天 / 黑夜) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between py-1">
            <div>
              <span className={`text-xs font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                {t('profile.themeSetting')}
              </span>
              <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {isDark ? t('profile.dark') : t('profile.light')}
              </p>
            </div>
            <div
              className={`flex items-center p-1 rounded-xl border ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-300'
              }`}
            >
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  !isDark
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Sun size={13} className="text-amber-500" />
                <span>白天</span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  isDark
                    ? 'bg-zinc-800 text-white shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <Moon size={13} className="text-indigo-400" />
                <span>黑夜</span>
              </button>
            </div>
          </div>

          <div className={`h-[1px] ${isDark ? 'bg-zinc-800/80' : 'bg-zinc-100'}`} />

          {/* 2. Language Setting Toggle (中文 / EN) */}
          <div className="flex items-center justify-between py-1">
            <div>
              <span className={`text-xs font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                {t('profile.langSetting')}
              </span>
              <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {language === 'zh' ? '当前：简体中文' : 'Current: English'}
              </p>
            </div>
            <div
              className={`flex items-center p-1 rounded-xl border ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-300'
              }`}
            >
              <button
                onClick={() => setLanguage('zh')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  language === 'zh'
                    ? isDark
                      ? 'bg-emerald-500 text-black shadow-xs'
                      : 'bg-emerald-500 text-white shadow-xs'
                    : isDark
                    ? 'text-zinc-400 hover:text-white'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                中文
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  language === 'en'
                    ? isDark
                      ? 'bg-emerald-500 text-black shadow-xs'
                      : 'bg-emerald-500 text-white shadow-xs'
                    : isDark
                    ? 'text-zinc-400 hover:text-white'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Access: System Architecture & Requirements Doc */}
      <div
        onClick={onOpenDocModal}
        className="mb-5 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 cursor-pointer flex items-center justify-between transition active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
            <FileCode size={20} />
          </div>
          <div>
            <h4
              className={`text-xs font-bold flex items-center gap-1.5 ${
                isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              <span>小程序构思方案与技术架构说明</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-black text-[9px] font-extrabold">
                核心答复
              </span>
            </h4>
            <p
              className={`text-[11px] mt-0.5 ${
                isDark ? 'text-emerald-200/70' : 'text-emerald-700'
              }`}
            >
              点击查看：小程序名称、最核心页面及功能、主要数据结构
            </p>
          </div>
        </div>
        <ChevronRight size={18} className="text-emerald-500 shrink-0" />
      </div>

      {/* Current Enrolled Course Learning Progress */}
      {currentCourse && (
        <div
          className={`rounded-2xl p-4 border mb-5 shadow-sm transition-colors duration-200 ${
            isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-zinc-200'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3
              className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isDark ? 'text-zinc-400' : 'text-zinc-600'
              }`}
            >
              <BookOpen size={14} className="text-emerald-500" />
              <span>{t('profile.currentCourse')}</span>
            </h3>
            <span className="text-xs font-mono text-emerald-500 font-bold">
              1 / {currentCourse.totalSteps}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <img
              src={currentCourse.coverImage}
              alt={currentCourse.title}
              className="w-14 h-14 rounded-xl object-cover border border-zinc-700/50"
            />
            <div className="min-w-0 flex-1">
              <h4
                className={`text-sm font-bold truncate ${
                  isDark ? 'text-white' : 'text-zinc-900'
                }`}
              >
                {currentCourse.title}
              </h4>
              <p
                className={`text-xs truncate mt-0.5 ${
                  isDark ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
                {currentCourse.subtitle}
              </p>
              <div
                className={`w-full h-1.5 rounded-full overflow-hidden mt-2 ${
                  isDark ? 'bg-zinc-800' : 'bg-zinc-100'
                }`}
              >
                <div className="bg-emerald-500 h-full w-[8%]" />
              </div>
            </div>
          </div>

          <button
            onClick={onResumeCourse}
            className={`mt-4 w-full py-2.5 rounded-xl text-emerald-500 font-bold text-xs flex items-center justify-center gap-1 transition ${
              isDark ? 'bg-zinc-800 hover:bg-zinc-750' : 'bg-zinc-100 hover:bg-zinc-200'
            }`}
          >
            <span>{t('profile.resumeCourse')}：Tune your guitar</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Payment Records Section */}
      <div
        className={`rounded-2xl p-4 border mb-5 shadow-sm transition-colors duration-200 ${
          isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <h3
            className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isDark ? 'text-zinc-400' : 'text-zinc-600'
            }`}
          >
            <CreditCard size={14} className="text-emerald-500" />
            <span>{t('profile.orders')}</span>
          </h3>
          <span className="text-[11px] text-zinc-400">微信支付商户直连</span>
        </div>

        <div className="space-y-2.5">
          {paymentRecords.map((rec) => (
            <div
              key={rec.id}
              onClick={() => setShowOrderModal(rec)}
              className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                isDark
                  ? 'bg-zinc-950/60 border-zinc-850 hover:border-zinc-700'
                  : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <div className="min-w-0">
                <h5
                  className={`text-xs font-bold truncate ${
                    isDark ? 'text-white' : 'text-zinc-900'
                  }`}
                >
                  {rec.title}
                </h5>
                <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono mt-0.5">
                  <span>{rec.date}</span>
                  <span>•</span>
                  <span>{rec.channel}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`text-sm font-black font-mono ${
                    isDark ? 'text-white' : 'text-zinc-900'
                  }`}
                >
                  ¥{rec.amount.toFixed(2)}
                </span>
                <span className="block text-[10px] text-emerald-500 font-semibold">
                  支付成功
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Order Detail Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-3xl p-5 max-w-sm w-full shadow-2xl ${
              isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'
            }`}
          >
            <div
              className={`flex items-center justify-between pb-3 border-b ${
                isDark ? 'border-zinc-800' : 'border-zinc-100'
              }`}
            >
              <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                微信支付电子账单
              </h4>
              <button
                onClick={() => setShowOrderModal(null)}
                className={`p-1 rounded-full ${
                  isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                ✕
              </button>
            </div>

            <div className="my-5 text-center">
              <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                支付金额
              </span>
              <div
                className={`text-3xl font-black font-mono mt-1 ${
                  isDark ? 'text-white' : 'text-zinc-900'
                }`}
              >
                ¥{showOrderModal.amount.toFixed(2)}
              </div>
              <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 text-xs font-semibold">
                <CheckCircle2 size={12} /> 支付完成
              </div>
            </div>

            <div
              className={`rounded-2xl p-3.5 space-y-2 text-xs font-mono ${
                isDark
                  ? 'bg-zinc-950 text-zinc-300'
                  : 'bg-zinc-100 text-zinc-700'
              }`}
            >
              <div className="flex justify-between">
                <span className="text-zinc-400">商品名称:</span>
                <span className="font-sans font-medium">{showOrderModal.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">商户单号:</span>
                <span>{showOrderModal.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">支付时间:</span>
                <span>{showOrderModal.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">支付方式:</span>
                <span>{showOrderModal.channel}</span>
              </div>
            </div>

            <button
              onClick={() => setShowOrderModal(null)}
              className={`mt-5 w-full py-2.5 rounded-xl text-xs font-bold transition ${
                isDark
                  ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                  : 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300'
              }`}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
