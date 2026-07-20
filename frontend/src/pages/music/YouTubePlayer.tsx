import React, { useEffect, useRef } from "react";

type YouTubePlayerProps = {
  videoIds: string[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
};

type YTPlayer = {
  loadVideoById: (videoId: string) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          height: string;
          width: string;
          videoId?: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onStateChange?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoadingPromise: Promise<void> | null = null;

const loadYouTubeApi = (): Promise<void> => {
  if (window.YT?.Player) {
    return Promise.resolve();
  }
  if (apiLoadingPromise) {
    return apiLoadingPromise;
  }

  apiLoadingPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    if (!document.getElementById("youtube-iframe-api")) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }
  });

  return apiLoadingPromise;
};

export const YouTubePlayer = ({ videoIds, activeIndex, onIndexChange }: YouTubePlayerProps) => {
  const playerRef = useRef<YTPlayer | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const onIndexChangeRef = useRef(onIndexChange);
  const videoIdsRef = useRef(videoIds);
  const activeVideoId = videoIds[activeIndex];

  activeIndexRef.current = activeIndex;
  onIndexChangeRef.current = onIndexChange;
  videoIdsRef.current = videoIds;

  useEffect(() => {
    let cancelled = false;

    const mountPlayer = async () => {
      await loadYouTubeApi();
      if (cancelled || !window.YT?.Player) {
        return;
      }

      playerRef.current = new window.YT.Player("music-cue-player", {
        height: "100%",
        width: "100%",
        videoId: activeVideoId,
        playerVars: {
          autoplay: 0,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onStateChange: (event) => {
            if (event.data !== window.YT?.PlayerState.ENDED) {
              return;
            }
            const index = activeIndexRef.current;
            const ids = videoIdsRef.current;
            if (index < ids.length - 1) {
              onIndexChangeRef.current(index + 1);
            }
          },
        },
      });
    };

    mountPlayer();

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!activeVideoId || !playerRef.current) {
      return;
    }
    playerRef.current.loadVideoById(activeVideoId);
  }, [activeVideoId]);

  return <div id="music-cue-player" className="music-cue-player" />;
};
