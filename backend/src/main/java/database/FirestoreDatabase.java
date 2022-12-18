package database;

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
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import song.Song;
import user.User;

/** Wrapper class for Firestore Database */
public class FirestoreDatabase implements UserDatabase {
  private Firestore firestore;

  public FirestoreDatabase(String filepath, String projectId) {
    try {
      FileInputStream serviceAccount = new FileInputStream(filepath);
      FirebaseOptions options =
          FirebaseOptions.builder()
              .setCredentials(GoogleCredentials.fromStream(serviceAccount))
              .setProjectId(projectId)
              .build();
      FirebaseApp.initializeApp(options);

      this.firestore = FirestoreClient.getFirestore();

    } catch (IOException e) {
      System.out.println(e.getMessage());
    }
  }

  public Firestore getFireStore() {
    return this.firestore;
  }

  @Override
  public User getUser(String userId) {
    DocumentReference docRef = this.firestore.collection("users").document(userId);
    // asynchronously retrieve the document
    ApiFuture<DocumentSnapshot> future = docRef.get();
    System.out.println("Async call to getting user document from firestore.");

    // future.get() blocks on response
    DocumentSnapshot document = null;
    try {
      document = future.get();
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
    } catch (InterruptedException | ExecutionException e) {
      e.printStackTrace();
      throw new RuntimeException(e);
    }
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

  @Override
  public void updateUser(String userId, User user) {
    DocumentReference docRef = this.firestore.collection("users").document(userId);
    docRef.update("userId", user.getUserId());
    docRef.update("displayName", user.getDisplayName());
    docRef.update("refreshToken", user.getRefreshToken());
    docRef.update("membershipLength", user.getMembershipLength());
    // update list fields as arrays
    docRef.update("connections", Arrays.asList(user.getConnections()));
    docRef.update("historicalConnections", Arrays.asList(user.getHistoricalConnections()));
    docRef.update("historicalSongPoint", Doubles.asList(user.getHistoricalSongPoint()));
    // update song field as map
    try {
      this.updateUserSong(docRef, user.getCurrentSong());
    } catch (ExecutionException | InterruptedException e) {
      e.printStackTrace();
      throw new RuntimeException(e);
    }
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

  @Override
  public List<String> getAllUserIds() {
    List<String> ids = new ArrayList<>();
    ApiFuture<QuerySnapshot> future = this.firestore.collection("users").get();
    // future.get() blocks on response
    List<QueryDocumentSnapshot> documents = null;
    try {
      documents = future.get().getDocuments();
    } catch (InterruptedException | ExecutionException e) {
      e.printStackTrace();
      throw new RuntimeException(e);
    }
    for (QueryDocumentSnapshot doc : documents) {
      ids.add(doc.getString("userId"));
    }
    return ids;
  }
}
