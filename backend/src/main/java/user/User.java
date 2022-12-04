package user;

import java.util.Arrays;
import java.util.Objects;

/**
 * Class representing an individual TuneIn user, which houses essential user-specific information.
 */
public class User implements Cloneable {
  private String username;
  private int membershipLength;
  private float[] songPoint;
  private String[] connections;
  private float[] historicalSongPoint;
  private String[] historicalConnections;

  /**
   * Constructor for new user
   *
   * @param username - TunedIn username, identifier for the user
   */
  public User(String username) {
    this.username = username;
    this.membershipLength = 0;
    this.songPoint = new float[6];
    this.connections = new String[5];
    this.historicalSongPoint = new float[6];
    this.historicalConnections = new String[5];
  }

  /**
   * Constructor for User object
   *
   * @param username - TuneIn username, identifier for the user
   * @param membershipLength - days since joining TuneIn
   * @param songPoint - audio features for most recent song
   * @param connections - nearest neighbors from song points tree
   * @param historicalSongPoint - avg audio features of all song points since joining
   * @param historicalConnections - nearest neighbors from historical song points tree
   */
  public User(
      String username,
      int membershipLength,
      float[] songPoint,
      String[] connections,
      float[] historicalSongPoint,
      String[] historicalConnections) {
    this.username = username;
    this.membershipLength = membershipLength;
    this.songPoint = songPoint;
    this.connections = connections;
    this.historicalSongPoint = historicalSongPoint;
    this.historicalConnections = historicalConnections;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    User user = (User) o;
    return membershipLength == user.membershipLength
        && username.equals(user.username)
        && Arrays.equals(songPoint, user.songPoint)
        && Arrays.equals(connections, user.connections)
        && Arrays.equals(historicalSongPoint, user.historicalSongPoint)
        && Arrays.equals(historicalConnections, user.historicalConnections);
  }

  @Override
  public int hashCode() {
    int result = Objects.hash(username, membershipLength);
    result = 31 * result + Arrays.hashCode(songPoint);
    result = 31 * result + Arrays.hashCode(connections);
    result = 31 * result + Arrays.hashCode(historicalSongPoint);
    result = 31 * result + Arrays.hashCode(historicalConnections);
    return result;
  }

  public String getUsername() {
    return this.username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  public int getMembershipLength() {
    return this.membershipLength;
  }

  public void setMembershipLength(int membershipLength) {
    this.membershipLength = membershipLength;
  }

  public float[] getSongPoint() {
    return this.songPoint.clone();
  }

  public void setSongPoint(float[] songPoint) {
    this.songPoint = songPoint;
  }

  public String[] getConnections() {
    return this.connections.clone();
  }

  public void setConnections(String[] connections) {
    this.connections = connections;
  }

  public float[] getHistoricalSongPoint() {
    return this.historicalSongPoint.clone();
  }

  public void setHistoricalSongPoint(float[] historicalSongPoint) {
    this.historicalSongPoint = historicalSongPoint;
  }

  public String[] getHistoricalConnections() {
    return this.historicalConnections.clone();
  }

  public void setHistoricalConnections(String[] historicalConnections) {
    this.historicalConnections = historicalConnections;
  }

  @Override
  public User clone() {
    try {
      User clone = (User) super.clone();
      // TODO: copy mutable state here, so the clone can't change the internals of the original
      clone.setUsername(this.getUsername());
      clone.setMembershipLength(this.getMembershipLength());
      clone.setSongPoint(this.getSongPoint());
      clone.setConnections(this.getConnections());
      clone.setHistoricalSongPoint(this.getHistoricalSongPoint());
      clone.setHistoricalConnections(this.getHistoricalConnections());
      return clone;
    } catch (CloneNotSupportedException e) {
      throw new AssertionError();
    }
  }

  public void updateHistoricalSongPoint(float[] newSongPoint) {
    // TODO: implement with incremental / running average formula
  }
}
