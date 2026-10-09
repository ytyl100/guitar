import React, { useState } from 'react';
import { AlertCircle, Zap, ArrowRight, ShieldAlert, Sparkles, CheckCircle2, X } from 'lucide-react';
import { UserProfile } from '../types/auth';
import { backendService } from '../utils/backendService';

interface CreditsExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  type: 'transcription' | 'curriculum_publish';
  requiredCredits: number;
  onOpenPricing: () => void;
  onRefreshUser?: () => void;
}

export const CreditsExceededModal: React.FC<CreditsExceededModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  type,
  requiredCredits,
  onOpenPricing,
  onRefreshUser,
}) => {
  const [isApplying, setIsApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  if (!isOpen) return null;

  const currentCredits = currentUser.credits || 0;
  const shortage = Math.max(0, requiredCredits - currentCredits);
  const isTeacherOrInstitution = currentUser.role === 'teacher' || currentUser.role === 'institution';

  const handleApplyRecovery = () => {
    setIsApplying(true);
    backendService.applyCreditRecovery(
      currentUser.id,
      currentUser.name,
      currentUser.email,
      currentUser.role as 'teacher' | 'institution',
      type === 'curriculum_publish'
        ? `发布课程大纲版本需要消耗 15 点，当前余额仅剩 ${currentCredits} 点。`
        : `音频扒谱转录需要 ${requiredCredits} 点，当前余额仅剩 ${currentCredits} 点。`
    );

    setTimeout(() => {
      setIsApplying(false);
      setHasApplied(true);
      if (onRefreshUser) onRefreshUser();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans animate-in fade-in select-none">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 text-gray-900 overflow-hidden">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2.5 text-amber-800 font-bold text-xs uppercase tracking-wider mb-2">
          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-gray-950">
              Credits 额度不足提醒
            </h3>
            <span className="text-[11px] text-gray-500 font-normal">Pre-flight Balance Check</span>
          </div>
        </div>

        <div className="my-4 p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-2 text-xs text-gray-800">
          <p className="leading-relaxed">
            {type === 'curriculum_publish'
              ? '发布或更新课程大纲单次需扣除 15 点 Credits，用于全网版本同步与乐谱切片校验。'
              : `本次音频 AI 转录预计需消耗 ${requiredCredits} 点 Credits (计费基准: 10 Credits / 分钟)。`}
          </p>

          <div className="pt-2 grid grid-cols-3 gap-2 text-center">
            <div className="bg-white p-2 rounded-lg border border-amber-200">
              <span className="text-[10px] text-gray-500 block">当前可用余额</span>
              <strong className="text-sm font-black text-gray-900 font-mono">{currentCredits} 点</strong>
            </div>
            <div className="bg-white p-2 rounded-lg border border-amber-200">
              <span className="text-[10px] text-gray-500 block">本次所需点数</span>
              <strong className="text-sm font-black text-amber-800 font-mono">{requiredCredits} 点</strong>
            </div>
            <div className="bg-white p-2 rounded-lg border border-red-200 bg-red-50/30">
              <span className="text-[10px] text-red-600 block">额度差额</span>
              <strong className="text-sm font-black text-red-600 font-mono">-{shortage} 点</strong>
            </div>
          </div>
        </div>

        {/* Action recommendations */}
        <div className="space-y-3 pt-1">
          {isTeacherOrInstitution ? (
            /* Teacher or Institution: One-click Apply Recovery */
            <div className="space-y-2">
              <p className="text-xs text-gray-600 leading-snug">
                作为认证教师或合作教学机构，点数不足时可直接向平台超级管理员一键申领恢复 <strong>5000 点</strong> 教学额度。
              </p>

              {!hasApplied ? (
                <button
                  type="button"
                  disabled={isApplying}
                  onClick={handleApplyRecovery}
                  className="w-full flex items-center justify-center space-x-1.5 py-2.5 bg-[#188065] hover:bg-[#136a53] disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isApplying ? '正在提交申请...' : '一键向管理员申请恢复 5000 点额度'}</span>
                </button>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>已成功提交恢复 5000 点申请，超管审批通过后将即时自动到账！</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPricing();
                }}
                className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                查看 Pricing 套餐详情
              </button>
            </div>
          ) : (
            /* Student / Free / Plus: Upgrade Plan or Start Trial */
            <div className="space-y-2">
              <p className="text-xs text-gray-600 leading-snug">
                升级至 <strong>Plus (600 点/月)</strong> 或 <strong>Pro 学员推荐套餐 (3000 点/月)</strong>，即可解锁更长单次转录时长与全格式乐谱导出。
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPricing();
                }}
                className="w-full flex items-center justify-center space-x-1.5 py-2.5 bg-[#188065] hover:bg-[#136a53] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>立即升级套餐与充值额度 (View Pricing Plans)</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                暂不充值，稍后再说
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
