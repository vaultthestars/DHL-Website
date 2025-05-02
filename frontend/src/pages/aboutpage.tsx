import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import {pages, pagesetter, reactvar} from "../App"
import {getcolorstring} from  "../Homepage"
import './subpages.css'
import  {tabs} from "./uiux tabs"
import { Button } from '../button';
import { access } from 'fs';

import {arrsize} from '../App'

//TODO: Add titles(side title and top title)
//TODO: Add a link entry
//TODO: Drive the opacity based on the current tab

const tau = 2*Math.PI

type point = {x: number, y: number};
type hsv = {h: number, s: number, v: number};
type hsl = {h: number, s: number, l: number};

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

function divwrap(n: number){
       let flexdir: string;
       if(n == 0){
              return <div></div>
       }
       else{
              if(n % 2 == 1){
                     return <div style={{fill: "true",
                            backgroundColor: getcolorstring({h: 360*n/10, s: 0.6, v: 1}),
                            display: 'flex', padding: '0px', flexDirection: 'column'}}>
                                   <p>This is a div</p>
                                   {divwrap(n-1)}
                                   {divwrap(n-1)}
                            </div>
              }
              else{
                     return <div style={{fill: "true",
                            backgroundColor: getcolorstring({h: 360*n/10, s: 0.6, v: 1}),
                            display: 'flex', padding: '0px', flexDirection: 'row'}}>
                                   <p>This is a div</p>
                                   {divwrap(n-1)}
                                   {divwrap(n-1)}
                            </div>
              }
       }
}


export default function Aboutpage(Timer: number, setPage: pagesetter, mouse: point, extravars: reactvar[]) {
    const wdims = {x: window.innerWidth, y: window.innerHeight};

    const tabdims = {x: wdims.x - (N-1)*marginwidth, y: wdims.y}
    const linespace = 20
    const cellvals = extravars[3].var
    const setcurcells = extravars[3].setter
    let x = 1;
    

    return <div key = "pagewrapper" className = "pagewrapper">
            <svg className="animsvg" fill = "true"
                 width="100%" height={window.innerHeight} aria-label="loading screen">
              <rect
              key = {"Header"}
              x = {0}
              y = {0}
              width = {wdims.x}
              height = {marginwidth}
              fill = {getcolorstring({h: 360*3/N, s: 0.6, v: 1})}
              stroke = "hsl(0 0% 0%)"
              strokeWidth= {1}
              />
              <text
              key = {"Animtitle"}
              textAnchor="middle"
              dominant-baseline = "central"
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              fontWeight= "bold"
              fontSize={40}
              letterSpacing={20}
              x = {wdims.x/2}
              y = {marginwidth/2}
              >
                     ABOUT
              </text>
              <a href = "">
              <image 
              x = "14"
              y = "14"
              width = "100"
              height = "50"
              href = "https://i.ibb.co/9nchptY/Screenshot-2024-01-14-at-3-00-09-PM.png"
              onClick={()=>setPage(0)}
              />
              </a>

              {Array.from(Array(arrsize*arrsize).keys()).map((i) => {
                     const cellsize = 5;
                     return <rect
                            key = {"cell" + i.toString()}
                            x = {cellsize*(i%arrsize) + wdims.x - arrsize*cellsize-marginwidth}
                            y = {cellsize*(Math.floor(i/arrsize)) + 2*marginwidth}
                            width = {cellsize}
                            height = {cellsize}
                            fill = {getcolorstring({h: 360*i/(arrsize*arrsize), s: 0.6, v: 0.5*cellvals[i]})}
                            stroke = "hsl(0 0% 0%)"
                            strokeWidth= {1}
                            onClick={()=>setcurcells(Array.from(Array(arrsize*arrsize).keys()).map((num) => {return Math.floor(Math.random()*1.5)}))}
                            />

              })}
               
            </svg>
              <p className='bodyText' style={{position: "absolute", left: -50, top: 2*marginwidth}}>
              Hi! My name is Dylan Lee.

              <br/>
              <br/>

              I currently work as a 2D animator at Duolingo, in Pittsburgh PA!
              <br/>
              A lot of my work centers around creating new things by using programs
              <br/>
              for unintended purposes.
              {/* What is my core philosophy? Using things for unintended purposes */}
              <br/>
              {/* What do I like to do? */}

              {/* Misc things I've done */}

              </p>

              {divwrap(10)}

        </div>
    // Otherwise, display our main app window
}