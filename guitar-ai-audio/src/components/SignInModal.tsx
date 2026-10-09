import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, X, Shield, KeyRound, Check } from 'lucide-react';
import { UserProfile, UserRole, DEMO_USERS } from '../types/auth';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignUp: () => void;
  onSuccessLogin: (user: UserProfile) => void;
}

export const DEMO_CREDENTIALS: Array<{
  role: UserRole;
  roleName: string;
  email: string;
  password: string;
  desc: string;
  badgeColor: string;
}> = [
  {
    role: 'super_admin',
    roleName: '👑 超级管理员',
    email: 'gardenartgz@gmail.com',
    password: 'password123',
    desc: '拥有所有用户管理、机构关系审核与课程大纲完全管理权 (无限 Credits)',
    badgeColor: 'bg-purple-100 text-purple-900 border-purple-200',
  },
  {
    role: 'institution',
    roleName: '🏛️ 教学机构',
    email: 'academy@parsons-music.com',
    password: 'password123',
    desc: '柏斯音乐学院：管理属下教师与学员学分，大纲只读查看 (5000 Credits)',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  {
    role: 'teacher',
    roleName: '🎸 认证教师',
    email: 'alex.guitar@studio.com',
    password: 'password123',
    desc: '李老师：全面管理自身课程大纲发布、归档、草稿与版本 (5000 Credits)',
    badgeColor: 'bg-teal-100 text-teal-900 border-teal-200',
  },
  {
    role: 'student',
    roleName: '🎓 挂靠学员',
    email: 'xiaoming.student@gmail.com',
    password: 'password123',
    desc: '学员小明：挂靠李老师，解锁完整大纲，月续 3000 Credits',
    badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-200',
  },
  {
    role: 'plus',
    roleName: '💳 Plus 付费用户',
    email: 'zhangfeng.guitar@gmail.com',
    password: 'password123',
    desc: '张峰：独立吉他手，四类格式导出，月度 600 Credits',
    badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  },
  {
    role: 'trial_guest',
    roleName: '⏳ 14天试用用户',
    email: 'guest@test.com',
    password: 'password123',
    desc: '普通访客：14天全功能试用体验，一次性 600 Credits',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  {
    role: 'registered',
    roleName: '✉️ 普通注册用户',
    email: 'xuming.reg@163.com',
    password: 'password123',
    desc: '普通注册账号：未开启试用，0 Credits，限前 8 小节',
    badgeColor: 'bg-gray-100 text-gray-800 border-gray-200',
  },
];

export const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  onClose,
  onSwitchToSignUp,
  onSuccessLogin,
}) => {
  const [email, setEmail] = useState('gardenartgz@gmail.com');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDemoRole, setSelectedDemoRole] = useState<UserRole>('super_admin');

  if (!isOpen) return null;

  // 1-Click Fast Login with Demo Role
  const handleFastLoginWithRole = (demoRole: UserRole) => {
    setIsLoading(true);
    setSelectedDemoRole(demoRole);
    const demo = DEMO_CREDENTIALS.find((d) => d.role === demoRole);
    if (demo) {
      setEmail(demo.email);
      setPassword(demo.password);
    }
    setTimeout(() => {
      onSuccessLogin(DEMO_USERS[demoRole]);
      setIsLoading(false);
      onClose();
    }, 400);
  };

  const handleGoogleSignIn = () => {
    setIsLoading(true);
    setTimeout(() => {
      // Default Google identity is Gardenart -> SUPER ADMIN
      onSuccessLogin(DEMO_USERS.super_admin);
      setIsLoading(false);
      onClose();
    }, 400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);

    setTimeout(() => {
      // Check if email matches one of the demo users
      const matchedDemo = Object.values(DEMO_USERS).find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase()
      );
      if (matchedDemo) {
        onSuccessLogin(matchedDemo);
      } else {
        const derivedName = email.split('@')[0];
        const capitalized = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);
        onSuccessLogin({
          id: `usr_${Date.now()}`,
          name: capitalized,
          email: email.trim(),
          role: email.includes('admin') || email === 'gardenartgz@gmail.com' ? 'super_admin' : 'student',
          isLoggedIn: true,
          memberSince: 'Oct 01, 2026',
          plan: 'free',
          language: 'Automatic',
          credits: 100,
          status: 'active',
        });
      }
      setIsLoading(false);
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in select-none">
      
      {/* Top right switch button on overlay */}
      <div className="fixed top-6 right-8 z-50">
        <button
          onClick={onSwitchToSignUp}
          className="px-4 py-2 bg-[#188065] hover:bg-[#136a53] text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
        >
          Sign Up
        </button>
      </div>

      {/* Main Sign In Dialog Box (Matching sign-in.png + 5 Demo Credentials) */}
      <div className="relative w-full max-w-[490px] bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 sm:p-8 text-gray-900 my-auto">
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 text-center tracking-tight mb-2">
          Welcome Back!
        </h2>
        <p className="text-xs text-gray-500 text-center mb-5">
          请选择 5 大测试角色快速填入体验，或输入账号密码登录
        </p>

        {/* Quick Demo Accounts Card Selector */}
        <div className="mb-5 p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-700">
            <span className="flex items-center space-x-1">
              <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
              <span>5 大用户组测试账号（点击即可直接登录）:</span>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-1.5 max-h-[170px] overflow-y-auto pr-1">
            {DEMO_CREDENTIALS.map((demo) => {
              const isSelected = email === demo.email;
              return (
                <button
                  key={demo.role}
                  type="button"
                  onClick={() => handleFastLoginWithRole(demo.role)}
                  className={`p-2 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50/70 border-emerald-400 ring-1 ring-emerald-400'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-100/60'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-bold text-gray-900">{demo.roleName}</span>
                      <span className="text-[10px] text-gray-500 font-mono">密码: {demo.password}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate font-mono">
                      {demo.email}
                    </div>
                  </div>

                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold shrink-0 bg-emerald-100 text-emerald-800">
                    一键登录
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fast Google Login Button (Matching sign-in.png -> Gardenart Super Admin) */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full border border-gray-300 hover:border-gray-400 rounded-lg p-2.5 flex items-center justify-between bg-white hover:bg-gray-50/80 transition-all cursor-pointer group shadow-2xs mb-4"
        >
          <div className="flex items-center space-x-2.5 text-left">
            <div className="w-6 h-6 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-[11px] font-bold text-emerald-800">
              G
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-800 group-hover:text-gray-950 flex items-center space-x-1">
                <span>用 Gardenart 的身份登录 (超级管理员)</span>
              </div>
              <div className="text-[11px] text-gray-500 font-mono">
                gardenartgz@gmail.com
              </div>
            </div>
          </div>

          {/* Google 4-color G icon */}
          <div className="shrink-0 pl-2">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.14z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
          </div>
        </button>

        {/* OR Divider */}
        <div className="relative my-4 flex items-center justify-center">
          <div className="border-t border-gray-200 w-full absolute"></div>
          <span className="bg-white px-3 text-xs uppercase font-medium text-gray-400 relative">
            OR 密码登录
          </span>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Email input */}
          <div className="flex items-center space-x-2.5 bg-[#ebf2fc] border border-[#d0e1fd] rounded-lg px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-[#188065] focus-within:border-transparent transition-all">
            <Mail className="w-4 h-4 text-gray-500 shrink-0" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="w-full bg-transparent text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
            />
          </div>

          {/* Password input */}
          <div className="flex items-center space-x-2.5 bg-[#ebf2fc] border border-[#d0e1fd] rounded-lg px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-[#188065] focus-within:border-transparent transition-all">
            <Lock className="w-4 h-4 text-gray-500 shrink-0" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full bg-transparent text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Submit Sign In Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-[#188065] hover:bg-[#136a53] disabled:opacity-50 text-white font-semibold rounded-lg text-xs sm:text-sm shadow-xs transition-all cursor-pointer mt-2"
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        {/* Footer Links */}
        <div className="mt-5 text-center space-y-1.5 text-xs text-gray-600">
          <div>
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={onSwitchToSignUp}
              className="text-gray-900 font-semibold underline hover:text-[#188065] cursor-pointer"
            >
              Sign up
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
