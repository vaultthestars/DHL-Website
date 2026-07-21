import { Router, type Request, type Response } from "express";
import { handleSpotifyRoute } from "./spotifyHandlers.js";

export const spotifyRouter = Router();

const forward = (route: string) => (req: Request, res: Response) => {
  void handleSpotifyRoute(route, req, res);
};

spotifyRouter.get("/status", forward("status"));
spotifyRouter.post("/auth-url", forward("auth-url"));
spotifyRouter.post("/auth-callback", forward("auth-callback"));
spotifyRouter.post("/disconnect", forward("disconnect"));
spotifyRouter.get("/library", forward("library"));
spotifyRouter.post("/publish-shared-library", forward("publish-shared-library"));
spotifyRouter.post("/validate-tracks", forward("validate-tracks"));
spotifyRouter.post("/play-cue", forward("play-cue"));
spotifyRouter.post("/save-playlist", forward("save-playlist"));
spotifyRouter.get("/playback-state", forward("playback-state"));
