package database;

import java.util.List;
import user.User;

public interface UserDatabase {

  User getUser(String userId);

  void updateUser(String userId, User user);

  List<String> getAllUserIds();

//  void deleteUser(User user);
//
//  void registerUser(User user);
}
