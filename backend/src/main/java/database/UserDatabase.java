package database;

import user.User;

public interface UserDatabase {

  User getUser(String userId);

  void updateUser(User user);

//  void deleteUser(User user);
//
//  void registerUser(User user);
}
