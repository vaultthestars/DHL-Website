import React from 'react';
import GraphVis from './GraphVis'
import logo from './logo.svg';
import './styles/App.css';
import * as d3 from 'd3';
import {signInWithGoogle} from './GoogleLogin'


function App() {
  return (
    <div className="App">
      <p className="App-header">
      <button className="google-button" onClick = {signInWithGoogle}>Sign in With Google</button>
        TunedIn
      </p>
      
      <GraphVis />
      {/* <Terminal /> */}
    </div>
  );
}

export default App;
