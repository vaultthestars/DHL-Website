import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom'
import {usersongparams, genrandomstring, initdist, mag, sech, radsort, linsort, getdata, getdatastrings, getdatamatches, repulse, towardsort, sortshift, updatecamcenter, getsortname, getparamname} from './GraphVis';

beforeEach(() => {
    render(<App />);
});

afterEach(() => {
});

//testing based on the idea of 'tests for this front-end application should be written in terms of what the end-user can perceive'

test('renders app header', () => {
    const headerElement = screen.getByLabelText("App-header")
    expect(headerElement).toBeInTheDocument();
});

test('renders sign in box', () => {
    const loginElement = screen.getByLabelText("sign-into-google")
    expect(loginElement).toBeInTheDocument();
});

test('renders sign in box', () => {
    const loginElement = screen.getByLabelText("spotify-button")
    expect(loginElement).toBeInTheDocument();
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

test('radsort() NaN behavior', () => {
    const point = [2, 5, 6] // id, x, y
    const result = radsort(point, 0)
    expect(result).toStrictEqual([2, NaN, NaN])
});

// need to implement linsort, radsort testing by mocking data not sure how bc that is picked up in graphviz instantiation itself
test('linsort()', () => {
});

test('radsort()', () => {
});



test('repulse()', () => {
    const result: Array<number> = repulse([1, 2, 3], [2, 2, 6])
    expect(result.length).toBe(2)
    expect(result[0]).is[0]
    expect(result[1] < -0.99 && result[1]>-1).toBe(true)
    // should only repulse in the y direction if they are in the same x position
});

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

