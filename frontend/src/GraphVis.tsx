import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import { isTupleTypeNode } from 'typescript';
import Slider from './Slider'
import ReactSlider from "react-slider";
import * as d3 from 'd3';
import ReactDOM from 'react-dom';
import { range, svg } from 'd3';
import { isVisible } from '@testing-library/user-event/dist/utils';
import { updateuserdata } from './backendhandler';
import { firebaseConfig } from './private/firebaseconfig';
import { getFirestore } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

//NOTE: login function is currently set to be permanently logged in for the sake of testing and because
//firebase is down.

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
//[DONE]: Account for when the google user is not logged in but the spotify is already linked
//[DONE]: Make google thing vanish after you've logged in
//[DONE]: Make the website actually look the way we want it to
//[DONE]: FIX THE INFINITE LOOP PLEASE
//[DONE]: make a button to change the sorting parameter!

//FRONTEND TODO:
//TODO: Aria label the heck out of everything
//TODO: Turn off the user outline circles when you aren't logged in
//TODO: Add a pretty gradient bar on the side to denote how things are being sorted from bottom to top
//TODO: CLEAN UP AND TEST

//INTEGRATION TODO:
//TODO: Set these when you log in!
//TODO: Get frontend to communicate with backend
    //TODO: Make current user index update when you log in! Edit the initdist functions

// A map from a user's number/index to the numerical data of their last listened to last song, in the following order:
// Acousticness, Danceability, Energy, Instrumentalness, Speechiness, Valence
let usersongparams: Map<number, Array<number>> = new Map<number, Array<number>>();

// A map from a user's number/index to their string data, in the following order:
// Username, name of most recently listened to song, artist of most recently listened to song
let userdatastrings: Map<number, Array<string>> = new Map<number, Array<string>>();

// The current user's top 5 user matches, in the following order:
// Current top 5 matches, All time top 5 matches
let matchesdata: Map<number, Array<Array<number>>> = new Map<number, Array<Array<number>>>();

// Number of mocked users to display. Can go up to 1000 without significant slowdowns.
let maxnum = 150;

// x-center of the svg window
let centerx = 600;

// The radius of the filtering circle around each point 
// that is used to cut down on how many repulsive forces we must calculate
const calcdist = 200

// A scalar for the repulsive force each bubble exerts on the others
let repulseval = 1.5;

// The distance between bubbles at which the repulsive force begins
let repulsedist = 40;

// A map indexing the visual sorting method of the bubbles on the page with a number key. 
// Currently we only use a linear sort from top to bottom for the sake of visual clarity.
const sortstyle: Map<number, (inpt: Array<number>, SortParameter: number, loggedin: boolean, curruser: number) => Array<number>> = new Map<number, (inpt: Array<number>) => Array<number>>();

// A map indexing the name of the visual sorting method with a number key. We use this primarily for dev tools
const sortname: Map<number, string> = new Map<number, string>();

// A map indexing the name of each song data parameter(acousticness, energy, etc) with a number key for the user.
const parameternames: Map<number, string> = new Map<number, string>();

// Filling the sort style map with our sort functions
sortstyle.set(0,radsort);
sortstyle.set(1,linsort);

// Filling the sort name map with the names of our sort functions
sortname.set(0,"radial sort");
sortname.set(1,"linear sort");

// Filling the parameter name map with the names of our song data parameters
parameternames.set(0,"Acousticness");
parameternames.set(1,"Danceability");
parameternames.set(2,"Energy");
parameternames.set(3,"Instrumentalness");
parameternames.set(4,"Speechiness");
parameternames.set(5,"Valence");

// A function for generating a random string with alternating vowels and consonants for our fake usernames and fake song names.
// I didn't have to alternate vowels and consonants, but it's more entertaining when the names are pronounceable.
// Makes long hours of debugging feel less grey.
function genrandomstring(length: number): string{
    let result: string = '';
    const consonants: string = 'bcdfghjklmnpqrstvwxyz';
    const vowels: string = 'aeiou';
    for ( var i = 0; i < length; i++ ) {
        if(i%2 == 0){
            // If i is even, add a consonant.
            result += consonants.charAt(Math.floor(Math.random() * 20));
        }
        else{
            // If i is odd, add a vowel.
            result += vowels.charAt(Math.floor(Math.random() * 5));
        }
    }
    return result;
}

// A function takes maxnum and randomly generates that many user coordinates across our screen.
// The general template for a set of "user coordinates" is as follows:
// [<user index number>, <user x position>, <user y position>]
// The x and y position are used and updated to make the user bubbles move across the screen,
// while the user index is used to identify each bubble with an actual user's data
function initdist(num: number): Array<Array<number>>{
    let returnarr: Array<Array<number>> = new Array<Array<number>>();
    for(let i = 0; i < num; i++){
        // Add a randomly generated user coordinate to the stack
        returnarr.push([i,1500*(Math.random()-0.5),600*(Math.random()-0.5)])
    }
    return returnarr;
}

// A function that takes in a coordinate array and returns its magnitude from the origin.
// Useful later on when calculating attractive and repulsive distance between bubbles and their targets.
function mag(userarr: Array<number>): number{
    return Math.sqrt(Math.pow(userarr[1],2)+Math.pow(userarr[2],2));
}

// A function for the hyperbolic secant, a handy little easing function that I use for literally everything.
// Sech(x) is close to zero for all x where |x| > 4, but when x gets closer within that range, sech(x)
// forms a symmetrical bump that has a maximum height of 1 at x = 0.
// This is great for when you're trying to get a point to approach some target- if you made the point always
// take a step of magnitude 1 in the direction of the target, when it gets to the target it will jitter back
// and forth endlessly, since it will constantly overshoot each time.
// If we instead set the step size to be 1 - sech(dist), where dist is the distance between the point and the target,
// we can make it so that the point still takes steps of size 1 until it gets sufficiently close, at which point its step size
// will slowly decrease as it approaches the target, aka the point slows to a smooth stop.
function sech(x: number): number{
    // Such a short function for such a lengthy explanation! Haha
    return 1/Math.cosh(x);
}

// Simply put: 
// A sorting function that takes a user coordinate and a song data value associated with it and returns
// a point on the circle with radius proportional to that data value. 
// In actuality/nuances: this function doesn't directly take in the song data value, it takes in the index that 
// points to the value of that point's song data value and uses that to get the data value.
// Result: points with low data values go to the middle of the screen, while points with higher data values remain further away
function radsort(pt: Array<number>, SortParameterIndex: number): Array<number>{
    let scalar: number = 0;
        if(mag(pt) != 0){
            // Here, we scale up our point to be 800 times further away from the origin to fit the screen dimensions.
            // This is necessary because our song data value is always within the range [0,1], and a unit circle is tiny onscreen.
            scalar = 800*getdata(pt[0],SortParameterIndex)/mag(pt);
        }
        return [pt[0], scalar*pt[1], scalar*pt[2]]
}

// Simply put: A sorting function that takes in a user coordinate and a song data value associated with it and returns 
// a point with the same x coordinate, but the y coordinate is determined by the song data value.
// In actuality/nuances: Like the previous function, we only take in the sort parameter index, not the actual data value itself
// We also make sure that the points' x values don't accidentally go off screen, since all points repulse each other.
// Finally, if a user is logged in and this is their point, we make sure that it is centered horizontally so it is easier to see.
// Result: points with low data values sit lower on the screen, while points with higher data values sit higher on the screen.
function linsort(pt: Array<number>, SortParameterIndex: number, loggedin: boolean, curruser: number): Array<number>{
    // Maximum horizontal distance a point is allowed to get from the middle of the screen. 
    // Thought about making this interactively scale with the window size but ultimately decided 
    // it wasn't worth creating an entire React myRef variable for something this subtle.
    const maxwidth = 400;
    let x = pt[1];
    if(pt[0] < 0){
        return [-1,-1000,-1000]
    }
    // correct for if the point ends up out of horizontal bounds
    if (pt[1] < (-1)*maxwidth){
        x = (-1)*maxwidth;
    }
    else if (pt[1] > maxwidth){
        x = maxwidth
    }
    // Center the point horizontally if it is the current user
    if(loggedin && pt[0] == curruser){
        x = 0;
    }
    return [pt[0], x,300-(600*getdata(pt[0],SortParameterIndex))] //trying to do it with 0 y instead of pt[2]
}

// Simple boilerplate function for fetching the paramindex'th song data value of the userindex'th user.
// Returns NaN if no entry exists for that key
function getdata(userindex: number, paramindex: number): number{
    if(usersongparams.get(userindex) != undefined){
        let paramarr: number[] | undefined = usersongparams.get(userindex)
        if(paramarr){
            return paramarr[paramindex];
        }
    }
    return NaN;
}

// Simple boilerplate function for fetching the stringdex'th string data value of the userindex'th user.
// Returns 'DATA NOT FOUND' if no entry exists for that key
function getdatastrings(userindex: number, stringdex: number): string{
    let datarr: string[] | undefined = userdatastrings.get(userindex)
        if(datarr){
            return datarr[stringdex];
        }
    return 'DATA NOT FOUND';
}

// Simple boilerplate function for fetching the matchindex'th match of the userindex'th user.
// This will either be out of all time top 5 matches, or current top 5 matches, depending on the "time" boolean.
// Returns NaN if no entry exists for any of the requested values.
function getdatamatches(userindex: number, time: boolean, matchindex: number):  number{
    let timeindex = 0;
    if(time){
        timeindex = 1;
    }
    let datarr: number[][] | undefined = matchesdata.get(userindex)
    if(datarr != undefined){
        if(datarr[timeindex] != undefined){
            if(datarr[timeindex][matchindex] != undefined){
                return datarr[timeindex][matchindex];
            }
        }
    }
    return NaN;
}

// Simple boilerplate function for getting the name of the index'th sorting function. 
// Returns 'SORT NAME NOT FOUND' if no value could be found.
function getsortname(index: number): string{
    let returnstring = sortname.get(index)
    if(returnstring != undefined){
        return returnstring
    }
    return 'SORT NAME NOT FOUND';
}

// Simple boilerplate function for getting the name of the index'th song parameter. 
// Returns 'PARAMETER NAME NOT FOUND' if no value could be found.
function getparamname(index: number): string{
    let returnstring = parameternames.get(index)
    if(returnstring != undefined){
        return returnstring
    }
    return "PARAMETER NAME NOT FOUND";
}

// Boilerplate function to get the sorting method function given its index
function getsortmethod(index: number): ((inpt: Array<number>, SortParameter: number, loggedin: boolean, curruser: number)=> Array<number>){
    let returnfunc = sortstyle.get(index)
    if(returnfunc != undefined){
        return returnfunc
    }
    return radsort;
}

// Back to fun stuff! Given a point p1 and another point p2, this function returns a bump vector pointing away from p2.
// The bump vector's size relies on the distance between p1 and p2, and is calculated with our lovely sech(x) function.
function repulse(p1: Array<number>, p2: Array<number>): Array<number>{
    // The distance between points p1 and p2
    let magdiff = mag([p1[0],p1[1]-p2[1],p1[2]-p2[2]]);
    if(magdiff == 0){
        return [0,0]
    }
    else{
        // Use the sech function to calculate the scale of the repulsion vector based on the distance between the two points
        let scalar = sech((1/repulsedist)*magdiff)/magdiff
        // Return a vector
        return [scalar * (p1[1]-p2[1]), scalar*(p1[2]-p2[2])]
    }
}

// Given a single point, a sorting parameter, a list of all points onscreen, a function to sort by, and a scaling factor for speed, 
// this function calculates the attractive force between the point and its target(determined by the sorting function), as well
// as all of the repulsive forces acting on it. Adds these vectors together and spits out the point's new position.
function towardsort(pt: Array<number>, SortParameter: number, allpts: Array<Array<number>>, sortfunc: (inputarr: Array<number>, SortParameter: number, loggedin: boolean, curruser: number) => Array<number>, speed: number, loggedin: boolean, curruser: number): Array<number>{
    // Get the coordinates of the point we want
    const targpt: Array<number> = sortfunc(pt, SortParameter, loggedin, curruser)
    // Make a vector from the points' distances
    const vector: Array<number> = [pt[0],targpt[1]-pt[1],targpt[2]-pt[2]]
    let scalar: number = 0
    // Scale our vector according to our speed variable
    if(mag(vector)!=0){
        if(mag(vector)<speed*0.1){
            scalar = 1;
        }
        else{
            scalar = speed*0.1/mag(vector);
        }
    }

    // Initializing repulsive force vector
    let repx = 0;
    let repy = 0;

    // Add up all of the repulsive forces between pt and all other points in allpts
    for(let i = 0; i < allpts.length; i++){
        // Only be repulsed by a point if it's within a radius of calcdist. Cuts down on computing time.
        if(mag([0,pt[1]-allpts[i][1],pt[2]-allpts[i][2]]) < calcdist){
            repx = repx + repulse(pt, allpts[i])[0]
            repy = repy + repulse(pt, allpts[i])[1]
        }
    }
    // Nudge the point according to attractive and repulsive forces
    return [vector[0],
    pt[1]+scalar*vector[1] + repulseval*repx,
    pt[2]+scalar*vector[2] + repulseval*repy]
}

// Take all points onscreen and move them by one step based on their attractive and repulsive forces
function sortshift(pts: Array<Array<number>>, SortParameter: number, sortfunc: (inputarr: Array<number>, SortParameter: number, loggedin: boolean, curruser: number) => Array<number>, speed: number, loggedin: boolean, curruser: number):Array<Array<number>>{
    return pts.map((pt)=>towardsort(pt,SortParameter, pts, sortfunc, speed, loggedin, curruser))
}

// Simple function for returning the stroke color of the circles surrounding a selected user based on 
// whether or not the user has been selected on screen
function renderstroke(showselected: boolean, datanum: number){
    if(showselected){
        return "hsla(" + 200+90*datanum + ", 50%, 50%, 1)"
    }
    else{
        return "none"
    }
}

// Tau is always useful! We use it in our useEffect loop to make our points pulse on screen via a sine function.
const tau = 2*Math.PI;

// A function that returns the number of digits in a number(base 10). Used for determining the size of the text box needed to
// display certain numbers onscreen. Mostly relevant for debugging purposes.
function digs(x: number){
    if (x==0){
        return 1;
    }
    else{
        return Math.floor(Math.log10(x))+1
    }
}

// A function that takes the current camera state(an array with format [<zoom factor>,<x center>,<y center>]) 
// and a target camera state and moves the current camera state one step towards the desired camera state.
// This is used for moving the camera whenever you select and zoom out from points. Also uses our lovely sech function!
function updatecamcenter(campt: number[], targpt: number[]): number[]{
    // Make a vector from the difference between targpt and campt
    let nudgevec = [targpt[0]-campt[0],targpt[1]-campt[1],targpt[2]-campt[2]]
    if (mag(nudgevec)==0){
        return campt
    }
    else{
        // Scale and nudge the camera towards the target
        let scalar = 0.05*(1-sech((1/1)*mag(nudgevec)))
        return [campt[0]+scalar*nudgevec[0],campt[1]+scalar*nudgevec[1],campt[2]+scalar*nudgevec[2]]
    }
}

// Super simple function that takes in two points and a boolean and returns the first if the boolean is true, second if false.
// Used for setting the target of our camera based on if a point is selected or not.
function camtarg(A: number[],B: number[],selected: boolean): number[]{
    if (selected){
        return A;
    }
    return B;
}

// Super simple function for returning a 1 or 0 based on a boolean. 
// Annoying but necessary for setting the transform/display mode of our sidebar elements when we
// select and unselect a user.
function slidenum(bool: boolean){
    if (bool){
        return 1
    }
    else{
        return 0
    }
}

// Another simple function for determining whether or not we should display the sidebar.
// Only returns "sidebar" element class name when the current google user ID passed in is nonempty.
function sidebarloggedin(str: string): string{
    if (str == ""){
        return "hidden";
    }
    return "sidebar";
}

// A nearly identical function used for showing and hiding sidebar elements based on whether or not we've logged in to spotify.
// Takes in the success class name as a parameter since we use this on two elements with different class names.
function fullyloggedin(bool: boolean, classname: string): string{
    if(bool){
        return classname
    }
    else{
        return "hidden"
    }
}

//SETUP ORDER:
//Run getsongfeatures once to load everyone's songs
//Get a hashmap of user IDs to numbers
//Enter a for loop for each user ID in the set, populate local hashmaps with the returned data
//Get the current user's matches[this can really go anywhere in the list]

// fetch("http://localhost:3232/load-song-features")

let userIDs: Array<string> = ["pDtZBPn7kCYsYSRO83QhlpkBZkM2","RaJCoYqztldz3vK5jxbFUkyKbAZ2",
"TnmTYrO7ujYN0HtKAGZHla9No672"];

//This returns a promise that will only resolve when all users' data have been updated
async function setuserdata(): Promise<void[]>{
    const range: Array<number> = Array.from(Array(userIDs.length).keys())
    const promises: Array<Promise<void>> = range.map((i:number)=>{
        return updateuserdata(i, userIDs,usersongparams,userdatastrings,matchesdata)})
    return Promise.all(promises)
}

// Our main rendering function. Returns everything below the header in our app.
// Takes in the current google user ID and whether or not spotify is linked, as these affect which elements are rendered.

// Here's an outline of the general structure of this function since it's so large:
// -State variables
// -UseEffect main loop
// -Other variables
// Huuuuge return statement:
// -Main wrapper
//      -Sidebar wrapper
//          -Default sidebar(zoomed out state)
//          -User sidebar(zoomed in state)
//      -Main user visualizer wrapper
//          -Current user circle outline
//          -Selected user circle outline
//          -All user bubbles
//          -Use bubble labels
//          -On-screen buttons(change parameter to sort by, zoom out)
//      -Developer tool buttons

export default function GraphVis(googleuser: string, spotifylinked: boolean) {
    // All of our wonderful react state variables
    const [CircleData, setCircleData] = useState<number[][]>([]);
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
    const [usersloaded, setusersloaded] = useState<boolean>(false);

    // Current user index. Currently set to default value of 0.
    const [curruser, Setcurruser] = useState<number>(0);

    const [fetchingusers, setfetchingusers] = useState<boolean>(false);
    if(!usersloaded && !fetchingusers){
        setfetchingusers(true)
        fetch("http://localhost:3232/get-all-user-ids").then((respjson)=>{respjson.json().then((respobj)=>{
            userIDs = respobj.ids
            setuserdata().then(()=>
            {
                setusersloaded(true)
                //Why is this running multiple times? Ah. yes.
                setCircleData(initdist(userIDs.length))
            })
            // console.log(userIDs)
        })})
    }

    // Main useEffect loop! Had to use a setInterval to stop React from reaching its max update depth and freaking out.
    useEffect(() => {
        const interval = setInterval(() => {
            if(usersloaded){
            setCircleData(sortshift(CircleData, SortParameter, getsortmethod(SortIndex), Speed, spotifylinked, curruser))
            Setcamcenter(updatecamcenter(camcenter,
            camtarg([4,CircleData[SelectIndex][1],CircleData[SelectIndex][2]],
                 [1,0,0],zoomed)))
            setTimer((Timer + 0.003) % 1)
             Setzoomval(1-((camcenter[0]-2)/2))
            document.documentElement.style.setProperty('--sidebar-mode', zoomval.toString());
            document.documentElement.style.setProperty('--timeslidermode', slidenum(alltime).toString());
            // console.log(CircleData)
            }
          }, 10);
           return () => clearInterval(interval);
    }, [CircleData])

    // Main return statement
    if (!usersloaded){
        return <div key = "wrapper" className = "wrapper"/>
    }
    return <div key = "wrapper" className = "wrapper">
                {/* Sidebar background */}
                <div key = "sidebardiv" className = {sidebarloggedin(googleuser)}>
                    {/* defaultbar, aka zoomed out sidebar panel */}
                    <div key = "defaultbar" className = {fullyloggedin(spotifylinked,"defaultbar")}>
                        <h2>Who's on your wavelength?</h2>
                        {/* lovely wave logo made in Desmos */}
                        <img className = "wavepic" src="https://i.ibb.co/V2Dmsx4/tuneinlogo.png" 
                        alt="tunein_logo"/>
                        {/* user matches display window */}
                        <svg className = "matchesdisplay" width = "100%" height = "387.5">
                                {/* time slider toggles */}
                                 <rect 
                                    key = "timesliderbg"
                                    className="timesliderbg"
                                    width = "175"
                                    height = "25"
                                    x= "11"
                                    y= "10"
                                    rx="5"
                                    ry="5"
                                    opacity = {(zoomval).toString()}
                                    >
                                </rect>
                                <rect
                                    key = "timeslider" 
                                    className="timeslider"
                                    width = "75"
                                    height = "25"
                                    rx="5"
                                    ry="5"
                                    x = "10"
                                    y = "10"
                                    opacity = {(zoomval).toString()}
                                    >
                                </rect>
                                <text 
                                key = "currenttime"
                                x= "20" y="27"
                                onClick={()=>
                                    {console.log("HEY");
                                    Setalltime(false)
                                    }
                                }> current</text>
                                <text 
                                key = "alltime"
                                x= "120" y="27"
                                onClick={()=>
                                    {console.log("YAH");
                                    Setalltime(true)
                                    }
                                }> all-time</text>
                                {/* user matches display */}
                                {[0,1,2,3,4].map((x)=>{
                                    let matchindex = x;
                                    return <rect 
                                    key = {"matchesbar_"+x.toString()}
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
                                    key = {"matchuser_"+x2.toString()}
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
                    {/* userbar, aka zoomed in sidebar panel */}  
                    <div key = "userbar" className={fullyloggedin(zoomed,"userbar")}>
                        {/* main song string info */}
                        <h2>{getdatastrings(SelectIndex,1)}</h2>
                        <h3>{"by " + getdatastrings(SelectIndex,2)}</h3>
                        <p>{"user: " + getdatastrings(SelectIndex,0)}</p>
                        {/* song data value display */}
                        <svg id="paramdisplay" className = "paramdisplay" width = "100%" height = "500">
                            {[0,1,2,3,4,5].map((x)=>{
                                return <circle 
                                key = {"paramcirclebg_"+x.toString()}
                                cx = "225" cy = {(40+70*x).toString()} r= "25" stroke = "#000000" strokeWidth = "5" 
                                fill = {"hsla(1,0%,100%," + (1-zoomval).toString() + ")"}
                                strokeOpacity = {(1-zoomval).toString()}
                                />
                            })}
                            {[0,1,2,3,4,5].map((x)=>{
                                return <path
                                key = {"percentagearc_"+x.toString()}
                                d={"M 225 " + (15 + 70*x).toString() + " a 25 25 0 0 1 0 50 a 25 25 0 0 1 0 -50"}
                                fill="none"
                                stroke={"hsla(" + 90*getdata(SelectIndex,x) + ", 100%, 40%, 1)"}
                                strokeWidth="5"
                                strokeDasharray={getdata(SelectIndex,x)*157.079632679 + ", 157.079632679"}
                                opacity = {(1-zoomval).toString()}
                                />
                            })}
                            {[0,1,2,3,4,5].map((x)=>{
                                return <text key = {"userdata_"+x.toString()}
                                fontSize="18" x = "207" y = {45+70*x} opacity = {(1-zoomval).toString()}>
                                    {Math.round(getdata(SelectIndex,x)*100) + "%"}</text>
                            })}
                            {[0,1,2,3,4,5].map((x)=>{
                                return <text key = {"parameterlabel_"+x.toString()}
                                className = "whitetext" x= "20" y= {(50 + 70*x).toString()}> {getparamname(x)+":"} </text>
                            })}
                        </svg>
                    </div>
                </div>
                {/* user bubble display */}
                <svg className="svgwindow" fill = "true"
                 width="100%" height="600" >
                    {/* current user outline circles */}
                    {[0,1,2,3].map((num) => 
                        {if (spotifylinked){
                        return <circle 
                        key= {"usercircleoutline_"+num.toString()} 
                        cx= {camcenter[0]*(CircleData[curruser][1]-camcenter[1])+centerx} cy= {camcenter[0]*(CircleData[curruser][2]-camcenter[2])+300} 
                        r={camcenter[0]*(20+10*num) + 4*Math.sin(0.1*CircleData[curruser][0]+tau*Timer)} 
                        fill="none"
                        stroke = "hsla(0 100% 100%)"
                        strokeWidth = "1"
                        >
                        </circle>
                        }}
                    )}
                    {/* selected user outline circles */}
                    {[0,1].map((num) => 
                        {
                        return <circle 
                        key= {"selectedcircleoutline_"+num.toString()} 
                        cx= {camcenter[0]*(CircleData[SelectIndex][1]-camcenter[1])+centerx} cy= {camcenter[0]*(CircleData[SelectIndex][2]-camcenter[2])+300} 
                        r={camcenter[0]*20 + 20 + 20*num + 10*Math.sin(0.1*CircleData[curruser][0]+tau*Timer)} 
                        fill="none"
                        stroke = {renderstroke(zoomed,getdata(SelectIndex,SortParameter))}
                        strokeWidth = "2"
                        >
                        </circle>
                        }
                    )}
                    {/* all user bubbles */}
                    {CircleData.map((entry) => {
                        if (Number.isNaN(entry[1])){
                            return null
                        }
                        else{
                        return <circle 
                        key= {entry[0]} 
                        className = {entry[0].toString()} 
                        cx= {camcenter[0]*(entry[1]-camcenter[1])+centerx} cy= {camcenter[0]*(entry[2]-camcenter[2])+300} 
                        r={camcenter[0]*20 + 4*Math.sin(0.1*entry[0]+tau*Timer)} fill={"hsla(" + 200+90*getdata(entry[0],SortParameter) + ", 50%, 50%, 1)"}
                        stroke = "none"
                        strokeWidth = "5"
                        onClick= {() => {
                            Setzoomed(true);
                            console.log("circle " + entry[0] + " clicked");
                            setSelectIndex(entry[0])
                        }}
                        />
                    }

                    })}
                    {/* username tags for displayed bubbles */}
                    {CircleData.map((entry) => 
                        {if(ShowCircLabels){
                            return (<text 
                                key = {"username_"+entry[0].toString()}
                                x={camcenter[0]*(entry[1]-24-camcenter[1])+centerx} 
                                y={camcenter[0]*(entry[2]-24-camcenter[2])+300} 
                                fontSize={camcenter[0]*10}
                        className="small"
                        onClick= {() => {
                            console.log("circle " + entry[0] + " clicked");
                            setSelectIndex(entry[0])
                        }} >
                        {getdatastrings(entry[0],0)}</text>)}}
                    )}
                    {/* button for changing the parameter we sort by */}
                    {<rect 
                        key = "paramsortbutton"
                        width = {(140+9*getparamname(SortParameter).length).toString()}
                        height = "50"
                        x= "10"
                        y= "10"
                        rx="5"
                        ry="5"
                        onClick= {() => {  
                            // change the parameter sorting mode
                            setSortParameter((SortParameter + 1) % parameternames.size);
                        }}>
                        </rect>}
                        {<text 
                        key = "paramsorttext"
                        className = "whitetext"
                        x= "20"
                        y= "42"
                        onClick= {() => {  
                            // change the parameter sorting mode
                            setSortParameter((SortParameter + 1) % parameternames.size);
                        }}>
                            {"Sorting by: " + getparamname(SortParameter)}
                        </text>}
                    {/* button for zooming the camera out after we've clicked a bubble */}
                    {<rect 
                        key = "zoomoutbutton"
                        width = "150"
                        height = "50"
                        x= "10"
                        y= "70"
                        rx="5"
                        ry="5"
                        opacity = {camcenter[0]-1.1}
                        onClick= {() => {  
                            Setzoomed(false);
                        }}>
                        </rect>}
                        {<text 
                        key = "zoomouttext"
                        className = "whitetext"
                        x= "42"
                        y= "102"
                        opacity = {camcenter[0]-1.1}
                        onClick= {() => {  
                            Setzoomed(false);
                        }}>
                            Zoom out
                        </text>}
                </svg>
                {/* misc. developer tools. Kept for debugging purposes, nothing here is dangerous or alters the actual data,
                 which is why I've simply hidden it instead of omitting it completely via some boolean function */}
                <div key = "developer stuff" className = "hidden">
                    <button onClick= {() => {  
                        // Toggle usernames on and off
                        SetShowCircLabels(!ShowCircLabels);
                    }}>
                        {"Toggle Circle Labels"}
                    </button>
                    {/* Note: We can't change the size of the circdata array, react won't allow it */}
                    <button onClick= {() => {  
                            // Change the sorting style between linear and radial, or some other sorting function if we decide to add more.
                            console.log(SortIndex)
                            setSortIndex((SortIndex + 1) % sortstyle.size);
                        }}>
                            {"Change display method"}
                    </button>
                    {/* Simple display paragraph so we can see what method we're sorting everything by. 
                    Currently unecessary since we're only sorting the points linearly*/}
                    <p>{"Sort style: " + getsortname(SortIndex) + " Sort parameter: " + getparamname(SortParameter)}</p>
                </div>
            </div>
            
}