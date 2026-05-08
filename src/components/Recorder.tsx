import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2, Save, Wand2, Music, Volume2, Search, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { AudioRecording, VOICES, BG_TRACKS, BackgroundTrack } from '../types';
import { suggestMusicStyle } from '../services/geminiService';

interface RecorderProps {
  onSave: (recording: Partial<AudioRecording>) => void;
}

export function Recorder({ onSave }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(40).fill(0));
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0]);
  const [showPitchShift, setShowPitchShift] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [showBackground, setShowBackground] = useState(false);
  const [bgMusic, setBgMusic] = useState<BackgroundTrack | null>(null);
  const [bgVolume, setBgVolume] = useState(0.5);
  const [bgAudioBuffer, setBgAudioBuffer] = useState<AudioBuffer | null>(null);
  const [bgPreviewPlaying, setBgPreviewPlaying] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const togglePreview = (track: BackgroundTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    if (bgPreviewPlaying === track.id) {
      previewAudioRef.current?.pause();
      setBgPreviewPlaying(null);
    } else {
      if (previewAudioRef.current) {
        previewAudioRef.current.src = track.url;
        previewAudioRef.current.volume = bgVolume;
        previewAudioRef.current.play();
        setBgPreviewPlaying(track.id);
      }
    }
  };

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.onpause = () => setBgPreviewPlaying(null);
    previewAudioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.volume = bgVolume;
    }
  }, [bgVolume]);

  useEffect(() => {
    const loadBgMusic = async () => {
      if (!bgMusic) {
        setBgAudioBuffer(null);
        return;
      }
      try {
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx = new AudioContextClass();
        const response = await fetch(bgMusic.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        setBgAudioBuffer(audioBuffer);
        await ctx.close();
      } catch (err) {
        console.error("Error pre-loading background music:", err);
        setBgAudioBuffer(null);
      }
    };
    loadBgMusic();
  }, [bgMusic]);

  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setBgMusic({
        id: 'custom-' + Date.now(),
        name: file.name.split('.')[0],
        url: url
      });
    }
  };
  const [moodInput, setMoodInput] = useState('');
  const [effects, setEffects] = useState({
    pitch: 1.0,
    distortion: 0,
    reverb: 0
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const createDistortionCurve = (amount: number) => {
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  };

  const startRecording = async () => {
    // Stop any preview playback
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setBgPreviewPlaying(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      audioContextRef.current = new AudioContextClass();
      const ctx = audioContextRef.current;
      
      const source = ctx.createMediaStreamSource(stream);
      const destination = ctx.createMediaStreamDestination();
      
      // Background Music Node
      const bgGain = ctx.createGain();
      bgGain.gain.value = bgVolume;

      if (bgAudioBuffer) {
        const bgSource = ctx.createBufferSource();
        bgSource.buffer = bgAudioBuffer;
        bgSource.loop = true;
        bgSource.connect(bgGain);
        bgGain.connect(destination);
        bgGain.connect(ctx.destination); // Monitor BG music while recording
        bgSource.start();
      }

      // Distortion Node
      const distortionNode = ctx.createWaveShaper();
      distortionNode.curve = createDistortionCurve(effects.distortion * 100);
      distortionNode.oversample = '4x';

      // Echo/Reverb Node (Simulated)
      const echoNode = ctx.createDelay();
      echoNode.delayTime.value = effects.reverb * 0.5;
      const feedback = ctx.createGain();
      feedback.gain.value = effects.reverb * 0.4;
      
      echoNode.connect(feedback);
      feedback.connect(echoNode);

      const merger = ctx.createGain();
      
      source.connect(distortionNode);
      distortionNode.connect(merger);
      
      if (effects.reverb > 0) {
        distortionNode.connect(echoNode);
        echoNode.connect(merger);
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      merger.connect(analyser);
      merger.connect(destination);
      
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(destination.stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      visualize();
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const visualize = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    
    const update = () => {
      analyserRef.current!.getByteFrequencyData(dataArray);
      const normalizedData = Array.from(dataArray.slice(0, 40)).map(val => val / 255);
      setVisualizerData(normalizedData);
      animationFrameRef.current = requestAnimationFrame(update);
    };

    update();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSave = () => {
    if (audioUrl) {
      onSave({
        name: `Recording ${new Date().toLocaleTimeString()}`,
        url: audioUrl,
        duration: recordingTime,
        createdAt: Date.now(),
        type: 'audio',
        voiceEffect: selectedVoice.id,
        effects: effects
      });
      setAudioUrl(null);
      setRecordingTime(0);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="bento-card p-8 flex flex-col items-center justify-center space-y-8 min-h-[300px] relative overflow-hidden bg-[#0F0F15]">
        {/* Atmosphere background lines */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.1),transparent_70%)]" />
        </div>

        <div className="text-center z-10">
          <h2 className="font-sans font-bold text-lg text-indigo-400 mb-1 uppercase tracking-[0.2em]">Live Input</h2>
          <p className="font-mono text-[10px] opacity-40">
            {isRecording ? "Capturing Processed Audio..." : "Microphone Standby"}
          </p>
        </div>

        <div className="flex items-end justify-center h-16 gap-1 w-full max-w-sm px-4 inner-depth py-4 bg-black/20 rounded-3xl">
          {visualizerData.map((val, i) => (
            <motion.div
              key={i}
              className="waveform-bar w-1.5"
              animate={{ height: `${Math.max(10, val * 100)}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            />
          ))}
        </div>

        <div className="text-4xl font-mono font-black tracking-tighter tabular-nums text-white">
          {formatTime(recordingTime)}
        </div>

        <div className="flex items-center gap-6 z-10">
          {!isRecording && !audioUrl ? (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={startRecording}
              className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center glow-accent cursor-pointer shadow-lg shadow-indigo-600/20"
            >
              <Mic className="text-white w-8 h-8" />
            </motion.button>
          ) : isRecording ? (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={stopRecording}
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center cursor-pointer"
            >
              <Square className="text-black w-7 h-7" />
            </motion.button>
          ) : (
            <div className="flex gap-4">
              <button 
                onClick={() => setAudioUrl(null)}
                className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
                title="Discard"
              >
                <Trash2 className="w-6 h-6 text-red-500/50" />
              </button>
              <button 
                onClick={handleSave}
                className="px-8 py-4 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all flex items-center gap-2 shadow-xl shadow-indigo-600/10"
              >
                <Save className="w-5 h-5" />
                Commit to Master
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Control Strip */}
      <div className="flex flex-wrap gap-4 justify-between">
        <div className="flex gap-2">
          <button 
            onClick={() => { setShowPitchShift(!showPitchShift); setShowEffects(false); }}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all text-[10px] font-black uppercase tracking-widest depth-button",
              showPitchShift ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
            )}
          >
            <Wand2 className="w-4 h-4" />
            Vocal Profile: {selectedVoice.name}
          </button>
          <button 
            onClick={() => { setShowEffects(!showEffects); setShowPitchShift(false); }}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all text-[10px] font-black uppercase tracking-widest depth-button",
              showEffects ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
            )}
          >
            <Volume2 className="w-4 h-4" />
            FX Rack
          </button>
          <button 
            onClick={() => { setShowBackground(!showBackground); setShowEffects(false); setShowPitchShift(false); }}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all text-[10px] font-black uppercase tracking-widest depth-button",
              showBackground ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
            )}
          >
            <Music className="w-4 h-4" />
            Background: {bgMusic ? bgMusic.name : 'Off'}
          </button>
        </div>

        <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-2xl border border-white/5">
          <Volume2 className="w-4 h-4 opacity-50" />
          <input 
            type="range" min="0" max="1" step="0.1" 
            value={bgVolume} 
            onChange={(e) => setBgVolume(parseFloat(e.target.value))}
            className="accent-indigo-500 w-24" 
            title="BG Volume"
          />
        </div>
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {showBackground && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bento-card p-8 overflow-hidden glass-3d"
          >
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-6 font-black">Atmosphere selection</h3>
            
            <div className="mb-8 p-6 bg-black/20 border border-white/5 rounded-[2.5rem] inner-depth">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/50">AI Atmosphere Generator</span>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Describe the vibe (e.g. moody rainy night, high energy workout)..." 
                  className="flex-1 bg-black/40 border border-white/5 rounded-2xl px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 inner-depth"
                  value={moodInput}
                  onChange={(e) => setMoodInput(e.target.value)}
                />
                <button 
                  onClick={async () => {
                    if (!moodInput) return;
                    setIsSuggesting(true);
                    try {
                      const suggestion = await suggestMusicStyle(moodInput);
                      const track = BG_TRACKS.find(t => t.name.toLowerCase().includes(suggestion.toLowerCase()));
                      if (track) setBgMusic(track);
                    } finally {
                      setIsSuggesting(false);
                    }
                  }}
                  disabled={isSuggesting}
                  className="px-6 py-2 bg-indigo-600 rounded-2xl text-[10px] font-bold uppercase transition-all disabled:opacity-50 depth-button"
                >
                  {isSuggesting ? "Synthesizing..." : "Generate"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <label className="flex flex-col items-center justify-center p-4 rounded-3xl border border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer depth-button group">
                <Music className="w-5 h-5 mb-2 group-hover:text-indigo-400 transition-colors" />
                <span className="text-[10px] font-black uppercase tracking-widest text-center">Upload Custom</span>
                <input type="file" accept="audio/*" className="hidden" onChange={handleCustomBgUpload} />
              </label>
              
              <button
                onClick={() => setBgMusic(null)}
                className={cn(
                  "flex flex-col items-start p-4 rounded-3xl border transition-all text-left",
                  !bgMusic 
                    ? "bg-indigo-600 border-indigo-500 text-white" 
                    : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10"
                )}
              >
                <span className="text-xs font-black uppercase tracking-widest mb-1">None / Silent</span>
                <span className="text-[9px] uppercase font-mono opacity-50 text-slate-500">Pure Vocals</span>
              </button>
              {BG_TRACKS.map((track) => (
                <button
                  key={track.id}
                  onClick={() => setBgMusic(track)}
                  className={cn(
                    "flex flex-col items-start p-4 rounded-3xl border transition-all text-left depth-button",
                    bgMusic?.id === track.id 
                      ? "bg-indigo-600 border-indigo-500 text-white" 
                      : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10"
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-black uppercase tracking-widest">{track.name}</span>
                    <button 
                      onClick={(e) => togglePreview(track, e)}
                      className="p-1 rounded-full bg-white/10 hover:bg-white/20 transition-all"
                    >
                      {bgPreviewPlaying === track.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                  </div>
                  <span className={cn(
                    "text-[9px] uppercase font-mono",
                    bgMusic?.id === track.id ? "text-indigo-200" : "text-slate-600"
                  )}>Preset Loop</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {showPitchShift && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bento-card p-8 overflow-hidden glass-3d"
          >
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-6 font-black">Select Vocal Character</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {VOICES.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice)}
                  className={cn(
                    "flex flex-col items-start p-4 rounded-3xl border transition-all text-left depth-button",
                    selectedVoice.id === voice.id 
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20" 
                      : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10"
                  )}
                >
                  <span className="text-xs font-black uppercase tracking-widest mb-1">{voice.name}</span>
                  <span className={cn(
                    "text-[9px] uppercase font-mono",
                    selectedVoice.id === voice.id ? "text-indigo-200" : "text-slate-600"
                  )}>{voice.gender}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {showEffects && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bento-card p-8 overflow-hidden glass-3d"
          >
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-6 font-black">Audio Processing rack</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Pitch Scale</label>
                  <span className="text-[10px] font-mono text-white/40">{effects.pitch.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="2.0" step="0.1" 
                  value={effects.pitch} 
                  onChange={(e) => setEffects({...effects, pitch: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500 inner-depth" 
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Distortion</label>
                  <span className="text-[10px] font-mono text-white/40">{Math.round(effects.distortion * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.01" 
                  value={effects.distortion} 
                  onChange={(e) => setEffects({...effects, distortion: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500 inner-depth" 
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Reverb / Echo</label>
                  <span className="text-[10px] font-mono text-white/40">{Math.round(effects.reverb * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.01" 
                  value={effects.reverb} 
                  onChange={(e) => setEffects({...effects, reverb: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500 inner-depth" 
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
