import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import Homepage from './Homepage'
import './styles/App.css';
import Animationpage from './pages/animation';

//THINGS YOU NEED TO RUN: npm install (usually only when cloning for the first time), npm run start
//TODO: Reorganize code. Move calculations into App, do rendering in graphvis.

export type pagesetter = React.Dispatch<React.SetStateAction<number>>

type pagebutton = {name: string, page: (timer: number, setter: pagesetter)=>{}}

export const pages = [{name: "MUSIC", page: Animationpage},
{name: "ANIMATION", page: Animationpage},
{name: "DESMOS", page: Animationpage}]

function returnpage(currpage: number, timer: number, setter: pagesetter): JSX.Element{
  if(currpage == 0){
    return Homepage(timer, setter)
  } 
  else{
    return pages[currpage-1].page(timer, setter)
  }
}

function App() {
  // A global timer variable that loops from 0 to 1. Used for onscreen animations.
  const [Timer, setTimer] = useState<number>(0)
  const [Currpage, setCurrpage] = useState<number>(0)
  // If the page is 0, we go to the home page.

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
      {returnpage(Currpage, Timer, setCurrpage)}
    </div>
  );
}

export default App;
