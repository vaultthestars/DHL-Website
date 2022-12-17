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
  private List<Song> songNodes;
  private List<User> userNodes;
  private KdTree<Song> songTree;
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

  public List<Song> getSongNodes() {
    return this.songNodes;
  }

  public void setSongNodes(List<Song> songNodes) {
    this.songNodes = songNodes;
  }

  public List<User> getUserNodes() {
    return this.userNodes;
  }

  public void setUserNodes(List<User> userNodes) {
    this.userNodes = userNodes;
  }

  public KdTree<Song> getSongTree() {
    return this.songTree;
  }

  public void setSongTree(KdTree<Song> songTree) {
    this.songTree = songTree;
  }

  public KdTree<User> getUserTree() {
    return this.userTree;
  }

  public void setUserTree(KdTree<User> userTree) {
    this.userTree = userTree;
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

  public void updateUser(String userId, User user) throws ExecutionException, InterruptedException {
    DocumentReference docRef = this.database.collection("users").document(userId);
    docRef.update("userId", user.getUserId());
    docRef.update("displayName", user.getDisplayName());
    docRef.update("refreshToken", user.getRefreshToken());
    docRef.update("membershipLength", user.getMembershipLength());
    // update list fields as arrays
    docRef.update("connections", Arrays.asList(user.getConnections()));
    docRef.update("historicalConnections", Arrays.asList(user.getHistoricalConnections()));
    docRef.update("historicalSongPoint", Doubles.asList(user.getHistoricalSongPoint()));
    // update song field as map
    this.updateUserSong(docRef, user.getCurrentSong());
  }

  private void updateUserSong(DocumentReference docRef, Song song) throws ExecutionException, InterruptedException {
    Map<String, Object> songMap = new HashMap();
    songMap.put("userId", song.getUserId());
    songMap.put("title", song.getTitle());
    songMap.put("id", song.getId());
    songMap.put("artists", song.getArtists());
    List<Double> featuresList = Doubles.asList(song.getFeatures());
    songMap.put("features", featuresList);
    docRef.update("currentSong", songMap);
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

  public void loadNodeLists() throws ExecutionException, InterruptedException {
    List<User> userNodes = new ArrayList<>();
    List<Song> songNodes = new ArrayList<>();
    ApiFuture<QuerySnapshot> future = this.database.collection("users").get();
    // future.get() blocks on response
    List<QueryDocumentSnapshot> documents = future.get().getDocuments();
    for (QueryDocumentSnapshot doc : documents) {
      if (doc.getData().get("refreshToken") != null) {
        User user = this.generateUser(doc);
        userNodes.add(user);
        songNodes.add(user.getCurrentSong());
      }
    }
    this.setUserNodes(userNodes);
    this.setSongNodes(songNodes);
  }

  public void buildTrees() {
    this.setSongTree(new KdTree<Song>(this.getSongNodes(), 1));
    this.setUserTree(new KdTree<User>(this.getUserNodes(), 1));
  }
}
