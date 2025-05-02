import dropdown from "../images/dropdown.png"
import cooker from "../images/cooker.jpg"
import fairview from "../images/fairview.png"
import scan from "../images/hfscan.png"

//TODO: Figure out an actual way to link the HTML sites themselves
//Shouldn't be that hard, we literally have the function defs. Uh. Just make another site? It would be nice if they popped up in a separate window


type entry = {title: string, imageurl: string, imdms: {x: number, y: number}, description: string[]}

export const tabs: entry[] = [
{title: "ACCESSIBLE COMPONENTS", imageurl: dropdown, 
imdms: {x: 500, y:375}, description:
["Programs used: Rive, HTML","",
"In this assignment, I researched how Finder, Google Docs, and Rive implement dropdown menus.",
"I assessed the strengths and weaknesses of each, then created my own dropdown menu design from scratch."]},

{title: "PERSONAS AND STORYBOARDING", imageurl: cooker,
imdms: {x: 560, y:315},
description:
["Programs used: Rive, HTML","",
"For this project, I interviewed users about their experiences using the induction based stovetops in the",
"campus cafeteria. I then constructed two personas based on their responses, and illustrated a set of storyboards",
"inspired by one of my personas."]},

{title: "RESPONSIVE REDESIGN", imageurl: fairview, 
imdms: {x: 560, y:315}, description:
["Programs used: Figma, HTML","",
"I spent the summers of 2021 and 2022 working at Fairview Farms in Long Island, pitting avocados, harvesting potatos,",
"weeding, and measuring out challah dough. For this assignment I redesigned their website for three different screen sizes in Figma,",
"then coded it in HTML and deployed it via Vercel."]},

{title: "ITERATIVE DESIGN", imageurl: scan, 
imdms: {x: 560, y:315}, description:
["Programs used: Figma, React, HTML","",
"A group project I worked on with Jiwon Yoo, William Park, and Thais Santos. Together, we designed and prototyped a mock",
"application for MECHAHEALTH, a startup that uses AI to generate X-Ray diagnoses and reports."]}
]