import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import {pages, pagesetter} from "../App"
import {useMousePosition, useClick, stringtonum} from  "../Homepage"
import './subpages.css'


const tau = 2*Math.PI

type point = {x: number, y: number};
type hsv = {h: number, s: number, v: number};
type hsl = {h: number, s: number, l: number};

type entry = {imageurl: string, description: JSX.Element, link: string}

const pagentries:entry[] = []

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

export default function Animationpage(Timer: number, setPage: pagesetter) {
    const mousePosition = useMousePosition();
    const clicked = useClick();
    const mouse = {x: stringtonum(mousePosition.x), y: stringtonum(mousePosition.y)+window.scrollY}
    // const clickx = stringtonum(clicked.x)
    // const clicky = stringtonum(clicked.y)
    const numlayers = 8;
    let center = {x: window.innerWidth/2, y: window.innerHeight/2};

    const frameweight = 16
    const framedims = {x: 420, y: 200}

    return <div key = "pagewrapper" className = "pagewrapper">
            <svg className="animsvg" fill = "true"
                 width="100%" height={4*window.innerHeight} aria-label="loading screen">
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
        <tspan dy="1.2em" x="100"
               >How doth the little crocodile</tspan>
        <tspan dy="1.2em" x="100" dx="1em"
               >Improve his shining tail,</tspan>
        <tspan dy="1.2em" x="100"
               >And pour the waters of the Nile</tspan>
        <tspan dy="1.2em" x="100" dx="1em"
               >On every golden scale!</tspan>
        <tspan dy="1.2em" x="100" dx="1em"
               >Link below vvv</tspan>
              </text>
              <a href="https://www.youtube.com/watch?v=MO7Qn6GVxOk&t=1s&ab_channel=DylanLee">
                <circle cx="50" cy="40" r="35" fill = "hsl(0 100% 100%)"/>
              </a>
              <g transform="rotate(-10 50 100)
               translate(100 45.5)">
              <image href="https://play-lh.googleusercontent.com/1-hPxafOxdYpYZEOKzNIkSP43HXCNftVJVttoo4ucl7rsMASXW3Xr6GlXURCubE1tA=w3840-h2160-rw" 
              width="200" />
              </g>
            </svg>
        </div>
    // Otherwise, display our main app window
}
