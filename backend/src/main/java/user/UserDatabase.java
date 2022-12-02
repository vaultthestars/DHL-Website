package user;

import java.util.HashMap;
import java.util.List;
import kdtree.KdTree;
import kdtree.SongPoint;

/**
 * Class representing the complete database of users
 */
public class UserDatabase {

  private HashMap<String,User> users;
  private List<SongPoint> daySongPoints;
  private List<SongPoint> historicalSongPoints;
  private KdTree<SongPoint> daySongTree;
  private KdTree<SongPoint> historicalSongTree;

  /**
   * Constructor
   */
  public UserDatabase() {
    this.users = new HashMap<String, User>();
  }

  /**
   * Registers a user to the database if it doesn't already exist; if it does, the user is not added
   *
   * @param user - the user to be registered
   */
  public void register(User user) {
    if (!this.users.containsKey(user.getUsername())) {
      this.users.put(user.getUsername(), user);
    }
  }

  /**
   * Erases a user from the database if they exist
   *
   * @param user - the user to be erased
   */
  public void erase(User user) {
    if (this.users.containsKey(user.getUsername())) {
      this.users.remove(user.getUsername());
    }
  }

  public List<SongPoint> getDaySongPoints() {
    return daySongPoints;
  }

  public void setDaySongPoints(List<SongPoint> daySongPoints) {
    this.daySongPoints = daySongPoints;
  }

  public List<SongPoint> getHistoricalSongPoints() {
    return historicalSongPoints;
  }

  public void setHistoricalSongPoints(List<SongPoint> historicalSongPoints) {
    this.historicalSongPoints = historicalSongPoints;
  }

  /**
   * Builds 6-d tree with song points from today
   */
  public void buildSongTree() {
    this.daySongTree = new KdTree<SongPoint>(this.getDaySongPoints(), 1);
  }

  /**
   * Builds 6-d tree with historical song points
   */
  public void buildHistoricalSongTree() {
    this.historicalSongTree = new KdTree<SongPoint>(this.getHistoricalSongPoints(), 1);
  }
}
