import { getUserByKey, getTracksListenedOnDate } from './db';
import { msToHM } from './utils';

interface Track {
    id: string;
    name: string;
    artists: Artist[];
    duration_ms: number;
}

interface Artist {
    id: string;
    name: string;
}

interface TopItem {
    id: string;
    name: string;
    count: number;
}

interface DailySummary {
    timeListened: string;
    songCount: number;
    topArtists: TopItem[];
    topTracks: TopItem[];
    genres: { name: string; count: number }[];
}

const fetchBy50 = async (query: string, ids: string[], token: string) => {
    let start = 0;
    const data = [];
    while (start < ids.length) {
        const trackIds = ids.slice(start, start + 50).join(',');
        const response = await fetch(`https://api.spotify.com/v1/${query}?ids=${trackIds}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.error('Failed to fetch track details');
            return;
        }

        const resData = await response.json();
        data.push(resData);
        start += 50;
    }

    return data;
}


const getDailySummary = async (passphrase: string, day: string): Promise<DailySummary | undefined> => {
    const user = await getUserByKey(passphrase);
    if (!user) return;

    const tracks = await getTracksListenedOnDate(user.id, day);
    const trackIds = [...new Set(tracks.map(track => track.trackid))];

    const trackData = await fetchTrackData(trackIds, user.token);
    const { trackMap, artistMap } = createMaps(trackData);

    const { totalTime, trackCount } = calculateListeningStats(tracks, trackMap);
    const topTracks = getTopItems(trackCount, trackMap, 10);
    const artistCount = calculateArtistCount(trackMap, trackCount);
    const topArtists = getTopItems(artistCount, new Map(Array.from(artistCount).map(([name, count]) => [name, { name }])), 10);

    const genreCount = await calculateGenreCount(artistMap, artistCount, user.token);
    const topGenres = getTopGenres(genreCount);

    return {
        timeListened: msToHM(totalTime),
        songCount: tracks.length,
        topArtists,
        topTracks,
        genres: topGenres,
    };
};

const fetchTrackData = async (trackIds: string[], token: string): Promise<any[]> => {
    return await fetchBy50('tracks', trackIds, token) as any[];
};

const createMaps = (trackData: any[]): { trackMap: Map<string, Track>; artistMap: Map<string, Artist> } => {
    const trackMap = new Map<string, Track>();
    const artistMap = new Map<string, Artist>();

    for (const data of trackData) {
        for (const track of data.tracks) {
            trackMap.set(track.id, track);
            for (const artist of track.artists) {
                artistMap.set(artist.id, artist);
            }
        }
    }

    return { trackMap, artistMap };
};

const calculateListeningStats = (tracks: any[], trackMap: Map<string, Track>): { totalTime: number; trackCount: Map<string, number> } => {
    let totalTime = 0;
    const trackCount = new Map<string, number>();

    for (const track of tracks) {
        totalTime += trackMap.get(track.trackid)?.duration_ms || 0;
        trackCount.set(track.trackid, (trackCount.get(track.trackid) || 0) + 1);
    }

    return { totalTime, trackCount };
};

const getTopItems = <T extends { name: string }>(
    countMap: Map<string, number>,
    itemMap: Map<string, T>,
    limit: number
): TopItem[] => {
    return Array.from(countMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id, count], index) => ({
            id: `${index + 1}`,
            name: itemMap.get(id)?.name || '',
            count,
        }));
};

const calculateArtistCount = (trackMap: Map<string, Track>, trackCount: Map<string, number>): Map<string, number> => {
    const artistCount = new Map<string, number>();

    for (const track of trackMap.values()) {
        const countOfTrack = trackCount.get(track.id) || 1;
        for (const artist of track.artists) {
            artistCount.set(artist.name, (artistCount.get(artist.name) || 0) + countOfTrack);
        }
    }

    return artistCount;
};

const calculateGenreCount = async (
    artistMap: Map<string, Artist>,
    artistCount: Map<string, number>,
    token: string
): Promise<Map<string, number>> => {
    const artistGenres = new Map<string, string[]>();
    const artistDataArray = await fetchBy50('artists', Array.from(artistMap.keys()), token) as any[];

    for (const artistData of artistDataArray) {
        for (const artist of artistData.artists) {
            artistGenres.set(artist.id, artist.genres);
        }
    }

    const genreCount = new Map<string, number>();
    for (const artist of artistMap.values()) {
        const countOfArtists = artistCount.get(artist.name) || 1;
        const genres = artistGenres.get(artist.id) || [];
        for (const genre of genres) {
            genreCount.set(genre, (genreCount.get(genre) || 0) + countOfArtists);
        }
    }

    return genreCount;
};

const getTopGenres = (genreCount: Map<string, number>): { name: string; count: number }[] => {
    const topGenres = Array.from(genreCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, count]) => ({ name: genre, count }));

    const otherCount = Array.from(genreCount.entries())
        .slice(5)
        .reduce((acc, [_, count]) => acc + count, 0);

    topGenres.push({ name: 'Others', count: otherCount });

    return topGenres;
};

export default getDailySummary;