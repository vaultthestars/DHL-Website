import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import { isTupleTypeNode } from 'typescript';

//TODO: We need to be able to render a whole ton of circles.
//For whatever reason, this is causing us a lot of problems. Trying to create a map gives us a warning that the map items could be null, which is a huge
//pain in the ass. Try doing it with arrays instead.
// Point data format: ID/key, cx, cy
// Have a separate map from ID/key to energy, something, something else, something else, etc.

let userdata: Map<number, Array<number>> = new Map<number, Array<number>>();

let maxnum = 40;

for(let i = 0; i < maxnum; i++){
    userdata.set(i,[Math.random(),Math.random(),Math.random()])
}

function initdist(initdata: Map<number, Array<number>>): Array<Array<number>>{
    let returnarr: Array<Array<number>> = new Array<Array<number>>();
    for(let i = 0; i < initdata.size; i++){
        returnarr.push([i,800*(Math.random()-0.5),600*(Math.random()-0.5)])
    }
    return returnarr;
}

//Ok so this seems to be working, the initial distribution and everything.
//TODO: Make the actual behavior for the circles! bumping and grouping together

function leftshift(arr: Array<Array<number>>){
    return arr.map((smallarr) => [smallarr[0],smallarr[1]+10,smallarr[2]])
}

function mag(arr: Array<number>): number{
    return Math.sqrt(Math.pow(arr[1],2)+Math.pow(arr[2],2));
}

function sech(x: number): number{
    return 1/Math.cosh(x);
}

function radsort(pt: Array<number>): Array<number>{
    // key, x, y
    // literally just normalize the point so that its magnitude is equal to its energy(times 50)
    // take individual coordinates and multiply by a scalar
    let scalar: number = 0;
        if(mag(pt) != 0){
            scalar = 300*getdata(pt[0],0)/mag(pt);
        }
        return [pt[0], scalar*pt[1], scalar*pt[2]]
}

function getdata(index: number, index2: number): number{
    let scalar: number = 0;
    if(userdata.get(index) != undefined){
        let energarr: number[] | undefined = userdata.get(index)
        if(energarr){
            return energarr[index2];
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
        let scalar = sech((1/10)*magdiff)/magdiff
        return [p1[0], scalar * (p1[1]-p2[1]), scalar*(p1[2]-p2[2])]
    }
}

function towardsort(pt: Array<number>, allpts: Array<Array<number>>, sortfunc: (inputarr: Array<number>) => Array<number>): Array<number>{
    let newpt: Array<number> = sortfunc(pt)
    //Move from pt to newpt
    //So we need to add repulsive force within here, probably add a second vector called repulsion and then add the two
    let vector: Array<number> = [pt[0],newpt[1]-pt[1],newpt[2]-pt[2]]
    let scalar: number = 0
    if(mag(vector)!=0){
        scalar = 0.02/mag(vector);
    }
    let repx = 0;
    let repy = 0;

    for(let i = 0; i < allpts.length; i++){
        repx = repx + repulse(pt, allpts[i])[1]
        repy = repy + repulse(pt, allpts[i])[2]
    }
    return [vector[0],
    pt[1]+scalar*vector[1] + 1*repx,
    pt[2]+scalar*vector[2] + 1*repy]
}

function radsortshift(pts: Array<Array<number>>):Array<Array<number>>{
    return pts.map((pt)=>towardsort(pt,pts, radsort))
}

function renderstroke(index: number, selectdex: number){
    if(index == selectdex){
        return "#000000"
    }
    else{
        return "none"
    }
}

const tau = 2*Math.PI

//TODO: add repulsive force
//TODO: add stats display!

//Make the GOL in react: https://dev.to/toluagboola/build-the-game-of-life-with-react-and-typescript-5e0d

export default function GraphVis() {
    let initarray: number[][] = initdist(userdata);
    const [CircleData, setCircleData] = useState<number[][]>(initarray);
    const [SelectIndex, setSelectIndex] = useState<number>(0);
    const [Timer, setTimer] = useState<number>(0);
    
    useEffect(() => {
        setCircleData(radsortshift(CircleData))
        setTimer((Timer + 0.0005) % 1)
    }, CircleData)

    //Make some sort of time update thing that lets you update circles and send their positions somewhere
    return <div className="circles">
                <p>{"energy: " + getdata(SelectIndex,0) + " song mood: " + getdata(SelectIndex,1) + " song length: " + getdata(SelectIndex,2)}</p>
                <svg width="1000" height="600">
                    {/* render the circles */}
                    {CircleData.map((entry) => 
                        <circle 
                        onClick= {() => {
                            console.log("circle " + entry[0] + " clicked");
                            setSelectIndex(entry[0])
                        }} 
                        key= {entry[0]} 
                        cx= {entry[1]+500} cy= {entry[2]+300} 
                        r={20 + 2*Math.sin(0.1*mag(entry)+tau*Timer)} fill={"hsla(" + 180 * getdata(entry[0],0) + ", 100%, 50%, 1.0)"}
                        stroke = {renderstroke(entry[0],SelectIndex)}
                        strokeWidth = "5"
                        />
                    )}
                </svg>
                <div>
                    <button onClick= {() => {  
                        // update the circle positions
                        setCircleData(initarray);
                    }}>
                        {"Reset"}
                    </button>
                </div>
            </div>
}

{/* {circledata.map((circx,circy)=>
    <circle cx= "circx" cy= "circy" r="80" fill="none" stroke="#000000" stroke-width="10"/>)} */}