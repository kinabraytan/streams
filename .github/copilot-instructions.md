# Stremio Addon SDK - AI Coding Guidelines

## Project Architecture

This is the **Stremio Addon SDK** - a framework for building addons that extend Stremio's media streaming capabilities. The codebase consists of:

- **Core SDK** (`src/`): Builder pattern for creating addon interfaces with resource handlers
- **M3U8 Addon** (`start-m3u8-addon.js`, `src/stremio-m3u8-addon.js`): Reference implementation for live TV streaming
- **CLI Tools** (`cli/bootstrap.js`): Scaffolding tool for new addon projects
- **HTTP Server** (`src/serveHTTP.js`): Express-based server with CORS and caching

### Key Components
- `AddonBuilder`: Fluent interface for defining manifests and handlers
- `AddonInterface`: Immutable interface returned by builder
- `serveHTTP()`: Starts Express server on port 7000 (or PORT env var)
- M3U8 parser: Extracts streams from playlist files with metadata

## Critical Developer Workflows

### Running the M3U8 Addon
```bash
npm start  # Runs start-m3u8-addon.js on port 7000
```

### Testing
```bash
npm test  # Runs tape tests in test/ directory
```

### Creating New Addons
```bash
npx addon-bootstrap my-addon-directory
# Interactive prompts for name, description, resources, types
```

### Deployment
- Set `PORT` environment variable for production
- Use `--launch` flag to auto-open Stremio with addon URL
- Manifest URL: `http://your-domain:port/manifest.json`

## Project-Specific Patterns

### Manifest Definition
```javascript
const manifest = {
    id: 'community.myaddon',  // Always use 'community.' prefix
    version: '1.0.0',
    name: 'My Addon',
    resources: ['catalog', 'stream', 'meta'],  // Only define what you implement
    types: ['tv'],  // Content types: movie, series, channel, tv
    catalogs: [{
        type: 'tv',
        id: 'mychannels',
        name: 'My Channels'
    }],
    idPrefixes: ['m3u8']  // Optional: restrict to specific ID patterns
};
```

### Handler Functions
Always return Promises. Use destructured parameters:
```javascript
builder.defineStreamHandler(({ type, id, extra }) => {
    // type: 'tv', 'movie', etc.
    // id: content identifier
    // extra: additional params like { search: 'query' }
    return Promise.resolve({ streams: [] });
});
```

### M3U8 Playlist Parsing
- Located at `./playlist` (relative to project root)
- Format: `#EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Display Name`
- Parsed into: `{ id, name, logo, group, url }`
- IDs prefixed with `m3u8_` internally: `'m3u8_' + stream.id`

### Builder Pattern Usage
```javascript
const builder = new AddonBuilder(manifest)
    .defineCatalogHandler(catalogFn)
    .defineStreamHandler(streamFn)
    .defineMetaHandler(metaFn);

const addonInterface = builder.getInterface();
serveHTTP(addonInterface, { port: 7000 });
```

## Integration Points

### External Dependencies
- **Express.js**: HTTP server with CORS middleware
- **Stremio Addon Protocol**: REST-like API over HTTP
- **M3U8 Format**: Standard playlist format for streaming URLs

### Data Flow
1. Client requests `/manifest.json` → returns addon capabilities
2. Client requests `/catalog/tv/mychannels.json` → returns content list
3. Client requests `/stream/tv/m3u8_123.json` → returns stream URLs
4. Client requests `/meta/tv/m3u8_123.json` → returns metadata

### Caching Strategy
- Manifest: Static, cached by Stremio
- Streams: Cached 5 minutes in `streamsCache` (see `getStreams()`)
- HTTP responses: `Cache-Control: max-age=3600, public` by default

## Common Patterns & Conventions

### Error Handling
- Handlers return empty arrays/objects on no results: `{ streams: [] }`
- Use `Promise.reject()` for actual errors
- Manifest validation throws on invalid configs

### ID Management
- Internal IDs: `m3u8_${stream.id}` (m3u8_ prefix)
- External IDs: Use `tvg-id` from M3U8 or base64 hash of URL
- IMDB IDs: `tt` prefix for movies/series

### File Structure for New Addons
```
my-addon/
├── addon.js          # Builder pattern, handlers
├── server.js         # HTTP server startup
├── package.json      # npm start script
└── .gitignore        # node_modules
```

### Testing with Tape
```javascript
tape('test name', function(t) {
    // Arrange
    const builder = new AddonBuilder(manifest);
    // Act
    const result = builder.defineStreamHandler(fn).getInterface();
    // Assert
    t.ok(result.manifest, 'has manifest');
    t.end();
});
```

## Key Files to Reference

- **`src/builder.js`**: AddonBuilder class and validation logic
- **`src/stremio-m3u8-addon.js`**: Complete working example
- **`src/m3u8Parser.js`**: Playlist parsing implementation
- **`cli/bootstrap.js`**: Project scaffolding templates
- **`test/basic.js`**: Testing patterns and HTTP assertions
- **`docs/protocol.md`**: Stremio addon protocol specification

## Deployment Checklist

- [ ] Set PORT environment variable
- [ ] Ensure CORS headers (handled by serveHTTP)
- [ ] Test manifest.json endpoint
- [ ] Verify all defined handlers work
- [ ] Check cache headers for performance
- [ ] Use `publishToCentral()` for addon directory listing

# Render Deployment Branch

**Note:** The branch `onrender` is used as the source for deployment to Render (https://kinabraytanstreams.onrender.com). All updates intended for the live Render service should be pushed to `onrender`.

- To update the deployed service, push changes to `onrender`.
- The default branch (`main`) is not used for Render deployment unless explicitly configured.
- Document this in your README and communicate to contributors and AI agents that `onrender` is the deploy branch.

Example workflow:
- Develop features in separate branches
- Merge to `onrender` for deployment
- Change Render service settings to deploy from `onrender` if needed