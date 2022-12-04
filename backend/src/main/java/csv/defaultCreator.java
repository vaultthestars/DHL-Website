package csv;

import java.util.ArrayList;
import java.util.List;

public class defaultCreator implements CreatorFromRow<List<String>> {

  @Override
  public List<String> create(List<String> row) {
    return new ArrayList<>(row);
  }
}
