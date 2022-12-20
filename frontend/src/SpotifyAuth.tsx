/**
 * step 1: user clicks log in button, which makes a call to spotify to 
 *        get an authentication code. navigating them to the permissions page,
 *        if they accept, you get redirected back to your page with an extra piece 
 *        of code at the end of the URL i.e. localhost:3000/code=EWBEBKBEKBBBEr
 * step 2: need to access that string, saving it, then send ANOTHER request to the API
 *        this time without redirecting user, that provides the code plus a bunch of 
 *        our app info like clientID and clientSecret etc, and THIS is what will return
 *        a JSON containing access token and refresh token
 * step 3: save the refresh token to firebase under the person's google acct
 * step 4: when you want to do stuff, use the refresh token to get a new auth token
 *         and go to town. the refresh token does NOT expire.
 */

import * as React from 'react';
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore"; 
import { initializeApp } from "firebase/app";
import { convertCompilerOptionsFromJson } from 'typescript';
import { render } from '@testing-library/react';
import {firebaseConfig} from './private/firebaseconfig'

interface SpotifyLoginButtonProps {
  clientId: string;
  redirectUri: string;
  clientSecret: string;
  setUser2: Function;
  spotifyLinked: boolean;
  setspotifyLinked: Function;
  setusersloaded: Function;
  setfetchingusers: Function
}

const app = initializeApp(firebaseConfig);
// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

export const SpotifyLoginButton: React.FC<SpotifyLoginButtonProps> = (parameters) => {
  const { clientId, redirectUri, clientSecret, setUser2, spotifyLinked, setspotifyLinked, setusersloaded, setfetchingusers} = parameters;
  
  let refreshToken: string = "";
  let accessToken: string = "";

  const handleClick = () => {
    const url = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=user-read-private%20user-read-email%20user-read-currently-playing%20user-read-recently-played&redirect_uri=${redirectUri}`;
    // "scope=user-read-private%20user-read-email%20user-read-currently-playing%20user-read-recently-played%20user-read-playback-state&"
    // go to the url
    window.location.replace(url);
  };

  const onSuccess = async (refreshToken: string, accessToken: string) => {
    console.log("new user registered with access token " + accessToken + " and refresh token " + refreshToken)
    setfetchingusers(false)
    setusersloaded(false)
  };

  const onFailure = (error: string) => {
    // Handle the error
    console.error(error);
  };

  const getTokens = () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    // console.log(code)
    // Use the code to get the refresh and access tokens
    const url = `https://accounts.spotify.com/api/token`;
    const base64ClientIdAndSecret = btoa(`${clientId}:${clientSecret}`)
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64ClientIdAndSecret}`,
        'Content-Type':'application/x-www-form-urlencoded'
      },
      body: `grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}`,
    };

    fetch(url, options)
      .then((response) => response.json()
      .then((data) => {
        if (refreshToken == "" && refreshToken != undefined) {
          refreshToken = data.refresh_token;
        }
        let iNSERT_UID_HERE = localStorage.getItem("UID");
        if (iNSERT_UID_HERE != null) {
          setDoc(doc(db, "users", iNSERT_UID_HERE), {
            refreshToken: refreshToken,
          }, { merge: true }); 
          localStorage.setItem("spotify", iNSERT_UID_HERE)
          // console.log("setting local storage and google user to be " + iNSERT_UID_HERE)
          setUser2(iNSERT_UID_HERE)
        }
        if (accessToken == "" && accessToken != undefined) {
          accessToken = data.access_token;}
        // console.log("refresh")
        // console.log("LOOK AT THIS IT IS A REFREH TOKEN OMFG" + refreshToken)
        // console.log("access")
        // console.log("accessToken IS RIGHT HERE" + accessToken)
        onSuccess(refreshToken, accessToken);
      }))
      .catch((error) => {
        //onFailure(error);
      });
  };



  let localUID = localStorage.getItem("UID");

  const xval = 10;
  const yval = 5;

  if ((localStorage.getItem("spotify") != "" && localStorage.getItem("spotify") != null) || spotifyLinked ) {
    setspotifyLinked(true)
    // console.log("local storage exists and so we are setting it to be" + localStorage.getItem("spotify") + " and not " + localStorage.getItem("UID"))
    setUser2(localStorage.getItem("UID"))
    return (
      <p></p>
    )
  } else if (localUID != null && spotifyLinked == false) {
    getTokens()
    return (
      //Here is where the styling will go
      <svg width = "220" height = "50">
        <rect className="spotifybuttonbackground"
        width = "200"
        height = "40"
        rx="5"
        ry="5"
        x = {xval.toString()}
        y = {yval.toString()}
        onClick={handleClick}
        />
        <text className="blacktext" x= {(xval+6).toString()} y= {(yval+25).toString()}
        onClick = {handleClick}> 
        Link TunedIn with Spotify </text>
      </svg>
      // <button onClick={handleClick}>Link TunedIn with Spotify</button>
    );
  } else {
    return (
      <p>state1</p>
    )
  }

};
