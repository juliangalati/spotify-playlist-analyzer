export type Playlist = {
  id: string;
  name: string;
  owner: string;
  image: string | null;
  total: number;
  url: string;
  duration_ms: number;
};

export type Features = {
  bpm: number;
  key: number;
  mode: 0 | 1;
  camelot: string;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  loudness: number;
};

export type TrackRow = {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: { name: string; release_date: string | null };
  duration_ms: number;
  url: string | null;
  cover: string | null;
  features: Features | null;
};

export type Coverage = { analyzed: number; total: number };

export type Aggregates = {
  avg_bpm: number;
  avg_energy: number;
  avg_danceability: number;
  avg_valence: number;
  avg_loudness: number;
  major_minor_ratio: { major: number; minor: number };
  key_distribution: Record<string, number>;
  dominant_key_code: string;
  total_duration_ms: number;
};

export type AnalyzerPayload = {
  playlist: Playlist;
  coverage: Coverage;
  tracks: TrackRow[];
};
