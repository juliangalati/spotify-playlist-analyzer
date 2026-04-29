export type SpotifyArtist = { id: string; name: string };

export type SpotifyTrack = {
  id: string;
  name: string;
  type: 'track' | 'episode';
  is_local: boolean;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: {
    name: string;
    release_date?: string;
    images: Array<{ url: string; height?: number; width?: number }>;
  };
  external_urls?: { spotify?: string };
};

export type PlaylistMetadata = {
  id: string;
  name: string;
  owner: { display_name: string };
  images: Array<{ url: string }>;
  tracks: { total: number };
  external_urls: { spotify: string };
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type PlaylistItem = {
  is_local?: boolean;
  item?: SpotifyTrack & { track?: boolean; episode?: boolean };
  track?: SpotifyTrack;
};

type PlaylistItemsContainer = {
  items?: PlaylistItem[];
  next?: string | null;
  total?: number;
};

type PlaylistApiResponse = {
  id: string;
  name: string;
  owner: { display_name: string };
  images: Array<{ url: string }>;
  external_urls: { spotify: string };
  tracks?: PlaylistItemsContainer & { total?: number };
  items?: PlaylistItemsContainer;
};

function extractTrack(entry: PlaylistItem): SpotifyTrack | null {
  const raw = entry.item ?? entry.track;
  if (!raw) return null;
  if (entry.is_local) return null;
  if ((raw as unknown as { is_local?: boolean }).is_local) return null;
  if ((raw as unknown as { type?: string }).type !== 'track') return null;
  return raw as SpotifyTrack;
}

async function requestPlaylist(
  url: string,
  accessToken: string
): Promise<PlaylistApiResponse> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) {
    throw new HttpError(404, 'Playlist not found or private.');
  }
  if (res.status === 401) {
    throw new HttpError(401, 'Spotify session expired. Please log in again.');
  }
  if (res.status === 403) {
    const body = await res.text();
    console.error('[spotify 403]', body);
    throw new HttpError(
      403,
      'Spotify denied access to this playlist. Your account may not have access to it.'
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new HttpError(res.status, `Spotify playlist fetch failed: ${body}`);
  }
  return (await res.json()) as PlaylistApiResponse;
}

export async function fetchPlaylist(
  id: string,
  accessToken: string
): Promise<{ meta: PlaylistMetadata; tracks: SpotifyTrack[] }> {
  const first = await requestPlaylist(
    `https://api.spotify.com/v1/playlists/${id}`,
    accessToken
  );

  const meta: PlaylistMetadata = {
    id: first.id,
    name: first.name,
    owner: first.owner,
    images: first.images,
    external_urls: first.external_urls,
    tracks: { total: first.tracks?.total ?? first.items?.total ?? 0 },
  };

  const tracks: SpotifyTrack[] = [];

  const firstContainer: PlaylistItemsContainer | undefined =
    first.items ?? first.tracks;

  const seen: PlaylistItemsContainer[] = firstContainer ? [firstContainer] : [];

  if (firstContainer?.total != null && !meta.tracks.total) {
    meta.tracks.total = firstContainer.total;
  }

  // walk pagination if present
  let next: string | null | undefined = firstContainer?.next;

  for (const container of seen) {
    for (const entry of container.items ?? []) {
      const t = extractTrack(entry);
      if (t) tracks.push(t);
    }
  }

  while (next) {
    const page = (await (
      await fetch(next, { headers: { Authorization: `Bearer ${accessToken}` } })
    ).json()) as PlaylistItemsContainer;
    for (const entry of page.items ?? []) {
      const t = extractTrack(entry);
      if (t) tracks.push(t);
    }
    next = page.next;
  }

  return { meta, tracks };
}
