import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import {pages, pagesetter, reactvar} from "../App"
import {distortandcenter, getcolorstring} from  "../Homepage"
import './subpages.css'
import  {tabs} from "./animationtabs"
import { Button } from '../button';
import { graphs } from './desmospages';
import { musictabs } from './musicpages';
import { line } from 'd3';

//TODO: Add titles(side title and top title)
//TODO: Add a link entry

const tau = 2*Math.PI

type point = {x: number, y: number};
type hsv = {h: number, s: number, v: number};
type hsl = {h: number, s: number, l: number};

// How should we display our PDFs?

const marginwidth = 75

const description = ["A small collection of my recent fingerstyle tabs!",
"Still getting the hang of balancing accuracy and playability.",
"You can find some of the interactive versions at",
"https://www.songsterr.com/a/wsa/dylan-lee-tabs-a83121"]

function easetab(x: number, tabheight: number): number{
    if(x <= 0){
        return 0
    }
    if(x>tabheight){
        return tabheight
    }
    return (tabheight/2)*(Math.sin((Math.PI*(x-(tabheight/2))/tabheight))+1)
}

function getopacity(x: number, tabheight: number): number{
    return 4*x*(tabheight-x)/Math.pow(tabheight,2)
}

function gettextcolor(x: number, tabheight: number, linespace: number): number{
    if (Math.abs(x-tabheight/2) < 0.5*linespace){
        return 1
    }
    return 0
}

function getsum(arr: number[]): number{
    let summ = 0
    for(let i = 0; i < arr.length; i++){
        summ = summ + arr[i]
    }
    return summ
}

function clamplr(l: number, r: number, x: number): number{
    if (x<l){
        return l
    }
    if(x>r){
        return r
    }
    return x
}

export default function musicpage(Timer: number, setPage: pagesetter, mouse: point, extravars: reactvar[]) {
    const currtab = extravars[2].var
    const setcurrtab = extravars[2].setter
    const wdims = {x: window.innerWidth, y: window.innerHeight};
    const tabdims = {x: 2/3*wdims.x, y: wdims.y-marginwidth}

    const linespace = 30

    const selectedtab = getsum(Array.from(Array(musictabs.length).keys()).map((i)=>{
        const inputpts = 2*(wdims.y-mouse.y) + (i-musictabs.length)*linespace
        return i*gettextcolor(inputpts,2/3*tabdims.y,linespace)
    }))

    return <div key = "pagewrapper" className = "pagewrapper">
            <svg className="animsvg" fill = "true"
                 width="100%" height={wdims.y} aria-label="loading screen">
                <rect
                key = {"Music header"}
                x = {0}
                y = {0}
                width = {wdims.x}
                height = {marginwidth}
                fill = {getcolorstring({h: 220, s: 0.6, v: 1})}
                stroke = "hsl(0 0% 0%)"
                strokeWidth= {1}
                />
              <text
              key = {"Musictitle"}
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
                     MUSIC
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
                <rect
                key = {"Music scroll box"}
                x = {0}
                y = {marginwidth}
                width = {(1-2/3)*wdims.x}
                height = {tabdims.y}
                fill = {getcolorstring({h: 200, s: 0.6, v: 0.8})}
                stroke = "hsl(0 0% 0%)"
                strokeWidth= {1}
                />
                <rect
                key = {"Music description box"}
                x = {0}
                y = {marginwidth}
                width = {(1-2/3)*wdims.x}
                height = {1/3*tabdims.y-marginwidth}
                fill = {getcolorstring({h: 180, s: 0.6, v: 0.8})}
                stroke = "hsl(0 0% 0%)"
                strokeWidth= {1}
                />
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
              {Array.from(Array(description.length).keys()).map((linenum)=>{
                     return  <tspan x={marginwidth/3}
                     y = {marginwidth + linenum*linespace + 25}
                     >{description[linenum]}</tspan>
              })}
              </text>
                <text
              key = {"Titles"}
              dominant-baseline = "central"
              fontFamily='Helvetica'
            //   fontWeight= "bold"
            //   letterSpacing={20}
              x = {marginwidth/2}
              y = {marginwidth}
              >
                    {Array.from(Array(musictabs.length).keys()).map((i)=>{
                        const inputpts = 2*(wdims.y-clamplr(wdims.y-tabdims.y/2+0.75*marginwidth,wdims.y-1.75*marginwidth,mouse.y)) + (i-musictabs.length)*linespace
                     return  <tspan x={marginwidth/2}
                     y = {marginwidth/2+1/3*tabdims.y + easetab(inputpts,2/3*tabdims.y)}
                     fontSize = {15 + 5*getopacity(inputpts,2/3*tabdims.y)}
                     opacity = {getopacity(inputpts,2/3*tabdims.y)}
                     fill = {"hsl(0 0% "+100*(gettextcolor(inputpts,2/3*tabdims.y, linespace))+"%)"}
                     >{musictabs[i].name}</tspan>
              })}
              </text>
<foreignObject width={tabdims.x} height={tabdims.y} x = {(1-2/3)*wdims.x} y = {marginwidth}>
                     <iframe width={tabdims.x} height={tabdims.y}
                    src = {musictabs[selectedtab].link}
                     title="YouTube video player" 
                     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                     allowFullScreen></iframe>
              </foreignObject>

            </svg>
        </div>
    // Otherwise, display our main app window
}