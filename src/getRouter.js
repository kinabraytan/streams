const Router = require('router')
const qs = require('querystring')
const cors = require('cors')
const http = require('http')
const https = require('https')

const warned = {}

function getRouter({ manifest , get }) {
	const router = new Router()

	// CORS is mandatory for the addon protocol
	router.use(cors())

	// Serve the manifest
	const manifestBuf = JSON.stringify(manifest)
	function manifestHandler(req, res) {
		const { config } = req.params
		let manifestRespBuf = manifestBuf
		if (config && manifest.behaviorHints && (manifest.behaviorHints.configurationRequired || manifest.behaviorHints.configurable)) {
			const manifestClone = JSON.parse(manifestBuf)
			// we remove configurationRequired so the addon is installable after configuration
			delete manifestClone.behaviorHints.configurationRequired
			// we remove configuration page for installed addon too (could be added later to the router)
			delete manifestClone.behaviorHints.configurable
			manifestRespBuf = JSON.stringify(manifestClone)
		}
		res.setHeader('Content-Type', 'application/json; charset=utf-8')
		res.end(manifestRespBuf)
	}

	const hasConfig = (manifest.config || []).length

	if (hasConfig && !(manifest.behaviorHints || {}).configurable) {
		console.warn('manifest.config is set but manifest.behaviorHints.configurable is disabled, the "Configure" button will not show in the Stremio apps')
	}

	const configPrefix = hasConfig ? '/:config?' : ''
	// having config prifix always set to '/:config?' won't resault in a problem for non configurable addons,
	// since now the order is restricted by resources.

	router.get(`${configPrefix}/manifest.json`, manifestHandler)

	// using the same methode used in builder.js to extract resources from manifest
	const handlersInManifest = []
	if (manifest.catalogs.length > 0) handlersInManifest.push('catalog')
	manifest.resources.forEach((r) => handlersInManifest.push(r.name || r))

	// converting the resources array to a regular expression
	const ResourcesRegex = handlersInManifest && handlersInManifest.length ? '(' + handlersInManifest.join('|') + ')' : ''

	// Handle all resources
	// Simple in-memory caches (TTL-based)
	const playlistCache = new Map() // key -> { data, expires }
	const segmentCache = new Map() // key -> { data(Buffer), contentType, expires }

	// Helper: fetch remote content with redirect support, timeout, retries, and simple per-origin concurrency limiting
	const originConcurrency = new Map() // origin -> count
	const MAX_CONCURRENCY_PER_ORIGIN = 6
	const fetchRemote = (url, options = {}) => {
		const { timeout = 7000, redirects = 3, responseType = 'text', headers = {}, maxRetries = 1 } = options || {}
		const origin = (() => {
			try { return new URL(url).origin } catch (e) { return url.split('/').slice(0,3).join('/') }
		})()

		const attempt = (triesLeft) => new Promise((resolve, reject) => {
			// concurrency check
			const cur = originConcurrency.get(origin) || 0
			if (cur >= MAX_CONCURRENCY_PER_ORIGIN) {
				return reject(new Error('Too many concurrent requests to origin'))
			}
			originConcurrency.set(origin, cur + 1)

			let finished = false
			try {
				const lib = url.startsWith('https://') ? https : http
				const req = lib.get(url, { headers: Object.assign({ 'User-Agent': 'stremio-addon/1.0' }, headers) }, (r) => {
					const { statusCode, headers: resHeaders } = r
					if (statusCode >= 300 && statusCode < 400 && resHeaders.location && redirects > 0) {
						r.resume()
						originConcurrency.set(origin, (originConcurrency.get(origin) || 1) - 1)
						resolve(attempt(triesLeft))
						return
					}
					if (statusCode !== 200 && statusCode !== 206) {
						r.resume()
						finished = true
						originConcurrency.set(origin, (originConcurrency.get(origin) || 1) - 1)
						const err = new Error('Unexpected status code: ' + statusCode)
						err.statusCode = statusCode
						if (triesLeft > 0) {
							// small backoff
							setTimeout(() => attempt(triesLeft - 1).then(resolve).catch(reject), 100)
						} else reject(err)
						return
					}
					if (responseType === 'buffer') {
						const chunks = []
						r.on('data', c => chunks.push(c))
						r.on('end', () => {
							finished = true
							originConcurrency.set(origin, (originConcurrency.get(origin) || 1) - 1)
							resolve({ data: Buffer.concat(chunks), headers: resHeaders, statusCode })
						})
					} else {
						let data = ''
						r.setEncoding('utf8')
						r.on('data', chunk => data += chunk)
						r.on('end', () => {
							finished = true
							originConcurrency.set(origin, (originConcurrency.get(origin) || 1) - 1)
							resolve({ data, headers: resHeaders, statusCode })
						})
					}
				})
				req.on('error', (err) => {
					if (finished) return
					finished = true
					originConcurrency.set(origin, (originConcurrency.get(origin) || 1) - 1)
					if (triesLeft > 0) setTimeout(() => attempt(triesLeft - 1).then(resolve).catch(reject), 100)
					else reject(err)
				})
				// ensure timeout is numeric
				const t = Number(timeout) || 7000
				req.setTimeout(t, () => {
					if (finished) return
					finished = true
					try { req.abort() } catch (e) {}
					originConcurrency.set(origin, (originConcurrency.get(origin) || 1) - 1)
					if (triesLeft > 0) setTimeout(() => attempt(triesLeft - 1).then(resolve).catch(reject), 100)
					else reject(new Error('Timeout'))
				})
			} catch (err) {
				originConcurrency.set(origin, (originConcurrency.get(origin) || 1) - 1)
				if (triesLeft > 0) setTimeout(() => attempt(triesLeft - 1).then(resolve).catch(reject), 100)
				else reject(err)
			}
		})

		return attempt(maxRetries)
	}

	// Adaptive master playlist proxy
	// Example: GET /adaptive/tv/m3u8_123/master.m3u8
	router.get(`${configPrefix}/adaptive/:type/:id/master.m3u8`, function(req, res, next) {
		const { type, id } = req.params
		// Use the addon handler to retrieve the stream info for this id
		get('stream', type, id)
		.then(async (resp) => {
			if (!resp || !Array.isArray(resp.streams) || !resp.streams.length) {
				res.statusCode = 404
				res.end('Not found')
				return
			}
			const originUrl = resp.streams[0].url
			if (!originUrl || !(originUrl.startsWith('http://') || originUrl.startsWith('https://'))) {
				res.statusCode = 400
				res.end('Unsupported stream URL')
				return
			}

			// use outer fetchRemote helper defined above

			try {
				// fetch the playlist (cache small text responses)
				const cacheKey = 'plist:' + originUrl
				let fetched
				const now = Date.now()
				const cached = playlistCache.get(cacheKey)
				if (cached && cached.expires > now) {
					fetched = { data: cached.data }
				} else {
					fetched = await fetchRemote(originUrl, { timeout: 7000, responseType: 'text' })
					// cache for a short time (15s) to avoid hammering origins
					playlistCache.set(cacheKey, { data: fetched.data, expires: now + 15 * 1000 })
				}
				const body = fetched && fetched.data ? fetched.data : ''
				// If it's already a master playlist, pipe it through
				if (/^#EXTM3U[\s\S]*EXT-X-STREAM-INF/m.test(body)) {
					res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
					res.end(body)
					return
				}

				// Otherwise synthesize a minimal master that points to the proxied origin playlist
				// We'll reference /adaptive/:type/:id/origin.m3u8 so we can rewrite segment URLs there
				const originPath = `${req.protocol}://${req.get('host')}/adaptive/${encodeURIComponent(type)}/${encodeURIComponent(id)}/origin.m3u8`
				const master = ['#EXTM3U']
				master.push('#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720')
				master.push(originPath)
				res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
				res.end(master.join('\n'))
			} catch (err) {
				// fallback: redirect to the origin
				res.redirect(307, originUrl)
			}
		})
		.catch(err => {
			if (err && err.noHandler) {
				res.statusCode = 404
				res.end('Not found')
			} else {
				res.statusCode = 500
				res.end('Error')
			}
		})
	})

	// Serve the proxied origin playlist: rewrite segment URLs to point back at the addon segment proxy
	router.get(`${configPrefix}/adaptive/:type/:id/origin.m3u8`, function(req, res, next) {
		const { type, id } = req.params
		get('stream', type, id)
		.then(async (resp) => {
			if (!resp || !Array.isArray(resp.streams) || !resp.streams.length) {
				res.statusCode = 404
				res.end('Not found')
				return
			}
			const originUrl = resp.streams[0].url
			try {
				const fetched = await fetchRemote(originUrl, { timeout: 7000, responseType: 'text' })
				let body = fetched && fetched.data ? fetched.data : ''
				// rewrite segment URIs to /adaptive/:type/:id/segment/:encoded
				// Replace relative and absolute URIs (basic approach)
				const baseUrl = originUrl.replace(/\/[^\/]*$/, '/')
				const rewritten = body.replace(/^(?!#)(.+)$/gm, (m) => {
					const orig = m.trim()
					if (!orig) return m
					// If absolute URL
					const absolute = /^(https?:)?\/\//i.test(orig) ? orig : (baseUrl + orig)
					const enc = Buffer.from(absolute).toString('base64url')
					return `${req.protocol}://${req.get('host')}/adaptive/${encodeURIComponent(type)}/${encodeURIComponent(id)}/segment/${enc}`
				})
				res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
				res.end(rewritten)
			} catch (err) {
				res.redirect(307, originUrl)
			}
		})
		.catch(err => {
			res.statusCode = 500
			res.end('Error')
		})
	})

	// Proxy individual segments
	router.get(`${configPrefix}/adaptive/:type/:id/segment/:enc`, function(req, res, next) {
		const { enc } = req.params
		let originUrl
		try {
			originUrl = Buffer.from(enc, 'base64url').toString('utf8')
		} catch (e) {
			res.statusCode = 400
			res.end('Invalid')
			return
		}
		// Support Range requests: forward Range header
		const headers = {}
		if (req.headers.range) headers.Range = req.headers.range
		fetchRemote(originUrl, { timeout: 10000, responseType: 'buffer', headers })
		.then(result => {
			const ct = (result.headers && result.headers['content-type']) || 'application/octet-stream'
			res.setHeader('Content-Type', ct)
			// pass through content-range if present
			if (result.headers && result.headers['content-range']) res.setHeader('Content-Range', result.headers['content-range'])
			if (result.statusCode === 206) res.statusCode = 206
			res.end(result.data)
		})
		.catch(err => {
			res.statusCode = 502
			res.end('Bad gateway')
		})
	})

	// Main resources router
	router.get(`${configPrefix}/:resource${ResourcesRegex}/:type/:id/:extra?.json`, function(req, res, next) {
		const { resource, type, id } = req.params
		let { config } = req.params
		// we get `extra` from `req.url` because `req.params.extra` decodes the characters
		// and breaks dividing querystring parameters with `&`, in case `&` is one of the
		// encoded characters of a parameter value
		const extra = req.params.extra ? qs.parse(req.url.split('/').pop().slice(0, -5)) : {}
		if ((config || '').length) {
			try {
				config = JSON.parse(config)
			} catch(e) {
				config = false
			}
		}
		res.setHeader('Content-Type', 'application/json; charset=utf-8')
		get(resource, type, id, extra, config)
			.then(resp => {

				let cacheHeaders = {
					cacheMaxAge: 'max-age',
					staleRevalidate: 'stale-while-revalidate',
					staleError: 'stale-if-error'
				}

				const cacheControl = Object.keys(cacheHeaders).map(prop => {
					const cacheProp = cacheHeaders[prop]
					const cacheValue = resp[prop]
					if (!Number.isInteger(cacheValue)) return false
					if (cacheValue > 365 * 24 * 60 * 60)
						console.warn(`${prop} set to more then 1 year, be advised that cache times are in seconds, not milliseconds.`)
					return cacheProp + '=' + cacheValue
				}).filter(val => !!val).join(', ')

				if (cacheControl)
					res.setHeader('Cache-Control', `${cacheControl}, public`)

				if (resp.redirect) {
					res.redirect(307, resp.redirect)
					return
				}

				// Inject adaptive master URL for stream resources so clients can request a master from the addon
				if (resource === 'stream' && Array.isArray(resp.streams) && resp.streams.length) {
					try {
						const host = req.get('host')
						const protocol = req.protocol
						const adaptiveUrl = `${protocol}://${host}/adaptive/${type}/${encodeURIComponent(id)}/master.m3u8`;
						// Add an adaptive option at the front so clients may choose it
						resp.streams.unshift({
							url: adaptiveUrl,
							title: 'Adaptive (master)',
							name: 'Adaptive (master)',
							isFree: true,
							behaviorHints: { filename: undefined }
						})
					} catch (e) {
						// ignore adaptive injection errors
					}
				}

				res.setHeader('Content-Type', 'application/json; charset=utf-8')

				if (!warned.filename && resource === 'stream' && ((resp || {}).streams || []).length)
					if (resp.streams.find(stream => stream && stream.url && !(stream.behaviorHints || {}).filename)) {
						warned.filename = true
						console.warn('streams include stream.url but do not include stream.behaviorHints.filename, this is not recommended, subtitles may not be retrieved for these streams')
					}

				res.end(JSON.stringify(resp))
			})
			.catch(err => {
				if (err.noHandler) {
					if (next) next()
					else {
						res.writeHead(404)
						res.end(JSON.stringify({ err: 'not found' }))
					}
				} else {
					console.error(err)
					res.writeHead(500)
					res.end(JSON.stringify({ err: 'handler error' }))
				}
			})
	})

	return router
}

module.exports = getRouter
