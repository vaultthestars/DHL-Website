import { MusicProvider, MusicServiceId } from "../musicProvider";
import { appleMusicProvider } from "./appleMusicProvider";
import { spotifyProvider } from "./spotifyProvider";

const providers: Record<MusicServiceId, MusicProvider> = {
  "apple-music": appleMusicProvider,
  spotify: spotifyProvider,
};

export const getMusicProvider = (serviceId: MusicServiceId): MusicProvider => providers[serviceId];

export const musicProviders: MusicProvider[] = [appleMusicProvider, spotifyProvider];
