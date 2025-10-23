// stremio-m3u8-addon.js
// Entry point for the Stremio add-on using playlist and m3u8Parser
const path = require('path');
const AddonBuilder = require('./builder');
const { parseM3U8 } = require('./m3u8Parser');


const PLAYLIST_PATH = path.join(__dirname, '../playlist');
let streamsCache = [];
let lastRefresh = 0;
const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes (increased for better caching)

function getStreams() {
    const now = Date.now();
    if (!streamsCache.length || now - lastRefresh > REFRESH_INTERVAL) {
        streamsCache = parseM3U8(PLAYLIST_PATH);
        lastRefresh = now;
    }
    return streamsCache;
}

const manifest = {
    id: 'community.m3u8.streams',
    version: '1.1.0',
    name: 'Kinabraytan TV',
    description: 'Auto-populated live streams from an M3U8 playlist with adaptive streaming support',
    logo: 'https://raw.githubusercontent.com/kinabraytan/streams/onrender/assets/0054Psyduck.png', // Use GitHub-hosted Psyduck image
    favicon: 'https://raw.githubusercontent.com/kinabraytan/streams/onrender/assets/0054Psyduck.png', // Also set favicon for Stremio landing page
    resources: ['catalog', 'stream', 'meta'],
    types: ['tv'],
    catalogs: [{
        type: 'tv',
        id: 'm3u8-live',
        name: 'Kinbraytan TV',
        extra: [{ name: 'search', isRequired: false }]
    }],
    idPrefixes: ['m3u8'],
};

const builder = new AddonBuilder(manifest);

// Catalog handler: returns all streams as items
builder.defineCatalogHandler(({ type, id, extra }) => {
    if (type !== 'tv' || id !== 'm3u8-live') return { metas: [] };
    const streams = getStreams();
    const metas = streams.map(stream => ({
        id: 'm3u8_' + stream.id,
        type: 'tv',
        name: stream.name,
        poster: stream.logo,
        description: stream.group || '',
        background: stream.logo,
    }));
    return Promise.resolve({ metas });
});

// Stream handler: returns stream URL for playback with fallback options
builder.defineStreamHandler(({ type, id }) => {
    if (type !== 'tv') return { streams: [] };
    const streams = getStreams();
    const streamId = id.replace('m3u8_', '');
    const stream = streams.find(s => s.id === streamId);
    if (!stream) return { streams: [] };

    // Find alternative streams in the same group for fallback
    const alternatives = streams.filter(s => s.group === stream.group && s.id !== streamId).slice(0, 2); // Up to 2 alternatives

    const streamOptions = [{
        url: stream.url,
        title: stream.name,
        name: stream.name,
        isFree: true,
        behaviorHints: {
            notWebReady: true,  // Indicates the stream may need special buffering for smooth playback
        }
    }];

    // Add alternatives
    alternatives.forEach(alt => {
        streamOptions.push({
            url: alt.url,
            title: `${stream.name} (Alt)`,
            name: `${stream.name} (Alt)`,
            isFree: true,
        });
    });

    return Promise.resolve({ streams: streamOptions });
});

// Meta handler: returns metadata for each stream
builder.defineMetaHandler(({ type, id }) => {
    if (type !== 'tv') return { meta: null };
    const streams = getStreams();
    const streamId = id.replace('m3u8_', '');
    const stream = streams.find(s => s.id === streamId);
    if (!stream) return { meta: null };
    return Promise.resolve({
        meta: {
            id: 'm3u8_' + stream.id,
            type: 'tv',
            name: stream.name,
            poster: stream.logo,
            description: stream.group || '',
            background: stream.logo,
        }
    });
});

module.exports = builder.getInterface();
