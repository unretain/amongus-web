// Network manager for multiplayer using Socket.io

export class NetworkManager {
    constructor(game) {
        this.game = game;
        this.socket = null;
        this.connected = false;
        this.playerId = null;
        this.playerName = '';
        this.currentRoomCode = null;

        // Rate limiting for position updates
        this.lastPositionSend = 0;
        this.positionSendRate = 50; // ms between updates

        // Callbacks for room events
        this.onRoomCreated = null;
        this.onRoomJoined = null;
        this.onJoinError = null;
        this.onLobbiesList = null;
        this.onRoomLeft = null;
        this.onPlayerJoinedRoom = null;
        this.onPlayerLeftRoom = null;
        this.onSettingsUpdated = null;
        this.onGameStart = null;

        this.connect();
    }

    connect() {
        // Try to connect to server
        try {
            // Dynamic import for socket.io-client
            import('socket.io-client').then(({ io }) => {
                this.socket = io('http://localhost:3001', {
                    transports: ['websocket', 'polling']
                });

                this.setupListeners();
            }).catch(e => {
                console.log('Running in offline mode (no server)');
                this.connected = false;
            });
        } catch (e) {
            console.log('Socket.io not available, running offline');
        }
    }

    setupListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            console.log('Connected to server with socket ID:', this.socket.id);
            this.connected = true;
            this.playerId = this.socket.id;
            // If we were in a room before reconnect, we've lost room membership
            if (this.currentRoomCode) {
                console.warn('Reconnected but was in room', this.currentRoomCode, '- room membership lost!');
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.connected = false;
            this.currentRoomCode = null;
        });

        // ============================================
        // ROOM EVENTS
        // ============================================

        this.socket.on('room_created', (data) => {
            console.log('Room created:', data.code);
            this.currentRoomCode = data.code;
            if (this.onRoomCreated) this.onRoomCreated(data);
        });

        this.socket.on('room_joined', (data) => {
            console.log('Joined room:', data.code);
            this.currentRoomCode = data.code;
            if (this.onRoomJoined) this.onRoomJoined(data);
        });

        this.socket.on('join_error', (data) => {
            console.log('Join error:', data.message);
            if (this.onJoinError) this.onJoinError(data);
        });

        this.socket.on('lobbies_list', (lobbies) => {
            console.log('Received lobbies:', lobbies.length);
            if (this.onLobbiesList) this.onLobbiesList(lobbies);
        });

        this.socket.on('room_left', () => {
            console.log('Left room');
            this.currentRoomCode = null;
            if (this.onRoomLeft) this.onRoomLeft();
        });

        this.socket.on('player_joined', (data) => {
            console.log('=== PLAYER_JOINED EVENT ===');
            console.log('Player joined:', data.player.id, data.player.name);
            console.log('Callback set?', !!this.onPlayerJoinedRoom);
            if (this.onPlayerJoinedRoom) {
                this.onPlayerJoinedRoom(data);
            } else {
                console.warn('onPlayerJoinedRoom callback not set!');
            }
            // Also notify game for player list updates
            this.game.onPlayerJoin(data.player);
        });

        this.socket.on('player_left', (data) => {
            console.log('Player left:', data.playerId);
            if (this.onPlayerLeftRoom) this.onPlayerLeftRoom(data);
            // Also notify game
            this.game.onPlayerLeave(data.playerId);
        });

        this.socket.on('settings_updated', (settings) => {
            console.log('Settings updated');
            if (this.onSettingsUpdated) this.onSettingsUpdated(settings);
        });

        // ============================================
        // GAME EVENTS
        // ============================================

        this.socket.on('player_join', (data) => {
            this.game.onPlayerJoin(data);
        });

        this.socket.on('player_leave', (id) => {
            this.game.onPlayerLeave(id);
        });

        this.socket.on('player_update', (data) => {
            // Update player in game lobby if active
            if (this.game.gameLobbyScreen && this.game.gameLobbyScreen.active) {
                this.game.gameLobbyScreen.updatePlayer(data);
            }
            // Also update in main game
            this.game.onPlayerUpdate(data);
        });

        this.socket.on('game_state', (state) => {
            this.game.onGameStateChange(state);
        });

        this.socket.on('players_list', (players) => {
            for (const data of players) {
                this.game.onPlayerJoin(data);
            }
        });

        this.socket.on('game_start', (data) => {
            console.log('Game starting! Impostor:', data.isImpostor);
            if (this.onGameStart) this.onGameStart(data);
            // Game start handled via callback above (this.network.onGameStart in Game.js)
        });

        this.socket.on('countdown_started', () => {
            console.log('Countdown started by server');
            if (this.onCountdownStarted) this.onCountdownStarted();
        });

        this.socket.on('countdown_error', (data) => {
            console.log('Countdown error:', data.message);
            if (this.onCountdownError) this.onCountdownError(data.message);
        });

        this.socket.on('player_killed', (data) => {
            this.game.onPlayerKilled(data);
        });

        this.socket.on('meeting_called', (data) => {
            this.game.onMeetingCalled(data);
        });

        this.socket.on('player_voted', (data) => {
            this.game.onPlayerVoted(data);
        });

        this.socket.on('game_over', (data) => {
            this.game.onGameOver(data);
        });

        // Task sync events
        this.socket.on('player_task_start', (data) => {
            this.game.onPlayerTaskStart(data);
        });

        this.socket.on('player_task_complete', (data) => {
            this.game.onPlayerTaskComplete(data);
        });

        this.socket.on('player_task_cancel', (data) => {
            this.game.onPlayerTaskCancel(data);
        });

        // MedScan specific - when another player starts scanning
        this.socket.on('player_medscan_start', (data) => {
            console.log('Received player_medscan_start event:', data);
            this.game.onPlayerMedScanStart(data);
        });

        // MedScan specific - when another player finishes scanning
        this.socket.on('player_medscan_end', (data) => {
            console.log('Received player_medscan_end event:', data);
            this.game.onPlayerMedScanEnd(data);
        });

        // Sabotage sync
        this.socket.on('sabotage_triggered', (data) => {
            console.log('Sabotage triggered:', data.sabotageType);
            this.game.onSabotageTriggered(data);
        });

        // Vent sync (only received by other impostors)
        this.socket.on('player_vent_enter', (data) => {
            console.log('Player entered vent:', data.playerId);
            this.game.onPlayerVentEnter(data);
        });

        this.socket.on('player_vent_exit', (data) => {
            console.log('Player exited vent:', data.playerId);
            this.game.onPlayerVentExit(data);
        });

        // Sound sync
        this.socket.on('play_sound', (data) => {
            this.game.onPlaySound(data);
        });

        // Chat message received
        this.socket.on('chat_message', (data) => {
            console.log('Chat message received:', data);
            this.game.onChatMessage(data);
        });

        // Admin table - room occupancy updates
        this.socket.on('room_occupancy', (data) => {
            this.game.onRoomOccupancy(data);
        });

        this.socket.on('error', (data) => {
            console.error('Server error:', data.message);
        });
    }

    // ============================================
    // ROOM MANAGEMENT
    // ============================================

    createRoom(playerName, isPublic = true) {
        if (!this.connected || !this.socket) {
            console.log('Not connected to server');
            return false;
        }
        this.playerName = playerName;
        this.socket.emit('create_room', { playerName, isPublic });
        return true;
    }

    joinRoom(code, playerName, playerColor) {
        if (!this.connected || !this.socket) {
            console.log('Not connected to server');
            return false;
        }
        this.playerName = playerName;
        this.socket.emit('join_room', { code, playerName, playerColor });
        return true;
    }

    leaveRoom() {
        if (!this.connected || !this.socket) return;
        this.socket.emit('leave_room');
        this.currentRoomCode = null;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connected = false;
            this.currentRoomCode = null;
        }
    }

    getLobbies() {
        if (!this.connected || !this.socket) return;
        this.socket.emit('get_lobbies');
    }

    updateSettings(settings) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('update_settings', settings);
    }

    // ============================================
    // GAME ACTIONS
    // ============================================

    sendPosition(player) {
        if (!this.connected || !this.socket) return;

        const now = Date.now();
        if (now - this.lastPositionSend < this.positionSendRate) return;
        this.lastPositionSend = now;

        this.socket.emit('player_move', player.serialize());
    }

    sendAction(action, data = {}) {
        if (!this.connected || !this.socket) return;
        this.socket.emit(action, data);
    }

    startCountdown() {
        if (!this.connected || !this.socket) return;
        this.socket.emit('start_countdown');
    }

    startGame() {
        if (!this.connected || !this.socket) return;
        this.socket.emit('start_game');
    }

    reportBody(targetId) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('report_body', { targetId });
    }

    killPlayer(targetId) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('kill', { targetId });
    }

    vote(targetId) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('vote', { targetId });
    }

    emergencyMeeting() {
        if (!this.connected || !this.socket) return;
        this.socket.emit('emergency_meeting');
    }

    // Task sync methods
    sendTaskStart(taskId, taskName) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('task_start', { taskId, taskName });
    }

    sendTaskComplete(taskId, taskName) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('task_complete', { taskId, taskName });
    }

    sendTaskCancel() {
        if (!this.connected || !this.socket) return;
        this.socket.emit('task_cancel', {});
    }

    // MedScan specific - send when scanning phase begins (after clicking panel)
    sendMedScanStart() {
        if (!this.connected || !this.socket) return;
        this.socket.emit('medscan_start', {});
    }

    // MedScan specific - send when scanning phase completes
    sendMedScanEnd() {
        if (!this.connected || !this.socket) return;
        this.socket.emit('medscan_end', {});
    }

    // Sabotage sync
    sendSabotage(sabotageType) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('sabotage', { sabotageType });
    }

    // Vent sync
    sendVentEnter(ventId) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('vent_enter', { ventId });
    }

    sendVentExit(ventId, x, y) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('vent_exit', { ventId, x, y });
    }

    // Sound sync - broadcast important sounds to all players
    sendPlaySound(sound) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('play_sound', { sound });
    }

    sendChat(message) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('chat', { message });
    }

    // ============================================
    // LEGACY SUPPORT (for backward compatibility)
    // ============================================

    joinGame(name, color) {
        // Legacy method - now use joinRoom instead
        console.warn('joinGame is deprecated, use joinRoom instead');
    }
}
