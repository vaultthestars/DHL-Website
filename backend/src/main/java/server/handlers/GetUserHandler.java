package server.handlers;

import com.squareup.moshi.JsonAdapter;
import com.squareup.moshi.Moshi;
import java.util.Map;
import server.Database;
import server.ErrBadJsonResponse;
import spark.Request;
import spark.Response;
import spark.Route;

public class GetUserHandler implements Route {

  Database database;

  public GetUserHandler(Database database) {
    this.database = database;
  }

  @Override
  public Object handle(Request request, Response response) throws Exception {
    try {
      String userId = request.queryParams("id");
      Map<String, Object> docMap = this.database.retrieveUser(userId);
      return new GetUserSuccessResponse(docMap).serialize();
    } catch (Exception e) {
      return new ErrBadJsonResponse();
    }
  }

  public record GetUserSuccessResponse(String result, Map<String, Object> user) {

    public GetUserSuccessResponse(Map<String, Object> user) {
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
