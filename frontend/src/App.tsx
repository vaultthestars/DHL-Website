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
  const [usersloaded, setusersloaded] = useState<boolean>(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if(CurrentGoogleUser != ""){
        console.log("there is a google user " + CurrentGoogleUser.toString())
        if(!spotifyLinked){
          console.log("spotify isn't linked")
          checkSpotifyLinked().then((result)=>{
            if(result != undefined){
            setspotifyLinked(result);
            }
          });
        }
      }
      else{
        console.log("no current google user, only " + CurrentGoogleUser.toString())
      }
    }
    , 1000);
     return () => clearInterval(interval);
})

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
    // check if the user's Spotify is linked
  
  async function checkSpotifyLinked() {
    console.log("HEEYYYY")
    console.log(CurrentGoogleUser)
    const localUID = localStorage.getItem("UID")
    if (localUID != null) {
      let userDoc = await getDoc(doc(db, "users", localUID))
      let data = userDoc.data()
      console.log(data)
      // if the user rexists
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

  function hidebutton(): string{
    if(CurrentGoogleUser == ""){
      return "hidden"
    }
    else{
      return "spotifybutton"
    }
  }

  return (
    <div className="App">
      <p className="App-header" aria-label = "App header">
      {/* {CurrentGoogleUser} */}
      {(CurrentGoogleUser == "") && 
      <button className="google-button" onClick = {()=>{let x = signInWithGoogle(SetCurrentGoogleUser)}} aria-label = "Click here to sign in with google">Sign in With Google</button>}
      <img className = "tuneinlogo" src="https://i.ibb.co/rFTJDTr/tuneinlogo2.png" aria-label = "Logo for the tunedin website"/>
      </p>
      {/* NOTE: Currently I'm pretending the user is automatically logged in for testing purposes*/}
      {GraphVis(CurrentGoogleUser,spotifyLinked, usersloaded, setusersloaded)}
      {/* {GraphVis("HELLO I AM A USER",true)} */}
      <div className = {hidebutton()} aria-label = "Click here to log in to spotify">
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
