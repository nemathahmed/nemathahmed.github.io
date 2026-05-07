const TOKEN_URL = "https://accounts.spotify.com/api/token";
const CURRENTLY_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode";

const json = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
};

const getAccessToken = async () => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return { configured: false };
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify token refresh failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  return { configured: true, accessToken: payload.access_token };
};

const getArtistText = (item, type) => {
  if (type === "episode") {
    return item?.show?.publisher || item?.show?.name || "Podcast";
  }

  if (Array.isArray(item?.artists) && item.artists.length > 0) {
    return item.artists.map((artist) => artist.name).filter(Boolean).join(", ");
  }

  return "Unknown artist";
};

const getImageUrl = (item, type) => {
  if (type === "episode") {
    return item?.images?.[0]?.url || item?.show?.images?.[0]?.url || null;
  }

  return item?.album?.images?.[0]?.url || null;
};

module.exports = async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    json(response, 405, { error: "Method not allowed" });
    return;
  }

  response.setHeader("Cache-Control", "public, max-age=0, s-maxage=25, stale-while-revalidate=60");

  try {
    const token = await getAccessToken();
    if (!token.configured) {
      json(response, 200, { isConfigured: false, isPlaying: false });
      return;
    }

    const spotifyResponse = await fetch(CURRENTLY_PLAYING_URL, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
    });

    if (spotifyResponse.status === 204) {
      json(response, 200, { isConfigured: true, isPlaying: false });
      return;
    }

    if (!spotifyResponse.ok) {
      const body = await spotifyResponse.text();
      throw new Error(`Spotify currently playing failed (${spotifyResponse.status}): ${body}`);
    }

    const payload = await spotifyResponse.json();
    const item = payload.item;
    const type = payload.currently_playing_type;

    if (!item || (type !== "track" && type !== "episode")) {
      json(response, 200, { isConfigured: true, isPlaying: false });
      return;
    }

    json(response, 200, {
      isConfigured: true,
      isPlaying: Boolean(payload.is_playing),
      type,
      title: item.name,
      artist: getArtistText(item, type),
      albumImage: getImageUrl(item, type),
      spotifyUrl: item.external_urls?.spotify || null,
      progressMs: payload.progress_ms || 0,
      durationMs: item.duration_ms || 0,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    json(response, 502, { error: "Spotify unavailable", isPlaying: false });
  }
};
