package user;

import java.util.Arrays;
import java.util.Objects;
import kdtree.KdTreeNode;

/**
 * Class representing an individual TuneIn user, which houses essential user-specific information.
 */
public class User implements KdTreeNode, Cloneable {
  private String userId;
  private String displayName;
  private String refreshToken;
  private int membershipLength;
  private Song currentSong;
  private String[] connections;
  private double[] historicalSongPoint;
  private String[] historicalConnections;

  public User(){

  }

  public User(String userId, String displayName, String refreshToken, int membershipLength,
      Song currentSong, String[] connections, double[] historicalSongPoint,
      String[] historicalConnections) {
    this.userId = userId;
    this.displayName = displayName;
    this.refreshToken = refreshToken;
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
        && userId.equals(user.userId)
        && currentSong.equals(user.currentSong)
        && Arrays.equals(connections, user.connections)
        && Arrays.equals(historicalSongPoint, user.historicalSongPoint)
        && Arrays.equals(historicalConnections, user.historicalConnections);
  }

  @Override
  public int hashCode() {
    int result = Objects.hash(userId, membershipLength);
    result = 31 * result + currentSong.hashCode();
    result = 31 * result + Arrays.hashCode(connections);
    result = 31 * result + Arrays.hashCode(historicalSongPoint);
    result = 31 * result + Arrays.hashCode(historicalConnections);
    return result;
  }

  public String getUserId() {
    return this.userId;
  }

  public void setUserId(String userId) {
    this.userId = userId;
  }

  public String getDisplayName() {
    return displayName;
  }

  public void setDisplayName(String displayName) {
    this.displayName = displayName;
  }

  public String getRefreshToken() {
    return refreshToken;
  }

  public void setRefreshToken(String refreshToken) {
    this.refreshToken = refreshToken;
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

  public double[] getHistoricalSongPoint() {
    return this.historicalSongPoint.clone();
  }

  public void setHistoricalSongPoint(double[] historicalSongPoint) {
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
      clone.setUserId(this.getUserId());
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

  public void updateHistoricalSongPoint(double[] newSongPoint) {
    // TODO: implement with incremental / running average formula
  }

  @Override
  public double[] getPoint() {
    return this.getHistoricalSongPoint();
  }

  @Override
  public int getDimension() {
    return this.getHistoricalSongPoint().length;
  }

  @Override
  public double euclideanDistance(KdTreeNode node) {
    double[] currentVals = this.getHistoricalSongPoint();
    double[] targetVals = node.getPoint();
    double sum = 0;
    for (int i = 0; i < currentVals.length; i++) {
      sum += Math.pow(currentVals[i] - targetVals[i], 2);
    }
    return Math.sqrt(sum);
  }
}
