/**
 * Web Audio API Plucked String Synthesizer & Metronome Engine
 */

class GuitarAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public getContext(): AudioContext {
    this.initContext();
    return this.ctx!;
  }

  /**
   * Plays a single guitar note with realistic pluck, sub-millisecond precision scheduling, and acoustic resonance
   */
  public playNote(
    midi: number, 
    duration = 1.0, 
    velocity = 0.8, 
    instrument: 'acoustic' | 'electric' | 'bass' = 'acoustic',
    when?: number,
    isOriginalTrack = false
  ) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const audioNow = this.ctx.currentTime;
    const startTime = when !== undefined ? Math.max(audioNow, when) : audioNow;

    // Body resonance & filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff = isOriginalTrack ? 4200 : instrument === 'bass' ? 1200 : 3500;
    filter.frequency.setValueAtTime(cutoff, startTime);
    filter.frequency.exponentialRampToValueAtTime(instrument === 'bass' ? 300 : 800, startTime + duration);

    // Note envelope gain
    const noteGain = this.ctx.createGain();
    noteGain.gain.setValueAtTime(0.0001, startTime);
    // Instant attack (pluck) - crisp 3ms linear ramp for zero auditory lag
    noteGain.gain.linearRampToValueAtTime(velocity, startTime + 0.003);
    // Natural acoustic guitar decay curve
    const decayTime = Math.min(duration, isOriginalTrack ? 4.0 : 3.5);
    noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + decayTime);

    // Multi-harmonic oscillator for string simulation
    const osc1 = this.ctx.createOscillator();
    osc1.type = isOriginalTrack ? 'sawtooth' : instrument === 'electric' ? 'sawtooth' : 'triangle';
    osc1.frequency.setValueAtTime(freq, startTime);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, startTime); // 2nd harmonic octave

    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.setValueAtTime(isOriginalTrack ? 0.35 : 0.25, startTime);
    osc2Gain.gain.exponentialRampToValueAtTime(0.001, startTime + (decayTime * 0.6));

    // Connect node graph
    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);

    // Add extra warm acoustic body resonance if isOriginalTrack for full studio performance
    if (isOriginalTrack) {
      const osc3 = this.ctx.createOscillator();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(freq * 0.5, startTime); // warm sub-octave acoustic wood resonance
      const osc3Gain = this.ctx.createGain();
      osc3Gain.gain.setValueAtTime(0.22, startTime);
      osc3Gain.gain.exponentialRampToValueAtTime(0.001, startTime + decayTime * 0.8);
      osc3.connect(osc3Gain);
      osc3Gain.connect(filter);
      osc3.start(startTime);
      osc3.stop(startTime + decayTime + 0.1);
    }

    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + decayTime + 0.1);
    osc2.stop(startTime + decayTime + 0.1);
  }

  /**
   * Plays a metronome click with precise timing
   */
  public playClick(isDownbeat = false, when?: number) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const audioNow = this.ctx.currentTime;
    const startTime = when !== undefined ? Math.max(audioNow, when) : audioNow;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, startTime);
    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + 0.05);
  }

  public setVolume(volume: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime);
    }
  }

  /**
   * Plays an acoustic guitar chord strum downwards with realistic string separation
   */
  public playChordFrets(frets: (number | 'x')[], strumSpeed = 0.035) {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const baseMidis = [40, 45, 50, 55, 59, 64]; // string 6 down to 1 (Low E to High E)
    let count = 0;
    for (let stringIdx = 0; stringIdx < frets.length; stringIdx++) {
      const fret = frets[stringIdx];
      if (typeof fret === 'number') {
        const midi = baseMidis[stringIdx] + fret;
        this.playNote(midi, 2.5, 0.85, 'acoustic', now + count * strumSpeed);
        count++;
      }
    }
  }
}

export const guitarAudio = new GuitarAudioEngine();
