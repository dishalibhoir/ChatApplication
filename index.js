const express = require('express');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const mongoose = require('mongoose');
const fs = require('fs');
const User = require('../models/user');  // Import User model


const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MongoDB connection
mongoose.connect('mongodb://localhost/chatapp', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Error connecting to MongoDB:', err.message);
});

// Configure multer for file uploads
const upload = multer({ dest: path.join(__dirname, '../public/uploads/') });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true })); // To parse form data

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Hardcoded meeting code for simplicity
const VALID_MEETING_CODE = 'chat1234';

// Route to render the login page
app.get('/', (req, res) => {
    res.render('login');
});

// Handle login form submission and save to the database
app.post('/login', async (req, res) => {
    const { name, email, meetingCode } = req.body;

    // Validate email format on the server
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        return res.render('login', { error: 'Invalid email format.' });
    }

    if (meetingCode === VALID_MEETING_CODE) {
        try {
            // Check if the user already exists
            let user = await User.findOne({ email });
            if (!user) {
                // Save new user to the database
                user = new User({ name, email, meetingCode });
                await user.save();
            }

            // If login successful, redirect to chat page with user data
            return res.redirect(`/chat?name=${name}&email=${email}`);
        } catch (err) {
            console.error('Error saving user to database:', err);
            return res.render('login', { error: 'Error logging in. Please try again.' });
        }
    } else {
        // If login failed, re-render login page with error message
        return res.render('login', { error: 'Invalid meeting code' });
    }
});

// Route to render the chat page
app.get('/chat', (req, res) => {
    const { name, email } = req.query;
    if (!name || !email) {
        return res.redirect('/');
    }
    res.render('index', { name, email });
});

// Handle file uploads
app.post('/upload', upload.single('file'), (req, res) => {
    if (req.file) {
        const filePath = path.join(__dirname, '../public/uploads/', req.file.filename);
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                console.error(`File does not exist: ${filePath}`);
                return res.status(404).send('File not found');
            }
            res.json({ fileName: req.file.filename, originalName: req.file.originalname });
        });
    } else {
        res.status(400).send('No file uploaded');
    }
});

// Socket.io setup
const users = {}; // Object to store users

io.on('connection', socket => {
    console.log(`User connected: ${socket.id}`);

    // Handle new user joining
    socket.on('new-user-joined', name => {
        users[socket.id] = name;
        socket.broadcast.emit('user-joined', name);
    });

    // Handle message sending
    socket.on('send', message => {
        socket.broadcast.emit('receive', { message: message, name: users[socket.id] });
    });

    // Handle file sending
    socket.on('send-file', fileData => {
        socket.broadcast.emit('receive-file', { ...fileData, name: users[socket.id] });
    });

    // Handle user leaving
    socket.on('disconnect', () => {
        const name = users[socket.id];
        if (name) {
            socket.broadcast.emit('leave', name);
            delete users[socket.id];
        }
    });
});

// Start the server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


