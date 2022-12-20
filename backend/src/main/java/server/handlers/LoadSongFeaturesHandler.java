package server.handlers;

import com.squareup.moshi.Moshi;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.ExecutionException;
import org.apache.hc.core5.http.ParseException;
import se.michaelthelin.spotify.exceptions.SpotifyWebApiException;
import database.UserDatabase;
import spark.Request;
import spark.Response;
import spark.Route;
import song.Song;
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

    List<String> userIds = this.database.getAllUserIds();

    for (String userId : userIds) {
      System.out.println("..........USER UPDATE BEGUN..........");
      System.out.println("userId: " + userId);
      User user = this.database.getUser(userId);
      System.out.println("Pre-update: " + user);
      System.out.println("displayName: " + user.getDisplayName());
      // get new song
      Song newSong = user.getMostRecentSong();
      System.out.println("Song Title: " + newSong.getTitle());
      System.out.println("Artists: " + newSong.getArtists());
      user.setCurrentSong(newSong);
      // add new song to averaged historical song point
      user.updateHistoricalSongPoint(newSong.getPoint());
      // update document in firebase to reflect new user info
      this.database.updateUser(userId, user);
      System.out.println("Post-update: " + user);
      System.out.println("..........USER UPDATE FINISHED..........");
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
