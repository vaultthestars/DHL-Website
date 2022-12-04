package kdtree;

import java.util.Arrays;
import java.util.Objects;

/** Class to represent a simple point in k-dimensional space. */
public class SongPoint implements KdTreeNode {

  private String username;
  private float[] point;
  private int dimension;
  private final int hashNum = 31; // ???

  /**
   * Constructs a point from an array of floats.
   *
   * @param vals array of floats representing a point (i.e. (x,y,z))
   */
  public SongPoint(String username, float[] vals) {
    this.username = username;
    this.point = vals;
    this.dimension = vals.length;
  }

  /**
   * Getter to return the dimension of a given Point.
   *
   * @return integer representing the dimension of a Point.
   */
  public int getDimension() {
    return this.dimension;
  }

  /**
   * Finds euclidean distance between the current node and a given node.
   *
   * @param node The point to find the distance to.
   * @return float The straight line distance.
   */
  public double euclideanDistance(KdTreeNode node) {
    float[] currentVals = this.point;
    float[] targetVals = node.getPoint();
    float sum = 0;
    for (int i = 0; i < currentVals.length; i++) {
      sum += Math.pow(currentVals[i] - targetVals[i], 2);
    }
    return Math.sqrt(sum);
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (!(o instanceof SongPoint)) {
      return false;
    }
    SongPoint point1 = (SongPoint) o;
    return dimension == point1.dimension && Arrays.equals(point, point1.point);
  }

  @Override
  public int hashCode() {
    int result = Objects.hash(dimension);
    result = hashNum * result + Arrays.hashCode(point);
    return result;
  }

  /**
   * Getter to return the point data of a Point.
   *
   * @return array of floats representing a point (i.e. (x,y,z))
   */
  public float[] getPoint() {
    return this.point.clone();
  }

  /**
   * Getter to return the username identifier of a Point
   *
   * @return - string representing the user
   */
  public String getUsername() {
    return this.username;
  }
}
