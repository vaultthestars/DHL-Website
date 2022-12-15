package server.handlers;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.squareup.moshi.Moshi;

import java.util.List;
import java.util.Map;

import server.Database;
import server.ErrBadJsonResponse;
import spark.Request;
import spark.Response;
import spark.Route;
import user.Song;
import user.User;


public class LoadConnectionsHandler implements Route {

  private Database database;

  /**
   * Constructor for handler that takes in userDatabase to access nodes for kd-tree
   *
   * @param database - the database housing users to build tree
   */
  public LoadConnectionsHandler(Database database) {
    this.database = database;
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
    try {
      // asynchronously retrieve all documents
      ApiFuture<QuerySnapshot> future = this.database.getFireStore().collection("users").get();
      // future.get() blocks on response
      List<QueryDocumentSnapshot> documents = future.get().getDocuments();
      for (QueryDocumentSnapshot doc : documents) {
        this.generateUser(doc);
//        this.database.loadCurrentSongPoints(user);
//        this.database.loadUserPoints(user);
//        this.database.buildSongTree();
//        this.database.buildUserTree();
//        this.database.loadConnections(user);
//        this.database.loadHistoricalConnections(user);
//        this.database.updateUserConnections(user);
      }
      return new LoadConnectionsSuccessResponse().serialize();
    } catch (Exception e) {
      e.printStackTrace();
      return new ErrBadJsonResponse();
    }
  }

  public record LoadConnectionsSuccessResponse(String result) {

    public LoadConnectionsSuccessResponse() {
      this("success");
    }

    /**
     * Serializes this response object ot a Json String
     *
     * @return this response, serialized as Json
     */
    String serialize() {
      try {
        Moshi moshi = new Moshi.Builder().build();
        return moshi.adapter(LoadConnectionsSuccessResponse.class).toJson(this);
      } catch (Exception e) {
        e.printStackTrace();
        throw e;
      }
    }
  }

  private void generateUser(QueryDocumentSnapshot document)  {
      String userId = document.getString("userId");
      String displayName = document.getString("displayName");
      String refreshToken = document.getString("refreshToken");
      int membershipLength = document.get("membershipLength", Integer.class);
      System.out.println(userId);
      System.out.println(displayName);
      System.out.println(refreshToken);

      Map<String, Object> docMap =  document.getData();
      Map<String, Object> songMap = (Map) docMap.get("currentSong");
      
//      String feat = (String) songMap.get("features");
//      feat = feat.replace("[","");
//      feat = feat.replace("]","");
//      String[] featArray = feat.split("[,]");
//      double[] doubleFeatArray = Arrays.stream(featArray).mapToDouble(Double::parseDouble).toArray();

      List<Double> featList= (List<Double>) songMap.get("features");
      Song currentSong = new Song((String) songMap.get("userId"), (String) songMap.get("title"),
          (String) songMap.get("id"), (List<String>) songMap.get("artists"),
          this.listToDoubleArray(featList));

      //List<String> connections = document.get("connections",List.class);
//      connections = connections.replace("[","");
//      connections = connections.replace("]","");
//      String[] connectArray = connections .split("[,]");

      //List historicalSongPoint = document.get;
//      historicalSongPoint = historicalSongPoint.replace("[","");
//      historicalSongPoint = historicalSongPoint.replace("]","");
//      String[] histSongPointArray = historicalSongPoint.split("[,]");
//      double[] doubleHistSongPointArray = Arrays.stream(histSongPointArray).mapToDouble(Double::parseDouble).toArray();

     // List<String> historicalConnections = (List<String>) document.get("historicalConnections");
//      historicalConnections = historicalConnections.replace("[","");
//      historicalConnections = historicalConnections.replace("]","");
//      String[] histConnectArray = historicalConnections.split("[,]");

      System.out.println(userId);
      System.out.println(displayName);
      System.out.println(refreshToken);
      System.out.println(membershipLength);
//      System.out.println(this.listToStrArray(connections));
//      System.out.println(this.listToDoubleArray(historicalSongPoint));
//      System.out.println(this.listToStrArray(historicalConnections));
      //return new User(userId,displayName,refreshToken,membershipLength,currentSong,connections,historicalSongPoint,historicalConnections);

  }

  private double[] listToDoubleArray(List<Double> lst){
    double[] array = new double[6];
    for(int i = 0; i < lst.size() ; i++){
      array[i]= lst.get(i);
    }
    return array;
  }

  private String[] listToStrArray(List<String> lst){
    String[] array = new String[6];
    for(int i = 0; i < lst.size() ; i++){
      array[i]= lst.get(i);
    }
    return array;
  }
}
