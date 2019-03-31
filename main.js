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

io.on('connect', function(socket) {
    socket.on('disconnecting', function(reason) {

    });
    socket.on('disconnect', function(reason) {

    });
    socket.on('error', function(error) {

    });
    socket.emit("welcome", "Connection established");
});

server.listen(2998);
console.log("Server is up and running on port 2998");

process.on('SIGTERM', function() {
    console.log("Stopping server...");
    server.close(function() {
        console.log("Server has been stopped.");
    });
});