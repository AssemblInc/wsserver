const console = require('console');
const fs = require('fs');
const server = require('https').createServer({
    key: fs.readFileSync("/etc/letsencrypt/live/socket.assembl.science/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/socket.assembl.science/cert.pem"),
    ca: fs.readFileSync("/etc/letsencrypt/live/socket.assembl.science/chain.pem"),
    requestCert: false,
    rejectUnauthorized: false
});
const io = require('socket.io')(server);
// io.origins(['https://www.assembl.science:443', 'https://app.assembl.science:443']);

let assemblIDs = {};
let otherData = {};
let requiredOtherData = ["assembl_id", "orcid_id", "user_name"];
requiredOtherData = requiredOtherData.sort();
let assemblIDPattern = /^AS([A-z0-9]{10})$/;

function swap(json){
    var ret = {};
    for(var key in json){
        ret[json[key]] = key;
    }
    return ret;
}

function hasAssemblID(socketID) {
    if (Object.keys(assemblIDs).indexOf(socketID) > -1) {
        if (assemblIDs[socketID] !== false) {
            return true;
        }
        else {
            return false;
        }
    }
    else {
        return false;
    }
}

function isOnline(assemblID) {
    return Object.values(assemblIDs).indexOf(assemblID) > -1;
}

function getSocketID(assemblID) {
    let swappedAssemblIDs = swap(assemblIDs);
    return swappedAssemblIDs[assemblID];
}

function getAssemblID(socketID) {
    return assemblIDs[socketID];
}

function getConnectedSocketID(socket) {
    let rooms = Object.keys(socket.rooms);
    if (rooms.length == 2) {
        return rooms[1];
    }
    else {
        return null;
    }
}

function getUserData(socketID) {
    return otherData[socketID];
}

io.on('connect', function(socket) {
    assemblIDs[socket.id] = false;
    otherData[socket.id] = {};
    socket.on('disconnecting', function(reason) {
        
    });
    socket.on('disconnect', function(reason) {

    });
    socket.on('error', function(error) {

    });
    socket.on('as_send_chunk', function(chunk) {
        socket.to(socket.id).emit("as_chunk_for_receiver", chunk);
        socket.emit("as_success", "chunk_sent_to_receiver", "Chunk sent to receiver");
    });
    socket.on('as_send_event', function(eventName, data) {
        socket.to(socket.id).emit("as_event_for_receiver", eventName, data);
        socket.emit("as_success", "event_sent_to_receiver", "Event sent to receiver");
    });
    socket.on('as_send_event_to_sender', function(eventName, data) {
        if (hasAssemblID(socket.id)) {
            let connected = getConnectedSocketID(socket);
            if (connected != null) {
                if (isOnline(connected)) {
                    socket.to(connected).emit("as_event_for_sender", eventName, data);
                    socket.emit("as_success", "event_sent_to_sender", "Event sent to sender");
                }
                else {
                    socket.emit("as_error", "client_not_connected", "Sender is offline");
                }
            }
            else {
                socket.emit("as_error", "no_client_connected", "Make a connection with a different client first using the as_connect_to event");
            }
        }
        else {
            socket.emit("as_error", "no_assembl_id", "Send your data using the as_my_data event before sending any events.");
        }
    });
    socket.on('as_connect_to', function(assembl_id) {
        if (hasAssemblID(socket.id)) {
            if (isOnline(assembl_id)) {
                let otherSocketID = getSocketID(assembl_id);
                let userData = getUserData(socket.id);
                let senderData = getUserData(otherSocketID);
                socket.join(otherSocketID);
                socket.to(otherSocketID).emit("as_connection_made", userData["assembl_id"], userData["user_name"], userData["orcid_id"]);
                socket.emit("as_success", "connection_established", "Connected to " + assembl_id);
                socket.emit("as_connected_to", senderData["assembl_id"], senderData["user_name"], senderData["orcid_id"]);
            }
            else {
                socket.emit("as_error", "client_not_connected", assembl_id + " is offline");
            }
        }
        else {
            socket.emit("as_error", "no_assembl_id", "Send your data using the as_my_data event before sending any events.");
        }
    });
    socket.on('as_my_data', function(my_data) {
        let dataKeys = Object.keys(my_data).sort();
        if (dataKeys.join(",") === requiredOtherData.join(",")) {
            let isValidID = assemblIDPattern.test(my_data["assembl_id"]);
            if (isValidID) {
                assemblIDs[socket.id] = my_data["assembl_id"];
                otherData[socket.id] = my_data;
                socket.emit("as_success", "my_data_set", "Data set");
                console.log("Data set for " + socket.id);
                console.log(otherData[socket.id]);
            }
            else {
                socket.emit("as_error", "invalid_assembl_id", "The given assembl_id is invalid. An assembl_id should start with AS, following 10 capitalized letters and/or numbers.");
            }
        }
        else {
            socket.emit("as_error", "missing_data_keys", "Make sure all of the following data is set: [" + requiredOtherData.join(", ") + "]");
        }
    });
    socket.emit("as_welcome", "Connection established. Now send your data using the as_my_data event.");
    console.log("A socket connected: " + socket.id);
});

server.listen(2998);
console.log("Server is up and running on port 2998");

process.on('SIGTERM', function() {
    console.log("Stopping server...");
    server.close(function() {
        console.log("Server has been stopped.");
    });
});