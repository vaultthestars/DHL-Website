package edu.brown.cs.student.server;

import com.squareup.moshi.Moshi;

/**
 * Response object to return if the request was ill-formed
 *
 * @param result - string indicating bad json error
 */
public record ErrBadJsonResponse(String result) {

  public ErrBadJsonResponse() {
    this("error_bad_json");
  }

  /**
   * @return this response, serialized as Json
   */
  String serialize() {
    Moshi moshi = new Moshi.Builder().build();
    return moshi.adapter(ErrBadJsonResponse.class).toJson(this);
  }
}
