import React, { useState } from 'react';
import { 
  Check, 
  Sparkles, 
  Building2, 
  ArrowLeft, 
  ShieldCheck, 
  Zap, 
  HelpCircle,
  FileMusic,
  Crown,
  X
} from 'lucide-react';
import { PricingBillingCycle, PricingPlan } from '../types/pricing';
import { backendService } from '../utils/backendService';
import { UserProfile } from '../types/auth';
import { ContactUsModal } from './ContactUsModal';
import { GuitarMateLogo } from './GuitarMateLogo';

interface PricingPlansViewProps {
  currentUser?: UserProfile;
  isModal?: boolean;
  onClose?: () => void;
  onSelectPlan?: (planId: PricingPlan['id']) => void;
}

export const PricingPlansView: React.FC<PricingPlansViewProps> = ({
  currentUser,
  isModal = false,
  onClose,
  onSelectPlan,
}) => {
  const [billingCycle, setBillingCycle] = useState<PricingBillingCycle>('monthly');
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const handlePlanAction = (plan: PricingPlan) => {
    if (plan.id === 'enterprise') {
      setIsContactModalOpen(true);
      return;
    }

    if (onSelectPlan) {
      onSelectPlan(plan.id);
    } else {
      setSuccessToast(`已为您成功选择 ${plan.title}！已更新您的套餐权限。`);
      setTimeout(() => setSuccessToast(null), 3500);
    }
  };

  const content = (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 font-sans">
      
      {/* Toast feedback */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-800 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center space-x-2 animate-in slide-in-from-top">
          <Check className="w-4 h-4 text-emerald-300" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header section */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold tracking-wide">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>Simple, Transparent Pricing for Every Guitarist</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-gray-950 tracking-tight">
          选择适合您的吉他 AI 教学与扒谱方案
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
          从免登录尝鲜到独立音乐人创作，再到连锁音乐艺术学院，GuitarMate 赋予每一次演奏精准的可视化与教学赋能。
        </p>

        {/* Monthly / Yearly Toggle (Save 15%) */}
        <div className="pt-4 flex items-center justify-center">
          <div className="bg-gray-100 p-1 rounded-xl flex items-center space-x-1 border border-gray-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-white text-gray-950 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              按月付费 (Monthly)
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-[#188065] text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>按年付费 (Yearly)</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider ${
                billingCycle === 'yearly' ? 'bg-amber-300 text-amber-950' : 'bg-emerald-100 text-emerald-800'
              }`}>
                Save 15%
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Columns Side-by-Side Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch pt-2">
        {backendService.getPricingPlans().map((plan) => {
          const isPro = plan.isPopular;
          const isEnterprise = plan.id === 'enterprise';
          const isUserCurrent = currentUser && (
            (plan.id === 'free' && (currentUser.plan === 'free' || currentUser.plan === 'trial')) ||
            (plan.id === 'plus' && currentUser.plan === 'plus') ||
            (plan.id === 'pro' && currentUser.plan === 'pro') ||
            (plan.id === 'enterprise' && (currentUser.plan === 'enterprise' || currentUser.role === 'super_admin' || currentUser.role === 'institution'))
          );

          const displayPrice = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
          const displayPeriod = billingCycle === 'yearly' ? plan.periodYearly : plan.periodMonthly;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl flex flex-col justify-between transition-all ${
                isPro
                  ? 'bg-linear-to-b from-[#f3faf7] via-white to-white border-2 border-[#188065] shadow-xl shadow-emerald-900/5 ring-1 ring-[#188065]/20 md:-translate-y-1'
                  : isEnterprise
                  ? 'bg-white border border-gray-300 shadow-sm hover:border-gray-400'
                  : 'bg-white border border-gray-200 shadow-2xs hover:border-gray-300'
              }`}
            >
              {/* Pro Badge */}
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-linear-to-r from-emerald-600 to-teal-700 text-white text-[11px] font-bold px-3 py-0.5 rounded-full shadow-xs uppercase tracking-wider flex items-center space-x-1">
                  <Crown className="w-3 h-3 text-amber-300" />
                  <span>{plan.badge || 'Most Popular'}</span>
                </div>
              )}

              {/* Card Header & Price */}
              <div className="p-6 space-y-4">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-800">
                    {plan.planTier}
                  </div>
                  <h3 className="text-xl font-black text-gray-950 tracking-tight mt-0.5">
                    {plan.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 min-h-[34px] leading-relaxed">
                    {plan.subtitle}
                  </p>
                </div>

                {/* Price Display */}
                <div className="pt-2 pb-1 border-b border-gray-100">
                  <div className="flex items-baseline space-x-1">
                    <span className="text-3xl sm:text-4xl font-black text-gray-950 tracking-tight">
                      {displayPrice}
                    </span>
                    <span className="text-xs font-semibold text-gray-500">
                      {displayPeriod}
                    </span>
                  </div>
                  {billingCycle === 'yearly' && plan.savingsBadge && (
                    <div className="text-[10px] text-emerald-700 font-bold mt-1">
                      年付立享优惠折扣，每月自动刷新额度
                    </div>
                  )}
                </div>

                {/* Features Specifications List */}
                <div className="space-y-3 pt-2 text-xs text-gray-700">
                  {/* 1. Single audio limit */}
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-[#188065] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-gray-500 text-[11px] block">单次转录时长上限</span>
                      <strong className="text-gray-900 font-bold">{plan.maxSingleTranscriptionDuration}</strong>
                    </div>
                  </div>

                  {/* 2. Monthly Credits */}
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-[#188065] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-gray-500 text-[11px] block">每月 Credits 额度</span>
                      <strong className="text-emerald-800 font-bold">{plan.monthlyCredits}</strong>
                    </div>
                  </div>

                  {/* 3. Equivalent Audio Minutes */}
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-[#188065] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-gray-500 text-[11px] block">每月等效时长</span>
                      <strong className="text-gray-900 font-bold">{plan.equivalentAudioMinutes}</strong>
                    </div>
                  </div>

                  {/* 4. Export Formats */}
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-[#188065] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-gray-500 text-[11px] block">乐谱专业格式导出</span>
                      <strong className="text-gray-900 font-bold">{plan.exportFormats}</strong>
                    </div>
                  </div>

                  {/* 5. Curriculum Access */}
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-[#188065] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-gray-500 text-[11px] block">课程大纲进入权</span>
                      <strong className="text-gray-900 font-bold">{plan.curriculumAccess}</strong>
                    </div>
                  </div>

                  {/* 6. AI Privacy Opt Out */}
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-[#188065] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-gray-500 text-[11px] block">AI 模型训练隐私</span>
                      <strong className="text-gray-900 font-bold">{plan.aiModelTrainingPrivacy}</strong>
                    </div>
                  </div>

                  {/* 7. Support & API */}
                  <div className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-[#188065] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-gray-500 text-[11px] block">技术支持与扩展</span>
                      <strong className="text-gray-900 font-bold">{plan.supportLevel}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button at bottom */}
              <div className="p-6 pt-0">
                <button
                  type="button"
                  onClick={() => handlePlanAction(plan)}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center space-x-1.5 shadow-2xs ${
                    isUserCurrent
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 cursor-default'
                      : isPro
                      ? 'bg-[#188065] hover:bg-[#136a53] text-white shadow-md active:scale-98'
                      : isEnterprise
                      ? 'bg-gray-900 hover:bg-black text-white active:scale-98'
                      : 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 active:scale-98'
                  }`}
                >
                  <span>
                    {isUserCurrent ? '✓ 当前正在使用的套餐' : plan.ctaText}
                  </span>
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* Enterprise Contact Modal */}
      <ContactUsModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        initialEmail={currentUser?.email || ''}
        initialName={currentUser?.name || ''}
      />

    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs font-sans overflow-y-auto animate-in fade-in select-none">
        <div className="relative w-full max-w-7xl bg-white rounded-3xl shadow-2xl border border-gray-100 my-auto overflow-hidden max-h-[92vh] flex flex-col">
          {/* Modal Header */}
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <GuitarMateLogo size="sm" variant="light" />
              <div className="h-4 w-px bg-gray-200" />
              <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                GuitarMate Pricing &amp; Credits Plans
              </span>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Modal Scrollable Body */}
          <div className="flex-1 overflow-y-auto">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900 flex flex-col select-none antialiased">
      {/* Top bar for standalone page */}
      <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-gray-200/90 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center space-x-4">
          <GuitarMateLogo size="md" variant="light" />
          {onClose && (
            <>
              <div className="h-4 w-px bg-gray-200 hidden sm:block" />
              <button
                type="button"
                onClick={onClose}
                className="flex items-center space-x-1.5 text-xs font-semibold text-gray-600 hover:text-emerald-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>返回</span>
              </button>
            </>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {currentUser && (
            <span className="text-xs text-gray-600 hidden sm:inline">
              当前用户: <strong className="text-gray-900">{currentUser.name}</strong> ({currentUser.credits} Credits)
            </span>
          )}
        </div>
      </header>

      <main className="flex-1">
        {content}
      </main>
    </div>
  );
};
