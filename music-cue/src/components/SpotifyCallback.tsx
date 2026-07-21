import { useEffect, useState } from "react";
import { completeSpotifyAuth } from "../lib/spotifyPkce";

export const SpotifyCallback = () => {
  const [message, setMessage] = useState("Connecting to Spotify…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
      setMessage(`Spotify login failed: ${error}`);
      return;
    }

    if (!code || !state) {
      setMessage("Spotify login response was incomplete.");
      return;
    }

    void completeSpotifyAuth(code, state)
      .then(() => {
        const returnUrl = new URL(window.location.origin);
        returnUrl.searchParams.set("open", "music");
        returnUrl.searchParams.set("spotify", "connected");
        window.location.replace(returnUrl.toString());
      })
      .catch((authError) => {
        setMessage(authError instanceof Error ? authError.message : "Spotify login failed.");
      });
  }, []);

  return (
    <div className="music-cue-spotify-callback">
      <p>{message}</p>
    </div>
  );
};
