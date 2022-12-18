package server.handlers;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.squareup.moshi.Moshi;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import org.apache.hc.core5.http.ParseException;
import se.michaelthelin.spotify.SpotifyApi;
import se.michaelthelin.spotify.exceptions.SpotifyWebApiException;
import se.michaelthelin.spotify.exceptions.detailed.ForbiddenException;
import se.michaelthelin.spotify.model_objects.credentials.AuthorizationCodeCredentials;
import se.michaelthelin.spotify.model_objects.specification.ArtistSimplified;
import se.michaelthelin.spotify.model_objects.specification.AudioFeatures;
import se.michaelthelin.spotify.model_objects.specification.PagingCursorbased;
import se.michaelthelin.spotify.model_objects.specification.PlayHistory;
import se.michaelthelin.spotify.model_objects.specification.TrackSimplified;
import se.michaelthelin.spotify.requests.authorization.authorization_code.AuthorizationCodeRefreshRequest;
import se.michaelthelin.spotify.requests.data.player.GetCurrentUsersRecentlyPlayedTracksRequest;
import se.michaelthelin.spotify.requests.data.tracks.GetAudioFeaturesForTrackRequest;
import server.Constants;
import database.UserDatabase;
import spark.Request;
import spark.Response;
import spark.Route;
import user.Song;
import user.User;

public class LoadSongFeaturesHandler implements Route {

  private UserDatabase database;

  public LoadSongFeaturesHandler(UserDatabase database) {
    this.database = database;
  }

  @Override
  public Object handle(Request request, Response response)
      throws ExecutionException, InterruptedException, ParseException, SpotifyWebApiException,
          IOException {
    // TODO: for each user in the database, get their access token from firebase to get thea features
    // of their current song
    // write helper that takes refresh token and returns auth token
    // write helper that takes access token and returns song object with title, artist, id &
    // features of current song
    // update song field of user object to contain new song object

    List<String> userIds = this.database.getAllUserIds();

    for (String userId : userIds) {
      System.out.println("..........USER UPDATE BEGUN..........");
      System.out.println("userId: " + userId);
      User user = this.database.getUser(userId);
      System.out.println("Pre-update: " + user);
      System.out.println("displayName: " + user.getDisplayName());
      // if spotify has been linked:
      if (user.hasRefreshToken()) {
        System.out.println("Refresh token present: " + user.getRefreshToken());
        // get new song
        Song newSong = user.getMostRecentSong();
        user.setCurrentSong(newSong);
        // add new song to averaged historical song point
        user.updateHistoricalSongPoint(newSong.getPoint());
        // update document in firebase to reflect new user info
        this.database.updateUser(userId, user);
        System.out.println("Post-update: " + user);
        System.out.println("..........USER UPDATE FINISHED..........");
      }
    }
    return new LoadSongFeaturesSuccessResponse(userIds).serialize();
  }

  public record LoadSongFeaturesSuccessResponse(String result, List<String> updatedUsers) {

    public LoadSongFeaturesSuccessResponse(List<String> updatedUsers) {
      this("success", updatedUsers);
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
}
