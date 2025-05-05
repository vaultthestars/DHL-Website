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

function divwrap(n: number, p: point){
       let flexdir: string;
       if(n == 0){
              return <div></div>
       }
       else{
              return <div style={{fill: "true",
                     backgroundColor: getcolorstring({h: 360*n/10, s: 0.6, v: 1}), position: "relative", left: 0, top: p.y/20, 
                     display: 'flex', padding: (p.y/50)+'px', flexDirection: 'row', rotate: (p.x/100).toString() + "deg"}}>
                            {divwrap(n-1,p)}
                            {divwrap(n-1,{x: -p.x, y: -p.y})}
                     </div>
       }

}


export default function Aboutpage(Timer: number, setPage: pagesetter, mouse: point, extravars: reactvar[]) {
    const wdims = {x: window.innerWidth, y: window.innerHeight};

    const tabdims = {x: wdims.x - (N-1)*marginwidth, y: wdims.y}
    const linespace = 20
    const cellvals = extravars[3].var
    const setcurcells = extravars[3].setter

    return <div key = "pagewrapper" className = "pagewrapper">

            <svg className="animsvg" fill = "true"
                 width="100%" height={2*window.innerHeight} aria-label="loading screen">
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
                     const cellsize = 3;
                     if(cellvals[i]>0){
                     return <rect
                            key = {"cell" + i.toString()}
                            x = {cellsize*(i%arrsize) + wdims.x - arrsize*cellsize-marginwidth}
                            y = {cellsize*(Math.floor(i/arrsize)) + 2*marginwidth}
                            width = {cellsize}
                            height = {cellsize}
                            fill = {getcolorstring({h: 360*i/(arrsize*arrsize), s: 0.6, v: 0.5*cellvals[i]})}
                            onClick={()=>setcurcells(Array.from(Array(arrsize*arrsize).keys()).map((num) => {return Math.floor(Math.random()*1.5)}))}
                            />
                     }

              })}
               
            </svg>
              <p className='bodyText' style={{width: "750px", position: "absolute", left: -50, top: 2*marginwidth}}>
              Hi! My name is Dylan Lee.

              <br/>
              <br/>
              
              I work in a variety of mediums, although primarily through visual art, writing, music, and code. 
              I enjoy skateboarding, exploring, climbing trees, and dancing. I would like to read more- last summer I finally read a book again for the first time- it was the Three Body Problem by Liu Cixin.

              <br/>
              <br/>

              My favorite book, or at least my go-to recommendation for most people would be Ray Bradbury's Dandelion Wine.
              Although Bradbury is primarily a science fiction writer, Dandelion Wine is entirely just regular fiction- it is a collection
              of short stories set in a small town in the summer of 1928, mostly seen through the eyes of a young boy named Douglas Spaulding.
              He is 12 years old, and in the first chapter of the book he, while picking berries in the woods with his father and younger brother Tom,
              discovers that he, as a human being, is alive- it's a truly beautiful chapter that still hits me in the gut whenever I go back and read it.

              <br/>
              <br/>

              The worst injury I've ever had is a broken wrist. 
              The furthest distance I have ever walked is currently 17 miles- I started in Shadyside, Pittsburgh, and walked all the way to Boston, PA.
              I listen to a wide range of music but have most recently been listening to Mei Semones, No Buses, Tricot, Title Fight, and Femtanyl.

              <br/>
              <br/>

              My favorite movies are listed in no particular order as follows:

              <ul>
                     <li>Moonrise Kingdom</li>
                     <li>Dead Poet's Society</li>
                     <li>The Way Way Back</li>
                     <li>Before Sunrise</li>
                     <li>Lost in Translation</li>
                     <li>Sing Street</li>
                     <li>About Time</li>
                     <li>Past Lives</li>
                     <li>La La Land</li>
                     <li>Inception</li>
                     <li>Either Spirited Away or The Boy and the Heron or Ponyo</li>
                     <li>Logan Lucky</li>
                     <li>Green Book</li>
                     <li>Everything Everywhere All At Once</li>
                     <li>Spy, with Melissa McCarthy</li>
              </ul>

              I graduated from Brown University in 2025 with a Bachelor's of Science degree in Computer Science, and currently work as a 2D animator at Duolingo in Pittsburgh. 
              <br/>
              <br/>
              <a href="https://drive.google.com/file/d/1R2M4pI9WCkJQdacKYyuET7LLO34xe1ca/view?usp=sharing" className = "bodyText">Resume Link</a>
              </p>
        </div>
    // Otherwise, display our main app window
}