package user;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.PriorityQueue;
import kdtree.DistanceSorter;
import kdtree.KdTree;
import kdtree.SongPoint;

/** Class representing the complete database of users */
public class UserDatabase {

  private HashMap<String, User> users;
  private List<SongPoint> daySongPoints;
  private List<SongPoint> historicalSongPoints;
  private KdTree<SongPoint> daySongTree;
  private KdTree<SongPoint> historicalSongTree;

  /** Constructor */
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

  /**
   * Returns User object given username
   *
   * @param username - the name of the user to get
   * @return the User
   */
  public User getUser(String username) {
    return this.users.get(username).clone();
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

  /** Creates SongPoint objects from updated user data and stores in daySongPoints */
  public void loadSongPoints() {
    List<SongPoint> songPoints = new ArrayList<SongPoint>();
    this.users.forEach(
        (username, user) -> {
          SongPoint songPoint = new SongPoint(username, user.getSongPoint());
          songPoints.add(songPoint);
        });
    this.daySongPoints = songPoints;
  }

  /** Creates SongPoint objects from updated user data and stores in historicalSongPoints */
  public void loadHistoricalSongPoints() {
    List<SongPoint> songPoints = new ArrayList<SongPoint>();
    this.users.forEach(
        (username, user) -> {
          SongPoint songPoint = new SongPoint(username, user.getHistoricalSongPoint());
          songPoints.add(songPoint);
        });
    this.historicalSongPoints = songPoints;
  }

  /** Builds 6-d tree with song points from today */
  public void buildSongTree() {
    this.daySongTree = new KdTree<SongPoint>(this.getDaySongPoints(), 1);
  }

  /** Builds 6-d tree with historical song points */
  public void buildHistoricalSongTree() {
    this.historicalSongTree = new KdTree<SongPoint>(this.getHistoricalSongPoints(), 1);
  }

  /** Loads connections into each User object using kd-tree */
  public void loadConnections() {
    this.users.forEach(
        (username, user) -> {
          SongPoint sp = new SongPoint(username, user.getSongPoint());
          PriorityQueue<SongPoint> connectionsQueue =
              this.daySongTree.kdTreeSearch(
                  "neighbors", 5, sp, new DistanceSorter(sp), new HashSet<>());
          // System.out.println(connectionsQueue.toString());
          String[] connections = new String[5];
          int i = 0;
          for (SongPoint songPoint : connectionsQueue) {
            connections[i] = songPoint.getUsername();
            i++;
          }
          user.setConnections(connections);
        });
  }

  /** Loads historical connections into each User object using kd-tree */
  public void loadHistoricalConnections() {
    this.users.forEach(
        (username, user) -> {
          SongPoint sp = new SongPoint(username, user.getHistoricalSongPoint());
          PriorityQueue<SongPoint> connectionsQueue =
              this.historicalSongTree.kdTreeSearch(
                  "neighbors", 5, sp, new DistanceSorter(sp), new HashSet<>());
          String[] connections = new String[5];
          int i = 0;
          for (SongPoint songPoint : connectionsQueue) {
            connections[i] = songPoint.getUsername();
            i++;
          }
          user.setHistoricalConnections(connections);
        });
  }
}
