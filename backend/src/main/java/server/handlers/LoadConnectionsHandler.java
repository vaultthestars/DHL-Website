package server.handlers;

import com.squareup.moshi.Moshi;
import server.ErrBadJsonResponse;
import spark.Request;
import spark.Response;
import spark.Route;
import user.UserDatabase;

public class LoadConnectionsHandler implements Route {

  private UserDatabase userDatabase;

  /**
   * Constructor for handler that takes in userDatabase to access nodes for kd-tree
   *
   * @param userDatabase - the database housing users to build tree
   */
  public LoadConnectionsHandler(UserDatabase userDatabase) {
    this.userDatabase = userDatabase;
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
      // call kd-tree methods from UserDatabase & store connections & historicalConnections in user
      // objects
      this.userDatabase.loadSongPoints();
      this.userDatabase.loadHistoricalSongPoints();
      this.userDatabase.buildSongTree();
      this.userDatabase.buildHistoricalSongTree();
      this.userDatabase.loadConnections();
      this.userDatabase.loadHistoricalConnections();
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
}
