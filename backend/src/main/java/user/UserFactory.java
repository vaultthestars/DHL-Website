package user;

import csv.CreatorFromRow;
import csv.FactoryFailureException;
import java.util.List;

/** Creates User objects from a List of Strings */
public class UserFactory implements CreatorFromRow<User> {

  @Override
  public User create(List<String> row) throws FactoryFailureException {
    if (row.size() != 6) {
      throw new FactoryFailureException(row);
    }
    try {
      String username = row.get(0);
      int membershipLength = Integer.parseInt(row.get(1));
      String[] songPointStr = row.get(2).split(" ");
      float[] songPoint = new float[6];
      for (int i = 0; i < songPointStr.length; i++) {
        songPoint[i] = Float.parseFloat(songPointStr[i]);
      }
      String[] connections = row.get(3).split(" ");
      String[] historicalConnectionsStr = row.get(4).split(" ");
      float[] historicalSongPoint = new float[6];
      for (int i = 0; i < historicalConnectionsStr.length; i++) {
        historicalSongPoint[i] = Float.parseFloat(historicalConnectionsStr[i]);
      }
      String[] historicalConnections = row.get(5).split(" ");

      return new User(
          username,
          membershipLength,
          songPoint,
          connections,
          historicalSongPoint,
          historicalConnections);
    } catch (NumberFormatException e) {
      throw new FactoryFailureException(row);
    }
  }
}
