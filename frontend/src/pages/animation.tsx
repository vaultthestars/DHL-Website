import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import {pages, pagesetter, reactvar} from "../App"
import {getcolorstring} from  "../Homepage"
import './subpages.css'
import  {tabs} from "./animationtabs"


const tau = 2*Math.PI

type point = {x: number, y: number};
type hsv = {h: number, s: number, v: number};
type hsl = {h: number, s: number, l: number};

const teststring = "hello here is a &lt;br /> test of some string formatting"

// How do we want this to look? 
// Maybe create some sort of simple image gallery with buttons and film grain. 
// Clicking left or right makes the image blink closed and then open again.
// Keep it simple at first.

// const img = new Image();
// img.onload = function() {
//   alert(img.width + 'x' + img.height);
// }
// img.src = 'http://www.google.com/intl/en_ALL/images/logo.gif';

const marginwidth = 75
const N = tabs.length

function ease(x: number): number{
       if(x <= 0){
              return 0
       }
       if(x >= 1){
              return 1
       }
       return 3*Math.pow(x,2)-2*Math.pow(x,3)
}

export default function Animationpage(Timer: number, setPage: pagesetter, extravars: reactvar[]) {
    const currtab = extravars[0].var
    const setcurrtab = extravars[0].setter
    const t0 = extravars[1].var
    const wdims = {x: window.innerWidth, y: window.innerHeight};

    const tabdims = {x: wdims.x - (N-1)*marginwidth, y: wdims.y}
    const linespace = 15

    return <div key = "pagewrapper" className = "pagewrapper">
            <svg className="animsvg" fill = "true"
                 width="100%" height={4*window.innerHeight} aria-label="loading screen">
                {Array.from(Array(N).keys()).map((i)=>{
              const origin = {x: i*marginwidth + (tabdims.x-marginwidth)*ease((i)-t0), y: 0}

              const imageorigin = {x: origin.x + marginwidth, y: origin.y + tabdims.y*1/8}

              const imageheight = tabdims.y/2

              const textboxorigin = {x: origin.x + marginwidth,
                     y: imageorigin.y+imageheight + marginwidth/3}
return <g>
              <rect
              key = {"tab " + i.toString()}
              x = {origin.x}
              y = {origin.y}
              width = {tabdims.x}
              height = {tabdims.y}
              fill = {getcolorstring({h: 360*i/N, s: 1, v: 1})}
              stroke = "hsl(0 0% 100%)"
              strokeWidth= {1}
              onClick={()=>{console.log(i);
                     setcurrtab(i)}}
              />
              <text
              key = "tabnumber"
              // text-anchor="middle"
              dominant-baseline = "central"
              fill = "hsl(0 0% 0%)"
              fontFamily='Trattatello'
              fontWeight= "bold"
              fontSize={40}
              x = {origin.x + marginwidth/2 - 10}
              y = {origin.y + marginwidth/2}
              >{(i+1).toString()}</text>
              <text className="verse"
              key = "verse"
              // text-anchor="middle"
              dominant-baseline = "central"
              letterSpacing={5}
              // textLength={0.75*widd}
              fill = "hsl(0 100% 100%)"
              fontFamily='Helvetica'
              fontWeight= "bold"
              >
              {Array.from(Array(tabs[i].description.length).keys()).map((linenum)=>{
                     return  <tspan x={textboxorigin.x}
                     y = {textboxorigin.y + linenum*linespace + 5}
                     >{tabs[i].description[linenum]}</tspan>
              })}
              </text>
              <image x = {imageorigin.x} y = {imageorigin.y} href={tabs[i].imageurl} 
              height={imageheight} />
              {/* What next? Add rectangles to represent the actual placement of text boxes */}

              {/* <a href="https://www.youtube.com/watch?v=MO7Qn6GVxOk&t=1s&ab_channel=DylanLee">
                <circle cx="50" cy="40" r="35" fill = "hsl(0 100% 100%)"/>
              </a>
              <g transform="rotate(-10 50 100)
               translate(100 45.5)">
              <image href="https://play-lh.googleusercontent.com/1-hPxafOxdYpYZEOKzNIkSP43HXCNftVJVttoo4ucl7rsMASXW3Xr6GlXURCubE1tA=w3840-h2160-rw" 
              width="200" />
              </g> */}
</g>
                })}
            </svg>
        </div>
    // Otherwise, display our main app window
}