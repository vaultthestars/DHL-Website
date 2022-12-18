package server.handlers;

import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.squareup.moshi.Moshi;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import kdtree.KdTree;
import database.UserDatabase;
import server.ErrBadJsonResponse;
import spark.Request;
import spark.Response;
import spark.Route;
import song.Song;
import user.User;

public class LoadConnectionsHandler implements Route {

  private UserDatabase database;

  /**
   * Constructor for handler that takes in userDatabase to access nodes for kd-tree
   *
   * @param database - the database housing users to build tree
   */
  public LoadConnectionsHandler(UserDatabase database) {
    this.database = database;
  }

  /**
   * Method that handles the GET request and outputs a serialized response.
   *
   * @param request - the request to handle
   * @param response - the response to modify
   * @return A serialized success response or error response
   * @throws Exception
   */
  @Override
  public Object handle(Request request, Response response) throws Exception {
    try {
      // build kd trees for finding nearest neighbors
      System.out.println("Constructing user and song trees...");
      List<User> userNodes = new ArrayList<>();
      List<Song> songNodes = new ArrayList<>();
      List<String> userIds = this.database.getAllUserIds();
      for (String userId : userIds) {
        User user = this.database.getUser(userId);
        userNodes.add(user);
        songNodes.add(user.getCurrentSong());
      }
      System.out.println("User count: " + userNodes.size());
      System.out.println("Song count: " + songNodes.size());
      KdTree<User> userTree = new KdTree<User>(userNodes, 1);
      System.out.println("User Tree built.");
      KdTree<Song> songTree = new KdTree<Song>(songNodes, 1);
      System.out.println("Song Tree built.");
      for (User user : userNodes) {
        // create new user object so user in tree does not get modified
        System.out.println("..........BEGINNING CONNECTIONS..........");
        User newUser = this.database.getUser(user.getUserId());
        System.out.println("userId: " + user.getDisplayName());
        System.out.println("displayName: " + user.getDisplayName());
        String[] connections = user.findConnections(songTree);
        System.out.println("Today's Connections: " + Arrays.asList(connections));
        user.setConnections(connections);
        String[] historicalConnections = user.findHistoricalConnections(userTree);
        System.out.println("All Time Connections: " + Arrays.asList(historicalConnections));
        user.setHistoricalConnections(historicalConnections);
        // update database using new user info
        this.database.updateUser(user.getUserId(), user);
        System.out.println("..........CONNECTIONS UPDATED..........");
      }
      return new LoadConnectionsSuccessResponse().serialize();
    } catch (Exception e) {
      e.printStackTrace();
      return new ErrBadJsonResponse();
    }
  }

  public record LoadConnectionsSuccessResponse(String result) {

    public LoadConnectionsSuccessResponse() {
      this("success");
    }

    /**
     * Serializes this response object ot a Json String
     *
     * @return this response, serialized as Json
     */
    String serialize() {
      try {
        Moshi moshi = new Moshi.Builder().build();
        return moshi.adapter(LoadConnectionsSuccessResponse.class).toJson(this);
      } catch (Exception e) {
        e.printStackTrace();
        throw e;
      }
    }
  }

  private User generateUser(QueryDocumentSnapshot document) {
    String userId = document.getString("userId");
    String displayName = document.getString("displayName");
    String refreshToken = document.getString("refreshToken");
    int membershipLength = document.get("membershipLength", Integer.class);

    Map<String, Object> docMap = document.getData();

    Map<String, Object> songMap = (Map) docMap.get("currentSong");
    List<Double> featList = (List<Double>) songMap.get("features");
    Song currentSong =
        new Song(
            (String) songMap.get("userId"),
            (String) songMap.get("title"),
            (String) songMap.get("id"),
            (List<String>) songMap.get("artists"),
            this.listToDoubleArray(featList));

    List<String> connections = (List<String>) docMap.get("connections");
    List<Double> historicalSongPoint = (List<Double>) docMap.get("historicalSongPoint");
    List<String> historicalConnections = (List<String>) docMap.get("historicalConnections");

    return new User(
        userId,
        displayName,
        refreshToken,
        membershipLength,
        currentSong,
        this.listToStrArray(connections),
        this.listToDoubleArray(historicalSongPoint),
        this.listToStrArray(historicalConnections));
  }

  private double[] listToDoubleArray(List<Double> lst) {
    if (lst != null) {
      double[] array = new double[6];
      for (int i = 0; i < lst.size(); i++) {
        array[i] = lst.get(i);
      }
      return array;
    } else {
      return new double[6];
    }
  }

  private String[] listToStrArray(List<String> lst) {
    if (lst != null) {
      String[] array = new String[5];
      for (int i = 0; i < lst.size(); i++) {
        array[i] = lst.get(i);
      }
      return array;
    } else {
      return new String[5];
    }
  }
}
