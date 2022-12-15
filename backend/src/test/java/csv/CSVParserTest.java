package csv;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.IOException;
import java.io.Reader;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import user.Song;
import user.User;
import user.UserFactory;

public class CSVParserTest {

  private Reader testFileReader;
  private CSVParser testParser;

  /** Sets the testParser for the basic csv case. */
  public void setBasicCase() throws IOException, FactoryFailureException {
    try {
      this.testFileReader = new FileReader("data/testing/test-basic.csv");
    } catch (FileNotFoundException e) {
      throw new RuntimeException(e);
    }
    this.testParser = new CSVParser(this.testFileReader);
  }

  /** Sets the testParser for the empty csv case. */
  public void setEmptyCase() throws IOException, FactoryFailureException {
    try {
      this.testFileReader = new FileReader("data/testing/test-empty.csv");
    } catch (FileNotFoundException e) {
      throw new RuntimeException(e);
    }
    this.testParser = new CSVParser(this.testFileReader);
  }

  /**
   * Sets the testParser for the missing fields csv case, where some rows may have missing fields.
   */
  public void setMissingFieldsCase() throws IOException, FactoryFailureException {
    try {
      this.testFileReader = new FileReader("data/testing/test-missing-fields.csv");
    } catch (FileNotFoundException e) {
      throw new RuntimeException(e);
    }
    this.testParser = new CSVParser(this.testFileReader);
  }

  /**
   * Sets the testParser for the case where some values may have spaces (e.g. first and last names).
   */
  public void setWithSpacesCase() throws IOException, FactoryFailureException {
    try {
      this.testFileReader = new FileReader("data/testing/test-with-spaces.csv");
    } catch (FileNotFoundException e) {
      throw new RuntimeException(e);
    }
    this.testParser = new CSVParser(this.testFileReader);
  }

  /** Sets the testParser with a StringReader as input to the constructor. */
  public void setTestParserStringReader() throws IOException, FactoryFailureException {
    StringReader sr =
        new StringReader(
            """
        Name,Age,Sex
        Joe,12,Male
        Sue,1,Female
        Derek,17,Male
        Quinn,20,Female""");
    this.testParser = new CSVParser<>(sr);
  }

  //  /** Sets the testParser with a StarFactory as a second input to the constructor. */
  //  public void setWithStarCreator() throws IOException, FactoryFailureException {
  //    try {
  //      this.testFileReader = new FileReader("data/stars/ten-star.csv");
  //    } catch (FileNotFoundException e) {
  //      throw new RuntimeException(e);
  //    }
  //    this.testParser = new CSVParser<>(this.testFileReader, new StarFactory());
  //  }

  /**
   * Sets the testParser with a UserFactory as a second input to the constructor.
   *
   * @throws IOException if an I/O Exception occurs
   * @throws FactoryFailureException if a Factory Failure Exception occurs
   */
  public void setWithUserFactory() throws IOException, FactoryFailureException {
    try {
      this.testFileReader = new FileReader("data/mockUsers.csv");
    } catch (FileNotFoundException e) {
      throw new RuntimeException(e);
    }
    this.testParser = new CSVParser<User>(this.testFileReader, new UserFactory());
  }

  /**
   * Tests the expected parsed data, counter values, and column titles on the basic csv test file.
   */
  @Test
  public void testBasicCase() throws IOException, FactoryFailureException {
    setBasicCase();

    ArrayList<List<String>> expectedData = new ArrayList<>();
    expectedData.add(List.of("Joe", "12", "Male"));
    expectedData.add(List.of("Sue", "1", "Female"));
    expectedData.add(List.of("Derek", "17", "Male"));
    expectedData.add(List.of("Quinn", "20", "Female"));
    assertEquals(expectedData, this.testParser.getParsedData());

    assertEquals(12, this.testParser.getWordCount());
    assertEquals(43, this.testParser.getCharCount());
    assertEquals(4, this.testParser.getRowCount());
    assertEquals(3, this.testParser.getColumnCount());

    String[] expectedColumns = new String[] {"Name", "Age", "Sex"};
    assertArrayEquals(expectedColumns, this.testParser.getColumnTitles());
  }

  /**
   * Tests the expected parsed data, counter values, and column titles on the empty csv test file.
   */
  @Test
  public void testEmptyCase() throws IOException, FactoryFailureException {
    setEmptyCase();
    ArrayList<List<String>> expected = new ArrayList<>();

    assertEquals(expected, this.testParser.getParsedData());
    assertEquals(0, this.testParser.getWordCount());
    assertEquals(0, this.testParser.getCharCount());
    assertEquals(0, this.testParser.getRowCount());
    assertEquals(0, this.testParser.getColumnCount());

    String[] expectedColumns = new String[] {};
    assertArrayEquals(expectedColumns, this.testParser.getColumnTitles());
  }

  /**
   * Tests the expected parsed data, counter values, and column titles on the csv test file with
   * missing fields.
   */
  @Test
  public void testMissingFieldsCase() throws IOException, FactoryFailureException {
    setMissingFieldsCase();

    ArrayList<List<String>> expectedData = new ArrayList<>();
    expectedData.add(List.of("Joe", "12", "Male"));
    expectedData.add(List.of("", "1", "Female"));
    expectedData.add(List.of("Derek", "", "Male"));
    expectedData.add(List.of("Quinn", "20", "Female"));
    assertEquals(expectedData, this.testParser.getParsedData());

    assertEquals(10, this.testParser.getWordCount());
    assertEquals(38, this.testParser.getCharCount());
    assertEquals(4, this.testParser.getRowCount());
    assertEquals(3, this.testParser.getColumnCount());
  }

  /**
   * Tests the expected parsed data, counter values, and column titles on the csv test file with
   * spaces.
   */
  @Test
  public void testWithSpacesCase() throws IOException, FactoryFailureException {
    setWithSpacesCase();

    ArrayList<List<String>> expectedData = new ArrayList<>();
    expectedData.add(List.of("Joe Anderson", "12", "Male"));
    expectedData.add(List.of("Sue", "1", "Female"));
    expectedData.add(List.of("Derek Smith", "17", "Male"));
    expectedData.add(List.of("Quinn", "20", "Female"));
    assertEquals(expectedData, this.testParser.getParsedData());

    assertEquals(14, this.testParser.getWordCount());
    assertEquals(56, this.testParser.getCharCount());
    assertEquals(4, this.testParser.getRowCount());
    assertEquals(3, this.testParser.getColumnCount());

    String[] expectedColumns = new String[] {"Name", "Age", "Sex"};
    assertArrayEquals(expectedColumns, this.testParser.getColumnTitles());
  }

  /**
   * Tests the expected parsed data, counter values, and column titles from a StringReader input.
   */
  @Test
  public void testStringReaderCase() throws IOException, FactoryFailureException {
    setTestParserStringReader();

    ArrayList<List<String>> expectedData = new ArrayList<>();
    expectedData.add(List.of("Joe", "12", "Male"));
    expectedData.add(List.of("Sue", "1", "Female"));
    expectedData.add(List.of("Derek", "17", "Male"));
    expectedData.add(List.of("Quinn", "20", "Female"));
    assertEquals(expectedData, this.testParser.getParsedData());

    assertEquals(12, this.testParser.getWordCount());
    assertEquals(43, this.testParser.getCharCount());
    assertEquals(4, this.testParser.getRowCount());
    assertEquals(3, this.testParser.getColumnCount());

    String[] expectedColumns = new String[] {"Name", "Age", "Sex"};
    assertArrayEquals(expectedColumns, this.testParser.getColumnTitles());
  }
<<<<<<< HEAD
  //
  //  /** Tests userFactory from csv data. */
  //  @Test
  //  public void testUsersCase() throws IOException, FactoryFailureException {
  //    setWithUserFactory();
  //
  //    User firstUser =
  //        new User(
  //            "bradleywiseman",
  //            2,
  //            new float[] {
  //              (float) 0.39, (float) 0.17, (float) 0.63, (float) 0.48, (float) 0.95, (float) 0.92
  //            },
  //            new String[] {"star22", "max", "maria.t7", "pablo365", "musicluv3r"},
  //            new float[] {
  //              (float) 0.62, (float) 0.40, 0.00F, (float) 0.05, (float) 0.39, (float) 0.34
  //            },
  //            new String[] {"will.smith", "harry_styles", "pablo365", "maria.t7",
  // "bradleywiseman"});
  //    assertEquals(firstUser, this.testParser.getParsedData().get(0));
  //    assertEquals(14, this.testParser.getParsedData().size());
  //    String[] expectedColumns =
  //        new String[] {
  //          "username",
  //          "membershipLength",
  //          "songPoint",
  //          "connections",
  //          "historicalSongPoint",
  //          "historicalConnections"
  //        };
  //    assertArrayEquals(expectedColumns, this.testParser.getColumnTitles());
  //  }
=======

  /** Tests userFactory from csv data. */
  @Test
  public void testUsersCase() throws IOException, FactoryFailureException {
    setWithUserFactory();

    Song firstUserSong = new Song("Blade of Flame", "z7w9sLpW5s",
        new ArrayList<String>(List.of("Morgan", "Luiz")),
        new float[] {
              (float) 0.39, (float) 0.17, (float) 0.63, (float) 0.48, (float) 0.95, (float) 0.92
            },
        "bradleywiseman");

    User firstUser =
        new User(
            "bradleywiseman",
            2,
            firstUserSong,
            new String[] {"star22", "max", "maria.t7", "pablo365", "musicluv3r"},
            new float[] {
              (float) 0.62, (float) 0.40, 0.00F, (float) 0.05, (float) 0.39, (float) 0.34
            },
            new String[] {"will.smith", "harry_styles", "pablo365", "maria.t7", "bradleywiseman"});
    assertEquals(firstUser, this.testParser.getParsedData().get(0));
    assertEquals(14, this.testParser.getParsedData().size());
    String[] expectedColumns =
        new String[] {
          "username",
          "membershipLength",
            "songTitle",
            "songId",
            "songArtists",
          "songPoint",
          "connections",
          "historicalSongPoint",
          "historicalConnections"
        };
    assertArrayEquals(expectedColumns, this.testParser.getColumnTitles());
  }
>>>>>>> 443c7ff683a3e8f3d83931b0f26e6cb1e1ad5527

  //
  //  /** Testing exceptions */
  //  @Test
  //  public void testExceptions() {
  //    assertThrows(IOException.class, () -> new CSVParser<>(new FileReader("phone-numbers.csv")));
  //    assertThrows(
  //        FactoryFailureException.class,
  //        () -> new CSVParser<>(new FileReader("data/testing/test-basic.csv"), new
  // StarFactory()));
  //  }
}
