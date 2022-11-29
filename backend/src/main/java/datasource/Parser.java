package edu.brown.cs.student.datasource;

import edu.brown.cs.student.csv.FactoryFailureException;
import java.io.IOException;

/** Parses a given type of data format, where U is the type that the data is parsed into. */
public interface Parser<U> {

  /**
   * Parses the given file's data and returns the parsed data in any type (U)
   *
   * @return - the parsed data
   */
  U parse() throws FactoryFailureException, IOException;

  /**
   * Gets the data that has already been parsed and stored.
   *
   * @return - a copy of the parsed data
   */
  U getParsedData();
}
