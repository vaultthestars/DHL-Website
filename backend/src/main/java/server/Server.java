package edu.brown.cs.student.server;

import static spark.Spark.after;

import edu.brown.cs.student.datasource.Database;
import java.util.List;
import spark.Spark;

/**
 * Top-level class to run our API server. Contains the main() method which starts Spark and runs the
 * various handlers.
 *
 * <p>We have three endpoints: loadcsv, getcsv, and weather. loadcsv and getcsv utilize a shared
 * state, csvDatabase.
 */
public class Server {

  public static void main(String[] args) {
    Database<List<List<String>>> csvDatabase = new Database<>();
    System.out.println("pre-port");
    Spark.port(3232);
    System.out.println("post-port");
    /*
       Setting CORS headers to allow cross-origin requests from the client; this is necessary for the client to
       be able to make requests to the server.

       By setting the Access-Control-Allow-Origin header to "*", we allow requests from any origin.
       This is not a good idea in real-world applications, since it opens up your server to cross-origin requests
       from any website. Instead, you should set this header to the origin of your client, or a list of origins
       that you trust.

       By setting the Access-Control-Allow-Methods header to "*", we allow requests with any HTTP method.
       Again, it's generally better to be more specific here and only allow the methods you need, but for
       this demo we'll allow all methods.

       We recommend you learn more about CORS with these resources:
           - https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
           - https://portswigger.net/web-security/cors
    */
    after(
        (request, response) -> {
          response.header("Access-Control-Allow-Origin", "*");
          response.header("Access-Control-Allow-Methods", "*");
        });

    System.out.println("pre-logging get requests");
    // Setting up the handler for the GET endpoints
    Spark.get("loadcsv", new LoadCSVHandler(csvDatabase));
    Spark.get("getcsv", new GetCSVHandler(csvDatabase));
    Spark.get("weather", new WeatherHandler());
    System.out.println("post-logging get requests");

    Spark.init();
    System.out.println("post-init");
    Spark.awaitInitialization();
    System.out.println("post-awaitInit");
    System.out.println("Server started.");
  }
}
