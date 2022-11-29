package edu.brown.cs.student.datasource;

import java.util.HashMap;

/**
 * Database class that keeps track of the loaded files.
 *
 * @param <U>
 */
public class Database<U> {
  private HashMap<String, U> database;

  private Parser<U> parser;

  private U loadedFile;

  /**
   * Database constructor that instantiates a new HashpMap to maps filepaths to their parsed
   * contents.
   */
  public Database() {
    this.database = new HashMap<>();
    this.parser = null;
    this.loadedFile = null;
  }

  /**
   * Used to set the parser that corresponds to the type of the inputted data
   *
   * @param parser
   */
  public void setParser(Parser<U> parser) {
    this.parser = parser;
  }

  /**
   * Loads files by parsing their contents and adding them to the HashpMap
   *
   * @param fileName - user provided filepath
   */
  public void loadFile(String fileName) {
    U parsedData = this.parser.getParsedData();
    this.loadedFile = parsedData;
    this.database.put(fileName, parsedData);
  }

  /**
   * @return - the most recently loaded file
   */
  public U getMostRecent() {
    return this.loadedFile; // defensive programming taken care of in Parser getParsedData method
  }
}
