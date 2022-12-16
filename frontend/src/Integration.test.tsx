import React from 'react';
// import { backend functions } from './wherever it is';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom'

beforeEach(() => {
    // if we need anything before
})


// obv not this
// test('getCsv', async () => {
//     const outputNormal = await getCsv(['get', 'frontend/mockFiles/cords1.csv'])
//         .then(obj => obj.toString())
//     expect(outputNormal).toBe("[[AG,17.060816,-61.796428,Antigua and Barbuda]]")

//     const outputError = await getCsv(['get', 'frontend/mockFiles/badCsv.csv'])
//         .then(obj => obj.toString())
//     expect(outputError).toBe('unable to parse file; please check the csv format and try again')

//     const outputHeadOnly = await getCsv(['get', 'frontend/mockFiles/headOnly.csv'])
//         .then(obj => obj.toString())
//     expect(outputHeadOnly).toBe('[]')

//     const outputEmptyError = await getCsv(['get', 'frontend/mockFiles/empty.csv'])
//         .then(obj => obj.toString())
//     expect(outputEmptyError).toBe('the file is empty; please check the file content and try again')
// });
