package user;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import kdtree.KdTreeNode;

public class Song implements KdTreeNode {

  private String title;
  private String id;
  private List<String> artists;
  private float[] features;
  private int dimension;
  private String username;

  public Song(String title, String id, List<String> artists, float[] features, String username) {
    this.title = title;
    this.id = id;
    this.artists = artists;
    this.features = features;
    this.dimension = features.length;
    this.username = username;
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

  public float[] getFeatures() {
    return this.features.clone();
  }

  public void setFeatures(float[] features) {
    this.features = features;
  }

  public String getUsername() {
    return this.username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  @Override
  public float[] getPoint() {
    return this.getFeatures();
  }

  @Override
  public int getDimension() {
    return this.dimension;
  }

  @Override
  public double euclideanDistance(KdTreeNode node) {
    float[] currentVals = this.getFeatures();
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
