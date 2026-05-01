// One-click Spotify playlist reorderer.
// Usage:
//   1. In the analyzer, arrange the playlist and click "Copy order"
//      (this puts a JSON array of track IDs in your clipboard).
//   2. In the Spotify web player, open the playlist you want to reorder.
//   3. Run this script as a DevTools Snippet (Sources → Snippets → New).
//
// The script:
//   - Reads the target order from your clipboard.
//   - Infers the playlist ID from the current URL.
//   - Captures Spotify's live auth headers by monkey-patching window.fetch
//     (no need to paste tokens).
//   - Reorders the playlist via Spotify's internal GraphQL endpoint.

(async function () {
  // 1. Playlist ID from URL
  var PID = (location.pathname.match(/\/playlist\/([^/?]+)/) || [])[1];
  if (!PID) {
    console.error("Open a Spotify playlist page first (open.spotify.com/playlist/...).");
    return;
  }
  var PLAYLIST_URI = "spotify:playlist:" + PID;

  // 2. Target from clipboard
  var TARGET;
  try {
    var clip = await navigator.clipboard.readText();
    TARGET = JSON.parse(clip);
    if (!Array.isArray(TARGET) || !TARGET.every(function (x) { return typeof x === "string"; })) {
      throw new Error("not a JSON array of strings");
    }
  } catch (err) {
    console.error(
      "Clipboard did not contain a JSON array of track IDs. Click 'Copy order' in the analyzer, then re-run. (" +
        err.message +
        ")"
    );
    return;
  }
  console.log("Target: " + TARGET.length + " tracks");

  // 3. Capture auth headers by patching fetch
  function captureCreds(timeoutMs) {
    return new Promise(function (resolve, reject) {
      var original = window.fetch;
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        window.fetch = original;
        reject(new Error("Timed out capturing auth. Try scrolling the playlist or refreshing, then re-run."));
      }, timeoutMs);

      window.fetch = function (input, init) {
        try {
          var url = typeof input === "string" ? input : input && input.url ? input.url : "";
          if (url.indexOf("api-partner.spotify.com") !== -1 || url.indexOf("spclient.") !== -1) {
            var hdrs = (init && init.headers) || (input && input.headers) || null;
            var auth = null;
            var ct = null;
            if (hdrs) {
              if (typeof Headers !== "undefined" && hdrs instanceof Headers) {
                auth = hdrs.get("authorization");
                ct = hdrs.get("client-token");
              } else if (Array.isArray(hdrs)) {
                for (var i = 0; i < hdrs.length; i++) {
                  var k = (hdrs[i][0] || "").toLowerCase();
                  if (k === "authorization") auth = hdrs[i][1];
                  else if (k === "client-token") ct = hdrs[i][1];
                }
              } else {
                for (var key in hdrs) {
                  var lk = key.toLowerCase();
                  if (lk === "authorization") auth = hdrs[key];
                  else if (lk === "client-token") ct = hdrs[key];
                }
              }
            }
            if (auth && ct && !done) {
              done = true;
              window.fetch = original;
              clearTimeout(timer);
              resolve({ bearer: auth.replace(/^Bearer\s+/i, ""), clientToken: ct });
            }
          }
        } catch (_) {
          // never break the patched fetch
        }
        return original.apply(this, arguments);
      };
    });
  }

  console.log("Capturing auth headers (up to 15s)...");
  var creds;
  try {
    creds = await captureCreds(15000);
  } catch (err) {
    console.error(err.message);
    return;
  }
  console.log("Got auth.");

  // 4. GraphQL helpers
  var GRAPHQL_URL = "https://api-partner.spotify.com/pathfinder/v2/query";
  var FETCH_CONTENTS_HASH = "a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4";
  var MOVE_ITEMS_HASH = "47b2a1234b17748d332dd0431534f22450e9ecbb3d5ddcdacbd83368636a0990";

  var headers = {
    accept: "application/json",
    "accept-language": "en",
    "app-platform": "WebPlayer",
    authorization: "Bearer " + creds.bearer,
    "client-token": creds.clientToken,
    "content-type": "application/json;charset=UTF-8",
  };

  async function gqlCall(body) {
    var res = await fetch(GRAPHQL_URL, {
      method: "POST",
      credentials: "include",
      headers: headers,
      body: JSON.stringify(body),
    });
    var text = await res.text();
    if (!res.ok) {
      console.error("GraphQL " + res.status + ":", text);
      throw new Error("GraphQL call failed");
    }
    return JSON.parse(text);
  }

  // 5. Fetch current items (uid + trackId) paginated
  var current = [];
  var offset = 0;
  var limit = 100;
  while (true) {
    var page = await gqlCall({
      variables: { uri: PLAYLIST_URI, offset: offset, limit: limit, includeEpisodeContentRatingsV2: false },
      operationName: "fetchPlaylistContents",
      extensions: { persistedQuery: { version: 1, sha256Hash: FETCH_CONTENTS_HASH } },
    });
    var content = page && page.data && page.data.playlistV2 && page.data.playlistV2.content;
    if (!content || !Array.isArray(content.items)) {
      console.error("Unexpected GraphQL response shape:", page);
      return;
    }
    for (var i = 0; i < content.items.length; i++) {
      var it = content.items[i];
      var uri = it && it.itemV2 && it.itemV2.data && it.itemV2.data.uri;
      var uid = it && it.uid;
      if (!uri || !uid) continue;
      current.push({ uid: uid, trackId: uri.split(":").pop() });
    }
    var total = content.totalCount || 0;
    offset += content.items.length;
    if (content.items.length === 0 || offset >= total) break;
  }
  console.log("Playlist has " + current.length + " tracks.");

  if (TARGET.length !== current.length) {
    console.error("Length mismatch — target has " + TARGET.length + ", playlist has " + current.length + ".");
    return;
  }
  var trackSet = new Set(current.map(function (x) { return x.trackId; }));
  for (var t = 0; t < TARGET.length; t++) {
    if (!trackSet.has(TARGET[t])) {
      console.error("Target track not in playlist: " + TARGET[t]);
      return;
    }
  }

  // 6. Greedy move loop
  var moves = 0;
  for (var pos = 0; pos < TARGET.length; pos++) {
    if (current[pos].trackId === TARGET[pos]) continue;
    var srcIdx = -1;
    for (var s = pos + 1; s < current.length; s++) {
      if (current[s].trackId === TARGET[pos]) { srcIdx = s; break; }
    }
    if (srcIdx < 0) {
      console.error("Could not find source for position " + pos + " (track " + TARGET[pos] + ")");
      return;
    }
    var variables = {
      playlistUri: PLAYLIST_URI,
      uids: [current[srcIdx].uid],
      newPosition: { moveType: "BEFORE_UID", fromUid: current[pos].uid },
    };
    try {
      await gqlCall({
        variables: variables,
        operationName: "moveItemsInPlaylist",
        extensions: { persistedQuery: { version: 1, sha256Hash: MOVE_ITEMS_HASH } },
      });
    } catch (_) {
      console.error("Move " + (moves + 1) + " failed. Variables:", variables);
      return;
    }
    var moved = current.splice(srcIdx, 1)[0];
    current.splice(pos, 0, moved);
    moves++;
    if (moves % 10 === 0) console.log("  " + moves + "/" + TARGET.length + " moves...");
  }
  console.log("Done! " + moves + " moves applied. Refresh to see new order.");
})();
