package user;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import kdtree.KdTreeNode;

public class Song implements KdTreeNode {

  private String userId;
  private String title;
  private String id;
  private List<String> artists;
  private double[] features;
  private int dimension;

  public Song(String userId, String title, String id, List<String> artists, double[] features) {
    this.userId = userId;
    this.title = title;
    this.id = id;
    this.artists = artists;
    this.features = features;
    this.dimension = features.length;
  }

  public String getUserId() {
    return userId;
  }

  public void setUserId(String userId) {
    this.userId = userId;
  }

  public String getTitle() {
    return this.title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getId() {
    return this.id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public List<String> getArtists() {
    return new ArrayList<>(this.artists);
  }

  public void setArtists(List<String> artists) {
    this.artists = artists;
  }

  public double[] getFeatures() {
    return this.features;
  }

  public void setFeatures(double[] features) {
    this.features = features;
  }

  public String getuserId() {
    return this.userId;
  }

  public void setuserId(String userId) {
    this.userId = userId;
  }

  @Override
  public double[] getPoint() {
    return this.getFeatures();
  }

  @Override
  public int getDimension() {
    return this.dimension;
  }

  @Override
  public double euclideanDistance(KdTreeNode node) {
    double[] currentVals = this.getFeatures();
    double[] targetVals = node.getPoint();
    double sum = 0;
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
    if (!(o instanceof Song)) {
      return false;
    }
    Song point1 = (Song) o;
    return this.dimension == point1.getDimension()
        && Arrays.equals(this.getPoint(), point1.getPoint());
  }

  @Override
  public int hashCode() {
    int result = Objects.hash(dimension);
    result = 31 * result + Arrays.hashCode(this.getPoint());
    return result;
  }
}
