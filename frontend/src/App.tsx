import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import Homepage from './Homepage'
import './styles/App.css';
import Animationpage from './pages/animation';

//THINGS YOU NEED TO RUN: npm install (usually only when cloning for the first time), npm run start
//TODO: Reorganize code. Move calculations into App, do rendering in graphvis.

export type pagesetter = React.Dispatch<React.SetStateAction<number>>
export type reactvar = {var: any, setter: React.Dispatch<React.SetStateAction<any>>}
type pagebutton = {name: string, page: (timer: number, setter: pagesetter, extravars: reactvar[])=>{}}

export const pages = [{name: "MUSIC", page: Animationpage},
{name: "ANIMATION", page: Animationpage},
{name: "DESMOS", page: Animationpage}]

function returnpage(currpage: number, timer: number, setter: pagesetter, mouse: {x: number, y: number}, extravars: reactvar[]): JSX.Element{
  if(currpage == 0){
    return Homepage(timer, setter, mouse)
  } 
  else{
    return pages[currpage-1].page(timer, setter, extravars)
  }
}

export function stringtonum(x: any): number{
  if(JSON.stringify(x) == "null"){
      return 0
  }
  else{
      return +x
  }
}

const stepsize = 0.05

function t0b(t0: number, currtab: number){
  if(Math.abs(t0-currtab) < stepsize){
    return currtab
  }
  return t0 + stepsize*Math.sign(currtab-t0)
}


function App() {
  // A global timer variable that loops from 0 to 1. Used for onscreen animations.
  const [Timer, setTimer] = useState<number>(0)
  const [Currpage, setCurrpage] = useState<number>(0)
  const [mousePosition,setMousePosition] = React.useState({ x: null, y: null });
  const [currtab,setcurrtab] = React.useState<number>(0);
  const [t0,sett0] = React.useState<number>(0);
  const othervars: reactvar[] = [{var: currtab, setter: setcurrtab},{var: t0, setter: sett0}]
  // If the page is 0, we go to the home page.

  // A number denoting the speed at which circles move on screen.
  const updateMousePosition = (ev: { clientX: any; clientY: any; }) => {
    setMousePosition({ x: ev.clientX, y: ev.clientY });
  };

  useEffect(() => {
    if(Currpage == 0){
      window.addEventListener('mousemove', updateMousePosition);
    }
    //Do we have to remove this later? idk it isn't causing issues for now
    const interval = setInterval(() => {
      // Increase the Timer variable regardless of what's going on, since we have animations in all cases
      setTimer((Timer + 0.001) % 1)
      sett0(t0b(t0,currtab))
    }
    , 10);
     return () => {clearInterval(interval);
      if(Currpage == 0){
        window.removeEventListener('mousemove', updateMousePosition);
      }}
})
  const mouse = {x: stringtonum(mousePosition.x), y: stringtonum(mousePosition.y)+window.scrollY}
  return (
    <div className="App">
      {returnpage(Currpage, Timer, setCurrpage, mouse, othervars)}
    </div>
  );
}

export default App;
