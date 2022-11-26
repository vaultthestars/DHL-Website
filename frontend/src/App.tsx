import React from 'react';
import GraphVis from './GraphVis'
import logo from './logo.svg';
import './styles/App.css';
import * as d3 from 'd3';

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
