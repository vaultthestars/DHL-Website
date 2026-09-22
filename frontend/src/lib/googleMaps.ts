const MAPS_SCRIPT_ID = "dhl-google-maps-js";

declare global {
  interface Window {
    google?: typeof google;
    __dhlGoogleMapsPromise?: Promise<typeof google>;
  }
}

export function getGoogleMapsApiKey(): string {
  return process.env.REACT_APP_GOOGLE_MAPS_API_KEY?.trim() || "";
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps requires a browser."));
  }

  const ensurePlaces = async (g: typeof google): Promise<typeof google> => {
    if (g.maps.places) {
      return g;
    }
    if (g.maps.importLibrary) {
      await g.maps.importLibrary("places");
    }
    if (!g.maps.places) {
      throw new Error(
        "Google Places library unavailable. Enable Places API and hard-refresh the page."
      );
    }
    return g;
  };

  if (window.google?.maps) {
    return ensurePlaces(window.google);
  }
  if (window.__dhlGoogleMapsPromise) {
    return window.__dhlGoogleMapsPromise.then(ensurePlaces);
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(
      new Error("Missing REACT_APP_GOOGLE_MAPS_API_KEY in frontend/.env.local")
    );
  }

  window.__dhlGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.maps) {
          resolve(window.google);
        } else {
          reject(new Error("Google Maps failed to load."));
        }
      });
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load.")));
      return;
    }

    const script = document.createElement("script");
    script.id = MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&v=weekly&libraries=places`;
    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        reject(new Error("Google Maps failed to load."));
      }
    };
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });

  return window.__dhlGoogleMapsPromise.then(ensurePlaces);
}

/** Static Maps max free size is 640px on the longest side. */
export const STATIC_MAP_SIZE = { width: 512, height: 640 } as const;

export function buildStaticMapUrl(options: {
  lat: number;
  lng: number;
  zoom: number;
  mapType?: string;
}): string {
  const apiKey = getGoogleMapsApiKey();
  const params = new URLSearchParams({
    center: `${options.lat},${options.lng}`,
    zoom: String(Math.round(options.zoom)),
    size: `${STATIC_MAP_SIZE.width}x${STATIC_MAP_SIZE.height}`,
    scale: "2",
    maptype: options.mapType || "roadmap",
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export async function fetchStaticMapBytes(options: {
  lat: number;
  lng: number;
  zoom: number;
  mapType?: string;
}): Promise<Uint8Array> {
  const response = await fetch(buildStaticMapUrl(options));
  if (!response.ok) {
    throw new Error(`Static map request failed (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
