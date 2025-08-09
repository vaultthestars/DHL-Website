import React, { useState, Dispatch, SetStateAction, useEffect, useCallback, JSX } from 'react';
import Homepage from './Homepage'
import './styles/App.css';
import Animationpage from './pages/animation';
import Desmospage from './pages/desmos';
import musicpage from './pages/musicpage';
import Writing from './pages/writing';
import Aboutpage from './pages/aboutpage';
import { Analytics } from "@vercel/analytics/react"

export function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>Next.js</title>
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

//THINGS YOU NEED TO RUN: npm install (usually only when cloning for the first time), npm run start
//TODO: Reorganize code. Move calculations into App, do rendering in graphvis.

type point = {x: number, y: number}
export type pagesetter = React.Dispatch<React.SetStateAction<number>>
export type reactvar = {var: any, setter: React.Dispatch<React.SetStateAction<any>>}
type pagebutton = {name: string, page: (timer: number, setter: pagesetter, mouse: point, extravars: reactvar[])=>{}}

export const pages = [{name: "MUSIC", page: musicpage},
{name: "ANIMATION", page: Animationpage},
{name: "DESMOS", page: Desmospage},
{name: "WRITING", page: Writing},
{name: "ABOUT", page: Aboutpage}]

function returnpage(currpage: number, timer: number, setter: pagesetter, mouse: point, extravars: reactvar[]): JSX.Element{
  if(currpage == 0){
    return Homepage(timer, setter, mouse)
  } 
  else{
    return pages[currpage-1].page(timer, setter, mouse, extravars)
    //HERE: Only return pages 1 through 4!
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

function clamp0(x: number){
  if(x<0){
    return 0
  }
  return x
}

function clamplr(x: number, l: number, r: number){
  if(x < l){
    return l;
  }
  else if(x > r){
    return r;
  }
  return x;
}

export const arrsize = 200;

//1 = alive 0 = dead 2 = dying 3 = dying

function conway(cellvals: Array<number>){
  let cellsum = 0;
  return Array.from(Array(arrsize*arrsize).keys()).map((i) => {
    cellsum = 0;
    const xpos = i%arrsize;
    const ypos = Math.floor(i/arrsize);

    //For the below to be effective, it needs to move around a bit. Or only do the stamp thing every few counts.
    const currcell = cellvals[i];
    if(currcell == 2){
      return 3; //Are you dying?
    }
    else if(currcell == 3){
      return 0; //Are you dying?
    }
    else{
       //You are either living or dead.
        
      for(let x = -1; x < 2; x++){
        for(let y = -1; y < 2; y++){
          if(!((x == 0) && (y == 0))){
            const thiscell = cellvals[clamplr(i + x + arrsize*y , 0, cellvals.length-1)]
            if(thiscell == 1){
              cellsum = cellsum + 1;
            }
          }
        }
      }
      //Are you dead?
      if(currcell == 0){
        if(cellsum == 2){
          return 1;
        }
        else{
          return 0;
        }
      }
      else{
        //You must be alive
        if((cellsum < 3)||(cellsum > 5)){
          return 2;
        }
        else{
          return 1;
        }
      }
    }
    // return Math.floor(Math.random()*2)
  })
}

function App() {

  // A global timer variable that loops from 0 to 1. Used for onscreen animations.
  const [Timer, setTimer] = useState<number>(0)
  const [Currpage, setCurrpage] = useState<number>(0)
  const [mousePosition,setMousePosition] = React.useState({ x: null, y: null });
  const [currtab,setcurrtab] = React.useState<number>(0);
  const [t0,sett0] = React.useState<number>(0);
  const [musictab, setmusictab] = useState<number>(0) 
  const [cellvals, setcellvals] = React.useState<Array<number>>(Array.from(Array(arrsize*arrsize).keys()).map((num) => {return Math.floor(Math.random()*2)}));
  
  const othervars: reactvar[] = [{var: currtab, setter: setcurrtab},{var: t0, setter: sett0}, {var: musictab, setter: setmusictab}, {var: cellvals, setter: setcellvals}]
  // If the page is 0, we go to the home page.

  // A number denoting the speed at which circles move on screen.
  const updateMousePosition = (ev: { clientX: any; clientY: any; }) => {
    setMousePosition({ x: ev.clientX, y: ev.clientY });
  };

  useEffect(() => {
    if(Currpage == 0 || Currpage == 1 || Currpage == 3){
      window.addEventListener('mousemove', updateMousePosition);
    }
    //Do we have to remove this later? idk it isn't causing issues for now
    const interval = setInterval(() => {
      // Increase the Timer variable regardless of what's going on, since we have animations in all cases
      setTimer((Timer + 0.001) % 1)
      sett0(t0b(t0,currtab)) 
      // console.log("opacival: "+document.documentElement.style.getPropertyValue('--opacival'));
      if(Currpage == 5){
        setcellvals(conway(cellvals));
      }

    }
    , 10);
     return () => {clearInterval(interval);
      if(Currpage == 0 || Currpage == 1 || Currpage == 3){
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
