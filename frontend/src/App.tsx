import React, { useState, Dispatch, SetStateAction, useEffect, useCallback, JSX, useRef } from 'react';
import Homepage from './Homepage'
import './styles/App.css';
import './styles/responsive.css';
import Animationpage from './pages/animation';
import Desmospage from './pages/desmos';
import musicpage from './pages/musicpage';
import Writing from './pages/writing';
import Aboutpage from './pages/aboutpage';
import { Analytics } from "@vercel/analytics/react"
import { useWindowSize, Viewport } from './hooks/useWindowSize';
import { useStableViewport } from './hooks/useStableViewport';
import { createRandomConwayGrid, stepConway } from './lib/conway';

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
type pagebutton = {name: string, page: (timer: number, setter: pagesetter, mouse: point, extravars: reactvar[], viewport: Viewport)=>{}}

export const pages = [{name: "MUSIC", page: musicpage},
{name: "ANIMATION", page: Animationpage},
{name: "DESMOS", page: Desmospage},
{name: "WRITING", page: Writing},
{name: "ABOUT", page: Aboutpage}]

function returnpage(currpage: number, timer: number, setter: pagesetter, mouse: point, extravars: reactvar[], viewport: Viewport, layoutViewport: Viewport): JSX.Element{
  if(currpage == 0){
    return Homepage(timer, setter, mouse, viewport)
  } 
  else{
    return pages[currpage-1].page(timer, setter, mouse, extravars, layoutViewport)
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

function App() {

  const viewport = useWindowSize();
  const layoutViewport = useStableViewport(viewport);
  // A global timer variable that loops from 0 to 1. Used for onscreen animations.
  const [Timer, setTimer] = useState<number>(0)
  const [Currpage, setCurrpage] = useState<number>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("open") === "music" ? 1 : 0;
  });
  const [mousePosition,setMousePosition] = React.useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [currtab,setcurrtab] = React.useState<number>(0);
  const [t0,sett0] = React.useState<number>(0);
  const [musictab, setmusictab] = useState<number>(0) 
  const [cellvals, setcellvals] = React.useState<Array<number>>(createRandomConwayGrid());
  const isResizingRef = useRef(false);
  const currtabRef = useRef(currtab);
  
  const othervars: reactvar[] = [{var: currtab, setter: setcurrtab},{var: t0, setter: sett0}, {var: musictab, setter: setmusictab}, {var: cellvals, setter: setcellvals}]
  // If the page is 0, we go to the home page.

  const updatePointerPosition = useCallback((clientX: number, clientY: number) => {
    setMousePosition({ x: clientX, y: clientY });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("open") === "music") {
      setCurrpage(1);
    }
  }, []);

  useEffect(() => {
    currtabRef.current = currtab;
  }, [currtab]);

  useEffect(() => {
    isResizingRef.current = true;
    sett0(currtabRef.current);
    const timeout = window.setTimeout(() => {
      isResizingRef.current = false;
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [viewport.width, viewport.height]);

  useEffect(() => {
    const tracksPointer = Currpage === 0 || Currpage === 1 || Currpage === 3;
    const onMouseMove = (event: MouseEvent) => {
      updatePointerPosition(event.clientX, event.clientY);
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) {
        updatePointerPosition(touch.clientX, touch.clientY);
      }
    };

    if (tracksPointer) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchstart', onTouchMove, { passive: true });
    }

    const interval = setInterval(() => {
      setTimer((currentTimer) => (currentTimer + 0.001) % 1);
      sett0((currentT0) => {
        if (isResizingRef.current) {
          return currtabRef.current;
        }
        return t0b(currentT0, currtabRef.current);
      });
      if (Currpage === 5) {
        setcellvals((currentCells) => stepConway(currentCells));
      }
    }, 10);

    return () => {
      clearInterval(interval);
      if (tracksPointer) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchstart', onTouchMove);
      }
    };
  }, [Currpage, updatePointerPosition]);
  const mouse = {x: stringtonum(mousePosition.x), y: stringtonum(mousePosition.y)+window.scrollY}
  return (      
    <div className="App">
      {returnpage(Currpage, Timer, setCurrpage, mouse, othervars, viewport, layoutViewport)}
    </div>
  );
}

export default App;
