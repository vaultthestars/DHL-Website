package user;

import java.util.List;

public class Song {

  private String title;
  private String id;
  private List<String> artists;
  private float[] features;

  public Song(String title, String id, List<String> artists, float[] features) {
    this.title = title;
    this.id = id;
    this.artists = artists;
    this.features = features;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public List<String> getArtists() {
    return artists;
  }

  public void setArtists(List<String> artists) {
    this.artists = artists;
  }

  public float[] getFeatures() {
    return features;
  }

  public void setFeatures(float[] features) {
    this.features = features;
  }
}
