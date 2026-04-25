const express = require("express");
const app = express();

const { WebSocketServer } = require("ws");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");

// middleware
app.use(express.static('Public'));
app.use(express.json());


// BDD 
const db = mysql.createConnection({
    host: "localhost",
    user: "Murmure",
    password: "",
    database: "Murmure"
});

db.connect(err => {
    if (err) throw err;
    console.log("MySQL connecté");
});

//  WEBSOCKET
const ws = new WebSocketServer({ port: 8081 });

let clients = [];

function broadcastUsers() {
    const users = clients
        .filter(c => c.username)
        .map(c => c.username);

    clients.forEach(client => {
        client.send(JSON.stringify({
            type: "users",
            users: users
        }));
    });
}

ws.on("connection", (socket) => {

    console.log("Client connecté");
    clients.push(socket);

    socket.on("message", async (message) => {

        let data;

        try {
            data = JSON.parse(message);
        } catch {
            return;
        }

        // REGISTER 
if (data.type === "register") {

    db.query(
        "SELECT * FROM users WHERE username = ?",
        [data.username],
        async (err, results) => {

            if (results.length > 0) {
                socket.send(JSON.stringify({
                    type: "error",
                    message: "Utilisateur déjà existant"
                }));
                return;
            }

            const hash = await bcrypt.hash(data.password, 10);

            db.query(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                [data.username, hash],
                () => {

                    socket.username = data.username;

                    socket.send(JSON.stringify({
                        type: "login_success"
                    }));

                    broadcastUsers();

                    db.query(
                        "SELECT * FROM Messages ORDER BY date DESC LIMIT 100",
                        (err, results) => {

                            socket.send(JSON.stringify({
                                type: "history",
                                messages: results.reverse()
                            }));
                        }
                    );
                }
            );
        }
    );
}   


        // LOGIN 
        if (data.type === "login") {

            db.query(
                "SELECT * FROM users WHERE username = ?",
                [data.username],
                async (err, results) => {

                    if (results.length === 0) {
                        socket.send(JSON.stringify({
                            type: "error",
                            message: "Utilisateur inconnu"
                        }));
                        return;
                    }

                    const user = results[0];
                    const valid = await bcrypt.compare(data.password, user.password);

                    if (!valid) {
                        socket.send(JSON.stringify({
                            type: "error",
                            message: "Mot de passe incorrect"
                        }));
                        return;
                    }

                    socket.username = user.username;

                    socket.send(JSON.stringify({
                        type: "login_success"
                        
                    }));

                    broadcastUsers();

                    // HISTORIQUE
                    db.query(
                        "SELECT * FROM Messages ORDER BY date DESC LIMIT 100",
                        (err, results) => {

                            if (err) {
                                console.error("Erreur MySQL :", err);
                                return;
                            }

                            socket.send(JSON.stringify({
                                type: "history",
                                messages: results.reverse()
                            }));
                        }
                    );
                }
            );
        }

        // MESSAGE 
        if (data.type === "message") {

            if (!socket.username) return;

            const username = socket.username;

            // sauvegarde
            db.query(
                "INSERT INTO Messages (username, text) VALUES (?, ?)",
                [username, data.text]
            );

            // garder 100 messages max
            db.query(`
                DELETE FROM Messages 
                WHERE id NOT IN (
                    SELECT id FROM (
                        SELECT id FROM Messages ORDER BY date DESC LIMIT 100
                    ) tmp
                )
            `);

            // envoyer à tous
            clients.forEach(client => {
                client.send(JSON.stringify({
                    type: "message",
                    username: username,
                    text: data.text
                }));
            });
        }
    });

    // DECONNEXION 
    socket.on("close", () => {
        console.log("Client déconnecté");

        clients = clients.filter(c => c !== socket);
        broadcastUsers();
    });
});

console.log("Serveur WebSocket lancé sur ws://localhost:8081");

app.listen(3000, () => {
    console.log("Serveur HTTP lancé sur http://localhost:3000");
});