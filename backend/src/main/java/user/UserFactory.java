package user;

import csv.CreatorFromRow;
import csv.FactoryFailureException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Creates User objects from a List of Strings */
public class UserFactory implements CreatorFromRow<User> {

  @Override
  public User create(List<String> row) throws FactoryFailureException {
//    if (row.size() != 9) {
//      throw new FactoryFailureException(row);
//    }
//    try {
//      String username = row.get(0);
//      int membershipLength = Integer.parseInt(row.get(1));
//      String title = row.get(2);
//      String id = row.get(3);
//      List<String> artists = Arrays.stream(row.get(4).split(" ")).toList();
//      String[] songPointStr = row.get(5).split(" ");
//      double[] features = new double[6];
//      for (int i = 0; i < songPointStr.length; i++) {
//        features[i] = Double.parseDouble(songPointStr[i]);
//      }
//      Song currentSong = new Song(username, title, id, artists, features);
//
//      String[] connections = row.get(6).split(" ");
//      String[] historicalConnectionsStr = row.get(7).split(" ");
//      float[] historicalSongPoint = new float[6];
//      for (int i = 0; i < historicalConnectionsStr.length; i++) {
//        historicalSongPoint[i] = Float.parseFloat(historicalConnectionsStr[i]);
//      }
//      String[] historicalConnections = row.get(8).split(" ");
//
//      return new User(
//          username,
//          membershipLength,
//          currentSong,
//          connections,
//          historicalSongPoint,
//          historicalConnections);
//    } catch (NumberFormatException e) {
//      throw new FactoryFailureException(row);
//    }
//    return new User("sam", "sam minars", "mock token",
//        3,new Song("sam","rules","123",new ArrayList<>(),new double[6]),new String[5],new double[6],new String[5]);

  return new User();
  }
}
