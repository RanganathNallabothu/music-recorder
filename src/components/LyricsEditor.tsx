import React, { useState, useRef } from 'react';
import { FileText, Languages, Download, Share2, Mail, Copy, Check, Wand2, PlayCircle, Users, Sparkles, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioRecording, VOICES } from '../types';
import { transcribeAudio, translateText, generateSpeech } from '../services/geminiService';
import { cn } from '../lib/utils';

interface LyricsEditorProps {
  recording: AudioRecording;
  onUpdate: (recording: AudioRecording) => void;
}

export function LyricsEditor({ recording, onUpdate }: LyricsEditorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab ] = useState<'original' | 'translated' | 'bilingual'>('original');
  const [copied, setCopied] = useState(false);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [isPlayingOriginal, setIsPlayingOriginal] = useState(false);
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [pauseThreshold, setPauseThreshold] = useState(0.5);
  const [gapThreshold, setGapThreshold] = useState(2.0);
  const [playingLineIndex, setPlayingLineIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  React.useEffect(() => {
    if (playingLineIndex !== null) {
      const lineElement = lineRefs.current.get(playingLineIndex);
      if (lineElement && scrollContainerRef.current) {
        lineElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [playingLineIndex]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlayingOriginal || !recording.timestamps || recording.timestamps.length === 0) {
      return;
    }

    const handleTimeUpdate = () => {
      const currentTime = audio.currentTime;
      const timestamps = recording.timestamps || [];
      
      let foundIndex = 0;
      for (let i = 0; i < timestamps.length; i++) {
        // If current time is within this line's range
        if (currentTime >= timestamps[i].startTime && currentTime <= timestamps[i].endTime) {
          foundIndex = i;
          break;
        }
        // Fallback: stay on the last line passed
        if (currentTime >= timestamps[i].startTime) {
          foundIndex = i;
        }
      }
      setPlayingLineIndex(foundIndex);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [isPlayingOriginal, recording.timestamps]);

  const silenceGaps = React.useMemo(() => {
    if (!recording.timestamps || recording.timestamps.length < 2) return new Map<number, { duration: number, type: 'pause' | 'gap' }>();
    const gaps = new Map<number, { duration: number, type: 'pause' | 'gap' }>();
    for (let i = 0; i < recording.timestamps.length - 1; i++) {
      const currentEnd = recording.timestamps[i].endTime;
      const nextStart = recording.timestamps[i + 1].startTime;
      const duration = nextStart - currentEnd;
      
      if (duration >= gapThreshold) {
        gaps.set(i, { duration, type: 'gap' });
      } else if (duration >= pauseThreshold) {
        gaps.set(i, { duration, type: 'pause' });
      }
    }
    return gaps;
  }, [recording.timestamps, pauseThreshold, gapThreshold]);

  const selectedVoice = VOICES.find(v => v.id === recording.voiceEffect) || VOICES[0];

  const stopAllAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlayingOriginal(false);
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      setIsPlayingTTS(false);
    }
    setPlayingLineIndex(null);
  };

  const handleTranscribe = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(recording.url);
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await transcribeAudio(base64);
        onUpdate({ ...recording, transcription: result.lyrics, timestamps: result.timestamps });
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTranslate = async (lang: string) => {
    if (!recording.transcription) return;
    setIsProcessing(true);
    try {
      const translated = await translateText(recording.transcription, lang);
      onUpdate({ ...recording, translation: translated });
      setActiveTab('translated');
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTTS = async (textOverride?: string, index?: number) => {
    const text = textOverride || (activeTab === 'original' ? recording.transcription : recording.translation);
    if (!text) return;
    
    stopAllAudio();
    
    if (index !== undefined) {
      setPlayingLineIndex(index);
    } else {
      setIsPlayingTTS(true);
    }

    try {
      const audioBase64 = await generateSpeech(text, selectedVoice.preset);
      const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
      ttsAudioRef.current = audio;
      audio.play();
      audio.onended = () => {
        setIsPlayingTTS(false);
        setPlayingLineIndex(null);
      };
    } catch (err) {
      console.error(err);
      setIsPlayingTTS(false);
      setPlayingLineIndex(null);
    }
  };

  const toggleOriginalPlayback = () => {
    if (isPlayingOriginal) {
      audioRef.current?.pause();
      setIsPlayingOriginal(false);
    } else {
      stopAllAudio();
      
      if (!audioRef.current) {
        audioRef.current = new Audio(recording.url);
        audioRef.current.onended = () => setIsPlayingOriginal(false);
      }
      audioRef.current.play();
      setIsPlayingOriginal(true);
    }
  };

  const copyToClipboard = () => {
    const text = activeTab === 'original' ? recording.transcription : recording.translation;
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareEmail = () => {
    const text = activeTab === 'original' ? recording.transcription : recording.translation;
    const subject = `Lyrics for ${recording.name}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text || '')}`);
  };

  const handleExportAudio = async () => {
    const text = activeTab === 'original' ? recording.transcription : recording.translation;
    if (!text) return;

    setIsExporting(true);
    try {
      const audioBase64 = await generateSpeech(text, selectedVoice.preset);
      const byteCharacters = atob(audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${recording.name}_vocal_ai.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportTxt = () => {
    const text = activeTab === 'original' ? recording.transcription : recording.translation;
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recording.name}_lyrics.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[#0F0F15] rounded-[3rem] border border-white/5 overflow-hidden shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] bento-card perspective-1000">
      <div className="p-8 pb-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/20 depth-button">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <h2 className="font-bold text-base text-white">{recording.name}</h2>
            <div className="flex items-center gap-2">
              <p className="text-[10px] uppercase font-mono tracking-widest text-slate-500 font-black">Lyric Engine 3.0</p>
              {isPlayingOriginal && (
                <motion.span 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-1 bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter border border-indigo-500/30"
                >
                  <span className="w-1 h-1 bg-indigo-400 rounded-full animate-pulse" />
                  Karaoke Sync Active
                </motion.span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {recording.transcription && (
            <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5 inner-depth">
              <button 
                onClick={() => setActiveTab('original')}
                className={cn(
                  "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                  activeTab === 'original' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-white"
                )}
              >
                Lyrics
              </button>
              {recording.translation && (
                <button 
                  onClick={() => setActiveTab('bilingual')}
                  className={cn(
                    "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                    activeTab === 'bilingual' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-white"
                  )}
                >
                  Dual
                </button>
              )}
              <button 
                onClick={() => setActiveTab('translated')}
                className={cn(
                  "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                  activeTab === 'translated' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-white"
                )}
              >
                Trans
              </button>
            </div>
          )}
          <button 
            disabled={isProcessing}
            onClick={recording.transcription ? () => handleTranslate('Spanish') : handleTranscribe}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 disabled:opacity-50 depth-button"
          >
            {isProcessing ? (
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              recording.transcription ? <Languages className="w-5 h-5 text-indigo-400" /> : <Wand2 className="w-5 h-5 text-indigo-400" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 relative p-8 mx-auto w-full max-w-4xl overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.05),transparent_70%)]" />
        
        <div 
          ref={scrollContainerRef}
          className="h-full overflow-y-auto custom-scrollbar font-serif text-xl sm:text-2xl leading-relaxed text-slate-300 whitespace-pre-wrap py-10 px-6 bg-black/20 rounded-[2.5rem] inner-depth border border-white/5 scroll-smooth"
        >
          {!recording.transcription && !isProcessing && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-30">
              <Sparkles className="w-16 h-16" />
              <p className="italic text-lg">Harness AI to extract lyrics from your recording</p>
              <button 
                onClick={handleTranscribe}
                className="px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-indigo-400 text-xs font-black uppercase tracking-[0.3em] hover:bg-white/10 transition-all depth-button"
              >
                Ignite Processing
              </button>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
              <div className="relative">
                <motion.div 
                  animate={{ scale: [1, 1.3, 1], rotate: [0, 90, 180, 270, 360] }} 
                  transition={{ repeat: Infinity, duration: 3 }}
                  className="w-20 h-20 border-t-2 border-r-2 border-indigo-500 rounded-3xl inner-depth"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 bg-indigo-500/20 blur-xl animate-pulse" />
                </div>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-indigo-400 animate-pulse">Synchronizing Neural Layers...</p>
            </div>
          )}

          {recording.transcription && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {activeTab === 'bilingual' ? (
                recording.transcription.split('\n').map((line, i) => {
                  const translatedLines = recording.translation?.split('\n') || [];
                  return (
                    <React.Fragment key={i}>
                      <div 
                        ref={el => el ? lineRefs.current.set(i, el) : lineRefs.current.delete(i)}
                        className={cn(
                        "group transition-all p-4 rounded-[2rem] border border-transparent hover:bg-white/5 hover:border-white/5 relative",
                        playingLineIndex === i && "bg-indigo-600/20 border-indigo-500/40 shadow-[0_0_30px_rgba(79,70,229,0.15)] scale-[1.02]"
                      )}>
                        {playingLineIndex === i && (
                          <motion.div 
                            layoutId="karaoke-glow"
                            className="absolute inset-0 bg-indigo-500/5 blur-2xl rounded-[2rem] -z-10"
                          />
                        )}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className={cn(
                              "font-bold leading-tight transition-all duration-500 text-2xl",
                              playingLineIndex === i ? "text-indigo-400 scale-[1.01] origin-left" : "text-white group-hover:text-indigo-300"
                            )}>
                              {line}
                            </p>
                            {translatedLines[i] && (
                              <p className={cn(
                                "text-lg mt-2 italic font-sans flex items-center gap-2 transition-colors",
                                playingLineIndex === i ? "text-indigo-300/80" : "text-indigo-400/60"
                              )}>
                                {translatedLines[i]}
                              </p>
                            )}
                          </div>
                          <button 
                            onClick={() => handleTTS(line, i)}
                            className={cn(
                              "p-3 rounded-2xl transition-all depth-button group-hover:opacity-100",
                              playingLineIndex === i ? "bg-indigo-600 text-white scale-110" : "bg-white/5 text-slate-500 hover:text-indigo-400 opacity-0"
                            )}
                          >
                            <PlayCircle className={cn("w-5 h-5", playingLineIndex === i && "animate-pulse")} />
                          </button>
                        </div>
                      </div>

                      {silenceGaps.has(i) && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={cn(
                            "flex items-center gap-4 py-2 px-8 mx-4 my-2 rounded-2xl group/silence transition-all",
                            silenceGaps.get(i)?.type === 'gap' 
                              ? "bg-black/40 border border-white/5 py-3" 
                              : "bg-white/5 border border-transparent py-1 opacity-60 hover:opacity-100"
                          )}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full animate-pulse",
                              silenceGaps.get(i)?.type === 'gap' ? "bg-indigo-500" : "bg-slate-600"
                            )} />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                              {silenceGaps.get(i)?.type === 'gap' ? "Long Silence" : "Brief Pause"}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-lg text-[9px] font-mono">
                              {silenceGaps.get(i)?.duration.toFixed(1)}s
                            </span>
                          </div>
                          <button 
                            onClick={() => {
                              if (audioRef.current) {
                                audioRef.current.currentTime = recording.timestamps![i + 1].startTime;
                              }
                            }}
                            className="bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all opacity-0 group-hover/silence:opacity-100"
                          >
                            Jump to next line
                          </button>
                        </motion.div>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                (activeTab === 'original' ? recording.transcription : (recording.translation || "Translation fragment incoming..."))
                  .split('\n')
                  .map((line, i) => (
                    <React.Fragment key={i}>
                      <div 
                        ref={el => el ? lineRefs.current.set(i, el) : lineRefs.current.delete(i)}
                        className={cn(
                        "group flex items-center justify-between p-4 rounded-[2rem] border border-transparent hover:bg-white/5 hover:border-white/5 transition-all relative",
                        playingLineIndex === i && "bg-indigo-600/20 border-indigo-500/40 shadow-[0_0_30px_rgba(79,70,229,0.15)] scale-[1.02]"
                      )}>
                        {playingLineIndex === i && (
                          <motion.div 
                            layoutId="karaoke-glow-single"
                            className="absolute inset-0 bg-indigo-500/5 blur-2xl rounded-[2rem] -z-10"
                          />
                        )}
                        <p className={cn(
                          "transition-all duration-500 text-2xl flex-1 font-bold",
                          playingLineIndex === i ? "text-indigo-400 scale-[1.01] origin-left" : (i % 2 === 0 ? "text-white" : "text-slate-400 italic")
                        )}>
                          {line}
                        </p>
                        <button 
                          onClick={() => handleTTS(line, i)}
                          className={cn(
                            "p-3 rounded-2xl transition-all depth-button group-hover:opacity-100",
                            playingLineIndex === i ? "bg-indigo-600 text-white scale-110" : "bg-white/5 text-slate-500 hover:text-indigo-400 opacity-0"
                          )}
                        >
                          <PlayCircle className={cn("w-5 h-5", playingLineIndex === i && "animate-pulse")} />
                        </button>
                      </div>

                      {silenceGaps.has(i) && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={cn(
                            "flex items-center gap-4 py-2 px-8 mx-4 my-2 rounded-2xl group/silence transition-all",
                            silenceGaps.get(i)?.type === 'gap' 
                              ? "bg-black/40 border border-white/5 py-3" 
                              : "bg-white/5 border border-transparent py-1 opacity-60 hover:opacity-100"
                          )}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full animate-pulse",
                              silenceGaps.get(i)?.type === 'gap' ? "bg-indigo-500" : "bg-slate-600"
                            )} />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                              {silenceGaps.get(i)?.type === 'gap' ? "Long Silence" : "Brief Pause"}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-lg text-[9px] font-mono">
                              {silenceGaps.get(i)?.duration.toFixed(1)}s
                            </span>
                          </div>
                          <button 
                            onClick={() => {
                              if (audioRef.current) {
                                audioRef.current.currentTime = recording.timestamps![i + 1].startTime;
                              }
                            }}
                            className="bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all opacity-0 group-hover/silence:opacity-100"
                          >
                            Jump to next line
                          </button>
                        </motion.div>
                      )}
                    </React.Fragment>
                  ))
              )}
            </motion.div>
          )}
        </div>
      </div>

      {recording.transcription && (
        <div className="px-8 py-6 bg-black/40 border-t border-white/5 space-y-6 glass-3d">
          <AnimatePresence>
            {showVoiceSelector && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pb-6">
                  {VOICES.map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => onUpdate({ ...recording, voiceEffect: voice.id })}
                      className={cn(
                        "flex flex-col items-start p-4 rounded-3xl border transition-all text-left group depth-button",
                        recording.voiceEffect === voice.id 
                          ? "bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-600/20" 
                          : "bg-white/5 border-white/5 hover:bg-white/10"
                      )}
                    >
                      <span className={cn(
                        "text-xs font-black uppercase tracking-widest",
                        recording.voiceEffect === voice.id ? "text-white" : "text-indigo-400"
                      )}>
                        {voice.name}
                      </span>
                      <span className={cn(
                        "text-[9px] uppercase font-mono mt-1",
                        recording.voiceEffect === voice.id ? "text-indigo-200" : "text-slate-500"
                      )}>
                        {voice.gender}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleOriginalPlayback}
                className={cn(
                  "flex items-center gap-3 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl depth-button",
                  isPlayingOriginal ? "bg-indigo-600 text-white" : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {isPlayingOriginal ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                {isPlayingOriginal ? "Pause Track" : "Play Original"}
              </button>

              <button 
                onClick={handleTTS}
                disabled={isPlayingTTS}
                className="flex items-center gap-3 px-8 py-3 rounded-2xl bg-white text-black font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50 shadow-[0_10px_20px_rgba(255,255,255,0.1)] depth-button"
              >
                <PlayCircle className="w-5 h-5" />
                {isPlayingTTS ? "Synthesizing..." : "Vocal Preview"}
              </button>
              
              <button 
                onClick={() => setShowVoiceSelector(!showVoiceSelector)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all depth-button",
                  showVoiceSelector ? "bg-indigo-600/20 border-indigo-500 text-indigo-400" : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
                )}
              >
                <Users className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {selectedVoice.name} ({selectedVoice.gender})
                </span>
              </button>

              <div className="flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/5 depth-button">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400/60 whitespace-nowrap min-w-[100px]">Pause Threshold</span>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="2.0" 
                    step="0.05" 
                    value={pauseThreshold} 
                    onChange={(e) => setPauseThreshold(parseFloat(e.target.value))}
                    className="w-16 sm:w-24 accent-indigo-400 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-indigo-400 w-8">{pauseThreshold.toFixed(2)}s</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 whitespace-nowrap min-w-[100px]">Gap Threshold</span>
                  <input 
                    type="range" 
                    min="1.0" 
                    max="10.0" 
                    step="0.1" 
                    value={gapThreshold} 
                    onChange={(e) => setGapThreshold(parseFloat(e.target.value))}
                    className="w-16 sm:w-24 accent-indigo-600 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-indigo-500 w-8">{gapThreshold.toFixed(1)}s</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={copyToClipboard}
                className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-white/50 hover:text-white depth-button"
              >
                <AnimatePresence mode="wait">
                  {copied ? <Check key="check" className="w-4 h-4 text-emerald-500" /> : <Copy key="copy" className="w-4 h-4" />}
                </AnimatePresence>
              </button>
              <button 
                onClick={handleShareEmail}
                className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-white/50 hover:text-white depth-button"
              >
                <Mail className="w-4 h-4" />
              </button>
              <button 
                onClick={handleExportTxt}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-white/50 hover:text-white depth-button"
              >
                <Download className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Txt</span>
              </button>
              <button 
                onClick={handleExportAudio}
                disabled={isExporting}
                className="flex items-center gap-3 px-8 py-3 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest hover:bg-indigo-500 transition-all border border-indigo-400/20 shadow-xl shadow-indigo-600/10 depth-button disabled:opacity-50"
              >
                {isExporting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isExporting ? "Exporting..." : "Export MP3"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
