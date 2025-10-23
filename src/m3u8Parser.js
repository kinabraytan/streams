// m3u8Parser.js
// Parses M3U8 playlist and returns array of stream objects
const fs = require('fs');
const path = require('path');

function parseM3U8(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const streams = [];
    let currentMeta = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF')) {
            // Extract metadata
            const metaMatch = line.match(/#EXTINF:-1(.*?)\,(.*)/);
            if (metaMatch) {
                const metaStr = metaMatch[1];
                const name = metaMatch[2].trim();
                const meta = {};
                // Extract tvg-id, tvg-name, tvg-logo, group-title
                const tvgIdMatch = metaStr.match(/tvg-id="([^"]+)"/);
                const tvgNameMatch = metaStr.match(/tvg-name="([^"]+)"/);
                const tvgLogoMatch = metaStr.match(/tvg-logo="([^"]+)"/);
                const groupTitleMatch = metaStr.match(/group-title="([^"]+)"/);
                meta.tvgId = tvgIdMatch ? tvgIdMatch[1] : '';
                meta.tvgName = tvgNameMatch ? tvgNameMatch[1] : name;
                meta.tvgLogo = tvgLogoMatch ? tvgLogoMatch[1] : '';
                // Normalize and resize Imgur logos for better UI fit.
                // Imgur supports filename suffixes to return resized images (e.g. 's' for small square).
                // Convert page links and non-raw imgur hosts to raw image host and add suffix before extension.
                if (meta.tvgLogo && meta.tvgLogo.toLowerCase().includes('imgur.com')) {
                    try {
                        let url = meta.tvgLogo.trim();
                        // Ensure protocol
                        if (url.startsWith('//')) url = 'https:' + url;
                        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
                            if (!/imgur\.com\/(a|gallery)\//i.test(url)) {
                                // Replace host with i.imgur.com (raw image host) for direct image access
                                url = url.replace(/https?:\/\/((m|www)\.)?imgur\.com\//i, 'https://i.imgur.com/');
                                // Add small square suffix before extension if possible
                                const m = url.match(/^(https:\/\/i\.imgur\.com\/([A-Za-z0-9_-]+))(\.[a-zA-Z0-9]+)(.*)$/);
                                if (m) {
                                    const base = m[1];
                                    const ext = m[3];
                                    const rest = m[4] || '';
                                    const suffix = 's';
                                    url = `${base}${suffix}${ext}${rest}`;
                                }
                            }

                            // Wrap with images.weserv.nl to enforce consistent thumbnail sizing for hosts that don't support suffixes
                            try {
                                const clean = url.replace(/^https?:\/\//i, '').replace(/^\//, '');
                                const wrapped = 'https://images.weserv.nl/?url=' + encodeURIComponent(clean) + '&w=48&h=48&fit=cover&output=png';
                                meta.tvgLogo = wrapped;
                            } catch (e) {
                                meta.tvgLogo = url;
                            }
                    } catch (e) {
                        // In case of any parsing issue, keep original logo
                    }
                }
                meta.groupTitle = groupTitleMatch ? groupTitleMatch[1] : '';
                meta.name = name;
                currentMeta = meta;
            }
        } else if (line && !line.startsWith('#')) {
            // Stream URL
            if (currentMeta) {
                streams.push({
                    id: currentMeta.tvgId || Buffer.from(line).toString('base64'),
                    name: currentMeta.tvgName || currentMeta.name,
                    logo: currentMeta.tvgLogo,
                    group: currentMeta.groupTitle,
                    url: line,
                });
                currentMeta = null;
            }
        }
    }
    return streams;
}

module.exports = { parseM3U8 };
