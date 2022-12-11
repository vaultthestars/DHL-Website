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
import java.io.FileInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
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

  public void storeUser(){
//    City city =
//        new City("Los Angeles", "CA", "USA", false, 3900000L, Arrays.asList("west_coast", "socal"));
//    ApiFuture<WriteResult> future = db.collection("cities").document("LA").set(city);
//// block on response if required
//    System.out.println("Update time : " + future.get().getUpdateTime());

  }

  public void updateUser(String email) throws ExecutionException, InterruptedException {

    // Update an existing document
    DocumentReference docRef = this.database.collection("users").document(email);

    // (async) Update one field
    ApiFuture<WriteResult> future = docRef.update("membershipLength", 3);


    WriteResult result = future.get();
    System.out.println("Write result: " + result);

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
        System.out.println(document.getId() + " => " + document.toObject(User.class));
      }
      return users;
  }

  public User retrieveUser(String docId) throws ExecutionException, InterruptedException {
      DocumentReference docRef = this.database.collection("users").document(docId);
      // asynchronously retrieve the document
      ApiFuture<DocumentSnapshot> future = docRef.get();

      // future.get() blocks on response
      DocumentSnapshot document = future.get();
      if (document.exists()) {
        return document.toObject(User.class);
      } else {
        System.out.println("No such document!");
        throw new RuntimeException();
      }

  }



}
