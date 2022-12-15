package server;

import com.google.api.core.ApiFuture;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.google.cloud.firestore.WriteResult;
import com.google.common.primitives.Doubles;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.cloud.FirestoreClient;
import com.google.gson.JsonObject;
import com.squareup.moshi.Moshi;
import com.squareup.moshi.Types;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.concurrent.ExecutionException;
import kdtree.DistanceSorter;
import kdtree.KdTree;
import user.Song;
import user.User;

/**
 * Wrapper class for Firestore Database
 */
public class Database {
  private Firestore database;
  private List<Song> currentSongPoints;
  private List<User> userPoints;
  private KdTree<Song> currentSongTree;
  private KdTree<User> userTree;

  public Database(String filepath, String projectId) {
    try{
      FileInputStream serviceAccount =
          new FileInputStream(filepath);
      FirebaseOptions options = FirebaseOptions.builder()
          .setCredentials(GoogleCredentials.fromStream(serviceAccount))
          .setProjectId(projectId)
          .build();
      FirebaseApp.initializeApp(options);

      this.database = FirestoreClient.getFirestore();

    } catch (IOException e){
      System.out.println(e.getMessage());

    }

  }

  public Firestore getFireStore(){
    return this.database;
  }


  public List<Song> getCurrentSongPoints() {
    return currentSongPoints;
  }

  public void setCurrentSongPoints(List<Song> currentSongPoints) {
    this.currentSongPoints = currentSongPoints;
  }

  public List<User> getUserPoints() {
    return userPoints;
  }

  public void setUserPoints(List<User> userPoints) {
    this.userPoints = userPoints;
  }

  public void updateUserSong(Song song) throws ExecutionException, InterruptedException {
    DocumentReference docRef = this.database.collection("users").document(song.getUserId());
    Map<String, Object> songMap = new HashMap();
    songMap.put("userId", song.getUserId());
    songMap.put("title", song.getTitle());
    songMap.put("id", song.getId());
    songMap.put("artists", song.getArtists());
    List<Double> featuresList = Doubles.asList(song.getFeatures());
    songMap.put("features", featuresList);
    docRef.update("currentSong", songMap);
  }

  public void updateUserConnections(User user){
    DocumentReference docRef = this.database.collection("users").document(user.getUserId());
    List<String> connections = Arrays.asList(user.getConnections());
    docRef.update("connections", connections);
    List<String> historicalConnections = Arrays.asList(user.getHistoricalConnections());
    docRef.update("historicalConnections", historicalConnections);
    List<Double> historicalSongPoint = Doubles.asList(user.getHistoricalSongPoint());
    docRef.update("historicalSongPoint", historicalSongPoint);
  }

  public String retrieveRefreshToken(String docId) throws ExecutionException, InterruptedException {
    DocumentReference docRef = this.database.collection("users").document(docId);
    // asynchronously retrieve the document
    ApiFuture<DocumentSnapshot> future = docRef.get();
    System.out.println("refresh token async call");

    // future.get() blocks on response
    DocumentSnapshot document = future.get();

    if (document.exists()) {
      return (String) document.getData().get("refreshToken");
    } else {
      System.out.println("No such document!");
      throw new RuntimeException();
    }

  }

  public Map<String, Object> retrieveUser(String docId)
      throws ExecutionException, InterruptedException, IOException {
      DocumentReference docRef = this.database.collection("users").document(docId);
      // asynchronously retrieve the document
      ApiFuture<DocumentSnapshot> future = docRef.get();
      System.out.println("async call");

      // future.get() blocks on response
      DocumentSnapshot document = future.get();

      if (document.exists()) {
        System.out.println(document.getData().get("displayName"));
        return document.getData();
      } else {
        System.out.println("No such document!");
        throw new RuntimeException();
      }

  }

  /** Creates SongPoint objects from updated user data and stores in daySongPoints */
  public void loadCurrentSongPoints(User user) {
    this.currentSongPoints = new ArrayList<Song>();
    this.currentSongPoints.add(user.getCurrentSong());
  }

  /** Creates SongPoint objects from updated user data and stores in historicalSongPoints */
  public void loadUserPoints(User user) {
    this.userPoints = new ArrayList<User>();
    this.userPoints.add(user);
  }

  /** Builds 6-d tree with song points from today */
  public void buildSongTree() {
    this.currentSongTree = new KdTree<Song>(this.getCurrentSongPoints(), 1);
  }

  /** Builds 6-d tree with historical song points */
  public void buildUserTree() {
    this.userTree = new KdTree<User>(this.getUserPoints(), 1);
  }

  /** Loads connections into each User object using kd-tree */
  public void loadConnections(User user) {
    Song currentSong = user.getCurrentSong();
    PriorityQueue<Song> connectionsQueue = this.currentSongTree.kdTreeSearch(
                  "neighbors", 5, currentSong, new DistanceSorter(currentSong), new HashSet<>());
    String[] connections = new String[5];
    int i = 0;
    for (Song song : connectionsQueue) {
      connections[i] = song.getUserId();
      i++;
    }
    user.setConnections(connections);
  }

  /** Loads historical connections into each User object using kd-tree */
  public void loadHistoricalConnections(User user) {
    PriorityQueue<User> connectionsQueue = this.userTree.kdTreeSearch(
                  "neighbors", 5, user, new DistanceSorter(user), new HashSet<>());
    String[] connections = new String[5];
    int i = 0;
    for (User usr : connectionsQueue) {
      connections[i] = usr.getUserId();
      i++;
    }
    user.setHistoricalConnections(connections);
  }



}
