package server.handlers;

import com.squareup.moshi.Moshi;
import java.io.IOException;
import org.apache.hc.core5.http.ParseException;
import se.michaelthelin.spotify.SpotifyApi;
import se.michaelthelin.spotify.exceptions.SpotifyWebApiException;
import se.michaelthelin.spotify.model_objects.credentials.AuthorizationCodeCredentials;
import se.michaelthelin.spotify.model_objects.specification.AudioFeatures;
import se.michaelthelin.spotify.requests.authorization.authorization_code.AuthorizationCodeRefreshRequest;
import se.michaelthelin.spotify.requests.data.tracks.GetAudioFeaturesForTrackRequest;
import spark.Request;
import spark.Response;
import spark.Route;
import user.UserDatabase;

public class LoadSongFeaturesHandler implements Route {

  private UserDatabase userDatabase;

  public LoadSongFeaturesHandler(UserDatabase userDatabase) {
    this.userDatabase = userDatabase;
  }

  @Override
  public Object handle(Request request, Response response) throws Exception {
    // TODO: for each user in the database, get their access token from firebase to get the features
    // of their current song
    // write helper that takes refresh token and returns auth token
    // write helper that takes access token and returns song object with title, artist, id &
    // features of current song
    // update song field of user object to contain new song object



    String id = "4ewazQLXFTDC8XvCbhvtXs"; // Glimpse of us by Joji (mock song ID)

    // mock user refresh token
    String refreshToken = "AQB8M71Nlja3q8-pCbmyCqzcIk2h23xSdK2GVF9VRVm04Mq6QfSBDZ9tDLf26MmUaN0NK-g7HuB2SMpC-ED1HQ-g36-ci3Xj16NA5t-kw2VYFJZ9wzGX2eFRk8g1_igwCws";
    String accessToken = this.getAuthToken(refreshToken);
    System.out.print(accessToken);

    SpotifyApi spotifyApi = new SpotifyApi.Builder().setAccessToken(accessToken).build();
    GetAudioFeaturesForTrackRequest getAudioFeaturesForTrackRequest =
        spotifyApi.getAudioFeaturesForTrack(id).build();

    AudioFeatures audioFeatures = getAudioFeaturesForTrackRequest.execute();

    float[] songFeatures = new float[6];
    songFeatures[0] = audioFeatures.getAcousticness();
    songFeatures[1] = audioFeatures.getDanceability();
    songFeatures[2] = audioFeatures.getEnergy();
    songFeatures[3] = audioFeatures.getInstrumentalness();
    songFeatures[4] = audioFeatures.getSpeechiness();
    songFeatures[5] = audioFeatures.getValence();

    return new LoadSongFeaturesSuccessResponse(id, songFeatures).serialize();
  }

  public record LoadSongFeaturesSuccessResponse(String result, String id, float[] features) {

    public LoadSongFeaturesSuccessResponse(String id, float[] features) {
      this("success", id, features);
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
   * Helper method that takes in a user's refresh token and makes a call to the Spotify API
   * to return a valid access token
   * @param refreshToken - refresh token (obtained when a user logins in with their Spotify account)
   * @return access token
   */
  private String getAuthToken(String refreshToken) {
    try {
        String clientId = "d760ead8737f4c978ca2db46cfd2610a"; // need to update this to be TuneIn App
        String clientSecret = "9ca4a794c8624a01883513a2c46c751d"; // need to update this to be TuneIn App
        SpotifyApi spotifyApi = new SpotifyApi.Builder()
            .setClientId(clientId)
            .setClientSecret(clientSecret)
            .setRefreshToken(refreshToken)
            .build();
        AuthorizationCodeRefreshRequest authorizationCodeRefreshRequest = spotifyApi.authorizationCodeRefresh()
            .build();
        AuthorizationCodeCredentials authorizationCodeCredentials = authorizationCodeRefreshRequest.execute();
        return authorizationCodeCredentials.getAccessToken();
    } catch (IOException | SpotifyWebApiException | ParseException e) {
      System.out.println("Error: " + e.getMessage());
      throw new RuntimeException(e);

    }

  }
}



