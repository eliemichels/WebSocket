let socket;
let currentUser = "";
let currentRole = "";
let currentSalonId = null;
window.onload = () => {
    const user = localStorage.getItem("murmure_user");
    const pass = localStorage.getItem("murmure_pass");
    if (user && pass) {
        document.getElementById("username").value = user;
        document.getElementById("password").value = pass;
        login();
    }
};

// connexion au serveur websocket
function connecterWS(callback) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }

    // on prend l'ip de la page pour pas la coder en dur mdr
    const wsUrl = `ws://${window.location.hostname}:8081`;
    socket = new WebSocket(wsUrl);
    socket.onopen = () => callback();

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "login_success") {
            currentUser = data.username;
            currentRole = data.role;
            localStorage.setItem("murmure_user", data.username);
            localStorage.setItem("murmure_pass", document.getElementById("password").value);
            document.getElementById("auth-screen").style.display = "none";
            document.getElementById("chat-screen").style.display = "flex";
            document.getElementById("sidebar-username").textContent = data.username;
            document.getElementById("sidebar-role").textContent = afficherRole(data.role);

            // on affiche les boutons selon le role
            if (data.role === "admin") {
                document.getElementById("admin-panel").style.display = "flex";
                document.getElementById("create-salon-area").style.display = "block";
            } else if (data.role === "createur") {
                document.getElementById("create-salon-area").style.display = "block";
            }
        }

        if (data.type === "error") {
            document.getElementById("auth-error").textContent = data.message;
        }

        if (data.type === "salons") {
            mettreAJourSalons(data.salons);
        }

        if (data.type === "history") {
            if (data.salon_id === currentSalonId) {
                document.getElementById("messages").innerHTML = "";
                data.messages.forEach(msg => ajouterMessage(msg.id, msg.text, msg.username, msg.date));
            }
        }

        if (data.type === "message") {
            if (data.salon_id === currentSalonId) {
                ajouterMessage(data.id, data.text, data.username, data.date);
            }
        }

        // un message a ete supprime, on le retire de l'ecran
        if (data.type === "message_deleted") {
            const el = document.getElementById("msg-" + data.message_id);
            if (el) el.remove();
        }

        if (data.type === "users") {
            mettreAJourUtilisateurs(data.users);
        }

        // notre role a change, on met a jour l'interface
        if (data.type === "role_updated") {
            currentRole = data.role;
            document.getElementById("sidebar-role").textContent = afficherRole(data.role);
            if (data.role === "admin") {
                document.getElementById("admin-panel").style.display = "flex";
                document.getElementById("create-salon-area").style.display = "block";
            } else if (data.role === "createur") {
                document.getElementById("create-salon-area").style.display = "block";
            }
        }
    };
}

function afficherRole(role) {
    if (role === "admin") return "Admin";
    if (role === "createur") return "Createur";
    return "Utilisateur";
}

function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    document.getElementById("auth-error").textContent = "";
    connecterWS(() => {
        socket.send(JSON.stringify({ type: "login", username, password }));
    });
// si pas de réponse en 3s → identifiants incorrects
    setTimeout(() => {
        if (document.getElementById("auth-screen").style.display !== "none") {
            document.getElementById("auth-error").textContent = "Identifiants incorrects.";
        }
    }, 3000);
}

function register() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    document.getElementById("auth-error").textContent = "";

    // validation avant meme d'envoyer au serveur
    if (username.length < 3) {
        document.getElementById("auth-error").textContent = "Le pseudo doit faire au moins 3 caractères";
        return;
    }
    if (password.length < 8) {
        document.getElementById("auth-error").textContent = "Le mot de passe doit faire au moins 8 caractères";
        return;
    }

    connecterWS(() => {
        socket.send(JSON.stringify({ type: "register", username, password }));
    });
}

function sendMessage() {
    const msg = document.getElementById("msg").value.trim();
    if (!msg || !currentSalonId) return;
    socket.send(JSON.stringify({ type: "message", text: msg, salon_id: currentSalonId }));
    document.getElementById("msg").value = "";
}

function ajouterMessage(id, text, username, date) {
    const div = document.getElementById("messages");
    const message = document.createElement("div");
    message.classList.add("message");
    message.id = "msg-" + id;

    const time = date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
    const isMe = username === currentUser;

    // bouton suppr visible que pour l'admin
    let deleteBtn = "";
    if (currentRole === "admin") {
        deleteBtn = `<button class="btn-delete" onclick="supprimerMessage(${id})">suppr</button>`;
    }

    message.innerHTML = `
        <div class="msg-header">
            <span class="msg-username ${isMe ? 'me' : ''}">${username}</span>
            <span class="msg-time">${time}</span>
            ${deleteBtn}
        </div>
        <div class="msg-text">${nettoyerHtml(text)}</div>
    `;

    div.appendChild(message);
    div.scrollTop = div.scrollHeight;
}

// protection contre les injections html
function nettoyerHtml(text) {
    return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function supprimerMessage(id) {
    socket.send(JSON.stringify({ type: "delete_message", message_id: id }));
}

function mettreAJourUtilisateurs(users) {
    const list = document.getElementById("users");
    list.innerHTML = "";
    const select = document.getElementById("role-target-user");
    select.innerHTML = '<option value="">Choisir un user</option>';

    users.forEach(u => {
        const li = document.createElement("li");
        li.textContent = u.username + " - " + afficherRole(u.role);
        list.appendChild(li);

        const opt = document.createElement("option");
        opt.value = u.username;
        opt.textContent = u.username;
        select.appendChild(opt);
    });
}

function mettreAJourSalons(salons) {
    const list = document.getElementById("salon-list");
    list.innerHTML = "";

    salons.forEach(s => {
        const li = document.createElement("li");
        li.textContent = "# " + s.nom;
        li.classList.add("salon-item");
        if (s.id === currentSalonId) li.classList.add("active");
        li.onclick = () => changerSalon(s.id, s.nom);
        list.appendChild(li);
    });

    // si on a pas encore de salon actif on charge le premier
    if (!currentSalonId && salons.length > 0) {
        changerSalon(salons[0].id, salons[0].nom);
    }
}

function changerSalon(id, nom) {
    currentSalonId = id;
    document.getElementById("current-salon-name").textContent = "# " + nom;
    document.getElementById("messages").innerHTML = "";

    document.querySelectorAll(".salon-item").forEach(li => {
        li.classList.toggle("active", li.textContent === "# " + nom);
    });

    socket.send(JSON.stringify({ type: "get_history", salon_id: id }));
}

function createSalon() {
    const nom = document.getElementById("new-salon-name").value.trim();
    if (!nom) return;
    socket.send(JSON.stringify({ type: "create_salon", nom }));
    document.getElementById("new-salon-name").value = "";
}

function toggleRolePanel() {
    const panel = document.getElementById("role-panel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
}

function changeRole() {
    const target = document.getElementById("role-target-user").value;
    const role = document.getElementById("role-value").value;
    if (!target) return;
    socket.send(JSON.stringify({ type: "change_role", target, role }));
}

function logout() {
    if (socket) socket.close();
    localStorage.removeItem("murmure_user");
    localStorage.removeItem("murmure_pass");
    currentUser = "";
    currentRole = "";
    currentSalonId = null;
    document.getElementById("chat-screen").style.display = "none";
    document.getElementById("auth-screen").style.display = "flex";
    document.getElementById("messages").innerHTML = "";
    document.getElementById("users").innerHTML = "";
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    document.getElementById("create-salon-area").style.display = "none";
    document.getElementById("admin-panel").style.display = "none";
}
