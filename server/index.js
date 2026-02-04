// Among Us Clone - Game Server with Real Lobby System
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, createTransferInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bs58 = require('bs58');

// ============================================
// SOLANA PAYOUT CONFIGURATION
// ============================================

const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const TOKEN_MINT = process.env.TOKEN_MINT_ADDRESS;
const DEV_PRIVATE_KEY = process.env.DEV_WALLET_PRIVATE_KEY;

let connection = null;
let devWallet = null;
let tokenMint = null;

// Initialize Solana connection
function initSolana() {
    try {
        connection = new Connection(SOLANA_RPC, 'confirmed');

        if (DEV_PRIVATE_KEY) {
            const privateKeyBytes = bs58.decode(DEV_PRIVATE_KEY);
            devWallet = Keypair.fromSecretKey(privateKeyBytes);
            console.log('Dev wallet loaded:', devWallet.publicKey.toString());
        } else {
            console.warn('No DEV_WALLET_PRIVATE_KEY set - payouts disabled');
        }

        if (TOKEN_MINT) {
            tokenMint = new PublicKey(TOKEN_MINT);
            console.log('Token mint:', TOKEN_MINT);
        } else {
            console.warn('No TOKEN_MINT_ADDRESS set - payouts disabled');
        }

        console.log('Solana connection initialized');
    } catch (err) {
        console.error('Failed to initialize Solana:', err.message);
    }
}

// Payout tokens to winners
async function payoutToWinners(winnerAddresses, totalAmount) {
    if (!connection || !devWallet || !tokenMint) {
        console.log('Solana not configured - skipping payout');
        return { success: false, error: 'Solana not configured' };
    }

    if (!winnerAddresses || winnerAddresses.length === 0) {
        return { success: false, error: 'No winners to pay' };
    }

    const amountPerWinner = Math.floor(totalAmount / winnerAddresses.length);
    const results = [];

    console.log(`Paying ${amountPerWinner} tokens to ${winnerAddresses.length} winners`);

    for (const address of winnerAddresses) {
        try {
            const recipientPubkey = new PublicKey(address);

            // Get or create token accounts
            const devTokenAccount = await getOrCreateAssociatedTokenAccount(
                connection,
                devWallet,
                tokenMint,
                devWallet.publicKey
            );

            const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
                connection,
                devWallet,
                tokenMint,
                recipientPubkey
            );

            // Create transfer instruction (amount in smallest units - assuming 9 decimals)
            const transferAmount = amountPerWinner * Math.pow(10, 9);

            const transaction = new Transaction().add(
                createTransferInstruction(
                    devTokenAccount.address,
                    recipientTokenAccount.address,
                    devWallet.publicKey,
                    transferAmount,
                    [],
                    TOKEN_PROGRAM_ID
                )
            );

            // Send transaction
            const signature = await connection.sendTransaction(transaction, [devWallet]);
            await connection.confirmTransaction(signature);

            console.log(`Paid ${amountPerWinner} tokens to ${address}: ${signature}`);
            results.push({ address, amount: amountPerWinner, signature, success: true });
        } catch (err) {
            console.error(`Failed to pay ${address}:`, err.message);
            results.push({ address, error: err.message, success: false });
        }
    }

    return { success: true, results };
}

// Initialize Solana on server start
initSolana();

const app = express();

// ============================================
// ROOM POLYGON DATA FOR ADMIN TABLE
// ============================================

// Load room polygon data (fullmap coordinates scaled to game coords)
let roomPolygons = [];
try {
    const roomDataPath = path.join(__dirname, '../public/assets/minimap-rooms.json');
    const roomData = JSON.parse(fs.readFileSync(roomDataPath, 'utf8'));
    // Scale fullmap polygons by 0.25 to match game coordinates
    const SCALE = 0.25;
    roomPolygons = (roomData.fullmap || []).map(room => ({
        label: room.label,
        points: room.points.map(p => ({ x: p.x * SCALE, y: p.y * SCALE }))
    }));
    console.log(`Loaded ${roomPolygons.length} room polygons for admin table`);
} catch (e) {
    console.log('Could not load room polygons:', e.message);
}

// Point-in-polygon detection (ray casting algorithm)
function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        if (((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

// Get which room a player is in based on coordinates
function getPlayerRoom(x, y) {
    for (const room of roomPolygons) {
        if (pointInPolygon({ x, y }, room.points)) {
            return room.label;
        }
    }
    return null; // Not in any room
}
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Serve static files in production
app.use(express.static(path.join(__dirname, '../dist'), { index: 'index.html' }));
app.use('/assets', express.static(path.join(__dirname, '../dist/assets')));

// Serve root explicitly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ============================================
// GAME ROOM MANAGER
// ============================================

class GameRoomManager {
    constructor() {
        this.rooms = new Map();      // code -> GameRoom
        this.playerRooms = new Map(); // socketId -> roomCode
    }

    // Generate unique 6-letter code
    generateCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code;
        do {
            code = '';
            for (let i = 0; i < 6; i++) {
                code += chars[Math.floor(Math.random() * chars.length)];
            }
        } while (this.rooms.has(code));
        return code;
    }

    createRoom(hostSocket, hostName, isPublic = true) {
        const code = this.generateCode();
        const room = new GameRoom(code, hostSocket.id, hostName, isPublic);
        this.rooms.set(code, room);
        console.log(`Room created: ${code} by ${hostName} (${isPublic ? 'public' : 'private'})`);
        return room;
    }

    getRoom(code) {
        return this.rooms.get(code?.toUpperCase());
    }

    getPublicRooms() {
        const publicRooms = [];
        for (const [code, room] of this.rooms) {
            if (room.isPublic && room.state === 'lobby' && room.players.size < room.settings.maxPlayers) {
                publicRooms.push({
                    code: room.code,
                    hostName: room.hostName,
                    playerCount: room.players.size,
                    maxPlayers: room.settings.maxPlayers,
                    map: room.settings.map
                });
            }
        }
        return publicRooms;
    }

    joinRoom(socket, code, playerName, playerColor, walletAddress) {
        const room = this.getRoom(code);
        if (!room) {
            return { error: 'Room not found' };
        }
        if (room.state !== 'lobby') {
            return { error: 'Game already in progress' };
        }
        if (room.players.size >= room.settings.maxPlayers) {
            return { error: 'Room is full' };
        }

        const player = room.addPlayer(socket, { name: playerName, color: playerColor, walletAddress });
        this.playerRooms.set(socket.id, code);
        socket.join(code);

        return { success: true, room, player };
    }

    getPlayerRoom(socketId) {
        const code = this.playerRooms.get(socketId);
        if (!code) return null;
        return this.rooms.get(code);
    }

    leaveRoom(socketId) {
        const code = this.playerRooms.get(socketId);
        if (!code) return null;

        const room = this.rooms.get(code);
        if (!room) return null;

        const wasHost = room.hostId === socketId;
        room.removePlayer(socketId);
        this.playerRooms.delete(socketId);

        // If room is empty, delete it
        if (room.players.size === 0) {
            // Clean up room occupancy interval if exists
            if (room.occupancyInterval) {
                clearInterval(room.occupancyInterval);
            }
            this.rooms.delete(code);
            console.log(`Room ${code} deleted (empty)`);
            return { roomDeleted: true, code };
        }

        // If host left, assign new host
        if (wasHost && room.players.size > 0) {
            const newHostId = room.players.keys().next().value;
            room.hostId = newHostId;
            const newHost = room.players.get(newHostId);
            room.hostName = newHost?.name || 'Unknown';
            return { newHostId, code, room };
        }

        return { code, room };
    }

    getPlayerRoom(socketId) {
        const code = this.playerRooms.get(socketId);
        return code ? this.rooms.get(code) : null;
    }
}

// ============================================
// GAME ROOM CLASS
// ============================================

class GameRoom {
    constructor(code, hostId, hostName, isPublic) {
        this.code = code;
        this.hostId = hostId;
        this.hostName = hostName;
        this.isPublic = isPublic;
        this.players = new Map();
        this.state = 'lobby'; // lobby, starting, playing, meeting, ended
        this.impostors = new Set();
        this.deadPlayers = new Set();
        this.settings = {
            maxPlayers: 10,
            numImpostors: 2,
            killCooldown: 30,
            discussionTime: 15,
            votingTime: 120,
            map: 'The Skeld'
        };
        this.createdAt = Date.now();
    }

    addPlayer(socket, data) {
        // Find an available color (0-11)
        const usedColors = new Set([...this.players.values()].map(p => p.color));
        let color = data.color;
        if (color === undefined || usedColors.has(color)) {
            for (let i = 0; i < 12; i++) {
                if (!usedColors.has(i)) {
                    color = i;
                    break;
                }
            }
        }

        const player = {
            id: socket.id,
            name: data.name || `Player ${this.players.size + 1}`,
            walletAddress: data.walletAddress || null, // Full Solana address for payouts
            color: color,
            x: 1500,
            y: 350,
            velocityX: 0,
            velocityY: 0,
            moving: false,
            facingLeft: false,
            isDead: false,
            isImpostor: false,
            isHost: socket.id === this.hostId,
            currentRoom: null, // Track which room player is in for admin table
            lastKillTime: 0 // Server-side kill cooldown tracking
        };
        this.players.set(socket.id, player);
        return player;
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        this.impostors.delete(socketId);
        this.deadPlayers.delete(socketId);
    }

    updateSettings(settings) {
        Object.assign(this.settings, settings);
    }

    startGame() {
        // Require 4 players minimum to start
        if (this.players.size < 4) {
            return { success: false, error: 'Need at least 4 players to start' };
        }

        this.state = 'starting';

        // Assign impostors
        const playerIds = [...this.players.keys()];

        // Calculate number of impostors: use settings, but cap at half the players minus 1
        // For 4 players: max 1 impostor
        // For 5-6 players: max 2 impostors
        // For 7+ players: max 3 impostors (but settings default is 2)
        const maxImpostors = Math.max(1, Math.floor((playerIds.length - 1) / 2));
        const numImpostors = Math.max(1, Math.min(this.settings.numImpostors, maxImpostors));

        // Randomly select impostors
        this.impostors.clear();

        // Reset all players to crewmate first
        for (const [id, player] of this.players) {
            player.isImpostor = false;
        }

        // Use crypto-style randomization for truly random selection
        // Fisher-Yates shuffle with better random source
        const shuffledIds = [...playerIds];
        for (let i = shuffledIds.length - 1; i > 0; i--) {
            // Use multiple random calls combined for better distribution
            const j = Math.floor((Math.random() + Math.random() * 0.0001 + Date.now() % 1000 * 0.000001) % 1 * (i + 1));
            [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
        }

        // Additional shuffle pass for extra randomness
        for (let i = 0; i < shuffledIds.length; i++) {
            const j = Math.floor(Math.random() * shuffledIds.length);
            [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
        }

        // Pick impostors from shuffled list
        for (let i = 0; i < numImpostors && i < shuffledIds.length; i++) {
            const impostorId = shuffledIds[i];
            this.impostors.add(impostorId);
            const player = this.players.get(impostorId);
            if (player) {
                player.isImpostor = true;
                console.log('Impostor assigned:', impostorId);
            }
        }

        console.log(`Impostors assigned: ${[...this.impostors].join(', ')}`);
        console.log(`Total players: ${playerIds.length}, Impostors: ${this.impostors.size}`);

        // Spawn players in cafeteria
        const spawnPoints = this.getSpawnPoints();
        let i = 0;
        for (const [id, player] of this.players) {
            const spawn = spawnPoints[i % spawnPoints.length];
            player.x = spawn.x;
            player.y = spawn.y;
            // Set initial room for admin table
            player.currentRoom = getPlayerRoom(spawn.x, spawn.y);
            i++;
        }

        this.state = 'playing';
        return { success: true };
    }

    getSpawnPoints() {
        // Cafeteria spawn points in a circle
        const center = { x: 1500, y: 350 };
        const radius = 100;
        const points = [];
        const count = Math.max(this.players.size, 1);

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            points.push({
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius
            });
        }
        return points;
    }

    killPlayer(killerId, targetId) {
        if (!this.impostors.has(killerId)) return { error: 'Not an impostor' };
        if (this.deadPlayers.has(targetId)) return { error: 'Target already dead' };
        if (this.deadPlayers.has(killerId)) return { error: 'You are dead' };

        const killer = this.players.get(killerId);
        if (!killer) return { error: 'Killer not found' };

        // Server-side cooldown check (22.5 seconds)
        const now = Date.now();
        const cooldownMs = 22500; // 22.5 seconds in milliseconds
        if (killer.lastKillTime && (now - killer.lastKillTime) < cooldownMs) {
            const remaining = ((cooldownMs - (now - killer.lastKillTime)) / 1000).toFixed(1);
            console.log(`Kill rejected - cooldown: ${remaining}s remaining`);
            return { error: 'Kill on cooldown' };
        }

        const target = this.players.get(targetId);
        if (!target) return { error: 'Target not found' };

        target.isDead = true;
        this.deadPlayers.add(targetId);
        killer.lastKillTime = now; // Set cooldown

        // Check win condition
        const winResult = this.checkWinCondition();

        return { success: true, target, winResult };
    }

    checkWinCondition() {
        const aliveCrewmates = [...this.players.values()].filter(p => !p.isDead && !p.isImpostor).length;
        const aliveImpostors = [...this.players.values()].filter(p => !p.isDead && p.isImpostor).length;

        // Build player data for victory screen
        const getVictoryData = (winner) => {
            const impostorIds = [...this.impostors];
            const allPlayers = [...this.players.values()].map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                isImpostor: p.isImpostor,
                isDead: p.isDead
            }));

            // Get wallet addresses of winners for payout
            let winnerWallets = [];
            if (winner === 'crewmates') {
                winnerWallets = [...this.players.values()]
                    .filter(p => !p.isImpostor && p.walletAddress)
                    .map(p => p.walletAddress);
            } else if (winner === 'impostors') {
                winnerWallets = [...this.players.values()]
                    .filter(p => p.isImpostor && p.walletAddress)
                    .map(p => p.walletAddress);
            }

            return { winner, impostorIds, players: allPlayers, winnerWallets };
        };

        if (aliveImpostors === 0) {
            this.state = 'ended';
            return getVictoryData('crewmates');
        }

        if (aliveImpostors >= aliveCrewmates) {
            this.state = 'ended';
            return getVictoryData('impostors');
        }

        return null;
    }

    getPlayersData() {
        return [...this.players.values()].map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            x: p.x,
            y: p.y,
            velocityX: p.velocityX,
            velocityY: p.velocityY,
            moving: p.moving,
            facingLeft: p.facingLeft,
            isHost: p.id === this.hostId,
            isDead: p.isDead
        }));
    }

    getRoomInfo() {
        return {
            code: this.code,
            hostId: this.hostId,
            hostName: this.hostName,
            isPublic: this.isPublic,
            state: this.state,
            playerCount: this.players.size,
            maxPlayers: this.settings.maxPlayers,
            settings: this.settings,
            players: this.getPlayersData()
        };
    }

    // Reset room back to lobby state (for play again)
    returnToLobby() {
        this.state = 'lobby';
        this.impostors.clear();
        this.deadPlayers.clear();

        // Reset all player states
        for (const [id, player] of this.players) {
            player.isDead = false;
            player.isImpostor = false;
            player.x = 1500;
            player.y = 350;
            player.velocityX = 0;
            player.velocityY = 0;
            player.moving = false;
            player.lastKillTime = 0;
        }

        return { success: true };
    }
}

// ============================================
// INITIALIZE MANAGER
// ============================================

const roomManager = new GameRoomManager();

// ============================================
// ADMIN TABLE - ROOM OCCUPANCY BROADCAST
// ============================================

// Broadcast room occupancy to all players in a game room
function broadcastRoomOccupancy(gameRoom) {
    if (gameRoom.state !== 'playing') return;

    // Build room occupancy data: { roomLabel: [{ id, color, name }] }
    const roomOccupancy = {};

    for (const [playerId, player] of gameRoom.players) {
        // Only include alive players (dead players don't show on admin)
        if (player.isDead) continue;

        const roomLabel = player.currentRoom;
        if (roomLabel) {
            if (!roomOccupancy[roomLabel]) {
                roomOccupancy[roomLabel] = [];
            }
            roomOccupancy[roomLabel].push({
                id: player.id,
                color: player.color,
                name: player.name
            });
        }
    }

    // Broadcast to all players in this room
    io.to(gameRoom.code).emit('room_occupancy', roomOccupancy);
}

// ============================================
// REST API ENDPOINTS
// ============================================

app.use(express.json());

// Get public lobbies
app.get('/api/lobbies', (req, res) => {
    const lobbies = roomManager.getPublicRooms();
    res.json(lobbies);
});

// Get room info by code
app.get('/api/room/:code', (req, res) => {
    const room = roomManager.getRoom(req.params.code);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    res.json(room.getRoomInfo());
});

// ============================================
// SOCKET.IO CONNECTION HANDLING
// ============================================

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Create a new game room
    socket.on('create_room', (data) => {
        const { playerName, isPublic = true, walletAddress } = data;

        // Leave any existing room first
        const existingRoom = roomManager.getPlayerRoom(socket.id);
        if (existingRoom) {
            roomManager.leaveRoom(socket.id);
            socket.leave(existingRoom.code);
        }

        const room = roomManager.createRoom(socket, playerName, isPublic);
        const result = roomManager.joinRoom(socket, room.code, playerName, 0, walletAddress);

        if (result.success) {
            socket.emit('room_created', {
                code: room.code,
                roomInfo: room.getRoomInfo()
            });
            console.log(`${playerName} created room ${room.code} (wallet: ${walletAddress ? walletAddress.slice(0,8) + '...' : 'none'})`);
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    // Join an existing room by code
    socket.on('join_room', (data) => {
        const { code, playerName, playerColor, walletAddress } = data;

        // Leave any existing room first
        const existingRoom = roomManager.getPlayerRoom(socket.id);
        if (existingRoom) {
            roomManager.leaveRoom(socket.id);
            socket.leave(existingRoom.code);
        }

        const result = roomManager.joinRoom(socket, code, playerName, playerColor, walletAddress);

        if (result.success) {
            const room = result.room;

            // Notify the joining player
            socket.emit('room_joined', {
                code: room.code,
                roomInfo: room.getRoomInfo()
            });

            // Notify others in the room
            socket.to(code).emit('player_joined', {
                player: result.player,
                roomInfo: room.getRoomInfo()
            });

            console.log(`${playerName} joined room ${code}`);
        } else {
            socket.emit('join_error', { message: result.error });
        }
    });

    // Get list of public lobbies
    socket.on('get_lobbies', () => {
        const lobbies = roomManager.getPublicRooms();
        socket.emit('lobbies_list', lobbies);
    });

    // Leave current room
    socket.on('leave_room', () => {
        const result = roomManager.leaveRoom(socket.id);
        if (result) {
            socket.leave(result.code);
            socket.emit('room_left');

            if (!result.roomDeleted) {
                // Notify others
                io.to(result.code).emit('player_left', {
                    playerId: socket.id,
                    newHostId: result.newHostId,
                    roomInfo: result.room?.getRoomInfo()
                });
            }
        }
    });

    // Return to lobby (play again) - only HOST can return everyone to lobby
    socket.on('return_to_lobby', () => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (room) {
            // Only host can return everyone to lobby
            if (socket.id !== room.hostId) {
                console.log(`Non-host ${socket.id} tried to return to lobby, ignoring`);
                socket.emit('error', { message: 'Only the host can start a new game' });
                return;
            }

            room.returnToLobby();
            // Notify all players in the room
            io.to(room.code).emit('returned_to_lobby', {
                roomInfo: room.getRoomInfo()
            });
            console.log(`Room ${room.code} returned to lobby by host`);
        }
    });

    // Update game settings (host only)
    socket.on('update_settings', (settings) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (room && room.hostId === socket.id) {
            room.updateSettings(settings);
            io.to(room.code).emit('settings_updated', room.settings);
        }
    });

    // Player movement
    socket.on('player_move', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (player) {
            player.x = data.x;
            player.y = data.y;
            player.velocityX = data.velocityX;
            player.velocityY = data.velocityY;
            player.moving = data.moving;
            player.facingLeft = data.facingLeft;

            // Update which room player is in for admin table
            const newRoom = getPlayerRoom(data.x, data.y);
            if (newRoom !== player.currentRoom) {
                player.currentRoom = newRoom;
                // Room changed - broadcast updated room occupancy
                broadcastRoomOccupancy(room);
            }

            // Broadcast to others in room
            socket.to(room.code).emit('player_update', {
                id: socket.id,
                ...data
            });
        }
    });

    // Start countdown (host only) - syncs countdown to all players
    socket.on('start_countdown', () => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room) return;

        if (room.hostId !== socket.id) {
            socket.emit('error', { message: 'Only host can start countdown' });
            return;
        }

        // Check minimum player count before starting countdown
        // TODO: Change back to 4 for production
        if (room.players.size < 1) {
            io.to(room.code).emit('countdown_error', { message: 'At least 1 player must join to start' });
            return;
        }

        // Broadcast countdown start to all players in room
        io.to(room.code).emit('countdown_started');
        console.log(`Countdown started in room ${room.code}`);
    });

    // Start game (host only)
    socket.on('start_game', () => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room) {
            socket.emit('error', { message: 'Not in a room' });
            return;
        }

        if (room.hostId !== socket.id) {
            socket.emit('error', { message: 'Only host can start' });
            return;
        }

        const result = room.startGame();
        if (result.success) {
            // Send role info to each player privately
            for (const [id, player] of room.players) {
                io.to(id).emit('game_start', {
                    isImpostor: player.isImpostor,
                    impostorIds: player.isImpostor ? [...room.impostors] : [],
                    x: player.x,
                    y: player.y,
                    players: room.getPlayersData()
                });
            }
            io.to(room.code).emit('game_state', 'playing');
            console.log(`Game started in room ${room.code}`);
            // Broadcast initial room occupancy for admin table
            setTimeout(() => broadcastRoomOccupancy(room), 100);
            // Set up periodic room occupancy broadcasts every 500ms for admin table live updates
            room.occupancyInterval = setInterval(() => {
                if (room.state === 'playing') {
                    broadcastRoomOccupancy(room);
                } else {
                    clearInterval(room.occupancyInterval);
                }
            }, 500);
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    // Kill player
    socket.on('kill', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room || room.state !== 'playing') return;

        const result = room.killPlayer(socket.id, data.targetId);
        if (result.success) {
            io.to(room.code).emit('player_killed', {
                killerId: socket.id,
                targetId: data.targetId,
                x: result.target.x,
                y: result.target.y
            });

            // Broadcast updated room occupancy (dead player removed)
            broadcastRoomOccupancy(room);

            if (result.winResult) {
                io.to(room.code).emit('game_over', result.winResult);

                // Trigger payout to winners (10,000 tokens split between winners)
                const PAYOUT_AMOUNT = 10000;
                if (result.winResult.winnerWallets && result.winResult.winnerWallets.length > 0) {
                    console.log(`Game over! ${result.winResult.winner} win. Paying out to ${result.winResult.winnerWallets.length} wallets`);
                    payoutToWinners(result.winResult.winnerWallets, PAYOUT_AMOUNT)
                        .then(payoutResult => {
                            console.log('Payout result:', payoutResult);
                        })
                        .catch(err => {
                            console.error('Payout failed:', err);
                        });
                }
            }
        }
    });

    // Report body
    socket.on('report_body', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room || room.state !== 'playing') return;

        room.state = 'meeting';
        io.to(room.code).emit('meeting_called', {
            callerId: socket.id,
            bodyId: data.targetId,
            type: 'body'
        });
        io.to(room.code).emit('game_state', 'meeting');
    });

    // Emergency meeting
    socket.on('emergency_meeting', () => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room || room.state !== 'playing') return;

        const player = room.players.get(socket.id);
        if (!player || player.isDead) return;

        room.state = 'meeting';
        io.to(room.code).emit('meeting_called', {
            callerId: socket.id,
            type: 'emergency'
        });
        io.to(room.code).emit('game_state', 'meeting');
    });

    // Vote
    socket.on('vote', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room || room.state !== 'meeting') return;

        io.to(room.code).emit('player_voted', {
            voterId: socket.id,
            targetId: data.targetId // null = skip
        });
    });

    // Task started (for visual sync - show others you're doing a task)
    socket.on('task_start', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room) return;

        // Broadcast to others that this player started a task
        socket.to(room.code).emit('player_task_start', {
            playerId: socket.id,
            taskId: data.taskId,
            taskName: data.taskName
        });
    });

    // Task completed
    socket.on('task_complete', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room) return;

        // Broadcast task completion to all in room
        io.to(room.code).emit('player_task_complete', {
            playerId: socket.id,
            taskId: data.taskId,
            taskName: data.taskName
        });
    });

    // Task cancelled/closed
    socket.on('task_cancel', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room) return;

        socket.to(room.code).emit('player_task_cancel', {
            playerId: socket.id
        });
    });

    // MedScan started scanning (player clicked panel, now in scan animation)
    socket.on('medscan_start', () => {
        console.log('Received medscan_start from', socket.id);
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room) {
            console.log('Player not in a room');
            return;
        }

        console.log('Broadcasting player_medscan_start to room', room.code);
        // Broadcast to others that this player started MedScan animation
        socket.to(room.code).emit('player_medscan_start', {
            playerId: socket.id
        });
    });

    // MedScan finished scanning
    socket.on('medscan_end', () => {
        console.log('Received medscan_end from', socket.id);
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room) {
            console.log('Player not in a room');
            return;
        }

        console.log('Broadcasting player_medscan_end to room', room.code);
        // Broadcast to others that this player finished MedScan animation
        socket.to(room.code).emit('player_medscan_end', {
            playerId: socket.id
        });
    });

    // Sabotage triggered by impostor
    socket.on('sabotage', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room || room.state !== 'playing') return;

        // Only impostors can sabotage
        if (!room.impostors.has(socket.id)) return;

        console.log(`Sabotage triggered in room ${room.code}: ${data.sabotageType}`);

        // Broadcast to all players in room
        io.to(room.code).emit('sabotage_triggered', {
            sabotageType: data.sabotageType,
            triggeredBy: socket.id
        });
    });

    // Vent enter/exit
    socket.on('vent_enter', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room || room.state !== 'playing') return;

        // Only impostors can vent
        if (!room.impostors.has(socket.id)) return;

        const player = room.players.get(socket.id);
        if (player) player.inVent = true;

        // Broadcast to other impostors (only they can see venting)
        for (const impostorId of room.impostors) {
            if (impostorId !== socket.id) {
                io.to(impostorId).emit('player_vent_enter', {
                    playerId: socket.id,
                    ventId: data.ventId
                });
            }
        }
    });

    socket.on('vent_exit', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room || room.state !== 'playing') return;

        if (!room.impostors.has(socket.id)) return;

        const player = room.players.get(socket.id);
        if (player) {
            player.inVent = false;
            player.x = data.x;
            player.y = data.y;
        }

        // Broadcast to other impostors
        for (const impostorId of room.impostors) {
            if (impostorId !== socket.id) {
                io.to(impostorId).emit('player_vent_exit', {
                    playerId: socket.id,
                    ventId: data.ventId,
                    x: data.x,
                    y: data.y
                });
            }
        }
    });

    // Sound sync - broadcast important game sounds to all players
    socket.on('play_sound', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room) return;

        // Broadcast sound to all other players in room
        socket.to(room.code).emit('play_sound', {
            sound: data.sound,
            playerId: socket.id
        });
    });

    // Chat message
    socket.on('chat', (data) => {
        const room = roomManager.getPlayerRoom(socket.id);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!player) return;

        // Only allow chat in meetings, and dead players can only chat with dead
        if (room.state === 'meeting' || room.state === 'lobby') {
            const chatData = {
                playerId: socket.id,
                playerName: player.name,
                message: data.message,
                isDead: player.isDead
            };

            if (player.isDead) {
                // Only send to dead players
                for (const [id, p] of room.players) {
                    if (p.isDead) {
                        io.to(id).emit('chat_message', chatData);
                    }
                }
            } else {
                io.to(room.code).emit('chat_message', chatData);
            }
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const result = roomManager.leaveRoom(socket.id);
        if (result && !result.roomDeleted) {
            io.to(result.code).emit('player_left', {
                playerId: socket.id,
                newHostId: result.newHostId,
                roomInfo: result.room?.getRoomInfo()
            });
        }
        console.log(`Player disconnected: ${socket.id}`);
    });
});

// ============================================
// CATCH-ALL ROUTE (serve index.html for SPA)
// ============================================

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
    console.log(`REST API: http://localhost:${PORT}/api/lobbies`);
});
