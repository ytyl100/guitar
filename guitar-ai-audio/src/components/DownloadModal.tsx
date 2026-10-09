import React, { useState } from 'react';
import { 
  X, 
  Download, 
  FileText, 
  Music, 
  FileCode, 
  Check, 
  Printer,
  Sparkles,
  Lock,
  ArrowRight
} from 'lucide-react';
import { ScoreData } from '../types/music';
import { UserProfile } from '../types/auth';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  score: ScoreData;
  currentUser?: UserProfile;
  onOpenPricing?: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({
  isOpen,
  onClose,
  score,
  currentUser,
  onOpenPricing,
}) => {
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  if (!isOpen) return null;

  // Check if current user has full export rights (Plan 2: Plus, Plan 3: Pro, Plan 4: Enterprise, or trial active)
  const isFreeWithoutTrial = !currentUser || (currentUser.plan === 'free' && !currentUser.trialActive && currentUser.role !== 'super_admin' && currentUser.role !== 'institution' && currentUser.role !== 'teacher');

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    if (isFreeWithoutTrial) {
      if (onOpenPricing) onOpenPricing();
      return;
    }
    const jsonStr = JSON.stringify(score, null, 2);
    downloadFile(jsonStr, `${score.title.replace(/[^a-zA-Z0-9]/g, '_')}_tab.json`, 'application/json');
    setCopiedFormat('json');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const handleExportMusicXml = () => {
    if (isFreeWithoutTrial) {
      if (onOpenPricing) onOpenPricing();
      return;
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${score.title}</work-title>
  </work>
  <identification>
    <creator type="transcriber">${score.transcribedBy}</creator>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Acoustic Guitar</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    ${score.measures.map((m) => `
    <measure number="${m.number}">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>${score.flatsCount ? -score.flatsCount : 0}</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>TAB</sign><line>5</line></clef>
      </attributes>
      ${m.notes.map((n) => `
      <note>
        <pitch><step>${n.pitch.charAt(0)}</step><octave>${n.pitch.slice(-1)}</octave></pitch>
        <duration>${Math.round(n.durationBeats * 4)}</duration>
        <notations>
          <technical>
            <string>${n.string}</string>
            <fret>${n.fret}</fret>
          </technical>
        </notations>
      </note>`).join('')}
    </measure>`).join('')}
  </part>
</score-partwise>`;

    downloadFile(xml, `${score.title.replace(/[^a-zA-Z0-9]/g, '_')}.musicxml`, 'application/xml');
    setCopiedFormat('xml');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const handleExportMidi = () => {
    if (isFreeWithoutTrial) {
      if (onOpenPricing) onOpenPricing();
      return;
    }
    // Simulation of MIDI file generation with basic track header
    const dummyMidi = `MThd\x00\x00\x00\x06\x00\x01\x00\x01\x01\xe0MTrk...GuitarMate_${score.title}`;
    downloadFile(dummyMidi, `${score.title.replace(/[^a-zA-Z0-9]/g, '_')}.mid`, 'audio/midi');
    setCopiedFormat('midi');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const handleExportGuitarPro = () => {
    if (isFreeWithoutTrial) {
      if (onOpenPricing) onOpenPricing();
      return;
    }
    const jsonTabStr = JSON.stringify(score);
    downloadFile(jsonTabStr, `${score.title.replace(/[^a-zA-Z0-9]/g, '_')}.gp5`, 'application/octet-stream');
    setCopiedFormat('gp5');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const handlePrintPdf = () => {
    if (isFreeWithoutTrial) {
      if (onOpenPricing) onOpenPricing();
      return;
    }
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans animate-in fade-in select-none">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-100 flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-lg text-gray-900">Download Scores (乐谱导出)</h3>
            <p className="text-xs text-gray-500">
              四类专业乐谱格式导出 (MIDI / MusicXML / PDF / Guitar Pro)
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Plan Restriction Banner (Roadmap Phase 3) */}
        {isFreeWithoutTrial && (
          <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Lock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>当前免费版仅支持网页在线播放。升级 <strong>Plus / Pro</strong> 解锁全格式导出！</span>
            </div>
            {onOpenPricing && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPricing();
                }}
                className="px-2.5 py-1 bg-[#188065] text-white font-bold rounded-lg text-[11px] shrink-0 hover:bg-[#136a53] cursor-pointer"
              >
                升级计划
              </button>
            )}
          </div>
        )}

        {/* Options list */}
        <div className="space-y-2.5 my-4">
          {/* PDF */}
          <div 
            onClick={handlePrintPdf}
            className="p-3 rounded-xl border border-gray-200 hover:border-emerald-600 hover:bg-emerald-50/30 flex items-center justify-between cursor-pointer transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold text-xs">
                PDF
              </div>
              <div>
                <h4 className="font-semibold text-xs sm:text-sm text-gray-900 group-hover:text-emerald-950">Sheet Music &amp; TAB (PDF)</h4>
                <p className="text-[11px] text-gray-500">高清双行谱打印与乐谱排版</p>
              </div>
            </div>
            <Printer className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
          </div>

          {/* MIDI Format */}
          <div 
            onClick={handleExportMidi}
            className="p-3 rounded-xl border border-gray-200 hover:border-emerald-600 hover:bg-emerald-50/30 flex items-center justify-between cursor-pointer transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                MID
              </div>
              <div>
                <h4 className="font-semibold text-xs sm:text-sm text-gray-900 group-hover:text-emerald-950">Standard MIDI (.mid)</h4>
                <p className="text-[11px] text-gray-500">可导入 Logic, Cubase, Studio One 等宿主 DAW 编曲</p>
              </div>
            </div>
            {copiedFormat === 'midi' ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Download className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
            )}
          </div>

          {/* MusicXML */}
          <div 
            onClick={handleExportMusicXml}
            className="p-3 rounded-xl border border-gray-200 hover:border-emerald-600 hover:bg-emerald-50/30 flex items-center justify-between cursor-pointer transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                XML
              </div>
              <div>
                <h4 className="font-semibold text-xs sm:text-sm text-gray-900 group-hover:text-emerald-950">MusicXML 4.0</h4>
                <p className="text-[11px] text-gray-500">通用制谱格式，支持 Sibelius, MuseScore, Finale</p>
              </div>
            </div>
            {copiedFormat === 'xml' ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Download className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
            )}
          </div>

          {/* Guitar Pro .GP5 */}
          <div 
            onClick={handleExportGuitarPro}
            className="p-3 rounded-xl border border-gray-200 hover:border-emerald-600 hover:bg-emerald-50/30 flex items-center justify-between cursor-pointer transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-xs">
                GP
              </div>
              <div>
                <h4 className="font-semibold text-xs sm:text-sm text-gray-900 group-hover:text-emerald-950">GuitarPro Format (.gp5)</h4>
                <p className="text-[11px] text-gray-500">专为 Guitar Pro 5/7/8 深度定制吉他六线谱</p>
              </div>
            </div>
            {copiedFormat === 'gp5' ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Download className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
            )}
          </div>

          {/* Standard TAB JSON format */}
          <div 
            onClick={handleExportJson}
            className="p-3 rounded-xl border border-gray-200 hover:border-emerald-600 hover:bg-emerald-50/30 flex items-center justify-between cursor-pointer transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                JSON
              </div>
              <div>
                <h4 className="font-semibold text-xs sm:text-sm text-gray-900 group-hover:text-emerald-950">Standard Tab JSON Schema</h4>
                <p className="text-[11px] text-gray-500">结构化小节、音符打点与和弦数据</p>
              </div>
            </div>
            {copiedFormat === 'json' ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Download className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
        >
          关闭
        </button>
      </div>
    </div>
  );
};
