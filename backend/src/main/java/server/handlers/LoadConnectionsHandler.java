package server.handlers;

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
    return null;
    // TODO: call kd-tree methods from UserDatabase & store connections / historicalConnections in user objects
    // TODO: create success response
  }
}
