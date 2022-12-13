package server.handlers;

import com.squareup.moshi.JsonAdapter;
import com.squareup.moshi.Moshi;
import server.Database;
import server.ErrBadJsonResponse;
import spark.Request;
import spark.Response;
import spark.Route;
import user.User;


public class GetUserHandler implements Route {

  Database database;

  public GetUserHandler(Database database) {
    this.database = database;
  }

  @Override
  public Object handle(Request request, Response response) throws Exception {
    try {
      String userId = request.queryParams("id");
      User user = this.database.retrieveUser(userId);

      return new GetUserSuccessResponse(user).serialize();
    } catch (Exception e) {
      return new ErrBadJsonResponse();
    }
  }

  public record GetUserSuccessResponse(String result, User user) {

    public GetUserSuccessResponse(User user) {
      this("success", user);
    }

    public String serialize() {
      try {
        Moshi moshi = new Moshi.Builder().build();

        JsonAdapter<GetUserSuccessResponse> adapter = moshi.adapter(GetUserSuccessResponse.class);
        return adapter.toJson(this);
      } catch (Exception e) {
        e.printStackTrace();
        throw e;
      }
    }
  }
}
