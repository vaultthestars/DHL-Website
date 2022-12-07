package server.handlers;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.apache.hc.core5.http.ParseException;
import se.michaelthelin.spotify.SpotifyApi;
import se.michaelthelin.spotify.exceptions.SpotifyWebApiException;
import se.michaelthelin.spotify.model_objects.miscellaneous.CurrentlyPlaying;
import se.michaelthelin.spotify.model_objects.specification.ArtistSimplified;
import se.michaelthelin.spotify.model_objects.specification.AudioFeatures;
import se.michaelthelin.spotify.model_objects.specification.Track;
import se.michaelthelin.spotify.requests.data.player.GetUsersCurrentlyPlayingTrackRequest;
import se.michaelthelin.spotify.requests.data.tracks.GetAudioFeaturesForTrackRequest;
import se.michaelthelin.spotify.requests.data.tracks.GetTrackRequest;
import user.Song;

public class LoadSongFeaturesHelpers {

  public Song getCurrentSong(String username, String accessToken) {
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
      GetTrackRequest getTrackRequest = spotifyApi.getTrack(id)
          .build();
      Track track = getTrackRequest.execute();
      ArtistSimplified[] artistsSimp = track.getArtists();
      for (ArtistSimplified artist : artistsSimp) {
        artists.add(artist.getName());
      }

      GetAudioFeaturesForTrackRequest getAudioFeaturesForTrackRequest =
          spotifyApi.getAudioFeaturesForTrack(id).build();
      AudioFeatures audioFeatures = getAudioFeaturesForTrackRequest.execute();

      float[] features = new float[6];
      features[0] = audioFeatures.getAcousticness();
      features[1] = audioFeatures.getDanceability();
      features[2] = audioFeatures.getEnergy();
      features[3] = audioFeatures.getInstrumentalness();
      features[4] = audioFeatures.getSpeechiness();
      features[5] = audioFeatures.getValence();

      return new Song(title, id, artists, features, username);
    } catch (IOException e) {
      throw new RuntimeException(e);
    } catch (SpotifyWebApiException e) {
      throw new RuntimeException(e);
    } catch (ParseException e) {
      throw new RuntimeException(e);
    }
  }

}
