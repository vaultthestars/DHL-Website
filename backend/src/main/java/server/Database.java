package server;

import com.google.api.core.ApiFuture;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.google.cloud.firestore.WriteResult;
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
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import user.Song;
import user.User;

/**
 * Wrapper class for Firestore Database
 */
public class Database {
 private Firestore database;

  public Database() {
    try{
      FileInputStream serviceAccount =
          new FileInputStream("private/tunedIn_firebase.json");
      FirebaseOptions options = FirebaseOptions.builder()
          .setCredentials(GoogleCredentials.fromStream(serviceAccount))
          .setProjectId(Constants.PROJECT_ID)
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

  // TODO write error response classes for the exceptions thrown by these methods

  public void storeUser(){
//    City city =
//        new City("Los Angeles", "CA", "USA", false, 3900000L, Arrays.asList("west_coast", "socal"));
//    ApiFuture<WriteResult> future = db.collection("cities").document("LA").set(city);
//// block on response if required
//    System.out.println("Update time : " + future.get().getUpdateTime());

  }

  public void updateUserSong(Song song) throws ExecutionException, InterruptedException {
    // Update an existing document
    DocumentReference docRef = this.database.collection("users").document(song.getUserId());
    Map<String, Object> songMap = new HashMap();
    songMap.put("userId", song.getUserId());
    songMap.put("title", song.getTitle());
    songMap.put("id", song.getId());
    songMap.put("artists", song.getArtists());
    songMap.put("features", Arrays.toString(song.getFeatures()));

    System.out.println(songMap);

    // (async) Update one field
    ApiFuture<WriteResult> future = docRef.update("currentSong", songMap);
//    WriteResult result = future.get();
//    System.out.println("Write result: " + result);

  }

  public String retrieveRefreshToken(String docId) throws ExecutionException, InterruptedException {
    DocumentReference docRef = this.database.collection("users").document(docId);
    // asynchronously retrieve the document
    ApiFuture<DocumentSnapshot> future = docRef.get();
    System.out.println("async call");

    // future.get() blocks on response
    DocumentSnapshot document = future.get();

    if (document.exists()) {
      return (String) document.getData().get("refreshToken");
    } else {
      System.out.println("No such document!");
      throw new RuntimeException();
    }

  }

  public void updateCurrentSongs(){
//    for (DocumentReference docRef : this.database.collection("users")){
//
//    }

  }

  public List<User> retrieveAllUsers() throws ExecutionException, InterruptedException {
      List<User> users = new ArrayList<>();
      // asynchronously retrieve all documents
      ApiFuture<QuerySnapshot> future = this.database.collection("users").get();
      // future.get() blocks on response
      List<QueryDocumentSnapshot> documents = future.get().getDocuments();
      for (QueryDocumentSnapshot document : documents) {
        users.add(document.toObject(User.class));

      }
      return users;
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



}
