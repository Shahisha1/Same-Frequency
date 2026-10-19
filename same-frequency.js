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
        box-sizing: border-box;
        width: min(640px, 100%);
        max-width: 100%;
        min-width: 0;
        overflow-x: hidden;
        color: #302b26;
        font-family: inherit;
      }

      .vibe-check-intro,
      .vibe-check-status {
        margin-bottom: 14px;
        padding: 10px 0;
      }

      .vibe-check-intro-title {
        color: #a4513b;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .12em;
        text-transform: uppercase;
      }

      .vibe-check-intro-copy {
        margin-top: 6px;
        color: #6b6259;
        font-size: 13px;
        line-height: 1.5;
      }

      .vibe-check-status {
        display: flex;
        align-items: center;
        gap: 9px;
        min-height: 28px;
        margin: 0;
        padding: 5px 0;
        border: 0;
        background: transparent;
        color: #625950;
        font-size: 12px;
      }

      .vibe-check-loader {
        display: block;
        flex: 0 0 auto;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #b85f43;
      }

      .vibe-check-status.is-error {
        color: #a33f34;
      }

      .vibe-check-status.is-error .vibe-check-loader {
        display: none;
      }

      .vibe-check-result {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        border: 1px solid #d9ccbb;
        border-radius: 5px;
        background: #f4eee4;
      }

      .vibe-check-hero {
        padding: 22px 24px 19px;
        background: #eee4d5;
        color: #302b26;
      }

      .vibe-check-kicker {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .13em;
        text-transform: uppercase;
        color: #a4513b;
      }

      .vibe-check-score-row {
        display: flex;
        align-items: baseline;
        gap: 11px;
        margin-top: 7px;
      }

      .vibe-check-score {
        color: #a4513b;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(48px, 12vw, 62px);
        font-weight: 400;
        letter-spacing: -.07em;
        line-height: .95;
      }

      .vibe-check-score-copy {
        max-width: 240px;
        color: #4d453e;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 19px;
        font-weight: 400;
        line-height: 1.25;
      }

      .vibe-check-summary {
        margin-top: 9px;
        color: #6b6259;
        font-size: 12px;
        line-height: 1.45;
      }

      .vibe-check-score-note {
        padding: 11px 24px;
        border-top: 1px solid #ded2c2;
        color: #74695f;
        font-size: 11px;
        line-height: 1.5;
      }

      .vibe-check-lists {
        display: grid;
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        gap: 20px;
        padding: 17px 20px 21px;
      }

      .vibe-check-lists > section {
        min-width: 0;
      }

      .vibe-check-card-grid {
        display: grid;
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 12px;
      }

      .vibe-check-media-card {
        min-width: 0;
        overflow: hidden;
        border: 0;
        background: transparent;
      }

      .vibe-check-media-image,
      .vibe-check-media-placeholder {
        display: block;
        box-sizing: border-box;
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        background: #e2d7c8;
      }

      .vibe-check-media-placeholder {
        display: grid;
        place-items: center;
        padding: 8px;
        color: #766b60;
        font-size: 10px;
        text-align: center;
      }

      .vibe-check-media-name {
        overflow: hidden;
        padding: 7px 1px 0;
        color: #39332e;
        font-size: 11px;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      @media (max-width: 700px) {
        .vibe-check-card-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      @media (max-width: 420px) {
        .vibe-check-hero {
          padding: 19px 17px 16px;
        }

        .vibe-check-score-note {
          padding-right: 17px;
          padding-left: 17px;
        }

        .vibe-check-lists {
          padding-right: 15px;
          padding-left: 15px;
        }

        .vibe-check-card-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      .vibe-check-list-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
        padding-bottom: 7px;
        border-bottom: 1px solid #ded2c2;
        color: #39332e;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 16px;
        font-weight: 400;
      }

      .vibe-check-count {
        color: #81766b;
        font-family: inherit;
        font-size: 10px;
        font-weight: 500;
      }

      .vibe-check-empty {
        color: #766b60;
        font-size: 12px;
      }

      .vibe-check-button {
        border: 1px solid #a4513b;
        border-radius: 4px;
        background: #a4513b;
        color: #fff8ef;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        transition: background-color .15s ease, border-color .15s ease;
      }

      .vibe-check-button:hover {
        border-color: #873f30;
        background: #873f30;
      }

      .vibe-check-button:focus-visible {
        outline: 2px solid #a4513b;
        outline-offset: 3px;
      }

      @media (prefers-reduced-motion: reduce) {
        .vibe-check-button {
          transition: none;
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
    const values = typeof source === "string"
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
      ...imageSources(t.albumOfTrack && t.albumOfTrack.coverArt && t.albumOfTrack.coverArt.sources),
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
          tracks.set(
            t.uri,
            {
              key: t.uri,
              name: t.name + (t.artists[0] ? " - " + t.artists[0].name : ""),
              imageUrl: t.imageUrl,
              imageUrls: t.imageUrls,
              artistKeys: t.artists.map((artist) => artist.key),
            },
          );
        }
        for (const a of t.artists) {
          const current = artists.get(a.key);
          const artist = {
            ...a,
            fallbackImageUrl: t.imageUrl || null,
            fallbackImageUrls: t.imageUrls || [],
          };
          if (!current || (!current.fallbackImageUrl && artist.fallbackImageUrl)) {
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
    const union = artist && (
      artist.artistUnion ||
      (artist.data && artist.data.artistUnion)
    );
    const profile = artist && artist.profile;
    const unionProfile = union && union.profile;
    const visuals = (artist && artist.visuals) || (union && union.visuals);
    const avatar = visuals && visuals.avatarImage;
    const portrait = (profile && profile.portrait) ||
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
        console.warn("[Same Frequency] Internal artist lookup failed:", item.name, error);
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
          image = artistImageSources(artist).map(imageUrl).find(Boolean) || null;
        } catch (error) {
          console.warn("[Same Frequency] Could not load artist metadata:", item.name, error);
        }
      }

      if (!image) {
        try {
          const query = encodeURIComponent('artist:"' + item.name + '"');
          const response = await withTimeout(
            Spicetify.CosmosAsync.get(
              "https://api.spotify.com/v1/search?q=" + query + "&type=artist&limit=5",
            ),
            STEP_TIMEOUT,
            "artist image search",
          );
          const matches = (response && response.artists && response.artists.items) || [];
          const match = matches.find(
            (candidate) => candidate.name.toLowerCase() === item.name.toLowerCase(),
          );
          image = (match && (match.images || []).map(imageUrl).find(Boolean)) || null;
        } catch (error) {
          console.warn("[Same Frequency] Could not search artist artwork:", item.name, error);
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
      Promise.all([
        getMine(onStatus),
        collect(friendId, "their", onStatus),
      ]),
      TOTAL_TIMEOUT,
      "the playlist comparison",
    );

    const t = overlap(mine.tracks, theirs.tracks);
    const a = overlap(mine.artists, theirs.artists);
    const relatedTrackImages = new Map();
    for (const track of t.shared) {
      const images = [
        ...(track.imageUrls || []),
        track.imageUrl,
      ].filter(Boolean);
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
      artist.imageUrl = artist.imageUrl || artistImageCache.get(artist.key) || null;
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

  function renderResult(box, r) {
    box.textContent = "";
    const card = h("section", "vibe-check-result");
    const hero = h("div", "vibe-check-hero");
    hero.appendChild(h("div", "vibe-check-kicker", "The overlap"));

    const scoreRow = h("div", "vibe-check-score-row");
    const score = h("div", "vibe-check-score", r.score + "%");
    const scoreText = h("div", "vibe-check-score-copy", "overlap across public playlists");
    scoreRow.append(score, scoreText);
    hero.appendChild(scoreRow);

    const summary = h(
      "div",
      "vibe-check-summary",
      r.sharedTracks.length +
        " tracks and " +
        r.sharedArtists.length +
        " artists in common",
    );
    hero.appendChild(summary);
    card.appendChild(hero);

    const scoreNote = h(
      "div",
      "vibe-check-score-note",
      "A rough count from public playlists only — not a rating of either person’s taste.",
    );
    card.appendChild(scoreNote);

    const lists = h("div", "vibe-check-lists");
    const addImageCards = (title, items, unavailableMessage) => {
      const section = h("section");
      const heading = h("div", "vibe-check-list-heading");
      heading.append(h("span", null, title));
      const countText = items === null
        ? ""
        : items.length > 5
          ? "Showing 5 of " + items.length
          : items.length + (items.length === 1 ? " match" : " matches");
      heading.appendChild(h("span", "vibe-check-count", countText));
      section.appendChild(heading);

      if (items === null) {
        section.appendChild(h("div", "vibe-check-empty", unavailableMessage));
      } else if (!items.length) {
        section.appendChild(h("div", "vibe-check-empty", "Nothing shared here this time."));
      } else {
        const grid = h("div", "vibe-check-card-grid");
        for (const item of items.slice(0, 5)) {
          const card = h("div", "vibe-check-media-card");
          const imageUrls = Array.from(
            new Set([
              ...(item.relatedTrackImageUrls || []),
              ...(item.imageUrls || []),
              item.imageUrl,
              ...(item.fallbackImageUrls || []),
              item.fallbackImageUrl,
            ].filter(Boolean)),
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
    card.appendChild(lists);
    box.appendChild(card);
  }

  async function openVibeCheck(friendId) {
    addStyles();
    const root = h("div");
    root.className = "vibe-check-root";
    const intro = h("div", "vibe-check-intro");
    const introTitle = h("div", "vibe-check-intro-title", "Same Frequency");
    const introCopy = h(
      "div",
      "vibe-check-intro-copy",
      "A little look at the artists and tracks you both keep around. Public playlists only.",
    );
    intro.append(introTitle, introCopy);
    const status = h("div", "vibe-check-status is-loading");
    const loader = h("span", "vibe-check-loader");
    const statusMessage = h("span", null, "Checking public playlists...");
    status.append(loader, statusMessage);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-busy", "true");
    const result = h("div", "");
    root.append(intro, status, result);
    Spicetify.PopupModal.display({
      title: "Same Frequency",
      content: root,
      isLarge: true,
    });

    try {
      const r = await compare(friendId, (m) => {
        statusMessage.textContent = m;
      });
      status.remove();
      renderResult(result, r);
    } catch (e) {
      status.classList.remove("is-loading");
      status.classList.add("is-error");
      status.setAttribute("aria-busy", "false");
      statusMessage.textContent =
        (e && e.message) || "Couldn’t load the playlists. Try again in a bit.";
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
      ? "position:fixed;right:24px;bottom:112px;z-index:1000;padding:10px 17px;box-shadow:0 8px 24px rgba(0,0,0,.35);"
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