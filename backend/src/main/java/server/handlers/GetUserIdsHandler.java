package server.handlers;

import com.squareup.moshi.JsonAdapter;
import com.squareup.moshi.Moshi;
import java.util.Map;
import server.Database;
import server.ErrBadJsonResponse;
import server.handlers.GetUserHandler.GetUserSuccessResponse;
import spark.Request;
import spark.Response;
import spark.Route;

  public class GetUserIdsHandler implements Route {

    Database database;

    public GetUserIdsHandler(Database database) {
      this.database = database;
    }

    @Override
    public Object handle(Request request, Response response) throws Exception {
      try {
        String userId = request.queryParams("id");


        Map<String, Object> docMap = this.database.retrieveUser(userId);


        return new GetUserIdsSuccessResponse(docMap).serialize();
      } catch (Exception e) {
        return new ErrBadJsonResponse();
      }
    }

    public record GetUserIdsSuccessResponse(String result, Map<String, Object> user) {

      public GetUserIdsSuccessResponse(Map<String, Object> user) {
        this("success", user);
      }

      public String serialize() {
        try {
          Moshi moshi = new Moshi.Builder().build();

          JsonAdapter<GetUserIdsSuccessResponse> adapter = moshi.adapter(
              GetUserIdsSuccessResponse.class);
          return adapter.toJson(this);
        } catch (Exception e) {
          e.printStackTrace();
          throw e;
        }
      }
    }
  }


