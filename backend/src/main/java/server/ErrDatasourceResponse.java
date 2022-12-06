package server;

import com.squareup.moshi.Moshi;

/**
 * Response object to return if the given data source wasn't accessible (e.g., the file didn't exist
 * or the NWS API returned an error for a given location).
 *
 * @param result - string indicating datasource error
 */
public record ErrDatasourceResponse(String result) {
  public ErrDatasourceResponse() {
    this("error_datasource");
  }

  /**
   * @return this response, serialized as Json
   */
  String serialize() {
    Moshi moshi = new Moshi.Builder().build();
    return moshi.adapter(ErrDatasourceResponse.class).toJson(this);
  }
}
