import React, { useState } from 'react';
import { X, Building2, Mail, User, Clock, CheckCircle2, Sparkles, Send } from 'lucide-react';
import { backendService } from '../utils/backendService';
import { EnterpriseLead } from '../types/pricing';

interface ContactUsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
  initialName?: string;
}

const USE_CASE_OPTIONS = [
  { id: 'api', label: 'API 接口深度集成 (实时扒谱接入)' },
  { id: 'bulk_export', label: '批量乐谱与多轨格式打包导出' },
  { id: 'private_curriculum', label: '专属私有教师与课纲系统独立部署' },
  { id: 'custom_teaching', label: '连锁琴行教研考级系统定制' },
  { id: 'offline_license', label: '线下琴房智能陪练大屏授权' },
];

export const ContactUsModal: React.FC<ContactUsModalProps> = ({
  isOpen,
  onClose,
  initialEmail = '',
  initialName = '',
}) => {
  const [fullName, setFullName] = useState(initialName);
  const [workEmail, setWorkEmail] = useState(initialEmail);
  const [companyName, setCompanyName] = useState('');
  const [monthlyMinutes, setMonthlyMinutes] = useState('500 - 2,000 分钟');
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([
    '专属私有教师与课纲系统独立部署',
    '批量乐谱与多轨格式打包导出',
  ]);
  const [notes, setNotes] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const toggleUseCase = (label: string) => {
    if (selectedUseCases.includes(label)) {
      setSelectedUseCases(selectedUseCases.filter((item) => item !== label));
    } else {
      setSelectedUseCases([...selectedUseCases, label]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !workEmail.trim() || !companyName.trim()) return;

    setIsSubmitting(true);
    const newLead: EnterpriseLead = {
      id: `lead_${Date.now()}`,
      fullName: fullName.trim(),
      workEmail: workEmail.trim(),
      companyName: companyName.trim(),
      monthlyMinutes,
      useCases: selectedUseCases,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      status: 'new',
    };

    backendService.saveEnterpriseLead(newLead);

    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs font-sans animate-in fade-in select-none">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 sm:p-7 text-gray-900 my-auto overflow-hidden">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {!isSubmitted ? (
          <div>
            <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs uppercase tracking-wider mb-1">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <span>Enterprise &amp; Academy Customization</span>
            </div>

            <h2 className="text-xl font-extrabold text-gray-950 tracking-tight">
              Contact Enterprise Sales
            </h2>
            <p className="text-xs text-gray-500 mt-1 mb-5">
              企业与教学机构定制咨询 · 为连锁琴行与音乐高校提供私有化课纲与高并发扒谱算力
            </p>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Full Name */}
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Full Name (称呼/姓名) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="李校长 / Alex"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                    />
                  </div>
                </div>

                {/* Work Email */}
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Work Email (工作邮箱) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      placeholder="name@institution.com"
                      value={workEmail}
                      onChange={(e) => setWorkEmail(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                    />
                  </div>
                </div>
              </div>

              {/* Company / Academy Name */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Company / Academy Name (机构或公司名称) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    placeholder="如: 柏斯音乐国际教育学院 / 海伦吉他艺术中心"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                  />
                </div>
              </div>

              {/* Estimated Monthly Minutes */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Estimated Monthly Minutes (预计月度转录分钟数)
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <select
                    value={monthlyMinutes}
                    onChange={(e) => setMonthlyMinutes(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                  >
                    <option value="< 500 分钟">&lt; 500 分钟 (基础教研试点)</option>
                    <option value="500 - 2,000 分钟">500 - 2,000 分钟 (标准中型艺术学校)</option>
                    <option value="2,000 - 10,000 分钟">2,000 - 10,000 分钟 (大型连锁培训机构)</option>
                    <option value="10,000+ 分钟 (API 深度集成)">10,000+ 分钟 (大并发平台与 API 接口深度集成)</option>
                  </select>
                </div>
              </div>

              {/* Use Case & Requirements */}
              <div>
                <label className="block font-bold text-gray-700 mb-1.5">
                  Use Case &amp; Requirements (主要使用场景与定制需求)
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {USE_CASE_OPTIONS.map((opt) => {
                    const checked = selectedUseCases.includes(opt.label);
                    return (
                      <div
                        key={opt.id}
                        onClick={() => toggleUseCase(opt.label)}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-lg border text-left cursor-pointer transition-all ${
                          checked
                            ? 'bg-emerald-50/60 border-emerald-500 text-emerald-950 font-medium'
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="w-3.5 h-3.5 text-emerald-600 rounded cursor-pointer accent-[#188065]"
                        />
                        <span className="text-[11px] leading-snug">{opt.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Additional Notes */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Additional Notes (补充需求说明，选填)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="可在此填写期望对接的技术协议、定制预算周期或预计教师与学员规模..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 bg-[#188065] hover:bg-[#136a53] disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Submitting Application...' : 'Submit Application (立即提交申请)'}</span>
                </button>
                <p className="text-[10px] text-gray-400 text-center mt-2">
                  提交后，商务经理将在 24 小时内通过工作邮箱或电话与您建立专属联系
                </p>
              </div>
            </form>
          </div>
        ) : (
          <div className="py-8 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-950">
              申请已成功送达商务团队
            </h3>
            <p className="text-xs text-gray-600 max-w-sm mx-auto leading-relaxed">
              感谢您对 GuitarMate Enterprise 的信任！我们已将 <strong className="text-gray-900">{companyName}</strong> 的定制需求收录至商务线索库。大客户解决方案经理将在 24 小时内通过工作邮箱 <strong className="text-emerald-700">{workEmail}</strong> 与您对接演示方案与报价合同。
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-[#188065] hover:bg-[#136a53] text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer"
              >
                好的，我知道了
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
