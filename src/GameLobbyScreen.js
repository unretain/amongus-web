// Game Lobby Screen - shown after hosting/joining a game, before game starts
// Players wait here and can customize settings before starting

import { Player } from './Player.js';

export class GameLobbyScreen {
    constructor(network = null) {
        this.active = false;
        this.network = network;

        // Lobby map dimensions (1923x1232)
        this.mapWidth = 1923;
        this.mapHeight = 1232;

        // Scale factor for the lobby map
        this.mapScale = 1.3;

        // Camera for scrolling around lobby
        this.camera = { x: 0, y: 0 };

        // Animated lobby frames
        this.lobbyFrames = [];
        this.currentFrame = 0;
        this.frameTimer = 0;
        this.frameDelay = 0.15; // seconds between frames
        this.framesLoaded = false;

        // Local player in lobby - spawn in center of the room (in scaled coordinates)
        this.localPlayer = null;
        // Map is 1923x1232, center is 961.5, 616
        this.playerSpawnX = (this.mapWidth / 2) * this.mapScale; // Center X (scaled)
        this.playerSpawnY = (this.mapHeight / 2) * this.mapScale; // Center Y (scaled)

        // List of players in lobby
        this.players = new Map();

        // Lobby settings
        this.settings = {
            maxPlayers: 10,
            impostors: 1,
            confirmEjects: true,
            emergencyMeetings: 1,
            emergencyCooldown: 15,
            discussionTime: 15,
            votingTime: 120,
            playerSpeed: 1.0,
            crewmateVision: 1.0,
            impostorVision: 1.5,
            killCooldown: 45,
            killDistance: 1, // 0=short, 1=normal, 2=long
            visualTasks: true,
            commonTasks: 1,
            longTasks: 1,
            shortTasks: 2
        };

        // Game code for this lobby
        this.gameCode = this.generateGameCode();

        // Is this player the host?
        this.isHost = false;

        // UI button hitboxes
        this.startButton = null;
        this.settingsButton = null;
        this.leaveButton = null;

        // Input state for player movement
        this.input = {
            up: false,
            down: false,
            left: false,
            right: false
        };

        // Player colors available
        this.availableColors = [...Array(Player.COLORS.length).keys()];

        // Start countdown state
        this.startCountdown = 0; // Countdown timer in seconds (0 = not counting)
        this.startCountdownMax = 5; // 5 seconds to start
        this.countdownSound = null;
        this.loadCountdownSound();

        // Error message state
        this.errorMessage = '';
        this.errorMessageTimer = 0;

        // Spawn points (10 positions in the lobby)
        this.spawnPoints = [
            { id: 1, x: 581, y: 373 },
            { id: 2, x: 611, y: 364 },
            { id: 3, x: 642, y: 350 },
            { id: 4, x: 673, y: 336 },
            { id: 5, x: 703, y: 323 },
            { id: 6, x: 943, y: 320 },
            { id: 7, x: 974, y: 334 },
            { id: 8, x: 1004, y: 342 },
            { id: 9, x: 1032, y: 356 },
            { id: 10, x: 1064, y: 366 }
        ];

        // Collision boxes (walls/obstacles players can't walk through)
        this.collisionBoxes = [
            { x: 728, y: 163, w: 189, h: 170 },   // Center platform
            { x: 493, y: 202, w: 49, h: 510 },    // Left wall
            { x: 1098, y: 183, w: 54, h: 588 },   // Right wall
            { x: 533, y: 675, w: 41, h: 170 },    // Bottom left
            { x: 551, y: 809, w: 532, h: 43 },    // Bottom wall
            { x: 1088, y: 670, w: 15, h: 156 },   // Bottom right
            { x: 929, y: 140, w: 113, h: 18 },    // Top platform pieces
            { x: 924, y: 153, w: 142, h: 14 },
            { x: 920, y: 194, w: 156, h: 12 },
            { x: 1009, y: 221, w: 100, h: 98 },
            { x: 908, y: 191, w: 105, h: 100 },
            { x: 534, y: 147, w: 175, h: 144 },
            { x: 519, y: 234, w: 92, h: 96 }
        ];
    }

    loadCountdownSound() {
        this.countdownSound = new Audio('/assets/sounds/lobby_timerstart.ogg');
        this.countdownSound.volume = 0.7;
    }

    generateGameCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // Start the countdown timer
    beginStartCountdown() {
        if (this.startCountdown > 0) return; // Already counting
        this.startCountdown = this.startCountdownMax;
        if (this.countdownSound) {
            this.countdownSound.currentTime = 0;
            this.countdownSound.play().catch(e => console.log('Audio play failed:', e));
        }
        console.log('Start countdown begun: 5 seconds');
    }

    // Cancel the countdown (when new player joins)
    cancelStartCountdown() {
        if (this.startCountdown > 0) {
            this.startCountdown = 0;
            if (this.countdownSound) {
                this.countdownSound.pause();
                this.countdownSound.currentTime = 0;
            }
            console.log('Start countdown cancelled - new player joined');
        }
    }

    // Show error message (visible to all players)
    showError(message) {
        this.errorMessage = message;
        this.errorMessageTimer = 3; // Show for 3 seconds
    }

    async loadLobbyFrames() {
        if (this.framesLoaded) return;

        const frameCount = 6;
        const loadPromises = [];

        for (let i = 1; i <= frameCount; i++) {
            const img = new Image();
            const promise = new Promise((resolve, reject) => {
                img.onload = () => resolve(img);
                img.onerror = () => {
                    console.warn(`Failed to load lobby frame ${i}`);
                    resolve(null);
                };
            });
            img.src = `/assets/lobby/lobby-frame-${i}.png`;
            loadPromises.push(promise);
        }

        const frames = await Promise.all(loadPromises);
        this.lobbyFrames = frames.filter(f => f !== null);
        this.framesLoaded = this.lobbyFrames.length > 0;

        // Update map dimensions from first frame
        if (this.lobbyFrames.length > 0) {
            this.mapWidth = this.lobbyFrames[0].width;
            this.mapHeight = this.lobbyFrames[0].height;
        }

        console.log(`Loaded ${this.lobbyFrames.length} lobby frames`);
    }

    // Get a random available color that no other player is using
    getUniqueRandomColor() {
        // Get colors already in use
        const usedColors = new Set();
        for (const player of this.players.values()) {
            usedColors.add(player.color);
        }

        // Filter available colors
        const available = this.availableColors.filter(c => !usedColors.has(c));

        // If somehow all colors are taken, just return a random one
        if (available.length === 0) {
            return Math.floor(Math.random() * Player.COLORS.length);
        }

        // Return a random available color
        return available[Math.floor(Math.random() * available.length)];
    }

    // Get a random available spawn point
    getRandomSpawnPoint() {
        // Get spawn points already occupied
        const usedSpawns = new Set();
        for (const player of this.players.values()) {
            usedSpawns.add(player.spawnPointId);
        }

        // Filter available spawn points
        const available = this.spawnPoints.filter(sp => !usedSpawns.has(sp.id));

        // If all spawn points taken, use a random one
        if (available.length === 0) {
            return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
        }

        return available[Math.floor(Math.random() * available.length)];
    }

    // Check if a position collides with any collision box
    checkCollision(x, y, radius = 15) {
        for (const box of this.collisionBoxes) {
            // Scale collision box coordinates to match map scale
            const scaledBox = {
                x: box.x * this.mapScale,
                y: box.y * this.mapScale,
                w: box.w * this.mapScale,
                h: box.h * this.mapScale
            };

            // Check circle vs rectangle collision
            const closestX = Math.max(scaledBox.x, Math.min(x, scaledBox.x + scaledBox.w));
            const closestY = Math.max(scaledBox.y, Math.min(y, scaledBox.y + scaledBox.h));

            const distX = x - closestX;
            const distY = y - closestY;
            const distSq = distX * distX + distY * distY;

            if (distSq < radius * radius) {
                return true; // Collision detected
            }
        }
        return false;
    }

    show(isHost = false, roomCode = null, initialPlayers = []) {
        this.active = true;
        this.isHost = isHost;
        this.gameCode = roomCode || this.generateGameCode();

        // Reset countdown state
        this.startCountdown = 0;
        this.countdownComplete = false;

        // Load animated lobby frames
        this.loadLobbyFrames();

        // Clear existing players
        this.players.clear();
        this.localPlayer = null;

        console.log('GameLobbyScreen.show() called with', initialPlayers.length, 'initial players:', initialPlayers);

        // Add initial players from network (or create local player if offline)
        if (initialPlayers && initialPlayers.length > 0) {
            for (const playerData of initialPlayers) {
                console.log('Adding initial player:', playerData.id, 'isLocal:', playerData.isLocal);
                this.addPlayer(playerData);
            }
        } else {
            // Offline mode - create local player
            const playerColor = this.getUniqueRandomColor();
            const spawnPoint = this.getRandomSpawnPoint();

            this.localPlayer = new Player(
                'local',
                spawnPoint.x * this.mapScale,
                spawnPoint.y * this.mapScale,
                playerColor,
                true
            );
            this.localPlayer.isLocalPlayer = true;
            this.localPlayer.name = 'Player';
            this.localPlayer.spawnPointId = spawnPoint.id;
            this.localPlayer.startSpawnAnimation();
            this.players.set('local', this.localPlayer);
        }

        // Add keyboard listener
        this.keyDownHandler = (e) => this.handleKeyDown(e);
        this.keyUpHandler = (e) => this.handleKeyUp(e);
        window.addEventListener('keydown', this.keyDownHandler);
        window.addEventListener('keyup', this.keyUpHandler);
    }

    addPlayer(playerData) {
        // Add a new player to the lobby (called when player joins via network)
        // Skip if player already exists
        if (this.players.has(playerData.id)) {
            console.log(`Player ${playerData.id} already exists, skipping`);
            return;
        }

        // Cancel start countdown if a new player joins (not the initial local player setup)
        if (this.players.size > 0) {
            this.cancelStartCountdown();
        }

        const isLocal = playerData.id === 'local' || playerData.isLocal;
        const color = playerData.color !== undefined ? playerData.color : this.getUniqueRandomColor();

        // For local player, use random spawn point
        // For remote players, use their position from network data (or spawn point as fallback)
        let startX, startY;
        if (isLocal) {
            const spawnPoint = this.getRandomSpawnPoint();
            startX = spawnPoint.x * this.mapScale;
            startY = spawnPoint.y * this.mapScale;
        } else {
            // Use position from network if available, otherwise use a default spawn
            // Remote player positions will be updated via updatePlayer()
            const spawnPoint = this.getRandomSpawnPoint();
            startX = playerData.x !== undefined ? playerData.x : spawnPoint.x * this.mapScale;
            startY = playerData.y !== undefined ? playerData.y : spawnPoint.y * this.mapScale;
        }

        const player = new Player(
            playerData.id,
            startX,
            startY,
            color,
            isLocal
        );
        player.isLocalPlayer = isLocal;
        player.name = playerData.name || 'Player';
        player.startSpawnAnimation();

        this.players.set(playerData.id, player);
        console.log('Players map keys after set:', [...this.players.keys()]);

        if (isLocal) {
            this.localPlayer = player;
            console.log('Set as local player');
        }

        console.log(`Added player ${player.name} (${playerData.id}) to lobby at (${startX}, ${startY}), total: ${this.players.size}`);
    }

    removePlayer(playerId) {
        // Remove a player from the lobby (called when player leaves via network)
        if (this.players.has(playerId)) {
            const player = this.players.get(playerId);
            console.log(`Removed player ${player.name} (${playerId}) from lobby`);
            this.players.delete(playerId);
        }
    }

    updateSettings(settings) {
        // Update lobby settings from host
        this.settings = { ...this.settings, ...settings };
        console.log('Lobby settings updated:', this.settings);
    }

    hide() {
        this.active = false;
        this.players.clear();
        this.localPlayer = null;
        this.currentFrame = 0;
        this.frameTimer = 0;

        // Remove keyboard listeners
        if (this.keyDownHandler) {
            window.removeEventListener('keydown', this.keyDownHandler);
            this.keyDownHandler = null;
        }
        if (this.keyUpHandler) {
            window.removeEventListener('keyup', this.keyUpHandler);
            this.keyUpHandler = null;
        }
    }

    handleKeyDown(e) {
        if (!this.active) return;

        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.input.up = true;
                e.preventDefault();
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.input.down = true;
                e.preventDefault();
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.input.left = true;
                e.preventDefault();
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.input.right = true;
                e.preventDefault();
                break;
        }
    }

    handleKeyUp(e) {
        if (!this.active) return;

        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.input.up = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.input.down = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.input.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.input.right = false;
                break;
        }
    }

    update(dt, screenW, screenH) {
        if (!this.active) return;

        // Update start countdown
        if (this.startCountdown > 0) {
            this.startCountdown -= dt;
            if (this.startCountdown <= 0) {
                this.startCountdown = 0;
                // Countdown complete - return signal to start game
                this.countdownComplete = true;
            }
        }

        // Update error message timer
        if (this.errorMessageTimer > 0) {
            this.errorMessageTimer -= dt;
            if (this.errorMessageTimer <= 0) {
                this.errorMessageTimer = 0;
                this.errorMessage = '';
            }
        }

        // Update lobby animation
        if (this.lobbyFrames.length > 1) {
            this.frameTimer += dt;
            if (this.frameTimer >= this.frameDelay) {
                this.frameTimer = 0;
                this.currentFrame = (this.currentFrame + 1) % this.lobbyFrames.length;
            }
        }

        // Update all players (spawn animations only - walk animations handled below)
        for (const player of this.players.values()) {
            // Only update spawn animation, not movement
            if (player.isSpawning) {
                player.updateSpawnAnimation(dt);
            }
        }

        // Update local player movement with collision detection
        if (this.localPlayer && !this.localPlayer.isSpawning) {
            let dx = 0;
            let dy = 0;

            if (this.input.up) dy -= 1;
            if (this.input.down) dy += 1;
            if (this.input.left) dx -= 1;
            if (this.input.right) dx += 1;

            // Normalize diagonal movement
            if (dx !== 0 && dy !== 0) {
                const len = Math.sqrt(dx * dx + dy * dy);
                dx /= len;
                dy /= len;
            }

            const speed = 200; // pixels per second
            const newX = this.localPlayer.x + dx * speed * dt;
            const newY = this.localPlayer.y + dy * speed * dt;

            // Check collision before moving
            const playerRadius = 20; // Collision radius for player

            // Try to move in X direction
            if (!this.checkCollision(newX, this.localPlayer.y, playerRadius)) {
                this.localPlayer.x = newX;
            }

            // Try to move in Y direction
            if (!this.checkCollision(this.localPlayer.x, newY, playerRadius)) {
                this.localPlayer.y = newY;
            }

            // Update animation state and walk animation
            const isMoving = dx !== 0 || dy !== 0;
            this.localPlayer.moving = isMoving;
            if (dx !== 0) {
                this.localPlayer.facingLeft = dx < 0;
            }

            // Update walk animation timer
            if (isMoving) {
                this.localPlayer.animationTimer += dt;
                if (this.localPlayer.animationTimer >= this.localPlayer.animationSpeed) {
                    this.localPlayer.animationTimer = 0;
                    this.localPlayer.animationFrame = (this.localPlayer.animationFrame + 1) % 4; // 4 walk frames
                }
            } else {
                this.localPlayer.animationFrame = 0;
                this.localPlayer.animationTimer = 0;
            }

            // Keep player within bounds
            const margin = 30;
            this.localPlayer.x = Math.max(margin, Math.min(this.mapWidth * this.mapScale - margin, this.localPlayer.x));
            this.localPlayer.y = Math.max(margin, Math.min(this.mapHeight * this.mapScale - margin, this.localPlayer.y));

            // Send position update to server
            if (this.network) {
                this.network.sendPosition(this.localPlayer);
            }

            // Update camera to follow player
            const targetCamX = this.localPlayer.x - screenW / 2;
            const targetCamY = this.localPlayer.y - screenH / 2;

            // Clamp camera to map bounds
            const maxCamX = Math.max(0, this.mapWidth * this.mapScale - screenW);
            const maxCamY = Math.max(0, this.mapHeight * this.mapScale - screenH);

            this.camera.x = Math.max(0, Math.min(maxCamX, targetCamX));
            this.camera.y = Math.max(0, Math.min(maxCamY, targetCamY));
        }
    }

    // Update remote player from network data
    updatePlayer(data) {
        const player = this.players.get(data.id);
        if (player && !player.isLocalPlayer) {
            player.x = data.x;
            player.y = data.y;
            player.moving = data.moving;
            player.facingLeft = data.facingLeft;

            // Update walk animation for remote players
            if (data.moving) {
                player.animationTimer += 0.016; // Approximate dt
                if (player.animationTimer >= player.animationSpeed) {
                    player.animationTimer = 0;
                    player.animationFrame = (player.animationFrame + 1) % 4;
                }
            } else {
                player.animationFrame = 0;
                player.animationTimer = 0;
            }
        }
    }

    render(ctx, assetLoader, screenW, screenH) {
        if (!this.active) return;

        // Draw stars background
        const starsBg = assetLoader?.getTexture('stars_bg');
        if (starsBg) {
            for (let x = 0; x < screenW; x += starsBg.width) {
                for (let y = 0; y < screenH; y += starsBg.height) {
                    ctx.drawImage(starsBg, x, y);
                }
            }
        } else {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, screenW, screenH);
        }

        // Draw animated lobby map (fixed in center)
        if (this.lobbyFrames.length > 0) {
            const currentImg = this.lobbyFrames[this.currentFrame];
            const drawW = currentImg.width * this.mapScale;
            const drawH = currentImg.height * this.mapScale;

            // Center the map on screen (fixed position, no camera movement)
            // Use Math.floor to avoid subpixel rendering issues
            const offsetX = Math.floor((screenW - drawW) / 2) + 150; // Shifted right
            const offsetY = Math.floor((screenH - drawH) / 2);

            ctx.drawImage(
                currentImg,
                offsetX, offsetY,
                drawW, drawH
            );

            // Store offset for player positioning
            this.mapOffsetX = offsetX;
            this.mapOffsetY = offsetY;
        } else {
            // Fallback to static lobby map or placeholder
            const lobbyMap = assetLoader?.getTexture('lobby_map');
            if (lobbyMap) {
                if (this.mapWidth === 0) {
                    this.mapWidth = lobbyMap.width;
                    this.mapHeight = lobbyMap.height;
                }

                const drawW = lobbyMap.width * this.mapScale;
                const drawH = lobbyMap.height * this.mapScale;

                ctx.drawImage(
                    lobbyMap,
                    -this.camera.x, -this.camera.y,
                    drawW, drawH
                );
            } else {
                // Fallback - draw a simple colored background
                ctx.fillStyle = '#2a2a4a';
                ctx.fillRect(0, 0, screenW, screenH);

                // Placeholder text
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Loading Lobby...', screenW / 2, screenH / 2);
            }
        }

        // Draw all players
        for (const player of this.players.values()) {
            this.renderPlayer(ctx, assetLoader, player);
        }
    }

    renderPlayer(ctx, assetLoader, player) {
        // Use smaller player scale for lobby
        // Map is fixed in center, so camera is just the negative offset
        const adjustedCamera = {
            x: -(this.mapOffsetX || 0),
            y: -(this.mapOffsetY || 0)
        };
        player.render(ctx, assetLoader, adjustedCamera, 0.45);
    }

    // Draw a 9-slice scaled sprite from a square source
    // source: { x, y, w, h } - source rect in sprite sheet
    // dest: { x, y, w, h } - destination rect on canvas
    // cornerSize: size of corners to preserve (in source pixels)
    draw9Slice(ctx, texture, source, dest, cornerSize) {
        if (!texture) return;

        const sx = source.x;
        const sy = source.y;
        const sw = source.w;
        const sh = source.h;
        const dx = dest.x;
        const dy = dest.y;
        const dw = dest.w;
        const dh = dest.h;
        const cs = cornerSize; // corner size in source

        // Scale corner size for destination based on smaller dimension
        const scale = Math.min(dw / sw, dh / sh, 1);
        const dc = Math.floor(cs * scale); // corner size in dest

        // Ensure corners don't overlap
        const maxCorner = Math.min(dw / 2, dh / 2);
        const dcClamped = Math.min(dc, maxCorner);

        // Top-left corner
        ctx.drawImage(texture, sx, sy, cs, cs, dx, dy, dcClamped, dcClamped);
        // Top-right corner
        ctx.drawImage(texture, sx + sw - cs, sy, cs, cs, dx + dw - dcClamped, dy, dcClamped, dcClamped);
        // Bottom-left corner
        ctx.drawImage(texture, sx, sy + sh - cs, cs, cs, dx, dy + dh - dcClamped, dcClamped, dcClamped);
        // Bottom-right corner
        ctx.drawImage(texture, sx + sw - cs, sy + sh - cs, cs, cs, dx + dw - dcClamped, dy + dh - dcClamped, dcClamped, dcClamped);

        // Top edge
        ctx.drawImage(texture, sx + cs, sy, sw - cs * 2, cs, dx + dcClamped, dy, dw - dcClamped * 2, dcClamped);
        // Bottom edge
        ctx.drawImage(texture, sx + cs, sy + sh - cs, sw - cs * 2, cs, dx + dcClamped, dy + dh - dcClamped, dw - dcClamped * 2, dcClamped);
        // Left edge
        ctx.drawImage(texture, sx, sy + cs, cs, sh - cs * 2, dx, dy + dcClamped, dcClamped, dh - dcClamped * 2);
        // Right edge
        ctx.drawImage(texture, sx + sw - cs, sy + cs, cs, sh - cs * 2, dx + dw - dcClamped, dy + dcClamped, dcClamped, dh - dcClamped * 2);

        // Center
        ctx.drawImage(texture, sx + cs, sy + cs, sw - cs * 2, sh - cs * 2, dx + dcClamped, dy + dcClamped, dw - dcClamped * 2, dh - dcClamped * 2);
    }

    renderUI(ctx, assetLoader, screenW, screenH) {
        const guiButtons = assetLoader?.getTexture('gui_buttons');
        const mainMenuUI = assetLoader?.getTexture('main_menu_ui');

        // TEXT BACKERS (from buttons sheet):
        // backer_1: (1262, 110) 108x110
        // backer_2: (303, 120) 56x56

        // sprite_5 (globe) from mainmenu sheet: source (1611,227) 72x69, placed at (565+150, 729)
        const sprite5X = 565 + 150;
        const sprite5Y = 729;
        const sprite5SrcX = 1611;
        const sprite5SrcY = 227;
        const sprite5SrcW = 72;
        const sprite5SrcH = 69;

        if (mainMenuUI) {
            ctx.drawImage(
                mainMenuUI,
                sprite5SrcX, sprite5SrcY, sprite5SrcW, sprite5SrcH,
                sprite5X, sprite5Y, sprite5SrcW, sprite5SrcH
            );
        }

        // Draw backer_2 (9-sliced wider) next to globe for player count
        const backer2W = 100; // Wider backer
        const backer2H = 50;
        const backer2X = sprite5X + sprite5SrcW + 10; // right of globe
        const backer2Y = sprite5Y + (sprite5SrcH - backer2H) / 2; // vertically centered with globe
        if (guiButtons) {
            this.draw9Slice(ctx, guiButtons,
                { x: 303, y: 120, w: 56, h: 56 },  // backer_2 source
                { x: backer2X, y: backer2Y, w: backer2W, h: backer2H },
                15
            );
        }

        // Player count text "/10" inside backer_2
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '22px "Varela Round", Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.players.size}/10`, backer2X + backer2W / 2, backer2Y + backer2H / 2 + 8);

        // Official START sprite (laptop) - show for everyone, greyed out for non-hosts or during countdown
        if (guiButtons) {
            const startSpriteW = 192;
            const startSpriteH = 113;
            // Original position: center of lobby room (where laptop was)
            const laptopX = (screenW - startSpriteW) / 2;
            const laptopY = (screenH - startSpriteH) / 2 + 190;

            // Grey out if not host OR during countdown
            const isCountingDown = this.startCountdown > 0;
            if (!this.isHost || isCountingDown) {
                ctx.globalAlpha = 0.4;
            }

            // Draw the official START sprite from buttons sheet at (1057, 1)
            ctx.drawImage(
                guiButtons,
                1057, 1, startSpriteW, startSpriteH,
                laptopX, laptopY, startSpriteW, startSpriteH
            );

            // Reset alpha
            ctx.globalAlpha = 1.0;

            // Draw countdown number on top of start button if counting down
            if (isCountingDown) {
                const countdownNum = Math.ceil(this.startCountdown);
                ctx.fillStyle = '#FFFFFF';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 4;
                ctx.font = 'bold 48px Arial';
                ctx.textAlign = 'center';
                ctx.strokeText(countdownNum.toString(), laptopX + startSpriteW / 2, laptopY + startSpriteH / 2 + 70);
                ctx.fillText(countdownNum.toString(), laptopX + startSpriteW / 2, laptopY + startSpriteH / 2 + 70);
            }

            // Draw error message below start button (visible to all players)
            if (this.errorMessage && this.errorMessageTimer > 0) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '20px "Varela Round", Arial';
                ctx.textAlign = 'center';
                ctx.fillText(this.errorMessage, laptopX + startSpriteW / 2, laptopY + startSpriteH + 30);
            }

            // Only make clickable for host when NOT counting down
            if (this.isHost && !isCountingDown) {
                this.startButton = { x: laptopX, y: laptopY, w: startSpriteW, h: startSpriteH };
            } else {
                this.startButton = null;
            }
        } else {
            this.startButton = null;
        }

        // Clear leave button for now
        this.leaveButton = null;
    }

    handleClick(x, y) {
        if (!this.active) return null;

        // Check leave button
        if (this.leaveButton && this.isInBounds(x, y, this.leaveButton)) {
            return 'leave';
        }

        // Check start button (host only)
        if (this.isHost && this.startButton && this.isInBounds(x, y, this.startButton)) {
            if (!this.startButton.disabled) {
                return 'start';
            }
            return null; // Not enough players
        }

        // Check customize button
        if (this.settingsButton && this.isInBounds(x, y, this.settingsButton)) {
            return 'customize';
        }

        return null;
    }

    isInBounds(x, y, bounds) {
        return x >= bounds.x && x <= bounds.x + bounds.w &&
               y >= bounds.y && y <= bounds.y + bounds.h;
    }
}
