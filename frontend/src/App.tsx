import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import GraphVis from './GraphVis'
import logo from './logo.svg';
import './styles/App.css';
import {firebaseConfig} from './private/firebaseconfig'
import * as d3 from 'd3';
import { signInWithGoogle } from './GoogleLogin';
import { SpotifyLoginButton} from './SpotifyAuth';
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore"; 
import { initializeApp } from "firebase/app";


function App() {
  const [CurrentGoogleUser, SetCurrentGoogleUser] = useState("");
  const [spotifyLinked, setspotifyLinked] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if(CurrentGoogleUser != ""){
        if(!spotifyLinked){
          checkSpotifyLinked().then((result)=>{
            if(result != undefined){
            setspotifyLinked(result);
            }
          });
        }
      }
    }
    , 1000);
     return () => clearInterval(interval);
})

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
    // check if the user's Spotify is linked
  
  async function checkSpotifyLinked() {
    // console.log("HEEYYYY")
    // console.log(CurrentGoogleUser)
    const localUID = localStorage.getItem("UID")
    if (localUID != null) {
      let userDoc = await getDoc(doc(db, "users", localUID))
      let data = userDoc.data()
      // console.log(data)
      // console.log("HIHJIJIHIHIEHRIHE")
      // if the user exists
      if (data != undefined) {

        // if the user spotify is linked
        if (data["refreshToken"] != "" && data["refreshToken"] != undefined) {
          // console.log("there is a refresh token")
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

  function hidebutton(): string{
    if(spotifyLinked || CurrentGoogleUser == ""){
      return "hidden"
    }
    else{
      return "spotifybutton"
    }
  }

  return (
    <div className="App">
      <p className="App-header">
      {CurrentGoogleUser}
      {(CurrentGoogleUser == "") && 
      <button className="google-button" onClick = {()=>{let x = signInWithGoogle(SetCurrentGoogleUser)}}>Sign in With Google</button>}
      <img className = "tuneinlogo" src="https://i.ibb.co/rFTJDTr/tuneinlogo2.png"/>
      </p>
      {/* NOTE: Currently I'm pretending the user is automatically logged in for testing purposes*/}
      {GraphVis(CurrentGoogleUser,spotifyLinked)}
      {/* {GraphVis("HELLO I AM A USER",true)} */}
      <div className = {hidebutton()}>
        <SpotifyLoginButton clientId={"213450855ac44f5aa842c2359939fded"} 
        redirectUri={'http://localhost:3000/callback/'} 
        clientSecret = {'9771ae6d19724806b33c585b57068127'} 
        setUser2 = {SetCurrentGoogleUser} 
        spotifyLinked = {spotifyLinked}
        setspotifyLinked = {setspotifyLinked}
        />
      </div>
      <p>{"Google id: " + CurrentGoogleUser}</p>
      <p>{"Spotify status: " + spotifyLinked}</p>
    </div>
  );
}

export default App;
