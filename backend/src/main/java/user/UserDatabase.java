package user;

import java.util.HashMap;

/**
 * Class representing the complete database of users
 */
public class UserDatabase {

  private HashMap<String,User> users;
  // private HashMap<float[], User> userSongPoints;

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
}
