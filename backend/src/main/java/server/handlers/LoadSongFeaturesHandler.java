package server.handlers;

import com.squareup.moshi.Moshi;
import se.michaelthelin.spotify.SpotifyApi;
import se.michaelthelin.spotify.model_objects.specification.AudioFeatures;
import se.michaelthelin.spotify.requests.data.tracks.GetAudioFeaturesForTrackRequest;
import spark.Request;
import spark.Response;
import spark.Route;
import user.UserDatabase;

public class LoadSongFeaturesHandler implements Route {

  private UserDatabase userDatabase;

  public LoadSongFeaturesHandler(UserDatabase userDatabase) {
    this.userDatabase = userDatabase;
  }

  @Override
  public Object handle(Request request, Response response) throws Exception {
    // TODO: for each user in the database, get their access token from firebase to get the features
    // of their current song
    // write helper that takes refresh token and returns auth token
    // write helper that takes access token and returns song object with title, artist, id &
    // features of current song
    // update song field of user object to contain new song object

    // TODO: proof of concept: retrieve features for 1 song
    String accessToken =
        "BQBK0OpqXlvQ7dMAKaRT7ON6Hv6Z3gzI5DC_XB9TPSTLsPvhbaQWWoU2QUTVOVK78woO29y8RyWXYCThCakOaILUBVCr8lmLA_dnWzFCgWFfFTfNAP_AU3cyQjx3VlgpiDnRQOxn2yhqtGVAyx3dPule_D6LIE9N59doqKVkgoCUNhfBFNXuytiHYVk0_7Nxq49o";
    String id = "4ewazQLXFTDC8XvCbhvtXs";

    SpotifyApi spotifyApi = new SpotifyApi.Builder().setAccessToken(accessToken).build();
    GetAudioFeaturesForTrackRequest getAudioFeaturesForTrackRequest =
        spotifyApi.getAudioFeaturesForTrack(id).build();

    AudioFeatures audioFeatures = getAudioFeaturesForTrackRequest.execute();

    float[] songFeatures = new float[6];
    songFeatures[0] = audioFeatures.getAcousticness();
    songFeatures[1] = audioFeatures.getDanceability();
    songFeatures[2] = audioFeatures.getEnergy();
    songFeatures[3] = audioFeatures.getInstrumentalness();
    songFeatures[4] = audioFeatures.getSpeechiness();
    songFeatures[5] = audioFeatures.getValence();

    return new LoadSongFeaturesSuccessResponse(id, songFeatures).serialize();
  }

  public record LoadSongFeaturesSuccessResponse(String result, String id, float[] features) {

    public LoadSongFeaturesSuccessResponse(String id, float[] features) {
      this("success", id, features);
    }

    String serialize() {
      try {
        Moshi moshi = new Moshi.Builder().build();
        return moshi.adapter(LoadSongFeaturesSuccessResponse.class).toJson(this);
      } catch (Exception e) {
        e.printStackTrace();
        throw e;
      }
    }
  }
}
