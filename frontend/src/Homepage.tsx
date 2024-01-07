import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import {Dstring, Hstring, Lstring} from "./LetterData";
import App from "./App"
import {pages, pagesetter} from "./App"

const tau = 2*Math.PI

type point = {x: number, y: number};
type hsv = {h: number, s: number, v: number};
type hsl = {h: number, s: number, l: number};

//What sub-pages do we want?
//Animation, Desmos. Music/Tabs. Sculpture? ehhh.
//How to store these buttons? Maybe make a custom thing.

//So how are we gonna do page navigation? Maybe it should be a map from a string to an actual function.

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

export function getcolorstring(hsvin: hsv): string{
    const newhsl = hsvtohsl(hsvin)
    return "hsl(" + (newhsl.h).toString() + " " + (100*newhsl.s).toString() + "% " + (100*newhsl.l).toString() + "%)"
}

function linterp(a: number, b: number, t: number){
    return a + t*(b-a)
}

function clamplr(x: number,l: number, r: number){
    if(x<l){
        return l
    }
    if(x>r){
        return r
    }
    return x
}

//TODO: Figure out the minutia of this stuff right here

function boxdist(mouse: point, reccenter: point, recdims: point): number{
    return clamplr(1-(Math.abs(mouse.x-reccenter.x)/(recdims.x/2)),0,1)*clamplr(1-(Math.abs(mouse.y-reccenter.y)/(recdims.y/2)),0,1)
}


export default function Homepage(Timer: number, setPage: pagesetter, mousePosition: {x: any, y: any}) {
    const mouse = mousePosition
    // -window.scrollY
    // const clickx = stringtonum(clicked.x)
    // const clicky = stringtonum(clicked.y)
    const numlayers = 8;
    const buttonlayers = 3;
    let center = {x: window.innerWidth/2, y: 350};

    const frameweight = 16
    const framedims = {x: 420, y: 200}

    return <div key = "wrapper" className = "wrapper">
            <svg className="svgwindow" fill = "true"
                 width="100%" height={window.innerHeight} aria-label="loading screen">
                    <text
                        key = {"nametitle"}
                        x = {center.x}
                        y = {75}
                        text-anchor="middle"
                        dominant-baseline = "central"
                        textLength={2*framedims.x}
                        fontSize={32}
                        fill = "hsl(0 100% 100%)"
                        fontFamily='Helvetica'
                        fontWeight= "bold"
                        >
                            DYLAN HWANG LEE
                        </text>
                {Array.from(Array(pages.length).keys()).map((num) => {
                    const N = pages.length
                    const widd = 500/N
                    const recdims = {x: widd,y: 0.3*widd}
                    const reccenter = {x: center.x + (framedims.x-recdims.x/2+frameweight/2)*(num-(N-1)/2)*(2/(N-1)),y: center.y + framedims.y + 75}
                    const centerdist = 2*boxdist(mouse,reccenter,recdims)
                    return <g>
                        <rect
                        key = {"Button " + num.toString()}
                        x = {reccenter.x-recdims.x/2}
                        y = {reccenter.y-recdims.y/2}
                        width = {recdims.x}
                        height = {recdims.y}
                        fill = "hsl(0 0% 100%)"
                        stroke = "hsl(0 0% 100%)"
                        onClick={()=>{setPage(num+1)}}
                        strokeWidth= "1"
                        />
                        {Array.from(Array(buttonlayers).keys()).map((layernum)=>{
                            const rectmargin = 10*clamplr(buttonlayers*2*centerdist,0,layernum+1)
                            return <rect
                            key = {"Button outline" + num.toString() + "-" + layernum.toString()}
                            x = {reccenter.x-recdims.x/2-rectmargin/2}
                            y = {reccenter.y-recdims.y/2}
                            width = {recdims.x + rectmargin}
                            height = {recdims.y + rectmargin}
                            fill = "none"
                            stroke = "hsl(0 0% 100%)"
                            // onClick={()=>{redirect()}}
                            strokeWidth= "1"
                            />
                        })}
                        <text
                        key = {"nav label" + num.toString()}
                        x = {reccenter.x}
                        y = {reccenter.y}
                        text-anchor="middle"
                        dominant-baseline = "central"
                        fontSize={0.1*widd}
                        letterSpacing={5*widd/200}
                        // textLength={0.75*widd}
                        fill = "hsl(0 0% 0%)"
                        fontFamily='Helvetica'
                        fontWeight= "bold"
                        onClick={()=>{setPage(num+1)}}
                        >
                            {pages[num].name}
                        </text>
                    </g>
                    }
                )}
                {/* <circle
                r = "10"
                cx = {mouse.x}
                cy = {mouse.y}
                fill = "hsl(0 100% 100%)"
                /> */}
                {Array.from(Array(numlayers*3).keys()).map((num) => {
                        const l0 =  Math.floor(num/3)/(numlayers-1)
                        return <polygon 
                        key= {"Letter" + num.toString()} 
                        points={pointlisttostring(getlist(num % 3).map((point: point)=>{
                            return distortandcenter(point, center, mouse, l0)
                        }))}
                        fill={getcolorstring({h: 360*(1-l0),s: 1 - l0,v: 1})}
                        opacity= {(linterp(20,80,l0)).toString() + "%"}
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
                strokeWidth= {frameweight}
                />
            </svg>
            <p>
                Your cursor position:
                <br />
                {JSON.stringify(mousePosition)}
            </p>
        </div>
    // Otherwise, display our main app window
}
