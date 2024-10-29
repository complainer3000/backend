const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Connect to MongoDB
mongoose.connect('mongodb://localhost/matchmaking', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Player Schema
const PlayerSchema = new mongoose.Schema({
    username: String,
    elo: { type: Number, default: 1000 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 }
});

const Player = mongoose.model('Player', mongoose.Schema);

// Game state
let queue = [];
const activeMatches = new Map();
const mapVotes = new Map();
const availableMaps = ['dust2', 'mirage', 'inferno', 'overpass', 'nuke'];

// Socket handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle player joining queue
    socket.on('joinQueue', async (playerData) => {
        const player = {
            id: socket.id,
            username: playerData.username,
            elo: playerData.elo || 1000
        };
        
        queue.push(player);
        socket.emit('queueJoined', { position: queue.length });
        
        // Check if we can make a match
        if (queue.length >= 10) {
            createMatch(queue.splice(0, 10));
        }
    });

    // Handle map voting
    socket.on('voteMap', (mapName) => {
        if (!mapVotes.has(mapName)) {
            mapVotes.set(mapName, 0);
        }
        mapVotes.set(mapName, mapVotes.get(mapName) + 1);
        
        // Broadcast updated votes to all clients
        io.emit('mapVotesUpdate', Object.fromEntries(mapVotes));
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        queue = queue.filter(player => player.id !== socket.id);
        console.log('Client disconnected:', socket.id);
    });
});

// Match creation logic
function createMatch(players) {
    // Sort players by ELO
    players.sort((a, b) => b.elo - a.elo);
    
    // Create balanced teams
    const teams = {
        team1: players.filter((_, index) => index % 2 === 0),
        team2: players.filter((_, index) => index % 2 === 1)
    };
    
    const matchId = Date.now().toString();
    activeMatches.set(matchId, {
        teams,
        status: 'voting',
        mapVotes: new Map()
    });
    
    // Notify players about the match
    io.emit('matchCreated', {
        matchId,
        teams,
        availableMaps
    });
}

// API endpoints
app.get('/maps', (req, res) => {
    res.json(availableMaps);
});

app.get('/queue/status', (req, res) => {
    res.json({
        playersInQueue: queue.length,
        estimatedWaitTime: Math.ceil(queue.length / 10) * 2 // Simple estimation
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});