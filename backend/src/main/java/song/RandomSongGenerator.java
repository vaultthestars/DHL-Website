package song;

import com.neovisionaries.i18n.CountryCode;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.apache.hc.core5.http.ParseException;
import se.michaelthelin.spotify.SpotifyApi;
import se.michaelthelin.spotify.exceptions.SpotifyWebApiException;
import se.michaelthelin.spotify.model_objects.credentials.AuthorizationCodeCredentials;
import se.michaelthelin.spotify.model_objects.specification.ArtistSimplified;
import se.michaelthelin.spotify.model_objects.specification.AudioFeatures;
import se.michaelthelin.spotify.model_objects.specification.Paging;
import se.michaelthelin.spotify.model_objects.specification.Track;
import se.michaelthelin.spotify.requests.authorization.authorization_code.AuthorizationCodeRefreshRequest;
import se.michaelthelin.spotify.requests.data.search.simplified.SearchTracksRequest;
import se.michaelthelin.spotify.requests.data.tracks.GetAudioFeaturesForTrackRequest;
import server.Constants;
import user.Song;

public class RandomSongGenerator {

  public RandomSongGenerator() {
  }

  /**
   * Generates random search query for spotify search parameter
   *
   * @return - a String representing the query
   */
  private String getRandomSearch() {
    // characters to randomly choose from
    String characters = "abcdefghijklmnopqrstuvwxyz";

    Random random = new Random();
    String randomChar = String.valueOf(characters.charAt(random.nextInt(26)));

    return switch (random.nextInt(1)) {
      case 0 -> randomChar + "%";
      case 1 -> "%" + randomChar + "%";
      default -> "";
    };
  }

  private String generateAuthToken() {
    SpotifyApi spotifyApi =
        new SpotifyApi.Builder()
            .setClientId(Constants.CLIENT_ID)
            .setClientSecret(Constants.CLIENT_SECRET)
            .setRefreshToken(Constants.TEAM_REFRESH_TOKEN)
            .build();
    AuthorizationCodeRefreshRequest authorizationCodeRefreshRequest =
        spotifyApi.authorizationCodeRefresh().build();
    AuthorizationCodeCredentials authorizationCodeCredentials =
        null;
    try {
      authorizationCodeCredentials = authorizationCodeRefreshRequest.execute();
    } catch (IOException | SpotifyWebApiException | ParseException e) {
      e.printStackTrace();
      throw new RuntimeException(e);
    }
    return authorizationCodeCredentials.getAccessToken();
  }

  public Song getRandomSong() {
    String search = this.getRandomSearch();

    Random random = new Random();
    int offset = random.nextInt(1000);
    System.out.println("offset: " + offset);

    SpotifyApi spotifyApi =
        new SpotifyApi.Builder()
            .setClientId(Constants.CLIENT_ID)
            .setClientSecret(Constants.CLIENT_SECRET)
            .setAccessToken(this.generateAuthToken())
            .build();
    SearchTracksRequest searchTracksRequest = spotifyApi.searchTracks(search)
        .limit(1)
        .offset(offset)
        .build();
    try {
      Paging<Track> trackPaging = searchTracksRequest.execute();
      Track track = trackPaging.getItems()[0];
      String title = track.getName();
      System.out.println("title: " + title);
      String id = track.getId();
      // artists
      List<String> artists = new ArrayList<>();
      ArtistSimplified[] artistsSimp = track.getArtists();
      for (ArtistSimplified artist : artistsSimp) {
        artists.add(artist.getName());
      }
      System.out.println("artists: " + artists);
      // features
      GetAudioFeaturesForTrackRequest getAudioFeaturesForTrackRequest =
          spotifyApi.getAudioFeaturesForTrack(id).build();
      AudioFeatures audioFeatures = getAudioFeaturesForTrackRequest.execute();

      double[] features = new double[6];
      features[0] = audioFeatures.getAcousticness();
      features[1] = audioFeatures.getDanceability();
      features[2] = audioFeatures.getEnergy();
      features[3] = audioFeatures.getInstrumentalness();
      features[4] = audioFeatures.getSpeechiness();
      features[5] = audioFeatures.getValence();

      return new Song("<userId>", title, id, artists, features);
    } catch (IOException | SpotifyWebApiException | ParseException e) {
      e.printStackTrace();
      throw new RuntimeException(e);
    }
  }


}
