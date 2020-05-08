Promise = require "bluebird"
bhttp = require "./"

formatLine = (line) -> line.toString().replace(/\n/g, "\\n").replace(/\r/g, "\\r")

# this just tests we can parse the data we sent. if ever we send
# more data than the content-length it will probably be broken
Promise.try ->
    bhttp.post "http://posttestserver.com/post.php",
        value: "hello \ud801\udc37",
    ,
        encodeJSON: true,
        headers: {"user-agent": "bhttp/test POST UTF-8 JSON"}
.then (response) ->
    responseUrl = response.body.toString().split("\n")[1].replace(/^View it at /, "")
    console.log responseUrl
    bhttp.get responseUrl
.then (response) ->
    lines = response.body.toString().split("\n")
    JSON.parse lines[lines.length-1]
.then (obj) ->
    console.log "POST UTF-8 string", obj
