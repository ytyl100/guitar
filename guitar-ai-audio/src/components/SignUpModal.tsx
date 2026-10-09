import React, { useState } from 'react';
import { Mail, Lock, X } from 'lucide-react';
import { UserProfile, DEMO_USERS } from '../types/auth';

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignIn: () => void;
  onSuccessSignUp: (user: UserProfile) => void;
}

export const SignUpModal: React.FC<SignUpModalProps> = ({
  isOpen,
  onClose,
  onSwitchToSignIn,
  onSuccessSignUp,
}) => {
  const [email, setEmail] = useState('daniel@xhfair.com');
  const [password, setPassword] = useState('password123');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignUp = () => {
    setIsLoading(true);
    setTimeout(() => {
      onSuccessSignUp(DEMO_USERS.student);
      setIsLoading(false);
      onClose();
    }, 600);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    setTimeout(() => {
      const derivedName = email.split('@')[0];
      const capitalized = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);
      onSuccessSignUp({
        id: `usr_${Date.now()}`,
        name: capitalized,
        email: email.trim(),
        role: 'student',
        isLoggedIn: true,
        memberSince: 'Oct 01, 2026',
        plan: 'free',
        language: 'Automatic',
        credits: 100,
        status: 'active',
        institutionName: '柏斯音乐国际教育学院',
        teacherName: '李老师',
      });
      setIsLoading(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in select-none">
      
      {/* Top right switch link on overlay (Matching sign-up.png) */}
      <div className="fixed top-6 right-8 z-50">
        <button
          onClick={onSwitchToSignIn}
          className="text-sm font-semibold text-gray-800 hover:text-[#188065] transition-colors cursor-pointer"
        >
          Sign In
        </button>
      </div>

      {/* Main Sign Up Dialog Box (Matching sign-up.png) */}
      <div className="relative w-full max-w-[420px] bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 sm:p-9 text-gray-900">
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 text-center tracking-tight mb-7">
          Create Your Account
        </h2>

        {/* Fast Google Login Button (Matching sign-up.png) */}
        <button
          type="button"
          onClick={handleGoogleSignUp}
          className="w-full border border-gray-300 hover:border-gray-400 rounded-lg p-2.5 flex items-center justify-between bg-white hover:bg-gray-50/80 transition-all cursor-pointer group shadow-2xs mb-5"
        >
          <div className="flex items-center space-x-2.5 text-left">
            <div className="w-6 h-6 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-[11px] font-bold text-emerald-800">
              G
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-800 group-hover:text-gray-950">
                用 Gardenart 的身份登录
              </div>
              <div className="text-[11px] text-gray-500">
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
        <div className="relative my-5 flex items-center justify-center">
          <div className="border-t border-gray-200 w-full absolute"></div>
          <span className="bg-white px-3 text-xs uppercase font-medium text-gray-400 relative">
            OR
          </span>
        </div>

        {/* Form Fields (Matching sign-up.png) */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
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
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full bg-transparent text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
            />
          </div>

          {/* Confirm Password input */}
          <div className="flex items-center space-x-2.5 bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-[#188065] focus-within:border-transparent transition-all">
            <Lock className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full bg-transparent text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
            />
          </div>

          {/* Create Account Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-[#188065] hover:bg-[#136a53] disabled:opacity-50 text-white font-semibold rounded-lg text-xs sm:text-sm shadow-xs transition-all cursor-pointer mt-4"
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

      </div>

    </div>
  );
};
