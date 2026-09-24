/**
 * Web Audio Engine for GuitarMate:
 * - Guitar chord simulation & pluck sounds
 * - Tuner reference tones
 * - Metronome clicks
 * - Real-time microphone pitch detection (Autocorrelation)
 */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private isListening: boolean = false;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Play a realistic guitar string pluck tone using harmonic synthesis
  public playString(freq: number, durationSec: number = 2.0, delayMs: number = 0) {
    setTimeout(() => {
      try {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        // Base oscillator (fundamental)
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq * 2, now); // First harmonic

        // Lowpass filter to simulate wooden body acoustic resonance
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(freq * 5, 2500), now);
        filter.frequency.exponentialRampToValueAtTime(100, now + durationSec);

        const osc2Gain = ctx.createGain();
        osc2Gain.gain.setValueAtTime(0.25, now);

        osc.connect(filter);
        osc2.connect(osc2Gain);
        osc2Gain.connect(filter);

        filter.connect(gain);
        gain.connect(ctx.destination);

        // Pluck envelope: sharp attack, gentle decay
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + durationSec);
        osc2.stop(now + durationSec);
      } catch (e) {
        console.warn('Audio play error:', e);
      }
    }, delayMs);
  }

  // Guitar chord strum frequencies
  private chordFrequencies: Record<string, number[]> = {
    G: [98.0, 123.47, 146.83, 196.0, 246.94, 392.0], // 320003
    Em: [82.41, 123.47, 164.81, 196.0, 246.94, 329.63], // 022000
    C: [130.81, 164.81, 196.0, 261.63, 329.63], // x32010
    D: [146.83, 220.0, 293.66, 369.99], // xx0232
    A: [110.0, 164.81, 220.0, 277.18, 329.63], // x02220
    Am: [110.0, 164.81, 220.0, 261.63, 329.63], // x02210
    F: [87.31, 130.81, 174.61, 220.0, 261.63, 349.23], // 133211
    'D6/9': [146.83, 220.0, 246.94, 329.63], // xx0202
    E: [82.41, 123.47, 164.81, 207.65, 246.94, 329.63], // 022100
    Dm: [146.83, 220.0, 293.66, 349.23], // xx0231
  };

  public playChord(chordName: string, direction: 'down' | 'up' = 'down') {
    const freqs = this.chordFrequencies[chordName] || this.chordFrequencies['G'];
    const ordered = direction === 'down' ? freqs : [...freqs].reverse();
    ordered.forEach((freq, idx) => {
      this.playString(freq, 1.8, idx * 35); // 35ms strum arpeggio
    });
  }

  // Success chime when pitch is perfectly in tune
  public playTuneSuccessChime() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Two-note crystal chime (e.g. A5 -> E6)
      const freqs = [880, 1318.5];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.5);
      });
    } catch (e) {
      console.warn('Success chime error:', e);
    }
  }

  // Metronome click: high woodblock click for accent, lower click for normal beat
  public playMetronomeClick(isAccent: boolean) {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isAccent ? 1200 : 800, now);
      osc.frequency.exponentialRampToValueAtTime(isAccent ? 300 : 200, now + 0.05);

      gain.gain.setValueAtTime(isAccent ? 0.6 : 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {
      console.warn('Metronome click error:', e);
    }
  }

  // Microphonic Pitch Detection for Guitar Tuner & Chord Practice
  public async startListening(onPitchDetected: (pitchInfo: {
    freq: number;
    note: string;
    octave: number;
    cents: number;
    volume: number;
    inTune: boolean;
  }) => void): Promise<boolean> {
    try {
      const ctx = this.getContext();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia not supported');
        return false;
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      const source = ctx.createMediaStreamSource(this.micStream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);
      this.isListening = true;

      const buffer = new Float32Array(this.analyser.fftSize);

      const loop = () => {
        if (!this.isListening || !this.analyser) return;
        this.analyser.getFloatTimeDomainData(buffer);

        // Calculate RMS Volume
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          sumSquares += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sumSquares / buffer.length);

        if (rms > 0.015) {
          // Detect pitch via Autocorrelation
          const freq = this.autoCorrelate(buffer, ctx.sampleRate);
          if (freq > 60 && freq < 1200) {
            const { note, octave, cents } = this.freqToNote(freq);
            onPitchDetected({
              freq: Math.round(freq * 10) / 10,
              note,
              octave,
              cents,
              volume: Math.min(1, rms * 5),
              inTune: Math.abs(cents) <= 5,
            });
          }
        }

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
      return true;
    } catch (err) {
      console.warn('Failed to access microphone:', err);
      return false;
    }
  }

  public stopListening() {
    this.isListening = false;
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  // Autocorrelation algorithm to extract fundamental frequency
  private autoCorrelate(buf: Float32Array, sampleRate: number): number {
    const SIZE = buf.length;
    let maxSamples = Math.floor(SIZE / 2);
    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      const val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1; // Not enough signal

    let lastCorrelation = 1;
    for (let offset = 4; offset < maxSamples; offset++) {
      let correlation = 0;
      for (let i = 0; i < maxSamples; i++) {
        correlation += Math.abs(buf[i] - buf[i + offset]);
      }
      correlation = 1 - correlation / maxSamples;

      if (correlation > 0.9 && correlation > lastCorrelation) {
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = offset;
        }
      }
      lastCorrelation = correlation;
    }

    if (bestCorrelation > 0.1 && bestOffset > 0) {
      return sampleRate / bestOffset;
    }
    return -1;
  }

  // Convert Hz to Musical Note and Cents deviation
  private freqToNote(freq: number) {
    const noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midiNum = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
    const roundedMidi = Math.round(midiNum);
    const cents = Math.floor((midiNum - roundedMidi) * 100);
    const note = noteStrings[roundedMidi % 12];
    const octave = Math.floor(roundedMidi / 12) - 1;
    return { note, octave, cents };
  }
}

export const audioEngine = new AudioEngine();
