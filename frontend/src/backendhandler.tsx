
//TODO:  There is an endpoint WIP(sam) that will return all user Ids, then make individual requests to these.

//What do we want to do? Update a user's song features. 
//[TODO]Take in variables and setters for song title, song artist, song number stuff, make these into react variables.
//[TODO]Pass these into our handler. Make sure that we have failsafes if they are empty!
//[TODO]

export async function updateuserdata(userindex: number, userIds: Array<string>,usersongparams: Map<number, number[]>,
    userdatastrings: Map<number, string[]>,matchesdata: Map<number,Array<Array<number>>>,
    setusersongparams: ((map: Map<number, Array<number>>) => void), setuserdatastrings: ((map: Map<number, Array<string>>) => void), 
  setmatchesdata: ((map: Map<number, Array<Array<number>>>) => void)): Promise<void>{

    return fetch("http://localhost:3232/get-user?id=" + userIds[userindex]).then((respjson)=>{
                respjson.json().then((respobj)=>{
                    let songnums:Array<number> = respobj.user.currentSong.features
                    // console.log(songnums)
                    setusersongparams(new Map(usersongparams.set(userindex,songnums)))
                    
                    let songstrings: Array<string> = [respobj.user.displayName, respobj.user.currentSong.title, respobj.user.currentSong.artists[0]]
                    // console.log(songstrings)
                    setuserdatastrings(new Map(userdatastrings.set(userindex, songstrings)))
                    
                    //All we have left is to do the matches

                    let currconnections: Array<number> = respobj.user.connections.map((userid:string)=>{return userIds.indexOf(userid)});
                    let histconnections: Array<number> = respobj.user.historicalConnections.map((userid:string)=>{return userIds.indexOf(userid)})
                    let matches: Array<Array<number>> = [currconnections, histconnections]
                    // console.log(matches)
                    //So what we have to do is get the index numbers of these matches. 
                    setmatchesdata(new Map(matchesdata.set(userindex,matches)))
                })
            })
    //WE want the user id to be the one that shows up in spotifyauth as localStorage.getItem("UID")
}