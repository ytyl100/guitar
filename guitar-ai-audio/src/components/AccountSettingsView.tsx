import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  Calendar, 
  Sparkles, 
  CreditCard, 
  Globe, 
  Check, 
  ArrowLeft,
  LogOut,
  Shield,
  Building2,
  GraduationCap,
  Award,
  BookOpen,
  Phone,
  MapPin,
  MessageSquare,
  Lock,
  Zap,
  Edit2,
  AlertCircle,
  CheckCircle2,
  Sliders
} from 'lucide-react';
import { GuitarMateLogo } from './GuitarMateLogo';
import { UserProfile, UserRole } from '../types/auth';
import { PricingPlansView } from './PricingPlansView';
import { backendService } from '../utils/backendService';

interface AccountSettingsViewProps {
  user: UserProfile;
  onUpdateUser: (user: UserProfile) => void;
  onLogout: () => void;
  onGoHome: () => void;
  onOpenLibrary: () => void;
  onSwitchUserRole?: (role: UserRole) => void;
  onOpenCMS?: () => void;
}

export const AccountSettingsView: React.FC<AccountSettingsViewProps> = ({
  user,
  onUpdateUser,
  onLogout,
  onGoHome,
  onOpenLibrary,
  onSwitchUserRole,
  onOpenCMS,
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState(user.language || 'Automatic');
  const [trialActivated, setTrialActivated] = useState(user.trialActive || false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showPlansModal, setShowPlansModal] = useState(false);

  // Institution / Teacher profile editing (Section 8.5)
  const isInstitutionOrTeacher = user.role === 'institution' || user.role === 'teacher';
  const [isEditingOrgProfile, setIsEditingOrgProfile] = useState(false);
  const [orgName, setOrgName] = useState(user.institutionName || '');
  const [address, setAddress] = useState(user.address || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [wechat, setWechat] = useState(user.wechat || '');
  const [bio, setBio] = useState(user.bio || '');
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  // Credits recovery state
  const [isApplyingRecovery, setIsApplyingRecovery] = useState(false);
  const [recoveryAppliedSuccess, setRecoveryAppliedSuccess] = useState(false);

  // AI Privacy setting (Phase 3)
  const [optOutAi, setOptOutAi] = useState(user.optOutAiTraining ?? true);
  const canOptOutAi = user.plan === 'plus' || user.plan === 'pro' || user.plan === 'enterprise' || user.role === 'super_admin' || user.role === 'teacher' || user.role === 'institution';

  const handleStartTrial = () => {
    setTrialActivated(true);
    const updated: UserProfile = {
      ...user,
      plan: 'trial',
      role: 'trial_guest',
      trialActive: true,
      trialExpiresAt: '2026-10-15',
      credits: 600,
      monthlyCreditQuota: 600,
    };
    onUpdateUser(updated);
    backendService.updateUserProfile(user.id, updated);
  };

  const handleLanguageChange = (lang: string) => {
    setSelectedLanguage(lang);
    const updated = {
      ...user,
      language: lang,
    };
    onUpdateUser(updated);
    backendService.updateUserProfile(user.id, updated);
  };

  const handleToggleAiPrivacy = () => {
    if (!canOptOutAi) {
      setShowPlansModal(true);
      return;
    }
    const nextVal = !optOutAi;
    setOptOutAi(nextVal);
    const updated = {
      ...user,
      optOutAiTraining: nextVal,
    };
    onUpdateUser(updated);
    backendService.updateUserProfile(user.id, updated);
  };

  const handleSaveOrgProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: Partial<UserProfile> = {
      institutionName: orgName,
      address,
      phone,
      wechat,
      bio,
    };
    backendService.updateUserProfile(user.id, updates);
    onUpdateUser({
      ...user,
      ...updates,
    });
    setIsEditingOrgProfile(false);
    setProfileSaveSuccess(true);
    setTimeout(() => setProfileSaveSuccess(false), 3000);
  };

  const handleApplyCreditsRecovery = () => {
    setIsApplyingRecovery(true);
    backendService.applyCreditRecovery(
      user.id,
      user.name,
      user.email,
      user.role as 'teacher' | 'institution',
      `个人配置中心申请恢复 5000 点 Credits 额度。`
    );
    setTimeout(() => {
      setIsApplyingRecovery(false);
      setRecoveryAppliedSuccess(true);
      setTimeout(() => setRecoveryAppliedSuccess(false), 4000);
    }, 400);
  };

  // Quota & credits percentage
  const maxQuota = user.isUnlimitedCredits ? 999999 : (user.monthlyCreditQuota || 600);
  const percentCredits = user.isUnlimitedCredits ? 100 : Math.min(100, Math.round(((user.credits || 0) / maxQuota) * 100));

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900 flex flex-col font-sans select-none antialiased">
      
      {/* Top Header */}
      <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-gray-200/90 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center space-x-4">
          <GuitarMateLogo size="md" variant="light" />
          <div className="h-4 w-px bg-gray-200 hidden sm:block" />
          <button
            onClick={onGoHome}
            className="flex items-center space-x-1.5 text-xs font-semibold text-gray-600 hover:text-emerald-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回首页</span>
          </button>
        </div>

        <div className="flex items-center space-x-3">
          {/* Pricing Plans Direct Button */}
          <button
            onClick={() => setShowPlansModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-gray-800 hover:text-[#188065] bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-2xs transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Pricing 商业套餐</span>
          </button>

          {(user.role === 'super_admin' || user.role === 'institution' || user.role === 'teacher') && onOpenCMS && (
            <button
              onClick={onOpenCMS}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-2xs transition-all cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
              <span>课程大纲管理 (CMS)</span>
            </button>
          )}

          <button
            onClick={onOpenLibrary}
            className="px-3 py-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-2xs transition-all cursor-pointer"
          >
            我的曲谱库
          </button>
          <button
            onClick={onLogout}
            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>退出登录</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[760px] w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        
        {/* Title */}
        <h1 className="text-3xl font-extrabold text-gray-950 tracking-tight">
          Account Settings
        </h1>

        {/* Card 1: Account Information & User Role */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-gray-700" />
              <h2 className="text-sm font-bold text-gray-900">Account Information</h2>
            </div>
            <span className={`text-[11px] font-semibold border rounded-md px-2.5 py-0.5 ${
              user.role === 'super_admin' ? 'bg-purple-100 text-purple-900 border-purple-200' :
              user.role === 'institution' ? 'bg-amber-100 text-amber-900 border-amber-200' :
              user.role === 'teacher' ? 'bg-teal-100 text-teal-900 border-teal-200' :
              user.role === 'student' ? 'bg-indigo-100 text-indigo-900 border-indigo-200' :
              user.role === 'plus' ? 'bg-emerald-100 text-emerald-900 border-emerald-200' :
              'bg-gray-100 text-gray-800 border-gray-200'
            }`}>
              {user.role === 'super_admin' ? '👑 超级管理员 (Platform Master)' :
               user.role === 'institution' ? '🏛️ 教学机构 (Music Academy)' :
               user.role === 'teacher' ? '🎸 认证教师 (Certified Teacher)' :
               user.role === 'student' ? '🎓 挂靠学员 (Pro Student)' : 
               user.role === 'plus' ? '💳 付费订阅用户 (Plus Subscriber)' :
               user.role === 'trial_guest' ? '⏳ 普通试用用户 (14-Day Trial)' : '✉️ 普通注册用户 (Registered User)'}
            </span>
          </div>

          <div className="space-y-2 text-xs text-gray-700 pt-1">
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4 text-gray-400" />
              <span>Email: <strong className="font-semibold text-gray-900">{user.email}</strong></span>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>Member since: <strong className="font-semibold text-gray-900">{user.memberSince}</strong></span>
            </div>
            {user.institutionName && (
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span>所属教学机构: <strong className="font-semibold text-gray-900">{user.institutionName}</strong></span>
              </div>
            )}
            {user.teacherName && (
              <div className="flex items-center space-x-2">
                <GraduationCap className="w-4 h-4 text-gray-400" />
                <span>指导名师: <strong className="font-semibold text-gray-900">{user.teacherName}</strong></span>
              </div>
            )}
            {user.phone && (
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <span>联系电话: <strong className="font-semibold text-gray-900">{user.phone}</strong></span>
              </div>
            )}
            {user.address && (
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>地址: <strong className="font-semibold text-gray-900">{user.address}</strong></span>
              </div>
            )}
          </div>

          {/* Quick Role Switcher for Testing 7 System Personas */}
          {onSwitchUserRole && (
            <div className="pt-3 border-t border-gray-100 space-y-1.5">
              <span className="text-[11px] font-bold text-gray-500 uppercase">
                演示体验 · 快速切换 7 种用户角色形态:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs font-semibold">
                <button
                  onClick={() => onSwitchUserRole('super_admin')}
                  className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                    user.role === 'super_admin' ? 'bg-[#188065] text-white border-[#188065]' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  👑 超级管理员
                </button>
                <button
                  onClick={() => onSwitchUserRole('institution')}
                  className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                    user.role === 'institution' ? 'bg-[#188065] text-white border-[#188065]' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  🏛️ 教学机构
                </button>
                <button
                  onClick={() => onSwitchUserRole('teacher')}
                  className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                    user.role === 'teacher' ? 'bg-[#188065] text-white border-[#188065]' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  🎸 认证教师
                </button>
                <button
                  onClick={() => onSwitchUserRole('student')}
                  className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                    user.role === 'student' ? 'bg-[#188065] text-white border-[#188065]' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  🎓 挂靠学员
                </button>
                <button
                  onClick={() => onSwitchUserRole('plus')}
                  className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                    user.role === 'plus' ? 'bg-[#188065] text-white border-[#188065]' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  💳 Plus 付费用户
                </button>
                <button
                  onClick={() => onSwitchUserRole('trial_guest')}
                  className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                    user.role === 'trial_guest' ? 'bg-[#188065] text-white border-[#188065]' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  ⏳ 14天试用用户
                </button>
                <button
                  onClick={() => onSwitchUserRole('registered')}
                  className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                    user.role === 'registered' ? 'bg-[#188065] text-white border-[#188065]' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  ✉️ 普通注册用户
                </button>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <button
              onClick={() => setShowManageModal(true)}
              className="px-3.5 py-1.5 bg-[#188065] hover:bg-[#136a53] text-white text-xs font-semibold rounded-lg shadow-2xs transition-all cursor-pointer flex items-center space-x-1"
            >
              <span>... Manage Account</span>
            </button>

            {(user.role === 'super_admin' || user.role === 'institution' || user.role === 'teacher') && onOpenCMS && (
              <button
                onClick={onOpenCMS}
                className="text-xs text-emerald-800 font-bold hover:underline cursor-pointer"
              >
                前往课程大纲管理中心 &rarr;
              </button>
            )}
          </div>
        </div>

        {/* Section 8.5: 机构组与教师组用户可更新个人机构资料，地址，联系方式等信息 */}
        {isInstitutionOrTeacher && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-emerald-700" />
                <h2 className="text-sm font-bold text-gray-900">
                  {user.role === 'institution' ? '教学机构资料与联系方式维护' : '教师工作室与教学联系方式'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingOrgProfile(!isEditingOrgProfile)}
                className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center space-x-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>{isEditingOrgProfile ? '收起表单' : '修改机构/教师资料'}</span>
              </button>
            </div>

            {profileSaveSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>资料已成功保存！名下学员与教务大纲将同步呈现最新联系信息。</span>
              </div>
            )}

            {!isEditingOrgProfile ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700 bg-gray-50/70 p-4 rounded-xl border border-gray-100">
                <div>
                  <span className="text-gray-400 block text-[11px]">机构/工作室全称:</span>
                  <strong className="text-gray-900">{user.institutionName || '未填写'}</strong>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">官方联系电话 / 咨询热线:</span>
                  <strong className="text-gray-900">{user.phone || '未填写'}</strong>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">教务微信号 / 工作微信:</span>
                  <strong className="text-gray-900">{user.wechat || '未填写'}</strong>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">校区 / 琴房地址:</span>
                  <strong className="text-gray-900">{user.address || '未填写'}</strong>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-gray-400 block text-[11px]">机构/教师简介:</span>
                  <p className="text-gray-800 mt-0.5">{user.bio || '致力于高品质吉他教学与现代音频扒谱研究。'}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveOrgProfile} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      {user.role === 'institution' ? '教学机构全称' : '工作室或琴房名称'}
                    </label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="如: 柏斯音乐国际教育学院"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">联系电话 / 手机</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="如: 400-888-1234 或 13800138000"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">教务微信号</label>
                    <input
                      type="text"
                      value={wechat}
                      onChange={(e) => setWechat(e.target.value)}
                      placeholder="如: alex_guitar_pro"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">详细校区或琴房地址</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="如: 上海市徐汇区艺术国际大厦 8 楼"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-gray-700 mb-1">教学简介与师资介绍</label>
                    <textarea
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="简介将展示给名下学员与公开课程大纲..."
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingOrgProfile(false)}
                    className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold text-xs cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#188065] hover:bg-[#136a53] text-white rounded-lg font-semibold text-xs cursor-pointer"
                  >
                    保存资料
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Card 2: Credits 经济系统与配额余额 (Section 4) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Award className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-gray-900">Credits 经济账户与额度</h2>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              {user.isUnlimitedCredits ? '无限额度 (Unlimited)' : `${user.credits} / ${maxQuota} 点`}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>当前额度使用进度</span>
              <span>{user.isUnlimitedCredits ? '100% (超管豁免)' : `${percentCredits}%`}</span>
            </div>
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-linear-to-r from-emerald-600 to-teal-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${percentCredits}%` }}
              />
            </div>
          </div>

          <div className="text-xs text-gray-600 leading-relaxed space-y-1 bg-gray-50 p-3.5 rounded-xl border border-gray-100">
            <div>
              • <strong>核算规则</strong>：音频 AI 扒谱 <strong>10 Credits / 分钟</strong>；课程大纲版本发布单次 <strong>15 Credits</strong>。
            </div>
            <div>
              • <strong>重置周期</strong>：
              {user.role === 'super_admin' ? ' 平台超级管理员永久无限，不进行额度扣减。' :
               user.role === 'institution' || user.role === 'teacher' ? ' 初始发放 5000 点额度，使用完毕后可一键向超管申请恢复 5000 点。' :
               user.role === 'student' ? ' 挂靠学员 3000 点 / 月，每月续费自动恢复。' :
               user.role === 'plus' ? ' 付费订阅用户 600 点 / 月，每月 1 号自动恢复。' :
               user.role === 'trial_guest' ? ' 14 天试用期发放 600 点，试用到期后清零。' : ' 普通注册用户初始 0 点，建议开启 14 天试用获赠 600 点。'}
            </div>
          </div>

          {/* Teacher/Institution recovery application button */}
          {isInstitutionOrTeacher && (
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                额度不足时？可随时向超级管理员申请恢复 5000 点教研额度：
              </span>
              <button
                type="button"
                disabled={isApplyingRecovery}
                onClick={handleApplyCreditsRecovery}
                className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs rounded-lg shadow-2xs transition-all cursor-pointer flex items-center space-x-1"
              >
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span>{isApplyingRecovery ? '正在申请...' : '向管理员申请恢复 5000 点'}</span>
              </button>
            </div>
          )}

          {recoveryAppliedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center space-x-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>已成功提交恢复 5000 点额度申请，超管审批通过后将即刻到账！</span>
            </div>
          )}
        </div>

        {/* Card 3: Subscription & Pricing Plan (Section 5.1) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-gray-700" />
              <h2 className="text-sm font-bold text-gray-900">Subscription &amp; Pricing Plans</h2>
            </div>
            <button
              onClick={() => setShowPlansModal(true)}
              className="px-3 py-1 bg-[#188065] hover:bg-[#136a53] text-white text-xs font-semibold rounded-lg shadow-2xs transition-all cursor-pointer flex items-center space-x-1"
            >
              <Sparkles className="w-3 h-3" />
              <span>Pricing Plan / 升级计划</span>
            </button>
          </div>

          <div className="py-4 px-4 bg-gray-50/80 rounded-xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs text-gray-500">当前生效套餐:</div>
              <div className="text-base font-black text-gray-950 mt-0.5">
                {user.plan === 'enterprise' || user.role === 'super_admin' || user.role === 'institution' ? 'Plan 4: Enterprise (企业与教学机构定制)' :
                 user.plan === 'pro' || user.role === 'student' ? 'Plan 3: Pro (师承学员推荐套餐 · 3000 点/月)' :
                 user.plan === 'plus' || user.role === 'plus' ? 'Plan 2: Plus (独立创作者套餐 · 600 点/月)' :
                 user.plan === 'trial' ? 'Plan 1: Free (14-Day 免费试用 · 600 点)' : 'Plan 1: Free (未开启试用 · 0 点)'}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                支持 MIDI / MusicXML / PDF / Guitar Pro 四类乐谱导出及名师完整课程大纲
              </div>
            </div>

            <button
              onClick={() => setShowPlansModal(true)}
              className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 border border-gray-300 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer shrink-0"
            >
              对比 4 大套餐规格
            </button>
          </div>
        </div>

        {/* Card 4: AI Model Training Privacy (Phase 3 / Section 5.2) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-gray-900">AI 模型训练隐私保护 (AI Training Privacy)</h2>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              canOptOutAi ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'
            }`}>
              {canOptOutAi ? 'Plus / Pro 特权' : '需 Plus / Pro 解锁'}
            </span>
          </div>

          <p className="text-xs text-gray-600 leading-relaxed">
            保护您的独家扒谱、改编曲目与私人音频资产。开启后，您的音频与曲谱将不会被用于 GuitarMate 基础 AI 模型的公网训练迭代。
          </p>

          <div className="pt-2 flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
            <div>
              <div className="text-xs font-bold text-gray-900">Opt out of AI model training</div>
              <div className="text-[11px] text-gray-500">
                {optOutAi ? '已开启专属隐私保护，数据完全隔离' : '当前参与公网模型协同改进'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleAiPrivacy}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                optOutAi ? 'bg-[#188065]' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  optOutAi ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Card 5: Start 14-day trial (For free registered users) */}
        {!trialActivated && user.plan === 'free' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-3">
            <div className="flex items-center space-x-2 text-emerald-800">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-gray-900">开启 14 天免费试用 (Start 14-Day Free Trial)</h2>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed max-w-xl">
              普通注册用户可免费开启 14 天全功能体验，一次性获赠 <strong>600 点 Credits</strong> (相当于 60 分钟音频转录额度)，解锁官方体验课与全功能双行谱。无需绑定信用卡。
            </p>

            <div className="pt-1">
              <button
                onClick={handleStartTrial}
                className="px-4 py-2 bg-[#188065] hover:bg-[#136a53] text-white text-xs font-semibold rounded-lg shadow-2xs transition-all cursor-pointer"
              >
                立即领取 600 点并开启试用
              </button>
            </div>
          </div>
        )}

        {/* Card 6: Language */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-gray-700" />
            <h2 className="text-sm font-bold text-gray-900">Language</h2>
          </div>

          <p className="text-xs text-gray-500">
            Choose the language for Songscription and your account emails.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {['Automatic', 'English', 'Deutsch', 'Español', '简体中文', 'Português'].map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => handleLanguageChange(lang)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                  selectedLanguage === lang
                    ? 'border-[#188065] bg-[#eef7f4] ring-1 ring-[#188065]'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="text-xs font-bold text-gray-900">{lang}</span>
                {selectedLanguage === lang && <Check className="w-4 h-4 text-[#188065]" />}
              </button>
            ))}
          </div>
        </div>

      </main>

      {/* Modal for Manage Account */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">Manage Account</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Primary email: {user.email}<br />
              Status: Active<br />
              User Role: {user.role}<br />
              Credits Balance: {user.isUnlimitedCredits ? 'Unlimited' : `${user.credits} 点`}<br />
              Connected Google Account: {user.email}
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowManageModal(false)}
                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Plans Modal (Roadmap Section 5.1 & 5.2) */}
      {showPlansModal && (
        <PricingPlansView
          isModal={true}
          currentUser={user}
          onClose={() => setShowPlansModal(false)}
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
            onUpdateUser(updated);
            backendService.updateUserProfile(user.id, updated);
            setShowPlansModal(false);
          }}
        />
      )}

    </div>
  );
};
