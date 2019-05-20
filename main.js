const console = require('console');
const fs = require('fs');
const server = require('https').createServer({
    key: fs.readFileSync("/etc/letsencrypt/live/socket.assembl.science/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/socket.assembl.science/cert.pem"),
    ca: fs.readFileSync("/etc/letsencrypt/live/socket.assembl.science/chain.pem"),
    requestCert: false,
    rejectUnauthorized: false
});
const io = require('socket.io')(server, {
    pingInterval: 50000,
    pingTimeout: 150000
});
// io.origins(['https://www.assembl.science:443', 'https://app.assembl.science:443']);
const ss = require('socket.io-stream');

let assemblIDs = {};
let otherData = {};
let outgoingStreams = {};
let requiredOtherData = ["assembl_id", "orcid_id", "user_name"];
requiredOtherData = requiredOtherData.sort();
let assemblIDPattern = /^AS([A-Z0-9]{10})$/;

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
    outgoingStreams[socket.id] = ss.createStream();
    outgoingStreams[socket.id].on('end', function() {
        console.log(Date.now() + " - " + socket.id + " outgoingStream ended");
    });
    outgoingStreams[socket.id].on('finish', function() {
        console.log(Date.now() + " - " + socket.id + " outgoingStream finished");
    });
    outgoingStreams[socket.id].on('error', function(err) {
        console.log(Date.now() + " - " + socket.id + " experienced an error");
        console.error(err);
    });
    socket.on('disconnecting', function(reason) {
        
    });
    socket.on('disconnect', function(reason) {
        console.log(socket.id + " disconnected for reason: " + reason);
        assemblIDs[socket.id] = null;
        otherData[socket.id] = null;
        outgoingStreams[socket.id] = null;
        delete assemblIDs[socket.id];
        delete otherData[socket.id];
        delete outgoingStreams[socket.id];
    });
    socket.on('error', function(error) {

    });
    socket.on('as_send_chunk', function(chunk, number) {
        // console.log(Date.now() + " - " + socket.id + " sending chunk to receiver");
        socket.to(socket.id).emit("as_chunk_for_receiver", chunk, number);
        socket.emit("as_success", "chunk_sent_to_receiver", "Chunk sent to receiver");
        // console.log(Date.now() + " - " + socket.id + " chunk sent to receiver");
    });
    socket.on('as_send_unencrypted_chunk', function(chunk, number) {
        // console.log(Date.now() + " - " + socket.id + " sending unencrypted chunk to receiver");
        socket.to(socket.id).emit("as_unencrypted_chunk_for_receiver", chunk, number);
        socket.emit("as_success", "chunk_sent_to_receiver", "Chunk sent to receiver");
        // console.log(Date.now() + " - " + socket.id + " unencrypted chunk sent to receiver");
    });
    ss(socket).on('as_send_stream', function(stream) {
        console.log(Date.now() + " - " + socket.id + " sending stream to receiver");
        stream.pipe(outgoingStreams[socket.id]);
        console.log(Date.now() + " - " + socket.id + " stream sent to receiver");
    });
    socket.on('as_send_event', function(eventName, data) {
        // console.log(Date.now() + " - " + socket.id + " sending event to receiver");
        socket.to(socket.id).emit("as_event_for_receiver", eventName, data);
        socket.emit("as_success", "event_sent_to_receiver", "Event sent to receiver");
        // console.log(Date.now() + " - " + socket.id + " event sent to receiver");
    });
    socket.on('as_send_event_to_sender', function(eventName, data) {
        console.log(Date.now() + " - " + socket.id + " sending event to sender");
        if (hasAssemblID(socket.id)) {
            let connected = getConnectedSocketID(socket);
            let connectedAssemblID = getAssemblID(connected);
            if (connected != null) {
                if (isOnline(connectedAssemblID)) {
                    socket.to(connected).emit("as_event_for_sender", eventName, data);
                    socket.emit("as_success", "event_sent_to_sender", "Event sent to sender");
                    console.log(Date.now() + " - " + socket.id + " event sent to sender");
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
                socket.to(otherSocketID).emit("as_connection_request", userData["assembl_id"], userData["user_name"], userData["orcid_id"]);
                socket.emit("as_connecting_to", senderData["assembl_id"], senderData["user_name"], senderData["orcid_id"]);
            }
            else {
                socket.emit("as_error", "client_not_connected", assembl_id + " is offline");
            }
        }
        else {
            socket.emit("as_error", "no_assembl_id", "Send your data using the as_my_data event before sending any events.");
        }
    });
    socket.on('as_connection_accepted', function(assembl_id) {
        if (hasAssemblID(socket.id)) {
            if (isOnline(assembl_id)) {
                let otherSocketID = getSocketID(assembl_id);
                let userData = getUserData(socket.id);
                let receiverData = getUserData(otherSocketID);
                let receiverSocket = io.sockets.connected[otherSocketID];
                receiverSocket.join(socket.id);
                receiverSocket.to(socket.id).emit("as_connection_made", receiverData["assembl_id"], receiverData["user_name"], receiverData["orcid_id"]);
                receiverSocket.emit("as_success", "connection_established", "Connected to " + userData["assembl_id"]);
                ss(receiverSocket).emit('as_stream_for_receiver', outgoingStreams[socket.id]);
                receiverSocket.emit("as_connected_to", userData["assembl_id"], userData["user_name"], userData["orcid_id"]);
            }
        }
        else {
            socket.emit("as_error", "no_assembl_id", "Send your data using the as_my_data event before sending any events.");
        }
    });
    socket.on('as_connection_rejected', function(assembl_id) {
        if (hasAssemblID(socket.id)) {
            if (isOnline(assembl_id)) {
                let otherSocketID = getSocketID(assembl_id);
                let userData = getUserData(socket.id);
                let receiverSocket = io.sockets.connected[otherSocketID];
                receiverSocket.emit("as_connection_rejected", userData["assembl_id"], userData["user_name"], userData["orcid_id"]);
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

setInterval(function(){
    // global.gc();
}, 30000);

process.on('SIGTERM', function() {
    console.log("Stopping server...");
    server.close(function() {
        console.log("Server has been stopped.");
    });
});