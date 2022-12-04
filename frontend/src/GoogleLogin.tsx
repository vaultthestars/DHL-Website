import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'


// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAGp8uTjHb6-vxrlbdM5QzFYA69Se9OPeA",
  authDomain: "test-tunedin.firebaseapp.com",
  projectId: "test-tunedin",
  storageBucket: "test-tunedin.appspot.com",
  messagingSenderId: "619555539594",
  appId: "1:619555539594:web:9869f144517a225d543b73",
  measurementId: "G-9PLN5MP4W9"
};


// Initialize Firebase & Google Provider 
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app); // can be used to get who's currently authenticated
const provider = new GoogleAuthProvider();

// Sign-In function
export const signInWithGoogle = () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            console.log(result);
            const displayName = result.user.displayName;
            if(displayName !== null){
                localStorage.setItem("name", displayName);
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

// TODO: Write a logout function 

}
