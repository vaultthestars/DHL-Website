package server.handlers;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.apache.hc.core5.http.ParseException;
import se.michaelthelin.spotify.SpotifyApi;
import se.michaelthelin.spotify.exceptions.SpotifyWebApiException;
import se.michaelthelin.spotify.model_objects.miscellaneous.CurrentlyPlaying;
import se.michaelthelin.spotify.requests.data.player.GetUsersCurrentlyPlayingTrackRequest;
import user.Song;

public class LoadSongFeaturesHelpers {

  public Song getCurrentSong(String accessToken) {
    SpotifyApi spotifyApi = new SpotifyApi.Builder()
        .setAccessToken(accessToken)
        .build();
    GetUsersCurrentlyPlayingTrackRequest getUsersCurrentlyPlayingTrackRequest = spotifyApi
        .getUsersCurrentlyPlayingTrack()
        .build();
    try {
      CurrentlyPlaying currentlyPlaying = getUsersCurrentlyPlayingTrackRequest.execute();
      String title = currentlyPlaying.getItem().getName();
      String id = currentlyPlaying.getItem().getId();
      List<String> artists = new ArrayList<>();
      // Artist[] artistList = currentlyPlaying.getItem().get
    } catch (IOException e) {
      throw new RuntimeException(e);
    } catch (SpotifyWebApiException e) {
      throw new RuntimeException(e);
    } catch (ParseException e) {
      throw new RuntimeException(e);
    }
  }

}
