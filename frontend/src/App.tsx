import React from 'react';
import GraphVis from './GraphVis'
import logo from './logo.svg';
import './styles/App.css';
import * as d3 from 'd3';
import { signInWithGoogle } from './GoogleLogin';
import { SpotifyLoginButton } from './SpotifyAuth';


function App() {
  return (
    <div className="App">
      <p className="App-header">
      <button className="google-button" onClick = {signInWithGoogle}>Sign in With Google</button>
        tunein
      </p>      
      <SpotifyLoginButton clientId={"213450855ac44f5aa842c2359939fded"} redirectUri={'http://localhost:3000/callback/'} clientSecret = {'9771ae6d19724806b33c585b57068127'} />
      <GraphVis />
      {/* <Terminal /> */}
    </div>
  );
}

export default App;
