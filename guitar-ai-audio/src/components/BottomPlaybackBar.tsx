import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  FastForward, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  FileText, 
  Columns, 
  Rows, 
  Settings, 
  Minus, 
  Plus, 
  Sliders,
  Sparkles,
  Music4,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Repeat,
  Check
} from 'lucide-react';
import { ViewMode } from '../types/music';

interface BottomPlaybackBarProps {
  isPlaying: boolean;
  currentTimeSeconds: number;
  totalDurationSeconds: number;
  audioTrack: 'transcribed' | 'original';
  playbackSpeed: number;
  transposeSemitones: number;
  isMetronomeActive: boolean;
  viewMode: ViewMode;
  zoomLevel: number;
  playbackMeasure: number;
  totalMeasures: number;
  isLooping: boolean;
  loopRange: { startMeasure: number; endMeasure: number };
  onTogglePlay: () => void;
  onRewind: () => void;
  onSeek: (seconds: number) => void;
  onJumpToMeasure: (measure: number) => void;
  onToggleLoop: () => void;
  onChangeLoopRange: (range: { startMeasure: number; endMeasure: number }) => void;
  onChangeAudioTrack: (track: 'transcribed' | 'original') => void;
  onChangeSpeed: (speed: number) => void;
  onChangeTranspose: (semitones: number) => void;
  onToggleMetronome: () => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onChangeZoom: (newZoom: number) => void;
}

export const BottomPlaybackBar: React.FC<BottomPlaybackBarProps> = ({
  isPlaying,
  currentTimeSeconds,
  totalDurationSeconds,
  audioTrack,
  playbackSpeed,
  transposeSemitones,
  isMetronomeActive,
  viewMode,
  zoomLevel,
  playbackMeasure,
  totalMeasures,
  isLooping,
  loopRange,
  onTogglePlay,
  onRewind,
  onSeek,
  onJumpToMeasure,
  onToggleLoop,
  onChangeLoopRange,
  onChangeAudioTrack,
  onChangeSpeed,
  onChangeTranspose,
  onToggleMetronome,
  onChangeViewMode,
  onChangeZoom,
}) => {
  const [isMeasureMenuOpen, setIsMeasureMenuOpen] = useState(false);
  const [isLoopPanelOpen, setIsLoopPanelOpen] = useState(false);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = Math.floor(secs % 60);
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  return (
    <div className="h-16 bg-[#165a4c] text-white px-2 sm:px-4 md:px-6 flex items-center justify-between border-t border-[#10473c] shadow-2xl z-40 select-none font-sans relative">
      
      {/* Left: Track toggle + Transport controls */}
      <div className="flex items-center space-x-1.5 sm:space-x-3">
        
        {/* Transcribed vs Original Audio Toggle */}
        <div className="hidden sm:flex items-center bg-[#0d3b32] p-0.5 rounded-lg border border-emerald-800 text-[10px] sm:text-xs font-semibold">
          <button
            onClick={() => onChangeAudioTrack('transcribed')}
            className={`px-2 sm:px-3 py-1 rounded transition-colors cursor-pointer ${
              audioTrack === 'transcribed'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-300 hover:text-white'
            }`}
          >
            Transcribed
          </button>
          <button
            onClick={() => onChangeAudioTrack('original')}
            className={`px-2 sm:px-3 py-1 rounded transition-colors cursor-pointer ${
              audioTrack === 'original'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-300 hover:text-white'
            }`}
          >
            Original
          </button>
        </div>

        {/* Rewind Button */}
        <button
          onClick={onRewind}
          className="text-emerald-200 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          title="Rewind to start"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Big Play/Pause Button */}
        <button
          onClick={onTogglePlay}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white text-[#165a4c] hover:bg-emerald-100 flex items-center justify-center transition-transform active:scale-95 shadow-md cursor-pointer shrink-0"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
          ) : (
            <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
          )}
        </button>

        {/* Time Progress */}
        <div className="hidden md:flex text-[11px] sm:text-xs font-mono text-emerald-100 items-center space-x-1">
          <span>{formatTime(currentTimeSeconds)}</span>
          <span className="text-emerald-400/80">/</span>
          <span>{formatTime(totalDurationSeconds)}</span>
        </div>

        {/* Measure Stepper & Switcher */}
        <div className="flex items-center bg-[#0d3b32] p-0.5 rounded-lg border border-emerald-800 text-xs relative">
          <button
            onClick={() => onJumpToMeasure(Math.max(1, playbackMeasure - 1))}
            disabled={playbackMeasure <= 1}
            className="p-1 text-emerald-300 hover:text-white disabled:opacity-30 cursor-pointer"
            title="Previous Bar"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          
          {/* Measure Menu trigger */}
          <div className="relative">
            <button
              onClick={() => {
                setIsMeasureMenuOpen(!isMeasureMenuOpen);
                setIsLoopPanelOpen(false);
              }}
              className="flex items-center space-x-0.5 sm:space-x-1 px-1.5 py-0.5 rounded hover:bg-emerald-800/60 text-white font-bold font-mono text-[11px] sm:text-xs cursor-pointer"
              title="Jump to specific bar"
            >
              <span>Bar {playbackMeasure}</span>
              <span className="text-emerald-400/80 font-normal">/{totalMeasures}</span>
              <ChevronDown className="w-3 h-3 text-emerald-300 ml-0.5" />
            </button>

            {/* Measure selection popup */}
            {isMeasureMenuOpen && (
              <>
                {/* Mobile backdrop */}
                <div 
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] sm:hidden"
                  onClick={() => setIsMeasureMenuOpen(false)}
                />
                <div className="fixed inset-x-4 bottom-20 z-50 sm:absolute sm:bottom-full sm:left-0 sm:inset-x-auto sm:mb-2 w-auto sm:w-48 bg-white text-gray-900 rounded-2xl shadow-2xl border border-gray-200/90 p-3 sm:p-2 animate-in fade-in zoom-in-95">
                  <div className="text-[10px] font-bold text-gray-400 uppercase px-2 py-1 flex items-center justify-between">
                    <span>Jump to Bar</span>
                    <span className="font-mono text-[9px] text-emerald-700">1–{totalMeasures}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto p-1">
                    {Array.from({ length: totalMeasures }, (_, i) => i + 1).map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          onJumpToMeasure(m);
                          setIsMeasureMenuOpen(false);
                        }}
                        className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                          playbackMeasure === m
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-gray-100 hover:bg-emerald-50 text-gray-800'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => onJumpToMeasure(Math.min(totalMeasures, playbackMeasure + 1))}
            disabled={playbackMeasure >= totalMeasures}
            className="p-1 text-emerald-300 hover:text-white disabled:opacity-30 cursor-pointer"
            title="Next Bar"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Section Practice Loop (A-B Looping Controller) */}
        <div className="relative">
          <button
            onClick={() => {
              setIsLoopPanelOpen(!isLoopPanelOpen);
              setIsMeasureMenuOpen(false);
            }}
            className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              isLooping
                ? 'bg-emerald-500 text-white border-emerald-400 shadow-xs ring-1 ring-emerald-300'
                : 'bg-[#104439] text-emerald-200 border-emerald-800 hover:text-white'
            }`}
            title="Loop section for practice (反复练习小节)"
          >
            <Repeat className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isLooping ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
            <span className="hidden sm:inline">Loop:</span>
            <span className="font-mono font-bold text-[11px] sm:text-xs">
              {loopRange.startMeasure}–{loopRange.endMeasure}
            </span>
            <ChevronDown className="w-3 h-3 text-emerald-300" />
          </button>

          {/* Section Loop Practice Popover (Mobile Responsive & Boundary-Safe) */}
          {isLoopPanelOpen && (
            <>
              {/* Mobile backdrop to close when clicking outside */}
              <div 
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] sm:hidden"
                onClick={() => setIsLoopPanelOpen(false)}
              />
              <div className="fixed inset-x-3 bottom-20 z-50 sm:absolute sm:bottom-full sm:left-auto sm:right-0 sm:inset-x-auto sm:mb-2 w-auto sm:w-80 bg-white text-gray-900 rounded-2xl shadow-2xl border border-gray-200/90 p-3.5 sm:p-4 animate-in fade-in zoom-in-95 text-xs font-sans max-h-[82vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-3">
                  <div className="flex items-center space-x-1.5 font-bold text-gray-900 text-sm">
                    <Repeat className="w-4 h-4 text-emerald-600" />
                    <span>Loop Practice (反复练习)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onToggleLoop()}
                      className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                        isLooping ? 'bg-emerald-600 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {isLooping ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={() => setIsLoopPanelOpen(false)}
                      className="text-gray-400 hover:text-gray-600 p-1 sm:hidden cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Preset Practice Sections */}
                <div className="mb-3">
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Preset Sections</div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <button
                      onClick={() => {
                        onChangeLoopRange({ startMeasure: 1, endMeasure: 4 });
                        onJumpToMeasure(1);
                        if (!isLooping) onToggleLoop();
                      }}
                      className="px-2.5 py-2 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-300 border border-gray-200 rounded-xl text-left cursor-pointer transition-colors"
                    >
                      <div className="font-bold text-gray-800">Bars 1–4</div>
                      <div className="text-[10px] text-gray-500">Intro riff (Cm)</div>
                    </button>

                    <button
                      onClick={() => {
                        onChangeLoopRange({ startMeasure: 5, endMeasure: 8 });
                        onJumpToMeasure(5);
                        if (!isLooping) onToggleLoop();
                      }}
                      className="px-2.5 py-2 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-300 border border-gray-200 rounded-xl text-left cursor-pointer transition-colors"
                    >
                      <div className="font-bold text-gray-800">Bars 5–8</div>
                      <div className="text-[10px] text-gray-500">Theme rhythm</div>
                    </button>

                    <button
                      onClick={() => {
                        onChangeLoopRange({ startMeasure: 9, endMeasure: 12 });
                        onJumpToMeasure(9);
                        if (!isLooping) onToggleLoop();
                      }}
                      className="px-2.5 py-2 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-300 border border-gray-200 rounded-xl text-left cursor-pointer transition-colors"
                    >
                      <div className="font-bold text-gray-800">Bars 9–12</div>
                      <div className="text-[10px] text-gray-500">Ab Climax / Outro</div>
                    </button>

                    <button
                      onClick={() => {
                        onChangeLoopRange({ startMeasure: 1, endMeasure: totalMeasures });
                        onJumpToMeasure(1);
                        if (!isLooping) onToggleLoop();
                      }}
                      className="px-2.5 py-2 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-300 border border-gray-200 rounded-xl text-left cursor-pointer transition-colors"
                    >
                      <div className="font-bold text-gray-800">Whole Song</div>
                      <div className="text-[10px] text-gray-500">Bars 1–{totalMeasures}</div>
                    </button>
                  </div>
                </div>

                {/* Custom Range: From Bar A to Bar B */}
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 mb-3">
                  <div className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Custom Bar Range</div>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1">
                      <label className="text-[9px] text-gray-400 block font-semibold mb-0.5">Start Bar</label>
                      <input
                        type="number"
                        min="1"
                        max={loopRange.endMeasure}
                        value={loopRange.startMeasure}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(loopRange.endMeasure, parseInt(e.target.value, 10) || 1));
                          onChangeLoopRange({ ...loopRange, startMeasure: val });
                        }}
                        className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <span className="text-gray-400 font-bold mt-3">➔</span>
                    <div className="flex-1">
                      <label className="text-[9px] text-gray-400 block font-semibold mb-0.5">End Bar</label>
                      <input
                        type="number"
                        min={loopRange.startMeasure}
                        max={totalMeasures}
                        value={loopRange.endMeasure}
                        onChange={(e) => {
                          const val = Math.max(loopRange.startMeasure, Math.min(totalMeasures, parseInt(e.target.value, 10) || totalMeasures));
                          onChangeLoopRange({ ...loopRange, endMeasure: val });
                        }}
                        className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <button
                    onClick={() => {
                      onChangeLoopRange({ ...loopRange, startMeasure: playbackMeasure });
                    }}
                    className="text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer py-1"
                  >
                    Set Start to Bar {playbackMeasure}
                  </button>
                  <button
                    onClick={() => setIsLoopPanelOpen(false)}
                    className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold shadow-xs cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

      </div>

      {/* Middle: Speed, Transpose, Metronome (Desktop only) */}
      <div className="hidden lg:flex items-center space-x-5 text-xs">
        
        {/* Speed Controls */}
        <div className="flex items-center space-x-1 bg-[#104439] px-2.5 py-1 rounded-lg border border-emerald-800">
          <button
            onClick={() => onChangeSpeed(Math.max(0.5, playbackSpeed - 0.25))}
            className="text-emerald-300 hover:text-white p-0.5 cursor-pointer"
            title="Slower"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="font-semibold px-1 min-w-[28px] text-center font-mono">
            {playbackSpeed}x
          </span>
          <button
            onClick={() => onChangeSpeed(Math.min(1.5, playbackSpeed + 0.25))}
            className="text-emerald-300 hover:text-white p-0.5 cursor-pointer"
            title="Faster"
          >
            <Plus className="w-3 h-3" />
          </button>
          <span className="text-[10px] text-emerald-300/80 ml-1">Speed</span>
        </div>

        {/* Transpose Controls */}
        <div className="flex items-center space-x-1 bg-[#104439] px-2.5 py-1 rounded-lg border border-emerald-800">
          <button
            onClick={() => onChangeTranspose(transposeSemitones - 1)}
            className="text-emerald-300 hover:text-white p-0.5 cursor-pointer"
            title="Lower pitch"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="font-semibold px-1 min-w-[20px] text-center font-mono">
            {transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones}
          </span>
          <button
            onClick={() => onChangeTranspose(transposeSemitones + 1)}
            className="text-emerald-300 hover:text-white p-0.5 cursor-pointer"
            title="Raise pitch"
          >
            <Plus className="w-3 h-3" />
          </button>
          <span className="text-[10px] text-emerald-300/80 ml-1">Pitch</span>
        </div>

        {/* Metronome Toggle */}
        <button
          onClick={onToggleMetronome}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
            isMetronomeActive
              ? 'bg-emerald-500 text-white border-emerald-400 font-bold shadow-xs'
              : 'bg-[#104439] text-emerald-200 border-emerald-800 hover:text-white'
          }`}
          title="Metronome click"
        >
          <Music4 className="w-3.5 h-3.5" />
          <span>Metronome</span>
        </button>
      </div>

      {/* Right: 3 View Modes & Zoom (Desktop ONLY, hidden on mobile as requested) */}
      <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
        
        {/* Mobile quick speed toggle */}
        <div className="flex lg:hidden items-center bg-[#104439] px-2 py-1 rounded-lg border border-emerald-800 text-[11px] font-mono">
          <button
            onClick={() => onChangeSpeed(playbackSpeed === 1 ? 0.75 : playbackSpeed === 0.75 ? 0.5 : 1)}
            className="text-emerald-200 hover:text-white font-bold"
          >
            {playbackSpeed}x
          </button>
        </div>

        {/* View Mode Switcher Pills (Hidden on mobile per instruction: "在手机模式下不需要切换到其他view") */}
        <div className="hidden md:flex items-center bg-[#0d3b32] p-0.5 rounded-lg border border-emerald-800" title="Score View Modes">
          {/* Mode 1: Page View (transcription-view1.png) */}
          <button
            onClick={() => onChangeViewMode('page')}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              viewMode === 'page'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-300 hover:text-white'
            }`}
            title="Page View (Sheet Music)"
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* Mode 2: Continuous Single Line View (transcription-view2.png) */}
          <button
            onClick={() => onChangeViewMode('continuous')}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              viewMode === 'continuous'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-300 hover:text-white'
            }`}
            title="Continuous Single Line Horizontal Scroll"
          >
            <Columns className="w-4 h-4" />
          </button>

          {/* Mode 3: Vertical Scroll View (transcription-view3.png) */}
          <button
            onClick={() => onChangeViewMode('vertical')}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              viewMode === 'vertical'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-300 hover:text-white'
            }`}
            title="Vertical Scroll View"
          >
            <Rows className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom Controls (Desktop only) */}
        <div className="hidden md:flex items-center space-x-1 text-emerald-200 bg-[#104439] px-2 py-1 rounded-lg border border-emerald-800">
          <button
            onClick={() => onChangeZoom(Math.max(0.7, zoomLevel - 0.1))}
            className="hover:text-white cursor-pointer"
            title="Zoom Out"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="font-mono text-[11px] px-1">{Math.round(zoomLevel * 100)}%</span>
          <button
            onClick={() => onChangeZoom(Math.min(1.4, zoomLevel + 0.1))}
            className="hover:text-white cursor-pointer"
            title="Zoom In"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

    </div>
  );
};
