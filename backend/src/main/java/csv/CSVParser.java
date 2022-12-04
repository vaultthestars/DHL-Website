package csv;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Class representing a CSV parser that creates Objects of type T from given rows. If no creator is
 * given, the default creator returns a List of Strings to represent a row.
 *
 * @param <T> object to be created from each row
 */
public class CSVParser<T> {

  private String[] columnTitles;
  private final Reader reader;
  private final CreatorFromRow<T> creator;
  private final List<T> parsedData;
  private int wordCount = 0;
  private int charCount = 0;
  private int rowCount = 0;
  private int columnCount = 0;

  /**
   * Constructor with only an input reader.
   *
   * @param reader - any object which extends Reader
   */
  public CSVParser(Reader reader) throws IOException, FactoryFailureException {
    this.reader = reader;
    this.creator = (CreatorFromRow<T>) new defaultCreator();
    this.parsedData = this.parse();
  }

  /**
   * Constructor with input reader and creator for developers to dictate creating from each row.
   *
   * @param reader - any Reader object
   * @param creator - any object which implements CreatorFromRow
   */
  public CSVParser(Reader reader, CreatorFromRow<T> creator)
      throws IOException, FactoryFailureException {
    this.reader = reader;
    this.creator = creator;
    this.parsedData = this.parse();
  }

  /**
   * Private method to parse the CSV data in the provided Reader object, which is called in the
   * constructor. Stores columnTitles, calculates row, word, character, and column count, and stores
   * these values in their respective fields for easy retrieval.
   *
   * @return - a List, where each element in the List represents a row's data, created into type T
   *     according to the given creator. If no creator is given, a defaultCreator is used, where
   *     each row is represented as a List of Strings.
   */
  public List<T> parse() throws IOException, FactoryFailureException {
    List<T> parsed = new ArrayList<>();
    BufferedReader br = new BufferedReader(this.reader);

    String columns = "";
    if ((columns = br.readLine()) != null) {
      this.columnTitles = columns.split(",");
      this.columnCount = this.getColumnTitles().length;
    } else {
      this.columnTitles = new String[] {};
    }

    String row = "";
    while ((row = br.readLine()) != null) {
      this.rowCount++;

      String[] words = row.split("[\\s,]+");
      for (String word : words) {
        if (!word.isEmpty()) {
          this.wordCount++;
          this.charCount += word.length();
        }
      }
      List<String> rowList = Arrays.asList(row.split(","));
      T datum = this.creator.create(rowList);
      parsed.add(datum);
    }

    br.close();
    return parsed;
  }

  /**
   * Gets the parsed data in the proper form according to the creator.
   *
   * @return a List of Objects created according to the creator.
   */
  public List<T> getParsedData() {
    return new ArrayList<>(this.parsedData);
  }

  /**
   * Gets the column titles from the csv.
   *
   * @return an Array of Strings where each element is a column title.
   */
  public String[] getColumnTitles() {
    return this.columnTitles;
  }

  /**
   * Gets the word count.
   *
   * @return an integer representing the word count.
   */
  public int getWordCount() {
    return this.wordCount;
  }

  /**
   * Gets the character count.
   *
   * @return an integer representing the character count.
   */
  public int getCharCount() {
    return this.charCount;
  }

  /**
   * Gets the row count.
   *
   * @return an integer representing the row count.
   */
  public int getRowCount() {
    return this.rowCount;
  }

  /**
   * Gets the column count.
   *
   * @return an integer representing the column count.
   */
  public int getColumnCount() {
    return this.columnCount;
  }

  /** Prints the word, character, row, and column counts. */
  public void printCounts() {
    System.out.println("Words: " + this.getWordCount());
    System.out.println("Characters: " + this.getCharCount());
    System.out.println("Rows: " + this.getRowCount());
    System.out.println("Columns: " + this.getColumnCount());
  }
}
