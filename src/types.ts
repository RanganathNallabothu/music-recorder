export interface Timestamp {
  startTime: number;
  endTime: number;
}

export interface AudioRecording {
  id: string;
  name: string;
  url: string;
  userId: string;
  transcription?: string;
  translation?: string;
  timestamps?: Timestamp[];
  createdAt: number;
  duration: number;
  type: 'audio' | 'video' | 'text';
  voiceEffect?: string;
  folderId?: string;
  effects?: {
    pitch: number;
    distortion: number;
    reverb: number;
  };
}

export interface Folder {
  id: string;
  name: string;
  userId: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female';
  preset: string;
}

export interface BackgroundTrack {
  id: string;
  name: string;
  url: string;
}

export const VOICES: VoiceOption[] = [
  { id: 'kore', name: 'Kore', gender: 'female', preset: 'Kore' },
  { id: 'puck', name: 'Puck', gender: 'male', preset: 'Puck' },
  { id: 'charon', name: 'Charon', gender: 'male', preset: 'Charon' },
  { id: 'zephyr', name: 'Zephyr', gender: 'female', preset: 'Zephyr' },
  { id: 'fenrir', name: 'Fenrir', gender: 'male', preset: 'Fenrir' },
];

export const BG_TRACKS: BackgroundTrack[] = [
  { id: 'lofi', name: 'Lofi Chill', url: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808f3030c.mp3' },
  { id: 'techno', name: 'Subway Techno', url: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c8b8b8b8b8.mp3' }, // Placeholder URLs
  { id: 'ambient', name: 'Deep Space', url: 'https://cdn.pixabay.com/audio/2021/11/25/audio_91b1b1b1b1.mp3' },
  { id: 'jazz', name: 'Midnight Jazz', url: 'https://cdn.pixabay.com/audio/2022/01/21/audio_a1a1a1a1a1.mp3' },
];
