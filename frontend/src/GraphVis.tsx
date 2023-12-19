import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';

const tau = 2*Math.PI

// A function that returns some number of periods based on the current value of the global animation timer
export function dots(Timer: number): string{
    if(Timer<1/3){
        return "."
    }
    else if(Timer<2/3){
        return ".."
    }
    return "..."
}

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

export default function GraphVis(Timer: number) {
    const mousePosition = useMousePosition();
    const clicked = useClick();
    const mx = stringtonum(mousePosition.x)
    const my = stringtonum(mousePosition.y)
    const clickx = stringtonum(clicked.x)
    const clicky = stringtonum(clicked.y)
    const [followpos, setfollowpos] = React.useState({ x: 0, y: 0});

    // An especially long aria label string I moved up here

    // If users haven't been loaded yet, or we have no user ids in our array, display a loading screen
    return <div key = "wrapper" className = "wrapper">
            <svg className="svgwindow" fill = "true"
                 width="100%" height="600" aria-label="loading screen">
                <circle 
                key= {"follow"} 
                cx= {followpos.x} cy= {followpos.y} 
                r={25} 
                fill="rgb(0 100 100)"
                stroke = "hsla(0 100% 100%)"
                strokeWidth = "1"
                >
                </circle>
                <circle 
                    key= {"clickcircle"} 
                    cx= {clickx} cy= {clicky} 
                    r={50} 
                    fill="rgb(255 0 0)"
                    stroke = "hsla(0 100% 100%)"
                    strokeWidth = "1"
                    >
                    </circle>
                {[0,1,2,3].map((num) => 
                        {
                        return <circle 
                        key= {"loadcircle_"+num.toString()} 
                        cx= {mx} cy= {my} 
                        r={4*(40+5*num + 2*Math.sin(2*tau*Timer+(num*tau/4)))} 
                        fill="none"
                        stroke = "hsla(0 100% 100%)"
                        strokeWidth = "1"
                        >
                        </circle>
                        }
                    )}
                <text key = {"loadingtext"} className = "whitetextbig" x= "600" y= "314" aria-label="Loading..."> 
                {"Loading"+ dots((6*Timer)%1)} 
                </text>
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
