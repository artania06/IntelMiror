/*
    This file is part of IntelMiror.

    IntelMiror is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    IntelMiror is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with IntelMiror.  If not, see <http://www.gnu.org/licenses/>.
*/



/* IMPORT MODULES */
let WebSocketServer = require("ws").Server;
let fs = require("fs");
let SQL = require("sql.js");
let unzip = require("unzip-stream");
let readable = require("stream").Readable;



/* CREATE DATABASE IF IT'S MISSING */
if (!fs.existsSync("miror.sqlite"))
{
  console.log("First run, creating database...");

  let db = new SQL.Database();
  db.run("CREATE TABLE Apps(id integer);");
  db.run("CREATE TABLE Settings(version integer, language varchar);");
  db.run("INSERT INTO Settings VALUES (1, 'FR');");

  console.log("Installing launcher app...");
  let appuid = Math.floor(new Date().getTime()/1000);
  db.run("CREATE TABLE '" + appuid + "'(key varchar, value varchar);");
  db.run("INSERT INTO Apps VALUES (" + appuid + ");");
  fs.writeFileSync("appentry.json", '{"appentry":"' + appuid + '"}');
  let appDir = appuid.toString();
  fs.mkdirSync(appDir);
  fs.createReadStream("launcherapp.zip").pipe(unzip.Extract({path:appDir})).on("close", function() {
    console.log("App launcher installed!");

    console.log("Installing store app...");
    appuid = Math.floor((new Date().getTime()/1000)+1);
    db.run("CREATE TABLE '" + appuid + "'(key varchar, value varchar);");
    db.run("INSERT INTO Apps VALUES (" + appuid + ");");
    appDir = appuid.toString();
    fs.mkdirSync(appDir);
    fs.createReadStream("storeapp.zip").pipe(unzip.Extract({path:appDir})).on("close", function() {
      console.log("App store installed!");

      let data = db.export();
      let buffer = new Buffer(data);

      fs.writeFileSync("miror.sqlite", buffer);

      afterInit();
    });
  });
}
else
{
  afterInit();
}



/* CALLED AFTER SERVER INITIALISATION */
function afterInit()
{
  /* CONVERT BASE64 TO BINARY */
  function convertDataURIToBinary(dataURI)
  {
    let BASE64_MARKER = ";base64,";
    let base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
    let base64 = dataURI.substring(base64Index);
    let raw = Buffer.from(base64, "base64").toString("binary");
    let rawLength = raw.length;
    let array = new Uint8Array(new ArrayBuffer(rawLength));
    for(let i = 0; i < rawLength; i++)
    {
      array[i] = raw.charCodeAt(i);
    }
    return array;
  }



  /* OPEN DATABASE */
  let dbFile = fs.readFileSync("miror.sqlite");
  let db = new SQL.Database(dbFile);



  /* OPEN WEBSOCKET */
  let ws = new WebSocketServer({port: 1234});
  let clients = [];
  console.log("Server started...");



  /* ON CONNECTION OPENED */
  ws.on("connection", function(ws) {
    clients.push(ws);

    /* ON MESSAGE RECEIVED */
    ws.on("message", function (str) {
      let ob = JSON.parse(str);
      switch(ob.type)
      {
        //Forward the gestures
        case "gesture":
        {
          switch (ob.position)
          {
            case "ul":
            {
              if (ob.fingers <= 4)
              {
                console.log("Gesture : RETURN");
                clients[1].send('{"type":"gesture","gesture":"return"}');
              }
              else
              {
                console.log("Gesture : UP LEFT");
                clients[1].send('{"type":"gesture","gesture":"upleft"}');
              }
              break;
            }
            case "u":
            {
              if (ob.fingers <= 4)
              {
                console.log("Gesture : OK");
                clients[1].send('{"type":"gesture","gesture":"ok"}');
              }
              else
              {
                console.log("Gesture : UP");
                clients[1].send('{"type":"gesture","gesture":"up"}');
              }
              break;
            }
            case "ur":
            {
              console.log("Gesture : UP RIGHT");
              clients[1].send('{"type":"gesture","gesture":"upright"}');
              break;
            }

            case "l":
            {
              console.log("Gesture : LEFT");
              clients[1].send('{"type":"gesture","gesture":"left"}');
              break;
            }
            case "c":
            {
              console.log("Gesture : CENTER");
              clients[1].send('{"type":"gesture","gesture":"center"}');
              break;
            }
            case "r":
            {
              console.log("Gesture : RIGHT");
              clients[1].send('{"type":"gesture","gesture":"right"}');
              break;
            }
            case "dl":
            {
              console.log("Gesture : DOWN LEFT");
              clients[1].send('{"type":"gesture","gesture":"downleft"}');
              break;
            }
            case "d":
            {
              console.log("Gesture : DOWN");
              clients[1].send('{"type":"gesture","gesture":"down"}');
              break;
            }
            case "dr":
            {
              console.log("Gesture : DOWN RIGHT");
              clients[1].send('{"type":"gesture","gesture":"downright"}');
              break;
            }
          }
          break;
        }

        //When the application wants to write a value in the database
        case "setvalue":
        {
          switch (ob.appuid)
          {
            //Write the data to settings database
            case 0:
            {
              db.run("UPDATE Settings SET " + ob.field + "='" + ob.value + "';");
              console.log("Update " + ob.field + ", using db 0, new value : " + ob.value);
              break;
            }

            //Write the data to all other apps databases
            default:
            {
              let result = db.exec("SELECT * FROM '" + ob.appuid + "'");
              if (result[0] === undefined) //Insert if the key does not exists
              {
                db.run("INSERT INTO '" + ob.appuid + "' VALUES (?, ?);", [ob.field, ob.value]);
                console.log("Insert into " + ob.appuid + ", using db " + ob.appuid + ", field : " + ob.field + ", new value : " + ob.value);
              }
              else //Update if the key exists
              {
                db.run("UPDATE '" + ob.appuid + "' SET value='" + ob.value + "' WHERE key='" + ob.field + "';");
                console.log("Update " + ob.field + ", using db " + ob.appuid + ", new value : " + ob.value);
              }
              break;
            }
          }
          break;
        }

        //When the application wants to get a value from the database
        case "getvalue":
        {
          switch (ob.appuid)
          {
            //Get the data from settings database
            case 0:
            {
              let result = db.exec("SELECT " + ob.field + " FROM Settings;");
              console.log("Request for " + ob.field + ", using db 0, returned : " + result[0].values[0][0]);
              ws.send('{"type":"value","field":"' + ob.field + '","value":"' + result[0].values[0][0] + '"}');
              break;
            }

            //Get the data from all other apps databases
            default:
            {
              try //Try to get the data
              {
                let result = db.exec("SELECT value FROM '" + ob.appuid + "' WHERE key='" + ob.field + "';");
                console.log("Request for " + ob.field + ", using db " + ob.appuid + ", returned : " + result[0].values[0][0]);
                ws.send('{"type":"value","field":"' + ob.field + '","value":"' + result[0].values[0][0] + '"}');
              }
              catch (exception) //If the data is not in the database
              {
                console.log("Request for " + ob.field + ", using db " + ob.appuid + ", returned : null");
                ws.send('{"type":"value","field":"' + ob.field + '","value":null}');
              }
              break;
            }
          }
          break;
        }

        //When the application wants to install an application
        case "install":
        {
          console.log("Installing app from " + ob.appurl + "...");
          let appuid = Math.floor(new Date().getTime()/1000);
          db.run("CREATE TABLE '" + appuid + "'(key varchar, value varchar);");
          db.run("INSERT INTO Apps VALUES (" + appuid + ");");
          let appDir = appuid.toString();
          fs.mkdirSync(appDir);
          let data = new readable();
          data.push(convertDataURIToBinary(ob.appdata));
          data.push(null);
          data.pipe(unzip.Extract({path:appDir}));
          console.log("App installed!");
          break;
        }

        //When the application wants to get the number of apps
        case "getappsnumber":
        {
          let appsNb = db.exec("SELECT COUNT(*) FROM Apps")[0].values[0][0];
          console.log("Getting apps number... " + appsNb + " installed!");
          ws.send('{"type":"value","field":"appsnumber","value":' + appsNb + '}');
          break;
        }

        //When the application wants to get the name of an app
        case "getappatpos":
        {
          let apps = db.exec("SELECT * FROM Apps");
          apps = apps[0].values;
          console.log("Getting app at position " + ob.position + "... app " + apps[ob.position] + " found!");
          ws.send('{"type":"value","field":"appatpos","value":' + apps[ob.position] + '}');
          break;
        }
      }
    });



    /* ON CONNECTION CLOSED */
    ws.on("close", function() {
      clients.splice(clients.indexOf(ws), 1);
    });
  });



  /* CLEANUP AND SAVE BEFORE EXIT */
  process.stdin.resume();
  process.on('SIGINT', function () {
    let data = db.export();
    let buffer = new Buffer(data);
    fs.writeFileSync("miror.sqlite", buffer);
    console.log("Database saved!");
    process.exit();
  });
}