package server;

import com.google.api.core.ApiFuture;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.google.common.primitives.Doubles;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.cloud.FirestoreClient;
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

/** Wrapper class for Firestore Database */
public class Database {
  private Firestore database;
  private List<Song> currentSongPoints;
  private List<User> userPoints;
  private KdTree<Song> currentSongTree;
  private KdTree<User> userTree;

  public Database(String filepath, String projectId) {
    try {
      FileInputStream serviceAccount = new FileInputStream(filepath);
      FirebaseOptions options =
          FirebaseOptions.builder()
              .setCredentials(GoogleCredentials.fromStream(serviceAccount))
              .setProjectId(projectId)
              .build();
      FirebaseApp.initializeApp(options);

      this.database = FirestoreClient.getFirestore();

    } catch (IOException e) {
      System.out.println(e.getMessage());
    }
  }

  public Firestore getFireStore() {
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

  public User generateUser(QueryDocumentSnapshot document) {
    String userId = document.getString("userId");
    String displayName = document.getString("displayName");
    String refreshToken = document.getString("refreshToken");
    int membershipLength = document.get("membershipLength", Integer.class);

    Map<String, Object> docMap = document.getData();

    Map<String, Object> songMap = (Map) docMap.get("currentSong");
    List<Double> featList = (List<Double>) songMap.get("features");
    Song currentSong =
        new Song(
            (String) songMap.get("userId"),
            (String) songMap.get("title"),
            (String) songMap.get("id"),
            (List<String>) songMap.get("artists"),
            this.listToDoubleArray(featList));

    List<String> connections = (List<String>) docMap.get("connections");
    List<Double> historicalSongPoint = (List<Double>) docMap.get("historicalSongPoint");
    List<String> historicalConnections = (List<String>) docMap.get("historicalConnections");

    return new User(
        userId,
        displayName,
        refreshToken,
        membershipLength,
        currentSong,
        this.listToStrArray(connections),
        this.listToDoubleArray(historicalSongPoint),
        this.listToStrArray(historicalConnections));
  }

  private double[] listToDoubleArray(List<Double> lst) {
    if (lst != null) {
      double[] array = new double[6];
      for (int i = 0; i < lst.size(); i++) {
        array[i] = lst.get(i);
      }
      return array;
    } else {
      return new double[6];
    }
  }

  private String[] listToStrArray(List<String> lst) {
    if (lst != null) {
      String[] array = new String[5];
      for (int i = 0; i < lst.size(); i++) {
        array[i] = lst.get(i);
      }
      return array;
    } else {
      return new String[5];
    }
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

  public void updateMembershipLength(String userId) {
    DocumentReference docRef = this.database.collection("users").document(userId);
    // asynchronously retrieve the document
    ApiFuture<DocumentSnapshot> future = docRef.get();
    // block on response
    DocumentSnapshot document = null;
    try {
      document = future.get();
    } catch (InterruptedException | ExecutionException e) {
      e.printStackTrace();
      throw new RuntimeException(e);
    }
    int currentML = document.get("membershipLength", Integer.class);
    docRef.update("membershipLength", currentML+1);
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

  public List<String> retrieveAllUserIds() throws ExecutionException, InterruptedException {
    List<String> ids = new ArrayList<>();
    ApiFuture<QuerySnapshot> future = this.database.collection("users").get();
    // future.get() blocks on response
    List<QueryDocumentSnapshot> documents = future.get().getDocuments();
    for (QueryDocumentSnapshot doc : documents) {
      ids.add(doc.getString("userId"));
    }
    return ids;
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

  public void updateUserConnections(User user) {
    DocumentReference docRef = this.database.collection("users").document(user.getUserId());
    List<String> connections = Arrays.asList(user.getConnections());
    docRef.update("connections", connections);
    List<String> historicalConnections = Arrays.asList(user.getHistoricalConnections());
    docRef.update("historicalConnections", historicalConnections);
    List<Double> historicalSongPoint = Doubles.asList(user.getHistoricalSongPoint());
    docRef.update("historicalSongPoint", historicalSongPoint);
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
    PriorityQueue<Song> connectionsQueue =
        this.currentSongTree.kdTreeSearch(
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
    PriorityQueue<User> connectionsQueue =
        this.userTree.kdTreeSearch("neighbors", 5, user, new DistanceSorter(user), new HashSet<>());
    String[] connections = new String[5];
    int i = 0;
    for (User usr : connectionsQueue) {
      connections[i] = usr.getUserId();
      i++;
    }
    user.setHistoricalConnections(connections);
  }
}
