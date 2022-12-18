package server.handlers;

import com.squareup.moshi.JsonAdapter;
import com.squareup.moshi.Moshi;
import java.util.List;
import database.UserDatabase;
import server.ErrBadJsonResponse;
import spark.Request;
import spark.Response;
import spark.Route;

  public class GetUserIdsHandler implements Route {

    UserDatabase database;

    public GetUserIdsHandler(UserDatabase database) {
      this.database = database;
    }

    @Override
    public Object handle(Request request, Response response) throws Exception {
      try {
        List<String> ids = this.database.getAllUserIds();
        return new GetUserIdsSuccessResponse(ids).serialize();
      } catch (Exception e) {
        return new ErrBadJsonResponse();
      }
    }

    public record GetUserIdsSuccessResponse(String result, List<String> ids) {

      public GetUserIdsSuccessResponse(List<String> ids) {
        this("success", ids);
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


