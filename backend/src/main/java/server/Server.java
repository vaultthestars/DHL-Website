package server;

import static spark.Spark.after;

import database.FirestoreDatabase;
import server.handlers.GetRandomSongsHandler;
import server.handlers.GetUserHandler;
import server.handlers.GetUserIdsHandler;
import server.handlers.LoadConnectionsHandler;
import server.handlers.LoadSongFeaturesHandler;
import spark.Spark;

/**
 * Top-level class to run our API server. Contains the main() method which starts Spark and runs the
 * various handlers.
 */
public class Server {

  /**
   * Creates a List of User objects from a csv of mock users.
   *
   * @return a List of Users
   */
  //  public static List<User> generateMockUsers() {
  //    try {
  //      CSVParser<User> userCSVParser =
  //          new CSVParser<User>(new FileReader("data/mockUsers.csv"), new UserFactory());
  //      return userCSVParser.getParsedData();
  //    } catch (IOException | FactoryFailureException e) {
  //      throw new RuntimeException(e);
  //    }
  //  }

  //  /**
  //   * Registers users from a list in the user database
  //   *
  //   * @param userDatabase - the user database to update
  //   * @param users - the list of users to register
  //   */
  //  public static void registerUsers(UserDatabase userDatabase, List<User> users) {
  //    for (User user : users) {
  //      userDatabase.register(user);
  //    }
  //  }

  public static void main(String[] args) {
    Spark.port(3232);
    //    UserDatabase userDatabase = new UserDatabase();
    //    registerUsers(userDatabase, generateMockUsers());

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

    // mock Points for now to build kd trees

    FirestoreDatabase db = new FirestoreDatabase("private/tunedIn_firebase.json", Constants.PROJECT_ID);

    // Setting up the handler for the GET endpoints
    Spark.get("load-song-features", new LoadSongFeaturesHandler(db));
    Spark.get("load-connections", new LoadConnectionsHandler(db));
    Spark.get("get-user", new GetUserHandler(db));
    Spark.get("get-all-user-ids", new GetUserIdsHandler(db));
    // just for generating mock songs to store in songs.csv
    Spark.get("get-random-songs", new GetRandomSongsHandler());

    Spark.init();
    Spark.awaitInitialization();
    System.out.println("Server started.");
  }
}
