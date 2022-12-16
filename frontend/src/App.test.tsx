import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom'

beforeEach(() => {
    // render(<App />);
});

afterEach(() => {
});

//testing based on the idea of 'tests for this front-end application should be written in terms of what the end-user can perceive'

test('renders submit button', () => {
    const buttonElement = screen.getByText(new RegExp(TEXT_submit_button_text));
    expect(buttonElement).toBeInTheDocument();
});

test('renders input box', () => {
    const inputBoxElement = screen.getByRole("repl-command-box")
    expect(inputBoxElement).toBeInTheDocument();
});

test('getting a valid CSV file', async () => {
    const inputBoxElement = screen.getByRole("repl-command-box")
    const buttonElement = screen.getByText(new RegExp(TEXT_submit_button_text));
    userEvent.type(inputBoxElement, "get frontend/mockFiles/cords.csv")
    userEvent.click(buttonElement)
    await screen.findAllByRole("command-output")
    let oldCommands = screen.getAllByRole("command-output")
    let expectedHTML =
        'Command: get frontend/mockFiles/cords.csv <br>Output: [[AD,42.546245,1.601554,Andorra][AE,23.424076,53.847818,United Arab Emirates][AF,33.93911,67.709953,Afghanistan][AG,17.060816,-61.796428,Antigua and Barbuda]]'
    expect(oldCommands[0].innerHTML).toBe(expectedHTML)
});

test('getting a valid CSV file, running stats', async () => {
    const inputBoxElement = screen.getByRole("repl-command-box")
    const buttonElement = screen.getByText(new RegExp(TEXT_submit_button_text));
    userEvent.type(inputBoxElement, "get frontend/mockFiles/cords.csv")
    userEvent.click(buttonElement)
    userEvent.type(inputBoxElement, "stats")
    userEvent.click(buttonElement)
    await screen.findAllByRole("command-output")
    let oldCommands = screen.getAllByRole("command-output")
    let expectedHTML =
        'Command: stats <br>Output: 4 rows, 4 columns'
    expect(oldCommands[0].innerHTML).toBe(expectedHTML)
});

// test('getting a valid CSV file, running stats, switching csv files, running stats', async () => {
//     const inputBoxElement = screen.getByRole("repl-command-box")
//     const buttonElement = screen.getByText(new RegExp(TEXT_submit_button_text));

//     userEvent.type(inputBoxElement, "get frontend/mockFiles/cords1.csv")
//     userEvent.click(buttonElement)
//     userEvent.type(inputBoxElement, "stats")
//     userEvent.click(buttonElement)
//     await screen.findAllByRole("repl-history")
//     let oldCommands1 = await screen.getAllByRole("repl-history")
//     let expectedHTML1 =
//         '<p> Command: stats </p><p> Output: 4 rows, 4 columns </p>'
//     expect(oldCommands1[oldCommands1.length - 1].innerHTML).toBe(expectedHTML1)
// });

test('get csv with invalid filepath', async () => {
    const inputBoxElement = screen.getByRole("repl-command-box")
    const buttonElement = screen.getByText(new RegExp(TEXT_submit_button_text));
    userEvent.type(inputBoxElement, "get fro")
    userEvent.click(buttonElement)
    await screen.findAllByRole("command-output")
    let oldCommands = screen.getAllByRole("command-output")
    let expectedHTML =
        'Command: get fro <br>Output: unable to load file; please check the file path and try again'
    expect(oldCommands[0].innerHTML).toBe(expectedHTML)
});

test('getting an invalid CSV file at with valid filepath', async () => {
    const inputBoxElement = screen.getByRole("repl-command-box")
    const buttonElement = screen.getByText(new RegExp(TEXT_submit_button_text));
    userEvent.type(inputBoxElement, "get frontend/mockFiles/badCsv.csv")
    userEvent.click(buttonElement)
    await screen.findAllByRole("command-output")
    let oldCommands = screen.getAllByRole("command-output")
    expect(oldCommands.length).toBe(1) //double checking that only one has been run
    let expectedHTML =
        'Command: get frontend/mockFiles/badCsv.csv <br>Output: unable to parse file; please check the csv format and try again'
    expect(oldCommands[0].innerHTML).toBe(expectedHTML)

});


