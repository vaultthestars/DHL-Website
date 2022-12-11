import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import GraphVis from './GraphVis'
import logo from './logo.svg';
import './styles/App.css';
import * as d3 from 'd3';
import { signInWithGoogle } from './GoogleLogin';
import { SpotifyLoginButton } from './SpotifyAuth';
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore"; 
import { initializeApp } from "firebase/app";


function App() {
  const [CurrentGoogleUser, SetCurrentGoogleUser] = useState("");
  const [spotifyLinked, setspotifyLinked] = useState(false);

  useEffect(() => {
    checkSpotifyLinked().then((result)=>{
      if(result != undefined){
      setspotifyLinked(result);
      }
    });
})

  //checkSpotifyLinked

  const firebaseConfig = {
    apiKey: "AIzaSyAGp8uTjHb6-vxrlbdM5QzFYA69Se9OPeA",
    authDomain: "test-tunedin.firebaseapp.com",
    projectId: "test-tunedin",
    storageBucket: "test-tunedin.appspot.com",
    messagingSenderId: "619555539594",
    appId: "1:619555539594:web:9869f144517a225d543b73",
    measurementId: "G-9PLN5MP4W9"
  };
 
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
    // check if the user's Spotify is linked
  
  async function checkSpotifyLinked() {
    console.log("HEEYYYY")
    const localUID = localStorage.getItem("UID")
    if (localUID != null) {
      let userDoc = await getDoc(doc(db, "users", localUID))
      let data = userDoc.data()
      console.log(data)
      console.log("HIHJIJIHIHIEHRIHE")
      // if the user exists
      if (data != undefined) {

        // if the user spotify is linked
        if (data["refreshToken"] != "" && data["refreshToken"] != undefined) {
          console.log("there is a refresh token")
          return true;
          
        // if the user spotify is not linked
        } else {
          console.log("there was no refresh token detected")
          return false;
        }
      
      // if the user does not exist
      } else {
        console.log("this user has not logged into their google account yet")
        return false;
      }
    }
    else{
      console.log("local UID NULL")
    }
  }

  return (
    <div className="App">
      <p className="App-header">
      {(CurrentGoogleUser == "") && <button className="google-button" onClick = {()=>{let x = signInWithGoogle(SetCurrentGoogleUser)}}>Sign in With Google</button>}
      <div className = "spotifybutton">
        <SpotifyLoginButton clientId={"213450855ac44f5aa842c2359939fded"} redirectUri={'http://localhost:3000/callback/'} clientSecret = {'9771ae6d19724806b33c585b57068127'} setUser2 = {SetCurrentGoogleUser} spotifyLinked = {spotifyLinked}/>
      </div>
      <img className = "tuneinlogo" src="https://i.ibb.co/rFTJDTr/tuneinlogo2.png"/>
      </p>      
      <GraphVis />
    </div>
  );
}

export default App;