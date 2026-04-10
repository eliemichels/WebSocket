const { WebSocketServer } =  require ('ws');

const server = new WebSocketServer ({
port : 8081
});

server.on ( 'connection' , ( socket ) => {
console.log ( 'client connecté' ); 
socket.on ('message' , (message) => {
console.log(`Received: ${message}`);
socket.send(`Server: ${message}`);
});

socket.on( 'close', () => {
console.log('client déconnecté');
});
});
console.log('WebSocket est demarer petit ahahah sur le ws ://localhost:8081');
