import React from 'react';
import GraphVis from './GraphVis'
import logo from './logo.svg';
import './styles/App.css';

function App() {
  return (
    <div className="App">
      <p className="App-header">
        Welcome to our super cool terminal app!
      </p>
      <GraphVis />
      {/* <Terminal /> */}
    </div>
  );
}

export default App;
