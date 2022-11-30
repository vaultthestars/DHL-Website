package user;

/**
 * Class representing an individual TuneIn user, which houses essential user-specific information.
 */
public class User {
  private String username;
  private int membershipLength;
  private Float[] songPoint;
  private User[] connections;
  private Float[] historicalSongPoint;
  private Float[] historicalConnections;

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
  public User(String username, int membershipLength, Float[] songPoint, User[] connections,
      Float[] historicalSongPoint, Float[] historicalConnections) {
    this.username = username;
    this.membershipLength = membershipLength;
    this.songPoint = songPoint;
    this.connections = connections;
    this.historicalSongPoint = historicalSongPoint;
    this.historicalConnections = historicalConnections;
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

  public Float[] getSongPoint() {
    return this.songPoint.clone();
  }

  public void setSongPoint(Float[] songPoint) {
    this.songPoint = songPoint;
  }

  public User[] getConnections() {
    return this.connections.clone();
  }

  public void setConnections(User[] connections) {
    this.connections = connections;
  }

  public Float[] getHistoricalSongPoint() {
    return this.historicalSongPoint.clone();
  }

  public void setHistoricalSongPoint(Float[] historicalSongPoint) {
    this.historicalSongPoint = historicalSongPoint;
  }

  public Float[] getHistoricalConnections() {
    return this.historicalConnections.clone();
  }

  public void setHistoricalConnections(Float[] historicalConnections) {
    this.historicalConnections = historicalConnections;
  }
}
