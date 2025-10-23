

<div align="center">
    <img src="https://raw.githubusercontent.com/kinabraytan/streams/main/assets/m3u8-logo.png" alt="M3U8 Addon" width="160" />
    <h1 style="font-size:2.5em; margin-bottom:0.2em;">M3U8 Live TV for Stremio</h1>
    <p style="font-size:1.2em; color:#555;">Your personal gateway to live TV streams in Stremio, powered by your own playlist.</p>
</div>

---

## 🌟 What is This?

**M3U8 Live TV for Stremio** is a custom add-on that lets you bring any live TV stream (in M3U8 format) directly into your Stremio app. No third-party catalogs, no limits—just your own curated list of channels, instantly playable.

---

## 🧩 How It Works

1. **Add your streams** to the `playlist` file (M3U8 format).
2. **Start the server** (`node start-m3u8-addon.js`).
3. **Install the manifest** in Stremio.
4. **Enjoy live TV** with rich metadata, logos, and groups.

---

## ⚡ Adaptive Streaming

This addon includes **adaptive streaming support** for improved playback quality:

- **Automatic Detection**: Detects HLS master playlists and serves them directly
- **Proxy Synthesis**: For single-variant streams, creates adaptive masters with multiple bandwidth options
- **Segment Proxying**: Proxies HLS segments with caching, retries, and rate-limiting
- **Better Buffering**: Reduces buffering issues by optimizing stream delivery

When playing a stream, Stremio will offer an "Adaptive (master)" option that uses these features for smoother playback.

---

## 🛠️ Main Components

<ul>
    <li><b>playlist</b>: Your personal M3U8 file with all channel entries.</li>
    <li><b>src/m3u8Parser.js</b>: Parses the playlist and extracts all stream info.</li>
    <li><b>src/stremio-m3u8-addon.js</b>: The add-on logic, handlers, and manifest.</li>
    <li><b>start-m3u8-addon.js</b>: Launches the HTTP server and prints the manifest URL.</li>
    <li><b>README-addon.md</b>: User guide for setup and customization.</li>
</ul>

---

## 🎨 Example Playlist Entry

```m3u
#EXTINF:-1 tvg-id="SkySpMainEvHD.uk" tvg-name="UK: Sky Sports Main Event UHD" tvg-logo="https://i.ibb.co/gwCk7Bc/sky-m-event-uhd.png" group-title="UHD | 4K",UK: Sky Sports Main Event UHD
https://a1xs.vip/2000015
```

---

## 🚦 Quick Start

```bash
git clone https://github.com/kinabraytan/streams.git
cd streams
npm install
node start-m3u8-addon.js
# Manifest: http://127.0.0.1:7000/manifest.json
```

---

## 🚀 Deploy to the Cloud

<ul>
    <li>Connect your repo to <b>Render</b> or <b>Vercel</b></li>
    <li>Choose <b>Web Service</b></li>
    <li>Build command: <code>npm install</code></li>
    <li>Start command: <code>npm start</code></li>
    <li>Manifest URL: <code>https://your-app-name.onrender.com/manifest.json</code></li>
</ul>

---

## 🖌️ Customization

- Edit <code>playlist</code> to add, remove, or update channels
- Change logos, names, and groups in the M3U8 entries
- Fork and extend the add-on logic as you wish

---

## 💡 Why Use This?

- No external catalogs—your streams, your rules
- Instantly playable in Stremio
- Open source, easy to fork and modify
- Modern, clean codebase

---

## 👤 Author & Credits

- Created by kinabraytan with GitHub Copilot
- Inspired by the Stremio Addon SDK (see <a href="./SDK-Readme.md">SDK-Readme.md</a> for full docs)

---

<div align="center">
    <img src="https://raw.githubusercontent.com/kinabraytan/streams/main/assets/tv-illustration.png" width="220" />
    <br><br>
    <b>Enjoy your personalized live TV experience in Stremio!</b>
</div>
