const { parseM3U8 } = require('../src/m3u8Parser');
const path = require('path');
const playlistPath = path.join(__dirname, '..', 'playlist');

const streams = parseM3U8(playlistPath);
console.log('Found', streams.length, 'streams');
streams.forEach((s, i) => {
    console.log(i + 1, s.id, s.name, '\n   logo:', s.logo);
});
