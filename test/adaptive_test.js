const serveHTTP = require('../src/serveHTTP');
const addonInterface = require('../src/stremio-m3u8-addon');

(async () => {
  try {
    const { url, server } = await serveHTTP(addonInterface, { port: 7001 })
    // find a stream id from the catalog
    const catalogResp = await (await fetch(url.replace('/manifest.json', '/catalog/tv/m3u8-live.json'))).json()
    const first = (catalogResp.metas || [])[0]
    if (!first) {
      console.error('No catalog entries found; cannot run adaptive test')
      server.close()
      process.exit(1)
    }
    const streamId = first.id
  const adaptiveUrl = url.replace('/manifest.json', `/adaptive/tv/${encodeURIComponent(streamId)}/master.m3u8`)
    const res = await (await fetch(adaptiveUrl)).text()
    console.log('Adaptive master response length:', res.length)
    server.close()
    process.exit(0)
  } catch (err) {
    console.error('Adaptive test failed', err)
    process.exit(2)
  }
})()
