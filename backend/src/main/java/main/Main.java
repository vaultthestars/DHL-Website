package edu.brown.cs.student.main;

import edu.brown.cs.student.csv.CSVParser;
import edu.brown.cs.student.csv.FactoryFailureException;
import edu.brown.cs.student.kdtree.DistanceSorter;
import edu.brown.cs.student.kdtree.KdTree;
import edu.brown.cs.student.stars.GalaxyGenerator;
import edu.brown.cs.student.stars.Star;
import java.io.FileReader;
import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.PriorityQueue;

/** The Main class of our project. This is where execution begins. */
public final class Main {
  /**
   * The initial method called when execution begins.
   *
   * @param args An array of command line arguments
   */
  public static void main(String[] args) {
    new Main(args).run();
  }

  private String[] args;

  private Main(String[] args) {
    this.args = args;
  }

  private void run() {
    // prints out command line arguments; can remove this
    System.out.println("command line args: " + Arrays.toString(args));

    // generates galaxy of stars, computes nearest neighbor for all
    if (args.length == 2 && args[0].equals("generate_galaxy")) {
      int numStars = 0;
      try {
        numStars = Integer.parseInt(args[1]);
      } catch (Exception ignored) {
        System.err.println("ERROR: Could not parse number of stars to generate.");
      }
      List<Star> galaxy = GalaxyGenerator.generate(numStars);
      KdTree<Star> starKdTree = new KdTree<>(galaxy, 0);
      for (Star star : galaxy) {
        PriorityQueue<Star> pq =
            starKdTree.kdTreeSearch(
                "neighbors", 1, star, new DistanceSorter(star), new HashSet<>());
        System.out.println(pq.peek());
      }
    }

    // parses the csv file that is passed as the first argument; prints word, character, row, and
    // column counts
    FileReader testReader;
    try {
      testReader = new FileReader(this.args[0]);
      CSVParser testParser = new CSVParser(testReader);
      System.out.println("Column Titles: " + Arrays.toString(testParser.getColumnTitles()));
      testParser.printCounts();
    } catch (IOException | FactoryFailureException e) {
      System.err.println("ERROR: The file cannot be found or opened.");
    }
  }
}
