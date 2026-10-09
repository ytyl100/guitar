import React, { useState } from 'react';
import { 
  X, 
  ChevronDown, 
  Sparkles, 
  Check, 
  ShieldCheck, 
  Music, 
  Mic, 
  Layers, 
  CheckCircle,
  HelpCircle,
  SlidersHorizontal
} from 'lucide-react';
import { TranscriptionJobSettings } from '../types/music';

interface WizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: { type: 'upload' | 'url' | 'record'; name: string; file?: File; url?: string };
  onStartTranscription: (settings: TranscriptionJobSettings) => void;
}

const INSTRUMENTS = [
  { id: 'piano', label: 'Piano', icon: '🎹', beta: false },
  { id: 'piano_vocals', label: 'Piano + Vocals', icon: '🎹🎤', beta: true },
  { id: 'lead_sheet', label: 'Lead Sheet', icon: '🎼', beta: true },
  { id: 'flute', label: 'Flute', icon: '🪈', beta: true },
  { id: 'acoustic_guitar', label: 'Acoustic Guitar', icon: '🎸', beta: true },
  { id: 'violin', label: 'Violin', icon: '🎻', beta: true },
  { id: 'trumpet', label: 'Trumpet', icon: '🎺', beta: true },
  { id: 'bass_guitar', label: 'Bass Guitar', icon: '🎸', beta: true },
  { id: 'double_bass', label: 'Double Bass', icon: '🎻', beta: true },
  { id: 'tenor_sax', label: 'Tenor Sax', icon: '🎷', beta: true },
  { id: 'drums', label: 'Drums', icon: '🥁', beta: true },
  { id: 'vocals', label: 'Vocals', icon: '🎤', beta: true },
  { id: 'multi_instrument', label: 'Multi-Instrument', icon: '🎛️', beta: true },
];

const TIME_SIGNATURES = [
  { value: 'predict', label: 'Let us predict ✨' },
  { value: '2/4', label: '2/4' },
  { value: '3/4', label: '3/4' },
  { value: '4/4', label: '4/4' },
  { value: '5/4', label: '5/4' },
  { value: '6/4', label: '6/4' },
  { value: '3/8', label: '3/8' },
  { value: '6/8', label: '6/8' },
  { value: '7/8', label: '7/8' },
  { value: '9/8', label: '9/8' },
  { value: '12/8', label: '12/8' },
  { value: '2/2', label: '2/2' },
  { value: '3/2', label: '3/2' },
  { value: 'C', label: 'C (Common Time)' },
  { value: 'cut', label: '𝄵 (Cut Time)' },
];

const KEY_SIGNATURES = [
  { value: 'predict', label: 'Let us predict ✨', flats: 0, sharps: 0 },
  { value: 'C/Am', label: 'C / Am', flats: 0, sharps: 0, desc: 'Natural' },
  { value: 'G/Em', label: 'G / Em', sharps: 1, desc: '1 Sharp (F#)' },
  { value: 'D/Bm', label: 'D / Bm', sharps: 2, desc: '2 Sharps (F#, C#)' },
  { value: 'A/F#m', label: 'A / F#m', sharps: 3, desc: '3 Sharps' },
  { value: 'E/C#m', label: 'E / C#m', sharps: 4, desc: '4 Sharps' },
  { value: 'B/G#m', label: 'B / G#m', sharps: 5, desc: '5 Sharps' },
  { value: 'F#/D#m', label: 'F# / D#m', sharps: 6, desc: '6 Sharps' },
  { value: 'C#/A#m', label: 'C# / A#m', sharps: 7, desc: '7 Sharps' },
  { value: 'F/Dm', label: 'F / Dm', flats: 1, desc: '1 Flat (Bb)' },
  { value: 'Bb/Gm', label: 'Bb / Gm', flats: 2, desc: '2 Flats (Bb, Eb)' },
  { value: 'Eb/Cm', label: 'Eb / Cm', flats: 3, desc: '3 Flats (Bb, Eb, Ab)' },
  { value: 'Ab/Fm', label: 'Ab / Fm', flats: 4, desc: '4 Flats' },
  { value: 'Db/Bbm', label: 'Db / Bbm', flats: 5, desc: '5 Flats' },
  { value: 'Gb/Ebm', label: 'Gb / Ebm', flats: 6, desc: '6 Flats' },
  { value: 'Cb/Abm', label: 'Cb / Abm', flats: 7, desc: '7 Flats' },
];

export const WizardModal: React.FC<WizardModalProps> = ({
  isOpen,
  onClose,
  source,
  onStartTranscription,
}) => {
  // Wizard steps: 1: Instrument, 4: Single/Multiple, 5: Only Guitar?, 6: Copyright
  const [currentStep, setCurrentStep] = useState<1 | 4 | 5 | 6>(1);
  
  // Form values
  const [selectedInstrument, setSelectedInstrument] = useState('acoustic_guitar');
  const [timeSignature, setTimeSignature] = useState('predict');
  const [keySignature, setKeySignature] = useState('Eb/Cm');
  const [lyrics, setLyrics] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [isKeyDropdownOpen, setIsKeyDropdownOpen] = useState(false);

  // Step 4 & 5 values
  const [isOnlyOneInstrument, setIsOnlyOneInstrument] = useState(true);
  const [isOnlyGuitar, setIsOnlyGuitar] = useState(true);
  const [agreedCopyright, setAgreedCopyright] = useState(true);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStep === 1) setCurrentStep(4);
    else if (currentStep === 4) setCurrentStep(5);
    else if (currentStep === 5) setCurrentStep(6);
    else if (currentStep === 6) {
      onStartTranscription({
        instrument: selectedInstrument,
        timeSignature: timeSignature === 'predict' ? '4/4' : timeSignature,
        keySignature: keySignature === 'predict' ? 'Eb/Cm' : keySignature,
        lyrics,
        isOnlyOneInstrument,
        isOnlyGuitar,
        agreedCopyright,
        sourceType: source.type,
        sourceName: source.name,
        audioUrl: source.url,
      });
    }
  };

  const handleBack = () => {
    if (currentStep === 6) setCurrentStep(5);
    else if (currentStep === 5) setCurrentStep(4);
    else if (currentStep === 4) setCurrentStep(1);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header with Title and Close Button */}
        <div className="px-6 pt-6 pb-2 flex items-center justify-between border-b border-gray-100">
          <div className="text-xs text-gray-500 font-medium">
            Source: <span className="font-semibold text-gray-800">{source.name}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-full p-1 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Switch between steps */}
        <div className="p-6 overflow-y-auto flex-1">
          
          {/* STEP 1: Instrument Selection (entrance1.png) */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">
                Which instrument do you want to transcribe for?
              </h2>

              {/* Instruments 4-column Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {INSTRUMENTS.map((inst) => {
                  const isSelected = selectedInstrument === inst.id;
                  return (
                    <button
                      key={inst.id}
                      onClick={() => setSelectedInstrument(inst.id)}
                      className={`relative p-3.5 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-700 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600'
                          : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {inst.beta && (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.2 bg-sky-100 text-sky-700 rounded text-[10px] font-semibold">
                          Beta
                        </span>
                      )}
                      <span className="text-2xl mb-1.5">{inst.icon}</span>
                      <span className="text-xs font-semibold text-gray-800 leading-tight">
                        {inst.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Advanced Settings Accordion (entrance1.png / entrance2.png / entrance3.png) */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50 mb-4">
                <button
                  type="button"
                  onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                  className="w-full px-4 py-3 flex items-center justify-center space-x-2 text-xs font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100/70 transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
                  <span>Advanced Settings</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isAdvancedOpen && (
                  <div className="p-4 border-t border-gray-200 bg-white space-y-4 text-xs">
                    {/* Time Signature & Key Signature Dropdowns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      {/* Time Signature (entrance2.png) */}
                      <div className="relative">
                        <label className="block text-gray-700 font-semibold mb-1">Time Signature</label>
                        <button
                          type="button"
                          onClick={() => {
                            setIsTimeDropdownOpen(!isTimeDropdownOpen);
                            setIsKeyDropdownOpen(false);
                          }}
                          className="w-full flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-800 hover:border-emerald-600 transition-colors"
                        >
                          <span className="font-medium">
                            {TIME_SIGNATURES.find((t) => t.value === timeSignature)?.label}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        </button>

                        {isTimeDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto p-1">
                            {TIME_SIGNATURES.map((ts) => (
                              <button
                                key={ts.value}
                                onClick={() => {
                                  setTimeSignature(ts.value);
                                  setIsTimeDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 rounded flex items-center justify-between hover:bg-emerald-50 text-xs ${
                                  timeSignature === ts.value ? 'bg-emerald-50 text-emerald-900 font-bold' : 'text-gray-700'
                                }`}
                              >
                                <span>{ts.label}</span>
                                {timeSignature === ts.value && <Check className="w-3.5 h-3.5 text-emerald-700" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Key Signature (entrance3.png) */}
                      <div className="relative">
                        <label className="block text-gray-700 font-semibold mb-1">Key Signature</label>
                        <button
                          type="button"
                          onClick={() => {
                            setIsKeyDropdownOpen(!isKeyDropdownOpen);
                            setIsTimeDropdownOpen(false);
                          }}
                          className="w-full flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-800 hover:border-emerald-600 transition-colors"
                        >
                          <span className="font-medium">
                            {KEY_SIGNATURES.find((k) => k.value === keySignature)?.label}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        </button>

                        {isKeyDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-20 max-h-56 overflow-y-auto p-1">
                            {KEY_SIGNATURES.map((ks) => (
                              <button
                                key={ks.value}
                                onClick={() => {
                                  setKeySignature(ks.value);
                                  setIsKeyDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 rounded flex items-center justify-between hover:bg-emerald-50 text-xs ${
                                  keySignature === ks.value ? 'bg-emerald-50 text-emerald-900 font-bold' : 'text-gray-700'
                                }`}
                              >
                                <div>
                                  <div className="font-semibold">{ks.label}</div>
                                  {ks.desc && <div className="text-[10px] text-gray-400">{ks.desc}</div>}
                                </div>
                                {keySignature === ks.value && <Check className="w-3.5 h-3.5 text-emerald-700" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lyrics field */}
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">LYRICS (OPTIONAL)</label>
                      <textarea
                        value={lyrics}
                        onChange={(e) => setLyrics(e.target.value)}
                        placeholder="Paste the song's lyrics here to sync them to the score. Section markers like [Chorus] are fine — they're stripped automatically."
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: What does your recording contain? (entrance4.png) */}
          {currentStep === 4 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">
                What does your recording contain?
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {/* Option 1: Only one instrument */}
                <button
                  type="button"
                  onClick={() => setIsOnlyOneInstrument(true)}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center text-center transition-all cursor-pointer ${
                    isOnlyOneInstrument
                      ? 'border-emerald-700 bg-emerald-50/40 shadow-sm ring-1 ring-emerald-600'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-100/60 flex items-center justify-center text-2xl mb-3 text-emerald-800">
                    🎸
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">Only one instrument</h3>
                  <p className="text-xs text-gray-500">
                    A single instrument playing on its own.
                  </p>
                </button>

                {/* Option 2: Multiple instruments */}
                <button
                  type="button"
                  onClick={() => setIsOnlyOneInstrument(false)}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center text-center transition-all cursor-pointer ${
                    !isOnlyOneInstrument
                      ? 'border-emerald-700 bg-emerald-50/40 shadow-sm ring-1 ring-emerald-600'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-teal-100/60 flex items-center justify-center text-xl mb-3 text-teal-800">
                    🎤🎸🥁
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">Multiple instruments</h3>
                  <p className="text-xs text-gray-500">
                    A full song — several instruments or voices playing together.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Does the recording contain only guitar? (entrance5.png) */}
          {currentStep === 5 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">
                Does the recording contain only guitar?
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* YES Card */}
                <button
                  type="button"
                  onClick={() => setIsOnlyGuitar(true)}
                  className={`p-8 rounded-2xl border-2 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                    isOnlyGuitar
                      ? 'border-emerald-700 bg-emerald-50/40 shadow-sm ring-1 ring-emerald-600'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <Check className="w-10 h-10 text-emerald-800 stroke-[3] mb-3" />
                  <span className="font-bold text-base text-gray-900">Yes</span>
                </button>

                {/* NO Card */}
                <button
                  type="button"
                  onClick={() => setIsOnlyGuitar(false)}
                  className={`p-8 rounded-2xl border-2 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                    !isOnlyGuitar
                      ? 'border-emerald-700 bg-emerald-50/40 shadow-sm ring-1 ring-emerald-600'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <X className="w-10 h-10 text-gray-700 stroke-[3] mb-3" />
                  <span className="font-bold text-base text-gray-900">No</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: Copyright Agreement (entrance6.png) */}
          {currentStep === 6 && (
            <div className="flex flex-col items-center text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Copyright
              </h2>

              {/* Shield Icon */}
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mb-6 border border-emerald-200">
                <ShieldCheck className="w-9 h-9 stroke-[2]" />
              </div>

              {/* Checkbox Box */}
              <div 
                onClick={() => setAgreedCopyright(!agreedCopyright)}
                className="w-full max-w-md p-4 rounded-xl border-2 border-emerald-700 bg-emerald-50/30 flex items-start space-x-3 text-left cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={agreedCopyright}
                  onChange={(e) => setAgreedCopyright(e.target.checked)}
                  className="mt-1 w-4 h-4 text-emerald-700 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer accent-emerald-700"
                />
                <label className="text-xs sm:text-sm font-medium text-gray-800 leading-snug cursor-pointer select-none">
                  I confirm that I own or have obtained all necessary rights to transcribe the selected audio file.
                </label>
              </div>

              <p className="text-[11px] text-gray-500 mt-4">
                By proceeding, you agree to our{' '}
                <a href="#terms" className="underline hover:text-emerald-700">Terms of Service</a>{' '}
                and{' '}
                <a href="#privacy" className="underline hover:text-emerald-700">Privacy Policy</a>.
              </p>
            </div>
          )}

        </div>

        {/* Footer Navigation Buttons */}
        <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-200/50 transition-colors"
          >
            Back
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={currentStep === 6 && !agreedCopyright}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            {currentStep === 6 ? 'Transcribe' : 'Next Step'}
          </button>
        </div>

      </div>
    </div>
  );
};
