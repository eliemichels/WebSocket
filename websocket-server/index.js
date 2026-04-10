import { WebSocketServer } from 'ws';
import express from 'express';
//const express = require('express')
const app = express()
const port = 3000
app.get('/', (req, res) => {
  res.sendFile(path.join(_dirname, 'index.html'));   // serve the index.html file
app.listen(port, () => {
console.log(`Exemple app listening on port ${port}`)
})

const server = new WebSocketServer({
port: 8081
});

var client = [];

server.on('connection', (socket) => {
console.log('Client connecté);
clients.push(socket);

socket.on('message', (message) =>{
console.log(`Received: ${message}`);
}
//socket.send(`Server: '${message}');
});

socket.on('close' , () => {
console.log('Client disconnected');
//retire le socket du tableaux de clients.
var index = clients.index0f(socket);
if (index !== -1)
{
clients.splice(index, 1)
}
});
});

console.log('WebSocket server is running on ws://localhost:8081');

