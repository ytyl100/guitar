import React, { useState, useEffect, useRef } from 'react';
import { 
  GripVertical, 
  Volume2, 
  VolumeX, 
  Settings, 
  Maximize2, 
  Minimize2, 
  Minus, 
  X, 
  Play, 
  Pause, 
  Pin, 
  ExternalLink,
  Sparkles,
  Music2
} from 'lucide-react';

interface VideoPlayerWindowProps {
  videoUrl?: string;
  videoTitle: string;
  videoArtist: string;
  videoThumbnail?: string;
  currentTimeSeconds: number;
  totalDurationSeconds: number;
  isPlaying: boolean;
  audioTrack: 'transcribed' | 'original';
  isDocked: boolean;
  isMinimized: boolean;
  floatingPosition: { x: number; y: number };
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  onDockToggle: (forceDock?: boolean) => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  isMobile?: boolean;
}

export const VideoPlayerWindow: React.FC<VideoPlayerWindowProps> = ({
  videoUrl,
  videoTitle,
  videoArtist,
  videoThumbnail = 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=480&auto=format&fit=crop&q=80',
  currentTimeSeconds,
  totalDurationSeconds,
  isPlaying,
  audioTrack,
  isDocked,
  isMinimized,
  floatingPosition,
  onTogglePlay,
  onSeek,
  onClose,
  onMinimize,
  onRestore,
  onDockToggle,
  onPositionChange,
  isMobile = false,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [showCc, setShowCc] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isNearDockZone, setIsNearDockZone] = useState(false);
  const isNearDockZoneRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const safeSecs = Math.max(0, Math.floor(secs));
    const mins = Math.floor(safeSecs / 60);
    const remainder = safeSecs % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  // Video scrubber drag
  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSec = parseFloat(e.target.value);
    onSeek(newSec);
  };

  // Drag-and-drop handler for the top-left handle (matching youtube1.png red box)
  const handleGrabMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If currently docked, get its current absolute bounding rect before undocking
    let currentX = floatingPosition.x;
    let currentY = floatingPosition.y;

    if (isDocked && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      currentX = rect.left;
      currentY = rect.top;
      onDockToggle(false); // Undock to floating mode
    }

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: currentX,
      startY: currentY,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;

      // Keep within viewport boundaries
      const newX = Math.max(10, Math.min(window.innerWidth - 320, dragStartRef.current.startX + dx));
      const newY = Math.max(60, Math.min(window.innerHeight - 200, dragStartRef.current.startY + dy));

      // Magnetic snap detection: if dragged back towards the fretboard tail (bottom right)
      const nearFretboard = !isMobile && (e.clientY > window.innerHeight - 280) && (e.clientX > window.innerWidth * 0.4);
      setIsNearDockZone(nearFretboard);
      isNearDockZoneRef.current = nearFretboard;

      onPositionChange({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      // If released while hovering near the fretboard dock zone, automatically snap back!
      if (isNearDockZoneRef.current) {
        onDockToggle(true);
      }
      setIsDragging(false);
      setIsNearDockZone(false);
      isNearDockZoneRef.current = false;
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isMobile, onDockToggle, onPositionChange]);

  // Animated Guitar Performance Canvas simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let frame = 0;

    const render = () => {
      frame++;
      const w = canvas.width;
      const h = canvas.height;

      // Dark stage gradient
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#111827');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#090d16');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Warm studio spotlight
      const spot = ctx.createRadialGradient(w * 0.45, h * 0.4, 10, w * 0.45, h * 0.4, w * 0.6);
      spot.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
      spot.addColorStop(0.6, 'rgba(168, 85, 247, 0.12)');
      spot.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, w, h);

      // Guitar neck in silhouette
      ctx.save();
      ctx.translate(w * 0.2, h * 0.6);
      ctx.rotate(-0.18);

      // Fretboard body
      ctx.fillStyle = '#29180f';
      ctx.fillRect(0, -18, w * 0.9, 36);

      // Frets
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) {
        const fx = i * 22;
        ctx.beginPath();
        ctx.moveTo(fx, -18);
        ctx.lineTo(fx, 18);
        ctx.stroke();
      }

      // Strings with wave vibration when playing
      const vibrating = isPlaying;
      for (let s = 0; s < 6; s++) {
        const sy = -14 + s * 5.6;
        ctx.strokeStyle = s < 3 ? '#e5e7eb' : '#d97706';
        ctx.lineWidth = 0.8 + s * 0.25;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        if (vibrating) {
          const wave = Math.sin(frame * 0.4 + s * 1.5) * 1.5;
          ctx.quadraticCurveTo(w * 0.4, sy + wave, w * 0.9, sy);
        } else {
          ctx.lineTo(w * 0.9, sy);
        }
        ctx.stroke();
      }

      // Guitarist's hands silhouettes
      const handPulse = isPlaying ? Math.sin(frame * 0.25) * 6 : 0;
      ctx.fillStyle = 'rgba(253, 230, 138, 0.35)';
      ctx.beginPath();
      ctx.ellipse(w * 0.35 + handPulse, 0, 14, 20, 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Atmospheric subtle dust particles
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      for (let p = 0; p < 8; p++) {
        const px = ((frame * 0.4 + p * 40) % w);
        const py = ((frame * 0.2 + p * 25) % h);
        ctx.fillRect(px, py, 1.5, 1.5);
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying]);

  // If minimized, display compact pill in bottom right
  if (isMinimized) {
    return (
      <div 
        onClick={onRestore}
        className="fixed bottom-20 right-4 z-50 flex items-center space-x-2 px-3 py-2 bg-gray-900/95 hover:bg-gray-800 text-white rounded-2xl border border-gray-700 shadow-2xl backdrop-blur-md cursor-pointer transition-all hover:scale-105 active:scale-95 group animate-in fade-in"
        title="点击展开视频窗口 (Click to restore video window)"
      >
        <div className="w-6 h-6 rounded-lg overflow-hidden shrink-0 relative bg-emerald-950 border border-emerald-500/50 flex items-center justify-center">
          <img src={videoThumbnail} alt="thumb" className="w-full h-full object-cover opacity-80" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Play className="w-2.5 h-2.5 text-white fill-current" />
          </div>
        </div>

        <div className="flex flex-col text-left pr-1">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[11px] font-bold text-gray-200 group-hover:text-emerald-300 transition-colors truncate max-w-[130px]">
              {videoTitle}
            </span>
          </div>
          <span className="text-[9px] font-mono text-gray-400">
            {formatTime(currentTimeSeconds)} / {formatTime(totalDurationSeconds)}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 cursor-pointer"
          title="关闭视频"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Common inner video UI (matching youtube1.png)
  const videoInnerContent = (
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden flex flex-col group select-none">
      
      {/* Background canvas / simulated guitar video */}
      <canvas 
        ref={canvasRef} 
        width={340} 
        height={190} 
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Subtle vignette shadow gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/70 pointer-events-none" />

      {/* TOP BAR OVERLAY (matching youtube1.png) */}
      <div className="relative z-20 px-2 py-1.5 flex items-center justify-between text-white">
        
        {/* Left: Drag Handle (The red rectangle in youtube1.png!) */}
        <div className="flex items-center space-x-1.5">
          <button
            onMouseDown={handleGrabMouseDown}
            className={`flex items-center space-x-0.5 px-2 py-1 bg-black/60 hover:bg-emerald-600/80 text-white rounded-lg border border-white/20 transition-all cursor-grab active:cursor-grabbing shadow-sm group/drag ${
              isDragging ? 'ring-2 ring-emerald-400 bg-emerald-700' : ''
            }`}
            title="抓住把柄拖拽脱离 / 移动视频窗口 (Drag handle to undock or move)"
          >
            <GripVertical className="w-3.5 h-3.5 text-gray-200 group-hover/drag:text-white" />
            <span className="text-[10px] font-mono font-bold hidden sm:inline">::</span>
          </button>

          {/* Artist Avatar & Song title (as seen in youtube1.png) */}
          <div className="flex items-center space-x-1.5 min-w-0 pr-1">
            <div className="w-5 h-5 rounded-full overflow-hidden border border-white/40 shrink-0">
              <img src={videoThumbnail} alt="avatar" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-bold text-gray-100 truncate max-w-[110px] leading-tight">
                {videoTitle}
              </span>
              <span className="text-[9px] text-gray-400 truncate max-w-[110px] leading-none">
                {videoArtist}
              </span>
            </div>
          </div>
        </div>

        {/* Right Action Icons (Volume, CC, Settings, Dock/Undock, Minimize, Close) */}
        <div className="flex items-center space-x-1 text-gray-300">
          {/* Sound Mute/Unmute */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors"
            title={isMuted ? '取消静音' : '静音'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* CC Subtitles badge */}
          <button
            onClick={() => setShowCc(!showCc)}
            className={`px-1 py-0.5 rounded text-[9px] font-mono font-bold transition-colors ${
              showCc ? 'bg-white/30 text-white' : 'text-gray-400 hover:text-white'
            }`}
            title="Subtitles / CC"
          >
            CC
          </button>

          {/* Dock / Undock Toggle Button */}
          {!isMobile && (
            <button
              onClick={() => onDockToggle()}
              className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors"
              title={isDocked ? '脱离指板（浮动窗口）' : '贴回指板尾部'}
            >
              <Pin className={`w-3.5 h-3.5 ${isDocked ? 'text-emerald-400 rotate-45' : 'text-gray-400'}`} />
            </button>
          )}

          {/* Minimize button */}
          <button
            onClick={onMinimize}
            className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="缩小到按钮"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 hover:text-rose-400 hover:bg-white/10 rounded transition-colors"
            title="关闭视频窗口"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* CENTER PLAY/PAUSE BIG OVERLAY (matching youtube1.png) */}
      <div 
        onClick={onTogglePlay}
        className="flex-1 flex items-center justify-center cursor-pointer z-10"
      >
        <div className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-all hover:scale-110 border border-white/20 shadow-lg">
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-white" />
          ) : (
            <Play className="w-4 h-4 fill-white ml-0.5" />
          )}
        </div>
      </div>

      {/* BOTTOM SCRUBBER & TIMELINE OVERLAY (matching youtube1.png) */}
      <div className="relative z-20 px-2.5 pb-2 pt-1 flex flex-col space-y-1 text-white">
        
        {/* Progress Scrubber Bar */}
        <div className="relative w-full flex items-center group/scrubber">
          <input
            type="range"
            min={0}
            max={totalDurationSeconds || 30}
            step={0.1}
            value={currentTimeSeconds}
            onChange={handleScrubberChange}
            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:h-1.5 transition-all"
          />
        </div>

        {/* Time and Mode indicators */}
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-300">
          <div className="flex items-center space-x-1.5">
            <span className="font-bold text-white">
              {formatTime(currentTimeSeconds)}
            </span>
            <span className="text-gray-400">/</span>
            <span className="text-gray-400">
              {formatTime(totalDurationSeconds)}
            </span>
          </div>

          <div className="flex items-center space-x-1 text-[9px] font-sans">
            <span className={`px-1.5 py-0.2 rounded font-semibold ${
              audioTrack === 'original' 
                ? 'bg-emerald-600 text-white shadow-2xs' 
                : 'bg-white/20 text-gray-300'
            }`}>
              {audioTrack === 'original' ? '原声视频播放中' : '乐谱自合成中'}
            </span>
          </div>
        </div>

      </div>

    </div>
  );

  // If MOBILE mode: render directly inline inside the mobile panel
  if (isMobile) {
    return (
      <div 
        ref={containerRef}
        className="w-full h-full p-1 bg-[#121315] flex flex-col justify-center animate-in fade-in"
      >
        {videoInnerContent}
      </div>
    );
  }

  // If DOCKED mode (desktop mode, sits at the tail of the guitar fretboard)
  if (isDocked) {
    return (
      <div 
        ref={containerRef}
        className="w-72 sm:w-80 md:w-84 h-full shrink-0 p-1.5 bg-[#121315] border-l border-gray-700/80 flex flex-col justify-center animate-in fade-in"
      >
        {videoInnerContent}
      </div>
    );
  }

  // If FLOATING mode (dragged out anywhere on the screen)
  return (
    <div
      ref={containerRef}
      style={{
        left: `${floatingPosition.x}px`,
        top: `${floatingPosition.y}px`,
      }}
      className={`fixed z-50 w-72 sm:w-80 h-48 shadow-2xl rounded-xl ring-2 transition-all p-1 ${
        isNearDockZone
          ? 'ring-4 ring-emerald-400 bg-emerald-950/90 shadow-[0_0_25px_rgba(16,185,129,0.7)] scale-105'
          : 'ring-emerald-500/50 bg-[#121315]'
      } ${isDragging ? 'opacity-95' : ''}`}
    >
      {/* Magnetic snap prompt banner when hovering over fretboard tail */}
      {isNearDockZone && (
        <div className="absolute inset-x-2 -top-8 z-40 py-1 px-2 bg-emerald-600 text-white text-[11px] font-bold text-center rounded-lg shadow-xl animate-bounce border border-emerald-300">
          🧲 松开鼠标即可黏回把位尾部！
        </div>
      )}
      {videoInnerContent}
    </div>
  );
};
