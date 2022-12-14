package user;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.PriorityQueue;
import kdtree.DistanceSorter;
import kdtree.KdTree;

/** Class representing the complete database of users */
public class UserDatabase {

  private HashMap<String, User> users;
  private List<Song> currentSongPoints;
  private List<User> userPoints;
  private KdTree<Song> currentSongTree;
  private KdTree<User> userTree;

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
    if (!this.users.containsKey(user.getUserId())) {
      this.users.put(user.getUserId(), user);
    }
  }

  /**
   * Erases a user from the database if they exist
   *
   * @param user - the user to be erased
   */
  public void erase(User user) {
    if (this.users.containsKey(user.getUserId())) {
      this.users.remove(user.getUserId());
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

  public List<Song> getCurrentSongPoints() {
    return currentSongPoints;
  }

  public void setCurrentSongPoints(List<Song> currentSongPoints) {
    this.currentSongPoints = currentSongPoints;
  }

  public List<User> getUserPoints() {
    return userPoints;
  }

  public void setUserPoints(List<User> userPoints) {
    this.userPoints = userPoints;
  }

  /** Creates SongPoint objects from updated user data and stores in daySongPoints */
  public void loadCurrentSongPoints() {
    List<Song> songPoints = new ArrayList<Song>();
    this.users.forEach(
        (username, user) -> {
          songPoints.add(user.getCurrentSong());
        });
    this.setCurrentSongPoints(songPoints);
  }

  /** Creates SongPoint objects from updated user data and stores in historicalSongPoints */
  public void loadUserPoints() {
    List<User> userPoints = new ArrayList<User>();
    this.users.forEach(
        (username, user) -> {
          userPoints.add(user);
        });
    this.userPoints = userPoints;
  }

  /** Builds 6-d tree with song points from today */
  public void buildSongTree() {
    this.currentSongTree = new KdTree<Song>(this.getCurrentSongPoints(), 1);
  }

  /** Builds 6-d tree with historical song points */
  public void buildUserTree() {
    this.userTree = new KdTree<User>(this.getUserPoints(), 1);
  }

  /** Loads connections into each User object using kd-tree */
  public void loadConnections() {
    this.users.forEach(
        (username, user) -> {
          Song currentSong = user.getCurrentSong();
          PriorityQueue<Song> connectionsQueue =
              this.currentSongTree.kdTreeSearch(
                  "neighbors", 5, currentSong, new DistanceSorter(currentSong), new HashSet<>());
          // System.out.println(connectionsQueue.toString());
          String[] connections = new String[5];
          int i = 0;
          for (Song song : connectionsQueue) {
            connections[i] = song.getUserId();
            i++;
          }
          user.setConnections(connections);
        });
  }

  /** Loads historical connections into each User object using kd-tree */
  public void loadHistoricalConnections() {
    this.users.forEach(
        (username, user) -> {
          PriorityQueue<User> connectionsQueue =
              this.userTree.kdTreeSearch(
                  "neighbors", 5, user, new DistanceSorter(user), new HashSet<>());
          String[] connections = new String[5];
          int i = 0;
          for (User usr : connectionsQueue) {
            connections[i] = usr.getUserId();
            i++;
          }
          user.setHistoricalConnections(connections);
        });
  }
}
