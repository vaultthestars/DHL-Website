import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import { isTupleTypeNode } from 'typescript';
import Slider from './Slider'
import ReactSlider from "react-slider";
import * as d3 from 'd3';
import ReactDOM from 'react-dom';
import { svg } from 'd3';
import { isVisible } from '@testing-library/user-event/dist/utils';

//npm i --save-dev @types/react-slider

//For whatever reason, this is causing us a lot of problems. Trying to create a map gives us a warning that the map items could be null, which is a huge
//pain in the ass. Try doing it with arrays instead.
// Point data format: ID/key, cx, cy
// Have a separate map from ID/key to energy, something, something else, something else, etc.
//[DONE]: We need to be able to render a whole ton of circles.
//[DONE]: Add the actual parameters we want
//[DONE]: Change background color
//[DONE]: Add camera controls
//[DONE]: Make button fade in dynamically

//[DONE]: Make the sidebar change when you zoom in
//[DONE]: Add number displays in the sidebar
//[DONE]: Make a pretty logo and slap it in
//[DONE]: Add the current user
//[DONE]: Add matches and matches navigation
//[DONE]: Add variables for everything we're actually going to use
//TODO: Make google thing vanish after you've logged in
//TODO: Make the website actually look the way we want it to
//TODO: Get frontend to communicate with backend
//TODO: FIX THE INFINITE LOOP PLEASE

let usersongparams: Map<number, Array<number>> = new Map<number, Array<number>>();
//What do we want? The user name, the current song, and the current artist.

let userdatastrings: Map<number, Array<string>> = new Map<number, Array<string>>();

let matchesdata: Map<number, Array<Array<number>>> = new Map<number, Array<Array<number>>>();

//Other things we want: Username, song name, artist, 

//matches: 
//Current: match 0, match 1, match 2, match 3, match 4
//Alltime: match 0, match 1, match 2, match 3, match 4

// auth token or refresh token maps to a
//USER:
    // username
    // current song name
    // current song artist
    // current song data
    // historical song data

// Store this in a big hash map from auth tokens to user objects

let maxnum = 250;

let centerx = 600;

let repulseval = 1.5;

let repulsedist = 40;

const sortstyle: Map<number, (inpt: Array<number>, SortParameter: number, loggedin: boolean, curruser: number) => Array<number>> = new Map<number, (inpt: Array<number>) => Array<number>>();
const sortname: Map<number, string> = new Map<number, string>();
const parameternames: Map<number, string> = new Map<number, string>();

sortstyle.set(0,radsort);
sortstyle.set(1,linsort);

sortname.set(0,"radial sort");
sortname.set(1,"linear sort");

parameternames.set(0,"Acousticness");
parameternames.set(1,"Danceability");
parameternames.set(2,"Energy");
parameternames.set(3,"Instrumentalness");
parameternames.set(4,"Speechiness");
parameternames.set(5,"Valence");

//Acousticness, Danceability, Energy, Instrumentalness, Speechiness, Valence

for(let i = 0; i < maxnum; i++){
    usersongparams.set(i,[Math.random(),Math.random(),Math.random(),Math.random(),Math.random(),Math.random()])
    //roughly 4 parameters
    //What do we want? The user name, the current song, and the current artist.
    userdatastrings.set(i,[genrandomstring(10),genrandomstring(10),genrandomstring(10),genrandomstring(10)])
    matchesdata.set(i,[[Math.floor(maxnum*Math.random()),Math.floor(maxnum*Math.random()),Math.floor(maxnum*Math.random()),Math.floor(maxnum*Math.random()),Math.floor(maxnum*Math.random())],
    [Math.floor(maxnum*Math.random()),Math.floor(maxnum*Math.random()),Math.floor(maxnum*Math.random()),Math.floor(maxnum*Math.random()),Math.floor(maxnum*Math.random())]])
}

function genrandomstring(length: number): string{
    let result: string = '';
    const consonants: string = 'bcdfghjklmnpqrstvwxyz';
    const vowels: string = 'aeiou';
    for ( var i = 0; i < length; i++ ) {
        if(i%2 == 0){
            result += consonants.charAt(Math.floor(Math.random() * 20));
        }
        else{
            result += vowels.charAt(Math.floor(Math.random() * 5));
        }
    }
    return result;
}

function initdist(initdata: Map<number, Array<number>>): Array<Array<number>>{
    let returnarr: Array<Array<number>> = new Array<Array<number>>();
    for(let i = 0; i < initdata.size; i++){
        returnarr.push([i,1500*(Math.random()-0.5),600*(Math.random()-0.5)])
    }
    return returnarr;
}

//Ok so this seems to be working, the initial distribution and everything.
//TODO: Make the actual behavior for the circles! bumping and grouping together
//[DONE]
function leftshift(arr: Array<Array<number>>){
    return arr.map((smallarr) => [smallarr[0],smallarr[1]+10,smallarr[2]])
}

function mag(arr: Array<number>): number{
    return Math.sqrt(Math.pow(arr[1],2)+Math.pow(arr[2],2));
}

function sech(x: number): number{
    return 1/Math.cosh(x);
}

function radsort(pt: Array<number>, SortParameter: number): Array<number>{
    // key, x, y
    // literally just normalize the point so that its magnitude is equal to its energy(times 50)
    // take individual coordinates and multiply by a scalar
    let scalar: number = 0;
        if(mag(pt) != 0){
            scalar = 300*getdata(pt[0],SortParameter)/mag(pt);
        }
        return [pt[0], scalar*pt[1], scalar*pt[2]]
}

function linsort(pt: Array<number>, SortParameter: number, loggedin: boolean, curruser: number): Array<number>{
    let x = pt[1];
    if(loggedin && pt[0] == curruser){
        x = 0;
    }
    return [pt[0], x,300-(600*getdata(pt[0],SortParameter))] //trying to do it with 0 y instead of pt[2]
}

function getdata(index: number, index2: number): number{
    if(usersongparams.get(index) != undefined){
        let energarr: number[] | undefined = usersongparams.get(index)
        if(energarr){
            return energarr[index2];
        }
    }
    return 0;
}

function getdatastrings(index: number, index2: number): string{
    let datarr: string[] | undefined = userdatastrings.get(index)
        if(datarr){
            return datarr[index2];
        }
    return 'DATA NOT FOUND';
}

function getdatamatches(userindex: number, time: boolean, matchindex: number):  number{
    let timeindex = 0;
    if(time){
        timeindex = 1;
    }
    let datarr: number[][] | undefined = matchesdata.get(timeindex)
    if(datarr && datarr != undefined){
        if(datarr[timeindex] && datarr[timeindex] != undefined){
            if(datarr[timeindex][matchindex] && datarr[timeindex][matchindex] != undefined){
                return datarr[timeindex][matchindex];
            }
        }
    }
    return 0;
}

function repulse(p1: Array<number>, p2: Array<number>): Array<number>{
    let magdiff = mag([p1[0],p1[1]-p2[1],p1[2]-p2[2]]);
    if(magdiff == 0){
        return [p1[0],0,0]
    }
    else{
        //MIGHT HAVE TO TWEAK THIS VALUE
        let scalar = sech((1/repulsedist)*magdiff)/magdiff
        return [p1[0], scalar * (p1[1]-p2[1]), scalar*(p1[2]-p2[2])]
    }
}

function towardsort(pt: Array<number>, SortParameter: number, allpts: Array<Array<number>>, sortfunc: (inputarr: Array<number>, SortParameter: number, loggedin: boolean, curruser: number) => Array<number>, speed: number, loggedin: boolean, curruser: number): Array<number>{
    let newpt: Array<number> = sortfunc(pt, SortParameter, loggedin, curruser)
    //Move from pt to newpt
    //So we need to add repulsive force within here, probably add a second vector called repulsion and then add the two
    let vector: Array<number> = [pt[0],newpt[1]-pt[1],newpt[2]-pt[2]]
    let scalar: number = 0
    if(mag(vector)!=0){
        if(mag(vector)<speed*0.1){
            scalar = 1;
        }
        else{
            scalar = speed*0.1/mag(vector);
        }
    }
    let repx = 0;
    let repy = 0;

    for(let i = 0; i < allpts.length; i++){
        repx = repx + repulse(pt, allpts[i])[1]
        repy = repy + repulse(pt, allpts[i])[2]
    }
    return [vector[0],
    pt[1]+scalar*vector[1] + repulseval*repx,
    pt[2]+scalar*vector[2] + repulseval*repy]
}

function sortshift(pts: Array<Array<number>>, SortParameter: number, sortfunc: (inputarr: Array<number>, SortParameter: number, loggedin: boolean, curruser: number) => Array<number>, speed: number, loggedin: boolean, curruser: number):Array<Array<number>>{
    return pts.map((pt)=>towardsort(pt,SortParameter, pts, sortfunc, speed, loggedin, curruser))
}

function getsortmethod(index: number): ((inpt: Array<number>, SortParameter: number, loggedin: boolean, curruser: number)=> Array<number>){
    let returnfunc = sortstyle.get(index)
    if(returnfunc != undefined){
        return returnfunc
    }
    return radsort;
}

function getsortname(index: number): string{
    let returnstring = sortname.get(index)
    if(returnstring != undefined){
        return returnstring
    }
    return "";
}

function getparamname(index: number): string{
    let returnstring = parameternames.get(index)
    if(returnstring != undefined){
        return returnstring
    }
    return "";
}

function renderstroke(zoomed: boolean, datanum: number){
    if(zoomed){
        return "hsla(" + 200+90*datanum + ", 50%, 50%, 1)"
    }
    else{
        return "none"
    }
}

const tau = 2*Math.PI;

function digs(x: number){
    if (x==0){
        return 1;
    }
    else{
        return Math.floor(Math.log10(x))+1
    }
}

function paramstring(SelectIndex: number): string{
    let returnstring = "";
    parameternames.forEach((value: string, key: number) => {returnstring = returnstring + ( " " + value + ": " + getdata(SelectIndex, key))})
    return returnstring
}

function updatecamcenter(campt: number[], targpt: number[]): number[]{
    // so we need wherever it is and wherever it needs to go. Use a 1-sech(x) system
    // Again, we want a scalar and a nudge vector
    let nudgevec = [targpt[0]-campt[0],targpt[1]-campt[1],targpt[2]-campt[2]]
    if (mag(nudgevec)==0){
        return campt
    }
    else{
        let scalar = 0.05*(1-sech((1/1)*mag(nudgevec)))
        return [campt[0]+scalar*nudgevec[0],campt[1]+scalar*nudgevec[1],campt[2]+scalar*nudgevec[2]]
    }
}

function camtarg(A: number[],B: number[],zoomed: boolean): number[]{
    if (zoomed){
        return A;
    }
    return B;
}

function slidenum(bool: boolean){
    if (bool){
        return 1
    }
    else{
        return 0
    }
}

function sidebarloggedin(str: string): string{
    console.log(str)
    if (str == ""){
        return "hidden";
    }
    return "sidebar";
}

function fullyloggedin(bool: boolean, retstring: string): string{
    if(bool){
        return retstring
    }
    else{
        return "hidden"
    }
}

//TODO: add repulsive force
//TODO: add stats display!

//Make the GOL in react: https://dev.to/toluagboola/build-the-game-of-life-with-react-and-typescript-5e0d

export default function GraphVis(googleuser: string, spotifylinked: boolean) {
    let initarray: number[][] = initdist(usersongparams);
    const [CircleData, setCircleData] = useState<number[][]>(initarray);
    const [SelectIndex, setSelectIndex] = useState<number>(0);
    const [Timer, setTimer] = useState<number>(0);
    const [SortIndex, setSortIndex] = useState<number>(1);
    const [SortParameter, setSortParameter] = useState<number>(0);
    const [Speed, setSpeed] = useState<number>(10);
    const [ShowCircLabels, SetShowCircLabels] = useState<boolean>(true);
    const [camcenter, Setcamcenter] = useState<number[]>([1,0,0]); //scale, position x, position y
    const [zoomed, Setzoomed] = useState<boolean>(false);
    const [zoomval, Setzoomval] = useState<number>(0);
    const [alltime, Setalltime] = useState<boolean>(false);

    //TODO: Set these when you log in!

    const [loggedin, Setloggedin] = useState<boolean>(true);
    const [curruser, Setcurruser] = useState<number>(0);
    
    useEffect(() => {
        setCircleData(sortshift(CircleData, SortParameter, getsortmethod(SortIndex), Speed, loggedin, curruser))
        Setcamcenter(updatecamcenter(camcenter,
            //In reality we might want to center which user is you!
            camtarg([4,CircleData[SelectIndex][1],CircleData[SelectIndex][2]],
                [1,0,0],zoomed)))
        setTimer((Timer + 0.003) % 1)
        Setzoomval(1-((camcenter[0]-2)/2))
        document.documentElement.style.setProperty('--sidebar-mode', zoomval.toString());
        document.documentElement.style.setProperty('--timeslidermode', slidenum(alltime).toString());
    }, CircleData)
    
    const nums = [0,1,2,3,4,5];
    const xoffset = 25;
    //Make some sort of time update thing that lets you update circles and send their positions somewhere
    return <div className = "wrapper">
                <div className = {sidebarloggedin(googleuser)}>
                    <div className={fullyloggedin(spotifylinked,"defaultbar")}>
                        <h2>Who's on your wavelength?</h2>
                        <img className = "wavepic" src="https://i.ibb.co/V2Dmsx4/tuneinlogo.png" 
                        alt="tunein_logo"/>
                        <svg className = "matchesdisplay" width = "100%" height = "387.5">
                                 <rect className="timesliderbg"
                                    width = "175"
                                    height = "25"
                                    x= "11"
                                    y= "7"
                                    rx="5"
                                    ry="5"
                                    opacity = {(zoomval).toString()}
                                    >
                                </rect>
                                <rect className="timeslider"
                                    width = "75"
                                    height = "25"
                                    rx="5"
                                    ry="5"
                                    x = "10"
                                    y = "7"
                                    opacity = {(zoomval).toString()}
                                    >
                                </rect>
                                <text x= "20" y="24"
                                onClick={()=>
                                    {console.log("HEY");
                                    Setalltime(false)
                                    }
                                }> current</text>
                                <text x= "120" y="24"
                                onClick={()=>
                                    {console.log("YAH");
                                    Setalltime(true)
                                    }
                                }> all-time</text>
                                {[0,1,2,3,4].map((x)=>{
                                    let matchindex = x;
                                    return <rect 
                                    width = "175"
                                    height = "50"
                                    x= "11"
                                    y= {(45+70*x).toString()}
                                    rx="5"
                                    ry="5"
                                    opacity = {(zoomval).toString()}
                                    onClick= {() => {  
                                        setSelectIndex(getdatamatches(SelectIndex, alltime, matchindex))
                                        Setzoomed(true)
                                    }}>
                                    </rect>
                                })}
                                {[0,1,2,3,4].map((x2)=>{
                                    let matchindex = x2;
                                    return <text 
                                    x= "30"
                                    y= {(75+70*x2).toString()}
                                    opacity = {(zoomval).toString()}
                                    onClick= {() => {  
                                        setSelectIndex(getdatamatches(SelectIndex, alltime, matchindex))
                                        Setzoomed(true)
                                    }}>
                                    {getdatastrings(getdatamatches(SelectIndex, alltime, matchindex),0)}
                                    </text>
                                })}
                            </svg>
                    </div>
                    {[0].map(()=>{if(zoomval < 0.9){return <div className={fullyloggedin(spotifylinked,"userbar")}>
                        <h2>{"Song: " + getdatastrings(SelectIndex,1)}</h2>
                        <h3>{"artist: " + getdatastrings(SelectIndex,2)}</h3>
                        <p>{"user: " + getdatastrings(SelectIndex,0)}</p>
                        {/* TODO: Replace all of this with a simple map! */}
                        {/* [DONE]]: Add actual number labels for each circle! */}
                        {/* [DONE]]: Shift circles over to the right */}
                        {/* TODO: Make easing? maybe. Maybe not */}
                        <svg className = "paramdisplay" width = "100%" height = "500">
                            {nums.map((x)=>{
                                return <circle cx = {(200+xoffset).toString()} cy = {(40+70*x).toString()} r= "25" stroke = "#000000" strokeWidth = "5" 
                                fill = {"hsla(1,0%,100%," + (1-zoomval).toString() + ")"}
                                stroke-opacity = {(1-zoomval).toString()}
                                />
                            })}
                            {nums.map((x)=>{
                                return <path
                                d={"M " + (200+xoffset).toString() + " " + (15 + 70*x).toString() + " a 25 25 0 0 1 0 50 a 25 25 0 0 1 0 -50"}
                                fill="none"
                                stroke={"hsla(" + 90*getdata(SelectIndex,x) + ", 100%, 40%, 1)"}
                                stroke-width="5"
                                stroke-dasharray={getdata(SelectIndex,x)*157.079632679 + ", 157.079632679"}
                                opacity = {(1-zoomval).toString()}
                                />
                            })}
                            {nums.map((x)=>{
                                return <text fontSize="18" x = {(182+xoffset).toString()} y = {45+70*x} opacity = {(1-zoomval).toString()}>
                                    {Math.round(getdata(SelectIndex,x)*100) + "%"}</text>
                            })}
                            {nums.map((x)=>{
                                return <text className = "whitetext" x= "20" y= {(50 + 70*x).toString()}> {getparamname(x)+":"} </text>
                            })}
                        </svg>
                    </div>
                }

                })}
                </div>
                {/* <p>{paramstring(SelectIndex)}
                </p> */}
                <svg className="svgwindow" fill = "true"
                 width="100%" height="600" >
                    {/* render the circles */}
                    {[0,1,2,3].map((num) => 
                        {if (loggedin){
                        return <circle 
                        key= "usercircleoutline" 
                        cx= {camcenter[0]*(CircleData[curruser][1]-camcenter[1])+centerx} cy= {camcenter[0]*(CircleData[curruser][2]-camcenter[2])+300} 
                        r={camcenter[0]*(20+10*num) + 4*Math.sin(0.1*CircleData[curruser][0]+tau*Timer)} 
                        fill="none"
                        stroke = "hsla(0 100% 100%)"
                        strokeWidth = "1"
                        >
                        </circle>
                        }}
                    )}
                    {[0,1].map((num) => 
                        {
                        return <circle 
                        key= "selectedcircleoutline" 
                        cx= {camcenter[0]*(CircleData[SelectIndex][1]-camcenter[1])+centerx} cy= {camcenter[0]*(CircleData[SelectIndex][2]-camcenter[2])+300} 
                        r={camcenter[0]*20 + 20 + 20*num + 10*Math.sin(0.1*CircleData[curruser][0]+tau*Timer)} 
                        fill="none"
                        stroke = {renderstroke(zoomed,getdata(SelectIndex,SortParameter))}
                        strokeWidth = "2"
                        >
                        </circle>
                        }
                    )}
                    {CircleData.map((entry) => 
                        <circle 
                        onClick= {() => {
                            Setzoomed(true);
                            console.log("circle " + entry[0] + " clicked");
                            setSelectIndex(entry[0])
                        }} 
                        key= {entry[0]} 
                        cx= {camcenter[0]*(entry[1]-camcenter[1])+centerx} cy= {camcenter[0]*(entry[2]-camcenter[2])+300} 
                        r={camcenter[0]*20 + 4*Math.sin(0.1*entry[0]+tau*Timer)} fill={"hsla(" + 200+90*getdata(entry[0],SortParameter) + ", 50%, 50%, 1)"}
                        stroke = "none"
                        strokeWidth = "5"
                        >
                        </circle>
                    )}
                    {}
                    {<rect 
                        width = "150"
                        height = "50"
                        x= "10"
                        y= "10"
                        rx="5"
                        ry="5"
                        opacity = {camcenter[0]-1}
                        onClick= {() => {  
                            // update the circle positions
                            Setzoomed(false);
                        }}>
                        </rect>}
                        {<text 
                        className = "whitetext"
                        x= "42"
                        y= "42"
                        opacity = {camcenter[0]-1}
                        onClick= {() => {  
                            // update the circle positions
                            Setzoomed(false);
                        }}>
                            Zoom out
                        </text>}
                    {CircleData.map((entry) => 
                        {if(ShowCircLabels){
                            return (<text 
                        //         cx= {camcenter[0]*(CircleData[curruser][1]-camcenter[1])+centerx} cy= {camcenter[0]*(CircleData[curruser][2]-camcenter[2])+300} 
                        // r={camcenter[0]*(20+10*num) + 4*Math.sin(0.1*CircleData[curruser][0]+tau*Timer)} 
                                x={camcenter[0]*(entry[1]-24-camcenter[1])+centerx} 
                                y={camcenter[0]*(entry[2]-22-camcenter[2])+300} 
                                fontSize={camcenter[0]*10}
                        className="small"
                        onClick= {() => {
                            console.log("circle " + entry[0] + " clicked");
                            setSelectIndex(entry[0])
                        }} >
                        {/* DISPLAY USERNAME */}
                        {getdatastrings(entry[0],0)}</text>)}}
                    )}
                </svg>
                <div className = "button stuff">
                    <button onClick= {() => {  
                        // update the circle positions
                        setCircleData(initarray);
                    }}>
                        {"Reset"}
                    </button>
                    <button onClick= {() => {  
                        // update the circle positions
                        SetShowCircLabels(!ShowCircLabels);
                    }}>
                        {"Toggle Circle Labels"}
                    </button>
                    {/* Note: We can't change the size of the circdata array, react won't allow it */}
                    <button onClick= {() => {  
                            // update the circle positions
                            console.log(SortIndex)
                            setSortIndex((SortIndex + 1) % sortstyle.size);
                        }}>
                            {"Change display method"}
                    </button>
                    <button onClick= {() => {  
                            // update the circle positions
                            setSortParameter((SortParameter + 1) % parameternames.size);
                        }}>
                            {"Change sorting parameter"}
                    </button>
                    <p>{"Sort style: " + getsortname(SortIndex) + " Sort parameter: " + getparamname(SortParameter)}</p>
                </div>
                {/* <div className = "beegslider">
                    <ReactSlider
                        className="horizontal-slider"
                        thumbClassName="example-thumb"
                        trackClassName="example-track"
                        defaultValue={[50]}
                        ariaLabel={["Thumb"]}
                        ariaValuetext={state => `Thumb value ${state.valueNow}`}
                        renderThumb={(props, state) => {setSpeed(0.1*state.valueNow); return <div {...props}>{state.valueNow}</div>}}
                        pearling
                        minDistance={10}
                    />
                </div> */}
            </div>
            
}

{/* {circledata.map((circx,circy)=>
    <circle cx= "circx" cy= "circy" r="80" fill="none" stroke="#000000" stroke-width="10"/>)} */}