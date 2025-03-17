const socket = io(`http://${window.location.hostname}:8000`);

const form = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const messageContainer = document.querySelector(".messages");
const fileForm = document.getElementById("file-form");
const fileInput = document.getElementById("file-input");
const audio = new Audio("ting.mp3");

// Video call elements
const startCallButton = document.getElementById('start-call');
const endCallButton = document.getElementById('end-call');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

let localStream;
let peerConnection;

const peerConnectionConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Function to append messages to the chat container
const append = (message, position) => {
    const messageElement = document.createElement("div");
    messageElement.classList.add('message', position);
    messageElement.innerHTML = message;
    messageContainer.append(messageElement);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    if (position === "left") {
        audio.play();
    }
};

// Prompt for the user's name
const username = prompt("Enter your name");
if (username) {
    socket.emit('new-user-joined', username);
}

// Handle new user joining
socket.on('user-joined', name => {
    append(`${name} joined the chat`, 'left');
});

// Handle receiving a message
socket.on('receive', data => {
    append(`${data.name}: ${data.message}`, 'left');
});

// Handle receiving a file
socket.on('receive-file', data => {
    const fileLink = `<a href="/uploads/${data.fileName}" target="_blank">${data.originalName}</a>`;
    append(`${data.name} sent a file: ${fileLink}`, 'left');
});

// Handle a user leaving the chat
socket.on('leave', name => {
    append(`${name} left the chat`, 'center');
});

// Handle message submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();

    if (message) {
        append(`You: ${message}`, 'right');
        socket.emit('send', message);
        messageInput.value = '';
    }
});

// Handle file upload
fileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = fileInput.files[0];

    if (file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('File upload failed');
            }

            const data = await response.json();
            append(`You sent a file: <a href="/uploads/${data.fileName}" target="_blank">${data.originalName}</a>`, 'right');
            socket.emit('send-file', { fileName: data.fileName, originalName: data.originalName });
        } catch (error) {
            console.error('Error uploading file:', error);
        }

        fileInput.value = '';
    }
});

// Video call initiation
startCallButton.addEventListener('click', async () => {
    startCallButton.disabled = true;
    endCallButton.disabled = false;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        peerConnection = new RTCPeerConnection(peerConnectionConfig);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = event => {
            console.log('Received remote track:', event.streams[0]);
            remoteVideo.srcObject = event.streams[0];
        };

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('ice-candidate', event.candidate);
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('Sending video offer:', offer);
        socket.emit('video-offer', offer);
    } catch (error) {
        console.error('Error starting call:', error);
    }
});

// Handle receiving a video offer
socket.on('video-offer', async (offer) => {
    try {
        if (!peerConnection) {
            peerConnection = new RTCPeerConnection(peerConnectionConfig);

            peerConnection.ontrack = event => {
                console.log('Received remote track:', event.streams[0]);
                remoteVideo.srcObject = event.streams[0];
            };

            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    socket.emit('ice-candidate', event.candidate);
                }
            };
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log('Sending video answer:', answer);
        socket.emit('video-answer', answer);
    } catch (error) {
        console.error('Error handling video offer:', error);
    }
});

// Handle receiving a video answer
socket.on('video-answer', async (answer) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error handling video answer:', error);
    }
});

// Handle ICE candidate exchange
socket.on('ice-candidate', async (candidate) => {
    try {
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// Handle call ending
endCallButton.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;

    startCallButton.disabled = false;
    endCallButton.disabled = true;

    socket.emit('end-call');
});

// Handle call ending from the other side
socket.on('end-call', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;

    startCallButton.disabled = false;
    endCallButton.disabled = true;
});