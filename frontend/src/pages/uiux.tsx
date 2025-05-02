import { stringify } from 'querystring';
import React, { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import {pages, pagesetter, reactvar} from "../App"
import {getcolorstring} from  "../Homepage"
import './subpages.css'
import  {tabs} from "./uiux tabs"
import { Button } from '../button';

import finderhover from '../images/finderhover.png';
import findersubmenu from '../images/findersubmenu.png';
import findersubmenuhover from '../images/findersubmenuhover.png';
import googledocs from '../images/googledocs.png';
import googledocshover from '../images/googledocshover.png';
import googledocssubmenu from '../images/googledocssubmenu.png';
import rivehover from '../images/rivehover.png';
import rivesubmenu from '../images/rivesubmenu.png';
import rivesubmenuhover from '../images/rivesubmenuhover.png';

import inputtable from '../images/inputtable.png';
import output1 from '../images/output1.png';
import output2 from '../images/output2.png';
import output3 from '../images/output3.png';

import mouse1 from '../images/mouse.png';
import mouse2 from '../images/mouse2.png';
import keyboard1 from '../images/keyboard.png';
import keyboard2 from '../images/keyboard2.png';

import redesigndefault from '../images/default.png';
import redesignhovered from '../images/hovered.png';

import rattycookersketch from '../images/cooker.jpg';
import georgenothy from '../images/georgenothy.png';
import lukewarm from '../images/lukewarm.png';
import storyboard1 from '../images/storyboard_1.jpg';
import storyboard2 from '../images/storyboard_2.jpg';

import fairviewscreenshot from '../images/fairviewfarms screenshot.png';
import macbook1 from '../images/MacBook Air - 1.png';
import macbook2 from '../images/MacBook Air - 2.png';
import ipad1 from '../images/iPad Pro 11_ - 1.png';
import ipad2 from '../images/iPad Pro 11_ - 2.png';
import iphone1 from '../images/iPhone SE - 1.png';
import iphone2 from '../images/iPhone SE - 2.png';

import remadeguide from '../images/remadeguide.png';
import remademac from '../images/remademacbook.png';
import remadeiphone from '../images/remadeiphone.png';

import mechahealthinitsketch from '../images/mechahealthinitsketch.png';
import tablet1sketch from '../images/tablet1.png';
import desktop21 from '../images/desktop21.png';
import desktop22 from '../images/desktop22.png';
import tablet21 from '../images/tablet 21.png';
import tablet22 from '../images/tablet 22.png';

import bmhp from '../images/bmhp.png';
import bmf from '../images/bmf.png';
import bmu from '../images/bmu.png';
import bms from '../images/bms.png';
import bms2 from '../images/bms2.png';

import hfhomepage from '../images/hfhome.png';
import hffoldergrid from '../images/hffoldergrid.png';
import hffolderlist from '../images/hffolderlist.png';
import hfsettings from '../images/hfsettings.png';
import hfscan from '../images/hfscan.png';
import hfspot from '../images/hfspot.png';
import { access } from 'fs';

//TODO: Add titles(side title and top title)
//TODO: Add a link entry
//TODO: Drive the opacity based on the current tab

const tau = 2*Math.PI

type point = {x: number, y: number};
type hsv = {h: number, s: number, v: number};
type hsl = {h: number, s: number, l: number};

// How do we want this to look? 
// Maybe create some sort of simple image gallery with buttons and film grain. 
// Clicking left or right makes the image blink closed and then open again.
// Keep it simple at first.

// const img = new Image();
// img.onload = function() {
//   alert(img.width + 'x' + img.height);
// }
// img.src = 'http://www.google.com/intl/en_ALL/images/logo.gif';

const marginwidth = 75
const N = tabs.length

function ease(x: number): number{
       if(x <= 0){
              return 0
       }
       if(x >= 1){
              return 1
       }
       return 3*Math.pow(x,2)-2*Math.pow(x,3)
}

function italistyle(x: number): string{
       if(x == 0){
              return ""
       }
       return "italic"
}

//Page 
function accesscomponents(){
       return <div className="App" style={{backgroundColor: "black"}}>
           {/* <header className="App-header"> */}
     
           <svg className="svgwindow" fill = "true"
                      width="100%" height={0} aria-label="loading screen">
                       {/* Idk why I had to put this svg window here but it got rid of some of the annoying white space at the top of the page */}
           </svg>
     
           <iframe style={{border: "none"}} width="800" height="500" src="https://rive.app/s/Ad65nUpLXkSd33WXGoFQzQ/embed?runtime=rive-renderer" allow="autoplay"></iframe>
     
               <p style = {{fontSize:"32px", color:"hsl(0 100% 100%)", fontFamily:"EB Garamond", fontWeight:"bold"}}>
                 <br/>
                 ACCESSIBLE COMPONENT DESIGN
               </p>
     
               {/* <foreignObject x="0" y="175" width="100%" height="8000" > */}
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "left"}}>
                   For this assignment, I chose to study the design of the humble dropdown menu.
                   <br/>
                   <br/>
                   Slim, sleek, and seldom noticed, the dropdown menu forms the backbone of many modern software applications.
                   <br/>
                   <br/>
                   For this assignment, I explored how three different applications implement the dropdown menu: Finder, Google Docs, and Rive Animator. 
                   Finder is a commonly used utility application for Mac that manages local file organization and filesearch. Google Docs is an online word processor that lets users create and 
                   I started out by exploring each program via mouse and keyboard, keyboard only, and touchscreen.
                   </p>
                   <img src={finderhover} width = "400" className="screenshot" alt="logo" />
                   <img src={findersubmenu} width = "400" className="screenshot" alt="logo" />
                   <img src={findersubmenuhover} width = "400" className="screenshot" alt="logo" />
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
                     <i>Finder's dropdown menu UI</i>
                     <br/>
                     <br/>
                   </p>
     
                   <img src={googledocs} width = "400" className="screenshot" alt="logo" />
                   <img src={googledocshover} width = "400" className="screenshot" alt="logo" />
                   <img src={googledocssubmenu} width = "400" className="screenshot" alt="logo" />
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
                     <i>Google docs' dropdown menu UI</i>
                     <br/>
                     <br/>
                   </p>
     
                   <img src={rivehover} width = "400" className="screenshot" alt="logo" />
                   <img src={rivesubmenu} width = "400" className="screenshot" alt="logo" />
                   <img src={rivesubmenuhover} width = "400" className="screenshot" alt="logo" />
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
                     <i>Rive's dropdown menu UI</i>
                     <br/>
                     <br/>
                   </p>
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
                   I then compiled a table of notes on how each application responded to each type of input, like so:
                   </p>
     
                   <img src={inputtable} width = "1000" className="screenshot" alt="logo" />
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "left"}}>
                   After that, I compiled a table of notes on how each application responded to each type of output:
                   </p>
     
                   <img src={output1} width = "1000" className="screenshot" alt="logo" />
     
                   <img src={output2} width = "1000" className="screenshot" alt="logo" />
     
                   <img src={output3} width = "1000" className="screenshot" alt="logo" />
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "left"}}>
                   From here, I had enough data to compile a set of state diagrams for mouse and keyboard users interacting with the Finder dropdown menu. 
                   Each node in the diagram represents a unique state of the dropdown menu- the user transitions between different states via different mouse and keyboard inputs.
                   </p>
     
                   <img src={mouse1} width = "1000" className="screenshot" alt="logo" />
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
                   <i>Mouse State Diagram</i>
                   </p>
     
     
                   <img src={keyboard1} width = "1000" className="screenshot" alt="logo" />
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
                   <i>Keyboard State Diagram</i>
                   </p>
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "left"}}>
                   I then created a set of redesigned state diagrams with the tradeoff that when users click a specific menu item, it no longer closes the menu.
                   This makes repetitive actions like copying and pasting easier for the user, as they no longer have to re-open the same menu every single time they wish
                   to paste- they simply open the menu and click the "paste" option multiple times. 
                   The new arrows on the right that have no text label indicate an immediate transition.
                   </p>
     
                   <img src={mouse2} width = "1000" className="screenshot" alt="logo" />
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
                   <i>Redesigned Mouse State Diagram</i>
                   </p>
     
                   <img src={keyboard2} width = "1000" className="screenshot" alt="logo" />
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
                   <i>Redesigned Keyboard State Diagram</i>
                   </p>
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "left"}}>
                   Finally, I created a new, redesigned version of the dropdown menu itself. I designed the files in Rive and then ported them over to Figma as SVG Files.
                   </p>
     
                   <img src={redesigndefault} width = "500" className="screenshot" alt="logo" />
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
                   <i>Redesigned Dropdown Menu: Default</i>
                   </p>
     
                   <img src={redesignhovered} width = "500" className="screenshot" alt="logo" />
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
                   <i>Redesigned Dropdown Menu: Hovered</i>
                   </p>
     
                   <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "left"}}>
                   
                   <b>PART 4: Reflection</b>
                   <br/>
                   <br/>
                   <b>Where did the components you observed do well in terms of usability and accessibility? How have you applied this to your design?</b>
                   <br/>
                   &nbsp; The components I observed did a great job of compactly organizing menu items in space and highlighting the selected items so that they sufficiently stand out. However, all of the menu items can be visually somewhat hard to distinguish between unless the user can read english.
                   <br/>
                   <br/>
                   <b>Are there accessibility considerations that were not addressed that you accounted for in your own design?</b>
                   <br/>
                   &nbsp; Yes, the consideration that visually impaired people may not be able to tell which item they have selected because they cannot tell blue from white or black. Or that people who cannot read english/whichever target language the menu is made in will not be able to read the menu items.
                   To account for this, I made it so that selected items now bump out a little sideways onscreen, so that people who cannot easily distinguish colors can see it more easily, and so that people in general can detect and track the motion to quickly locate their selection.
                   <br/>
                   <br/>
                   <b>How does the change you’ve made in your own design solve for a “mismatch” in our world? (using the definition from the video)</b>
                   <br/>
                   &nbsp; This change accounts for a tactile mismatch, aka that users might expect more of a physical/visual analogue to selecting an item, some spatial cue that they are “picking” it out of a list. In the real world, objects don’t typically change color when you are considering using them, but most people can relate to pulling things out of the shelf and inspecting them, the same way my redesigned menu items offset when hovered.
                   <br/>
                   <br/>
                   <b>Going back to Parts 1 and 2, pick from any of the inputs and outputs you’ve observed from a specific application, and address the following in your hand-in: 
                   Give two examples of how the accessibility/inaccessibility of those inputs or outputs could also impact users with impairments either positively or negatively, respectively.</b>
                   <br/>
                   &nbsp; Example 1(Rive, navigation): The dropdown menu is fairly navigable via mouse/keyboard, but is impossible to navigate through the dropdown menu from keyboard/voiceover only, as hitting VO+space, VO+shift+down, or any of the plain arrow keys fails to open the menu itself. Also the number of items that screen reader says the menu contains is inaccurate, which could throw visually impaired users off.
                   <br/>
                   &nbsp; Example 2(Rive, hotkeys): Rive has specific hotkeys that allow keyboard users to directly select tools from the tools menu without having to open that menu at all. On one hand, this greatly speeds up the process of switching between tools. On the other hand, the fact that hitting a hotkey does not open the menu associated with that hotkey and select the option itself might be a barrier for sight impaired users, since they might want to use an item that doesn’t have a hotkey but is located just below one that does in the menu. A user might try to access that menu item by hitting the hotkey of the item just above it and then hitting the down arrow, but since hitting a hotkey just immediately uses that item and doesn’t pull up any menu, this method of navigation is denied to the user.
     
                   </p>
     
     
     
                   
     
     
                   {/* TODO: Do state model part */}
                   {/* TODO: Add reflection */}
     
     
     
                   <br></br>
                   <iframe style={{border: "none", float: "left", marginLeft: "100px"}} width="375" height="375" src="https://rive.app/s/jst2RTWkaE_RHw7HLrTy1A/embed?runtime=rive-renderer" allow="autoplay"></iframe>
     
               <svg className="svgwindow" fill = "true"
                      width="100%" height={0} aria-label="loading screen">
                       {/* Idk why I had to put this svg window here but it got rid of some of the annoying white space at the top of the page */}
           </svg>
           {/* </header> */}
         </div>
}

//Page 
function personas(){
return <div className="App" style={{backgroundColor: "black"}}>
       {/* <header className="App-header"> */}

       <svg className="svgwindow" fill = "true"
                     width="100%" height={0} aria-label="loading screen">
                     {/* Idk why I had to put this svg window here but it got rid of some of the annoying white space at the top of the page */}
       </svg>

       <iframe style={{border: "none"}} width="800" height="500" src="https://rive.app/s/Ad65nUpLXkSd33WXGoFQzQ/embed?runtime=rive-renderer" allow="autoplay"></iframe>

              <p style = {{fontSize:"32px", color:"hsl(0 100% 100%)", fontFamily:"EB Garamond", fontWeight:"bold"}}>
              <br/>
              PERSONAS AND STORYBOARDING
              </p>

              {/* <foreignObject x="0" y="175" width="100%" height="8000" > */}
              <p className="bodyText">
              <b>PART 1: Preparation</b>
              <br/>
              <br/>
              For this assignment, I studied how users interact with the Ratty pasta cooker, also known as the HATCO RAPIDE CUISINE COUNTERTOP INDUCTION RANGE.
              <br/>
              <br/>
              I observed users at the Ratty and took notes, and then interviewed three people on their experience using the
              interface. I asked each interviewee the same four simple questions. 
              <ul>
                     <li>How do you use this machine? What parameters can you change and how do you change them?</li>
                     <li>If you were to write instructions on how to cook pasta using this device, what would you write?</li>
                     <li>If you were to add labels to this device, where would you place them and what would they say?</li>
                     <li>If you could redesign the physical inputs of this interface, is there anything that you would change?</li>
              </ul>                
              </p>
              <img src={rattycookersketch} width = "400" className="screenshot" alt="logo" />
              <p style={{color:"white", fontFamily:"Courier",  marginLeft: "100px", marginRight: "100px", textAlign: "center"}}>
              <i>An annotated sketch of the Ratty pasta cooker</i>
              <br/>
              <br/>
              </p>

              <p className="bodyText">
              The induction cooker turns on and off in sort of a strange way- the temperature knob must be pushed in in order to turn the device on and off. You can then turn the knob to set the temperature that the cooktop will heat the pan to, and the induction cooktop immediately starts heating up whatever is on it. Note: the induction cooktop does not actually visually change in any sort of way to indicate that heating has started. Clicking the timer button allows you to change the timer duration using the same temperature knob(must provide input within 3 seconds), upon which the timer will automatically start. When the timer runs out, the power will drop to 0 automatically.
              </p>

              <p className="bodyText">
              
              <b>PART 2: Recording Observations</b>
              <br/>
              <br/>
              <b>Write a few sentences or bullets describing the key observations you gained from observing your users. Do not make any assumptions about the users’ behaviors or thought processes. Make sure you note general patterns in their interactions with the interface. How did the users react while using the interface? How does it differ from other users?</b>
              <ul>
                     <li>One user didn’t turn off the burner when they left</li>
                     <li>All three users knew how to use the machine when they arrived at it, aka they correctly turned the machine on, set the temperature, and cooked their pasta</li>
                     <li>Most users cook for about an average of 2-3 minutes</li>
                     <li>None of the users used the timer function on the cooker</li>
              </ul>    
              <b>List your questions in a numbered list and summarize the responses of your interviewed users. Be sure to highlight the main points or important patterns. Your summary should be both concise and informative.</b>
              <ol>
              <li>How do you use this machine? What parameters can you change and how do you change them?</li>
              <li>If you were to write instructions on how to cook pasta using this device, what would you write?</li>
              <li>If you were to add labels to this device, where would you place them and what would they say?</li>
              <li>If you could redesign the physical inputs of this interface, is there anything that you would change?</li>
              </ol>  
              

              {/* INSERT TABLE HERE! */}

              <table style = {{backgroundColor: "bisque", color: "black"}}>
              <tr>
              <th>Name</th>
              <th>Response</th>
              </tr>
              <tr>
              <td>Adrianna</td>
              <td>
                     <ul>
                     <li>The main thing you use on the machine is the knob. You press it to turn it on and turn the dial to change the heat.</li>
                     <li>Put the pan on the hot plate, put  the pasta in the pan, press the button to turn on, wait until graphic appears, turn clockwise to appropriate heat, turn until satisfied, remove and turn off.</li>
                     <li>Next to power button, put a label that says "press". Some people turn it but you need to press it.</li>
                     <li>Maybe suggest a time limit. Never used the clock button so maybe label that.</li>
                     </ul> 
              </td>
              </tr>
              <tr>
              <td>Mohammad</td>
              <td>
                     <ul>
                     <li>To use the machine, put the pasta on the pan, put it to 85, while it’s cooking, move it continuously. Use the spices and mix it thoroughly for 2-3 minutes.</li>
                     <li>Get what you want, put some preliminary ingredients in there. At the machine, set it to the heat you want, 70s to 80s, don’t do it too high, keep turning the pasta, add spices as need until you feel hot that it's enough.</li>
                     <li>Idk, feel like labels are pretty self explanatory. I wouldn’t add anything except for a do not touch on the hot plate bc looks the same when it's off and when it's on.</li>
                     <li>Um, I don't know. The timer isn’t consistent on there so you just need to do it yourself. Find the optimal time for good heated pasta. Maybe add some weight sensor that gives a better estimate of cook time.</li>
                     </ul> 
              </td>
              </tr>
              <tr>
              <td>Kimberly</td>
              <td>
                     <ul>
                     <li>Get pasta, add ingredients, sauce, turn on the stove, get pan, add stuff, mix it around. Click the button down to turn it on, can turn it up to 100, usually keep it at 40, don’t like it when it’s cold but don’t want to burn it. 3-5 minutes. Once done, take it off, turn it off.</li>
                     <li>I'm not sure. I didn’t know how to turn it on at first, so I watched someone else do it before I tried it.</li>
                     <li>I don't know. Maybe label the temperature knob as an on and off button.</li>
                     <li>It could tell you how many minutes you should cook the pasta for, like some sort of timer. [when asked] I didn't know that the machine has a timer function.</li>
                     </ul> 
              </td>
              </tr>
              </table>

              <br/>

              <b>RESPONSE SUMMARY:</b>

              <ul>
              <li>Two users noted that it seems like the knob is just for turning but you actually have to press it.</li>
              <li>One user said to label the hot plate so that people knew it was hot because it doesn’t visually change at all. Turns out it’s an induction cooktop, so the surface itself doesn't get hot, it just heats the pan.</li>
              <li>Two out of three users didn’t know the burner had a timer function, and the third person noted the timer was inconsistent.</li>
              <li>One user didn’t know how to use the machine at first, so they watched someone else use it before trying to use it themselves.</li>
              </ul> 

              <br/>

              <b>PART 3: Personas</b>
              <br/>
              <br/>
              <b>Using the observations and interviews you collected from parts 1 & 2, construct 2 personas by creating a four-quadrant empathy map, 
              describing what users think, feel, say, and do for one archetypal character ​that will represent part of the spectrum of users you observed. </b>

              <br/>
              <br/>

              <b>For each empathy map, also add a description that covers the following:
              Briefly describe the user  (1 sentence headline)
              Point out the interface problems that your personas face. 
              Explain why and how a given persona represents the users of your chosen interface.
              </b>

              <br/>
              <br/>

              <img src={lukewarm} width = "1000" className="screenshot" alt="logo" />

              <br/>
              <br/>

              <b>Description:</b>

              <br/>
              <br/>

              Stressed, sleep deprived, and self conscious, Lukewarm Tomatopaste (a freshman and aspiring econ concentrator) views life as a never-ending series of unpleasant surprises. 

              <br/>

              Lukewarm tends to go into a panic when things don't go as planned, frantically trying random things until something works out. They dread inconveniencing the lives of others.
              The confusing dual-functionality of the pasta cooker, as well as the inacessibility of the timer button will likely confuse Lukewarm and make them second guess themselves.

              <br/>

              This persona represents the stress that users of the ratty pasta cooker may feel, as I noticed that the lines for the pasta machine can become quite long, and that most users
              rarely go over the 2-3 minute cook time(so as to keep the line moving).

              <br/>
              <br/>

              <img src={georgenothy} width = "1000" className="screenshot" alt="logo" />

              <br/>
              <br/>

              <b>Description:</b>

              <br/>
              <br/>

              Cool, confident, and a culinary commander, Georgenothy Thompsonson (a junior and political science major) takes control of any situation he is placed in, moving with determination, regardless of if they are in the right or the wrong.

              <br/>

              Georgenothy is a veteran ratty-goer. The cafeteria is their domain. Georgenothy frequently cooks for themselves at home using their gas range, so the induction cooktops of the ratty
              pasta machine offer little visual feedback compared to the gas burners at home.

              <br/>

              This persona represents the people I observed at the ratty who navigated the pasta machine with ease, who not only used the interface as intended but went above and beyond, shaking spices and cheeses over their pasta with the skill of a venerable artist painting their latest masterpiece.

              <b>PART 4: Storyboards</b>
              <br/>
              <br/>

              For this storyboard, I mapped out a sequence that someone like Lukewarm might experience when using the Ratty pasta cooker.

              <br/>
              <br/>

              <img src={storyboard1} width = "1000" className="screenshot" alt="logo" />

              <img src={storyboard2} width = "1000" className="screenshot" alt="logo" />

              <br/>
              <br/>

              </p>

              


              {/* TODO: Do state model part */}
              {/* TODO: Add reflection */}



              <br></br>
              <iframe style={{border: "none", float: "left", marginLeft: "100px"}} width="375" height="375" src="https://rive.app/s/jst2RTWkaE_RHw7HLrTy1A/embed?runtime=rive-renderer" allow="autoplay"></iframe>

              <svg className="svgwindow" fill = "true"
                     width="100%" height={0} aria-label="loading screen">
                     {/* Idk why I had to put this svg window here but it got rid of some of the annoying white space at the top of the page */}
       </svg>
       {/* </header> */}
       </div>
}

//Page 
function responsiveredesign(){
return <div className="App" style={{backgroundColor: "black"}}>
       <svg className="svgwindow" fill = "true"
                     width="100%" height={0} aria-label="loading screen">
       </svg>

       {/* REDESIGNED PAGE LINK: https://vaultthestars-github-io.vercel.app/ */}

       <iframe style={{border: "none"}} width="800" height="500" src="https://rive.app/s/Ad65nUpLXkSd33WXGoFQzQ/embed?runtime=rive-renderer" allow="autoplay"></iframe>

              <p style = {{fontSize:"32px", color:"hsl(0 100% 100%)", fontFamily:"EB Garamond", fontWeight:"bold"}}>
              <br/>
              RESPONSIVE REDESIGN
              </p>

              {/* <foreignObject x="0" y="175" width="100%" height="8000" > */}
              <p className="bodyText">
              <b>PART 1: Research</b>
              <br/>
              <br/>
              For this assignment, we were tasked with redesigning an online website using the principles of accessible design. 
              I chose to research and redesign the homepage of a farm I worked at for two summers in high school. The farm is named Fairview Farms, and is located in Mecox, Long Island.
              Here is a screenshot of their current webpage:
              <br/>
              </p>

              <img src={fairviewscreenshot} width = "800" className="screenshot" alt="logo" />

              <p className = "bodyText">
              <br/>

              I then took some time to compile my personal thoughts on the page, conduct accessibility analyses on the page via
              WebAim and Lighthouse, and summarize the main issues with the page w/r to efficiency, learnability, and memorability.

              <br/>
              <br/>
              <b>[PERSONAL THOUGHTS]</b>
              <br/>
              <ul>
                     <li>There’s a lot of blank space on the page that could potentially be better filled with some sort of responsive flexbox scheme. </li>
                     <li>The homepage does not actually display most of the key information that a user might want when visiting the site, such as the foods they offer and the hours that the shop operates under.</li>
                     <li>It is also unclear whether or not the “closed for the winter” text updates live when the page was last updated.</li>
              </ul> 
              <br/>
              <b>[WEBAIM WAVE and LIGHTHOUSE]</b>
              <br/>
              <br/>
              The webpage scored a 95 on accessibility on Lighthouse but I still think the design itself could be standardized and cleaned up a bit.
WebAim WAVE gave it 10 “very low contrast” errors on the homepage and also said that some heading levels were skipped and that there was “suspicious alternative text”
17 very low contrast errors on the “our products” site and 39 possible headings, and the same score on the “our stories” page

              <br/>
              <br/>
              <b>[SUMMARY TABLE OF THOUGHTS]</b>
              <br/>
              <br/>
              <table style = {{backgroundColor: "bisque", color: "black"}}>
              <tr>
              <th>Efficiency</th>
              <th>Learnability</th>
              <th>Memorability</th>
              </tr>
              <tr>
              <td>
              <ul>
                     <li>The page is fairly simple in layout, and does not really have much redundancy.</li>
                     <li>The “Our Products” page does not compactly list the items the store sells, instead alternating between left and right aligned text, forcing the reader’s eyes to jump around the page.</li>
                     <li>The main redundant component is probably the contact/message box at the bottom of each page, which could probably be moved to the “contact us” subpage of the website.</li>
              </ul> 
              </td>
              <td>
              <ul>
                     <li>The page’s text scores low on contrast, making it difficult for new users to read and learn.</li>
                     <li>Text color does not always correlate with functionality on the page, which makes it confusing for new users. Ex: Multiple instances of the same yellow text, but some are interactive and some are non-interactive.</li>
                     <li>The text does not have a clear styling hierarchy, which makes it confusing to users what order to interact with elements in.</li>
              </ul> 
              </td>
              <td>
              <ul>
                     <li>Due to the inconsistencies + variations in styling, it would be difficult for a user to conjure what this webpage looks like from memory.</li>
                     <li>The current logo is a detailed photograph, which has too much information in it to be memorable.</li>
                     <li>The font style is fairly distracting and detracts from the memorability of the text content.</li>
              </ul> 
              </td>
              </tr>
              </table>

              <br/>

              <b>Part 2: Initial Figma Mockup</b>

              <br/>
              <br/>

              Keeping these observations in mind, I set about drafting up a mock redesign of the webpage. 

              <br/>

              </p>

              <img src={macbook1} width = "800" className="screenshot" alt="logo" /> 
              <img src={macbook2} width = "800" className="screenshot" alt="logo" />

              <p className="bodyText">
              Here is the mockup I created for the macbook pro- I tried to reduce the number of onscreen objects, 
              while still keeping the photo-centric design of the old webpage. I used a scrolling parallax photo 
              background of Fairview's corn fields, as well as a minimalist design for the top menu buttons. 

              <br/>

              I chose to make the white text turn yellow on hover + gain a drop shadow, but ended up changing this later.
              I also experimented with some potential ideas for a dropdown menu design as a way to respond to the priority in which 
              users might wish to access certain menu items. For example, the challah and pies are two of the most commonly pre-ordered items
              from the farmstand, so users might wish to have a shortcut to access those pages. However, I ultimately decided to not include the dropdown menus
              for the sake of scalability.

              </p>

              <img src={ipad1} width = "400" className="screenshot" alt="logo" /> 

              ___

              <img src={ipad2} width = "400" className="screenshot" alt="logo" />

              <p className="bodyText">
              The ipad mockup ended up not being that different compared to the MacBook design, I just made the text size a little smaller.
              </p>

              <img src={iphone1} width = "400" className="screenshot" alt="logo" /> 

              ___

              <img src={iphone2} width = "400" className="screenshot" alt="logo" />

              <p className="bodyText">
              For the iphone mockup, I had to figure out how to navigate the newly imposed spatial constraints. To deal with this, I made the horizontal menu bar into a vertical menu bar and collapsed it into an expandable hamburger menu.
              I've embedded them as iframes below, but here's the direct link as well:
              <a href="https://vaultthestars-github-io.vercel.app/" style = {{color: "white"}}>https://vaultthestars-github-io.vercel.app/</a>

              </p>

              <iframe style={{border: "none", marginLeft: "100px"}} width="1200" height="800" src="https://vaultthestars-github-io.vercel.app/" allow="autoplay"></iframe>

              <iframe style={{border: "none", marginLeft: "100px"}} width="600" height="800" src="https://vaultthestars-github-io.vercel.app/" allow="autoplay"></iframe>

              <p className="bodyText">
              I changed a few things in the redesign- mostly, I made it so that the button text doesn't turn yellow on hover, since the change wasn't
              visible enough- the drop shadow also didn't show up enough on the darkened background, so I ditched that as well. Instead, I kept the white
              text during the non-hover and hovered states and toggled a darkened rectangular background on and off on hover. 
              
              <br/>

              I removed the drowdown menus from the initial mockups to reduce visual clutter, and per feedback from the critique session, reduced the opacity of the
              expanding hamburger dropdown menu. I also added a footer to the webpage to 

              <br/>
              
              &nbsp; 1: maintain the parallax effect.

              <br/>
              
              &nbsp; 2: include standard footer info.

              <br/>

              From there, I remade the original style guide and mockups to reflect the redesign:

              </p>

              <img src={remadeguide} width = "800" className="screenshot" alt="logo" />

              <img src={remademac} width = "1000" className="screenshot" alt="logo" />

              <br/>

              <img src={remadeiphone} width = "400" className="screenshot" alt="logo" />



              



              


              {/* TODO: Do state model part */}
              {/* TODO: Add reflection */}



              <br></br>
              <iframe style={{border: "none", float: "left", marginLeft: "100px"}} width="375" height="375" src="https://rive.app/s/jst2RTWkaE_RHw7HLrTy1A/embed?runtime=rive-renderer" allow="autoplay"></iframe>

              <svg className="svgwindow" fill = "true"
                     width="100%" height={0} aria-label="loading screen">
                     {/* Idk why I had to put this svg window here but it got rid of some of the annoying white space at the top of the page */}
       </svg>
       {/* </header> */}
       </div>
}

//Page 
function iterativedesign(){
return <div className="App" style={{backgroundColor: "black"}}>
       <svg className="svgwindow" fill = "true"
                     width="100%" height={0} aria-label="loading screen">
       </svg>

       <iframe style={{border: "none"}} width="800" height="500" src="https://rive.app/s/Ad65nUpLXkSd33WXGoFQzQ/embed?runtime=rive-renderer" allow="autoplay"></iframe>

              <p style = {{fontSize:"32px", color:"hsl(0 100% 100%)", fontFamily:"EB Garamond", fontWeight:"bold"}}>
              <br/>
              Iterative Design and Evaluation
              </p>

              {/* <foreignObject x="0" y="175" width="100%" height="8000" > */}
              <p className="bodyText">
              <b>By Jiwon Yoo, William Park, Thais Santos, and Dylan Lee</b>
              <br/>
              <br/>
              <b>Context, Type of interface, Users impacted: </b>
              <br/>
              <br/>
Our service is Mecha Health, a health tech start-up. Their product aims to revolutionize X-ray analysis through AI and automation. They aim to redefine how medical imaging is interpreted by reducing the radiology reporting process from 1 scan per hour to 1 scan per 5 minutes, alleviating burnout and improving care delivery. 
<br/>
              <br/>
We are designing a desktop web interface tailored for use by radiologists, clinical technicians, and potentially patients. The radiologists would be impacted as they are the target customers for the application to improve their efficiency, as they are currently experiencing burnout and are demanding a more efficient and trustworthy tool that allows them to quickly review. Such AI-generated draft reports, verifying findings, and finalizing the diagnostic process would speed up their process. Clinical technicians would also be impacted as they may use the interface to upload scans, track report progress, etc. Patients are not direct users, but they are indirectly impacted through faster diagnosis turnaround, more accurate assessments, and improved treatment timelines. 
<br/>
              <br/>
The interface must support large image formats, detailed annotation tools, and viewing of scans and structured reports to help enhance the efficiency of scans for clinicians. 

              <br/>
              <br/>

              <b>Sketches:</b>

              <br/>
              <br/>
For initial sketches, before we decided on working on desktop, we decided to design for desktop and tablets to give more options to choose from.

<br/>
              <br/>

              <b>Desktop Sketch 1: </b>


              </p>

              <img src={mechahealthinitsketch} width = "800" className="screenshot" alt="logo" />

              <p className="bodyText">
              Notes: 
              <ul>
                     <li>Focused on priority: We thought the X-ray itself was the most important part, hence made that image big. Also segmented the AI diagnosis is segmented to the side to separate the attention, but is also easily visible. We put the carousel in the bottom so the users can easily see where they are on, without being distracted. </li>
                     <li>This sketch itself was the final sketch after multiple iterative designs.</li>
              </ul> 

              <br/>
              <br/>

              <b>Tablet Sketch 1: </b>

              </p>

              <img src={tablet1sketch} width = "800" className="screenshot" alt="logo" />

              <p className="bodyText">
              Notes: 
              <ul>
                     <li>Tablet version of the desktop sketch from above. Still maintaining the same priority with the large X-ray screen, and other parts being minimized (e.g. tap to look further)</li>
              </ul> 

              <br/>
              <br/>

              <b>Desktop Sketch 2: </b>

              </p>

              <img src={desktop21} width = "400" className="screenshot" alt="logo" />
              <img src={desktop22} width = "400" className="screenshot" alt="logo" />

              <p className="bodyText">
              Notes: 
              <ul>
                     <li>Focused on making a simple and clean look for the website, highlighting only key functionalities.</li>
                     <li>Large images and icons were used to draw user attention to important descriptions and demos and where action is needed (e.g., uploading image placeholder)</li>
                     <li>Blocks of text were avoided, favoring images and demos to retain user attention.</li>
              </ul> 


              <br/>
              <br/>

              <b>Tablet Sketch 2: </b>

              </p>

              <img src={tablet21} width = "400" className="screenshot" alt="logo" />
              <img src={tablet22} width = "400" className="screenshot" alt="logo" />

              <p className="bodyText">
              Notes: 
              <ul>
                     <li>Tablet version of the desktop sketch from above. Still maintaining the same priority with large images and minimal text blocks. Components were redesigned to fit the screen appropriately (e.g., hamburger compressed header).</li>
              </ul> 

              <br/>

              <b>Design decisions:</b>

              <br/>
              <br/>

              Throughout the sketching process, we aimed to optimize clarity, speed, and user trust – crucial factors for radiologists working in high-pressure environments. 

              <br/>
              <br/>

              Homepage
              <ul>
                     <li>Establish immediate clarity about Mecha Health’s mission while keeping the interface visually clean.</li>
                     <li>This will help users understand what Mecha Health does at a glance and build trust through clarity. We also wanted to avoid distraction and guide users straight to the service they provide. </li>
              </ul> 

              <br/>

              Folder
              <ul>
                     <li>One of our sketches proposed a folder hub to manage scanned files. </li>
                     <li>We implemented a drag-and-drop functionality and a clear display of previously uploaded scans, creating a fluid interaction model between review and upload. </li>
                     <li>This allows users to quickly retrieve past studies and add new ones. </li>
                     <li>We are considering adding a tick or some sort of a mark that indicates what has been reviewed and not to review again, to enhance the efficiency of going through a bunch of files. </li>
              </ul> 

              <br/>

              Upload
              <ul>
                     <li>Decided to go with a very minimal design, directing user attention to a large area to upload x-rays and show progress of the uploaded files. </li>
              </ul> 

              <br/>

              Diagnosis
              <ul>
                     <li>As radiologists often face lag time and information overload, we focused on speed, simplicity, and efficiency. </li>
                     <li>Large central X-ray image for clear visibility. The X-ray image is also annotated with symptoms that are highlighted to direct the radiologist’s attention to. These symptom markers are clickable and expand into deeper explanations. You can also hide these symptom bars to view the full image without any annotations. </li>
                     <li>Right sidebar for automatically generated AI diagnosis with easy approve/edit options. </li>
                     <li>Bottom carousel for quick switching between other scan views. Tick marks are shown to indicate which scans have been approved with a diagnosis. </li>
              </ul> 

              These design decisions combined are represented in our wireframes using Balsamiq below: 

              <br/>
              <br/>

              <b>Balsamiq Wireframes:</b>

              <br/>
              <br/>

              <b>Homepage:</b>

              </p>

              <img src={bmhp} width = "400" className="screenshot" alt="logo" />

              <p className="bodyText">
              <b>Interactive Homepage sketch in Rive:</b>
              </p>

              <iframe style={{border: "none"}} width="1024" height="768" src="https://rive.app/s/18Lfs3F0zEqPbQ60pFXnsQ/embed?runtime=rive-renderer" allow="autoplay"></iframe>

              <p className="bodyText">
              <b>Folder page:</b>
              </p>

              <img src={bmf} width = "400" className="screenshot" alt="logo" />

              <p className="bodyText">
              <b>Upload page:</b>
              </p>

              <img src={bmu} width = "400" className="screenshot" alt="logo" />

              <p className="bodyText">
              <b>Scan page:</b>
              </p>

              <img src={bms} width = "400" className="screenshot" alt="logo" />

              <p className="bodyText">
              <b>Scan page, expanded window:</b>
              </p>

              <img src={bms2} width = "400" className="screenshot" alt="logo" />

              <p className="bodyText">

              <br/>

              Loom Video: 
<a style = {{color: "white"}} href = "https://www.loom.com/share/811b2f89d858426dbbdb9c2c0f818821?sid=2086878b-5e82-4f05-b8da-2d31e5eb9fc3">https://www.loom.com/share/811b2f89d858426dbbdb9c2c0f818821?sid=2086878b-5e82-4f05-b8da-2d31e5eb9fc3</a>
<br/>
<br/>
<b>Critique:</b>
<ul>
                     <li>some profile/login for folder. </li>
                     <li>thumbnails for carousels. </li>
                     <li>indicate completion with other ui component. </li>
                     <li>more clarity with edit/approve function. </li>
                     <li>marker for active image. </li>
                     <li>arrows for carousel to make more intuitive. </li>
                     <li>interaction with most components. </li>
</ul> 

<b>Design Changes:</b>
<br/>
Following the critique, we made several adjustments to our design to improve usability and clarity:
<ul>
                     <li>Profile/Login: We incorporated a profile icon throughout the entire app, which was previously missing. This addition helps ground the user’s navigation experience and supports personalization.</li>
                     <li>Edit/Approve Function: We removed this feature after realizing it aligned with a different service model. While MechaHealth does support this functionality, it didn’t align with the specific user flow we wanted to highlight. </li>
                     <li>Carousel Navigation: We included arrows for the carousel as suggested in the critique, which made scrolling more intuitive, and made further intuitive by switching to a vertical layout, which better fits our content structure.</li>
                     <li>Interaction with Components: We added more interactive elements throughout the interface to create a more engaging and responsive experience, aligning with the feedback to increase interactivity. </li>
                     <li>Information Reduction: We added icons and color coordinated in places to make functionalities intuitive, reducing the amount of information needed to be shown, supporting a better user experience. Expandable and collapsable tabs were added in the scans page to further reduce immediate information shown, drawing user attention to certain prioritized figures.</li>
</ul> 

Additional Changes Outside of Critique:
<br/>
We also refined our design for the service by implementing a centralized theme across all pages. This includes a consistent color palette (navy blue, white, gray) and a chrome tab-style design, which helped unify the app visually. 
Here are some images of the final Hi-Fi prototype:
</p>

<p className="bodyText">
<b>Homepage:</b>
</p>

<img src={hfhomepage} width = "800" className="screenshot" alt="logo" />

<p className="bodyText">
<b>Folder, grid view:</b>
</p>

<img src={hffoldergrid} width = "800" className="screenshot" alt="logo" />

<p className="bodyText">
<b>Folder, list view:</b>
</p>

<img src={hffolderlist} width = "800" className="screenshot" alt="logo" />

<p className="bodyText">
<b>Settings page:</b>
</p>

<img src={hfsettings} width = "800" className="screenshot" alt="logo" />

<p className="bodyText">
<b>Scan page, report and spot analysis:</b>
</p>

<img src={hfscan} width = "800" className="screenshot" alt="logo" />

<p className="bodyText">
<b>Scan page, spot analysis:</b>
</p>

<img src={hfspot} width = "800" className="screenshot" alt="logo" />

<p className="bodyText">


Loom: Watch on 1.2x! (5:36)
<a style = {{color: "white"}} href = "https://www.loom.com/share/e3301348cce2463d953b2f950e0a3f19?sid=a522c66f-8e86-411d-b97a-e3d6e16fcb8c">https://www.loom.com/share/e3301348cce2463d953b2f950e0a3f19?sid=a522c66f-8e86-411d-b97a-e3d6e16fcb8c</a>

<br/>
<br/>

Figma Prototype: <a style = {{color: "white"}} href = "https://www.figma.com/design/4IUXrHO1lsUBFQBXD6qF8d/Iterative-Design-Hifi?node-id=0-1&t=LK9aBsMlr0yr4GBZ-1"> https://www.figma.com/design/4IUXrHO1lsUBFQBXD6qF8d/Iterative-Design-Hifi?node-id=0-1&t=LK9aBsMlr0yr4GBZ-1</a>

<br/>
<br/>

<b>User Testing:</b>

<br/>

An overarching task we want users to complete on our interactive prototype is to open a spot analysis on the scan and identify the automated summary diagnosis. This task requires users to understand the different features the service provides, and forms a necessary part of the core workflow of the app.

<br/>
<br/>

Summary of the user testing: 

<ul>
<li>Users navigated to a scan through the recent scans section on the main page. </li>
<li>Users did not switch between the display modes of the scans. </li>
<li>Users clicked the nodes first to show the analysis. </li>
<li>Users opened the Summary tab after reading the spot analysis section. </li>
<li>Users navigated to the folder last, navigating through the scan carousel mainly. </li>
</ul> 

Here are our two users' responses to each of our following interview questions:

<b>What was the first thing you did when you saw the UI?</b>
<ul>
       <li>I saw the recent tab and folder tabs at the top of the screen. </li>
       <li>I scrolled in the recent files tab. </li>
</ul> 
<b>Were there any times you were confused about what a particular button or element did?</b>
<ul>
       <li>No. I think all of them were intuitive and reacted as I expected them to. </li>
       <li>No. </li>
</ul> 
<b>Are there any changes you would make to the application for first-time users?</b>
<ul>
<li>Home page tutorial, some info, or title. </li>
<li>Way to categorize/sort scans. </li>
</ul> 
<b>Are there any elements that you found particularly unhelpful?</b>
<ul>
<li>No. Besides the elements I couldn’t click, I found most of the buttons to be useful. But, if I had to choose one, it would be the button that changes the displays. But I definitely see how it could be useful.</li>
<li>No. </li>
</ul> 

<b>Interview Reflection: </b>

<br/>

Users interacted similarly with the application, following the same and most efficient steps to achieve the overarching goal set for them. This indicates that the application is streamlined and directs user attention in a consistent and meaningful way.

<br/>

One key observation was that users clicked on the nodes on the scan before opening the summary section. The main feature of the service is to provide an AI diagnosis/summary of the scan to improve radiologists' efficiency, but we found that users did not view this diagnosis/summary immediately. An improvement to make in the future would be to display the summary initially instead of having users manually open it, ensuring that the main functionality of the application is first interacted with.



              </p>

              <svg className="svgwindow" fill = "true"
                     width="100%" height={0} aria-label="loading screen">
                     {/* Idk why I had to put this svg window here but it got rid of some of the annoying white space at the top of the page */}
       </svg>
       {/* </header> */}
       </div>
}

export default function Uiuxpage(Timer: number, setPage: pagesetter, mouse: point, extravars: reactvar[]) {
    const currtab = extravars[0].var
    const setcurrtab = extravars[0].setter
    const t0 = extravars[1].var
    const wdims = {x: window.innerWidth, y: window.innerHeight};

    let thediv;

    if(currtab == 0){
       thediv = accesscomponents();
    }
    else if(currtab == 1){
       thediv = personas();
    }
    else if(currtab == 2){
       thediv = responsiveredesign();
    }
    else{
       thediv = iterativedesign();
    }

    const tabdims = {x: wdims.x - (N-1)*marginwidth, y: wdims.y}
    const linespace = 20

    return <div key = "pagewrapper" className = "pagewrapper">
            <svg className="animsvg" fill = "true"
                 width="100%" height={window.innerHeight} aria-label="loading screen">
              <rect
              key = {"Header"}
              x = {0}
              y = {0}
              width = {wdims.x}
              height = {marginwidth}
              fill = {getcolorstring({h: 360*3/N, s: 0.6, v: 1})}
              stroke = "hsl(0 0% 0%)"
              strokeWidth= {1}
              />
              <text
              key = {"Animtitle"}
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
                     INTERACTION DESIGN
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
                {Array.from(Array(N).keys()).map((i)=>{
              const origin = {x: i*marginwidth + (tabdims.x-marginwidth)*ease((i)-t0), y: marginwidth}

              const imageorigin = {x: origin.x + marginwidth, y: origin.y + tabdims.y*1/8}

              const imageheight = tabdims.y/2

              const textboxorigin = {x: origin.x + marginwidth,
                     y: imageorigin.y+imageheight + marginwidth/3}
              const imdms = tabs[i].imdms
return <g>
              <rect
              key = {"tab " + i.toString()}
              x = {origin.x}
              y = {origin.y}
              width = {tabdims.x}
              height = {tabdims.y}
              fill = {getcolorstring({h: 360*i/N, s: 0.6, v: 1})}
              stroke = "hsl(0 0% 0%)"
              strokeWidth= {1}
              onClick={()=>{setcurrtab(i)}}
              />
              <text
              key = {"tabnumber" + i.toString()}
              // text-anchor="middle"
              dominant-baseline = "central"
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              // fontWeight= "bold"
              fontSize={40}
              x = {origin.x + marginwidth/2 - 10}
              y = {origin.y + marginwidth/2}
              >{(i+1).toString()}</text>
              <text
              key = {"Sidetitle" + i.toString()}
              // textAnchor="middle"
              dominant-baseline = "central"
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              fontWeight= "bold"
              fontSize={16}
              letterSpacing={5}
              transform = {"translate(" + (origin.x + marginwidth/2).toString() + " " +
              (origin.y + imageorigin.y + imageheight).toString() + ")" + 
              " rotate(-90)"}
              >{tabs[i].title}</text>

              <text
              key = {"maintitle " + i.toString()}
              // text-anchor="middle"
              dominant-baseline = "central"
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              fontWeight= "bold"
              fontSize={25}
              letterSpacing={5}
              x = {origin.x + marginwidth}
              y = {origin.y + marginwidth/2}
              >{tabs[i].title}</text>

              <text className="verse"
              key = "verse"
              // text-anchor="middle"
              dominant-baseline = "central"
              // letterSpacing={4}
              // textLength={0.75*widd}
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              // fontWeight= "bold"
              >
              {Array.from(Array(tabs[i].description.length).keys()).map((linenum)=>{
                     return  <tspan x={textboxorigin.x}
                     y = {textboxorigin.y + linenum*linespace + 5}
                     fontStyle={italistyle(linenum)}
                     >{tabs[i].description[linenum]}</tspan>
              })}
              </text>

              <text className="readmore"
              key = "readmore"
              // text-anchor="middle"
              dominant-baseline = "central"
              // letterSpacing={4}
              fontSize={30}
              // textLength={0.75*widd}
              fill = "hsl(0 0% 0%)"
              fontFamily='Helvetica'
              // fontWeight= "bold"
              >
              <tspan x={origin.x + tabdims.x/2}
                     y = {textboxorigin.y + (tabs[i].description.length+1)*linespace + 5 + 8*Math.sin(4*Timer*tau)}
                     text-anchor="middle"
                     rotate = {8*Math.sin(4*Timer*tau)}
                     >Read More!</tspan>
              <tspan x={origin.x + tabdims.x/2}
                     y = {textboxorigin.y + (tabs[i].description.length+3.5)*linespace + 5 + 10*Math.sin(4*Timer*tau + 2)}
                     text-anchor="middle"
                     >↓</tspan>
              </text>

              <foreignObject width={imdms.x*imageheight/imdms.y} height={imageheight} x = {imageorigin.x} y = {imageorigin.y}>
                     <img width={imdms.x*imageheight/imdms.y} height={imageheight}
                     src = {tabs[i].imageurl}
                     title="Image" 
                     ></img>
              </foreignObject>
</g>
                })}
            </svg>
            {thediv}
        </div>
    // Otherwise, display our main app window
}