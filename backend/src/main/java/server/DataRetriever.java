package server;

public class DataRetriever {

//  final FirebaseDatabase database = FirebaseDatabase.getInstance(); // add firebase dependency to pomxml
//  DatabaseReference ref = database.getReference("server/saving-data/fireblog/posts");


  public DataRetriever(){

  }

  // TODO: Write a method that takes in a username and returns their refresh token
  public String getRefreshToken(String username){
    return "test";
  }

//  // Attach a listener to read the data at our posts reference
//  ref.addValueEventListener(new ValueEventListener() {
//    @Override
//    public void onDataChange(DataSnapshot dataSnapshot) {
//      Post post = dataSnapshot.getValue(Post.class);
//      System.out.println(post);
//    }
//
//    @Override
//    public void onCancelled(DatabaseError databaseError) {
//      System.out.println("The read failed: " + databaseError.getCode());
//    }
//  })



}


