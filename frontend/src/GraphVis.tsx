import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import {Dstring, Hstring, Lstring} from "./LetterData";

const tau = 2*Math.PI

type point = {x: number, y: number};
type hsv = {h: number, s: number, v: number};
type hsl = {h: number, s: number, l: number};

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

function pointlisttostring(pointlist: point[]): string{
    let returnstring = ""
    for(let i = 0; i < pointlist.length; i++){
        returnstring = returnstring + pointlist[i].x.toString() + "," + pointlist[i].y.toString() + " "
    }
    return returnstring
}

function mag(p1: point, p2: point): number{
    return Math.sqrt(Math.pow(p1.x-p2.x,2)+Math.pow(p1.y-p2.y,2))
}

function sech(x: number): number{
    return 1/Math.cosh(x)
}

function bump(x: number): number{
    return 100*sech(x/100)*(1-sech(8*x/100))
}

function distortandcenter(point: point, center: point, mouse: point, fac: number): point{
    const relmouse = {x: mouse.x-center.x, y: mouse.y-center.y}
    const fullfac = fac*bump(mag(point,relmouse))/mag(point,relmouse)
    const offset = {x: fullfac*(point.x-relmouse.x), y: fullfac*(point.y-relmouse.y)}
    return {x: point.x + center.x + offset.x, y: point.y + center.y + offset.y}
}

function getlist(x: number): point[]{
    if(x == 0){
        return Dstring
    }
    if(x == 1){
        return Hstring 
    }
    else{
        return Lstring
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

function getcolorstring(hsvin: hsv): string{
    const newhsl = hsvtohsl(hsvin)
    return "hsl(" + (newhsl.h).toString() + " " + (100*newhsl.s).toString() + "% " + (100*newhsl.l).toString() + "%)"
}

export default function GraphVis(Timer: number) {
    const mousePosition = useMousePosition();
    const clicked = useClick();
    const mouse = {x: stringtonum(mousePosition.x), y: stringtonum(mousePosition.y)}
    const clickx = stringtonum(clicked.x)
    const clicky = stringtonum(clicked.y)
    const numlayers = 8;
    let center = {x: window.innerWidth/2, y: 300};

    const framedims = {x: 420, y: 200}

    // An especially long aria label string I moved up here

    // If users haven't been loaded yet, or we have no user ids in our array, display a loading screen
    return <div key = "wrapper" className = "wrapper">
            <svg className="svgwindow" fill = "true"
                 width="100%" height="600" aria-label="loading screen">
                {Array.from(Array(numlayers*3).keys()).map((num) => 
                        {
                        const l0 =  Math.floor(num/3)/(numlayers-1)
                        return <polygon 
                        key= {"Letter" + num.toString} 
                        points={pointlisttostring(getlist(num % 3).map((point: point)=>{
                            return distortandcenter(point, center, mouse, l0)
                        }))}
                        fill={getcolorstring({h: 360*(1-l0),s: 1 - l0,v: 1})}
                        stroke = "none"
                        />
                        }
                    )}
                <rect
                key = "Frame"
                x = {center.x-framedims.x}
                y = {center.y-framedims.y}
                width = {2*framedims.x}
                height = {2*framedims.y}
                fill = "none"
                stroke = "hsl(0 0% 100%)"
                strokeWidth= "1"
                />
                {/* <circle 
                key= {"clickcircle"} 
                cx= {clickx} cy= {clicky} 
                r={50} 
                fill="rgb(255 0 0)"
                stroke = "hsla(0 100% 100%)"
                strokeWidth = "1"
                /> */}
                {/* {[0,1,2,3].map((num) => 
                        {
                        return <circle 
                        key= {"loadcircle_"+num.toString()} 
                        cx= {mouse.x} cy= {mouse.y} 
                        r={4*(10+4*num + 2*Math.sin(2*tau*Timer+(num*tau/4)))} 
                        fill="none"
                        stroke = "hsla(0 100% 100%)"
                        strokeWidth = "1"
                        >
                        </circle>
                        }
                    )} */}
            </svg>
            <p>
                Your cursor position:
                <br />
                {JSON.stringify(mousePosition)}
                {JSON.stringify(clicked)}
            </p>
        </div>
    // Otherwise, display our main app window
}
