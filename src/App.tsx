/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Mic2,Library as LibraryIcon, Search, Settings, Music, Sparkles, Headphones, LogOut, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Recorder } from './components/Recorder';
import { Library } from './components/Library';
import { LyricsEditor } from './components/LyricsEditor';
import { AudioRecording, Folder } from './types';
import { cn } from './lib/utils';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './lib/firebase';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'studio' | 'library'>('studio');
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<AudioRecording | null>(null);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) {
      setRecordings([]);
      setFolders([]);
      return;
    }

    const recordingsPath = `users/${user.uid}/recordings`;
    const unsubscribeRecordings = onSnapshot(collection(db, recordingsPath), 
      (snapshot) => {
        const data = snapshot.docs.map(d => d.data() as AudioRecording);
        setRecordings(data.sort((a, b) => b.createdAt - a.createdAt));
      },
      (error) => handleFirestoreError(error, OperationType.GET, recordingsPath)
    );

    const foldersPath = `users/${user.uid}/folders`;
    const unsubscribeFolders = onSnapshot(collection(db, foldersPath), 
      (snapshot) => {
        const data = snapshot.docs.map(d => d.data() as Folder);
        setFolders(data);
      },
      (error) => handleFirestoreError(error, OperationType.GET, foldersPath)
    );

    return () => {
      unsubscribeRecordings();
      unsubscribeFolders();
    };
  }, [user]);

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  const saveRecording = async (partial: Partial<AudioRecording>) => {
    if (!user) return;
    const id = Math.random().toString(36).substr(2, 9);
    const recordingsPath = `users/${user.uid}/recordings`;
    
    const newRecording: AudioRecording = {
      id,
      name: partial.name || 'Untitled',
      url: partial.url || '',
      duration: partial.duration || 0,
      createdAt: Date.now(),
      type: 'audio',
      userId: user.uid,
      voiceEffect: partial.voiceEffect,
      ...partial
    };

    try {
      await setDoc(doc(db, recordingsPath, id), newRecording);
      setSelectedRecording(newRecording);
      setActiveTab('library');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, recordingsPath);
    }
  };

  const deleteRecording = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/recordings`;
    try {
      await deleteDoc(doc(db, path, id));
      if (selectedRecording?.id === id) setSelectedRecording(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const updateRecording = async (updated: AudioRecording) => {
    if (!user) return;
    const path = `users/${user.uid}/recordings`;
    try {
      await setDoc(doc(db, path, updated.id), updated);
      setSelectedRecording(updated);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const createFolder = async (name: string) => {
    if (!user) return;
    const id = Math.random().toString(36).substr(2, 9);
    const path = `users/${user.uid}/folders`;
    const newFolder: Folder = {
      id,
      name,
      userId: user.uid
    };
    try {
      await setDoc(doc(db, path, id), newFolder);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const renameFolder = async (id: string, name: string) => {
    if (!user) return;
    const path = `users/${user.uid}/folders`;
    try {
      await updateDoc(doc(db, path, id), { name });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const deleteFolder = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/folders`;
    try {
      await deleteDoc(doc(db, path, id));
      // Orphan recordings in that folder - in production we might use a background function or batch
      const affectedRecordings = recordings.filter(r => r.folderId === id);
      const recPath = `users/${user.uid}/recordings`;
      for (const r of affectedRecordings) {
        await updateDoc(doc(db, recPath, r.id), { folderId: null });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const moveRecordingToFolder = async (recordingId: string, folderId: string | undefined) => {
    if (!user) return;
    const path = `users/${user.uid}/recordings`;
    try {
      await updateDoc(doc(db, path, recordingId), { folderId: folderId || null });
      if (selectedRecording?.id === recordingId) {
        setSelectedRecording({ ...selectedRecording, folderId });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-full bg-bento-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full bg-bento-bg flex flex-col items-center justify-center p-8 gap-8 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_40%,rgba(79,70,229,0.15),transparent_60%)]" />
        <div className="z-10 text-center space-y-4">
          <div className="p-6 bg-indigo-600 rounded-[3rem] shadow-2xl shadow-indigo-500/20 inline-block mb-4 bento-card">
            <Mic2 className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter">VOCALIST AI</h1>
          <p className="text-slate-400 font-serif italic text-lg max-w-md mx-auto">
            Your studio-grade AI vocal bridge. Record, translate, and sync with professional precision.
          </p>
        </div>
        <button 
          onClick={login}
          className="z-10 flex items-center gap-4 px-10 py-5 bg-white text-black rounded-3xl font-black uppercase tracking-widest hover:scale-105 transition-all shadow-2xl depth-button"
        >
          <LogIn className="w-6 h-6" />
          Authorize with Google
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-bento-bg text-slate-200 font-sans p-5 gap-5 overflow-hidden selection:bg-indigo-500/30 perspective-1000">
      {/* Sidebar Navigation */}
      <aside className="w-24 h-full bg-bento-panel rounded-[3rem] flex flex-col items-center py-10 gap-10 border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative z-20">
        <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/20 depth-button">
          <Mic2 className="w-8 h-8 text-white" />
        </div>
        <nav className="flex flex-col gap-10">
          <button 
            onClick={() => setActiveTab('studio')}
            className={cn("transition-all duration-300 depth-button p-3 rounded-2xl", activeTab === 'studio' ? "bg-indigo-600/20 text-indigo-500 border border-indigo-500/30" : "text-slate-400 hover:text-white")}
          >
            <Sparkles className="w-7 h-7" />
          </button>
          <button 
            onClick={() => setActiveTab('library')}
            className={cn("transition-all duration-300 depth-button p-3 rounded-2xl", activeTab === 'library' ? "bg-indigo-600/20 text-indigo-500 border border-indigo-500/30" : "text-slate-400 hover:text-white")}
          >
            <LibraryIcon className="w-7 h-7" />
          </button>
          <button onClick={logout} className="text-slate-400 hover:text-red-400 transition-all depth-button p-3 rounded-2xl" title="Logout">
            <LogOut className="w-7 h-7" />
          </button>
        </nav>
      </aside>

      {/* Main Dashboard Grid */}
      <main className="flex-1 grid grid-cols-12 grid-rows-6 gap-5 overflow-hidden">
        
        {/* Transcription & Editor Engine (Large Bento) */}
        <div className="col-span-12 lg:col-span-8 row-span-4 bento-card p-8 flex flex-col overflow-hidden relative">
          <div className="flex justify-between items-start mb-8 z-10">
            <div className="flex flex-col">
              <span className="text-[10px] font-black tracking-[0.2em] text-indigo-400 uppercase mb-1">
                {activeTab === 'studio' ? 'Creative Studio' : 'Vocal Library'}
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {selectedRecording ? selectedRecording.name : (activeTab === 'studio' ? "Vocal Session" : "Archives")}
              </h1>
            </div>
            {selectedRecording && (
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded-full border border-emerald-500/20 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> READY
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {activeTab === 'studio' ? (
                <motion.div 
                  key="studio" 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col justify-center gap-8"
                >
                  <Recorder onSave={saveRecording} />
                </motion.div>
              ) : (
                <motion.div 
                  key="library" 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col"
                >
                  {selectedRecording ? (
                    <LyricsEditor recording={selectedRecording} onUpdate={updateRecording} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-20">
                      <Music className="w-20 h-20" />
                      <p className="font-serif italic text-xl">Select a track to start editing</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Columns Grid Structure */}
        
        {/* Language & Translation Bridge */}
        <div className="col-span-12 lg:col-span-4 row-span-2 bg-indigo-600 rounded-[3rem] p-8 flex flex-col justify-between shadow-xl shadow-indigo-500/20 group hover:scale-[1.02] transition-all perspective-1000">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-1">AI Linguistics</span>
              <div className="text-2xl font-black text-white">Polyglot Bridge</div>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center inner-depth">
               <Search className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="flex items-center gap-4 bg-white/10 p-4 rounded-3xl inner-depth">
            <div className="flex-1 text-center font-bold text-white">EN</div>
            <div className="w-8 h-8 bg-white text-indigo-600 rounded-full flex items-center justify-center shadow-lg depth-button">
              <Search className="w-4 h-4" />
            </div>
            <div className="flex-1 text-center font-bold text-white">ES</div>
          </div>
        </div>

        {/* Effects & Layering Unit (Management) */}
        <div className="col-span-12 lg:col-span-4 row-span-2 bento-card p-8 shadow-2xl flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">Recent Archives</span>
            <button onClick={() => { setActiveTab('library'); setSelectedRecording(null); }} className="text-indigo-400 text-[10px] font-bold hover:underline">View Library</button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
            {recordings.slice(0, 3).map((r) => (
              <div 
                key={r.id} 
                className="flex items-center gap-4 group cursor-pointer"
                onClick={() => { setActiveTab('library'); setSelectedRecording(r); }}
              >
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 group-hover:bg-indigo-500/20 group-hover:border-indigo-500/30 transition-all">
                  <Music className="w-5 h-5 opacity-50" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold leading-tight truncate">{r.name}</div>
                  <div className="text-[10px] opacity-40 uppercase font-mono tracking-tighter">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Library Mini-Grid (replaced with the actual Library management) */}
        <div className="col-span-12 lg:col-span-4 row-span-2 bento-card p-8 flex flex-col">
           <Library 
              recordings={recordings} 
              folders={folders}
              onDelete={deleteRecording} 
              onSelect={setSelectedRecording}
              onTranslate={(r) => { setSelectedRecording(r); }}
              onCreateFolder={createFolder}
              onRenameFolder={renameFolder}
              onDeleteFolder={deleteFolder}
              onMoveRecording={moveRecordingToFolder}
            />
        </div>

        {/* Master Playback & Controls (Wide Bento) */}
        <div className="col-span-12 lg:col-span-8 row-span-2 bg-[#1A1A23] rounded-[3rem] border border-white/10 p-8 flex items-center gap-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden perspective-1000 transition-all hover:translate-y-[-4px]">
          <div className="w-24 h-24 bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center shrink-0 inner-depth">
             <div className="flex items-end gap-1 h-12">
                <div className="w-1.5 bg-indigo-500 h-1/2 rounded-full animate-pulse"></div>
                <div className="w-1.5 bg-indigo-500 h-full rounded-full animate-[pulse_1.5s_infinite]"></div>
                <div className="w-1.5 bg-indigo-500 h-1/3 rounded-full animate-[pulse_0.8s_infinite]"></div>
                <div className="w-1.5 bg-indigo-500 h-2/3 rounded-full animate-[pulse_1.2s_infinite]"></div>
             </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-mono font-bold text-indigo-400">SESSION MASTER</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] opacity-40 uppercase tracking-tighter">Playback Speed</span>
                <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold">1.25x</span>
              </div>
            </div>
            <div className="h-2 bg-slate-800 rounded-full w-full mb-8 overflow-hidden relative">
               <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-600 to-indigo-400 w-1/4 rounded-full"></div>
            </div>
            <div className="flex items-center justify-center gap-10">
              <button className="text-slate-500 hover:text-white transition-colors">
                 <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
              </button>
              <button className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center shadow-xl shadow-white/5 hover:scale-105 transition-transform">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
              <button className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M16 18h2V6h-2zM6 18l8.5-6L6 6z"/></svg>
              </button>
            </div>
          </div>
          <div className="w-24 flex flex-col gap-3 shrink-0">
            <button className="w-full py-3 bg-white text-black font-bold text-[10px] rounded-xl tracking-tighter uppercase">Export AI</button>
            <button className="w-full py-3 bg-white/5 border border-white/10 text-white font-bold text-[10px] rounded-xl tracking-tighter uppercase">Share</button>
          </div>
        </div>

      </main>
    </div>
  );
}
