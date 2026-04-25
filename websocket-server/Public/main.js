let socket;

function connectWS() {
    socket = new WebSocket("ws://192.168.1.50:8081");

    socket.onopen = () => {
        console.log("Connecté au serveur");
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "users") {
            updateUsers(data.users);
        }

        if (data.type === "message") {
            addMessage(data.text, data.username, data.date);
        }

        if (data.type === "history") {
            data.messages.forEach(msg => {
                addMessage(msg.text, msg.username, msg.created_at);
            });
        }

        if (data.type === "login_success") {
            document.getElementById("auth").style.display = "none";
            document.getElementById("chat").style.display = "block";
        }

        if (data.type === "error") {
            alert(data.message);
        }
    };
}

function login() {
    connectWS();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    socket.onopen = () => {
        socket.send(JSON.stringify({
            type: "login",
            username: username,
            password: password
        }));
    };
}

function register() {
    connectWS();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    socket.onopen = () => {
        socket.send(JSON.stringify({
            type: "register",
            username: username,
            password: password
        }));
    };
}

function sendMessage() {
    const msg = document.getElementById("msg").value;

    socket.send(JSON.stringify({
        type: "message",
        text: msg
    }));

    document.getElementById("msg").value = "";
}

function addMessage(text, username = "", date = "") {
    const div = document.getElementById("messages");

    const message = document.createElement("div");
    message.classList.add("message");

    const time = date ? new Date(date).toLocaleTimeString() : "";

    message.innerHTML = `
        <span class="username">${username}</span>
        <span class="time">${time}</span><br>
        ${text}
    `;

    div.appendChild(message);
    div.scrollTop = div.scrollHeight;
}

function updateUsers(users) {
    const list = document.getElementById("users");
    list.innerHTML = "";

    users.forEach(user => {
        const li = document.createElement("li");
        li.textContent = user;
        list.appendChild(li);
    });
}

function logout() {
    if (socket) {
        socket.close(); // ferme le WebSocket
    }

    document.getElementById("chat").style.display = "none";
    document.getElementById("auth").style.display = "block";

    document.getElementById("messages").innerHTML = "";
    document.getElementById("users").innerHTML = "";
}