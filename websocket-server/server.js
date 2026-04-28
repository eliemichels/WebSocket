
const express = require("express");
const app = express();
const { WebSocketServer } = require("ws");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");

app.use(express.static('Public'));
app.use(express.json());

const db = mysql.createConnection({
    host: "127.0.0.1",
    user: "root",
    password: "3006",
    database: "Murmure"
});

// on lance la connexion if marche ... else crash direct
db.connect(err => { if (err) throw err; console.log("MySQL connecté"); });

// le serveur websocket sur le port 8081
const wss = new WebSocketServer({ port: 8081 });

// liste de tous les gens connectes
let clients = [];

// envoie la liste a tout le monde
function envoyerUtilisateurs() {
    const users = clients.filter(c => c.username).map(c => ({ username: c.username, role: c.role }));
    const msg = JSON.stringify({ type: "users", users });
    // on envoie que si la connexion est bien ouverte
    clients.forEach(c => c.readyState === 1 && c.send(msg));
}

// envoie la liste des salons a tout le monde
function envoyerSalons() {
    db.query("SELECT * FROM salons ORDER BY id", (err, salons) => {
        const msg = JSON.stringify({ type: "salons", salons });
        clients.forEach(c => c.readyState === 1 && c.send(msg));
    });
}

// quand quelqu'un se connecte
wss.on("connection", (socket) => {
    clients.push(socket);

    // quand on recoit un message du client
    socket.on("message", async (message) => {

        let data;

        // si le message est pas du json on ignore
        try { data = JSON.parse(message); } catch { return; }

        // INSCRIPTION
        if (data.type === "register") {
            const username = (data.username || "").trim();
            const password = data.password || "";

            // verification des champs
            if (username.length < 3)
                return socket.send(JSON.stringify({ type: "error", message: "Le pseudo doit faire au moins 3 caractères" }));
            if (password.length < 8)
                return socket.send(JSON.stringify({ type: "error", message: "Le mot de passe doit faire au moins 8 caractères" }));

            // on verifie que le pseudo existe pas deja
            db.query("SELECT * FROM users WHERE username = ?", [username], async (err, results) => {
                if (results.length > 0)
                    return socket.send(JSON.stringify({ type: "error", message: "Pseudo déjà utilisé" }));

                // le premier compte cree devient admin automatiquement
                db.query("SELECT COUNT(*) as count FROM users", async (err, countRes) => {
                    const role = countRes[0].count === 0 ? 'admin' : 'user';

                    // on chiffre le mot de passe avant de le stocker
                    const hash = await bcrypt.hash(password, 10);

                    db.query("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, hash, role], () => {
                        socket.username = username;
                        socket.role = role;

                        socket.send(JSON.stringify({ type: "login_success", username, role }));
                        envoyerUtilisateurs();

                        // on envoie les salons et l'historique du premier salon
                        db.query("SELECT * FROM salons ORDER BY id", (err, salons) => {
                            socket.send(JSON.stringify({ type: "salons", salons }));
                            if (salons[0]) {
                                db.query("SELECT * FROM Messages WHERE salon_id = ? ORDER BY date DESC LIMIT 100", [salons[0].id], (err, msgs) => {
                                    socket.send(JSON.stringify({ type: "history", messages: msgs.reverse(), salon_id: salons[0].id }));
                                });
                            }
                        });
                    });
                });
            });
        }

        // CONNEXION
        if (data.type === "login") {
            const username = (data.username || "").trim();
            const password = data.password || "";

            // recherche utilisateur
            db.query("SELECT * FROM users WHERE username = ?", [username], async (err, results) => {
                if (results.length === 0)
                    return socket.send(JSON.stringify({ type: "error", message: "Utilisateur inconnu" }));

                const user = results[0];

                // on compare le mdp avec le hash 
                const valid = await bcrypt.compare(password, user.password);
                if (!valid)
                    return socket.send(JSON.stringify({ type: "error", message: "Mot de passe incorrect" }));

                socket.username = user.username;
                socket.role = user.role;

                socket.send(JSON.stringify({ type: "login_success", username: user.username, role: user.role }));
                envoyerUtilisateurs();

                // pareil que pour le register ont envoie les salon et l'historique
                db.query("SELECT * FROM salons ORDER BY id", (err, salons) => {
                    socket.send(JSON.stringify({ type: "salons", salons }));
                    if (salons[0]) {
                        db.query("SELECT * FROM Messages WHERE salon_id = ? ORDER BY date DESC LIMIT 100", [salons[0].id], (err, msgs) => {
                            socket.send(JSON.stringify({ type: "history", messages: msgs.reverse(), salon_id: salons[0].id }));
                        });
                    }
                });
            });
        }

        // ENVOI D'UN MESSAGE
        if (data.type === "message") {
            // faut etre connecte pour envoyer
            if (!socket.username) return;

            const salon_id = data.salon_id || 1;

            // on sauvegarde le message dans la bdd
            db.query("INSERT INTO Messages (username, text, salon_id) VALUES (?, ?, ?)", [socket.username, data.text, salon_id], (err, result) => {

                // on garde que les 100 derniers messages par salon
                db.query(`
                    DELETE FROM Messages WHERE salon_id = ? AND id NOT IN (
                        SELECT id FROM (SELECT id FROM Messages WHERE salon_id = ? ORDER BY date DESC LIMIT 100) tmp
                    )`, [salon_id, salon_id]);

                // on envoie le message a tous
                const msgData = { type: "message", id: result.insertId, username: socket.username, text: data.text, salon_id, date: new Date() };
                clients.forEach(c => c.readyState === 1 && c.send(JSON.stringify(msgData)));
            });
        }

        // CHARGEMENT DE L'HISTORIQUE D'UN SALON
        if (data.type === "get_history") {
            if (!socket.username) return;

            // on recupere les 100 derniers messages du salon demande
            db.query("SELECT * FROM Messages WHERE salon_id = ? ORDER BY date DESC LIMIT 100", [data.salon_id], (err, msgs) => {
                socket.send(JSON.stringify({ type: "history", messages: msgs.reverse(), salon_id: data.salon_id }));
            });
        }

        // CREATION D'UN SALON
        if (data.type === "create_salon") {
            if (!socket.username) return;

            // seuls les admin et createur peuvent creer des salons
            if (socket.role !== 'admin' && socket.role !== 'createur')
                return socket.send(JSON.stringify({ type: "error", message: "Permission refusée" }));

            const nom = (data.nom || "").trim();
            if (nom.length < 2)
                return socket.send(JSON.stringify({ type: "error", message: "Nom du salon trop court" }));

            db.query("INSERT INTO salons (nom, created_by) VALUES (?, ?)", [nom, socket.username], (err) => {
                // si le nom existe deja mysql renvoie une erreur
                if (err) return socket.send(JSON.stringify({ type: "error", message: "Salon déjà existant" }));
                envoyerSalons();
            });
        }

        // SUPPRESSION D'UN MESSAGE
        if (data.type === "delete_message") {
            // seul l'admin peut supprimer
            if (!socket.username || socket.role !== 'admin')
                return socket.send(JSON.stringify({ type: "error", message: "Permission refusée" }));

            db.query("DELETE FROM Messages WHERE id = ?", [data.message_id], () => {
                // on dit a tout le monde de supprimer ce message de leur ecran
                const msg = JSON.stringify({ type: "message_deleted", message_id: data.message_id });
                clients.forEach(c => c.readyState === 1 && c.send(msg));
            });
        }

        // CHANGEMENT DE ROLE
        if (data.type === "change_role") {
            // seul l'admin peut changer les roles
            if (!socket.username || socket.role !== 'admin')
                return socket.send(JSON.stringify({ type: "error", message: "Permission refusée" }));

            // on verifie que le role envoye est valide
            if (!['admin', 'createur', 'user'].includes(data.role)) return;

            db.query("UPDATE users SET role = ? WHERE username = ?", [data.role, data.target], () => {

                // si la personne est connectee on met a jour son role direct
                const target = clients.find(c => c.username === data.target);
                if (target) {
                    target.role = data.role;
                    target.send(JSON.stringify({ type: "role_updated", role: data.role }));
                }

                envoyerUtilisateurs();
            });
        }
    });

    // quand quelqu'un se deconnecte on le retire de la liste
    socket.on("close", () => {
        clients = clients.filter(c => c !== socket);
        envoyerUtilisateurs();
    });
});
app.listen(3000, () => console.log("Serveur HTTP lancé sur http://localhost:3000"));
console.log("Serveur WebSocket lancé sur ws://localhost:8081");
