package server.handlers;

import com.squareup.moshi.JsonAdapter;
import com.squareup.moshi.Moshi;
import java.io.BufferedWriter;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.UnsupportedEncodingException;
import java.util.ArrayList;
import java.util.List;
import server.handlers.GetUserHandler.GetUserSuccessResponse;
import song.RandomSongGenerator;
import spark.Request;
import spark.Response;
import spark.Route;
import user.Song;

public class GetRandomSongsHandler implements Route {

  @Override
  public Object handle(Request request, Response response) throws Exception {
    String numSongs = request.queryParams("n");
    int n = Integer.parseInt(numSongs);

    RandomSongGenerator generator = new RandomSongGenerator();
    List<Song> songs = new ArrayList<>();
    for (int i = 0; i < n; i++) {
      Song song = generator.getRandomSong();
      songs.add(song);
    }
    this.convertToCSV(songs);
    return new GetRandomSongsSuccessResponse(songs).serialize();
  }

  public record GetRandomSongsSuccessResponse(String result, List<Song> songs) {

    public GetRandomSongsSuccessResponse(List<Song> songs) { this("success", songs); }

    public String serialize() {
      try {
        Moshi moshi = new Moshi.Builder().build();

        JsonAdapter<GetRandomSongsSuccessResponse> adapter = moshi.adapter(GetRandomSongsSuccessResponse.class);
        return adapter.toJson(this);
      } catch (Exception e) {
        e.printStackTrace();
        throw e;
      }
    }
  }

  String CSV_SEPARATOR = ",";
  private void convertToCSV(List<Song> songs) {
    for (Song song : songs) {
      StringBuffer oneLine = new StringBuffer();
      oneLine.append(song.getTitle());
      oneLine.append(CSV_SEPARATOR);
      oneLine.append(song.getId());
      oneLine.append(CSV_SEPARATOR);

      List<String> artists = song.getArtists();
      StringBuilder artistStr = new StringBuilder();
      for (String artist : artists) {
        if (artistStr.length() == 0) {
          artistStr.append(artist);
        } else {
          artistStr.append(";").append(artist);
        }
      }
      oneLine.append(artistStr.toString());
      oneLine.append(CSV_SEPARATOR);

      double[] features = song.getFeatures();
      StringBuilder featuresStr = new StringBuilder();
      for (double val : features) {
        if (featuresStr.length() == 0) {
          featuresStr.append(String.valueOf(val));
        } else {
          featuresStr.append(";").append(String.valueOf(val));
        }
      }
      oneLine.append(featuresStr.toString());
      System.out.println(oneLine.toString());
    }
  }
}
