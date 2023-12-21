import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';

const tau = 2*Math.PI

type point = {x: number, y: number};
type hsv = {h: number, s: number, v: number};
type hsl = {h: number, s: number, l: number};

//What sub-pages do we want?
//Animation, Desmos. Music/Tabs. Sculpture? ehhh.
//How to store these buttons? Maybe make a custom thing.

type pagebutton = {name: string, url: string}
const pages = [{name: "Animation", url: "hey"}, {name: "Desmos", url: "hello"}]
//So how are we gonna do page navigation? Maybe it should be a map from a string to an actual function.


const useMousePosition = () => {
    const [
      mousePosition,
      setMousePosition
    ] = React.useState({ x: null, y: null });
    React.useEffect(() => {
      const updateMousePosition = (ev: { clientX: any; clientY: any; }) => {
        setMousePosition({ x: ev.clientX, y: ev.clientY });
      };
      window.addEventListener('mousemove', updateMousePosition);
      return () => {
        window.removeEventListener('mousemove', updateMousePosition);
      };
    }, []);
    return mousePosition;
  };

  const useClick = () => {
    const [
        clickPosition,
        setclickPosition
      ] = React.useState({ x: null, y: null });
    React.useEffect(() => {
    const updateclickPosition = (ev: { x: any; y: any; }) => {
        setclickPosition({ x: ev.x, y: ev.y });
    };
    window.addEventListener("click", updateclickPosition);
    return () => {
        window.removeEventListener('mousemove', updateclickPosition);
      };
    }, []);
    return clickPosition;
  };


function stringtonum(x: any): number{
    if(JSON.stringify(x) == "null"){
        return 0
    }
    else{
        return +x
    }
}

function hsvtohsl(hsvin: hsv): hsl{
    const L = hsvin.v*(1-hsvin.s/2)
    let S = 0
    if(L == 0 || L == 1){
        S = 0
    }
    else{
        S = (hsvin.v-L)/Math.min(L,1-L)
    }
    return {h:hsvin.h,s: S,l: L}
}

export default function Animationpage() {
    const mousePosition = useMousePosition();
    const clicked = useClick();
    const mouse = {x: stringtonum(mousePosition.x), y: stringtonum(mousePosition.y)}
    // const clickx = stringtonum(clicked.x)
    // const clicky = stringtonum(clicked.y)
    const numlayers = 8;
    let center = {x: window.innerWidth/2, y: window.innerHeight/2};

    const framedims = {x: 420, y: 200}

    return <div key = "animwrapper" className = "wrapper">
            <svg className="animsvg" fill = "true"
                 width="100%" height={window.innerHeight} aria-label="loading screen">
                <rect
                key = "animFrame"
                x = {center.x-framedims.x}
                y = {center.y-framedims.y}
                width = {2*framedims.x}
                height = {2*framedims.y}
                fill = "none"
                stroke = "hsl(0 50% 100%)"
                strokeWidth= "1"
                />
            </svg>
        </div>
    // Otherwise, display our main app window
}
