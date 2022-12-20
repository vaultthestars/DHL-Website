# README

Samantha Minars (sminars)\
Dylan Lee (dlee197)\
Dani Tamesis (dtamesis)\
Chance Emerson (cemerso3)

**Repository Link:** https://github.com/cs0320-f2022/term-project-cemerso3-dlee197-dtamesis-sminars/

## What is TunedIn?

TunedIn provides a centralized application where users (specifically, college students in our first phase) automatically share the music that they are currently listening to on a given day, and are given the option to see other users that have similar music tastes to theirs as well as discover new music recommendations through peer users. 

The issue that our project attempts to solve is the lack of a good social-media-type application solely for sharing music. We don’t count TikTok, since TikTok is primarily for sharing original video content. Although Spotify has a built-in social display feature, most people use Spotify just for their own music enjoyment and exploration instead of as a medium to connect with other people. We know that this is something people could use because our peers expressed enthusiasm about the project when we’ve asked them about it and we also have all had experiences where music has connected us. This article in particular highlights the importance of music in forming social bonds with others. 

Because of the social-interaction focus of our project, our app may encourage people who do not typically listen to music to begin doing so in order to meet a greater community of people. Our project impacts people regardless of occupation, age, nationality, or racial group, but it definitely is biased towards people who can use the internet, as well as people who are not hearing impaired. In terms of accessibility, the app will likely be in English for the time being, but we may extend it to be more accessible to a wider range of languages in the future. Furthermore, at the beginning stages, this app will exclusively be accessible to college students at schools where we feel we can create enough buzz to start a user base.
Our app will allow anybody to view the most recent TunedIn of other users. They could filter the display in terms of various metrics collected from Spotify as follows:

<b>Acousticness</b> - A confidence measure from 0.0 to 1.0 of whether the track is acoustic. 1.0 represents high confidence the track is acoustic.

<b>Danceability</b>  - Danceability describes how suitable a track is for dancing based on a combination of musical elements including tempo, rhythm stability, beat strength, and overall regularity. A value of 0.0 is least danceable and 1.0 is most danceable.

<b>Energy</b>  - Energy is a measure from 0.0 to 1.0 and represents a perceptual measure of intensity and activity. Typically, energetic tracks feel fast, loud, and noisy. For example, death metal has high energy, while a Bach prelude scores low on the scale. Perceptual features contributing to this attribute include dynamic range, perceived loudness, timbre, onset rate, and general entropy.

<b>Instrumentalness</b>  - Predicts whether a track contains no vocals. "Ooh" and "aah" sounds are treated as instrumental in this context. Rap or spoken word tracks are clearly "vocal". The closer the instrumentalness value is to 1.0, the greater likelihood the track contains no vocal content. Values above 0.5 are intended to represent instrumental tracks, but confidence is higher as the value approaches 1.0.

<b>Speechiness</b>  - Speechiness detects the presence of spoken words in a track. The more exclusively speech-like the recording (e.g. talk show, audio book, poetry), the closer to 1.0 the attribute value. Values above 0.66 describe tracks that are probably made entirely of spoken words. Values between 0.33 and 0.66 describe tracks that may contain both music and speech, either in sections or layered, including such cases as rap music. Values below 0.33 most likely represent music and other non-speech-like tracks.

<b>Valence</b>  - A measure from 0.0 to 1.0 describing the musical positiveness conveyed by a track. Tracks with high valence sound more positive (e.g. happy, cheerful, euphoric), while tracks with low valence sound more negative (e.g. sad, depressed, angry).

Our app will group users with similar music preferences (based on those six metrics) together by calculating a general distance metric between any two users based on their present and historical music data. Finally, our app will provide a beautiful data visualization for our users, displaying each user as a bubble in a vast floating landscape of other users, allowing the user to sort the bubbles (visual clustering) by any category they wish, as well as click on individual bubbles to view the users themselves and their most recent activity. Our project will also form an overall sense of community amongst users via this musical exchange, and hopefully help people discover others who either share their tastes, or enjoy something completely different.

## Design Choices:

There is a frontend and a backend. There is firebase.

## Errors/Bugs:

At this time, there are no known bugs with our program.

## Tests:

### Running tests:

For the backend, enter the backend folder and type `mvn test` in the terminal to run the tests.

For the frontend, enter the frontend folder and type `npm test` in the terminal to run the tests.

## How-To:

### Running the backend server:

Run the server file (our preferred method is to run `Server.main()` in IntelliJ). Then, use a web browser to navigate to `localhost:3232` which is where the server
is locally hosted. There are many different endpoints, some listed below:

```
Examples:

```
### Running the frontend server:

Navigate to the frontend directory. Ensure that all dependencies are installed by running `npm install`, followed by `npm install firebase`. Ensure that the backend is already running on `localhost:3232`. Then, run `npm start` to start the frontend server on `localhost:3000`.


## Assorted Sources:

Spotify API:
https://developer.spotify.com/documentation/web-api/quick-start/
https://stackoverflow.com/questions/39887342/how-can-i-get-an-access-token-spotify-api
https://kaylouisebennett.medium.com/getting-started-with-spotifys-web-api-part-1-cff30c1b23ef
https://dev.to/jpreagan/starting-a-personal-dashboard-with-the-spotify-api-526p
https://medium.com/@davidjtomczyk/spotify-api-authorization-flow-with-react-and-rails-7f42845a43c
https://www.newline.co/search?query=spotify+api&sortBy=positiveReviewCount%3AHighest+Rated%2CnumStudents%3AMost+Popular%2CcreatedAt%3AMost+Recent
https://stackoverflow.com/questions/73737341/spotify-api-refresh-token-doesnt-return-a-token-with-refresh-token
https://stackoverflow.com/questions/68155590/spotify-web-api-giving-me-illegal-scope-no-matter-what
https://developer.spotify.com/documentation/web-api/guides/using-connect-web-api/
https://react-hook-form.com/api/useform/setvalue/
https://developer.spotify.com/documentation/general/guides/authorization/code-flow/
https://khalilstemmler.com/articles/tutorials/getting-the-currently-playing-song-spotify/

Google Login:
[Button CSS Styling](https://codepen.io/mupkoo/pen/YgddgB0)
[Sign-In Functionality](https://firebase.google.com/docs/auth/web/google-signin)


