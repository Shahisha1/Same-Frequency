// Same Frequency - Spicetify extension
// Open someone's profile -> a "check the vibe" button shows up -> click it.
// Score comes from public playlists only (shared tracks + shared artists).

(function spotifyVibeCheck() {
  if (
    typeof Spicetify === "undefined" ||
    !Spicetify.Platform ||
    !Spicetify.Platform.History ||
    !Spicetify.CosmosAsync ||
    !Spicetify.PopupModal
  ) {
    setTimeout(spotifyVibeCheck, 300);
    return;
  }

  const MAX_PLAYLISTS = 25; // per user
  const MAX_TRACKS = 500; // per playlist
  const CONCURRENCY = 4;
  const STEP_TIMEOUT = 15000;
  const TOTAL_TIMEOUT = 60000;
  const BTN_ID = "vibe-check-btn";

  // ---------- helpers ----------

  const withTimeout = (promise, ms, label) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(label + " timed out")), ms);
      Promise.resolve(promise).then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (next < items.length) {
          const i = next++;
          out[i] = await fn(items[i], i);
        }
      },
    );
    await Promise.all(workers);
    return out;
  }

  function h(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  function addStyles() {
    if (document.getElementById("vibe-check-styles")) return;
    const style = h("style");
    style.id = "vibe-check-styles";
    style.textContent = `
      .vibe-check-root {
        --sf-ink: #1f1650;
        --sf-aqua: #7df3ff;
        --sf-cyan: #19b5da;
        --sf-pink: #ff4fd8;
        --sf-lilac: #c9b6ff;
        box-sizing: border-box;
        width: min(640px, 100%);
        max-width: 100%;
        min-width: 0;
        overflow-x: hidden;
        container-type: inline-size;
        padding: 2px 7px 7px 2px;
        color: var(--sf-ink);
        font-family: Tahoma, Verdana, "Trebuchet MS", sans-serif;
      }

      /* ---------- one continuous window ---------- */

      .vibe-check-result {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        border: 2px solid var(--sf-ink);
        border-radius: 16px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .75) 0, rgba(255, 255, 255, 0) 150px),
          repeating-linear-gradient(0deg, rgba(25, 181, 218, .14) 0 1px, transparent 1px 16px),
          repeating-linear-gradient(90deg, rgba(25, 181, 218, .14) 0 1px, transparent 1px 16px),
          linear-gradient(165deg, #b9f3ff 0%, #d9ccff 50%, #ffc5f3 100%);
        box-shadow: 5px 5px 0 var(--sf-pink);
      }

      .vibe-check-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 8px 6px 14px;
        background: linear-gradient(90deg, #2a3cff 0%, #8a4dff 55%, #ff4fd8 100%);
        color: #fff;
        font-family: "Courier New", monospace;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .06em;
        text-shadow: 1px 1px 0 rgba(31, 22, 80, .7);
      }

      .vibe-check-titlebar-btns {
        display: flex;
        gap: 4px;
      }

      .vibe-check-winbtn {
        display: grid;
        width: 20px;
        height: 20px;
        margin: 0;
        padding: 0;
        place-items: center;
        border: 1px solid var(--sf-ink);
        border-radius: 50%;
        background: linear-gradient(180deg, #ffffff 0%, #c9d4f5 100%);
        color: var(--sf-ink);
        cursor: pointer;
        font-family: Tahoma, Verdana, sans-serif;
        font-size: 11px;
        font-weight: 900;
        line-height: 1;
        text-shadow: none;
      }

      .vibe-check-winbtn:hover {
        background: linear-gradient(180deg, #d6fbff 0%, #7df3ff 100%);
      }

      .vibe-check-winbtn:last-child:hover {
        background: linear-gradient(180deg, #ffe0fa 0%, #ff4fd8 100%);
        color: #fff;
      }

      .vibe-check-winbtn:active {
        transform: translateY(1px);
      }

      .vibe-check-winbtn:focus-visible {
        outline: 2px dashed #fff;
        outline-offset: 2px;
      }

      /* rolled up: only the title bar stays */

      .vibe-check-result.is-collapsed .vibe-check-hero,
      .vibe-check-result.is-collapsed .vibe-check-lists {
        display: none;
      }

      /* our window has its own close button, so hide Spotify's modal header */

      .main-trackCreditsModal-container:has(.vibe-check-root) .main-trackCreditsModal-header {
        display: none;
      }

      .vibe-check-hero {
        position: relative;
        padding: 18px 24px 8px;
        color: var(--sf-ink);
      }

      .vibe-check-kicker {
        display: inline-block;
        padding: 2px 10px;
        border: 1px solid var(--sf-ink);
        border-radius: 999px;
        background: rgba(255, 255, 255, .8);
        font-family: "Courier New", monospace;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .14em;
        text-transform: uppercase;
      }

      .vibe-check-sticker {
        position: absolute;
        top: 12px;
        right: 18px;
        display: grid;
        width: 74px;
        height: 74px;
        place-items: center;
        padding: 10px;
        box-sizing: border-box;
        background: #ffe14f;
        clip-path: polygon(50.0% 0.0%, 57.4% 12.7%, 69.1% 3.8%, 71.1% 18.4%, 85.4% 14.6%, 81.6% 28.9%, 96.2% 30.9%, 87.3% 42.6%, 100.0% 50.0%, 87.3% 57.4%, 96.2% 69.1%, 81.6% 71.1%, 85.4% 85.4%, 71.1% 81.6%, 69.1% 96.2%, 57.4% 87.3%, 50.0% 100.0%, 42.6% 87.3%, 30.9% 96.2%, 28.9% 81.6%, 14.6% 85.4%, 18.4% 71.1%, 3.8% 69.1%, 12.7% 57.4%, 0.0% 50.0%, 12.7% 42.6%, 3.8% 30.9%, 18.4% 28.9%, 14.6% 14.6%, 28.9% 18.4%, 30.9% 3.8%, 42.6% 12.7%);
        font-family: "Arial Black", Impact, sans-serif;
        font-size: 11px;
        font-style: italic;
        line-height: 1;
        text-align: center;
        text-transform: uppercase;
        transform: rotate(14deg);
      }

      .vibe-check-score-row {
        display: flex;
        align-items: baseline;
        gap: 12px;
        margin-top: 10px;
      }

      .vibe-check-score {
        background: linear-gradient(180deg, #ffffff 0%, #bfefff 38%, #6f8cff 50%, #ff7be6 51%, #ffd1f6 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        -webkit-text-stroke: 2px var(--sf-ink);
        paint-order: stroke fill;
        filter: drop-shadow(3px 3px 0 var(--sf-ink));
        font-family: "Arial Black", Impact, Verdana, sans-serif;
        font-size: clamp(50px, 12vw, 68px);
        font-style: italic;
        font-weight: 900;
        letter-spacing: -.03em;
        line-height: 1;
      }

      .vibe-check-score-copy {
        max-width: 200px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .08em;
        line-height: 1.3;
        text-transform: uppercase;
      }

      .vibe-check-meter {
        box-sizing: border-box;
        height: 20px;
        margin-top: 14px;
        padding: 2px;
        border: 2px solid var(--sf-ink);
        border-radius: 999px;
        background: rgba(255, 255, 255, .9);
        overflow: hidden;
      }

      .vibe-check-meter-fill {
        width: 0;
        height: 100%;
        background: repeating-linear-gradient(90deg, #19b5da 0 9px, transparent 9px 12px);
        box-shadow: inset 0 -6px 0 rgba(255, 79, 216, .55);
        transition: width .7s steps(12);
      }

      .vibe-check-status {
        display: flex;
        align-items: center;
        gap: 9px;
        min-height: 20px;
        margin-top: 11px;
        color: var(--sf-ink);
        font-family: "Courier New", monospace;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.45;
      }

      .vibe-check-loader {
        display: block;
        flex: 0 0 auto;
        width: 10px;
        height: 10px;
        border: 1px solid var(--sf-ink);
        background: var(--sf-pink);
        animation: vibe-check-blink .9s steps(2, jump-none) infinite;
      }

      .vibe-check-score-note {
        margin-top: 4px;
        color: #4a4f86;
        font-size: 11px;
        line-height: 1.5;
      }

      /* loading: the same window, just scanning */

      .vibe-check-result.is-loading .vibe-check-meter-fill {
        width: 28%;
        animation: vibe-check-scan 1.3s steps(14, jump-none) infinite alternate;
      }

      .vibe-check-result.is-loading .vibe-check-score {
        animation: vibe-check-pulse 1s steps(2, jump-none) infinite;
      }

      @keyframes vibe-check-scan {
        from { margin-left: 0; }
        to { margin-left: 72%; }
      }

      @keyframes vibe-check-pulse {
        from { opacity: 1; }
        to { opacity: .45; }
      }

      @keyframes vibe-check-blink {
        from { background: var(--sf-pink); }
        to { background: var(--sf-aqua); }
      }

      /* error: same window, no scanning */

      .vibe-check-result.is-error .vibe-check-loader {
        display: none;
      }

      .vibe-check-result.is-error .vibe-check-status {
        color: #b0002f;
      }

      .vibe-check-result.is-error .vibe-check-status::before {
        content: "!";
        display: grid;
        flex: 0 0 auto;
        width: 16px;
        height: 16px;
        place-items: center;
        border: 1px solid var(--sf-ink);
        border-radius: 50%;
        background: #ffd24f;
        color: var(--sf-ink);
        font-weight: 900;
      }

      /* ---------- lists flow straight out of the hero ---------- */

      .vibe-check-lists {
        display: grid;
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        gap: 20px;
        padding: 14px 24px 24px;
      }

      .vibe-check-lists:empty {
        display: none;
      }

      .vibe-check-lists > section {
        min-width: 0;
      }

      .vibe-check-list-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
        padding-bottom: 6px;
        border-bottom: 2px dotted rgba(31, 22, 80, .4);
        font-family: "Arial Black", Impact, Verdana, sans-serif;
        font-size: 12px;
        font-style: italic;
        letter-spacing: .04em;
        text-transform: uppercase;
      }

      .vibe-check-list-heading > span:first-child::before {
        content: "✶";
        margin-right: 6px;
        color: var(--sf-pink);
      }

      .vibe-check-count {
        padding: 1px 9px;
        border: 1px solid var(--sf-ink);
        border-radius: 999px;
        background: var(--sf-pink);
        color: #fff;
        font-family: Tahoma, Verdana, sans-serif;
        font-size: 10px;
        font-style: normal;
        font-weight: 700;
        letter-spacing: 0;
        text-shadow: 1px 1px 0 var(--sf-ink);
        text-transform: none;
      }

      .vibe-check-count:empty {
        display: none;
      }

      .vibe-check-card-grid {
        display: grid;
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 14px;
        padding: 2px 4px 6px 0;
      }

      .vibe-check-media-card {
        min-width: 0;
        background: transparent;
        transition: transform .12s steps(3);
      }

      .vibe-check-media-card:hover {
        transform: translateY(-3px);
      }

      .vibe-check-media-image,
      .vibe-check-media-placeholder {
        display: block;
        box-sizing: border-box;
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        border: 3px solid #fff;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 0 0 1.5px var(--sf-ink), 3px 3px 0 1.5px var(--sf-ink);
      }

      .vibe-check-media-card:hover .vibe-check-media-image,
      .vibe-check-media-card:hover .vibe-check-media-placeholder {
        box-shadow: 0 0 0 1.5px var(--sf-ink), 3px 3px 0 1.5px var(--sf-pink);
      }

      .vibe-check-media-placeholder {
        display: grid;
        place-items: center;
        padding: 8px;
        background: repeating-linear-gradient(45deg, #e8ecfb 0 6px, #d3dbf5 6px 12px);
        color: #4a4f86;
        font-family: "Courier New", monospace;
        font-size: 10px;
        text-align: center;
      }

      .vibe-check-media-name {
        overflow: hidden;
        margin-top: 8px;
        color: var(--sf-ink);
        font-size: 11px;
        font-weight: 700;
        line-height: 1.3;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .vibe-check-empty {
        color: #4a4f86;
        font-family: "Courier New", monospace;
        font-size: 12px;
      }

      @container (max-width: 520px) {
        .vibe-check-card-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      @container (max-width: 420px) {
        .vibe-check-hero {
          padding: 16px 17px 8px;
        }

        .vibe-check-sticker {
          width: 60px;
          height: 60px;
          font-size: 9px;
        }

        .vibe-check-lists {
          padding-right: 17px;
          padding-left: 17px;
        }

        .vibe-check-card-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      /* ---------- the glossy gel button ---------- */

      .vibe-check-button {
        border: 1px solid #0b6f93;
        border-radius: 999px;
        background: linear-gradient(180deg, #d6fbff 0%, #6fe0f5 48%, #19b5da 52%, #8af2ff 100%);
        box-shadow:
          inset 0 1px 0 #fff,
          inset 0 -2px 3px rgba(0, 80, 120, .35),
          0 2px 0 #0b6f93;
        color: #06344a;
        cursor: pointer;
        font-family: Tahoma, Verdana, sans-serif;
        font-size: 13px;
        font-weight: 700;
        text-shadow: 0 1px 0 rgba(255, 255, 255, .75);
        transition: filter .12s ease;
      }

      .vibe-check-button:hover {
        border-color: #a0108a;
        background: linear-gradient(180deg, #ffe0fa 0%, #ff8fe8 48%, #f230c8 52%, #ffa6ee 100%);
        color: #4a0040;
      }

      .vibe-check-button:active {
        filter: brightness(.94);
      }

      .vibe-check-button:focus-visible {
        outline: 2px dashed #ff4fd8;
        outline-offset: 3px;
      }

      @media (prefers-reduced-motion: reduce) {
        .vibe-check-button,
        .vibe-check-media-card,
        .vibe-check-meter-fill {
          transition: none;
        }

        .vibe-check-loader,
        .vibe-check-result.is-loading .vibe-check-meter-fill,
        .vibe-check-result.is-loading .vibe-check-score {
          animation: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- spotify data ----------

  let myIdCache = null;
  async function getMyId() {
    if (myIdCache) return myIdCache;
    try {
      const me = await withTimeout(
        Spicetify.CosmosAsync.get("https://api.spotify.com/v1/me"),
        STEP_TIMEOUT,
        "profile",
      );
      if (me && me.id) return (myIdCache = me.id);
    } catch (e) {}
    try {
      const u = await withTimeout(
        Spicetify.Platform.UserAPI.getUser(),
        STEP_TIMEOUT,
        "profile",
      );
      if (u && u.username) return (myIdCache = u.username);
    } catch (e) {}
    throw new Error(
      "Couldn’t find your Spotify profile. Restart Spotify and try again.",
    );
  }

  async function getPublicPlaylists(userId) {
    const id = encodeURIComponent(userId);
    const found = new Map();

    try {
      const r = await withTimeout(
        Spicetify.CosmosAsync.get(
          "https://api.spotify.com/v1/users/" +
            id +
            "/playlists?limit=" +
            MAX_PLAYLISTS,
        ),
        STEP_TIMEOUT,
        "playlist list",
      );
      for (const p of (r && r.items) || []) {
        if (p && p.id && p.public !== false)
          found.set(p.id, { id: p.id, uri: "spotify:playlist:" + p.id });
      }
    } catch (e) {}

    if (!found.size) {
      try {
        const r = await withTimeout(
          Spicetify.CosmosAsync.get(
            "https://spclient.wg.spotify.com/user-profile-view/v3/profile/" +
              id +
              "/playlists?limit=" +
              MAX_PLAYLISTS,
          ),
          STEP_TIMEOUT,
          "playlist list",
        );
        for (const p of (r && (r.public_playlists || r.playlists)) || []) {
          const uri = p && p.uri;
          if (uri && uri.startsWith("spotify:playlist:")) {
            const pid = uri.split(":")[2];
            found.set(pid, { id: pid, uri });
          }
        }
      } catch (e) {}
    }

    return Array.from(found.values()).slice(0, MAX_PLAYLISTS);
  }

  function imageUrl(source) {
    const values =
      typeof source === "string"
        ? [source]
        : source
          ? [source.url, source.uri]
          : [];
    for (const value of values) {
      if (typeof value !== "string") continue;
      if (/^https?:\/\//i.test(value)) return value;
      const spotifyImage = value.match(/^spotify:image:([A-Za-z0-9]+)$/);
      if (spotifyImage) return "https://i.scdn.co/image/" + spotifyImage[1];
    }
    return null;
  }

  function imageSources(value) {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }

  function normalize(entry) {
    const t = entry && (entry.item || entry.track || entry);
    if (!t || typeof t.uri !== "string" || !t.uri.startsWith("spotify:track:"))
      return null;
    const artists = (t.artists || [])
      .map((a) => {
        const visual = a.visuals && a.visuals.avatarImage;
        const profile = a.profile || {};
        const sources = [
          ...imageSources(a.images),
          ...imageSources(visual && visual.sources),
          ...imageSources(profile.image),
          ...imageSources(profile.portrait && profile.portrait.sources),
        ];
        const artistImageUrls = Array.from(
          new Set(sources.map(imageUrl).filter(Boolean)),
        );
        return {
          key: a.uri || a.name,
          name: a.name,
          imageUrl: artistImageUrls[0] || null,
          imageUrls: artistImageUrls,
        };
      })
      .filter((a) => a.key && a.name);
    const metadata = t.metadata || (entry && entry.metadata) || {};
    const album = t.album || t.albumOfTrack || {};
    const sources = [
      ...imageSources(album.images),
      ...imageSources(album.coverArt && album.coverArt.sources),
      ...imageSources(
        t.albumOfTrack &&
          t.albumOfTrack.coverArt &&
          t.albumOfTrack.coverArt.sources,
      ),
      ...imageSources(t.images),
      metadata.image_xlarge_url,
      metadata.image_large_url,
      metadata.image_url,
      metadata.image_small_url,
    ];
    const coverUrls = sources.map(imageUrl).filter(Boolean);
    const uniqueCoverUrls = Array.from(new Set(coverUrls));
    return {
      uri: t.uri,
      name: t.name || "Unknown track",
      imageUrl: uniqueCoverUrls[0] || null,
      imageUrls: uniqueCoverUrls,
      artists,
    };
  }

  async function getPlaylistTracks(pl) {
    try {
      const c = await withTimeout(
        Spicetify.Platform.PlaylistAPI.getContents(pl.uri, {
          limit: MAX_TRACKS,
        }),
        STEP_TIMEOUT,
        "playlist",
      );
      const tracks = ((c && c.items) || []).map(normalize).filter(Boolean);
      if (tracks.length) return tracks;
    } catch (e) {}
    for (const path of ["items", "tracks"]) {
      try {
        const r = await withTimeout(
          Spicetify.CosmosAsync.get(
            "https://api.spotify.com/v1/playlists/" +
              pl.id +
              "/" +
              path +
              "?limit=100",
          ),
          STEP_TIMEOUT,
          "playlist",
        );
        const tracks = ((r && r.items) || []).map(normalize).filter(Boolean);
        if (tracks.length) return tracks;
      } catch (e) {}
    }
    return [];
  }

  async function collect(userId, label, onStatus) {
    onStatus("Checking " + label + " public playlists...");
    const playlists = await getPublicPlaylists(userId);
    if (!playlists.length) {
      const nextStep =
        label === "your"
          ? "Make one of your playlists public, then try again."
          : "Ask them to make one of their playlists public, then try again.";
      throw new Error(
        "No public playlists found on " + label + " profile. " + nextStep,
      );
    }
    const lists = await mapLimit(playlists, CONCURRENCY, (pl) =>
      getPlaylistTracks(pl),
    );
    const tracks = new Map(); // uri -> label
    const artists = new Map(); // key -> name
    for (const list of lists) {
      for (const t of list) {
        if (!tracks.has(t.uri)) {
          tracks.set(t.uri, {
            key: t.uri,
            name: t.name + (t.artists[0] ? " - " + t.artists[0].name : ""),
            imageUrl: t.imageUrl,
            imageUrls: t.imageUrls,
            artistKeys: t.artists.map((artist) => artist.key),
          });
        }
        for (const a of t.artists) {
          const current = artists.get(a.key);
          const artist = {
            ...a,
            fallbackImageUrl: t.imageUrl || null,
            fallbackImageUrls: t.imageUrls || [],
          };
          if (
            !current ||
            (!current.fallbackImageUrl && artist.fallbackImageUrl)
          ) {
            artists.set(a.key, artist);
          }
        }
      }
    }
    if (!tracks.size) {
      const nextStep =
        label === "your"
          ? "Check that one of your public playlists has songs."
          : "Ask them to check that a public playlist has songs.";
      throw new Error(
        "Couldn’t read tracks from " + label + " public playlists. " + nextStep,
      );
    }
    return { tracks, artists };
  }

  // your own library is the same for every check, so load it once per session
  let minePromise = null;
  function getMine(onStatus) {
    if (!minePromise) {
      minePromise = getMyId().then((id) => collect(id, "your", onStatus));
      minePromise.catch(() => {
        minePromise = null;
      });
    }
    return minePromise;
  }

  function overlap(a, b) {
    const shared = [];
    for (const [k, v] of a) if (b.has(k)) shared.push(v);
    const smaller = Math.min(a.size, b.size);
    const percent = smaller ? (shared.length / smaller) * 100 : 0;
    return { shared, percent };
  }

  const artistImageCache = new Map();
  function artistImageSources(artist) {
    const union =
      artist &&
      (artist.artistUnion || (artist.data && artist.data.artistUnion));
    const profile = artist && artist.profile;
    const unionProfile = union && union.profile;
    const visuals = (artist && artist.visuals) || (union && union.visuals);
    const avatar = visuals && visuals.avatarImage;
    const portrait =
      (profile && profile.portrait) ||
      (unionProfile && unionProfile.portrait) ||
      (artist && artist.portrait);
    const candidates = [
      artist && artist.images,
      avatar && avatar.sources,
      profile && profile.image,
      unionProfile && unionProfile.image,
      portrait && portrait.sources,
      portrait,
    ];
    return candidates.flatMap(imageSources);
  }

  async function loadArtistImages(artists) {
    const targets = Array.from(
      new Map(
        artists
          .filter(
            (artist) =>
              !artist.imageUrl &&
              !(artist.fallbackImageUrls && artist.fallbackImageUrls.length) &&
              !artistImageCache.has(artist.key),
          )
          .map((artist) => [artist.key, artist]),
      ).values(),
    ).slice(0, 10);

    await mapLimit(targets, CONCURRENCY, async (item) => {
      let artist = null;
      let image = null;
      const api = Spicetify.Platform.ArtistAPI;
      const spotifyId = item.key.match(/^spotify:artist:([A-Za-z0-9]+)$/);

      try {
        if (spotifyId && api && typeof api.getArtist === "function") {
          artist = await withTimeout(
            api.getArtist(item.key),
            STEP_TIMEOUT,
            "artist metadata",
          );
        }
        image = artistImageSources(artist).map(imageUrl).find(Boolean) || null;
      } catch (error) {
        console.warn(
          "[Same Frequency] Internal artist lookup failed:",
          item.name,
          error,
        );
      }

      if (!image && spotifyId) {
        try {
          artist = await withTimeout(
            Spicetify.CosmosAsync.get(
              "https://api.spotify.com/v1/artists/" + spotifyId[1],
            ),
            STEP_TIMEOUT,
            "artist metadata",
          );
          image =
            artistImageSources(artist).map(imageUrl).find(Boolean) || null;
        } catch (error) {
          console.warn(
            "[Same Frequency] Could not load artist metadata:",
            item.name,
            error,
          );
        }
      }

      if (!image) {
        try {
          const query = encodeURIComponent('artist:"' + item.name + '"');
          const response = await withTimeout(
            Spicetify.CosmosAsync.get(
              "https://api.spotify.com/v1/search?q=" +
                query +
                "&type=artist&limit=5",
            ),
            STEP_TIMEOUT,
            "artist image search",
          );
          const matches =
            (response && response.artists && response.artists.items) || [];
          const match = matches.find(
            (candidate) =>
              candidate.name.toLowerCase() === item.name.toLowerCase(),
          );
          image =
            (match && (match.images || []).map(imageUrl).find(Boolean)) || null;
        } catch (error) {
          console.warn(
            "[Same Frequency] Could not search artist artwork:",
            item.name,
            error,
          );
        }
      }

      artistImageCache.set(item.key, image);
    });
  }

  async function compare(friendId, onStatus) {
    const myId = await getMyId();
    if (myId.toLowerCase() === friendId.toLowerCase()) {
      throw new Error(
        "That’s your profile. Open someone else’s to run the comparison.",
      );
    }

    const [mine, theirs] = await withTimeout(
      Promise.all([getMine(onStatus), collect(friendId, "their", onStatus)]),
      TOTAL_TIMEOUT,
      "the playlist comparison",
    );

    const t = overlap(mine.tracks, theirs.tracks);
    const a = overlap(mine.artists, theirs.artists);
    const relatedTrackImages = new Map();
    for (const track of t.shared) {
      const images = [...(track.imageUrls || []), track.imageUrl].filter(
        Boolean,
      );
      for (const artistKey of track.artistKeys || []) {
        const existing = relatedTrackImages.get(artistKey) || [];
        relatedTrackImages.set(
          artistKey,
          Array.from(new Set([...existing, ...images])),
        );
      }
    }
    const sharedArtistCards = Array.from(mine.artists)
      .filter(([key]) => theirs.artists.has(key))
      .map(([key, artist]) => {
        const theirArtist = theirs.artists.get(key);
        const relatedTrackImageUrls = relatedTrackImages.get(key) || [];
        const fallbackImageUrls = Array.from(
          new Set([
            ...relatedTrackImageUrls,
            ...(artist.fallbackImageUrls || []),
            ...((theirArtist && theirArtist.fallbackImageUrls) || []),
          ]),
        );
        return {
          ...artist,
          key,
          relatedTrackImageUrls,
          fallbackImageUrl:
            artist.fallbackImageUrl ||
            (theirArtist && theirArtist.fallbackImageUrl) ||
            null,
          fallbackImageUrls,
        };
      });
    for (const artist of sharedArtistCards) {
      artist.imageUrl =
        artist.imageUrl ||
        artist.relatedTrackImageUrls[0] ||
        artist.fallbackImageUrls[0] ||
        artist.fallbackImageUrl ||
        null;
    }
    await loadArtistImages(sharedArtistCards.slice(0, 5));
    for (const artist of sharedArtistCards) {
      artist.imageUrl =
        artist.imageUrl || artistImageCache.get(artist.key) || null;
    }
    return {
      score: Math.round((t.percent + a.percent) / 2),
      trackPct: Math.round(t.percent),
      artistPct: Math.round(a.percent),
      sharedTracks: t.shared,
      sharedArtists: sharedArtistCards,
    };
  }

  // ---------- result popup ----------

  // One window for the whole flow: it is built up front in a loading state,
  // then filled in place when the comparison finishes.
  function buildWindow() {
    const card = h("section", "vibe-check-result is-loading");

    const titlebar = h("div", "vibe-check-titlebar");
    titlebar.appendChild(h("span", null, "same_frequency.exe"));
    const winBtns = h("span", "vibe-check-titlebar-btns");
    const makeWinBtn = (glyph, label) => {
      const btn = h("button", "vibe-check-winbtn", glyph);
      btn.type = "button";
      btn.setAttribute("aria-label", label);
      btn.title = label;
      return btn;
    };
    const minBtn = makeWinBtn("_", "Minimize");
    const maxBtn = makeWinBtn("\u25a1", "Restore");
    const closeBtn = makeWinBtn("\u00d7", "Close");
    winBtns.append(minBtn, maxBtn, closeBtn);
    titlebar.appendChild(winBtns);
    card.appendChild(titlebar);

    const hero = h("div", "vibe-check-hero");
    hero.appendChild(h("div", "vibe-check-kicker", "The overlap"));
    const sticker = h("div", "vibe-check-sticker", "same freq!");
    sticker.setAttribute("aria-hidden", "true");
    hero.appendChild(sticker);

    const scoreRow = h("div", "vibe-check-score-row");
    const score = h("div", "vibe-check-score", "??%");
    const scoreText = h(
      "div",
      "vibe-check-score-copy",
      "overlap across public playlists",
    );
    scoreRow.append(score, scoreText);
    hero.appendChild(scoreRow);

    const meter = h("div", "vibe-check-meter");
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", "Playlist overlap");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    const meterFill = h("div", "vibe-check-meter-fill");
    meter.appendChild(meterFill);
    hero.appendChild(meter);

    const status = h("div", "vibe-check-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-busy", "true");
    const loader = h("span", "vibe-check-loader");
    const statusMessage = h("span", null, "Checking public playlists...");
    status.append(loader, statusMessage);
    hero.appendChild(status);

    const note = h(
      "div",
      "vibe-check-score-note",
      "A little look at the artists and tracks you both keep around. Public playlists only.",
    );
    hero.appendChild(note);
    card.appendChild(hero);

    const lists = h("div", "vibe-check-lists");
    card.appendChild(lists);

    return {
      card,
      titlebar,
      minBtn,
      maxBtn,
      closeBtn,
      score,
      meter,
      meterFill,
      status,
      loader,
      statusMessage,
      note,
      lists,
    };
  }

  // title-bar buttons: _ rolls the window up, \u25a1 restores it, \u00d7 closes the popup
  function wireTitlebar(win, onClose) {
    const setCollapsed = (on) => {
      win.card.classList.toggle("is-collapsed", on);
      win.minBtn.setAttribute("aria-pressed", String(on));
    };
    const toggle = () =>
      setCollapsed(!win.card.classList.contains("is-collapsed"));
    win.minBtn.addEventListener("click", toggle);
    win.maxBtn.addEventListener("click", () => setCollapsed(false));
    win.titlebar.addEventListener("dblclick", toggle);
    win.closeBtn.addEventListener("click", onClose);
  }

  // Spotify's own modal header (title + X) is redundant now; hide it once mounted.
  function hideNativeModalHeader(root) {
    let tries = 0;
    const tick = () => {
      const modal =
        root.isConnected &&
        root.closest(
          '.main-trackCreditsModal-container, .GenericModal, [role="dialog"]',
        );
      const header =
        modal && modal.querySelector(".main-trackCreditsModal-header");
      if (header) {
        header.style.display = "none";
      } else if (++tries < 12) {
        setTimeout(tick, 50);
      }
    };
    tick();
  }

  function renderResult(win, r) {
    win.card.classList.remove("is-loading");
    win.score.textContent = r.score + "%";
    const pct = Math.max(0, Math.min(100, r.score));
    win.meter.setAttribute("aria-valuenow", String(r.score));
    win.meterFill.style.width = pct + "%";
    win.status.setAttribute("aria-busy", "false");
    win.loader.remove();
    win.statusMessage.textContent =
      r.sharedTracks.length +
      " tracks and " +
      r.sharedArtists.length +
      " artists in common";
    win.note.textContent =
      "A rough count from public playlists only \u2014 not a rating of either person\u2019s taste.";

    const lists = win.lists;
    lists.textContent = "";
    const addImageCards = (title, items, unavailableMessage) => {
      const section = h("section");
      const heading = h("div", "vibe-check-list-heading");
      heading.append(h("span", null, title));
      const countText =
        items === null
          ? ""
          : items.length > 5
            ? "Showing 5 of " + items.length
            : items.length + (items.length === 1 ? " match" : " matches");
      heading.appendChild(h("span", "vibe-check-count", countText));
      section.appendChild(heading);

      if (items === null) {
        section.appendChild(h("div", "vibe-check-empty", unavailableMessage));
      } else if (!items.length) {
        section.appendChild(
          h("div", "vibe-check-empty", "Nothing shared here this time."),
        );
      } else {
        const grid = h("div", "vibe-check-card-grid");
        for (const item of items.slice(0, 5)) {
          const card = h("div", "vibe-check-media-card");
          const imageUrls = Array.from(
            new Set(
              [
                ...(item.relatedTrackImageUrls || []),
                ...(item.imageUrls || []),
                item.imageUrl,
                ...(item.fallbackImageUrls || []),
                item.fallbackImageUrl,
              ].filter(Boolean),
            ),
          );
          if (imageUrls.length) {
            const image = h("img", "vibe-check-media-image");
            image.alt = item.name;
            image.loading = "eager";
            let nextImage = 1;
            image.addEventListener("error", function tryNextImage() {
              if (nextImage < imageUrls.length) {
                image.src = imageUrls[nextImage++];
              } else {
                if (title === "Artists in both playlists") {
                  console.warn(
                    "[Same Frequency] All artist image URLs failed:",
                    item.name,
                    imageUrls,
                  );
                }
                image.replaceWith(
                  h("div", "vibe-check-media-placeholder", "Image unavailable"),
                );
              }
            });
            card.appendChild(image);
            image.src = imageUrls[0];
          } else {
            if (title === "Artists in both playlists") {
              console.warn(
                "[Same Frequency] No artist image URLs found:",
                item.name,
                item.key,
              );
            }
            card.appendChild(
              h("div", "vibe-check-media-placeholder", "Image unavailable"),
            );
          }
          card.appendChild(h("div", "vibe-check-media-name", item.name));
          grid.appendChild(card);
        }
        section.appendChild(grid);
      }
      lists.appendChild(section);
    };
    addImageCards("Artists in both playlists", r.sharedArtists);
    addImageCards("Tracks in both playlists", r.sharedTracks);
  }

  async function openVibeCheck(friendId) {
    addStyles();
    const root = h("div");
    root.className = "vibe-check-root";
    const win = buildWindow();
    root.appendChild(win.card);
    wireTitlebar(win, () => Spicetify.PopupModal.hide());
    Spicetify.PopupModal.display({
      title: "Same Frequency",
      content: root,
      isLarge: true,
    });
    hideNativeModalHeader(root);

    try {
      const r = await compare(friendId, (m) => {
        win.statusMessage.textContent = m;
      });
      renderResult(win, r);
    } catch (e) {
      win.card.classList.remove("is-loading");
      win.card.classList.add("is-error");
      win.status.setAttribute("aria-busy", "false");
      win.statusMessage.textContent =
        (e && e.message) ||
        "Couldn\u2019t load the playlists. Try again in a bit.";
    }
  }

  // ---------- button on other people's profile pages ----------

  function currentProfileId() {
    const loc = Spicetify.Platform.History.location || window.location;
    const m = ((loc && loc.pathname) || "").match(/^\/user\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function makeButton(friendId, floating) {
    const b = h("button", "vibe-check-button", "compare our playlists");
    b.style.cssText = floating
      ? "position:fixed;right:24px;bottom:112px;z-index:1000;padding:10px 17px;box-shadow:0 2px 0 #0b6f93,4px 5px 0 #ff4fd8;"
      : "margin-left:16px;flex:none;padding:7px 15px;";
    b.id = BTN_ID;
    b.dataset.user = friendId;
    if (floating) b.dataset.floating = "1";
    b.addEventListener("click", () => openVibeCheck(friendId));
    return b;
  }

  // finds the row with the Follow/Following button and the "..." menu
  function findActionRow() {
    const main =
      document.querySelector(".main-view-container, main") || document.body;
    const row = main.querySelector(
      '[data-testid="action-bar-row"], .main-actionBar-ActionBar',
    );
    if (row) return row;

    const buttons = Array.from(main.querySelectorAll("button"));
    const follow = buttons.find((b) =>
      /^(follow|following)$/i.test((b.textContent || "").trim()),
    );
    const more = buttons.find((b) =>
      /more options/i.test(b.getAttribute("aria-label") || ""),
    );
    if (follow && more) {
      let node = follow.parentElement;
      while (node && !node.contains(more)) node = node.parentElement;
      if (node && node !== main && node !== document.body) return node;
    }
    const anchor = follow || more;
    return anchor ? anchor.parentElement : null;
  }

  async function syncButton() {
    const friendId = currentProfileId();
    let existing = document.getElementById(BTN_ID);

    if (!friendId) {
      if (existing) existing.remove();
      return;
    }
    if (existing && existing.dataset.user === friendId) {
      // was floating because the row wasn't rendered yet -> move it into the row
      if (existing.dataset.floating === "1") {
        const row = findActionRow();
        if (row) {
          existing.remove();
          row.appendChild(makeButton(friendId, false));
        }
      }
      return;
    }

    addStyles();
    let myId;
    try {
      myId = await getMyId();
    } catch (e) {
      return;
    }

    // page may have changed while waiting
    if (currentProfileId() !== friendId) return;
    existing = document.getElementById(BTN_ID);
    if (existing) {
      if (existing.dataset.user === friendId) return;
      existing.remove();
    }
    if (myId.toLowerCase() === friendId.toLowerCase()) return;

    const host = findActionRow();
    if (host) host.appendChild(makeButton(friendId, false));
    else document.body.appendChild(makeButton(friendId, true));
  }

  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(syncButton, 400);
  };

  Spicetify.Platform.History.listen(schedule);
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
  });
  schedule();
})();