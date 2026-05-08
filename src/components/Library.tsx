import React, { useState } from 'react';
import { 
  Search, FileAudio, FileText, Play, Download, Share2, 
  MoreVertical, Edit3, Trash2, Languages, Folder as FolderIcon, 
  FolderPlus, ChevronRight, ArrowLeft, MoreHorizontal, Move
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioRecording, Folder } from '../types';
import { cn } from '../lib/utils';

interface LibraryProps {
  recordings: AudioRecording[];
  folders: Folder[];
  onDelete: (id: string) => void;
  onSelect: (recording: AudioRecording) => void;
  onTranslate: (recording: AudioRecording) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveRecording: (recordingId: string, folderId: string | undefined) => void;
}

export function Library({ 
  recordings, folders, onDelete, onSelect, onTranslate, 
  onCreateFolder, onRenameFolder, onDeleteFolder, onMoveRecording 
}: LibraryProps) {
  const [search, setSearch] = useState('');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null); // null means root/all or uncategorized? Let's say null is Root view (showing folders + uncategorized)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [movingRecordingId, setMovingRecordingId] = useState<string | null>(null);

  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  
  const filteredRecordings = recordings.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
                          r.transcription?.toLowerCase().includes(search.toLowerCase());
    
    if (activeFolderId === 'uncategorized') {
      return matchesSearch && !r.folderId;
    }
    if (activeFolderId) {
      return matchesSearch && r.folderId === activeFolderId;
    }
    return matchesSearch;
  });

  const activeFolder = folders.find(f => f.id === activeFolderId);

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
          <input
            type="text"
            placeholder="Filter archives..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-sans"
          />
        </div>
        <button 
          onClick={() => setIsCreatingFolder(true)}
          className="p-3 bg-indigo-600/10 text-indigo-400 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all border border-indigo-500/20 depth-button"
          title="New Folder"
        >
          <FolderPlus className="w-5 h-5" />
        </button>
      </div>

      {isCreatingFolder && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2 p-3 bg-indigo-600/5 border border-indigo-500/20 rounded-2xl"
        >
          <input 
            autoFocus
            type="text" 
            placeholder="Folder name..."
            className="flex-1 bg-transparent border-none text-sm outline-none placeholder:text-indigo-900/40"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
          />
          <button onClick={handleCreateFolder} className="text-indigo-400 text-xs font-black uppercase">Create</button>
          <button onClick={() => setIsCreatingFolder(false)} className="text-slate-600 text-xs font-black uppercase">Cancel</button>
        </motion.div>
      )}

      {activeFolderId && (
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveFolderId(null)}
            className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] font-black tracking-widest text-indigo-400 uppercase">Folder</span>
            <h4 className="text-sm font-bold text-white">{activeFolder?.name || 'Uncategorized'}</h4>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
        {!activeFolderId && (
          <div className="grid grid-cols-2 gap-3 pb-4">
            {filteredFolders.map(folder => (
              <div 
                key={folder.id}
                className="group relative bg-white/5 border border-white/5 p-4 rounded-3xl hover:bg-white/10 transition-all cursor-pointer flex flex-col gap-3 bento-card shadow-lg"
                onClick={() => setActiveFolderId(folder.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 bg-indigo-600/10 rounded-2xl flex items-center justify-center text-indigo-400 inner-depth shadow-sm">
                    <FolderIcon className="w-5 h-5" />
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-all flex gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setNewFolderName(folder.name); }}
                      className="p-1.5 hover:bg-indigo-500/10 rounded-lg text-slate-500 hover:text-indigo-400"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {editingFolderId === folder.id ? (
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <input 
                      autoFocus
                      className="bg-white/10 border border-white/10 rounded px-2 py-0.5 text-[10px] w-full outline-none"
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          onRenameFolder(folder.id, newFolderName);
                          setEditingFolderId(null);
                          setNewFolderName('');
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <h4 className="text-xs font-bold text-white truncate">{folder.name}</h4>
                    <span className="text-[9px] uppercase font-mono text-slate-500">
                      {recordings.filter(r => r.folderId === folder.id).length} Items
                    </span>
                  </div>
                )}
              </div>
            ))}
            
            <div 
              className="bg-white/5 border border-dashed border-white/10 p-4 rounded-3xl hover:bg-white/10 transition-all cursor-pointer flex flex-col gap-3 bento-card shadow-sm opacity-60 hover:opacity-100"
              onClick={() => setActiveFolderId('uncategorized')}
            >
              <div className="w-10 h-10 bg-slate-500/10 rounded-2xl flex items-center justify-center text-slate-500 inner-depth">
                <FolderIcon className="w-5 h-5 opacity-50" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400">Uncategorized</h4>
                <span className="text-[9px] uppercase font-mono text-slate-600">
                  {recordings.filter(r => !r.folderId).length} Items
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {filteredRecordings.length === 0 ? (
            <div className="text-center py-10 opacity-20">
              <p className="text-xs font-mono uppercase tracking-widest">No tracks found</p>
            </div>
          ) : (
            filteredRecordings.map((recording) => (
              <motion.div
                layout
                key={recording.id}
                className={cn(
                  "group bg-white/5 border border-white/5 p-4 rounded-3xl flex items-center gap-4 hover:bg-white/10 transition-all cursor-pointer bento-card",
                  movingRecordingId === recording.id && "border-indigo-500 ring-4 ring-indigo-500/20 translate-z-10"
                )}
                onClick={() => onSelect(recording)}
              >
                <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all inner-depth">
                  {recording.type === 'text' ? <FileText className="w-5 h-5" /> : <FileAudio className="w-5 h-5" />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm text-white truncate">{recording.name}</h3>
                  <div className="flex items-center gap-2 mt-1 text-[9px] uppercase tracking-wider font-mono opacity-40">
                    <span>{recording.duration}s</span>
                    {recording.voiceEffect && <span className="text-indigo-400">{recording.voiceEffect}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <div className="relative group/menu">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setMovingRecordingId(movingRecordingId === recording.id ? null : recording.id); }}
                      className="p-1.5 hover:bg-indigo-500/10 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
                      title="Move to Folder"
                    >
                      <Move className="w-4 h-4" />
                    </button>
                    {movingRecordingId === recording.id && (
                      <div className="absolute right-0 top-full mt-2 w-48 glass-3d rounded-2xl p-2 z-50">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 px-3 py-2">Move to:</div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onMoveRecording(recording.id, undefined); setMovingRecordingId(null); }}
                          className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-white/5 rounded-xl transition-colors"
                        >
                          Uncategorized
                        </button>
                        {folders.map(f => (
                          <button 
                            key={f.id}
                            onClick={(e) => { e.stopPropagation(); onMoveRecording(recording.id, f.id); setMovingRecordingId(null); }}
                            className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-white/5 rounded-xl transition-colors"
                          >
                            {f.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(recording.id); }}
                    className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
