/**
 * step 1: user clicks log in button, which makes a call to spotify to 
 *        get an authentication code. navigating them to the permissions page,
 *        if they accept, you get redirected back to your page with an extra piece 
 *        of code at the end of the URL i.e. localhost:3000/code=EWBEBKBEKBBBEr
 * step 2: need to access that string, saving it, then send ANOTHER request to the API
 *        this time without redirecting user, that provides the code plus a bunch of 
 *        our app info like clientID and clientSecret etc, and THIS is what will return
 *        a JSON containing access token and refresh token
 * step 3: save the refresh token to firebase under the person's google acct
 * step 4: when you want to do stuff, use the refresh token to get a new auth token
 *         and go to town. the refresh token does NOT expire.
 */

import * as React from 'react';

interface SpotifyLoginButtonProps {
  clientId: string;
  redirectUri: string;
  clientSecret: string;
}

export const SpotifyLoginButton: React.FC<SpotifyLoginButtonProps> = (parameters) => {
  const { clientId, redirectUri, clientSecret} = parameters;
  
  let refreshToken: string = "";
  let accessToken: string = "";

  const handleClick = () => {
    const url = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=user-read-private%20user-read-email&redirect_uri=${redirectUri}`;
    // go to the url
    window.location.replace(url);

  };

  React.useEffect(() => {
    getTokens()
  })

  const onSuccess = (refreshToken: string, accessToken: string) => {
    console.log("OH MY GODDDD")
    console.log(accessToken)
    console.log(refreshToken)
  };

  const onFailure = (error: string) => {
    // Handle the error
    console.error(error);
  };

  const getTokens = () => {
    
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    console.log(code)
    // Use the code to get the refresh and access tokens
    const url = `https://accounts.spotify.com/api/token`;
    const base64ClientIdAndSecret = btoa(`${clientId}:${clientSecret}`)
    console.log("base64" + base64ClientIdAndSecret)
    console.log("unencrpyt" + atob(base64ClientIdAndSecret))
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64ClientIdAndSecret}`,
        'Content-Type':'application/x-www-form-urlencoded'
      },
      body: `grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}`,
    };

    fetch(url, options)
      .then((response) => response.json())
      .then((data) => {
        if (refreshToken == "") {
          refreshToken = data.refresh_token;}
        if (accessToken == "") {
          accessToken = data.access_token;}
        console.log("refresh")
        console.log("LOOK AT THIS IT IS A REFREH TOKEN OMFG" + refreshToken)
        console.log("access")
        console.log("accessToken IS RIGHT HERE" + accessToken)
        onSuccess(refreshToken, accessToken);
      })
      .catch((error) => {
        onFailure(error);
      });
  };

  return (
    <button onClick={handleClick}>Login with Spotify</button>
  );
};
