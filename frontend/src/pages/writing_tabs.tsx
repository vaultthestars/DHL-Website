import longform from "../writing/longform.pdf"
import shortform from "../writing/Writing Sample_ short works.pdf"

//TODO: Figure out an actual way to link the HTML sites themselves
//Shouldn't be that hard, we literally have the function defs. Uh. Just make another site? It would be nice if they popped up in a separate window


type entry = {title: string, imageurl: string, imdms: {x: number, y: number}, description: string[]}

export const tabs: entry[] = [{title: "BLOG", imageurl: "", 
imdms: {x: 1200, y:500}, description:
["",
"A completely unorganized running document of thoughts"]},





{title: "SHORT FORM WORKS", imageurl: shortform, 
imdms: {x: 800, y:375}, description:
["",
"A collection of works I created during a poetry class I took junior year of college, as well as a short piece",
"I wrote in high school during a unit on The Great Gatsby"]},
{title: "LONG FORM WORKS", imageurl: longform, 
imdms: {x: 800, y:375}, description:
["",
"A long form, slightly more stream of consciousness piece I wrote for my junior year fiction class"]}










]