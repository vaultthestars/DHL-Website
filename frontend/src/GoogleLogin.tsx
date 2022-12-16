import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore"; 
import { SetStateAction } from "react";
import { setSourceMapRange } from "typescript";
import {firebaseConfig} from './private/firebaseconfig'

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Initialize Firebase & Google Provider 
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app); // can be used to get who's currently authenticated
// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Sign-In function
export const signInWithGoogle = (setUser: { (value: SetStateAction<string>): void; (arg0: string): void; }) => {
  let displayName = "";
  signInWithPopup(auth, provider)
    .then(async (result) => {
      // console.log(result);
      if(result.user.displayName != null){
        displayName = result.user.displayName;
        let UID = result.user.uid
        localStorage.setItem("UID", UID);
       //before writing a new user to firebase storage, check if the user id exists yet.
       const docSnap = await getDoc(doc(db, "users", UID))

       if (!docSnap.exists()) {
        await setDoc(doc(db, "users", UID), {
            email: result.user.email,
            connections: "",
            currentSong: {artist: [], dimension: "", features: [], id: "", title: "", userId: UID},
            displayName: displayName,
            historicalConnections: "",
            historicalSongPoint: "",
            membershipLength: 0, 
            userId: UID
        });
    }

        setUser(UID);
      }
      // // This gives you a Google Access Token. You can use it to access the Google API.
      // const credential = GoogleAuthProvider.credentialFromResult(result);
      // const token = credential.accessToken;
      // // The signed-in user info.
      // const user = result.user;
      
    }).catch((error) => {
      console.log(error);
      // // Handle Errors here.
      // const errorCode = error.code;
      // const errorMessage = error.message;
      // // The email of the user's account used.
      // const email = error.customData.email;
      // // The AuthCredential type that was used.
      // const credential = GoogleAuthProvider.credentialFromError(error);
    }); 

}