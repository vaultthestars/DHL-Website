package user;

/**
 * Class representing an individual TuneIn user, which houses essential user-specific information.
 */
public class User {
  private String username;
  private int membershipLength;
  private float[] songPoint;
  private User[] connections;
  private float[] historicalSongPoint;
  private float[] historicalConnections;

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
  public User(String username, int membershipLength, float[] songPoint, User[] connections,
      float[] historicalSongPoint, float[] historicalConnections) {
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

  public float[] getSongPoint() {
    return this.songPoint.clone();
  }

  public void setSongPoint(float[] songPoint) {
    this.songPoint = songPoint;
  }

  public User[] getConnections() {
    return this.connections.clone();
  }

  public void setConnections(User[] connections) {
    this.connections = connections;
  }

  public float[] getHistoricalSongPoint() {
    return this.historicalSongPoint.clone();
  }

  public void setHistoricalSongPoint(float[] historicalSongPoint) {
    this.historicalSongPoint = historicalSongPoint;
  }

  public float[] getHistoricalConnections() {
    return this.historicalConnections.clone();
  }

  public void setHistoricalConnections(float[] historicalConnections) {
    this.historicalConnections = historicalConnections;
  }

  //TODO: implement updateHistoricalSongPoint(float[] newSongPoint) with running average formula
}
