package edu.brown.cs.student.server;

import com.squareup.moshi.Moshi;

/**
 * Response object to return if the request was missing a needed field, or the field was ill-formed
 *
 * @param result - string indicating bad request error
 */
public record ErrBadRequestResponse(String result) {

  public ErrBadRequestResponse() {
    this("error_bad_request");
  }

  /**
   * @return this response, serialized as Json
   */
  String serialize() {
    Moshi moshi = new Moshi.Builder().build();
    return moshi.adapter(ErrBadRequestResponse.class).toJson(this);
  }
}
