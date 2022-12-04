package csv;

import java.util.List;

/**
 * Creates an object of type T from a List of Strings.
 *
 * @param <T> object to be created
 */
public interface CreatorFromRow<T> {
  T create(List<String> row) throws FactoryFailureException;
}
