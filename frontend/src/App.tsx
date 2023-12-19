import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import GraphVis from './GraphVis'
import './styles/App.css';

//TODO: Reorganize code. Move calculations into App, do rendering in graphvis.

function App() {
  // A global timer variable that loops from 0 to 1. Used for onscreen animations.
  const [Timer, setTimer] = useState<number>(0)

  // A number denoting the speed at which circles move on screen.
  const Speed = 10;

  useEffect(() => {
    const interval = setInterval(() => {
      // Increase the Timer variable regardless of what's going on, since we have animations in all cases
      setTimer((Timer + 0.001) % 1)
    }
    , 10);
     return () => clearInterval(interval);
})

  return (
    <div className="App">
      {GraphVis(Timer)}
    </div>
  );
}

export default App;
