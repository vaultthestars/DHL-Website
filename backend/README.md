# sprint-2-dtamesis-sminars
dtamesis-sminars team's sprint-2 repo

## **Project Details**

**Project Name**: Sprint 2 - Server

**Estimated Time to Complete Project**: 20 hrs

**Link to repo can be found [here](https://github.com/cs0320-f2022/sprint-2-dtamesis-sminars.git).**

## **Design Choices**
### Relationships between classes/interfaces:
- The ```Database``` class contains a ```Hashmap<String,Object>``` field that maps the filepath/name to the file's parsed contents. It also contains a ```loadedFile``` field, which is updated to store the most recently loaded file's contents. Lastly, it contains a ```parser``` field, that stores the ```Parser``` object to specify how the file's data should be parsed.
- The ```Parser``` interface contains two methods: ```parse()``` and ```getParsedData()```. Any class that implements this interface must have these methods, where ```U``` represents the generic type to be chosen by the developer for representing their parsed data. Note: the parse() method is intended to be called in the constructor of the ```Parser``` object, so that ```getParsedData``` can be ready for use.
  - Our ```CSVParser``` is an example of a class that implements ```Parser```. The generic type ```U``` in this case is a ```List<List<String>>```.
- If a developer wants to add a new datasource with a new file format, they can simply implement their own class that implements ```Parser```, using our CSVParser as a reference, and create their own ```Database``` object in the ```Server.main()``` method to house their type of data. The subsequent handlers they create can then pass in this ```Database``` object to track and share states, just as our csv handlers do.
- The ```ExternalAPIHandler``` abstract class contains an ```externalGet()``` method, which takes in a URI ```String``` and creates an ```HTTPRequest```, gets the ```HTTPResponse```, and returns the response json body as a ```String```. A developer that wants to get a datasource from an external API can easily extend this abstract class and use this method to get the data. They then can decide themselves which parts of the data to deserialize and handle in their code.
  - Our ```WeatherHandler``` is an example of this, as it extends ```ExternalAPIHandler```, allowing it to use this ```externalGet()``` method to handle two external get requests.
### Data structures: 
Our ```Database``` class keeps track of the loaded files and parsing their contents. We designed this class to adhere to User Story 3, specifically adding a new datasource. Its ```setParser()``` method allows developers to specifiy which parser object should be used to parse their file data. The ```loadFile()``` method parses the data provided by the user inputted filepath. It then adds the filepath and its parsed contents to the HashMap field, database. In our ```Server```, we instantiate a ```Database``` to act as a shared state between ```LoadCSVHandler``` and ```GetCSVHandler```. When a user requests the ```loadcsv``` endpoint, it's handled using ```LoadCSVHandler``` where ```csvDatabase.setParser()``` and ```csvDatabase.loadFile()``` are called. If the user then requests the ```getcsv``` endpoint, it's handled using ```GetCSVHandler``` where the contents of the most recent file are obtained by calling ```csvDatabase.getMostRecent()```. 
### Runtime/Space Optimizations:
To minimize the runtime complexity of our program, we utilize a HashMap() to retrieve the parsed contents of the most recently loaded file in constant time. 
### Errors/Bugs: 
None
### Tests: 
- Unit Testing: 
  - We used unit testing to test the functionality of our CSVParser, created during Sprint 0, in the ```CSVParserTest``` class.
  - We also used unit testing to test the functionality of our weather API utilities in our ```TestWeatherAPIUtilities``` class.
  - The ```WeatherAPIUltilities``` class contains utility methods for handling weather request objects regardless of the external NWS API. 
- Integration Testing:
  - For Sprint 2, we felt that integration testing provided an ideal avenue to test the overall functionality of sending API requests to a server and outputting the correct responses. 
  - In our TestAPIHandlers class, we set up a Spark server and get requests for each of our handlers (```LoadCSVHandler```, ```GetCSVHandler```, and ```WeatherHandler```). Each individual test method set up a HTTPConnection with an URL that tests a specific endpoint. We used assertEquals() to determine if an okay connection was established. We then used moshi to create a response to the URL. The integration test is a success if a Json response is generated without causing any errors. We also used ```assertEquals()``` to test if the type of Json response matches what we expected it to be. 
- Fuzz Testing: 
  - In our ```FuzzTestWeather``` class, we perform fuzz testing of our weather handler by randomly generating coordinates that span the contiental United States.

## **How to Run Tests & Build/Run the Program**
### Running Tests
- Using Maven, you can simply navigate to the project directory in the terminal (in this case, ```sprint-2-dtamesis-sminars```), and run ```mvn test``` in the command line.
### Building and Running the Program
- Using Maven, navigate to the project directory and run ```mvn package``` to build and run the project.
- Run the ```Server.main()``` method to start the server. Then, navigate to a browser and type ```localhost:3232```. 
This should show a ```404 Not Found``` response in the window, which confirms that you successfully connected to the server, but there is no registered response at that endpoint.
- The ```loadcsv``` get request can be used to load the contents of a csv file, given a ```filepath``` parameter. 
Run ```localhost:3232/loadcsv?filepath=<the path to your file>``` in the browser.
  - Note: For security purposes, our program limits access to contents within the ```data``` folder of the project. Thus, your file path should start with ```data```.
  - For example, ```localhost:3232/loadcsv?filepath=data/testing/test-basic.csv``` will return the following Web API response: ```{"result":"success","filepath":"data/testing/test-basic.csv"}```
  - The following errors may occur:
    - An ```error_bad_request``` response will be returned if your request is missing the ```filepath``` field. This could look like:
      - ```localhost:3232/loadcsv```
      - ```localhost:3232/loadcsv?filepath=```
      - ```localhost:3232/loadcsv?parameternametypo=```
    - An ```error_datasource``` response will be returned if the file could not be found at the provided ```filepath```, 
    or if you are trying to access a directory ourside of ```data```. This could look like:
      - ```localhost:3232/loadcsv?filepath=data/typo-in-file-name.csv```
      - ```localhost:3232/loadcsv?filepath=Users/username/Documents/private.csv```
- Run ```localhost:3232/getcsv``` _following a loadcsv request_ to get the contents of the most recently loaded csv.
  - For example, if I call this after the example ```loadcsv``` request above, the following Web API response will be returned:
    ```{"result":"success","data":[["Joe","12","Male"],["Sue","1","Female"],["Derek","17","Male"],["Quinn","20","Female"]]}```
    - An ```error_datasource``` response will be returned if no csv has been loaded.
    - Note: If you try to load a new csv datasource, but it fails for some reason, a subsequent ```getcsv``` request will return the most recent successfully loaded csv's content.
- To get the temperature of a specific place in the United States, run ```localhost:3232/weather?lat=<latitude>&lon=<longitude>``` in your browser after starting the local server.  
  - For example, a succesful weather API response outputs ```{"result":"success","lat":41.8268,"lon":-71.4029,"temperature":66}```
  - If you pass invalid coordinates (meaning the NWS API doesn't provide forecasts or temperatures for that coordinate location), the API will output ```{"result":"error_bad_json"}```
