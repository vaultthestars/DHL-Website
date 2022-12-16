
//TODO:  There is an endpoint WIP(sam) that will return all user Ids, then make individual requests to these.

//What do we want to do? Update a user's song features. 
//[TODO]Take in variables and setters for song title, song artist, song number stuff, make these into react variables.
//[TODO]Pass these into our handler. Make sure that we have failsafes if they are empty!
//[TODO]

export async function updateuserdata(userindex: number, userId: string,usersongparams: Map<number, number[]>,
    userdatastrings: Map<number, string[]>,matchesdata: Map<number,Array<Array<number>>>){
    
        //How should this work? We can either directly pass the stuff we want updated in, 
    //or we can just return the response as a new thing.
    //If we were to return the entire response, we'd probably have to 

    fetch("http://localhost:3232/get-user?id=pDtZBPn7kCYsYSRO83QhlpkBZkM2").then((respjson)=>{
                //http://localhost:3232/get-user?id=pDtZBPn7kCYsYSRO83QhlpkBZkM2
                respjson.json().then((respobj)=>{
                    let songnums:Array<number> = respobj.user.currentSong.features
                    console.log(songnums)
                    usersongparams.set(userindex,songnums)
                    
                    // Username, name of most recently listened to song, artist of most recently listened to song
                    let songstrings: Array<string> = [respobj.user.displayName, respobj.user.currentSong.title, respobj.user.currentSong.artists[0]]
                    console.log(songstrings)
                    userdatastrings.set(userindex, songstrings)

                    //All we have left is
                    console.log("")
                    //Sick! This seems to work
                })
            })
    //WE want the user id to be the one that shows up in spotifyauth as localStorage.getItem("UID")
}

fetch("http://localhost:3232/load-song-features").then(()=>{
        fetch("http://localhost:3232/load-connections").then(()=>{
            // fetch("http://localhost:3232/get-user?id=" + localStorage.getItem("UID")).then((respjson)=>{
            fetch("http://localhost:3232/get-user?id=pDtZBPn7kCYsYSRO83QhlpkBZkM2").then((respjson)=>{
                //http://localhost:3232/get-user?id=pDtZBPn7kCYsYSRO83QhlpkBZkM2
                respjson.json().then((respobj)=>{
                    console.log(respobj.user.currentSong.features)
                    //Sick! This seems to work
                    // console.log(JSON.parse(respobj.user.currentSong.features))
                })
                // So we'll get a list in string form, check "features" or "artists" to see what this looks like.
                // Parse out the elements if non empty, use those user Ids to fetch those users' display names.
                // Take in a variable to get and set an external variable for this!!
            })
        })
    })


// TODO:  