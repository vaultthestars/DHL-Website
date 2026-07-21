import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import {pages, pagesetter, reactvar} from "../App"
import {distortandcenter, getcolorstring} from  "../Homepage"
import './subpages.css'
import  {tabs} from "./animationtabs"
import { Button } from '../button';
import { graphs } from './desmospages';
import { Viewport } from '../hooks/useWindowSize';
import { PageHeader } from '../components/PageHeader';
import { TabDescription } from '../components/TabDescription';

//TODO: Add titles(side title and top title)
//TODO: Add a link entry

const tau = 2*Math.PI

type point = {x: number, y: number};
type hsv = {h: number, s: number, v: number};
type hsl = {h: number, s: number, l: number};

const marginwidth = 75
const N = graphs.length

const currdate = new Date();

const desparagraph = [
    "I was first introduced to Desmos in my 8th grade Algebra class, during a unit on linear equations.",
    "I quickly found myself entranced with the graphing program's colors and curves, its precision,",
    "and the mystery of what all its built-in functions were. What was a 'cos'? What was a 'tan'?",
    "At first, I mostly used Desmos to prototype explicit functions I was building, functions that could",
    "reverse the digits of a number, calculate the partitions of any integer, or calculate the infinite",
    "sequence of angles in the koch fractal curve.",
    "",
    "In the " + (currdate.getFullYear()-2015).toString() + " years since that fateful day, I've grown to use Desmos for practically everything, whether it be",
    "creating visual art, physics simulations, architectural blueprints, organization systems, rollercoasters,",
    "music making programs, procedural animation, multi-level action games with functioning NPC AI, ",
    "topological demonstrations, old (and new!) board games, 3D renderers, maze generators, and even",
    "early prototypes of this very website.",
    "",
    "Feel free to click around and explore!"

]

export default function Desmospage(Timer: number, setPage: pagesetter, mouse: point, extravars: reactvar[], viewport: Viewport) {
    const wdims = {x: viewport.width, y: viewport.height};
    const imscale = wdims.x/2
    const videoWidth = 0.8 * imscale;
    const videoHeight = 0.8 * imscale * 315 / 560;
    const videoX = marginwidth / 2;
    const introY = marginwidth + (0.2 * imscale * 315) / 560 / 2;
    const textX = videoX + videoWidth + marginwidth / 2;
    const textWidth = Math.max(wdims.x - textX - marginwidth, 240);

    return <div key = "pagewrapper" className = "pagewrapper">
            <div className="desktop-only">
            <svg className="animsvg" fill = "true"
                 width="100%" height={wdims.x/4*Math.ceil(N/4)+imscale*315/560+marginwidth} aria-label="loading screen">
<rect
              key = {"Desmos header"}
              x = {0}
              y = {0}
              width = {wdims.x}
              height = {marginwidth}
              fill = {getcolorstring({h: 360*3/N, s: 0.6, v: 1})}
              stroke = "hsl(0 0% 0%)"
              strokeWidth= {1}
              />
              <text
              key = {"Desmostitle"}
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
                     DESMOS
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
              key = {"Background"}
              x = {0}
              y = {marginwidth}
              width = {wdims.x}
              height = {imscale*315/560}
              fill = {getcolorstring({h: 0, s: 0.6, v: 0.8})}
              stroke = "hsl(0 0% 0%)"
              strokeWidth= {1}
              />
              <foreignObject
              width={videoWidth}
              height={videoHeight}
              x={videoX}
              y={introY}
              >
                     <iframe width={videoWidth} height={videoHeight}
                     src = {"https://www.youtube.com/embed/FYMmFFY1V1s?si=tKZSR2kDAT2tjzSg"}
                     title="YouTube video player" 
                     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                     allowFullScreen></iframe>
              </foreignObject>
              <foreignObject
              x={textX}
              y={introY}
              width={textWidth}
              height={videoHeight}
              >
                <TabDescription lines={desparagraph} />
              </foreignObject>
                {Array.from(Array(N).keys()).map((i)=>{
              const initorigin = {x: (i%4)*wdims.x/4 + wdims.x/8, y: marginwidth + wdims.x/4*Math.floor(i/4) + 200 + imscale*315/560}
              const neworigin = distortandcenter(initorigin, {x: 0, y: 0}, mouse, 0.1)
              const origin = {x: neworigin.x - wdims.x/8,y:neworigin.y - 200}
              {/* <div><a href=https://www.desmos.com/calculator/nvjuiqtb07><img src=https://www.desmos.com/calc_thumbs/production/nvjuiqtb07.png></br>songmaker pt 2, reversing time</a></div> */}
return <g>
              <rect
              key = {"tab " + i.toString()}
              x = {origin.x}
              y = {origin.y}
              width = {wdims.x/4}
              height = {wdims.x/4}
              fill = {getcolorstring({h: (6*i + window.scrollY/20)%360, s: 0.4, v: 0.95})}
              stroke = "hsl(0 0% 0%)"
              strokeWidth= {1}
              />
              <text
              key = {"Title" + i.toString()}
              textAnchor="middle"
              dominant-baseline = "central"
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              fontWeight= "bold"
              fontSize={15}
              letterSpacing={2}
              x = {origin.x + wdims.x/8}
              y = {origin.y + 20}
              >
                     {graphs[i].title}
              </text>
              <a href={"https://www.desmos.com/calculator/" + graphs[i].code}>
              <image
              x = {origin.x + wdims.x/4/8}
              y = {origin.y + wdims.x/4/8}
              width = {3/4*wdims.x/4}
              height = {3/4*wdims.x/4}
              href = {"https://www.desmos.com/calc_thumbs/production/" + graphs[i].code + ".png"}
              />
              </a>
</g>
                })}
            </svg>
            </div>
            <div className="mobile-only mobile-page">
              <PageHeader title="DESMOS" setPage={setPage} hue={0} />
              <div className="mobile-intro">
                <TabDescription lines={desparagraph} />
                <iframe
                  src="https://www.youtube.com/embed/FYMmFFY1V1s?si=tKZSR2kDAT2tjzSg"
                  title="Desmos introduction video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <div className="mobile-card-grid">
                {graphs.map((graph) => (
                  <a
                    key={graph.code}
                    className="mobile-card"
                    href={`https://www.desmos.com/calculator/${graph.code}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={`https://www.desmos.com/calc_thumbs/production/${graph.code}.png`}
                      alt={graph.title}
                      loading="lazy"
                    />
                    <div className="mobile-card__title">{graph.title}</div>
                  </a>
                ))}
              </div>
            </div>
        </div>
    // Otherwise, display our main app window
}