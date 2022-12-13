package server.handlers;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.squareup.moshi.Moshi;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.apache.hc.core5.http.ParseException;
import se.michaelthelin.spotify.SpotifyApi;
import se.michaelthelin.spotify.exceptions.SpotifyWebApiException;
import se.michaelthelin.spotify.model_objects.credentials.AuthorizationCodeCredentials;
import se.michaelthelin.spotify.model_objects.miscellaneous.CurrentlyPlaying;
import se.michaelthelin.spotify.model_objects.specification.ArtistSimplified;
import se.michaelthelin.spotify.model_objects.specification.AudioFeatures;
import se.michaelthelin.spotify.model_objects.specification.Track;
import se.michaelthelin.spotify.requests.authorization.authorization_code.AuthorizationCodeRefreshRequest;
import se.michaelthelin.spotify.requests.data.player.GetUsersCurrentlyPlayingTrackRequest;
import se.michaelthelin.spotify.requests.data.tracks.GetAudioFeaturesForTrackRequest;
import se.michaelthelin.spotify.requests.data.tracks.GetTrackRequest;
import server.Constants;
import server.Database;
import spark.Request;
import spark.Response;
import spark.Route;
import user.Song;
import user.User;


public class LoadSongFeaturesHandler implements Route {

  private Database database;

  public LoadSongFeaturesHandler(Database database) {
    this.database = database;
  }

  @Override
  public Object handle(Request request, Response response) throws Exception {
    // TODO: for each user in the database, get their access token from firebase to get the features
    // of their current song
    // write helper that takes refresh token and returns auth token
    // write helper that takes access token and returns song object with title, artist, id &
    // features of current song
    // update song field of user object to contain new song object

    ApiFuture<QuerySnapshot> future = this.database.getFireStore().collection("users").get();
    // future.get() blocks on response
    List<QueryDocumentSnapshot> documents = future.get().getDocuments();
    for (QueryDocumentSnapshot document : documents) {
      User user = document.toObject(User.class);
      String authToken = this.getAuthToken(user.getRefreshToken());
      Song song = this.getCurrentSong(user.getUserId(),authToken);
      this.database.updateUserSong(song);
    }

    return new LoadSongFeaturesSuccessResponse().serialize();
  }

  public record LoadSongFeaturesSuccessResponse(String result) {

    public LoadSongFeaturesSuccessResponse() {
      this("success");
    }

    String serialize() {
      try {
        Moshi moshi = new Moshi.Builder().build();
        return moshi.adapter(LoadSongFeaturesSuccessResponse.class).toJson(this);
      } catch (Exception e) {
        e.printStackTrace();
        throw e;
      }
    }
  }

  /**
   * Helper method that takes in a user's refresh token and makes a call to the Spotify API to
   * return a valid access token
   *
   * @param refreshToken - refresh token (obtained when a user logins in with their Spotify account)
   * @return access token
   */
  private String getAuthToken(String refreshToken) {
    try {

      SpotifyApi spotifyApi =
          new SpotifyApi.Builder()
              .setClientId(Constants.CLIENT_ID)
              .setClientSecret(Constants.CLIENT_SECRET)
              .setRefreshToken(refreshToken)
              .build();
      AuthorizationCodeRefreshRequest authorizationCodeRefreshRequest =
          spotifyApi.authorizationCodeRefresh().build();
      AuthorizationCodeCredentials authorizationCodeCredentials =
          authorizationCodeRefreshRequest.execute();
      return authorizationCodeCredentials.getAccessToken();
    } catch (IOException | SpotifyWebApiException | ParseException e) {
      System.out.println("Error: " + e.getMessage());
      throw new RuntimeException(e);
    }
  }

  /**
   * Helper that gets the current song of a user and returns a Song object with relevant info.
   *
   * @param userId - the userId of the user whose song to get
   * @param accessToken - the access token for the user
   * @return their current song as a Song object
   */
  public Song getCurrentSong(String userId, String accessToken) {
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
      GetTrackRequest getTrackRequest = spotifyApi.getTrack(id).build();
      Track track = getTrackRequest.execute();
      ArtistSimplified[] artistsSimp = track.getArtists();
      for (ArtistSimplified artist : artistsSimp) {
        artists.add(artist.getName());
      }

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

      return new Song(userId, title, id, artists, features);
    } catch (IOException | SpotifyWebApiException | ParseException e) {
      throw new RuntimeException(e);
    }
  }
  }

