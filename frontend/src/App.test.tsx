import React from 'react';
import { render, screen } from '@testing-library/react';
import App, { initdist } from './App';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom'
import GraphVis, {genrandomstring, mag, sech, radsort, linsort, getdata, getdatastrings, getdatamatches, repulse, towardsort, sortshift, updatecamcenter, getsortname, getparamname} from './GraphVis';

beforeEach(() => {
});

afterEach(() => {
});

//testing based on the idea of 'tests for this front-end application should be written in terms of what the end-user can perceive'

test('renders app header', () => {
    render(<App />);
    const headerElement = screen.getByLabelText("App header")
    expect(headerElement).toBeInTheDocument();
});

test('renders sign in box', () => {
    render(<App />);
    const loginElement = screen.getByLabelText("Click here to sign in with google")
    expect(loginElement).toBeInTheDocument();
});

test('renders logo', () => {
    render(<App />);
    const logoElement = screen.getByLabelText("Logo for the tunedin website")
    expect(logoElement).toBeInTheDocument();
});

test('renders spotify button', () => {
    render(<App />);
    const loginElement = screen.getByLabelText("Click here to log in to spotify")
    expect(loginElement).toBeInTheDocument();
});

test('render graphviz and test stuff', () => {
    render(GraphVis(
        "uid2", //CurrentGoogleUser
        true, //spotifyLinked
        true, //usersloaded
        false, //fetchingusers
        new Map([[0, [1, 1, 1, 1, 1, 1]], [1, [1, 1, 1, 1, 1, 1]]]), //usersongparams
        new Map([[0, ["songName", "songArtist"]], [1, ["songName2", "songArtist2"]]]), //userdatastrings, 
        new Map([[1, [[0], [0]]], [0, [[1], [1]]]]), //matchesdata,
        .5, //Timer
        ["uid1", "uid2"], //userIDs
        [[0, 1, 2], [1, 2, 3]], //CircleData [us]
        1, //SortParameter for default
        1, //SortIndex for sort style
        [1, 0, 0], //camcenter, 
        1, //SelectIndex, 
        0, //zoomval, 
        false, //zoomed, 
        false, //alltime, 
        0, //curruserindex,
        (bool: boolean) => {}, //Setalltime, 
        (num: number) => {}, //setSelectIndex, 
        (bool: boolean) => {}, //setZoomed, 
        (num: number) => {}, //setSortParameter, 
        (num: number) => {}, //setSortIndex
        ));
});

test('log in logic', () => {
    
});
// TESTS FOR FUNCTIONS IN GRAPHVIZ
test('genradnomstring()', () => {
    const result = genrandomstring(4)
    expect(result.length).toBe(4)
});

test('genrandomstring() empty edge case', () => {
    const result = genrandomstring(0)
    expect(result).toBe('')
});

test('initdist() ', () => {
    const result: Array<Array<number>> = initdist(50)
    expect(result.length).toBe(50) 
    expect(result[2].length).toBe(3) // 50 items, each a 3d array
});


test('mag()', () => {
    const result = mag([1, 2, 3, 4, 5])
    expect((result < 3.61 && result > 3.59)).toBe(true)
    const result2 = mag([])
    expect(result2).toBe(NaN) // DYLAN DYLAN note that edge case outputs NaN
});


//TODO: Fix the arguments for radsort! View graphvis for reference
// test('radsort() NaN behavior', () => {
//     const point = [2, 5, 6] // id, x, y
//     const result = radsort(point, 0)
//     expect(result).toStrictEqual([2, NaN, NaN])
// });

// need to implement linsort, radsort testing by mocking data not sure how bc that is picked up in graphviz instantiation itself
test('linsort()', () => {
});

test('radsort()', () => {
});



// test('repulse()', () => {
//     const result: Array<number> = repulse([1, 2, 3], [2, 2, 6])
//     expect(result.length).toBe(2)
//     expect(result[0]).is[0]
//     expect(result[1] < -0.99 && result[1]>-1).toBe(true)
//     // should only repulse in the y direction if they are in the same x position
// });

test('towardsort()', () => {
});

// how to set mock data if graphviz imports from backend directly
// test('getdata()', () => {
//     usersongparams.set(1, ["this is a song", "this is an artist"])
//     const result = getdata(1, 0)
//     expect(result).toBe("this is a song")
//     const result2 = getdata(1, 2)
//     expect(result2).toBe("this is an artist")
// });

test('getdatamatches()', () => {
});

test('getdatastrings()', () => {
});

test('sortShift()', () => {
});

test('updatecamcenter()', () => {
});

