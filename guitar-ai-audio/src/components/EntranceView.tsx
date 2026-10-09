import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Youtube, 
  Instagram, 
  Mic, 
  Play,
  FolderOpen
} from 'lucide-react';
import { GuitarMateLogo } from './GuitarMateLogo';

interface EntranceViewProps {
  onStartWizard: (source: { type: 'upload' | 'url' | 'record'; name: string; file?: File; url?: string }) => void;
  onOpenDemo: () => void;
  onOpenLibrary: () => void;
}

export const EntranceView: React.FC<EntranceViewProps> = ({
  onStartWizard,
  onOpenDemo,
  onOpenLibrary,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    onStartWizard({
      type: 'url',
      name: urlInput.includes('Jx8ls-Y-Keg') ? 'Macaroon 5 | YouTube Audio Library' : 'Web Stream Source',
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
        name: `Guitar_Recording_${new Date().toLocaleTimeString().replace(/:/g, '-')}.wav`,
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfbf9] text-gray-900 flex flex-col font-sans relative overflow-hidden select-none">
      
      {/* Top Left: Logo only */}
      <header className="w-full px-6 sm:px-8 py-5 flex items-center justify-start z-20">
        <GuitarMateLogo size="md" />
      </header>

      {/* Main Center Stage: Audio Upload Widget */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 relative z-10 -mt-8">
        
        {/* Ambient Subtle Waveform on left and right sides (Matching screenshot) */}
        <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 pointer-events-none opacity-25 -z-10 flex justify-between px-6 sm:px-16 overflow-hidden">
          <div className="flex space-x-2 items-center">
            {[18, 30, 48, 64, 52, 38, 22, 14, 28, 42, 58, 45, 26, 16].map((h, i) => (
              <span
                key={i}
                className="w-1.5 bg-emerald-600 rounded-full"
                style={{
                  height: `${h}px`,
                  opacity: 0.35 + (i % 3) * 0.2,
                }}
              />
            ))}
          </div>
          <div className="flex space-x-2 items-center">
            {[16, 26, 45, 58, 42, 28, 14, 22, 38, 52, 64, 48, 30, 18].map((h, i) => (
              <span
                key={i}
                className="w-1.5 bg-emerald-600 rounded-full"
                style={{
                  height: `${h}px`,
                  opacity: 0.35 + (i % 3) * 0.2,
                }}
              />
            ))}
          </div>
        </div>

        {/* Central Audio Resource Upload Container - Exact match with 61b868ea-7e65-418a-ab41-1b3fb5d0e8a3.png */}
        <div className="w-full max-w-[460px] bg-[#125848] rounded-2xl p-6 sm:p-7 shadow-2xl border-4 border-[#0e483b] text-white transition-all">
          
          {/* Main Drag & Drop / Upload Target Box */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#237d69] hover:border-emerald-300 bg-[#0d4538]/50 hover:bg-[#0d4538]/70 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all group"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="audio/*,video/*,.mp3,.wav,.m4a,.flac" 
              className="hidden" 
            />
            
            {/* Upload Icon in Circle */}
            <div className="w-12 h-12 rounded-full bg-[#1a6855] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform text-white">
              <Upload className="w-6 h-6 text-white" />
            </div>
            
            {/* Gold Upload Button */}
            <button 
              type="button"
              className="bg-[#ebd9a6] hover:bg-[#faeec5] text-gray-900 font-bold px-6 py-2.5 rounded-lg text-sm shadow-md transition-all mb-2 pointer-events-none"
            >
              Upload your audio
            </button>
            <p className="text-xs text-emerald-200/90 font-medium">Or drag and drop here</p>
          </div>

          {/* Divider OR */}
          <div className="relative my-4 flex items-center justify-center">
            <div className="border-t border-emerald-700/60 w-full absolute"></div>
            <span className="bg-[#125848] px-3 text-xs uppercase font-bold text-emerald-300 relative tracking-wider">
              OR
            </span>
          </div>

          {/* URL Input */}
          <form onSubmit={handleUrlSubmit} className="space-y-2">
            <div className="relative flex items-center">
              <div className="absolute left-3 flex items-center space-x-1.5 text-emerald-300 pointer-events-none">
                <Youtube className="w-4 h-4 text-red-400" />
                <Instagram className="w-3.5 h-3.5 text-pink-300" />
              </div>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="YouTube, Instagram, or TikTok URL"
                className="w-full bg-[#0a382e] border border-emerald-700/80 rounded-lg pl-14 pr-16 py-2.5 text-xs sm:text-sm text-white placeholder-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button
                type="submit"
                disabled={!urlInput.trim()}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
              >
                Go
              </button>
            </div>
          </form>

          {/* Divider OR */}
          <div className="relative my-4 flex items-center justify-center">
            <div className="border-t border-emerald-700/60 w-full absolute"></div>
            <span className="bg-[#125848] px-3 text-xs uppercase font-bold text-emerald-300 relative tracking-wider">
              OR
            </span>
          </div>

          {/* Record Audio Button */}
          <button
            onClick={toggleRecording}
            className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              isRecording
                ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                : 'bg-[#0e4437] hover:bg-[#093329] text-emerald-100 border border-emerald-700/60'
            }`}
          >
            <Mic className={`w-4 h-4 ${isRecording ? 'text-white' : 'text-emerald-300'}`} />
            <span>
              {isRecording ? `Recording... (${recordingSeconds}s) Click to Stop` : 'Record Audio'}
            </span>
          </button>
        </div>

        {/* Quick Test Bar directly beneath the card (Matching screenshot) */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-3 text-xs text-gray-600">
          <span className="font-medium text-gray-500">Want to test right now?</span>
          <button
            onClick={onOpenDemo}
            className="flex items-center space-x-2 px-3 py-1.5 bg-[#eaf7f2] hover:bg-[#d8f0e7] border border-emerald-300/80 text-emerald-800 rounded-lg font-semibold transition-all shadow-2xs hover:scale-102 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-emerald-700 text-emerald-700" />
            <span>Open Macaroon 5</span>
          </button>
          <button
            onClick={onOpenLibrary}
            className="flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 rounded-lg font-semibold transition-all shadow-2xs hover:scale-102 cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-emerald-700" />
            <span>浏览曲谱库 (Library)</span>
          </button>
        </div>

      </main>

    </div>
  );
};
