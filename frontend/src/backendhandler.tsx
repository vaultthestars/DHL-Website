
//TODO:  There is an endpoint WIP(sam) that will return all user Ids, then make individual requests to these.


export async function handlemainuserconnections(userId: string){
    fetch("http://localhost:3232/load-song-features").then(()=>{
        fetch("http://localhost:3232/load-connections").then(()=>{
            fetch("http://localhost:3232/get-user?id=" + localStorage.getItem("UID")).then((respobject)=>{
                // So we'll get a list in string form, check "features" or "artists" to see what this looks like.
                // Parse out the elements if non empty, use those user Ids to fetch those users' display names.
                // Take in a variable to get and set an external variable for this!!
            })
        })
    })
    //WE want the user id to be the one that shows up in spotifyauth as localStorage.getItem("UID")
}


// TODO:  