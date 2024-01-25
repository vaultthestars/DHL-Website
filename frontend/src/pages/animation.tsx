import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import {pages, pagesetter, reactvar} from "../App"
import {getcolorstring} from  "../Homepage"
import './subpages.css'
import  {tabs} from "./animationtabs"
import { Button } from '../button';

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

function ease(x: number): number{
       if(x <= 0){
              return 0
       }
       if(x >= 1){
              return 1
       }
       return 3*Math.pow(x,2)-2*Math.pow(x,3)
}

function italistyle(x: number): string{
       if(x == 0){
              return ""
       }
       return "italic"
}

export default function Animationpage(Timer: number, setPage: pagesetter, mouse: point, extravars: reactvar[]) {
    const currtab = extravars[0].var
    const setcurrtab = extravars[0].setter
    const t0 = extravars[1].var
    const wdims = {x: window.innerWidth, y: window.innerHeight};

    const tabdims = {x: wdims.x - (N-1)*marginwidth, y: wdims.y}
    const linespace = 20

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
                     ANIMATION
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
                {Array.from(Array(N).keys()).map((i)=>{
              const origin = {x: i*marginwidth + (tabdims.x-marginwidth)*ease((i)-t0), y: marginwidth}

              const imageorigin = {x: origin.x + marginwidth, y: origin.y + tabdims.y*1/8}

              const imageheight = tabdims.y/2

              const textboxorigin = {x: origin.x + marginwidth,
                     y: imageorigin.y+imageheight + marginwidth/3}
              const imdms = tabs[i].imdms
return <g>
              <rect
              key = {"tab " + i.toString()}
              x = {origin.x}
              y = {origin.y}
              width = {tabdims.x}
              height = {tabdims.y}
              fill = {getcolorstring({h: 360*i/N, s: 0.6, v: 1})}
              stroke = "hsl(0 0% 0%)"
              strokeWidth= {1}
              onClick={()=>{setcurrtab(i)}}
              />
              <text
              key = {"tabnumber" + i.toString()}
              // text-anchor="middle"
              dominant-baseline = "central"
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              // fontWeight= "bold"
              fontSize={40}
              x = {origin.x + marginwidth/2 - 10}
              y = {origin.y + marginwidth/2}
              >{(i+1).toString()}</text>
              <text
              key = {"Sidetitle" + i.toString()}
              // textAnchor="middle"
              dominant-baseline = "central"
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              fontWeight= "bold"
              fontSize={16}
              letterSpacing={5}
              transform = {"translate(" + (origin.x + marginwidth/2).toString() + " " +
              (origin.y + imageorigin.y + imageheight).toString() + ")" + 
              " rotate(-90)"}
              >{tabs[i].title}</text>

              <text
              key = {"maintitle " + i.toString()}
              // text-anchor="middle"
              dominant-baseline = "central"
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              fontWeight= "bold"
              fontSize={25}
              letterSpacing={5}
              x = {origin.x + marginwidth}
              y = {origin.y + marginwidth/2}
              >{tabs[i].title}</text>

              <text className="verse"
              key = "verse"
              // text-anchor="middle"
              dominant-baseline = "central"
              // letterSpacing={4}
              // textLength={0.75*widd}
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              // fontWeight= "bold"
              >
              {Array.from(Array(tabs[i].description.length).keys()).map((linenum)=>{
                     return  <tspan x={textboxorigin.x}
                     y = {textboxorigin.y + linenum*linespace + 5}
                     fontStyle={italistyle(linenum)}
                     >{tabs[i].description[linenum]}</tspan>
              })}
              </text>
              <foreignObject width={imdms.x*imageheight/imdms.y} height={imageheight} x = {imageorigin.x} y = {imageorigin.y}>
                     <iframe width={imdms.x*imageheight/imdms.y} height={imageheight}
                     src = {tabs[i].imageurl}
                     title="YouTube video player" 
                     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                     allowFullScreen></iframe>
              </foreignObject>
</g>
                })}
              {/* {Button({x: wdims.x/2,y: wdims.y + marginwidth}, {x: 1.25*500/3,y: 1.25*marginwidth/2}, "HOME", ()=>{setPage(0)},mouse)} */}
            </svg>
        </div>
    // Otherwise, display our main app window
}