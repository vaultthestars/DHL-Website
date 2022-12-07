package user;

import java.util.Arrays;
import java.util.Objects;
import kdtree.KdTreeNode;

/**
 * Class representing an individual TuneIn user, which houses essential user-specific information.
 */
public class User implements KdTreeNode, Cloneable {
  private String username;
  private int membershipLength;
  private Song currentSong;
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
    this.currentSong = null;
    this.connections = new String[5];
    this.historicalSongPoint = new float[6];
    this.historicalConnections = new String[5];
  }

  /**
   * Constructor for User object
   *
   * @param username - TuneIn username, identifier for the user
   * @param membershipLength - days since joining TuneIn
   * @param currentSong - currently playing song at the time of TunedIn
   * @param connections - nearest neighbors from song points tree
   * @param historicalSongPoint - avg audio features of all song points since joining
   * @param historicalConnections - nearest neighbors from historical song points tree
   */
  public User(
      String username,
      int membershipLength,
      Song currentSong,
      String[] connections,
      float[] historicalSongPoint,
      String[] historicalConnections) {
    this.username = username;
    this.membershipLength = membershipLength;
    this.currentSong = currentSong;
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
        && currentSong.equals(user.currentSong)
        && Arrays.equals(connections, user.connections)
        && Arrays.equals(historicalSongPoint, user.historicalSongPoint)
        && Arrays.equals(historicalConnections, user.historicalConnections);
  }

  @Override
  public int hashCode() {
    int result = Objects.hash(username, membershipLength);
    result = 31 * result + currentSong.hashCode();
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

  public Song getCurrentSong() {
    return currentSong;
  }

  public void setCurrentSong(Song currentSong) {
    this.currentSong = currentSong;
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
      clone.setCurrentSong(this.getCurrentSong());
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

  @Override
  public float[] getPoint() {
    return this.getHistoricalSongPoint();
  }

  @Override
  public int getDimension() {
    return this.getHistoricalSongPoint().length;
  }

  @Override
  public double euclideanDistance(KdTreeNode node) {
    float[] currentVals = this.getHistoricalSongPoint();
    float[] targetVals = node.getPoint();
    float sum = 0;
    for (int i = 0; i < currentVals.length; i++) {
      sum += Math.pow(currentVals[i] - targetVals[i], 2);
    }
    return Math.sqrt(sum);
  }
}
