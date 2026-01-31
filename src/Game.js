// Main Game class - handles game loop, rendering, and state

import { Player } from './Player.js';
import { GameMap } from './Map.js';
import { assetLoader } from './AssetLoader.js';
import { NetworkManager } from './Network.js';
import { WiresTask, DivertPowerTask, ReceivePowerTask, MedScanTask, StabilizeSteeringTask, DownloadDataTask, UploadDataTask, ClearAsteroidsTask, ReactorMeltdownTask, EnterCodeTask, SwipeCardTask, UnlockManifoldsTask, SimonSaysTask, ShieldsTask, EngineAlignTask } from './Task.js';
import { MainMenu } from './MainMenu.js';
import { OnlineScreen } from './OnlineScreen.js';
import { LobbyScreen } from './LobbyScreen.js';
import { GameLobbyScreen } from './GameLobbyScreen.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Game dimensions - fill the entire window
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        canvas.width = this.width;
        canvas.height = this.height;

        // Handle window resize
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            canvas.width = this.width;
            canvas.height = this.height;
        });

        // Game state
        this.state = 'menu'; // menu, lobby, playing, meeting, ended
        this.players = new Map();
        this.localPlayer = null;
        this.map = new GameMap('skeld');

        // Main menu
        this.mainMenu = new MainMenu();

        // Online screen (HOST/PUBLIC/PRIVATE)
        this.onlineScreen = new OnlineScreen();

        // Lobby browser screen (after clicking PUBLIC)
        this.lobbyScreen = new LobbyScreen();

        // Game lobby screen (after hosting/joining a game)
        this.gameLobbyScreen = new GameLobbyScreen();

        // Camera follows local player
        this.camera = { x: 0, y: 0 };
        this.cameraZoom = 2.0; // Zoom in 2x for closer view

        // Role reveal state (shows "Crewmate" or "Impostor" at game start)
        this.roleRevealActive = false;
        this.roleRevealTimer = 0;
        this.roleRevealDuration = 3.0; // Show for 3 seconds

        // Emergency meeting state
        this.meetingActive = false;
        this.meetingPhase = 'none'; // none, intro, voting, results, ejection
        this.meetingTimer = 0;
        this.introDuration = 2.0; // Show "DISCUSS!" for 2 seconds
        this.votingDuration = 30.0; // 30 seconds to vote
        this.voteResultsDuration = 2.0; // Show vote results for 2 seconds
        this.ejectionDuration = 5.0; // Ejection screen duration (typing + 2 seconds)
        // Emergency button location in cafeteria (scaled coordinates)
        this.emergencyButtonPos = { x: Math.round(4900 * 0.25), y: Math.round(1100 * 0.25) };
        this.emergencyButtonRadius = 50;

        // Vote tracking - who voted for whom
        this.voteMap = new Map(); // voterId -> targetId (null = skip)
        this.ejectedPlayer = null; // Player being ejected
        this.ejectionText = ''; // Full text to display
        this.ejectionTypedChars = 0; // Characters typed so far
        this.ejectionTypingSpeed = 0.05; // Seconds per character
        this.ejectionTypingTimer = 0;
        this.ejectionPlayerX = 0; // Floating player X position
        this.ejectionPlayerY = 0; // Floating player Y position
        this.ejectionPlayerVelX = 0; // Floating velocity
        this.ejectionPlayerVelY = 0;
        this.ejectionSound = null;
        this.loadEjectionSound();
        this.wasTie = false; // Track if vote was a tie

        // Chat state
        this.chatOpen = false;
        this.chatMessages = [];
        this.chatInput = '';

        // Admin table minimap state
        this.adminMapOpen = false;
        this.roomOccupancy = {}; // { roomLabel: [{ id, color, name }] }
        this.minimapRooms = []; // Loaded from minimap-rooms.json
        this.minimapImage = null;
        // Admin table location in Admin room
        this.adminTablePos = { x: 1384, y: 703 };
        this.adminTableRadius = 60; // Interaction radius
        this.loadMinimapData();

        // Vote buttons (populated during render)
        this.voteButtons = [];
        this.skipVoteButton = null;
        this.chatIconButton = null;

        // Task system
        this.tasks = [];
        this.sabotages = []; // Separate from tasks - don't count toward task bar
        this.activeTask = null;
        this.sabotageMenuOpen = false; // Imposter sabotage map overlay
        this.sabotageCooldown = 0; // Cooldown timer in seconds (30 sec max)
        this.sabotageCooldownMax = 30; // 30 seconds cooldown

        // Kill cooldown state (imposter)
        this.killCooldown = 0; // Cooldown timer in seconds
        this.killCooldownMax = 22.5; // 22.5 seconds cooldown
        this.killRange = 100; // 1 meter = 100 pixels (approximately)

        // Vent cooldown state (imposter)
        this.ventCooldown = 0; // Cooldown timer in seconds
        this.ventCooldownMax = 10; // 10 seconds cooldown
        this.ventAutoEjectTime = 10; // Auto-eject after 10 seconds in vent
        this.ventTimer = 0; // Time spent in current vent
        this.currentVent = null; // Track which vent player is in
        this.ventArrows = []; // Arrows pointing to connected vents
        this.killSound = null;
        this.loadKillSound();

        // Sabotage button config from sprite combiner
        this.sabotageButtons = [
            { name: "reactor", x: 29, y: 272, sprite: { x: 1573, y: 2, w: 70, h: 69 } },
            { name: "02", x: 689, y: 221, sprite: { x: 1500, y: 2, w: 73, h: 73 } },
        ];
        this.sabotageButtonScale = 0.5;

        // Active sabotage state (reactor/O2 critical sabotages)
        this.activeSabotage = null; // 'reactor' or '02' or null
        this.sabotageTimer = 0; // Countdown in seconds
        this.sabotageTimerMax = 20; // 20 seconds to fix
        this.sabotageAlarmSound = null;
        this.loadSabotageAlarmSound();

        // Sabotage target locations (map coordinates for arrow pointing)
        // O2 has two locations - we point to the closer one
        this.sabotageLocations = {
            reactor: { x: 550, y: 920 },  // Reactor room position
            '02': { x: 1542, y: 459 }     // O2 room position (first keypad)
        };
        this.o2Locations = [
            { x: 1542, y: 459 },  // First O2 keypad
            { x: 1538, y: 618 }   // Second O2 keypad
        ];

        // Pending game over after ejection
        this.pendingGameOver = null;

        // Dead bodies array
        this.deadBodies = [];

        this.initTasks();

        // Task location boxes from map editor (scaled from 8564x4793 full map to game scale 0.25)
        // Yellow boxes show only for players who have that task, white boxes always show
        const s = 0.25;
        this.taskBoxes = [
            // Yellow task boxes - only show if player has that specific task
            { x: 1847.54 * s, y: 653.10 * s, w: 74.30 * s, h: 52.63 * s, color: '#ffcc00', taskName: 'Align Engine Output', taskRoom: 'Upper Engine' },
            { x: 1348.83 * s, y: 1787.60 * s, w: 71.28 * s, h: 53.46 * s, color: '#ffcc00', taskName: 'Unlock Manifolds', taskRoom: 'Reactor' },
            { x: 1348.83 * s, y: 1787.60 * s, w: 71.28 * s, h: 53.46 * s, color: '#ffcc00', taskName: 'Start Reactor', taskRoom: 'Reactor' },
            { x: 1709.64 * s, y: 2885.95 * s, w: 71.05 * s, h: 53.29 * s, color: '#ffcc00', taskName: 'Align Engine Output', taskRoom: 'Lower Engine' },
            { x: 3328.45 * s, y: 2535.62 * s, w: 71.94 * s, h: 49.56 * s, color: '#ffcc00', taskName: 'Divert Power', taskRoom: 'Electrical' },
            { x: 3561.85 * s, y: 2605.96 * s, w: 67.14 * s, h: 41.56 * s, color: '#ffcc00', taskName: 'Fix Wiring', taskRoom: 'Electrical' },
            { x: 3198.96 * s, y: 2534.02 * s, w: 65.54 * s, h: 59.15 * s, color: '#ffcc00', taskName: 'Download Data', taskRoom: 'Electrical' },
            { x: 5201.62 * s, y: 2379.43 * s, w: 67.91 * s, h: 42.79 * s, color: '#ffcc00', taskName: 'Swipe Card', taskRoom: 'Admin' },
            { x: 5201.62 * s, y: 2379.43 * s, w: 67.91 * s, h: 42.79 * s, color: '#ffcc00', taskName: 'Fix Wiring', taskRoom: 'Admin' },
            { x: 5403.50 * s, y: 2343.15 * s, w: 66.05 * s, h: 61.40 * s, color: '#ffcc00', taskName: 'Upload Data', taskRoom: 'Admin' },
            { x: 6060.87 * s, y: 3759.42 * s, w: 73.37 * s, h: 51.36 * s, color: '#ffef3d', taskName: 'Prime Shields', taskRoom: 'Shields' },
            { x: 6881.58 * s, y: 3045.87 * s, w: 74.99 * s, h: 54.54 * s, color: '#ffef3d', taskName: 'Stabilize Steering', taskRoom: 'Navigation' },
            { x: 6460.40 * s, y: 1673.22 * s, w: 73.30 * s, h: 53.64 * s, color: '#ffef3d', taskName: 'Accept Diverted Power', taskRoom: 'O2' },
            { x: 7565.93 * s, y: 1908.04 * s, w: 68.51 * s, h: 45.67 * s, color: '#ffef3d', taskName: 'Clear Asteroids', taskRoom: 'Weapons' },
            { x: 7565.93 * s, y: 1908.04 * s, w: 68.51 * s, h: 45.67 * s, color: '#ffef3d', taskName: 'Accept Diverted Power', taskRoom: 'Weapons' },
            { x: 7835.93 * s, y: 1668.93 * s, w: 69.85 * s, h: 48.36 * s, color: '#ffef3d', taskName: 'Accept Diverted Power', taskRoom: 'Navigation' },
            { x: 6512.07 * s, y: 509.78 * s, w: 69.5 * s, h: 58.5 * s, color: '#ffef3d', taskName: 'Fix Wiring', taskRoom: 'Cafeteria' },
            { x: 6512.07 * s, y: 509.78 * s, w: 69.5 * s, h: 58.5 * s, color: '#ffef3d', taskName: 'Download Data', taskRoom: 'Cafeteria' },
            { x: 6164.63 * s, y: 1732.32 * s, w: 57.72 * s, h: 55.04 * s, color: '#ffef3d', taskName: 'Submit Scan', taskRoom: 'MedBay' },
            // White boxes - always visible for everyone
            { x: 6122.30 * s, y: 2373.65 * s, w: 51.06 * s, h: 56.87 * s, color: '#ffffff', alwaysVisible: true },
            { x: 1126.97 * s, y: 1447.45 * s, w: 57.47 * s, h: 84.41 * s, color: '#ffffff', alwaysVisible: true },
            { x: 1123.62 * s, y: 2859.21 * s, w: 56.56 * s, h: 13.57 * s, color: '#ffffff', alwaysVisible: true },
        ];

        // Task complete overlay state
        this.taskCompleteOverlay = false;
        this.taskCompleteTimer = 0;
        this.taskCompleteDuration = 1.0; // 1 second freeze frame

        // Footstep sounds
        this.footstepSounds = [];
        this.currentFootstepIndex = 0;
        this.footstepCounter = 0; // Only play every 2nd frame change

        // Input state
        this.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            use: false,
            report: false,
            kill: false,
            vent: false
        };

        // Timing
        this.lastTime = 0;
        this.fps = 0;
        this.frameCount = 0;
        this.fpsTimer = 0;

        // Network
        this.network = new NetworkManager(this);
        // Pass network to game lobby for position syncing
        this.gameLobbyScreen.network = this.network;
        this.setupNetworkCallbacks();

        // Setup
        this.setupInput();
        this.loadAssets();
    }

    setupNetworkCallbacks() {
        // Room created - transition to game lobby as host
        this.network.onRoomCreated = (data) => {
            console.log('Room created with code:', data.code, data);
            this.state = 'game_lobby';
            this.onlineScreen.hide();
            this.stopThemeMusic();
            // Get players from roomInfo if available, mark which one is local
            const players = (data.roomInfo?.players || data.players || []).map(p => ({
                ...p,
                isLocal: p.id === this.network.playerId
            }));
            this.gameLobbyScreen.show(true, data.code, players);
        };

        // Room joined - transition to game lobby as non-host
        this.network.onRoomJoined = (data) => {
            console.log('Joined room:', data.code, data);
            this.state = 'game_lobby';
            this.lobbyScreen.hide();
            this.onlineScreen.hide();
            this.stopThemeMusic();
            // Get players from roomInfo if available, mark which one is local
            const players = (data.roomInfo?.players || data.players || []).map(p => ({
                ...p,
                isLocal: p.id === this.network.playerId
            }));
            this.gameLobbyScreen.show(false, data.code, players);
        };

        // Join error - show error on lobby screen
        this.network.onJoinError = (data) => {
            console.log('Join error:', data.message);
            // Could show error message in UI
        };

        // Lobbies list received - update lobby browser
        this.network.onLobbiesList = (lobbies) => {
            console.log('Received lobbies:', lobbies);
            this.lobbyScreen.updateLobbies(lobbies);
        };

        // Room left - return to online screen
        this.network.onRoomLeft = () => {
            console.log('Left room');
            this.state = 'online_select';
            this.gameLobbyScreen.hide();
            this.onlineScreen.show();
            // Stop any playing game ambience
            this.stopAmbience();
        };

        // Player joined room - update game lobby
        this.network.onPlayerJoinedRoom = (data) => {
            console.log('Player joined room event:', data.player.id, data.player.name, 'current players:', this.gameLobbyScreen.players.size);
            this.gameLobbyScreen.addPlayer(data.player);
            console.log('After adding, players:', this.gameLobbyScreen.players.size);
        };

        // Player left room - update game lobby
        this.network.onPlayerLeftRoom = (data) => {
            console.log('Player left:', data.playerId);
            this.gameLobbyScreen.removePlayer(data.playerId);
        };

        // Settings updated
        this.network.onSettingsUpdated = (settings) => {
            console.log('Settings updated:', settings);
            this.gameLobbyScreen.updateSettings(settings);
        };

        // Game start - transition to playing
        this.network.onGameStart = (data) => {
            console.log('Game starting! Impostor:', data.isImpostor, 'Players:', data.players?.length);
            this.state = 'playing';
            this.gameLobbyScreen.hide();

            // Stop theme music and start game ambience
            this.stopThemeMusic();
            this.playAmbience();

            // Clear existing players
            this.players.clear();

            // Add all players from server data
            if (data.players) {
                for (const playerData of data.players) {
                    const isLocal = playerData.id === this.network.playerId;
                    if (isLocal) {
                        // Spawn local player at the position from server
                        this.spawnLocalPlayer({ ...data, ...playerData });
                        // Use server's impostor assignment (server makes host always impostor for testing)
                        this.localPlayer.isImpostor = data.isImpostor;
                    } else {
                        // Add remote player
                        const player = new Player(
                            playerData.id,
                            playerData.x,
                            playerData.y,
                            playerData.color,
                            false
                        );
                        player.name = playerData.name;
                        player.isImpostor = data.isImpostor && data.impostorIds?.includes(playerData.id);
                        this.players.set(playerData.id, player);
                        console.log('Added remote player:', playerData.id, playerData.name);
                    }
                }
            } else {
                // Fallback for offline/old protocol
                this.spawnLocalPlayer(data);
            }

            // Start role reveal screen (Crewmate for now)
            this.startRoleReveal();

            // Debug: log tasks at game start
            console.log('=== GAME START - TASKS DEBUG ===');
            console.log('Tasks count:', this.tasks?.length);
            if (this.tasks) {
                this.tasks.forEach((t, i) => {
                    console.log(`Task ${i}: ${t.name} | ${t.room} (completed: ${t.completed})`);
                });
            }
            console.log('================================');
        };

        // Countdown started - sync countdown to all players
        this.network.onCountdownStarted = () => {
            console.log('Countdown synced from server');
            if (this.gameLobbyScreen) {
                this.gameLobbyScreen.beginStartCountdown();
            }
        };

        // Countdown error - not enough players
        this.network.onCountdownError = (message) => {
            console.log('Countdown error:', message);
            if (this.gameLobbyScreen) {
                this.gameLobbyScreen.showError(message);
            }
        };
    }

    async loadAssets() {
        console.log('Loading assets...');

        // Load sprite data JSON (frame positions extracted from Unity)
        try {
            const response = await fetch('/assets/sprite-data.json');
            const spriteData = await response.json();
            this.spriteData = spriteData;
            console.log('Sprite data loaded:', spriteData);
        } catch (e) {
            console.warn('Failed to load sprite data', e);
            this.spriteData = null;
        }

        // Load player spritesheet - both idle and walk are on the same texture
        try {
            const playerTexture = await assetLoader.loadTexture('player_sheet', '/assets/PlayerAnimations.png');

            // Register sprite frames from extracted data
            if (this.spriteData) {
                // Idle frames
                const idleFrames = [];
                if (this.spriteData.idle.length > 0) {
                    idleFrames.push(this.spriteData.idle[0]);
                }
                assetLoader.sprites.set('player_idle', { texture: playerTexture, frames: idleFrames });

                // Walk frames
                const walkFrames = [];
                for (const walkFrame of this.spriteData.walk) {
                    walkFrames.push(walkFrame);
                }
                assetLoader.sprites.set('player_walk', { texture: playerTexture, frames: walkFrames });

                console.log(`Player sprites loaded: ${idleFrames.length} idle, ${walkFrames.length} walk`);
            }
        } catch (e) {
            console.warn('Failed to load player texture, using placeholder', e);
        }

        // Load main menu assets
        try {
            await assetLoader.loadTexture('stars_bg', '/assets/stars-bg.png');
            await assetLoader.loadTexture('logo', '/assets/logo.png');
            await assetLoader.loadTexture('main_crew', '/assets/main-screen-crew.png');
            await assetLoader.loadTexture('main_menu_ui', '/assets/main-menu.png');
            await assetLoader.loadTexture('discord_logo', '/assets/discord-logo.png');
            await assetLoader.loadTexture('button_backing', '/assets/button-backing.png');
            await assetLoader.loadTexture('gui_buttons', '/assets/gui/Buttons-sharedassets0.assets-73.png');
            await assetLoader.loadTexture('ui_buttons', '/assets/ui-buttons.png');
            console.log('Main menu assets loaded');
        } catch (e) {
            console.warn('Failed to load main menu assets', e);
        }

        // Load map textures
        try {
            // Full Skeld map - 8564x4793
            await assetLoader.loadTexture('map_skeld', '/assets/skeld-full.webp');
            // Lobby map for pre-game waiting (1656x1008)
            await assetLoader.loadTexture('lobby_map', '/assets/lobby.png');
            console.log('Map textures loaded');
        } catch (e) {
            console.warn('Failed to load map texture, using placeholder', e);
        }

        // Load collision mask (black = walkable, white = walls)
        try {
            await this.map.loadCollisionMask('/assets/skeld-collision.png');
            console.log('Collision mask loaded');
        } catch (e) {
            console.warn('No collision mask found, using fallback rectangles', e);
        }

        // Load spawn animation frames
        try {
            const spawnFrames = [];
            for (let i = 1; i <= 10; i++) {
                const img = await assetLoader.loadTexture(`spawn_${i}`, `/assets/spawn/spawn-${i}.png`);
                spawnFrames.push(img);
            }
            // Store spawn frames array for easy access
            assetLoader.spawnFrames = spawnFrames;
            console.log('Spawn animation loaded (10 frames)');
        } catch (e) {
            console.warn('Failed to load spawn animation', e);
        }

        // Load emergency meeting assets
        try {
            await assetLoader.loadTexture('discuss', '/assets/discuss.png');
            await assetLoader.loadTexture('discuss_bg', '/assets/discuss-bg.png');
            await assetLoader.loadTexture('crew_left', '/assets/crew-left.png');
            await assetLoader.loadTexture('crew_right', '/assets/crew-right.png');
            // SHHH intro assets
            await assetLoader.loadTexture('shh_bg', '/assets/shh-bg.png');
            await assetLoader.loadTexture('shh_crew', '/assets/shh-crew.png');
            await assetLoader.loadTexture('shh_hand', '/assets/shh-hand.png');
            await assetLoader.loadTexture('shh_text', '/assets/shh-text.png');
            await assetLoader.loadTexture('shh_shadow', '/assets/shh-shadow.png');
            await assetLoader.loadTexture('emergency_button', '/assets/emergency-button.png');
            // Load buttons from the correct sprite sheet
            await assetLoader.loadTexture('buttons', '/assets/gui/Buttons-sharedassets0.assets-73.png');
            await assetLoader.loadTexture('imposter_buttons', '/assets/gui/Buttons-sharedassets0.assets-73.png');
            await assetLoader.loadTexture('sabotage_map', '/assets/sabotage-map.png');
            await assetLoader.loadTexture('use_arrow', '/assets/use-arrow.png');
            await assetLoader.loadTexture('meeting_hud', '/assets/meeting-hud.png');
            await assetLoader.loadTexture('meeting_room', '/assets/meeting-room.png');
            await assetLoader.loadTexture('voting_screen', '/assets/voting-screen.png');
            await assetLoader.loadTexture('player_sprites', '/assets/player-sprites.png');
            this.emergencySound = new Audio('/assets/sounds/emergency_alarm.ogg');
            console.log('Meeting assets loaded');
        } catch (e) {
            console.warn('Failed to load meeting assets', e);
        }

        // Load task assets
        try {
            await assetLoader.loadTexture('wires_panel', '/assets/wires-panel.png');
            // Divert Power task assets
            await assetLoader.loadTexture('divert_base', '/assets/divert-base.png');
            await assetLoader.loadTexture('divert_switch', '/assets/divert-switch.png');
            await assetLoader.loadTexture('receive_bg', '/assets/receive-bg.png');
            await assetLoader.loadTexture('receive_switch', '/assets/receive-switch.png');
            // Task complete sound
            this.taskCompleteSound = new Audio('/assets/audio/task_Complete.ogg');
            // Task arrow for multi-step tasks
            await assetLoader.loadTexture('task_arrow', '/assets/task-arrow.png');
            // Task progress bar UI
            await assetLoader.loadTexture('taskbar', '/assets/taskbar.png');
            // MedScan task
            await assetLoader.loadTexture('medscan_panel', '/assets/medscan-panel.png');
            await assetLoader.loadTexture('medbay_sprites', '/assets/vent-sprites.png');
            // Task list panel background
            await assetLoader.loadTexture('task_panel', '/assets/kickban.png');
            // Stabilize Steering task
            await assetLoader.loadTexture('stabilize_base', '/assets/nav-stabilize-base.png');
            await assetLoader.loadTexture('stabilize_graph', '/assets/nav-stabilize-graph.png');
            await assetLoader.loadTexture('stabilize_target', '/assets/nav-stabilize-target.png');
            // Upload/Download Data task
            await assetLoader.loadTexture('upload_data', '/assets/tasks/UploadData.png');
            // Clear Asteroids task (Weapons)
            await assetLoader.loadTexture('weapons', '/assets/tasks/Weapons.png');
            // Reactor Meltdown sabotage
            await assetLoader.loadTexture('reactor_handprint', '/assets/tasks/reactorMeltdown_handprintBase.png');
            await assetLoader.loadTexture('reactor_glowbar', '/assets/tasks/reactorMeltdown_glowBar.png');
            // O2 Sabotage keypad
            await assetLoader.loadTexture('keypad', '/assets/tasks/KeypadGame.png');
            // Card Swipe task
            await assetLoader.loadTexture('card_swipe', '/assets/tasks/CardSlide-sharedassets0.assets-169.png');
            // Unlock Manifolds task
            await assetLoader.loadTexture('unlock_manifolds', '/assets/tasks/UnlockManifolds-sharedassets0.assets-128.png');
            // Simon Says task (Start Reactor)
            await assetLoader.loadTexture('simon_says', '/assets/tasks/SimonSays-sharedassets0.assets-202.png');
            // Shields task
            await assetLoader.loadTexture('shields', '/assets/tasks/Shields.png');
            // Engine Align task
            await assetLoader.loadTexture('engine_align_base', '/assets/tasks/engineAlign_base.png');
            await assetLoader.loadTexture('engine_align_engine', '/assets/tasks/engineAlign_engine.png');
            await assetLoader.loadTexture('engine_align_slider', '/assets/tasks/engineAlign_slider.png');
            await assetLoader.loadTexture('engine_align_dot', '/assets/tasks/engineAlign_dottedLine.png');
            console.log('Task assets loaded');
        } catch (e) {
            console.warn('Failed to load task assets', e);
        }

        // Load dead body sprite sheet and define sprite regions
        try {
            await assetLoader.loadTexture('dead_body_sheet', '/assets/players/Player-sharedassets0.assets-55.png');
            // Dead body sprite data (from boxer-cutter)
            this.deadBodySprites = {
                // Dead body sprite
                body: {
                    x: 1, y: 1950, w: 89, h: 70
                },
                // Ghost sprite (for rendering ghosts)
                ghost: {
                    x: 111, y: 439, w: 100, h: 121
                }
            };
            console.log('Dead body sprite sheet loaded');
        } catch (e) {
            console.warn('Failed to load dead body sprites', e);
        }

        // Load footstep sounds (tile 1-7, rotating)
        try {
            for (let i = 1; i <= 7; i++) {
                const sound = new Audio(`/assets/audio/FootstepTile0${i}.ogg`);
                sound.volume = 0.6;
                this.footstepSounds.push(sound);
            }
            console.log('Footstep sounds loaded');
        } catch (e) {
            console.warn('Failed to load footstep sounds', e);
        }

        // Load UI click sound
        try {
            this.uiClickSound = new Audio('/assets/sounds/ui_click.ogg');
            this.uiClickSound.volume = 0.7;
            console.log('UI click sound loaded');
        } catch (e) {
            console.warn('Failed to load UI click sound', e);
        }

        // Load theme song for main menu
        try {
            this.themeMusic = new Audio('/assets/sounds/theme.ogg');
            this.themeMusic.volume = 0.5;
            this.themeMusic.loop = true;
            console.log('Theme music loaded');
        } catch (e) {
            console.warn('Failed to load theme music', e);
        }

        // Load game ambience
        try {
            this.ambienceSound = new Audio('/assets/sounds/ambience.ogg');
            this.ambienceSound.volume = 0.4;
            this.ambienceSound.loop = true;
            console.log('Ambience sound loaded');
        } catch (e) {
            console.warn('Failed to load ambience sound', e);
        }

        // Load vote sound
        try {
            this.voteSound = new Audio('/assets/sounds/vote.ogg');
            this.voteSound.volume = 0.8;
            console.log('Vote sound loaded');
        } catch (e) {
            console.warn('Failed to load vote sound', e);
        }

        // Load spawn sound
        try {
            this.spawnSound = new Audio('/assets/sounds/spawn.ogg');
            this.spawnSound.volume = 0.7;
            console.log('Spawn sound loaded');
        } catch (e) {
            console.warn('Failed to load spawn sound', e);
        }

        // Load crewmate reveal sound
        try {
            this.crewmateRevealSound = new Audio('/assets/sounds/crewmate-reveal.ogg');
            this.crewmateRevealSound.volume = 0.8;
            console.log('Crewmate reveal sound loaded');
        } catch (e) {
            console.warn('Failed to load crewmate reveal sound', e);
        }

        // Load crewmate reveal background
        try {
            this.crewmateRevealBg = new Image();
            this.crewmateRevealBg.src = '/assets/crewmate-reveal-bg.png';
            console.log('Crewmate reveal background loaded');
        } catch (e) {
            console.warn('Failed to load crewmate reveal background', e);
        }

        // Load impostor reveal background
        try {
            this.impostorRevealBg = new Image();
            this.impostorRevealBg.src = '/assets/impostor-reveal-bg.jpg';
            console.log('Impostor reveal background loaded');
        } catch (e) {
            console.warn('Failed to load impostor reveal background', e);
        }

        // Load victory/defeat screen assets
        try {
            // Victory video (shown to winners)
            this.victoryVideo = document.createElement('video');
            this.victoryVideo.src = '/assets/victory.mp4';
            this.victoryVideo.loop = true;
            this.victoryVideo.muted = false;
            this.victoryVideo.preload = 'auto';

            // Defeat image (shown to losers)
            this.defeatImage = new Image();
            this.defeatImage.src = '/assets/defeat.jpg';

            console.log('Victory/defeat assets loaded');
        } catch (e) {
            console.warn('Failed to load victory/defeat assets', e);
        }

        // Load sabotage alarm sound (done via method call in constructor)

        console.log('Assets loaded');

        // Load map shapes from JSON (custom drawn task areas)
        await this.loadMapShapes();

        // Start theme music on menu
        this.playThemeMusic();
    }

    async loadMapShapes() {
        try {
            const response = await fetch('/assets/map-shapes.json');
            const shapes = await response.json();
            this.mapShapes = shapes;
            console.log(`Loaded ${shapes.length} map shapes`);

            // Process shapes and associate with tasks based on proximity
            this.processMapShapes();
        } catch (e) {
            console.warn('Failed to load map shapes:', e);
            this.mapShapes = [];
        }
    }

    processMapShapes() {
        // Task definitions with their coordinates (in full map scale 8564x4793)
        const taskLocations = [
            { name: 'Align Engine Output', room: 'Upper Engine', x: 1847, y: 653 },
            { name: 'Align Engine Output', room: 'Lower Engine', x: 1709, y: 2885 },
            { name: 'Unlock Manifolds', room: 'Reactor', x: 1348, y: 1787 },
            { name: 'Start Reactor', room: 'Reactor', x: 1348, y: 1787 },
            { name: 'Divert Power', room: 'Electrical', x: 3328, y: 2535 },
            { name: 'Fix Wiring', room: 'Electrical', x: 3561, y: 2605 },
            { name: 'Download Data', room: 'Electrical', x: 3198, y: 2534 },
            { name: 'Swipe Card', room: 'Admin', x: 5201, y: 2379 },
            { name: 'Fix Wiring', room: 'Admin', x: 5201, y: 2379 },
            { name: 'Upload Data', room: 'Admin', x: 5403, y: 2343 },
            { name: 'Prime Shields', room: 'Shields', x: 6060, y: 3759 },
            { name: 'Stabilize Steering', room: 'Navigation', x: 6881, y: 3045 },
            { name: 'Chart Course', room: 'Navigation', x: 8360, y: 2100 },
            { name: 'Accept Diverted Power', room: 'O2', x: 6460, y: 1673 },
            { name: 'Clean O2 Filter', room: 'O2', x: 6460, y: 1673 },
            { name: 'Clear Asteroids', room: 'Weapons', x: 7565, y: 1908 },
            { name: 'Accept Diverted Power', room: 'Weapons', x: 7565, y: 1908 },
            { name: 'Accept Diverted Power', room: 'Navigation', x: 7835, y: 1668 },
            { name: 'Fix Wiring', room: 'Cafeteria', x: 6512, y: 509 },
            { name: 'Download Data', room: 'Cafeteria', x: 6512, y: 509 },
            { name: 'Submit Scan', room: 'MedBay', x: 6164, y: 1732 },
            { name: 'Inspect Sample', room: 'MedBay', x: 6000, y: 2800 },
            { name: 'Accept Diverted Power', room: 'Communications', x: 5652, y: 3731 },
            { name: 'Fix Wiring', room: 'Security', x: 4605, y: 2791 },
            { name: 'Accept Diverted Power', room: 'Security', x: 4605, y: 2791 },
            { name: 'Empty Garbage', room: 'Cafeteria', x: 5610, y: 350 },
            { name: 'Fix Wiring', room: 'Storage', x: 6321, y: 3703 },
            { name: 'Fuel Engines', room: 'Storage', x: 6321, y: 3703 },
            { name: 'Empty Chute', room: 'O2', x: 7045, y: 875 },
            { name: 'Empty Garbage', room: 'Storage', x: 4030, y: 300 },
            { name: 'Calibrate Distributor', room: 'Electrical', x: 3660, y: 2180 },
        ];

        // Associate each shape with the nearest task
        const scale = 0.25;
        for (const shape of this.mapShapes) {
            // Get shape center coordinates
            let shapeX, shapeY;
            if (shape.type === 'box') {
                shapeX = shape.x + shape.width / 2;
                shapeY = shape.y + shape.height / 2;
            } else if (shape.type === 'line') {
                shapeX = (shape.x1 + shape.x2) / 2;
                shapeY = (shape.y1 + shape.y2) / 2;
            }

            // Find nearest task (within 300 pixels in full map scale)
            let nearestTask = null;
            let nearestDist = 300;
            for (const task of taskLocations) {
                const dx = shapeX - task.x;
                const dy = shapeY - task.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestTask = task;
                }
            }

            // Assign task to shape
            if (nearestTask) {
                shape.taskName = nearestTask.name;
                shape.taskRoom = nearestTask.room;
            }

            // Check if white/always visible (white stroke color)
            if (shape.strokeColor === '#ffffff') {
                shape.alwaysVisible = true;
            }
        }

        console.log('Map shapes processed with task associations');
    }

    async loadMinimapData() {
        // Load minimap room data for admin table
        try {
            const response = await fetch('/assets/minimap-rooms.json');
            const data = await response.json();
            this.minimapRooms = data.minimap || [];
            console.log(`Loaded ${this.minimapRooms.length} minimap rooms for admin table`);

            // Load minimap image
            this.minimapImage = new Image();
            this.minimapImage.src = '/assets/minimap.png';
            this.minimapImage.onload = () => {
                console.log('Minimap image loaded:', this.minimapImage.width, 'x', this.minimapImage.height);
            };
        } catch (e) {
            console.warn('Failed to load minimap data:', e);
        }
    }

    // Get the center point of a room polygon
    getRoomCenter(roomLabel) {
        const room = this.minimapRooms.find(r => r.label.toLowerCase() === roomLabel.toLowerCase());
        if (!room || !room.points || room.points.length === 0) return null;

        const cx = room.points.reduce((sum, p) => sum + p.x, 0) / room.points.length;
        const cy = room.points.reduce((sum, p) => sum + p.y, 0) / room.points.length;
        return { x: cx, y: cy };
    }

    // Handle room occupancy update from server
    onRoomOccupancy(data) {
        this.roomOccupancy = data;
    }

    // Check if player is near admin table
    isNearAdminTable() {
        if (!this.localPlayer) return false;
        const dx = this.localPlayer.x - this.adminTablePos.x;
        const dy = this.localPlayer.y - this.adminTablePos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < this.adminTableRadius;
    }

    initTasks() {
        // Assign 4 tasks per player: max 2 multi-step tasks, rest single tasks
        const s = 0.25;

        // Define all possible multi-step tasks (Divert Power pairs)
        // Divert Power panel is ALWAYS in Electrical - coordinates match taskBox
        const allMultiTasks = [
            () => {
                const receive = new ReceivePowerTask('Weapons', Math.round(7565.93 * s), Math.round(1908.04 * s));
                const divert = new DivertPowerTask('Electrical', Math.round(3328.45 * s), Math.round(2535.62 * s), 'Weapons', receive);
                return [divert, receive];
            },
            () => {
                const receive = new ReceivePowerTask('O2', Math.round(6460.40 * s), Math.round(1673.22 * s));
                const divert = new DivertPowerTask('Electrical', Math.round(3328.45 * s), Math.round(2535.62 * s), 'O2', receive);
                return [divert, receive];
            },
            () => {
                const receive = new ReceivePowerTask('Navigation', Math.round(7835.93 * s), Math.round(1668.93 * s));
                const divert = new DivertPowerTask('Electrical', Math.round(3328.45 * s), Math.round(2535.62 * s), 'Navigation', receive);
                return [divert, receive];
            },
            () => {
                // Download/Upload Data - Cafeteria download location matches taskBox
                const upload = new UploadDataTask('Admin', Math.round(5403.50 * s), Math.round(2343.15 * s));
                const download = new DownloadDataTask('Cafeteria', Math.round(6512.07 * s), Math.round(509.78 * s), upload);
                return [download, upload];
            },
            () => {
                // Download/Upload Data - Electrical download location matches taskBox
                const upload = new UploadDataTask('Admin', Math.round(5403.50 * s), Math.round(2343.15 * s));
                const download = new DownloadDataTask('Electrical', Math.round(3198.96 * s), Math.round(2534.02 * s), upload);
                return [download, upload];
            }
        ];

        // Define all possible single tasks - coordinates match taskBoxes
        const allSingleTasks = [
            () => new WiresTask('Cafeteria', Math.round(6512.07 * s), Math.round(509.78 * s)),
            () => new WiresTask('Admin', Math.round(5201.62 * s), Math.round(2379.43 * s)),
            () => new WiresTask('Electrical', Math.round(3561.85 * s), Math.round(2605.96 * s)),
            () => new MedScanTask('MedBay', Math.round(6164.63 * s), Math.round(1732.32 * s)),
            () => new StabilizeSteeringTask('Navigation', Math.round(6881.58 * s), Math.round(3045.87 * s)),
            () => new ClearAsteroidsTask('Weapons', Math.round(7565.93 * s), Math.round(1908.04 * s)),
            () => new SwipeCardTask('Admin', Math.round(5201.62 * s), Math.round(2379.43 * s)),
            () => new UnlockManifoldsTask('Reactor', Math.round(1348.83 * s), Math.round(1787.60 * s)),
            () => new SimonSaysTask('Reactor', Math.round(1348.83 * s), Math.round(1787.60 * s)),
            () => new ShieldsTask('Shields', Math.round(6060.87 * s), Math.round(3759.42 * s)),
            () => new EngineAlignTask('Upper Engine', Math.round(1847.54 * s), Math.round(653.10 * s)),
            () => new EngineAlignTask('Lower Engine', Math.round(1709.64 * s), Math.round(2885.95 * s))
        ];

        // Shuffle and select tasks
        const shuffledMulti = [...allMultiTasks].sort(() => Math.random() - 0.5);
        const shuffledSingle = [...allSingleTasks].sort(() => Math.random() - 0.5);

        // Pick 0-2 multi-step tasks
        const numMulti = Math.floor(Math.random() * 3); // 0, 1, or 2
        const numSingle = 4 - numMulti;

        // Add multi-step tasks
        for (let i = 0; i < numMulti && i < shuffledMulti.length; i++) {
            const taskPair = shuffledMulti[i]();
            this.tasks.push(...taskPair);
        }

        // Add single tasks to reach 4 total
        for (let i = 0; i < numSingle && i < shuffledSingle.length; i++) {
            this.tasks.push(shuffledSingle[i]());
        }

        // Sabotage panels (always available, not counted as tasks)
        const reactorPanel1 = new ReactorMeltdownTask('Reactor', 291, 704);
        const reactorPanel2 = new ReactorMeltdownTask('Reactor', 283, 400);
        reactorPanel1.partnerPanel = reactorPanel2;
        reactorPanel2.partnerPanel = reactorPanel1;

        const o2Keypad1 = new EnterCodeTask('O2', 1542, 459);
        const o2Keypad2 = new EnterCodeTask('O2', 1538, 618);
        o2Keypad1.partnerTask = o2Keypad2;
        o2Keypad2.partnerTask = o2Keypad1;

        this.sabotages = [reactorPanel1, reactorPanel2, o2Keypad1, o2Keypad2];

        console.log(`Assigned ${4} tasks (${numMulti} multi-step, ${numSingle} single)`);
    }

    setupInput() {
        // Keyboard input
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Mouse events for UI and tasks
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Prevent default for game keys (but not when in menus)
        window.addEventListener('keydown', (e) => {
            if (this.state !== 'menu' && this.state !== 'online_select' && this.state !== 'lobby_browser' && this.state !== 'game_lobby') {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
                    e.preventDefault();
                }
            }
        });
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    handleMouseDown(e) {
        const { x, y } = this.getMousePos(e);

        // Handle victory screen button clicks
        if (this.state === 'gameover' && this.victoryButtons) {
            const playAgain = this.victoryButtons.playAgain;
            const quit = this.victoryButtons.quit;

            if (this.isInRect(x, y, playAgain)) {
                this.playAgain();
                return;
            }
            if (this.isInRect(x, y, quit)) {
                this.quitToLobbyBrowser();
                return;
            }
            return;
        }

        // Handle sabotage menu clicks
        if (this.sabotageMenuOpen) {
            this.handleSabotageMenuClick(x, y);
            return;
        }

        // Handle active task clicks
        if (this.activeTask) {
            this.activeTask.handleClick(x, y);
            return;
        }

        // Otherwise treat as regular click
        this.handleClick(e);
    }

    handleMouseMove(e) {
        if (this.activeTask) {
            const { x, y } = this.getMousePos(e);
            this.activeTask.handleDrag(x, y);
        }
    }

    handleMouseUp(e) {
        if (this.activeTask && !this.taskCompleteOverlay) {
            this.activeTask.handleRelease();

            // Check if task completed - trigger freeze frame overlay
            if (this.activeTask.completed) {
                console.log(`Task "${this.activeTask.name}" completed!`);
                // Notify network of task completion
                if (this.network && this.network.connected) {
                    this.network.sendTaskComplete(this.activeTask.id, this.activeTask.name);
                }
                // Play task complete sound
                if (this.taskCompleteSound) {
                    this.taskCompleteSound.currentTime = 0;
                    this.taskCompleteSound.play().catch(e => console.log('Audio play failed:', e));
                }
                // Start freeze frame overlay
                this.taskCompleteOverlay = true;
                this.taskCompleteTimer = this.taskCompleteDuration;
            }
        }
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        // Scale mouse position to canvas coordinates
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Handle main menu clicks
        if (this.state === 'menu') {
            const result = this.mainMenu.handleClick(x, y);
            if (result) {
                this.playUIClick(); // Play click sound for any button
            }
            if (result === 'online') {
                this.state = 'online_select';
                this.mainMenu.active = false;
                this.onlineScreen.show();
                this.stopThemeMusic();
            } else if (result === 'freeplay') {
                this.state = 'playing';
                this.spawnLocalPlayer();
                this.stopThemeMusic();
                this.playAmbience();
            }
            return;
        }

        // Handle online screen clicks (HOST/PUBLIC/PRIVATE)
        if (this.state === 'online_select') {
            const result = this.onlineScreen.handleClick(x, y);
            if (result) this.playUIClick();
            console.log('Online screen click result:', result, 'Network connected:', this.network.connected);
            if (result === 'back') {
                this.state = 'menu';
                this.onlineScreen.hide();
                this.mainMenu.active = true;
                this.playThemeMusic();
            } else if (result === 'host') {
                // Create game via network - callback will handle state transition
                const playerName = this.onlineScreen.playerName || 'Player';
                console.log('Host clicked! Player name:', playerName, 'Network connected:', this.network.connected);
                if (this.network.connected) {
                    console.log('Creating room via network...');
                    this.network.createRoom(playerName, true);
                } else {
                    // Offline mode - go directly to game lobby
                    console.log('Going to offline game lobby...');
                    this.state = 'game_lobby';
                    this.onlineScreen.hide();
                    this.gameLobbyScreen.show(true, 'OFFLINE', [{ id: 'local', name: playerName, color: 0 }]);
                }
            } else if (result === 'public') {
                // Go to lobby browser and fetch lobbies
                this.state = 'lobby_browser';
                this.onlineScreen.hide();
                this.lobbyScreen.show();
                // Request lobbies from server
                if (this.network.connected) {
                    this.network.getLobbies();
                }
            } else if (result === 'private') {
                // Enter code - handled via code input on online screen
                // For now this path isn't used since we removed private button
            }
            return;
        }

        // Handle lobby browser clicks
        if (this.state === 'lobby_browser') {
            const result = this.lobbyScreen.handleClick(x, y);
            if (result) this.playUIClick();
            if (result === 'back') {
                this.state = 'online_select';
                this.lobbyScreen.hide();
                this.onlineScreen.show();
            } else if (result && result.type === 'lobby') {
                // Join selected lobby via network - callback will handle state transition
                const playerName = this.onlineScreen.playerName || 'Player';
                if (this.network.connected) {
                    this.network.joinRoom(result.code, playerName, 0);
                }
            } else if (result === 'refresh') {
                // Refresh lobby list
                if (this.network.connected) {
                    this.network.getLobbies();
                }
            }
            return;
        }

        // Game lobby (pre-game waiting room)
        if (this.state === 'game_lobby') {
            const result = this.gameLobbyScreen.handleClick(x, y);
            if (result) this.playUIClick();
            if (result === 'leave') {
                // Leave room via network
                if (this.network.connected) {
                    this.network.leaveRoom();
                }
                this.state = 'online_select';
                this.gameLobbyScreen.hide();
                this.onlineScreen.show();
            } else if (result === 'start') {
                // Tell server to start countdown (syncs to all players)
                if (this.network && this.network.connected) {
                    this.network.startCountdown();
                } else {
                    // Offline fallback
                    this.gameLobbyScreen.beginStartCountdown();
                }
            }
            return;
        }

        // Handle voting screen clicks
        if (this.meetingActive && this.meetingPhase === 'voting') {
            // Dead players (ghosts) cannot vote or chat
            const isGhost = this.localPlayer && this.localPlayer.isDead;

            // Check chat icon click - ghosts can't chat
            if (this.chatIconButton && this.isInRect(x, y, this.chatIconButton)) {
                if (isGhost) {
                    console.log('Ghosts cannot chat in meetings');
                    return;
                }
                this.chatOpen = !this.chatOpen;
                return;
            }

            // Ghosts cannot vote
            if (isGhost) {
                console.log('Ghosts cannot vote in meetings');
                return;
            }

            // Check skip vote button
            if (this.skipVoteButton && this.isInRect(x, y, this.skipVoteButton)) {
                console.log('Skipped vote!');
                if (this.localPlayer && !this.localPlayer.hasVoted) {
                    this.localPlayer.hasVoted = true;
                    this.playVoteSound();
                    // Send skip vote to server
                    if (this.network && this.network.connected) {
                        this.network.vote(null); // null = skip
                    }
                    // Also update local vote map for offline/display
                    this.voteMap.set(this.network?.playerId || this.localPlayer.id, 'skip');
                }
                return;
            }

            // Check vote buttons on player panels
            if (this.voteButtons) {
                for (const btn of this.voteButtons) {
                    if (btn && this.isInRect(x, y, btn)) {
                        // Don't allow voting for yourself or already voted
                        if (this.localPlayer && !this.localPlayer.hasVoted && btn.playerId !== this.localPlayer.id) {
                            console.log(`Voted for player: ${btn.playerId}`);
                            this.localPlayer.hasVoted = true;
                            this.playVoteSound();
                            // Send vote to server
                            if (this.network && this.network.connected) {
                                this.network.vote(btn.playerId);
                            }
                            // Also update local vote map for offline/display
                            this.voteMap.set(this.network?.playerId || this.localPlayer.id, btn.playerId);
                            // Mark voted player locally
                            const votedPlayer = this.players.get(btn.playerId);
                            if (votedPlayer) votedPlayer.votesReceived = (votedPlayer.votesReceived || 0) + 1;
                        }
                        return;
                    }
                }
            }
            return;
        }

        // Check action button clicks (Kill, Vent, Sabotage, Report, Use, Admin)
        if (this.localPlayer && !this.meetingActive && !this.activeTask) {
            // Check vent arrow clicks first (when in vent)
            if (this.localPlayer.inVent && this.handleVentArrowClick(x, y)) {
                return;
            }

            // Kill button (impostor only)
            if (this.killButtonHitbox && this.isInRect(x, y, this.killButtonHitbox)) {
                this.tryKill();
                return;
            }
            // Vent button (impostor only)
            if (this.ventButtonHitbox && this.isInRect(x, y, this.ventButtonHitbox)) {
                this.tryVent();
                return;
            }
            // Sabotage button (impostor only)
            if (this.sabotageButtonHitbox && this.isInRect(x, y, this.sabotageButtonHitbox)) {
                this.sabotageMenuOpen = !this.sabotageMenuOpen;
                if (this.sabotageMenuOpen) this.adminMapOpen = false;
                console.log('Sabotage menu:', this.sabotageMenuOpen ? 'opened' : 'closed');
                return;
            }
            // Report button (any player near dead body)
            if (this.reportButtonHitbox && this.isInRect(x, y, this.reportButtonHitbox)) {
                this.tryReportBody();
                return;
            }
            // Admin button (near admin table)
            if (this.adminButtonHitbox && this.isInRect(x, y, this.adminButtonHitbox)) {
                this.adminMapOpen = true;
                this.playUIClick();
                return;
            }
            // Use button (tasks or emergency)
            if (this.useButtonHitbox && this.isInRect(x, y, this.useButtonHitbox)) {
                const nearbyTask = this.getNearbyTask();
                if (nearbyTask && !nearbyTask.completed) {
                    this.activeTask = nearbyTask;
                    this.adminMapOpen = false;
                    nearbyTask.game = this;
                    nearbyTask.start();
                    this.playUIClick();
                    return;
                }
                // Check if near emergency button
                const dx = this.localPlayer.x - this.emergencyButtonPos.x;
                const dy = this.localPlayer.y - this.emergencyButtonPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.emergencyButtonRadius * 2) {
                    this.startEmergencyMeeting();
                    return;
                }
            }
        }
    }

    isInRect(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    handleKeyDown(e) {
        // Let OnlineScreen handle keyboard input for code entry
        if (this.state === 'online_select') {
            return; // OnlineScreen has its own keydown handler
        }

        // Let GameLobbyScreen handle keyboard input for player movement
        if (this.state === 'game_lobby') {
            return; // GameLobbyScreen has its own keydown handler
        }

        // Ignore keyboard during game over (use buttons instead)
        if (this.state === 'gameover') {
            return;
        }

        // Close sabotage menu with ESC
        if (this.sabotageMenuOpen && e.key === 'Escape') {
            this.sabotageMenuOpen = false;
            return;
        }

        // Close admin map with ESC
        if (this.adminMapOpen && e.key === 'Escape') {
            this.adminMapOpen = false;
            return;
        }

        // Close active task with ESC
        if (this.activeTask && e.key === 'Escape') {
            // Notify network that task was cancelled
            if (this.network && this.network.connected) {
                this.network.sendTaskCancel();
            }
            this.activeTask.close();
            this.activeTask = null;
            return;
        }

        // Handle chat input when chat is open
        if (this.meetingActive && this.chatOpen) {
            if (e.key === 'Enter') {
                // Send chat message
                if (this.chatInput.trim()) {
                    const message = this.chatInput.trim();
                    // Add locally
                    this.chatMessages.push({
                        name: this.localPlayer?.name || 'You',
                        text: message
                    });
                    // Send to server
                    if (this.network && this.network.connected) {
                        this.network.sendChat(message);
                    }
                    this.chatInput = '';
                }
                return;
            } else if (e.key === 'Backspace') {
                this.chatInput = this.chatInput.slice(0, -1);
                return;
            } else if (e.key === 'Escape') {
                this.chatOpen = false;
                return;
            } else if (e.key.length === 1) {
                this.chatInput += e.key;
                return;
            }
        }

        // Arrow keys and WASD for movement - all actions are button-only
        console.log('handleKeyDown reached, code:', e.code, 'key:', e.key, 'state:', this.state);
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                console.log('UP pressed');
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
        // Arrow keys and WASD for movement - all actions are button-only
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

    start() {
        // Start game loop (menu is shown first)
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.gameLoop(t));

        console.log('Game started - showing menu');
    }

    spawnLocalPlayer(data = {}) {
        // Create local player - use color from lobby if available, otherwise random
        const spawn = this.map.getSpawnPoint();

        // Get color from lobby player if available
        let playerColor;
        if (this.gameLobbyScreen && this.gameLobbyScreen.localPlayer) {
            playerColor = this.gameLobbyScreen.localPlayer.color;
        } else if (data.color !== undefined) {
            playerColor = data.color;
        } else {
            playerColor = Math.floor(Math.random() * 18); // 18 colors available
        }

        // Use socket ID for online games, 'local' for offline
        const playerId = this.network?.playerId || 'local';

        this.localPlayer = new Player(playerId, spawn.x, spawn.y, playerColor, true);
        // Use truncated Solana address as name, or 'You' as fallback
        this.localPlayer.name = this.onlineScreen?.playerName || 'You';
        this.players.set(playerId, this.localPlayer);
        console.log('Player spawned with ID:', playerId, 'color:', playerColor);

        // Impostor assignment is handled by server (host is always impostor for testing)

        // Play spawn sound
        this.playSpawnSound();
    }

    gameLoop(currentTime) {
        // Calculate delta time
        const dt = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // FPS counter
        this.frameCount++;
        this.fpsTimer += dt;
        if (this.fpsTimer >= 1) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsTimer = 0;
        }

        // Update
        this.update(dt);

        // Render
        this.render();

        // Next frame
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    update(dt) {
        // Update main menu
        if (this.state === 'menu') {
            this.mainMenu.update(dt, this.width, this.height);
            return;
        }

        // Update online screen
        if (this.state === 'online_select') {
            this.onlineScreen.update(dt, this.width, this.height);
            return;
        }

        // Update game lobby screen
        if (this.state === 'game_lobby') {
            this.gameLobbyScreen.update(dt, this.width, this.height);

            // Check if countdown completed - ONLY HOST triggers game start
            if (this.gameLobbyScreen.countdownComplete) {
                this.gameLobbyScreen.countdownComplete = false;
                // Only host sends the start_game event - other players wait for server
                if (this.gameLobbyScreen.isHost) {
                    if (this.network && this.network.connected) {
                        console.log('Host sending start_game to server');
                        this.network.startGame();
                    } else {
                        // Offline mode - start directly
                        this.state = 'playing';
                        this.gameLobbyScreen.hide();
                        this.spawnLocalPlayer();
                    }
                } else {
                    // Non-host: just wait for server's game_start event
                    console.log('Waiting for server game_start event...');
                }
            }
            return;
        }

        if (this.state !== 'playing' && this.state !== 'lobby' && this.state !== 'meeting') return;

        // Update role reveal timer
        this.updateRoleReveal(dt);

        // Skip other updates while role reveal is active
        if (this.roleRevealActive) return;

        // Update meeting timer
        if (this.meetingActive) {
            this.meetingTimer -= dt;
            if (this.meetingTimer <= 0) {
                if (this.meetingPhase === 'intro') {
                    // Move to voting phase
                    this.meetingPhase = 'voting';
                    this.meetingTimer = this.votingDuration;
                    console.log('Voting phase started');
                } else if (this.meetingPhase === 'voting') {
                    // Move to results phase - show who voted for whom
                    this.meetingPhase = 'results';
                    this.meetingTimer = this.voteResultsDuration;
                    this.calculateVoteResults();
                    console.log('Vote results phase started');
                } else if (this.meetingPhase === 'results') {
                    // Check if there's an ejection or tie
                    if (this.wasTie || !this.ejectedPlayer) {
                        // Tie or no ejection - end meeting and respawn
                        this.endMeetingAndRespawn();
                    } else {
                        // Move to ejection phase
                        this.meetingPhase = 'ejection';
                        this.startEjectionScreen();
                    }
                } else if (this.meetingPhase === 'ejection') {
                    // Update typing animation
                    this.ejectionTypingTimer += dt;
                    if (this.ejectionTypingTimer >= this.ejectionTypingSpeed) {
                        this.ejectionTypingTimer = 0;
                        if (this.ejectionTypedChars < this.ejectionText.length) {
                            this.ejectionTypedChars++;
                        }
                    }
                    // Check if ejection is complete (typing done + 2 seconds)
                    if (this.ejectionTypedChars >= this.ejectionText.length) {
                        this.meetingTimer -= dt;
                        if (this.meetingTimer <= 0) {
                            this.endMeetingAndRespawn();
                        }
                    }
                }
            } else if (this.meetingPhase === 'ejection') {
                // Continue updating typing animation even when timer > 0
                this.ejectionTypingTimer += dt;
                if (this.ejectionTypingTimer >= this.ejectionTypingSpeed) {
                    this.ejectionTypingTimer = 0;
                    if (this.ejectionTypedChars < this.ejectionText.length) {
                        this.ejectionTypedChars++;
                    }
                }
                // Update floating player position
                this.ejectionPlayerX += this.ejectionPlayerVelX * dt;
                this.ejectionPlayerY += this.ejectionPlayerVelY * dt;
            }
            return; // Don't update player during meeting
        }

        // Update sabotage cooldown
        if (this.sabotageCooldown > 0) {
            this.sabotageCooldown -= dt;
            if (this.sabotageCooldown < 0) this.sabotageCooldown = 0;
        }

        // Update kill cooldown
        if (this.killCooldown > 0) {
            this.killCooldown -= dt;
            if (this.killCooldown < 0) this.killCooldown = 0;
        }

        // Update vent cooldown
        if (this.ventCooldown > 0) {
            this.ventCooldown -= dt;
            if (this.ventCooldown < 0) this.ventCooldown = 0;
        }

        // Update vent animation
        if (this.localPlayer?.ventAnimation) {
            this.localPlayer.ventAnimTime += dt;
            const animDuration = 0.5; // 0.5 seconds

            if (this.localPlayer.ventAnimTime >= animDuration) {
                if (this.localPlayer.ventAnimation === 'enter') {
                    // Animation complete - now fully in vent
                    this.localPlayer.inVent = true;
                    this.localPlayer.ventAnimation = null;
                    console.log('Vent enter animation complete');
                } else if (this.localPlayer.ventAnimation === 'exit') {
                    // Exit animation complete - now fully out of vent
                    this.localPlayer.inVent = false;
                    this.localPlayer.ventAnimation = null;
                    console.log('Vent exit animation complete');
                }
            }
        }

        // Update vent timer (auto-eject after 10 seconds)
        if (this.localPlayer?.inVent) {
            this.ventTimer += dt;
            if (this.ventTimer >= this.ventAutoEjectTime) {
                console.log('Auto-ejected from vent after 10 seconds');
                this.exitVent();
            }
        }

        // Update critical sabotage timer (reactor/O2)
        if (this.activeSabotage && this.sabotageTimer > 0) {
            this.sabotageTimer -= dt;
            if (this.sabotageTimer <= 0) {
                this.sabotageTimer = 0;
                this.onSabotageTimerExpired();
            }

            // Check if sabotage has been fixed (all relevant tasks completed)
            if (this.activeSabotage === 'reactor') {
                // Reactor needs BOTH panels to show success simultaneously
                const reactorPanels = this.sabotages.filter(s => s.name === 'Stop Reactor Meltdown');
                if (reactorPanels.length >= 2 && reactorPanels[0].showSuccess && reactorPanels[1].showSuccess) {
                    this.stopCriticalSabotage();
                }
            } else if (this.activeSabotage === '02') {
                // O2 needs BOTH keypads to be completed
                const o2Keypads = this.sabotages.filter(s => s.name === 'Enter Code');
                if (o2Keypads.length >= 2 && o2Keypads[0].completed && o2Keypads[1].completed) {
                    this.stopCriticalSabotage();
                }
            }
        }

        // Update local player
        if (this.localPlayer) {
            // Debug: log input state occasionally
            if (!this._lastInputLog || Date.now() - this._lastInputLog > 2000) {
                console.log('Input state:', JSON.stringify(this.input), 'localPlayer exists:', !!this.localPlayer);
                this._lastInputLog = Date.now();
            }
            // Lock movement during MedScan scanning phase
            const isScanning = this.activeTask && this.activeTask.phase === 'scanning';
            if (isScanning) {
                // Keep player at scan position, don't process movement
                this.localPlayer.x = this.activeTask.scanMapX;
                this.localPlayer.y = this.activeTask.scanMapY;
                this.localPlayer.moving = false;
            }

            const oldX = this.localPlayer.x;
            const oldY = this.localPlayer.y;
            const oldFrame = this.localPlayer.animationFrame;

            // Only process input if not scanning
            this.localPlayer.update(dt, isScanning ? {} : this.input);

            // Play footstep sound every 3rd animation frame change while walking
            if (this.localPlayer.moving && this.localPlayer.animationFrame !== oldFrame) {
                this.footstepCounter++;
                if (this.footstepCounter >= 3) {
                    this.playFootstep();
                    this.footstepCounter = 0;
                }
            } else if (!this.localPlayer.moving) {
                this.footstepCounter = 0;
            }

            // Check collision and revert if needed
            if (this.map.checkCollision(this.localPlayer.x, this.localPlayer.y)) {
                this.localPlayer.x = oldX;
                this.localPlayer.y = oldY;
            }

            // Clamp to map bounds
            this.localPlayer.x = Math.max(30, Math.min(this.map.width - 30, this.localPlayer.x));
            this.localPlayer.y = Math.max(30, Math.min(this.map.height - 30, this.localPlayer.y));

            // Send position to server
            this.network.sendPosition(this.localPlayer);
        }

        // Update other players (not the local player)
        for (const [id, player] of this.players) {
            if (player !== this.localPlayer) {
                player.update(dt, null);

                // Update MedScan animation for other players
                if (player.isScanningMedBay) {
                    player.medScanTimer += dt;
                    if (player.medScanTimer >= player.medScanFrameDuration) {
                        player.medScanTimer = 0;
                        player.medScanFrame = (player.medScanFrame + 1) % 5; // 5 frames
                    }
                }
            }
        }

        // Update camera to follow local player (adjusted for zoom)
        if (this.localPlayer) {
            this.camera.x = this.localPlayer.x - (this.width / 2) / this.cameraZoom;
            this.camera.y = this.localPlayer.y - (this.height / 2) / this.cameraZoom;
        }

        // Handle special actions
        this.handleActions();

        // Update task complete overlay timer
        if (this.taskCompleteOverlay) {
            this.taskCompleteTimer -= dt;
            if (this.taskCompleteTimer <= 0) {
                // Freeze frame over, close the task
                this.taskCompleteOverlay = false;
                if (this.activeTask) {
                    this.activeTask.close();
                    this.activeTask = null;
                }
                // Ensure player is visible after any task completion
                if (this.localPlayer) {
                    this.localPlayer.visible = true;
                }
            }
            return; // Don't update anything else during freeze frame
        }

        // Update active task (for timed tasks like MedScan, ClearAsteroids)
        if (this.activeTask) {
            this.activeTask.update(dt, this.width, this.height);
            // Check if task auto-completed - trigger freeze frame overlay
            if (this.activeTask.completed && !this.taskCompleteOverlay) {
                console.log(`Task "${this.activeTask.name}" completed!`);
                // Notify network of task completion
                if (this.network && this.network.connected) {
                    this.network.sendTaskComplete(this.activeTask.id, this.activeTask.name);
                }
                if (this.taskCompleteSound) {
                    this.taskCompleteSound.currentTime = 0;
                    this.taskCompleteSound.play().catch(e => console.log('Audio play failed:', e));
                }
                // Start freeze frame overlay
                this.taskCompleteOverlay = true;
                this.taskCompleteTimer = this.taskCompleteDuration;
            }
        }
    }

    handleActions() {
        if (!this.localPlayer || this.meetingActive || this.activeTask) return;

        // Use action (E/Space)
        if (this.input.use) {
            // First check if near a task
            const nearbyTask = this.getNearbyTask();
            if (nearbyTask && !nearbyTask.completed) {
                this.activeTask = nearbyTask;
                nearbyTask.game = this; // Set game reference for network access
                nearbyTask.start();
                this.playUIClick(); // Play sound when opening task
                // Notify network that we started a task
                if (this.network && this.network.connected) {
                    this.network.sendTaskStart(nearbyTask.id, nearbyTask.name);
                }
                this.input.use = false;
                return;
            }

            // Check if near emergency button
            const dx = this.localPlayer.x - this.emergencyButtonPos.x;
            const dy = this.localPlayer.y - this.emergencyButtonPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.emergencyButtonRadius) {
                // Trigger emergency meeting!
                this.startEmergencyMeeting();
            } else {
                const vent = this.map.getVentAt(this.localPlayer.x, this.localPlayer.y);
                if (vent && this.localPlayer.isImpostor) {
                    console.log(`Near vent ${vent.id} in ${vent.room}`);
                }
            }
            this.input.use = false; // Consume input
        }

        // Vent action (V) - for impostor
        if (this.input.vent && this.localPlayer.isImpostor) {
            const vent = this.map.getVentAt(this.localPlayer.x, this.localPlayer.y);
            if (vent) {
                if (!this.localPlayer.inVent) {
                    this.localPlayer.inVent = true;
                    console.log(`Entered vent ${vent.id}`);
                } else {
                    // Move to connected vent
                    const nextVentId = vent.connections[0];
                    const nextVent = this.map.vents.find(v => v.id === nextVentId);
                    if (nextVent) {
                        this.localPlayer.x = nextVent.x;
                        this.localPlayer.y = nextVent.y;
                    }
                }
            } else if (this.localPlayer.inVent) {
                this.localPlayer.inVent = false;
                console.log('Exited vent');
            }
            this.input.vent = false;
        }
    }

    getNearbyTask() {
        if (!this.localPlayer) return null;

        const taskRadius = 100; // How close player needs to be to use task

        // Check regular tasks
        for (const task of this.tasks) {
            // Skip disabled tasks (like ReceivePower before Divert is done)
            if (task.enabled === false) continue;

            const dx = this.localPlayer.x - task.x;
            const dy = this.localPlayer.y - task.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < taskRadius) {
                return task;
            }
        }

        // Check sabotages (reactor panels, etc.)
        for (const sabotage of this.sabotages) {
            const dx = this.localPlayer.x - sabotage.x;
            const dy = this.localPlayer.y - sabotage.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < taskRadius) {
                return sabotage;
            }
        }

        return null;
    }

    playFootstep() {
        if (this.footstepSounds.length === 0) return;

        // Play current footstep sound
        const sound = this.footstepSounds[this.currentFootstepIndex];
        sound.currentTime = 0;
        sound.play().catch(e => {}); // Ignore autoplay errors

        // Rotate to next sound
        this.currentFootstepIndex = (this.currentFootstepIndex + 1) % this.footstepSounds.length;
    }

    playUIClick() {
        if (!this.uiClickSound) return;
        this.uiClickSound.currentTime = 0;
        this.uiClickSound.play().catch(e => {}); // Ignore autoplay errors
    }

    playThemeMusic() {
        if (!this.themeMusic) return;
        this.themeMusic.currentTime = 0;
        this.themeMusic.play().catch(e => {}); // Ignore autoplay errors
    }

    stopThemeMusic() {
        if (!this.themeMusic) return;
        this.themeMusic.pause();
        this.themeMusic.currentTime = 0;
    }

    playAmbience() {
        if (!this.ambienceSound) return;
        this.ambienceSound.currentTime = 0;
        this.ambienceSound.play().catch(e => {}); // Ignore autoplay errors
    }

    stopAmbience() {
        if (!this.ambienceSound) return;
        this.ambienceSound.pause();
        this.ambienceSound.currentTime = 0;
    }

    playVoteSound() {
        if (!this.voteSound) return;
        this.voteSound.currentTime = 0;
        this.voteSound.play().catch(e => {});
    }

    playSpawnSound() {
        if (!this.spawnSound) return;
        this.spawnSound.currentTime = 0;
        this.spawnSound.play().catch(e => {});
    }

    playCrewmateRevealSound() {
        if (!this.crewmateRevealSound) return;
        this.crewmateRevealSound.currentTime = 0;
        this.crewmateRevealSound.play().catch(e => {});
    }

    startRoleReveal() {
        this.roleRevealActive = true;
        this.roleRevealTimer = 0;
        // Play appropriate reveal sound based on role
        // TODO: Add impostor reveal sound when available
        if (!this.localPlayer?.isImpostor) {
            this.playCrewmateRevealSound();
        }
        // For impostor, we could play a different sound here
    }

    updateRoleReveal(dt) {
        if (!this.roleRevealActive) return;

        this.roleRevealTimer += dt;
        console.log('Role reveal timer:', this.roleRevealTimer, '/', this.roleRevealDuration);
        if (this.roleRevealTimer >= this.roleRevealDuration) {
            this.roleRevealActive = false;
            console.log('Role reveal ended');
        }
    }

    renderRoleReveal(ctx) {
        if (!this.roleRevealActive) return;

        // Choose background based on role
        const isImpostor = this.localPlayer && this.localPlayer.isImpostor;
        const revealBg = isImpostor ? this.impostorRevealBg : this.crewmateRevealBg;

        // Draw the role reveal background (covers full screen)
        // Check both complete AND naturalWidth to ensure image loaded successfully
        if (revealBg && revealBg.complete && revealBg.naturalWidth > 0) {
            // Scale to fit screen while maintaining aspect ratio
            const imgW = revealBg.width;
            const imgH = revealBg.height;
            const screenW = this.width;
            const screenH = this.height;

            // Cover the screen
            const scale = Math.max(screenW / imgW, screenH / imgH);
            const drawW = imgW * scale;
            const drawH = imgH * scale;
            const drawX = (screenW - drawW) / 2;
            const drawY = (screenH - drawH) / 2;

            ctx.drawImage(revealBg, drawX, drawY, drawW, drawH);
        } else {
            // Fallback: dark background with role text
            ctx.fillStyle = isImpostor ? '#1a0000' : '#000010';
            ctx.fillRect(0, 0, this.width, this.height);

            // Draw role text as fallback
            ctx.fillStyle = isImpostor ? '#ff0000' : '#00ffff';
            ctx.font = 'bold 72px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(isImpostor ? 'IMPOSTOR' : 'CREWMATE', this.width / 2, this.height / 3);
        }

        // Draw the local player sprite in the middle-bottom area
        if (this.localPlayer) {
            const playerX = this.width / 2;
            const playerY = this.height * 0.7; // 70% down the screen

            // Draw player at larger scale
            ctx.save();
            ctx.translate(playerX, playerY);

            // Get player idle sprite and draw it
            const idleSprite = assetLoader.getSprite('player_idle');
            if (idleSprite && idleSprite.frames.length > 0) {
                const frame = idleSprite.frames[0];
                const spriteScale = 2; // Reveal screen scale
                const playerColor = Player.COLORS[this.localPlayer.color % Player.COLORS.length];
                this.localPlayer.drawRecoloredFrame(ctx, idleSprite.texture, frame, spriteScale, playerColor);
            }

            ctx.restore();
        }
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Render main menu
        if (this.state === 'menu') {
            if (this.mainMenu) {
                this.mainMenu.render(this.ctx, assetLoader);
            } else {
                // Fallback if menu not loaded
                this.ctx.fillStyle = '#191970';
                this.ctx.fillRect(0, 0, this.width, this.height);
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.font = 'bold 48px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('AMONG US', this.width/2, this.height/2);
            }
            return;
        }

        // Render online select screen (HOST/PUBLIC/PRIVATE)
        if (this.state === 'online_select') {
            this.onlineScreen.render(this.ctx, assetLoader);
            return;
        }

        // Render lobby browser
        if (this.state === 'lobby_browser') {
            this.lobbyScreen.render(this.ctx, assetLoader);
            return;
        }

        // Render game lobby screen
        if (this.state === 'game_lobby') {
            this.gameLobbyScreen.render(this.ctx, assetLoader, this.width, this.height);
            this.gameLobbyScreen.renderUI(this.ctx, assetLoader, this.width, this.height);
            return;
        }

        // Render game over / victory screen
        if (this.state === 'gameover') {
            this.renderVictoryScreen(this.ctx, assetLoader);
            return;
        }

        // Don't render game if no local player (shouldn't happen but safety check)
        if (!this.localPlayer) return;

        // Apply zoom transform
        this.ctx.save();
        this.ctx.scale(this.cameraZoom, this.cameraZoom);

        // Draw map
        this.map.render(this.ctx, this.camera, assetLoader);

        // Draw task location boxes (yellow for player's tasks, white always visible)
        this.renderTaskBoxes(this.ctx, this.camera);

        // Draw MedScan world sprite (if local player scanning)
        if (this.activeTask && this.activeTask.renderWorldSprite) {
            this.activeTask.renderWorldSprite(this.ctx, assetLoader, this.camera);
        }

        // Draw MedScan world sprite for other players who are scanning
        this.renderOtherPlayersMedScan(this.ctx, assetLoader, this.camera);

        // Draw dead bodies at death locations (before players so they appear under ghosts)
        this.renderDeadBodies(this.ctx, assetLoader, this.camera);

        // Draw players (sorted by Y for depth)
        const sortedPlayers = [...this.players.values()].sort((a, b) => a.y - b.y);
        for (const player of sortedPlayers) {
            // Skip invisible players (e.g., during MedScan)
            if (player.visible === false) continue;
            // Ghost visibility: dead players are only visible to other dead players (ghosts)
            if (player.isDead && player !== this.localPlayer && !this.localPlayer.isDead) {
                continue; // Don't render ghost to living players
            }
            // Hide player when in vent (except during vent animation)
            if (player.inVent && !player.ventAnimation) {
                continue; // Don't render player when fully in vent
            }
            // Render vent animation if active
            if (player.ventAnimation) {
                this.renderVentAnimation(this.ctx, player);
            } else {
                player.render(this.ctx, assetLoader, this.camera, null, player.isDead);
            }
        }

        // Draw task debug outlines (only when DEBUG_TASKS is enabled)
        if (window.DEBUG_TASKS) {
            this.renderTaskDebug(this.ctx);
            this.renderTaskAreas(this.ctx, this.camera);
        }

        this.ctx.restore();

        // Draw UI (not affected by zoom)
        this.renderUI();
    }

    renderUI() {
        const ctx = this.ctx;

        // FPS counter
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px Arial';
        // Debug info removed - clean UI

        // Draw all action buttons in unified layout (bottom right, stacked)
        if (this.localPlayer && !this.meetingActive && !this.activeTask && !this.adminMapOpen && !this.localPlayer.isDead) {
            this.drawActionButtons(ctx);
        }

        // Draw task arrow OR vent arrows depending on state
        if (this.localPlayer && !this.meetingActive && !this.activeTask) {
            if (this.localPlayer.inVent) {
                // Draw vent travel arrows (clickable)
                this.drawVentArrows(ctx);
            } else {
                // Draw task arrow pointing to next task
                this.drawTaskArrow(ctx);
            }
        }

        // Draw task progress bar in top left (always visible except during meetings)
        if (!this.meetingActive) {
            this.drawTaskBar(ctx);
        }

        // Draw emergency meeting overlay
        if (this.meetingActive) {
            this.drawMeetingOverlay(ctx);
        }

        // Draw active task (pass camera and game for MedScan)
        if (this.activeTask) {
            this.activeTask.render(ctx, assetLoader, this.camera, this);
        }

        // Draw sabotage menu overlay (for imposters)
        if (this.sabotageMenuOpen) {
            this.drawSabotageMenu(ctx);
        }

        // Draw admin table minimap overlay
        if (this.adminMapOpen) {
            this.drawAdminMap(ctx);
        }

        // Draw task complete overlay (freeze frame with text)
        if (this.taskCompleteOverlay) {
            this.drawTaskCompleteOverlay(ctx);
        }

        // Draw critical sabotage overlay (red flash, arrows, timer)
        if (this.activeSabotage) {
            this.drawSabotageAlert(ctx);
        }

        // Draw role reveal overlay (on top of everything)
        this.renderRoleReveal(ctx);
    }

    renderVictoryScreen(ctx, assetLoader) {
        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        if (!this.gameOverData) return;

        // Determine if local player won
        const localIsImpostor = this.localPlayer && this.localPlayer.isImpostor;
        const crewmatesWon = this.gameOverData.winner === 'crewmates';
        const localPlayerWon = (crewmatesWon && !localIsImpostor) || (!crewmatesWon && localIsImpostor);

        // Draw background (video for winners, image for losers)
        if (localPlayerWon && this.victoryVideo && this.victoryVideo.readyState >= 2) {
            // Draw video frame
            ctx.drawImage(this.victoryVideo, 0, 0, screenW, screenH);
        } else if (!localPlayerWon && this.defeatImage && this.defeatImage.complete) {
            // Draw defeat image
            ctx.drawImage(this.defeatImage, 0, 0, screenW, screenH);
        } else {
            // Fallback background
            ctx.fillStyle = localPlayerWon ? '#1a472a' : '#4a1a1a';
            ctx.fillRect(0, 0, screenW, screenH);
        }

        // Determine which players to show
        // Crewmates win: show crewmates
        // Impostors win: show impostors
        // Fallback to local players map if server didn't send player data
        const playersList = this.gameOverData.players || [...this.players.values()].map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            isImpostor: p.isImpostor,
            isDead: p.isDead
        }));

        const playersToShow = playersList.filter(p => {
            if (crewmatesWon) {
                return !p.isImpostor; // Show crewmates
            } else {
                return p.isImpostor; // Show impostors
            }
        });

        // Title text
        ctx.font = 'bold 64px "VCR OSD Mono", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6;
        ctx.fillStyle = localPlayerWon ? '#00FF00' : '#FF0000';

        const title = localPlayerWon ? 'VICTORY' : 'DEFEAT';
        const subtitle = crewmatesWon ? 'Crewmates Win!' : 'Impostors Win!';

        ctx.strokeText(title, screenW / 2, 50);
        ctx.fillText(title, screenW / 2, 50);

        ctx.font = 'bold 36px "VCR OSD Mono", Arial, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeText(subtitle, screenW / 2, 130);
        ctx.fillText(subtitle, screenW / 2, 130);

        // Draw players with their sprites and names
        const playerTexture = assetLoader.getTexture('player_sheet');
        const spriteData = this.spriteData;

        if (playerTexture && spriteData && spriteData.idle.length > 0) {
            const playerCount = playersToShow.length;
            const spacing = Math.min(200, (screenW - 100) / (playerCount + 1));
            const startX = (screenW - (playerCount - 1) * spacing) / 2;
            const playerY = screenH / 2 + 50;

            for (let i = 0; i < playersToShow.length; i++) {
                const p = playersToShow[i];
                const x = startX + i * spacing;
                const y = playerY;

                // Get player color
                const colorIndex = p.color % Player.COLORS.length;
                const color = Player.COLORS[colorIndex];

                // Draw player sprite (idle frame)
                const frame = spriteData.idle[0];
                this.drawVictoryPlayerSprite(ctx, playerTexture, frame, x, y, color, 0.5);

                // Draw name above player
                ctx.font = 'bold 18px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#FFFFFF';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3;
                ctx.strokeText(p.name, x, y - 70);
                ctx.fillText(p.name, x, y - 70);
            }
        }

        // Draw Play Again and Quit buttons
        const buttonsTexture = assetLoader.getTexture('gui_buttons');
        if (buttonsTexture) {
            // Button sprite data from boxer-cutter
            const playAgainBtn = { x: 1, y: 0, w: 123, h: 175 };
            const quitBtn = { x: 121, y: 2, w: 131, h: 152 };

            const btnScale = 0.7;
            const btnMargin = 40;

            // Play Again - bottom left
            const playAgainW = playAgainBtn.w * btnScale;
            const playAgainH = playAgainBtn.h * btnScale;
            const playAgainX = btnMargin;
            const playAgainY = screenH - playAgainH - btnMargin;

            ctx.drawImage(buttonsTexture,
                playAgainBtn.x, playAgainBtn.y, playAgainBtn.w, playAgainBtn.h,
                playAgainX, playAgainY, playAgainW, playAgainH);

            // Quit - bottom right
            const quitW = quitBtn.w * btnScale;
            const quitH = quitBtn.h * btnScale;
            const quitX = screenW - quitW - btnMargin;
            const quitY = screenH - quitH - btnMargin;

            ctx.drawImage(buttonsTexture,
                quitBtn.x, quitBtn.y, quitBtn.w, quitBtn.h,
                quitX, quitY, quitW, quitH);

            // Store button positions for click detection
            this.victoryButtons = {
                playAgain: { x: playAgainX, y: playAgainY, w: playAgainW, h: playAgainH },
                quit: { x: quitX, y: quitY, w: quitW, h: quitH }
            };
        }
    }

    drawVictoryPlayerSprite(ctx, texture, frame, x, y, color, scale) {
        // Create offscreen canvas for recoloring
        if (!Game._victoryRecolorCanvas) {
            Game._victoryRecolorCanvas = document.createElement('canvas');
            Game._victoryRecolorCtx = Game._victoryRecolorCanvas.getContext('2d', { willReadFrequently: true });
        }

        const canvas = Game._victoryRecolorCanvas;
        const rctx = Game._victoryRecolorCtx;

        // Convert Unity coordinates to canvas coordinates
        const textureHeight = texture.height;
        const srcY = textureHeight - frame.y - frame.height;

        canvas.width = frame.width;
        canvas.height = frame.height;

        rctx.clearRect(0, 0, frame.width, frame.height);
        rctx.drawImage(texture, frame.x, srcY, frame.width, frame.height, 0, 0, frame.width, frame.height);

        // Get image data and recolor
        const imageData = rctx.getImageData(0, 0, frame.width, frame.height);
        const data = imageData.data;

        const bodyColor = this.hexToRgb(color.body);
        const shadowColor = this.hexToRgb(color.shadow);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a === 0) continue;

            // Red-ish = body color
            if (r > 150 && g < 80 && b < 80) {
                data[i] = bodyColor.r;
                data[i + 1] = bodyColor.g;
                data[i + 2] = bodyColor.b;
            }
            // Dark blue = shadow color
            else if (b > 150 && r < 80 && g < 80) {
                data[i] = shadowColor.r;
                data[i + 1] = shadowColor.g;
                data[i + 2] = shadowColor.b;
            }
        }

        rctx.putImageData(imageData, 0, 0);

        // Draw recolored sprite centered at position
        const drawW = frame.width * scale;
        const drawH = frame.height * scale;
        ctx.drawImage(canvas, x - drawW / 2, y - drawH / 2, drawW, drawH);
    }

    drawTaskCompleteOverlay(ctx) {
        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Semi-transparent dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, screenW, screenH);

        // "Task Complete" text - VCR OSD Mono font
        const text = 'Task Complete';
        ctx.font = 'bold 48px "VCR OSD Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Black outline for visibility
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6;
        ctx.strokeText(text, screenW / 2, screenH / 2);

        // White fill
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, screenW / 2, screenH / 2);
    }

    // Draw critical sabotage alert overlay (red flash, arrows pointing to sabotage, timer)
    drawSabotageAlert(ctx) {
        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Pulsing red screen flash
        const flashSpeed = 4; // pulses per second
        const flash = Math.sin(Date.now() / 1000 * flashSpeed * Math.PI) * 0.5 + 0.5;
        const redAlpha = 0.15 + flash * 0.15; // 0.15 to 0.3 alpha
        ctx.fillStyle = `rgba(255, 0, 0, ${redAlpha})`;
        ctx.fillRect(0, 0, screenW, screenH);

        // Draw red border around screen
        ctx.strokeStyle = `rgba(255, 0, 0, ${0.5 + flash * 0.5})`;
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, screenW - 8, screenH - 8);
    }

    // Render MedScan animation for other players who are scanning
    renderOtherPlayersMedScan(ctx, assetLoader, camera) {
        const medbaySprites = assetLoader?.getTexture('medbay_sprites');
        if (!medbaySprites) return;

        // MedScan animation frames (same as in MedScanTask)
        const scanFrames = [
            { x: 954, y: 0, w: 45, h: 62 },
            { x: 971, y: 116, w: 53, h: 68 },
            { x: 935, y: 243, w: 50, h: 66 },
            { x: 984, y: 184, w: 49, h: 61 },
            { x: 1023, y: 119, w: 53, h: 65 },
        ];

        for (const [id, player] of this.players) {
            if (player === this.localPlayer) continue;
            if (!player.isScanningMedBay) continue;

            // Get current animation frame
            const frame = scanFrames[player.medScanFrame % scanFrames.length];

            // Draw scanning sprite at scan position (922, 533)
            const scanX = 922;
            const scanY = 533;
            const screenX = scanX - camera.x;
            const screenY = scanY - camera.y;

            // Use consistent scale factor
            const scale = 0.5;
            const drawW = frame.w * scale;
            const drawH = frame.h * scale;

            ctx.drawImage(
                medbaySprites,
                frame.x, frame.y, frame.w, frame.h,
                screenX - drawW / 2, screenY - drawH + 10,
                drawW, drawH
            );
        }
    }

    // Render dead bodies at their death locations
    renderDeadBodies(ctx, assetLoader, camera) {
        const bodySheet = assetLoader?.getTexture('dead_body_sheet');
        if (!bodySheet || !this.deadBodySprites) return;

        for (const [id, player] of this.players) {
            if (!player.isDead) continue;
            if (player.deathX === undefined || player.deathY === undefined) continue;

            const screenX = player.deathX - camera.x;
            const screenY = player.deathY - camera.y;

            // Get player's color for recoloring
            const playerColor = Player.COLORS[player.color % Player.COLORS.length];

            // Draw dead body sprite
            const body = this.deadBodySprites.body;
            this.drawRecoloredDeadBodyPart(ctx, bodySheet, body, screenX, screenY, 0.3, playerColor);
        }
    }

    // Draw a dead body sprite part with recoloring (same logic as player sprites)
    drawRecoloredDeadBodyPart(ctx, texture, sprite, x, y, scale, color) {
        // Create offscreen canvas for recoloring
        if (!Game._deadBodyRecolorCanvas) {
            Game._deadBodyRecolorCanvas = document.createElement('canvas');
            Game._deadBodyRecolorCtx = Game._deadBodyRecolorCanvas.getContext('2d', { willReadFrequently: true });
        }

        const canvas = Game._deadBodyRecolorCanvas;
        const rctx = Game._deadBodyRecolorCtx;

        // Coordinates are already in canvas format (top-left origin)
        canvas.width = sprite.w;
        canvas.height = sprite.h;

        // Draw original sprite
        rctx.clearRect(0, 0, sprite.w, sprite.h);
        rctx.drawImage(texture, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);

        // Get image data and replace red/blue with player colors
        const imageData = rctx.getImageData(0, 0, sprite.w, sprite.h);
        const data = imageData.data;

        // Parse player color (hex to RGB)
        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 0, g: 0, b: 0 };
        };

        const bodyColor = hexToRgb(color.body);
        const shadowColor = hexToRgb(color.shadow);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a === 0) continue; // Skip transparent pixels

            // Check if pixel is red-ish (body color in original sprite)
            if (r > 150 && g < 80 && b < 80) {
                data[i] = bodyColor.r;
                data[i + 1] = bodyColor.g;
                data[i + 2] = bodyColor.b;
            }
            // Check if pixel is dark blue (shadow in original sprite)
            else if (b > 150 && r < 80 && g < 80) {
                data[i] = shadowColor.r;
                data[i + 1] = shadowColor.g;
                data[i + 2] = shadowColor.b;
            }
        }

        rctx.putImageData(imageData, 0, 0);

        // Draw the recolored sprite
        const drawW = sprite.w * scale;
        const drawH = sprite.h * scale;
        ctx.drawImage(canvas, x - drawW / 2, y - drawH / 2, drawW, drawH);
    }

    renderTaskAreas(ctx, camera) {
        // Only show task areas for tasks the player actually has
        if (!this.tasks || this.tasks.length === 0) return;

        const s = 0.25; // map scale

        // Solid yellow outline (no pulsing)
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Helper to draw a line (full map coords)
        const drawLine = (x1, y1, x2, y2) => {
            ctx.beginPath();
            ctx.moveTo(x1 * s - camera.x, y1 * s - camera.y);
            ctx.lineTo(x2 * s - camera.x, y2 * s - camera.y);
            ctx.stroke();
        };

        // Helper to draw a rectangle (full map coords)
        const drawRect = (x1, y1, x2, y2) => {
            const w = (x2 - x1) * s;
            const h = (y2 - y1) * s;
            ctx.strokeRect(x1 * s - camera.x, y1 * s - camera.y, w, h);
        };

        // Task shape definitions from task-debug.html - actual traced outlines
        const taskShapes = {
            // Divert Power - ALL divert power tasks go to the same electrical panel in Electrical room
            // The task.room is the SOURCE room (Upper Engine, Security, etc) but panel is always in Electrical
            'Divert Power_Upper Engine': [
                { type: 'rect', x1: 1850, y1: 661, x2: 1923, y2: 707 }
            ],
            'Divert Power_Security': [
                { type: 'rect', x1: 1850, y1: 661, x2: 1923, y2: 707 }
            ],
            'Divert Power_Reactor': [
                { type: 'rect', x1: 1850, y1: 661, x2: 1923, y2: 707 }
            ],
            'Divert Power_Shields': [
                { type: 'rect', x1: 1850, y1: 661, x2: 1923, y2: 707 }
            ],
            'Divert Power_Lower Engine': [
                { type: 'rect', x1: 1850, y1: 661, x2: 1923, y2: 707 }
            ],

            // Upload Data tasks
            'Upload_Admin': [
                { type: 'rect', x1: 5202, y1: 2382, x2: 5272, y2: 2429 }
            ],
            'Upload_Cafeteria': [
                { type: 'line', x1: 5591, y1: 373, x2: 5592, y2: 316 },
                { type: 'line', x1: 5593, y1: 318, x2: 5642, y2: 361 },
                { type: 'line', x1: 5642, y1: 361, x2: 5638, y2: 417 },
                { type: 'line', x1: 5639, y1: 417, x2: 5589, y2: 380 }
            ],
            'Upload_Weapons': [
                { type: 'rect', x1: 6514, y1: 511, x2: 6585, y2: 574 }
            ],
            'Upload_Navigation': [
                { type: 'rect', x1: 6884, y1: 3050, x2: 6964, y2: 3108 }
            ],
            'Upload_Electrical': [
                { type: 'rect', x1: 3190, y1: 2534, x2: 3280, y2: 2596 }
            ],

            // Fix Wiring tasks
            'Fix Wiring_Cafeteria': [
                { type: 'line', x1: 4010, y1: 298, x2: 4057, y2: 258 },
                { type: 'line', x1: 4063, y1: 260, x2: 4064, y2: 314 },
                { type: 'line', x1: 4064, y1: 315, x2: 4019, y2: 359 },
                { type: 'line', x1: 4019, y1: 358, x2: 4012, y2: 300 }
            ],
            'Fix Wiring_Admin': [
                { type: 'rect', x1: 5403, y1: 2347, x2: 5476, y2: 2408 }
            ],
            'Fix Wiring_Storage': [
                { type: 'rect', x1: 4607, y1: 2797, x2: 4676, y2: 2844 }
            ],
            'Fix Wiring_Electrical': [
                { type: 'rect', x1: 3560, y1: 2610, x2: 3632, y2: 2658 }
            ],
            'Fix Wiring_Navigation': [
                // Navigation wires panel - at 7612, 1917 full map coords
                { type: 'rect', x1: 7569, y1: 1880, x2: 7655, y2: 1960 }
            ],

            // Accept Diverted Power tasks
            'Accept Diverted Power_Weapons': [
                // Weapons asteroid destroyer shape
                { type: 'line', x1: 6503, y1: 993, x2: 6507, y2: 922 },
                { type: 'line', x1: 6508, y1: 922, x2: 6504, y2: 908 },
                { type: 'line', x1: 6504, y1: 907, x2: 6521, y2: 885 },
                { type: 'line', x1: 6521, y1: 884, x2: 6539, y2: 886 },
                { type: 'line', x1: 6539, y1: 885, x2: 6588, y2: 853 },
                { type: 'line', x1: 6589, y1: 853, x2: 6650, y2: 842 },
                { type: 'line', x1: 6651, y1: 843, x2: 6715, y2: 856 },
                { type: 'line', x1: 6718, y1: 856, x2: 6737, y2: 843 },
                { type: 'line', x1: 6737, y1: 843, x2: 6763, y2: 865 },
                { type: 'line', x1: 6764, y1: 865, x2: 6767, y2: 889 },
                { type: 'line', x1: 6769, y1: 889, x2: 6797, y2: 951 },
                { type: 'line', x1: 6797, y1: 956, x2: 6815, y2: 976 },
                { type: 'line', x1: 6820, y1: 978, x2: 6824, y2: 1015 },
                { type: 'line', x1: 6825, y1: 1016, x2: 6808, y2: 1033 },
                { type: 'line', x1: 6808, y1: 1033, x2: 6785, y2: 1028 },
                { type: 'line', x1: 6787, y1: 1028, x2: 6761, y2: 1054 },
                { type: 'line', x1: 6761, y1: 1054, x2: 6745, y2: 1052 },
                { type: 'line', x1: 6745, y1: 1052, x2: 6692, y2: 1070 },
                { type: 'line', x1: 6692, y1: 1071, x2: 6634, y2: 1077 },
                { type: 'line', x1: 6634, y1: 1077, x2: 6602, y2: 1076 },
                { type: 'line', x1: 6602, y1: 1076, x2: 6596, y2: 1081 },
                { type: 'line', x1: 6596, y1: 1080, x2: 6562, y2: 1067 },
                { type: 'line', x1: 6563, y1: 1067, x2: 6540, y2: 1073 },
                { type: 'line', x1: 6544, y1: 1075, x2: 6520, y2: 1061 },
                { type: 'line', x1: 6520, y1: 1061, x2: 6524, y2: 1037 },
                { type: 'line', x1: 6525, y1: 1037, x2: 6504, y2: 999 }
            ],
            'Accept Diverted Power_O2': [
                { type: 'rect', x1: 6461, y1: 1671, x2: 6536, y2: 1726 }
            ],
            'Accept Diverted Power_Navigation': [
                { type: 'rect', x1: 6884, y1: 3050, x2: 6964, y2: 3108 }
            ],
            'Accept Diverted Power_Communications': [
                { type: 'rect', x1: 6064, y1: 3764, x2: 6140, y2: 3816 }
            ],
            'Accept Diverted Power_Shields': [
                { type: 'rect', x1: 5650, y1: 3738, x2: 5726, y2: 3792 }
            ],
            'Accept Diverted Power_Electrical': [
                { type: 'rect', x1: 3324, y1: 2538, x2: 3408, y2: 2590 }
            ],

            // MedBay Scan - complex shape
            'Submit Scan_MedBay': [
                { type: 'line', x1: 3508, y1: 2212, x2: 3546, y2: 2144 },
                { type: 'line', x1: 3556, y1: 2140, x2: 3574, y2: 2162 },
                { type: 'line', x1: 3572, y1: 2160, x2: 3646, y2: 2128 },
                { type: 'line', x1: 3656, y1: 2108, x2: 3686, y2: 2092 },
                { type: 'line', x1: 3698, y1: 2094, x2: 3718, y2: 2128 },
                { type: 'line', x1: 3722, y1: 2126, x2: 3784, y2: 2150 },
                { type: 'line', x1: 3790, y1: 2150, x2: 3830, y2: 2220 },
                { type: 'line', x1: 3834, y1: 2222, x2: 3804, y2: 2238 },
                { type: 'line', x1: 3802, y1: 2238, x2: 3732, y2: 2276 },
                { type: 'line', x1: 3728, y1: 2274, x2: 3682, y2: 2290 },
                { type: 'line', x1: 3682, y1: 2290, x2: 3644, y2: 2276 },
                { type: 'line', x1: 3646, y1: 2276, x2: 3558, y2: 2228 },
                { type: 'line', x1: 3560, y1: 2228, x2: 3496, y2: 2206 },
                { type: 'line', x1: 3570, y1: 2182, x2: 3612, y2: 2224 },
                { type: 'line', x1: 3616, y1: 2224, x2: 3662, y2: 2230 },
                { type: 'line', x1: 3664, y1: 2228, x2: 3684, y2: 2206 },
                { type: 'line', x1: 3696, y1: 2204, x2: 3710, y2: 2226 },
                { type: 'line', x1: 3712, y1: 2228, x2: 3774, y2: 2204 },
                { type: 'line', x1: 3828, y1: 2024, x2: 3894, y2: 2102 },
                { type: 'line', x1: 3894, y1: 2102, x2: 3956, y2: 2092 },
                { type: 'line', x1: 3960, y1: 2088, x2: 3962, y2: 2142 },
                { type: 'line', x1: 3960, y1: 2140, x2: 3888, y2: 2110 },
                { type: 'line', x1: 3824, y1: 2018, x2: 3868, y2: 2012 },
                { type: 'line', x1: 3872, y1: 2012, x2: 3872, y2: 1984 },
                { type: 'line', x1: 3872, y1: 1980, x2: 3850, y2: 1992 },
                { type: 'line', x1: 3850, y1: 1992, x2: 3802, y2: 1984 },
                { type: 'line', x1: 3802, y1: 1984, x2: 3796, y2: 1906 },
                { type: 'line', x1: 3796, y1: 1906, x2: 3858, y2: 1930 },
                { type: 'line', x1: 3862, y1: 1928, x2: 3882, y2: 1918 },
                { type: 'line', x1: 3882, y1: 1916, x2: 3978, y2: 2006 },
                { type: 'line', x1: 3978, y1: 2000, x2: 3980, y2: 2102 },
                { type: 'line', x1: 3980, y1: 2102, x2: 3886, y2: 2018 }
            ],

            // Stabilize Steering - complex shape
            'Stabilize Steering_Navigation': [
                { type: 'line', x1: 8289, y1: 2014, x2: 8289, y2: 1969 },
                { type: 'line', x1: 8289, y1: 1969, x2: 8311, y2: 1949 },
                { type: 'line', x1: 8311, y1: 1949, x2: 8426, y2: 1964 },
                { type: 'line', x1: 8428, y1: 1965, x2: 8433, y2: 1983 },
                { type: 'line', x1: 8292, y1: 2010, x2: 8316, y2: 2024 },
                { type: 'line', x1: 8317, y1: 2023, x2: 8334, y2: 2066 },
                { type: 'line', x1: 8334, y1: 2066, x2: 8341, y2: 2148 },
                { type: 'line', x1: 8343, y1: 2148, x2: 8298, y2: 2175 },
                { type: 'line', x1: 8298, y1: 2175, x2: 8310, y2: 2210 },
                { type: 'line', x1: 8311, y1: 2210, x2: 8319, y2: 2238 },
                { type: 'line', x1: 8323, y1: 2243, x2: 8350, y2: 2261 },
                { type: 'line', x1: 8351, y1: 2261, x2: 8433, y2: 2197 },
                { type: 'line', x1: 8322, y1: 2166, x2: 8351, y2: 2197 },
                { type: 'line', x1: 8352, y1: 2195, x2: 8434, y2: 2137 },
                { type: 'line', x1: 8434, y1: 2137, x2: 8430, y2: 1981 },
                { type: 'line', x1: 8173, y1: 2046, x2: 8203, y2: 2145 },
                { type: 'line', x1: 8204, y1: 2145, x2: 8296, y2: 2144 },
                { type: 'line', x1: 8297, y1: 2142, x2: 8314, y2: 2069 },
                { type: 'line', x1: 8313, y1: 2063, x2: 8247, y2: 2062 },
                { type: 'line', x1: 8247, y1: 2059, x2: 8226, y2: 1982 },
                { type: 'line', x1: 8226, y1: 1985, x2: 8204, y2: 1983 },
                { type: 'line', x1: 8204, y1: 1983, x2: 8162, y2: 2029 },
                { type: 'line', x1: 8166, y1: 2031, x2: 8167, y2: 2054 }
            ],

            // Align Engine tasks
            'Align Engine_Upper Engine': [
                { type: 'line', x1: 1486, y1: 1284, x2: 1486, y2: 1378 },
                { type: 'line', x1: 1486, y1: 1378, x2: 1590, y2: 1378 },
                { type: 'line', x1: 1590, y1: 1376, x2: 1578, y2: 1282 },
                { type: 'line', x1: 1578, y1: 1282, x2: 1496, y2: 1284 }
            ],
            'Align Engine_Lower Engine': [
                { type: 'rect', x1: 1492, y1: 3473, x2: 1590, y2: 3570 }
            ],

            // Calibrate Distributor
            'Calibrate Distributor_Electrical': [
                { type: 'rect', x1: 3890, y1: 2548, x2: 3982, y2: 2656 }
            ],

            // Empty Garbage/Chute
            'Empty Garbage_Cafeteria': [
                { type: 'line', x1: 5119, y1: 4250, x2: 5120, y2: 4210 },
                { type: 'line', x1: 5120, y1: 4210, x2: 5137, y2: 4210 },
                { type: 'line', x1: 5138, y1: 4210, x2: 5141, y2: 4223 },
                { type: 'line', x1: 5141, y1: 4223, x2: 5146, y2: 4256 },
                { type: 'line', x1: 5119, y1: 4249, x2: 5116, y2: 4259 },
                { type: 'line', x1: 5117, y1: 4259, x2: 5151, y2: 4299 },
                { type: 'line', x1: 5146, y1: 4255, x2: 5157, y2: 4252 },
                { type: 'line', x1: 5157, y1: 4252, x2: 5157, y2: 4300 }
            ],
            'Empty Chute_O2': [
                { type: 'line', x1: 5775, y1: 556, x2: 5775, y2: 529 },
                { type: 'line', x1: 5777, y1: 529, x2: 5783, y2: 521 },
                { type: 'line', x1: 5780, y1: 519, x2: 5772, y2: 505 },
                { type: 'line', x1: 5772, y1: 504, x2: 5781, y2: 496 },
                { type: 'line', x1: 5783, y1: 496, x2: 5794, y2: 505 },
                { type: 'line', x1: 5794, y1: 504, x2: 5822, y2: 529 },
                { type: 'line', x1: 5823, y1: 530, x2: 5815, y2: 549 },
                { type: 'line', x1: 5815, y1: 549, x2: 5805, y2: 552 },
                { type: 'line', x1: 5808, y1: 552, x2: 5816, y2: 567 },
                { type: 'line', x1: 5818, y1: 567, x2: 5812, y2: 592 },
                { type: 'line', x1: 5812, y1: 593, x2: 5775, y2: 562 }
            ],
            'Empty Garbage_O2': [
                { type: 'line', x1: 5850, y1: 1901, x2: 5894, y2: 1859 },
                { type: 'line', x1: 5894, y1: 1859, x2: 5888, y2: 1832 },
                { type: 'line', x1: 5888, y1: 1832, x2: 5881, y2: 1822 },
                { type: 'line', x1: 5882, y1: 1822, x2: 5894, y2: 1814 },
                { type: 'line', x1: 5894, y1: 1815, x2: 5899, y2: 1798 },
                { type: 'line', x1: 5899, y1: 1798, x2: 5886, y2: 1786 },
                { type: 'line', x1: 5885, y1: 1786, x2: 5872, y2: 1793 },
                { type: 'line', x1: 5872, y1: 1793, x2: 5869, y2: 1803 },
                { type: 'line', x1: 5869, y1: 1803, x2: 5854, y2: 1818 },
                { type: 'line', x1: 5854, y1: 1818, x2: 5837, y2: 1827 },
                { type: 'line', x1: 5837, y1: 1827, x2: 5837, y2: 1849 },
                { type: 'line', x1: 5837, y1: 1848, x2: 5850, y2: 1851 },
                { type: 'line', x1: 5852, y1: 1850, x2: 5852, y2: 1858 },
                { type: 'line', x1: 5852, y1: 1858, x2: 5839, y2: 1868 },
                { type: 'line', x1: 5842, y1: 1868, x2: 5849, y2: 1895 }
            ],

            // Swipe Card (Admin)
            'Swipe Card_Admin': [
                { type: 'line', x1: 5963, y1: 2864, x2: 5964, y2: 2727 },
                { type: 'line', x1: 5970, y1: 2727, x2: 6039, y2: 2733 },
                { type: 'line', x1: 6039, y1: 2734, x2: 6039, y2: 2788 },
                { type: 'line', x1: 6040, y1: 2788, x2: 6019, y2: 2786 },
                { type: 'line', x1: 6023, y1: 2786, x2: 6020, y2: 2878 },
                { type: 'line', x1: 6020, y1: 2878, x2: 5962, y2: 2871 }
            ],

            // Clean O2 Filter
            'Clean O2 Filter_O2': [
                { type: 'rect', x1: 6170, y1: 1734, x2: 6223, y2: 1792 }
            ],

            // Chart Course
            'Chart Course_Navigation': [
                { type: 'rect', x1: 7569, y1: 1908, x2: 7640, y2: 1959 }
            ],

            // Prime Shields
            'Prime Shields_Shields': [
                { type: 'rect', x1: 6121, y1: 2373, x2: 6178, y2: 2433 }
            ],

            // Download Data / Cafeteria table
            'Download Data_Cafeteria': [
                // Cafeteria table shape
                { type: 'line', x1: 2497, y1: 1684, x2: 2547, y2: 1643 },
                { type: 'line', x1: 2497, y1: 1679, x2: 2489, y2: 1730 },
                { type: 'line', x1: 2489, y1: 1730, x2: 2547, y2: 1693 },
                { type: 'line', x1: 2547, y1: 1693, x2: 2565, y2: 1709 },
                { type: 'line', x1: 2565, y1: 1708, x2: 2550, y2: 1746 },
                { type: 'line', x1: 2550, y1: 1747, x2: 2552, y2: 1762 },
                { type: 'line', x1: 2553, y1: 1762, x2: 2714, y2: 1763 },
                { type: 'line', x1: 2714, y1: 1763, x2: 2719, y2: 1747 },
                { type: 'line', x1: 2719, y1: 1747, x2: 2703, y2: 1713 },
                { type: 'line', x1: 2703, y1: 1713, x2: 2706, y2: 1693 },
                { type: 'line', x1: 2706, y1: 1693, x2: 2785, y2: 1741 },
                { type: 'line', x1: 2786, y1: 1741, x2: 2775, y2: 1687 },
                { type: 'line', x1: 2775, y1: 1687, x2: 2724, y2: 1647 },
                { type: 'line', x1: 2724, y1: 1647, x2: 2712, y2: 1638 },
                { type: 'line', x1: 2712, y1: 1638, x2: 2709, y2: 1621 },
                { type: 'line', x1: 2709, y1: 1621, x2: 2552, y2: 1619 },
                { type: 'line', x1: 2552, y1: 1620, x2: 2547, y2: 1639 },
                { type: 'line', x1: 2790, y1: 1762, x2: 2790, y2: 1810 },
                { type: 'line', x1: 2790, y1: 1810, x2: 2831, y2: 1842 },
                { type: 'line', x1: 2831, y1: 1842, x2: 2834, y2: 1791 },
                { type: 'line', x1: 2834, y1: 1791, x2: 2794, y2: 1760 }
            ],

            // Download Data other locations (simple rects)
            'Download Data_Weapons': [
                { type: 'line', x1: 7023, y1: 890, x2: 7027, y2: 829 },
                { type: 'line', x1: 7035, y1: 831, x2: 7075, y2: 874 },
                { type: 'line', x1: 7075, y1: 874, x2: 7071, y2: 922 },
                { type: 'line', x1: 7071, y1: 925, x2: 7023, y2: 885 }
            ],
            'Download Data_Communications': [
                { type: 'line', x1: 6322, y1: 3774, x2: 6318, y2: 3710 },
                { type: 'line', x1: 6322, y1: 3708, x2: 6394, y2: 3708 },
                { type: 'line', x1: 6322, y1: 3774, x2: 6396, y2: 3774 },
                { type: 'line', x1: 6396, y1: 3770, x2: 6392, y2: 3708 }
            ],
            'Download Data_Navigation': [
                { type: 'line', x1: 6010, y1: 1778, x2: 6016, y2: 1860 },
                { type: 'line', x1: 6016, y1: 1860, x2: 6070, y2: 1800 },
                { type: 'line', x1: 6070, y1: 1800, x2: 6066, y2: 1730 },
                { type: 'line', x1: 6066, y1: 1728, x2: 6008, y2: 1774 },
                { type: 'line', x1: 5922, y1: 1850, x2: 5974, y2: 1860 },
                { type: 'line', x1: 5974, y1: 1858, x2: 6008, y2: 1832 },
                { type: 'line', x1: 5914, y1: 1844, x2: 5938, y2: 1780 },
                { type: 'line', x1: 5938, y1: 1780, x2: 5970, y2: 1786 },
                { type: 'line', x1: 5972, y1: 1786, x2: 6034, y2: 1726 },
                { type: 'line', x1: 6034, y1: 1726, x2: 6054, y2: 1726 },
                { type: 'line', x1: 5976, y1: 1784, x2: 6008, y2: 1780 }
            ],
            'Download Data_Electrical': [
                { type: 'line', x1: 1014, y1: 2290, x2: 1024, y2: 2234 },
                { type: 'line', x1: 1024, y1: 2232, x2: 1044, y2: 2200 },
                { type: 'line', x1: 1044, y1: 2200, x2: 1118, y2: 2224 },
                { type: 'line', x1: 1120, y1: 2226, x2: 1094, y2: 2262 },
                { type: 'line', x1: 1094, y1: 2264, x2: 1100, y2: 2318 },
                { type: 'line', x1: 1102, y1: 2318, x2: 1028, y2: 2304 },
                { type: 'line', x1: 1096, y1: 2314, x2: 1122, y2: 2284 },
                { type: 'line', x1: 1122, y1: 2282, x2: 1120, y2: 2232 }
            ],

            // Upload Data to Admin (all upload tasks go here)
            'Upload Data_Admin': [
                { type: 'rect', x1: 6064, y1: 3764, x2: 6140, y2: 3816 }
            ],

            // Unlock Manifolds (Reactor)
            'Unlock Manifolds_Reactor': [
                { type: 'rect', x1: 1712, y1: 2889, x2: 1784, y2: 2941 }
            ],

            // Start Reactor
            'Start Reactor_Reactor': [
                { type: 'rect', x1: 1348, y1: 1788, x2: 1424, y2: 1843 }
            ],

            // Fuel Engines
            'Fuel Engines_Storage': [
                { type: 'line', x1: 4438, y1: 3786, x2: 4506, y2: 3810 },
                { type: 'line', x1: 4508, y1: 3810, x2: 4508, y2: 3728 },
                { type: 'line', x1: 4440, y1: 3782, x2: 4446, y2: 3722 },
                { type: 'line', x1: 4518, y1: 3726, x2: 4464, y2: 3708 }
            ],

            // Clear Asteroids
            'Clear Asteroids_Weapons': [
                // Inner scope portion
                { type: 'line', x1: 6559, y1: 964, x2: 6542, y2: 892 },
                { type: 'line', x1: 6541, y1: 887, x2: 6545, y2: 871 },
                { type: 'line', x1: 6545, y1: 871, x2: 6568, y2: 866 },
                { type: 'line', x1: 6568, y1: 866, x2: 6622, y2: 921 },
                { type: 'line', x1: 6624, y1: 921, x2: 6635, y2: 967 },
                { type: 'line', x1: 6635, y1: 966, x2: 6686, y2: 946 },
                { type: 'line', x1: 6686, y1: 944, x2: 6688, y2: 975 },
                { type: 'line', x1: 6688, y1: 974, x2: 6620, y2: 1005 },
                { type: 'line', x1: 6621, y1: 1005, x2: 6560, y2: 965 },
                { type: 'line', x1: 6615, y1: 903, x2: 6620, y2: 900 },
                { type: 'line', x1: 6622, y1: 900, x2: 6690, y2: 940 },
                { type: 'line', x1: 6648, y1: 833, x2: 6650, y2: 703 },
                { type: 'line', x1: 6650, y1: 699, x2: 6790, y2: 760 },
                { type: 'line', x1: 6790, y1: 760, x2: 6778, y2: 891 }
            ],

            // Inspect Sample (MedBay)
            'Inspect Sample_MedBay': [
                { type: 'rect', x1: 7834, y1: 1666, x2: 7913, y2: 1721 }
            ],

            // Accept Samples (MedBay)
            'Accept Samples_MedBay': [
                { type: 'rect', x1: 8018, y1: 1665, x2: 8087, y2: 1721 }
            ],

            // Reactor Meltdown sabotage panels (raw coords: 291,704 and 283,400)
            'Stop Reactor Meltdown_Reactor': [
                { type: 'rect', x1: 251, y1: 664, x2: 331, y2: 744 }
            ],
            'Stop Reactor Meltdown_Reactor_2': [
                { type: 'rect', x1: 243, y1: 360, x2: 323, y2: 440 }
            ]
        };

        // Draw shapes only for player's incomplete tasks
        for (const task of this.tasks) {
            if (task.completed) continue;
            if (task.enabled === false) continue;

            // Try specific key first (task name + room)
            const key = `${task.name}_${task.room}`;
            let shapes = taskShapes[key];

            // Fallback to just task name (for tasks like Divert Power that have one location)
            if (!shapes) {
                shapes = taskShapes[task.name];
            }

            if (shapes) {
                for (const shape of shapes) {
                    if (shape.type === 'line') {
                        drawLine(shape.x1, shape.y1, shape.x2, shape.y2);
                    } else if (shape.type === 'rect') {
                        drawRect(shape.x1, shape.y1, shape.x2, shape.y2);
                    }
                }
            }
        }

        // Draw shapes for sabotages (reactor panels, etc.)
        for (let i = 0; i < this.sabotages.length; i++) {
            const sabotage = this.sabotages[i];
            if (sabotage.completed) continue;

            // Use index suffix for second panel
            const key = i === 0 ? `${sabotage.name}_${sabotage.room}` : `${sabotage.name}_${sabotage.room}_2`;
            const shapes = taskShapes[key];

            if (shapes) {
                for (const shape of shapes) {
                    if (shape.type === 'line') {
                        drawLine(shape.x1, shape.y1, shape.x2, shape.y2);
                    } else if (shape.type === 'rect') {
                        drawRect(shape.x1, shape.y1, shape.x2, shape.y2);
                    }
                }
            }
        }

        ctx.globalAlpha = 1;
    }

    renderTaskBoxes(ctx, camera) {
        if (!this.mapShapes || !this.localPlayer) return;

        // Build set of task keys player has (incomplete AND enabled tasks only)
        const playerTaskKeys = new Set();
        if (this.tasks) {
            for (const task of this.tasks) {
                if (!task.completed && task.enabled !== false) {
                    playerTaskKeys.add(`${task.name}|${task.room}`);
                }
            }
        }

        // Debug: log once
        if (!this._loggedTaskKeys) {
            console.log('=== TASK MATCHING DEBUG ===');
            console.log('Player tasks:', Array.from(playerTaskKeys));
            console.log('Map shapes with tasks:', this.mapShapes.filter(s => s.taskName).map(s => `${s.taskName}|${s.taskRoom}`));
            this._loggedTaskKeys = true;
        }

        const scale = 0.25; // Map scale factor
        ctx.lineWidth = 3;

        for (const shape of this.mapShapes) {
            // Determine if this shape should be rendered
            let shouldRender = false;
            let fillColor = 'rgba(255, 204, 0, 0.25)';
            let strokeColor = shape.strokeColor || '#ffcc00';

            // White shapes always show
            if (shape.alwaysVisible) {
                shouldRender = true;
                fillColor = 'rgba(255, 255, 255, 0.15)';
            } else if (shape.taskName && shape.taskRoom) {
                // Check if player has this task
                const shapeKey = `${shape.taskName}|${shape.taskRoom}`;
                if (playerTaskKeys.has(shapeKey)) {
                    shouldRender = true;
                }
            }

            if (!shouldRender) continue;

            ctx.strokeStyle = strokeColor;
            ctx.fillStyle = fillColor;

            if (shape.type === 'box') {
                // Render rectangle (scaled from full map coordinates)
                const x = shape.x * scale - camera.x;
                const y = shape.y * scale - camera.y;
                const w = shape.width * scale;
                const h = shape.height * scale;
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);
            } else if (shape.type === 'line') {
                // Render line (scaled from full map coordinates)
                const x1 = shape.x1 * scale - camera.x;
                const y1 = shape.y1 * scale - camera.y;
                const x2 = shape.x2 * scale - camera.x;
                const y2 = shape.y2 * scale - camera.y;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        }
    }

    drawTaskArrow(ctx) {
        let targetX, targetY, labelName, labelRoom;

        // If sabotage is active, point to sabotage location instead of tasks
        if (this.activeSabotage && this.sabotageLocations[this.activeSabotage]) {
            const sabotageTarget = this.sabotageLocations[this.activeSabotage];
            targetX = sabotageTarget.x;
            targetY = sabotageTarget.y;
            labelName = this.activeSabotage === 'reactor' ? 'REACTOR' : 'O2';
            labelRoom = 'EMERGENCY';
        } else {
            // Find the next incomplete task to point to
            // Priority: enabled tasks that aren't completed (skip disabled ReceivePower tasks)
            let nextTask = null;
            for (const task of this.tasks) {
                // Skip completed tasks
                if (task.completed) continue;
                // Skip disabled tasks (like ReceivePower before Divert is done)
                if (task.enabled === false) continue;

                // Found an incomplete, enabled task
                nextTask = task;
                break;
            }

            if (!nextTask) return;

            targetX = nextTask.x;
            targetY = nextTask.y;
            labelName = nextTask.name;
            labelRoom = nextTask.room;
        }

        const arrowTexture = assetLoader?.getTexture('task_arrow');
        if (!arrowTexture) return;

        // Calculate angle from player to target
        const dx = targetX - this.localPlayer.x;
        const dy = targetY - this.localPlayer.y;
        const angle = Math.atan2(dy, dx);

        // Draw arrow near the player (center of screen with offset in target direction)
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const arrowOffset = 80; // Distance from player center
        const arrowX = centerX + Math.cos(angle) * arrowOffset;
        const arrowY = centerY + Math.sin(angle) * arrowOffset;
        const arrowSize = 40;

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(angle);
        ctx.drawImage(arrowTexture, -arrowSize / 2, -arrowSize / 2, arrowSize, arrowSize);
        ctx.restore();
    }

    drawTaskBar(ctx) {
        const taskbarTexture = assetLoader?.getTexture('taskbar');
        if (!taskbarTexture) return;

        // Task bar sprite coordinates from buttons2.png
        const srcX = 2;
        const srcY = 177;
        const srcW = 799;
        const srcH = 69;

        // Position in top left corner
        const scale = 0.35;
        const drawW = srcW * scale;
        const drawH = srcH * scale;
        const drawX = 10;
        const drawY = 10;

        // Calculate task completion percentage
        const totalTasks = this.tasks.length;
        const completedTasks = this.tasks.filter(t => t.completed).length;
        const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;

        // The green fill area inside the bar
        const fillStartX = 20;  // Where green fill starts in sprite
        const fillEndX = 782;   // Where green fill ends in sprite
        const fillY = 18;       // Top of fill area in sprite
        const fillH = 34;       // Height of fill area in sprite

        // Create or reuse cached taskbar canvas
        if (!this.taskbarCanvas || this.lastTaskProgress !== progress) {
            this.lastTaskProgress = progress;

            // Create offscreen canvas to edit sprite pixels
            this.taskbarCanvas = document.createElement('canvas');
            this.taskbarCanvas.width = srcW;
            this.taskbarCanvas.height = srcH;
            const offCtx = this.taskbarCanvas.getContext('2d');

            // Draw the taskbar sprite
            offCtx.drawImage(taskbarTexture, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

            // Get image data to edit pixels directly
            const imageData = offCtx.getImageData(0, 0, srcW, srcH);
            const data = imageData.data;

            // Calculate how far the fill should extend
            const fillWidth = Math.round((fillEndX - fillStartX) * progress);

            // Brighten green pixels in the fill area based on progress
            for (let y = fillY; y < fillY + fillH; y++) {
                for (let x = fillStartX; x < fillStartX + fillWidth; x++) {
                    const idx = (y * srcW + x) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = data[idx + 3];

                    // Only brighten pixels that are green-ish (g > r and g > b)
                    if (a > 0 && g > r && g > b) {
                        // Brighten the green channel, slightly reduce red/blue
                        data[idx] = Math.min(255, r + 40);      // R - slight increase
                        data[idx + 1] = Math.min(255, g + 80);  // G - big increase
                        data[idx + 2] = Math.min(255, b + 40);  // B - slight increase
                    }
                }
            }

            offCtx.putImageData(imageData, 0, 0);
        }

        // Draw the modified taskbar
        ctx.drawImage(this.taskbarCanvas, 0, 0, srcW, srcH, drawX, drawY, drawW, drawH);

        // Draw task list below the taskbar
        this.drawTaskList(ctx, drawX, drawY + drawH + 5);
    }

    drawTaskList(ctx, startX, startY) {
        const panelTexture = assetLoader?.getTexture('task_panel');
        if (!panelTexture) return;

        // Panel sprite coordinates (from kickban.png)
        const srcX = 1;
        const srcY = 0;
        const srcW = 250;
        const srcH = 204;

        // Build task list with grouping
        const taskGroups = [];

        // Count wires tasks (group as "Fix Wiring")
        const wiresTasks = this.tasks.filter(t => t.name === 'Fix Wiring');
        const wiresCompleted = wiresTasks.filter(t => t.completed).length;
        const wiresTotal = wiresTasks.length;
        if (wiresTotal > 0) {
            taskGroups.push({
                name: 'Fix Wiring',
                completed: wiresCompleted,
                total: wiresTotal,
                allDone: wiresCompleted >= wiresTotal
            });
        }

        // Group Divert Power tasks by target room (each is a 2-step task)
        const divertTasks = this.tasks.filter(t => t.name === 'Divert Power');
        for (const divert of divertTasks) {
            const receive = divert.receiveTask;
            const stepsCompleted = (divert.completed ? 1 : 0) + (receive && receive.completed ? 1 : 0);
            taskGroups.push({
                name: `Divert Power (${divert.targetRoom})`,
                completed: stepsCompleted,
                total: 2,
                allDone: stepsCompleted >= 2
            });
        }

        // Single tasks (MedScan, etc.) - no count shown
        const singleTasks = this.tasks.filter(t =>
            t.name !== 'Fix Wiring' &&
            t.name !== 'Divert Power' &&
            t.name !== 'Accept Diverted Power'
        );
        for (const task of singleTasks) {
            taskGroups.push({
                name: task.name,
                completed: task.completed ? 1 : 1,
                total: 1,
                allDone: task.completed
            });
        }

        // Calculate panel size based on task count
        const lineHeight = 18;
        const padding = 12;
        const headerHeight = 25;
        const contentHeight = taskGroups.length * lineHeight + padding * 2 + headerHeight;

        // Scale panel to fit content
        const panelScale = 0.9;
        const panelW = srcW * panelScale;
        const panelH = Math.max(srcH * panelScale * 0.5, contentHeight);

        // Draw panel background (stretched to fit)
        ctx.globalAlpha = 0.85;
        ctx.drawImage(panelTexture, srcX, srcY, srcW, srcH, startX, startY, panelW, panelH);
        ctx.globalAlpha = 1.0;

        // Draw header "Tasks"
        ctx.font = 'bold 14px "Varela Round", Varela, Arial';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('Tasks', startX + padding, startY + padding + 12);

        // Draw each task entry
        let y = startY + padding + headerHeight;
        ctx.font = '600 12px "Varela Round", Varela, Arial';

        for (const group of taskGroups) {
            // Task name
            let displayText = group.name;

            // Add count for multi-step tasks (but not for single tasks)
            if (group.total > 1) {
                displayText += ` (${group.completed}/${group.total})`;
            }

            // White for incomplete, green for completed
            if (group.allDone) {
                ctx.fillStyle = '#00FF00'; // Green for completed
            } else {
                ctx.fillStyle = '#FFFFFF'; // White for incomplete
            }
            ctx.fillText(displayText, startX + padding, y);

            y += lineHeight;
        }
    }

    // Unified action button drawing - stacks buttons in bottom right
    // Max 2 per column, USE/ADMIN always rightmost
    drawActionButtons(ctx) {
        const buttonsTexture = assetLoader?.getTexture('buttons');
        const imposterTexture = assetLoader?.getTexture('imposter_buttons');

        // Button sprite definitions
        const buttonSprites = {
            use: { texture: 'buttons', x: 1147, y: 112, w: 113, h: 141 },
            admin: { texture: 'buttons', x: 940, y: 1, w: 116, h: 117 },
            kill: { texture: 'imposter', x: 920, y: 116, w: 115, h: 125 },
            vent: { texture: 'imposter', x: 1238, y: 1, w: 124, h: 108 },
            sabotage: { texture: 'imposter', x: 470, y: 0, w: 120, h: 122 },
            report: { texture: 'imposter', x: 584, y: 7, w: 125, h: 115 }
        };

        // Collect visible buttons (order matters - rightmost first)
        const visibleButtons = [];

        // Check for USE/ADMIN button (rightmost) - ALWAYS visible, grayed when nothing to use
        const nearTask = this.getNearbyTask();
        const nearAdminTable = this.isNearAdminTable();
        const nearEmergency = (() => {
            const dx = this.localPlayer.x - this.emergencyButtonPos.x;
            const dy = this.localPlayer.y - this.emergencyButtonPos.y;
            return Math.sqrt(dx * dx + dy * dy) < this.emergencyButtonRadius * 2;
        })();

        if (nearTask && !nearTask.completed) {
            visibleButtons.push({ type: 'use', label: nearTask.name, disabled: false });
        } else if (nearAdminTable) {
            visibleButtons.push({ type: 'admin', label: null, disabled: false });
        } else if (nearEmergency) {
            visibleButtons.push({ type: 'use', label: null, disabled: false });
        } else {
            // Always show USE button, grayed out when nothing to use
            visibleButtons.push({ type: 'use', label: null, disabled: true });
        }

        // Impostor buttons - ALWAYS visible when impostor
        if (this.localPlayer.isImpostor) {
            const killDisabled = !this.isKillTargetInRange();
            const ventDisabled = !this.isNearVent() && !this.localPlayer.inVent;
            visibleButtons.push({ type: 'kill', cooldown: this.killCooldown, cooldownMax: this.killCooldownMax, disabled: killDisabled });
            visibleButtons.push({ type: 'vent', cooldown: this.ventCooldown, cooldownMax: this.ventCooldownMax, disabled: ventDisabled });
            visibleButtons.push({ type: 'sabotage' });
        }

        // Report button - ALWAYS visible, grayed if no body nearby
        const reportDisabled = !this.isNearDeadBody();
        visibleButtons.push({ type: 'report', disabled: reportDisabled });

        if (visibleButtons.length === 0) return;

        // Layout: columns from right to left, max 2 buttons per column
        const scale = 0.9;
        const padding = 10;
        const columnGap = 10;
        const rowGap = 8;

        // Clear hitboxes
        this.killButtonHitbox = null;
        this.ventButtonHitbox = null;
        this.sabotageButtonHitbox = null;
        this.reportButtonHitbox = null;
        this.useButtonHitbox = null;
        this.adminButtonHitbox = null;

        // Calculate column positions (right to left)
        let currentX = this.width - padding;
        let columnIndex = 0;

        for (let i = 0; i < visibleButtons.length; i += 2) {
            const column = visibleButtons.slice(i, i + 2);

            // Find max width in this column
            let maxWidth = 0;
            for (const btn of column) {
                const sprite = buttonSprites[btn.type];
                maxWidth = Math.max(maxWidth, sprite.w * scale);
            }

            // Draw buttons in column (bottom to top)
            let currentY = this.height - padding;
            for (let j = 0; j < column.length; j++) {
                const btn = column[j];
                const sprite = buttonSprites[btn.type];
                const texture = sprite.texture === 'buttons' ? buttonsTexture : imposterTexture;
                if (!texture) continue;

                const btnW = sprite.w * scale;
                const btnH = sprite.h * scale;
                const btnX = currentX - maxWidth + (maxWidth - btnW) / 2; // Center in column
                const btnY = currentY - btnH;

                // Draw button (with cooldown or disabled state if applicable)
                if (btn.cooldown !== undefined && btn.cooldown > 0) {
                    // Cooldown animation (same as sabotage map buttons - progressive fill from right)
                    const cooldownProgress = 1 - (btn.cooldown / btn.cooldownMax);
                    ctx.save();
                    ctx.filter = 'grayscale(100%)';
                    ctx.drawImage(texture, sprite.x, sprite.y, sprite.w, sprite.h, btnX, btnY, btnW, btnH);
                    ctx.filter = 'none';
                    ctx.beginPath();
                    const coloredWidth = btnW * cooldownProgress;
                    ctx.rect(btnX + btnW - coloredWidth, btnY, coloredWidth, btnH);
                    ctx.clip();
                    ctx.drawImage(texture, sprite.x, sprite.y, sprite.w, sprite.h, btnX, btnY, btnW, btnH);
                    ctx.restore();
                } else if (btn.disabled) {
                    // Fully grayed out when disabled (no target in range / not near vent)
                    ctx.save();
                    ctx.filter = 'grayscale(100%)';
                    ctx.globalAlpha = 0.5;
                    ctx.drawImage(texture, sprite.x, sprite.y, sprite.w, sprite.h, btnX, btnY, btnW, btnH);
                    ctx.restore();
                } else {
                    ctx.drawImage(texture, sprite.x, sprite.y, sprite.w, sprite.h, btnX, btnY, btnW, btnH);
                }

                // Store hitbox
                const hitbox = { x: btnX, y: btnY, w: btnW, h: btnH };
                if (btn.type === 'kill') this.killButtonHitbox = hitbox;
                else if (btn.type === 'vent') this.ventButtonHitbox = hitbox;
                else if (btn.type === 'sabotage') this.sabotageButtonHitbox = hitbox;
                else if (btn.type === 'report') this.reportButtonHitbox = hitbox;
                else if (btn.type === 'use') this.useButtonHitbox = hitbox;
                else if (btn.type === 'admin') this.adminButtonHitbox = hitbox;

                // Draw label if present
                if (btn.label) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = 'bold 14px Arial';
                    ctx.textAlign = 'center';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.strokeText(btn.label, btnX + btnW / 2, btnY - 5);
                    ctx.fillText(btn.label, btnX + btnW / 2, btnY - 5);
                }

                currentY = btnY - rowGap;
            }

            currentX -= maxWidth + columnGap;
            columnIndex++;
        }
    }

    // Check if there's a dead body nearby
    isNearDeadBody() {
        if (!this.localPlayer) return false;
        const reportRange = 150; // pixels

        for (const [id, player] of this.players) {
            if (!player.isDead) continue;
            if (player.deathX === undefined || player.deathY === undefined) continue;

            const dx = player.deathX - this.localPlayer.x;
            const dy = player.deathY - this.localPlayer.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < reportRange) return true;
        }
        return false;
    }

    // Check if there's a valid kill target in range
    isKillTargetInRange() {
        if (!this.localPlayer || !this.localPlayer.isImpostor) return false;

        for (const [id, player] of this.players) {
            if (player === this.localPlayer) continue;
            if (player.isDead) continue;
            if (player.isImpostor) continue;

            const dx = player.x - this.localPlayer.x;
            const dy = player.y - this.localPlayer.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.killRange) return true;
        }
        return false;
    }

    // Check if near a vent
    isNearVent() {
        if (!this.localPlayer || !this.map) return false;
        return this.map.getVentAt(this.localPlayer.x, this.localPlayer.y) !== null;
    }

    // Draw admin table minimap overlay showing player positions by room
    drawAdminMap(ctx) {
        if (!this.minimapImage || !this.minimapImage.complete) return;

        const votingTexture = assetLoader?.getTexture('voting_screen');

        // Semi-transparent dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, this.width, this.height);

        // Scale and center the minimap
        const scale = Math.min(
            (this.width * 0.85) / this.minimapImage.width,
            (this.height * 0.85) / this.minimapImage.height
        );
        const mapW = this.minimapImage.width * scale;
        const mapH = this.minimapImage.height * scale;
        const mapX = (this.width - mapW) / 2;
        const mapY = (this.height - mapH) / 2;

        // Draw the minimap image
        ctx.drawImage(this.minimapImage, mapX, mapY, mapW, mapH);

        // Draw title
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText('ADMIN', this.width / 2, mapY - 15);

        // Hint text
        ctx.font = '14px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText('Press ESC to close', this.width / 2, mapY + mapH + 25);

        // Player icon sprite from voting texture (same as meeting panel)
        const iconSrcX = 367, iconSrcY = 588, iconSrcW = 63, iconSrcH = 52;
        const iconScale = 0.45; // Scale for admin map icons
        const drawW = iconSrcW * iconScale;
        const drawH = iconSrcH * iconScale;

        // Draw player icons in each room
        for (const [roomLabel, players] of Object.entries(this.roomOccupancy)) {
            const center = this.getRoomCenter(roomLabel);
            if (!center) continue;

            // Scale center to screen coordinates
            const screenX = mapX + (center.x * scale);
            const screenY = mapY + (center.y * scale);

            // Draw player icons in a small cluster
            const spacing = drawW + 4;
            const maxPerRow = 5;

            players.forEach((player, i) => {
                const row = Math.floor(i / maxPerRow);
                const col = i % maxPerRow;
                const rowCount = Math.min(players.length - row * maxPerRow, maxPerRow);
                const offsetX = (col - (rowCount - 1) / 2) * spacing;
                const offsetY = row * (drawH + 2);

                const px = screenX + offsetX - drawW / 2;
                const py = screenY + offsetY - drawH / 2;

                // Get player color
                const playerColor = Player.COLORS[player.color % Player.COLORS.length];

                // Draw recolored player sprite (same method as voting panel)
                if (votingTexture) {
                    this.drawRecoloredSprite(ctx, votingTexture,
                        iconSrcX, iconSrcY, iconSrcW, iconSrcH,
                        px, py, drawW, drawH, playerColor);
                } else {
                    // Fallback to colored circle if texture not loaded
                    ctx.beginPath();
                    ctx.arc(screenX + offsetX, screenY + offsetY, 10, 0, Math.PI * 2);
                    ctx.fillStyle = playerColor;
                    ctx.fill();
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            });
        }
    }

    drawSabotageMenu(ctx) {
        const mapTexture = assetLoader?.getTexture('sabotage_map');
        const buttonsTexture = assetLoader?.getTexture('imposter_buttons');
        if (!mapTexture) return;

        // Semi-transparent dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, this.width, this.height);

        // Scale and center the map
        const scale = Math.min(
            (this.width * 0.8) / mapTexture.width,
            (this.height * 0.8) / mapTexture.height
        );
        const mapW = mapTexture.width * scale;
        const mapH = mapTexture.height * scale;
        const mapX = (this.width - mapW) / 2;
        const mapY = (this.height - mapH) / 2;

        // Draw the sabotage map
        ctx.drawImage(mapTexture, mapX, mapY, mapW, mapH);

        // Store map bounds for click detection
        this.sabotageMapBounds = { x: mapX, y: mapY, w: mapW, h: mapH, scale };

        // Draw sabotage buttons from config
        if (buttonsTexture) {
            const btnScale = this.sabotageButtonScale * scale;
            this.sabotageButtonHitboxes = [];

            for (const btn of this.sabotageButtons) {
                const sprite = btn.sprite;
                const btnW = sprite.w * btnScale;
                const btnH = sprite.h * btnScale;
                // Position is relative to map image coordinates, scaled to screen
                const btnX = mapX + (btn.x * scale) - btnW / 2;
                const btnY = mapY + (btn.y * scale) - btnH / 2;

                // Store hitbox for click detection
                this.sabotageButtonHitboxes.push({
                    name: btn.name,
                    x: btnX,
                    y: btnY,
                    w: btnW,
                    h: btnH
                });

                // Calculate cooldown progress (0 = on cooldown, 1 = ready)
                const cooldownProgress = 1 - (this.sabotageCooldown / this.sabotageCooldownMax);

                ctx.save();

                if (this.sabotageCooldown > 0) {
                    // Draw grayscale version first (full button grayed out)
                    ctx.filter = 'grayscale(100%)';
                    ctx.drawImage(
                        buttonsTexture,
                        sprite.x, sprite.y, sprite.w, sprite.h,
                        btnX, btnY, btnW, btnH
                    );
                    ctx.filter = 'none';

                    // Clip to show colored portion from RIGHT side (progress fills from right to left)
                    ctx.beginPath();
                    const coloredWidth = btnW * cooldownProgress;
                    ctx.rect(btnX + btnW - coloredWidth, btnY, coloredWidth, btnH);
                    ctx.clip();

                    // Draw colored version on top (visible only in clipped area)
                    ctx.drawImage(
                        buttonsTexture,
                        sprite.x, sprite.y, sprite.w, sprite.h,
                        btnX, btnY, btnW, btnH
                    );
                } else {
                    // No cooldown - draw normal colored button
                    ctx.drawImage(
                        buttonsTexture,
                        sprite.x, sprite.y, sprite.w, sprite.h,
                        btnX, btnY, btnW, btnH
                    );
                }

                ctx.restore();
            }
        }

    }

    drawMeetingOverlay(ctx) {
        if (this.meetingPhase === 'intro') {
            this.drawMeetingIntro(ctx);
        } else if (this.meetingPhase === 'voting') {
            this.drawVotingScreen(ctx);
        } else if (this.meetingPhase === 'results') {
            this.drawVoteResultsScreen(ctx);
        } else if (this.meetingPhase === 'ejection') {
            this.drawEjectionScreen(ctx);
        }
    }

    drawMeetingIntro(ctx) {
        // Solid black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.width, this.height);

        const centerX = this.width / 2;
        const centerY = this.height / 2;

        // Draw SHHH background (red rays)
        const bgTexture = assetLoader?.getTexture('shh_bg');
        if (bgTexture) {
            const bgScale = 1.2;
            const bgW = bgTexture.width * bgScale;
            const bgH = bgTexture.height * bgScale;
            ctx.drawImage(bgTexture, centerX - bgW / 2, centerY - bgH / 2 - 20, bgW, bgH);
        }

        // Draw shadow under crew
        const shadowTexture = assetLoader?.getTexture('shh_shadow');
        if (shadowTexture) {
            const shadowScale = 1.0;
            const shadowW = shadowTexture.width * shadowScale;
            const shadowH = shadowTexture.height * shadowScale;
            ctx.drawImage(shadowTexture, centerX - shadowW / 2, centerY + 60, shadowW, shadowH);
        }

        // Draw crew member (single crewmate doing shh pose)
        const crewTexture = assetLoader?.getTexture('shh_crew');
        if (crewTexture) {
            const crewScale = 0.8;
            const crewW = crewTexture.width * crewScale;
            const crewH = crewTexture.height * crewScale;
            ctx.drawImage(crewTexture, centerX - crewW / 2, centerY - crewH / 2 + 20, crewW, crewH);
        }

        // Draw hand with finger over visor
        const handTexture = assetLoader?.getTexture('shh_hand');
        if (handTexture) {
            const handScale = 0.8;
            const handW = handTexture.width * handScale;
            const handH = handTexture.height * handScale;
            ctx.drawImage(handTexture, centerX - handW / 2 + 30, centerY - handH / 2 - 30, handW, handH);
        }

        // Draw "SHHHHH!" text
        const textTexture = assetLoader?.getTexture('shh_text');
        if (textTexture) {
            const textScale = 0.9;
            const textW = textTexture.width * textScale;
            const textH = textTexture.height * textScale;
            ctx.drawImage(textTexture, centerX - textW / 2, centerY - 180, textW, textH);
        }
    }

    drawVotingScreen(ctx) {
        const votingTexture = assetLoader?.getTexture('voting_screen');
        const playerSprites = assetLoader?.getTexture('player_sprites');
        if (!votingTexture) {
            ctx.fillStyle = '#1a3a5c';
            ctx.fillRect(0, 0, this.width, this.height);
            return;
        }

        // Draw map as background with grey filter
        this.map.render(ctx, this.camera, assetLoader);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw voting background (iPad) - 95% of original size, centered
        const ipadScale = 0.95;
        const ipadSrcW = 863, ipadSrcH = 577;
        const ipadW = ipadSrcW * ipadScale;
        const ipadH = ipadSrcH * ipadScale;
        const ipadX = (this.width - ipadW) / 2;
        const ipadY = (this.height - ipadH) / 2;
        ctx.drawImage(votingTexture, 3, 2, ipadSrcW, ipadSrcH, ipadX, ipadY, ipadW, ipadH);

        // Draw timer at top center of iPad
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(`Voting ends in: ${Math.ceil(this.meetingTimer)}s`, this.width / 2, ipadY + 35);
        ctx.fillText(`Voting ends in: ${Math.ceil(this.meetingTimer)}s`, this.width / 2, ipadY + 35);

        // Player panel source coordinates
        const panelSrcX = 16, panelSrcY = 829, panelSrcW = 372, panelSrcH = 67;
        const checkSrcX = 476, checkSrcY = 979, checkSrcW = 61, checkSrcH = 58;
        const votedBadgeSrcX = 619, votedBadgeSrcY = 928, votedBadgeSrcW = 41, votedBadgeSrcH = 39;

        // Layout: 2 columns, up to 5 rows for actual players only
        const cols = 2;
        const panelScale = 0.7;
        const panelWidth = panelSrcW * panelScale;
        const panelHeight = panelSrcH * panelScale;
        const marginX = 30;
        const marginY = 8;

        // Center the panel grid within the iPad
        const playersArray = Array.from(this.players.entries());
        const numPlayers = playersArray.length;
        const gridWidth = cols * panelWidth + (cols - 1) * marginX;

        const startX = ipadX + (ipadW - gridWidth) / 2;
        const startY = ipadY + 55;

        // Reset vote buttons array
        this.voteButtons = [];

        // Draw panels ONLY for actual players
        for (let i = 0; i < numPlayers; i++) {
            const [id, player] = playersArray[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (panelWidth + marginX);
            const y = startY + row * (panelHeight + marginY);

            // Draw player panel background
            ctx.drawImage(votingTexture, panelSrcX, panelSrcY, panelSrcW, panelSrcH,
                          x, y, panelWidth, panelHeight);

            // Draw small player icon from voting texture - recolored to player color
            const iconSrcX = 367, iconSrcY = 588, iconSrcW = 63, iconSrcH = 52;
            const iconScale = 0.65;
            const drawX = x + 8;
            const drawY = y + (panelHeight - iconSrcH * iconScale) / 2;
            const drawW = iconSrcW * iconScale;
            const drawH = iconSrcH * iconScale;

            // Get player color
            const playerColor = Player.COLORS[player.color % Player.COLORS.length];

            // Draw recolored sprite from voting texture
            this.drawRecoloredSprite(ctx, votingTexture,
                iconSrcX, iconSrcY, iconSrcW, iconSrcH,
                drawX, drawY, drawW, drawH, playerColor);

            // Draw player name
            ctx.fillStyle = player.isDead ? '#888888' : '#FFFFFF';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            const displayName = this.truncateVotingName(player.name);
            ctx.strokeText(displayName, x + drawW + 12, y + panelHeight / 2 + 5);
            ctx.fillText(displayName, x + drawW + 12, y + panelHeight / 2 + 5);

            // Draw vote checkmark button ONLY if local player hasn't voted yet and isn't a ghost
            if (!player.isDead && this.localPlayer && !this.localPlayer.hasVoted && !this.localPlayer.isDead) {
                const checkScale = 0.55;
                const checkX = x + panelWidth - checkSrcW * checkScale - 8;
                const checkY = y + (panelHeight - checkSrcH * checkScale) / 2;
                ctx.drawImage(votingTexture, checkSrcX, checkSrcY, checkSrcW, checkSrcH,
                              checkX, checkY, checkSrcW * checkScale, checkSrcH * checkScale);

                // Store clickable area for voting
                this.voteButtons.push({ x: checkX, y: checkY, w: checkSrcW * checkScale, h: checkSrcH * checkScale, playerId: id });
            }

            // Draw "I Voted" badge ONLY if this player has actually voted
            if (player.hasVoted === true) {
                const badgeScale = 0.6;
                ctx.drawImage(votingTexture, votedBadgeSrcX, votedBadgeSrcY, votedBadgeSrcW, votedBadgeSrcH,
                              x + panelWidth - votedBadgeSrcW * badgeScale - 5, y + 3,
                              votedBadgeSrcW * badgeScale, votedBadgeSrcH * badgeScale);
            }
        }

        // Draw Skip Vote button at bottom center of iPad (only for living players)
        const isLocalGhost = this.localPlayer && this.localPlayer.isDead;
        if (!isLocalGhost) {
            const skipSrcX = 609, skipSrcY = 1059, skipSrcW = 123, skipSrcH = 30;
            const skipScale = 0.8;
            const skipX = this.width / 2 - (skipSrcW * skipScale) / 2;
            const skipY = ipadY + ipadH - 45;
            ctx.drawImage(votingTexture, skipSrcX, skipSrcY, skipSrcW, skipSrcH,
                          skipX, skipY, skipSrcW * skipScale, skipSrcH * skipScale);
            this.skipVoteButton = { x: skipX, y: skipY, w: skipSrcW * skipScale, h: skipSrcH * skipScale };
        } else {
            // Clear skip button hitbox for ghosts
            this.skipVoteButton = null;
        }

        // Draw Chat icon at top right of iPad
        const chatIconSrcX = 384, chatIconSrcY = 1025, chatIconSrcW = 55, chatIconSrcH = 64;
        const chatIconScale = 0.5;
        const chatIconX = ipadX + ipadW - chatIconSrcW * chatIconScale - 60;
        const chatIconY = ipadY + 10;
        ctx.drawImage(votingTexture, chatIconSrcX, chatIconSrcY, chatIconSrcW, chatIconSrcH,
                      chatIconX, chatIconY, chatIconSrcW * chatIconScale, chatIconSrcH * chatIconScale);
        this.chatIconButton = { x: chatIconX, y: chatIconY, w: chatIconSrcW * chatIconScale, h: chatIconSrcH * chatIconScale };

        // Draw chat window ONLY if explicitly opened by clicking the icon
        if (this.chatOpen === true) {
            this.drawChatWindow(ctx, votingTexture);
        }
    }

    // Truncate name for voting screen display
    truncateVotingName(name) {
        if (!name || name.length <= 8) return name;
        return name.slice(0, 4) + '..' + name.slice(-2);
    }

    // Recolor a red sprite to a different color using canvas compositing
    drawRecoloredSprite(ctx, img, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH, color) {
        // Create offscreen canvas for recoloring
        if (!this.recolorCanvas) {
            this.recolorCanvas = document.createElement('canvas');
            this.recolorCtx = this.recolorCanvas.getContext('2d', { willReadFrequently: true });
        }

        const canvas = this.recolorCanvas;
        const rctx = this.recolorCtx;

        canvas.width = srcW;
        canvas.height = srcH;

        // Draw original sprite
        rctx.clearRect(0, 0, srcW, srcH);
        rctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

        // Get image data and replace red with player color
        const imageData = rctx.getImageData(0, 0, srcW, srcH);
        const data = imageData.data;

        // Parse player color (hex to RGB)
        const bodyColor = this.hexToRgb(color.body);
        const shadowColor = this.hexToRgb(color.shadow);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a === 0) continue; // Skip transparent pixels

            // Check if pixel is red-ish (body color in original sprite)
            // Red body: ~197, 17, 17 or similar
            if (r > 150 && g < 80 && b < 80) {
                // Replace with player body color
                data[i] = bodyColor.r;
                data[i + 1] = bodyColor.g;
                data[i + 2] = bodyColor.b;
            }
            // Check if pixel is dark blue (shadow in original sprite)
            // Blue shadow: ~18, 44, 209 or similar
            else if (b > 150 && r < 80 && g < 80) {
                // Replace with player shadow color
                data[i] = shadowColor.r;
                data[i + 1] = shadowColor.g;
                data[i + 2] = shadowColor.b;
            }
            // Check if pixel is green-ish (visor) - make it tinted gray/blue
            else if (g > 150 && r < 100 && b < 150) {
                // Visor color - tinted gray/blue like Among Us
                data[i] = 137;     // R
                data[i + 1] = 207; // G
                data[i + 2] = 240; // B (light blue/cyan tint)
            }
        }

        rctx.putImageData(imageData, 0, 0);

        // Draw recolored sprite to main canvas
        ctx.drawImage(canvas, 0, 0, srcW, srcH, dstX, dstY, dstW, dstH);
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    drawChatWindow(ctx, votingTexture) {
        // Chat background - positioned at top right
        const chatBgSrcX = 737, chatBgSrcY = 1095, chatBgSrcW = 650, chatBgSrcH = 504;
        const chatW = 320;
        const chatH = 380;
        const chatX = this.width - chatW - 20;
        const chatY = 70;
        ctx.drawImage(votingTexture, chatBgSrcX, chatBgSrcY, chatBgSrcW, chatBgSrcH,
                      chatX, chatY, chatW, chatH);

        // Chat input box at bottom
        const inputSrcX = 739, inputSrcY = 1038, inputSrcW = 611, inputSrcH = 53;
        ctx.drawImage(votingTexture, inputSrcX, inputSrcY, inputSrcW, inputSrcH,
                      chatX + 10, chatY + chatH - 50, chatW - 70, 40);

        // Send button
        const sendSrcX = 363, sendSrcY = 635, sendSrcW = 69, sendSrcH = 45;
        ctx.drawImage(votingTexture, sendSrcX, sendSrcY, sendSrcW, sendSrcH,
                      chatX + chatW - 55, chatY + chatH - 48, 45, 35);

        // Store chat input area for click detection
        this.chatInputBox = { x: chatX + 10, y: chatY + chatH - 50, w: chatW - 70, h: 40 };
        this.chatSendButton = { x: chatX + chatW - 55, y: chatY + chatH - 48, w: 45, h: 35 };

        // Draw chat messages
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        const messageY = chatY + 30;
        if (this.chatMessages && this.chatMessages.length > 0) {
            for (let i = 0; i < Math.min(this.chatMessages.length, 12); i++) {
                const msg = this.chatMessages[i];
                ctx.fillText(`${msg.name}: ${msg.text}`, chatX + 15, messageY + i * 25);
            }
        }

        // Draw current input text
        if (this.chatInput) {
            ctx.fillStyle = '#000000';
            ctx.fillText(this.chatInput, chatX + 20, chatY + chatH - 25);
        }
    }

    // Draw vote results screen - shows who voted for whom
    drawVoteResultsScreen(ctx) {
        const votingTexture = assetLoader?.getTexture('voting_screen');
        if (!votingTexture) {
            ctx.fillStyle = '#1a3a5c';
            ctx.fillRect(0, 0, this.width, this.height);
            return;
        }

        // Draw map as background with grey filter
        this.map.render(ctx, this.camera, assetLoader);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw voting background (iPad)
        const ipadScale = 0.95;
        const ipadSrcW = 863, ipadSrcH = 577;
        const ipadW = ipadSrcW * ipadScale;
        const ipadH = ipadSrcH * ipadScale;
        const ipadX = (this.width - ipadW) / 2;
        const ipadY = (this.height - ipadH) / 2;
        ctx.drawImage(votingTexture, 3, 2, ipadSrcW, ipadSrcH, ipadX, ipadY, ipadW, ipadH);

        // Draw "Voting Results" header
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        const headerText = this.wasTie ? 'No one was ejected. (Tie)' :
                          (this.ejectedPlayer ? `${this.ejectedPlayer.name} was ejected.` : 'No one was ejected. (Skipped)');
        ctx.strokeText(headerText, this.width / 2, ipadY + 35);
        ctx.fillText(headerText, this.width / 2, ipadY + 35);

        // Layout for player panels
        const panelSrcX = 16, panelSrcY = 829, panelSrcW = 372, panelSrcH = 67;
        const cols = 2;
        const panelScale = 0.7;
        const panelWidth = panelSrcW * panelScale;
        const panelHeight = panelSrcH * panelScale;
        const marginX = 30;
        const marginY = 8;

        const playersArray = Array.from(this.players.entries());
        const numPlayers = playersArray.length;
        const gridWidth = cols * panelWidth + (cols - 1) * marginX;
        const startX = ipadX + (ipadW - gridWidth) / 2;
        const startY = ipadY + 55;

        // Icon source coordinates
        const iconSrcX = 367, iconSrcY = 588, iconSrcW = 63, iconSrcH = 52;
        const iconScale = 0.65;

        // Build a map of who voted for each player
        const votersForPlayer = new Map(); // targetId -> [voterId, ...]
        const skipVoters = [];
        for (const [voterId, targetId] of this.voteMap) {
            if (targetId === 'skip') {
                skipVoters.push(voterId);
            } else {
                if (!votersForPlayer.has(targetId)) {
                    votersForPlayer.set(targetId, []);
                }
                votersForPlayer.get(targetId).push(voterId);
            }
        }

        // Draw player panels with voter icons below
        for (let i = 0; i < numPlayers; i++) {
            const [id, player] = playersArray[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (panelWidth + marginX);
            const y = startY + row * (panelHeight + marginY + 25); // Extra space for voter icons

            // Draw player panel background
            ctx.drawImage(votingTexture, panelSrcX, panelSrcY, panelSrcW, panelSrcH,
                          x, y, panelWidth, panelHeight);

            // Draw player icon
            const drawX = x + 8;
            const drawY = y + (panelHeight - iconSrcH * iconScale) / 2;
            const drawW = iconSrcW * iconScale;
            const drawH = iconSrcH * iconScale;
            const playerColor = Player.COLORS[player.color % Player.COLORS.length];
            this.drawRecoloredSprite(ctx, votingTexture,
                iconSrcX, iconSrcY, iconSrcW, iconSrcH,
                drawX, drawY, drawW, drawH, playerColor);

            // Draw player name
            ctx.fillStyle = player.isDead ? '#888888' : '#FFFFFF';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            const displayName = this.truncateVotingName(player.name);
            ctx.strokeText(displayName, x + drawW + 12, y + panelHeight / 2 + 5);
            ctx.fillText(displayName, x + drawW + 12, y + panelHeight / 2 + 5);

            // Draw vote count
            const voteCount = player.votesReceived || 0;
            ctx.fillStyle = '#FFFF00';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`${voteCount}`, x + panelWidth - 10, y + panelHeight / 2 + 5);

            // Draw voter icons below this player's panel
            const voters = votersForPlayer.get(id) || [];
            const voterIconScale = 0.35;
            const voterIconW = iconSrcW * voterIconScale;
            const voterIconH = iconSrcH * voterIconScale;
            const voterStartX = x + 5;
            const voterY = y + panelHeight + 2;

            for (let v = 0; v < voters.length; v++) {
                const voter = this.players.get(voters[v]);
                if (voter) {
                    const voterColor = Player.COLORS[voter.color % Player.COLORS.length];
                    this.drawRecoloredSprite(ctx, votingTexture,
                        iconSrcX, iconSrcY, iconSrcW, iconSrcH,
                        voterStartX + v * (voterIconW + 3), voterY, voterIconW, voterIconH, voterColor);
                }
            }
        }

        // Draw skip vote section at bottom with voter icons
        const skipSrcX = 609, skipSrcY = 1059, skipSrcW = 123, skipSrcH = 30;
        const skipScale = 0.8;
        const skipX = this.width / 2 - (skipSrcW * skipScale) / 2;
        const skipY = ipadY + ipadH - 70;
        ctx.drawImage(votingTexture, skipSrcX, skipSrcY, skipSrcW, skipSrcH,
                      skipX, skipY, skipSrcW * skipScale, skipSrcH * skipScale);

        // Draw skip vote count
        ctx.fillStyle = '#FFFF00';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${skipVoters.length}`, this.width / 2, skipY + skipSrcH * skipScale + 15);

        // Draw skip voter icons next to skip button
        const skipVoterIconScale = 0.35;
        const skipVoterIconW = iconSrcW * skipVoterIconScale;
        const skipVoterIconH = iconSrcH * skipVoterIconScale;
        const skipVoterStartX = skipX + skipSrcW * skipScale + 10;
        const skipVoterY = skipY + (skipSrcH * skipScale - skipVoterIconH) / 2;

        for (let v = 0; v < skipVoters.length; v++) {
            const voter = this.players.get(skipVoters[v]);
            if (voter) {
                const voterColor = Player.COLORS[voter.color % Player.COLORS.length];
                this.drawRecoloredSprite(ctx, votingTexture,
                    iconSrcX, iconSrcY, iconSrcW, iconSrcH,
                    skipVoterStartX + v * (skipVoterIconW + 3), skipVoterY, skipVoterIconW, skipVoterIconH, voterColor);
            }
        }
    }

    // Draw ejection screen with star background and floating player
    drawEjectionScreen(ctx) {
        // Draw star background (from main menu)
        const starsBg = assetLoader?.getTexture('stars_bg');
        if (starsBg) {
            // Tile the stars background to fill screen
            const pattern = ctx.createPattern(starsBg, 'repeat');
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, this.width, this.height);
        } else {
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // Draw floating player sprite (if we have an ejected player)
        if (this.ejectedPlayer) {
            const votingTexture = assetLoader?.getTexture('voting_screen');
            if (votingTexture) {
                const iconSrcX = 367, iconSrcY = 588, iconSrcW = 63, iconSrcH = 52;
                const playerScale = 2.0; // Larger sprite for ejection screen
                const drawW = iconSrcW * playerScale;
                const drawH = iconSrcH * playerScale;
                const playerColor = Player.COLORS[this.ejectedPlayer.color % Player.COLORS.length];

                // Draw the floating player
                ctx.save();
                // Add slight rotation for floating effect
                const rotation = Math.sin(Date.now() / 500) * 0.1;
                ctx.translate(this.ejectionPlayerX, this.ejectionPlayerY);
                ctx.rotate(rotation);
                this.drawRecoloredSprite(ctx, votingTexture,
                    iconSrcX, iconSrcY, iconSrcW, iconSrcH,
                    -drawW / 2, -drawH / 2, drawW, drawH, playerColor);
                ctx.restore();
            }
        }

        // Draw typing text at bottom center
        const typedText = this.ejectionText.substring(0, this.ejectionTypedChars);
        if (typedText) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;

            const textY = this.height - 100;
            ctx.strokeText(typedText, this.width / 2, textY);
            ctx.fillText(typedText, this.width / 2, textY);
        }
    }

    startEmergencyMeeting() {
        // Send to server - server will broadcast to all players including us
        if (this.network && this.network.connected) {
            this.network.emergencyMeeting();
        } else {
            // Offline mode - start locally
            this.triggerMeeting('emergency', this.localPlayer?.id);
        }
    }

    // Called when meeting is triggered (either locally or from network)
    triggerMeeting(type, callerId, bodyId = null) {
        this.meetingActive = true;
        this.meetingPhase = 'intro';
        this.meetingTimer = this.introDuration;
        this.meetingType = type;
        this.meetingCallerId = callerId;

        // Reset meeting state
        this.chatOpen = false;
        this.chatMessages = [];
        this.chatInput = '';
        this.voteMap.clear(); // Clear vote tracking
        this.ejectedPlayer = null;
        this.wasTie = false;

        // Reset all player vote states
        for (const [id, player] of this.players) {
            player.hasVoted = false;
            player.votesReceived = 0;
        }

        // Play sound
        if (this.emergencySound) {
            this.emergencySound.currentTime = 0;
            this.emergencySound.play().catch(e => console.log('Audio play failed:', e));
        }

        console.log(`${type.toUpperCase()} MEETING called by ${callerId}!`);
    }

    // Calculate vote results - determine who gets ejected
    calculateVoteResults() {
        // Count votes for each player and skip votes
        const voteCounts = new Map(); // playerId -> vote count
        let skipVotes = 0;

        for (const [voterId, targetId] of this.voteMap) {
            if (targetId === 'skip') {
                skipVotes++;
            } else {
                voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
            }
        }

        // Find the player with most votes
        let maxVotes = skipVotes;
        let ejectedId = null;
        let isTie = false;

        for (const [playerId, count] of voteCounts) {
            if (count > maxVotes) {
                maxVotes = count;
                ejectedId = playerId;
                isTie = false;
            } else if (count === maxVotes && maxVotes > 0) {
                isTie = true;
            }
        }

        // Check for tie with skip votes
        if (ejectedId && skipVotes === maxVotes) {
            isTie = true;
        }

        this.wasTie = isTie;
        this.ejectedPlayer = isTie ? null : this.players.get(ejectedId);

        console.log('Vote results:', {
            voteCounts: Object.fromEntries(voteCounts),
            skipVotes,
            ejectedId,
            isTie
        });
    }

    // Start the ejection screen animation
    startEjectionScreen() {
        if (!this.ejectedPlayer) return;

        // Mark player as dead (becomes ghost)
        this.ejectedPlayer.isDead = true;

        // Build ejection text
        const playerName = this.ejectedPlayer.name;
        const wasImpostor = this.ejectedPlayer.isImpostor;
        this.ejectionText = `${playerName} was ejected. ${playerName} was${wasImpostor ? '' : ' not'} An Impostor.`;
        this.ejectionTypedChars = 0;
        this.ejectionTypingTimer = 0;

        // Initialize floating player position (start from center, float to the right)
        this.ejectionPlayerX = this.width / 2;
        this.ejectionPlayerY = this.height / 2;
        this.ejectionPlayerVelX = 50; // Slow drift to the right
        this.ejectionPlayerVelY = -10; // Slight upward drift

        // Set timer for 2 seconds after typing completes
        this.meetingTimer = 2.0;

        // Play ejection sound (first 4 seconds only)
        this.playEjectionSound();

        console.log('Ejection screen started for:', playerName);

        // Check win conditions after ejection
        this.checkWinConditionsAfterEjection();
    }

    // Check if game should end after ejection
    checkWinConditionsAfterEjection() {
        // Count alive players
        let aliveCrewmates = 0;
        let aliveImpostors = 0;

        for (const [id, player] of this.players) {
            if (!player.isDead) {
                if (player.isImpostor) {
                    aliveImpostors++;
                } else {
                    aliveCrewmates++;
                }
            }
        }

        console.log('Win check - Crewmates:', aliveCrewmates, 'Impostors:', aliveImpostors);

        // All impostors ejected = crewmates win
        if (aliveImpostors === 0) {
            this.pendingGameOver = { winner: 'crewmates' };
            return;
        }

        // Impostors >= crewmates = impostors win
        if (aliveImpostors >= aliveCrewmates) {
            this.pendingGameOver = { winner: 'impostors' };
            return;
        }

        // Game continues
        this.pendingGameOver = null;
    }

    // End meeting and respawn all players
    endMeetingAndRespawn() {
        this.meetingActive = false;
        this.meetingPhase = 'none';

        // Clear dead bodies
        this.deadBodies = [];

        // Respawn all alive players at cafeteria table
        const spawnPoints = this.map.spawnPoints || [this.map.spawnPoint];
        let spawnIndex = 0;

        for (const [id, player] of this.players) {
            if (!player.isDead) {
                const spawn = spawnPoints[spawnIndex % spawnPoints.length];
                player.x = spawn.x;
                player.y = spawn.y;
                spawnIndex++;
            }
        }

        // Reset cooldowns after meeting
        this.killCooldown = this.killCooldownMax;
        this.sabotageCooldown = this.sabotageCooldownMax;

        console.log('Meeting ended, players respawned');

        // Check if game should end
        if (this.pendingGameOver) {
            this.triggerGameOver(this.pendingGameOver.winner);
        }
    }

    // Trigger game over
    triggerGameOver(winner) {
        console.log('Game over:', winner, 'wins!');
        this.state = 'gameover';
        this.gameOverWinner = winner;

        // Build game over data
        const impostorIds = [];
        for (const [id, player] of this.players) {
            if (player.isImpostor) {
                impostorIds.push(id);
            }
        }

        this.gameOverData = {
            winner,
            impostorIds,
            players: Array.from(this.players.values())
        };

        // Stop game ambience
        this.stopAmbience();

        // Determine if local player won
        const localIsImpostor = this.localPlayer && this.localPlayer.isImpostor;
        const crewmatesWon = winner === 'crewmates';
        const localPlayerWon = (crewmatesWon && !localIsImpostor) || (!crewmatesWon && localIsImpostor);

        // Play victory video for winners
        if (localPlayerWon && this.victoryVideo) {
            this.victoryVideo.currentTime = 0;
            this.victoryVideo.play().catch(e => console.warn('Failed to play victory video', e));
        }
    }

    // Network callbacks
    onPlayerJoin(data) {
        if (!this.players.has(data.id)) {
            const player = new Player(data.id, data.x, data.y, data.color, false);
            player.name = data.name || `Player ${data.id}`;
            this.players.set(data.id, player);
            console.log(`Player joined: ${player.name}`);
        }
    }

    onPlayerLeave(id) {
        this.players.delete(id);
        console.log(`Player left: ${id}`);
    }

    onPlayerUpdate(data) {
        const player = this.players.get(data.id);
        if (player && player !== this.localPlayer) {
            // Debug: log moving state changes
            if (player.moving !== data.moving) {
                console.log(`Player ${data.id} moving changed: ${player.moving} -> ${data.moving}`);
            }
            player.deserialize(data);
        }
    }

    onGameStateChange(state) {
        // Don't change state if we're still in menu
        if (this.state === 'menu') {
            console.log(`Ignoring server state ${state} - still in menu`);
            return;
        }
        this.state = state;
        console.log(`Game state changed to: ${state}`);
    }

    onMeetingCalled(data) {
        // Meeting called by another player (or self, echoed back from server)
        console.log('Meeting called:', data);
        this.triggerMeeting(data.type, data.callerId, data.bodyId);
    }

    onPlayerKilled(data) {
        // A player was killed
        const target = this.players.get(data.targetId);
        if (target) {
            target.isDead = true;
            target.deathX = data.x;
            target.deathY = data.y;
            console.log(`Player ${data.targetId} was killed at (${data.x}, ${data.y})`);

            // Play kill sound for all players (synced)
            this.playKillSound();
        }
    }

    // Sabotage triggered by another player (received from server)
    onSabotageTriggered(data) {
        // Don't re-trigger if we're the one who triggered it
        if (data.triggeredBy === this.network?.playerId) return;

        console.log(`Sabotage received from server: ${data.sabotageType}`);

        // Start the sabotage locally
        const type = data.sabotageType;
        if (type === 'reactor' || type === '02') {
            this.startCriticalSabotage(type);
        } else {
            // Handle non-critical sabotages
            switch (type) {
                case 'electrical':
                    console.log('Lights sabotaged (from network)!');
                    // TODO: Reduce vision for crewmates
                    break;
                case 'comms':
                    console.log('Communications disabled (from network)!');
                    break;
                case 'doors':
                    console.log('Doors locked (from network)!');
                    break;
            }
            // Play alarm sound for non-critical sabotages too
            this.playSabotageAlarm();
        }
    }

    // Vent events (only received by other impostors)
    onPlayerVentEnter(data) {
        const player = this.players.get(data.playerId);
        if (player) {
            player.inVent = true;
            console.log(`Player ${data.playerId} entered vent`);
        }
    }

    onPlayerVentExit(data) {
        const player = this.players.get(data.playerId);
        if (player) {
            player.inVent = false;
            player.x = data.x;
            player.y = data.y;
            console.log(`Player ${data.playerId} exited vent at (${data.x}, ${data.y})`);
        }
    }

    // Sound sync - play sound when another player triggers it
    onPlaySound(data) {
        switch (data.sound) {
            case 'kill':
                this.playKillSound();
                break;
            case 'sabotage_alarm':
                this.playSabotageAlarm();
                break;
            case 'meeting':
                if (this.emergencySound) {
                    this.emergencySound.currentTime = 0;
                    this.emergencySound.play().catch(e => {});
                }
                break;
        }
    }

    // Chat message received from another player
    onChatMessage(data) {
        // Don't add our own messages (already added locally)
        if (data.playerId === this.network?.playerId) return;

        this.chatMessages.push({
            name: data.playerName || 'Unknown',
            text: data.message,
            isDead: data.isDead
        });
    }

    // Imposter action: Try to kill nearby crewmate
    tryKill() {
        if (!this.localPlayer || !this.localPlayer.isImpostor) return;

        // Check if on cooldown
        if (this.killCooldown > 0) {
            console.log(`Kill on cooldown: ${this.killCooldown.toFixed(1)}s remaining`);
            return;
        }

        let nearestTarget = null;
        let nearestDist = this.killRange; // 100 pixels = ~1 meter

        for (const [id, player] of this.players) {
            if (player === this.localPlayer) continue;
            if (player.isDead) continue;
            if (player.isImpostor) continue; // Can't kill other imposters

            const dx = player.x - this.localPlayer.x;
            const dy = player.y - this.localPlayer.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < nearestDist) {
                nearestDist = dist;
                nearestTarget = player;
            }
        }

        if (nearestTarget) {
            console.log(`Killed ${nearestTarget.name}!`);
            nearestTarget.isDead = true;
            nearestTarget.deathX = nearestTarget.x;
            nearestTarget.deathY = nearestTarget.y;

            // Play kill sound
            this.playKillSound();

            // Start cooldown
            this.killCooldown = this.killCooldownMax;

            // Send kill event to network
            if (this.network && this.network.connected) {
                this.network.killPlayer(nearestTarget.id);
            }
        } else {
            console.log('No valid target in range');
        }
    }

    // Imposter action: Try to enter/exit vent
    tryVent() {
        if (!this.localPlayer || !this.localPlayer.isImpostor) return;

        // If already in vent, clicking vent button exits
        if (this.localPlayer.inVent) {
            this.exitVent();
            return;
        }

        // Check cooldown for entering
        if (this.ventCooldown > 0) {
            console.log(`Vent on cooldown: ${this.ventCooldown.toFixed(1)}s remaining`);
            return;
        }

        const vent = this.map.getVentAt(this.localPlayer.x, this.localPlayer.y);
        if (vent) {
            this.enterVent(vent);
        } else {
            console.log('No vent nearby');
        }
    }

    // Render vent animation (spawn animation in reverse for enter, normal for exit)
    renderVentAnimation(ctx, player) {
        const spawnFrames = assetLoader?.spawnFrames;
        if (!player.ventAnimation || !spawnFrames || spawnFrames.length === 0) return;

        const totalFrames = spawnFrames.length;
        const animDuration = 0.5; // 0.5 seconds for full animation

        // Calculate which frame to show
        let frameIndex;
        if (player.ventAnimation === 'enter') {
            // Reverse animation (last frame to first) - player disappears
            const progress = Math.min(player.ventAnimTime / animDuration, 1);
            frameIndex = Math.floor((1 - progress) * (totalFrames - 1));
        } else {
            // Normal animation (first frame to last) - player appears
            const progress = Math.min(player.ventAnimTime / animDuration, 1);
            frameIndex = Math.floor(progress * (totalFrames - 1));
        }

        frameIndex = Math.max(0, Math.min(totalFrames - 1, frameIndex));
        const frame = spawnFrames[frameIndex];

        if (frame) {
            // Draw at player position - recolor to player's color
            const screenX = player.x - this.camera.x;
            const screenY = player.y - this.camera.y;
            const scale = 0.4;
            const w = frame.width * scale;
            const h = frame.height * scale;

            // Recolor spawn frame to player's color
            const playerColor = Player.COLORS[player.color] || Player.COLORS[0];
            const coloredFrame = player.recolorSpawnFrame(frame, playerColor);
            ctx.drawImage(coloredFrame, screenX - w / 2, screenY - h / 2, w, h);
        }
    }

    // Enter a vent
    enterVent(vent) {
        // Start vent enter animation
        this.localPlayer.ventAnimation = 'enter';
        this.localPlayer.ventAnimTime = 0;

        // Set up vent state (will be fully in vent when animation completes)
        this.currentVent = vent;
        this.ventTimer = 0;

        // Build vent arrows for connected vents
        this.ventArrows = vent.connections.map(connId => {
            const connVent = this.map.vents.find(v => v.id === connId);
            return connVent ? { vent: connVent, hitbox: null } : null;
        }).filter(v => v !== null);

        console.log(`Entering vent ${vent.id}`);

        // Sync vent enter to other impostors
        if (this.network && this.network.connected) {
            this.network.sendVentEnter(vent.id);
        }
    }

    // Exit current vent (plays spawn animation)
    exitVent() {
        if (!this.localPlayer.inVent || !this.currentVent) return;

        // Start exit animation (spawn animation playing forward)
        this.localPlayer.ventAnimation = 'exit';
        this.localPlayer.ventAnimTime = 0;

        // Start cooldown when exiting vent
        this.ventCooldown = this.ventCooldownMax;

        // Clear vent state but keep inVent true until animation finishes
        const exitVent = this.currentVent;
        this.currentVent = null;
        this.ventTimer = 0;
        this.ventArrows = [];

        console.log(`Exiting vent ${exitVent.id} with animation`);

        // Sync vent exit to other impostors
        if (this.network && this.network.connected) {
            this.network.sendVentExit(exitVent.id, this.localPlayer.x, this.localPlayer.y);
        }
    }

    // Move to a connected vent (via arrow click)
    moveToVent(targetVent) {
        if (!this.localPlayer.inVent) return;

        // Move player position to target vent
        this.localPlayer.x = targetVent.x;
        this.localPlayer.y = targetVent.y;
        this.currentVent = targetVent;

        // Rebuild arrows for new vent's connections
        this.ventArrows = targetVent.connections.map(connId => {
            const connVent = this.map.vents.find(v => v.id === connId);
            return connVent ? { vent: connVent, hitbox: null } : null;
        }).filter(v => v !== null);

        console.log(`Moved to vent ${targetVent.id} in ${targetVent.room}`);

        // Sync to network
        if (this.network && this.network.connected) {
            this.network.sendVentExit(targetVent.id, targetVent.x, targetVent.y);
            this.network.sendVentEnter(targetVent.id);
        }
    }

    // Draw arrows pointing to connected vents when in vent
    drawVentArrows(ctx) {
        if (!this.localPlayer?.inVent || !this.currentVent || this.ventArrows.length === 0) return;

        const arrowTexture = assetLoader?.getTexture('task_arrow');
        if (!arrowTexture) return;

        const centerX = this.width / 2;
        const centerY = this.height / 2;

        for (let i = 0; i < this.ventArrows.length; i++) {
            const arrow = this.ventArrows[i];
            const targetVent = arrow.vent;

            // Calculate angle from current vent to target vent
            const dx = targetVent.x - this.currentVent.x;
            const dy = targetVent.y - this.currentVent.y;
            const angle = Math.atan2(dy, dx);

            // Position arrows around screen center
            const arrowOffset = 100 + i * 30; // Stagger if multiple arrows
            const arrowX = centerX + Math.cos(angle) * arrowOffset;
            const arrowY = centerY + Math.sin(angle) * arrowOffset;
            const arrowSize = 50;

            // Store hitbox for click detection
            arrow.hitbox = {
                x: arrowX - arrowSize / 2,
                y: arrowY - arrowSize / 2,
                w: arrowSize,
                h: arrowSize
            };

            // Draw arrow pointing to connected vent
            ctx.save();
            ctx.translate(arrowX, arrowY);
            ctx.rotate(angle);
            ctx.drawImage(arrowTexture, -arrowSize / 2, -arrowSize / 2, arrowSize, arrowSize);
            ctx.restore();
        }
    }

    // Handle click on vent arrow
    handleVentArrowClick(x, y) {
        if (!this.localPlayer?.inVent) return false;

        for (const arrow of this.ventArrows) {
            if (!arrow.hitbox) continue;
            const h = arrow.hitbox;
            if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
                this.moveToVent(arrow.vent);
                return true;
            }
        }
        return false;
    }

    // Draw vent timer showing time until auto-eject
    drawVentTimer(ctx) {
        if (!this.localPlayer?.inVent) return;

        const timeLeft = Math.ceil(this.ventAutoEjectTime - this.ventTimer);
        const centerX = this.width / 2;
        const centerY = this.height / 2;

        // Semi-transparent background
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(centerX - 60, centerY - 60, 120, 50);

        // Timer text
        ctx.fillStyle = timeLeft <= 3 ? '#ff4444' : '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${timeLeft}s`, centerX, centerY - 40);

        // "IN VENT" label
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('IN VENT', centerX, centerY - 55);

        // Hint text
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '11px Arial';
        ctx.fillText('Click arrow or VENT to exit', centerX, centerY - 20);

        ctx.restore();
    }

    // Try to report a dead body
    tryReportBody() {
        if (!this.localPlayer) return;

        const reportRange = 150;

        for (const [id, player] of this.players) {
            if (!player.isDead) continue;
            if (player.deathX === undefined) continue;

            const dx = player.deathX - this.localPlayer.x;
            const dy = player.deathY - this.localPlayer.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < reportRange) {
                console.log(`Reporting body of ${player.name}!`);
                // Send body report to server
                if (this.network && this.network.connected) {
                    this.network.reportBody(player.id);
                } else {
                    // Offline mode
                    this.triggerMeeting('body', this.localPlayer?.id, player.id);
                }
                return;
            }
        }
        console.log('No body nearby to report');
    }

    // Handle clicks on the sabotage menu
    handleSabotageMenuClick(x, y) {
        if (!this.sabotageMapBounds) {
            this.sabotageMenuOpen = false;
            return;
        }

        const { x: mapX, y: mapY, w: mapW, h: mapH } = this.sabotageMapBounds;

        // Check if clicked outside the map - close menu
        if (x < mapX || x > mapX + mapW || y < mapY || y > mapY + mapH) {
            this.sabotageMenuOpen = false;
            return;
        }

        // Check sabotage button hitboxes
        if (this.sabotageButtonHitboxes && this.sabotageCooldown <= 0) {
            for (const btn of this.sabotageButtonHitboxes) {
                if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                    console.log(`Sabotage triggered: ${btn.name}`);
                    this.triggerSabotage(btn.name);
                    // Start cooldown for ALL buttons
                    this.sabotageCooldown = this.sabotageCooldownMax;
                    this.sabotageMenuOpen = false;
                    return;
                }
            }
        }
    }

    // Load sabotage alarm sound
    loadSabotageAlarmSound() {
        try {
            this.sabotageAlarmSound = new Audio('/assets/sounds/sabotage_alarm.ogg');
            this.sabotageAlarmSound.loop = true;
            this.sabotageAlarmSound.volume = 0.6;
            console.log('Sabotage alarm sound loaded');
        } catch (e) {
            console.warn('Failed to load sabotage alarm sound', e);
        }
    }

    // Play sabotage alarm sound
    playSabotageAlarm() {
        if (this.sabotageAlarmSound) {
            this.sabotageAlarmSound.currentTime = 0;
            this.sabotageAlarmSound.play().catch(e => console.log('Sabotage alarm play failed:', e));
        }
    }

    // Load kill sound
    loadKillSound() {
        try {
            this.killSound = new Audio('/assets/sounds/Kill_Alien.ogg');
            this.killSound.volume = 0.8;
            console.log('Kill sound loaded');
        } catch (e) {
            console.warn('Failed to load kill sound', e);
        }
    }

    // Play kill sound
    playKillSound() {
        if (this.killSound) {
            this.killSound.currentTime = 0;
            this.killSound.play().catch(e => console.warn('Kill sound play failed', e));
        }
    }

    // Load ejection sound
    loadEjectionSound() {
        try {
            this.ejectionSound = new Audio('/assets/sounds/ejection.mp3');
            this.ejectionSound.volume = 0.7;
            console.log('Ejection sound loaded');
        } catch (e) {
            console.warn('Failed to load ejection sound', e);
        }
    }

    // Play ejection sound (only first 4 seconds)
    playEjectionSound() {
        if (this.ejectionSound) {
            this.ejectionSound.currentTime = 0;
            this.ejectionSound.play().catch(e => console.warn('Ejection sound play failed', e));
            // Stop after 4 seconds
            setTimeout(() => {
                if (this.ejectionSound) {
                    this.ejectionSound.pause();
                    this.ejectionSound.currentTime = 0;
                }
            }, 4000);
        }
    }

    // Return to main menu from game over
    returnToMenu() {
        // Stop victory video
        if (this.victoryVideo) {
            this.victoryVideo.pause();
            this.victoryVideo.currentTime = 0;
        }

        // Disconnect from server
        if (this.network) {
            this.network.disconnect();
        }

        // Reset game state
        this.state = 'menu';
        this.gameOverWinner = null;
        this.gameOverData = null;
        this.localPlayer = null;
        this.players.clear();
        this.deadBodies = [];
        this.meetingActive = false;
        this.activeTask = null;
        this.activeSabotage = null;
        this.sabotageMenuOpen = false;
        this.chatMessages = [];
        this.chatInput = '';
        this.chatOpen = false;

        // Reset tasks
        this.tasks = [];
        this.initTasks();

        // Play theme music
        this.playThemeMusic();

        console.log('Returned to main menu');
    }

    // Play again - return to the same lobby
    playAgain() {
        // Stop victory video
        if (this.victoryVideo) {
            this.victoryVideo.pause();
            this.victoryVideo.currentTime = 0;
        }

        // Store room code before reset
        const roomCode = this.network?.currentRoomCode;
        const playerName = this.localPlayer?.name || 'Player';
        const playerColor = this.localPlayer?.color || 0;

        // Reset game state but keep network connection
        this.gameOverWinner = null;
        this.gameOverData = null;
        this.victoryButtons = null;
        this.localPlayer = null;
        this.players.clear();
        this.deadBodies = [];
        this.meetingActive = false;
        this.activeTask = null;
        this.activeSabotage = null;
        this.sabotageMenuOpen = false;
        this.chatMessages = [];
        this.chatInput = '';
        this.chatOpen = false;

        // Reset tasks
        this.tasks = [];
        this.initTasks();

        // Return to game lobby state
        this.state = 'game_lobby';

        // Re-join the same room
        if (this.network && roomCode) {
            this.network.leaveRoom();
            // Rejoin after a brief delay
            setTimeout(() => {
                this.network.joinRoom(roomCode, playerName, playerColor);
            }, 100);
        }

        console.log('Playing again in room:', roomCode);
    }

    // Quit to lobby browser (find game page)
    quitToLobbyBrowser() {
        // Stop victory video
        if (this.victoryVideo) {
            this.victoryVideo.pause();
            this.victoryVideo.currentTime = 0;
        }

        // Leave current room but stay connected
        if (this.network) {
            this.network.leaveRoom();
        }

        // Reset game state
        this.gameOverWinner = null;
        this.gameOverData = null;
        this.victoryButtons = null;
        this.localPlayer = null;
        this.players.clear();
        this.deadBodies = [];
        this.meetingActive = false;
        this.activeTask = null;
        this.activeSabotage = null;
        this.sabotageMenuOpen = false;
        this.chatMessages = [];
        this.chatInput = '';
        this.chatOpen = false;

        // Reset tasks
        this.tasks = [];
        this.initTasks();

        // Go to lobby browser
        this.state = 'lobby_browser';

        // Refresh lobbies list
        if (this.network) {
            this.network.getLobbies();
        }

        console.log('Returned to lobby browser');
    }

    // Trigger a specific sabotage
    triggerSabotage(type) {
        console.log(`Triggering ${type} sabotage!`);

        // Normalize type name for internal use
        const normalizedType = type.toLowerCase() === 'reactor' ? 'reactor' :
                               type.toLowerCase() === 'o2' || type === '02' ? '02' : type.toLowerCase();

        // Critical sabotages (reactor, O2) start a countdown
        if (normalizedType === 'reactor' || normalizedType === '02') {
            this.startCriticalSabotage(normalizedType);
        } else {
            // Non-critical sabotages (lights, comms, doors)
            switch (normalizedType) {
                case 'electrical':
                    console.log('Lights sabotaged!');
                    // TODO: Reduce vision for crewmates
                    break;
                case 'comms':
                    console.log('Communications disabled!');
                    break;
                case 'doors':
                    console.log('Doors locked!');
                    break;
            }
        }

        // Send to network (sync to all players)
        if (this.network && this.network.connected) {
            this.network.sendSabotage(normalizedType);
        }
    }

    // Start a critical sabotage (reactor or O2) with countdown
    startCriticalSabotage(type) {
        if (this.activeSabotage) {
            console.log('Sabotage already active, ignoring');
            return;
        }

        this.activeSabotage = type;
        this.sabotageTimer = this.sabotageTimerMax;

        // Activate the relevant sabotage tasks
        for (const sabotage of this.sabotages) {
            // Reactor panels for reactor sabotage
            if (type === 'reactor' && sabotage.name === 'Stop Reactor Meltdown') {
                sabotage.sabotageActive = true;
                sabotage.completed = false;
                sabotage.showSuccess = false;
            }
            // O2 keypads for O2 sabotage
            if (type === '02' && sabotage.name === 'Enter Code') {
                sabotage.sabotageActive = true;
                sabotage.completed = false;
                sabotage.showSuccess = false;
            }
        }

        // Play alarm sound on loop
        if (this.sabotageAlarmSound) {
            this.sabotageAlarmSound.currentTime = 0;
            this.sabotageAlarmSound.play().catch(e => console.log('Alarm play failed:', e));
        }

        console.log(`Critical sabotage started: ${type} - ${this.sabotageTimerMax} seconds to fix!`);
    }

    // Stop the active sabotage (when fixed by crewmates)
    stopCriticalSabotage() {
        if (!this.activeSabotage) return;

        console.log(`Sabotage ${this.activeSabotage} has been fixed!`);
        this.activeSabotage = null;
        this.sabotageTimer = 0;

        // Stop alarm sound
        if (this.sabotageAlarmSound) {
            this.sabotageAlarmSound.pause();
            this.sabotageAlarmSound.currentTime = 0;
        }
    }

    // Called when sabotage timer runs out - impostors win
    onSabotageTimerExpired() {
        console.log('SABOTAGE TIMER EXPIRED - IMPOSTORS WIN!');
        // TODO: Show impostor win screen
        // For now just log and stop the alarm
        if (this.sabotageAlarmSound) {
            this.sabotageAlarmSound.pause();
            this.sabotageAlarmSound.currentTime = 0;
        }
        this.activeSabotage = null;
        this.sabotageTimer = 0;

        // Trigger impostor victory
        this.gameOver = true;
        this.impostorsWin = true;
    }

    onPlayerVoted(data) {
        // A player voted
        console.log('=== VOTE RECEIVED ===');
        console.log('Voter ID:', data.voterId);
        console.log('Players in map:', [...this.players.keys()]);
        const voter = this.players.get(data.voterId);
        if (voter) {
            voter.hasVoted = true;
            console.log('Voter found, hasVoted set to true for:', voter.name);
        } else {
            console.warn('Voter NOT FOUND in players map!');
        }

        // Track who voted for whom (for showing voter icons)
        this.voteMap.set(data.voterId, data.targetId || 'skip');

        if (data.targetId) {
            const target = this.players.get(data.targetId);
            if (target) {
                target.votesReceived = (target.votesReceived || 0) + 1;
            }
        }
        console.log(`Player ${data.voterId} voted for ${data.targetId || 'skip'}`);
    }

    onGameOver(data) {
        console.log('Game over:', data.winner, 'wins!');
        this.state = 'gameover';
        this.gameOverWinner = data.winner;
        this.gameOverData = data; // Store full data (winner, impostorIds, players)

        // Stop game ambience
        this.stopAmbience();

        // Determine if local player won
        const localIsImpostor = this.localPlayer && this.localPlayer.isImpostor;
        const crewmatesWon = data.winner === 'crewmates';
        const localPlayerWon = (crewmatesWon && !localIsImpostor) || (!crewmatesWon && localIsImpostor);

        // Play victory video for winners
        if (localPlayerWon && this.victoryVideo) {
            this.victoryVideo.currentTime = 0;
            this.victoryVideo.play().catch(e => console.warn('Failed to play victory video', e));
        }
    }

    // Task sync handlers
    onPlayerTaskStart(data) {
        const player = this.players.get(data.playerId);
        if (player && player !== this.localPlayer) {
            player.doingTask = true;
            player.currentTaskName = data.taskName;
            console.log(`${player.name} started task: ${data.taskName}`);
            // Note: MedScan animation starts with separate medscan_start event
        }
    }

    onPlayerTaskComplete(data) {
        const player = this.players.get(data.playerId);
        // Skip if this is our own task completion (we handle that locally)
        if (player && player !== this.localPlayer) {
            player.doingTask = false;
            player.currentTaskName = null;
            console.log(`${player.name} completed task: ${data.taskName}`);

            // Special handling for MedScan completion
            if (data.taskName === 'Submit Scan') {
                player.isScanningMedBay = false;
                player.visible = true; // Show player sprite again
                console.log(`${player.name} finished MedScan`);
            }
        }
    }

    onPlayerTaskCancel(data) {
        const player = this.players.get(data.playerId);
        if (player && player !== this.localPlayer) {
            player.doingTask = false;
            player.currentTaskName = null;

            // If they were doing MedScan, stop the animation
            if (player.isScanningMedBay) {
                player.isScanningMedBay = false;
                player.visible = true;
            }
        }
    }

    // MedScan specific - another player started the scanning animation
    onPlayerMedScanStart(data) {
        console.log('=== onPlayerMedScanStart ===');
        console.log('Data:', data);
        console.log('Players in map:', [...this.players.keys()]);
        const player = this.players.get(data.playerId);
        if (player && player !== this.localPlayer) {
            player.isScanningMedBay = true;
            player.medScanFrame = 0;
            player.medScanTimer = 0;
            player.visible = false; // Hide player sprite during scan
            // Move player to scan position
            player.x = 922;
            player.y = 533;
            console.log(`${player.name} started MedScan animation - isScanningMedBay:`, player.isScanningMedBay);
        } else {
            console.log('Player not found or is local player');
        }
    }

    onPlayerMedScanEnd(data) {
        console.log('=== onPlayerMedScanEnd ===');
        console.log('Data:', data);
        const player = this.players.get(data.playerId);
        if (player && player !== this.localPlayer) {
            player.isScanningMedBay = false;
            player.visible = true; // Show player sprite again
            console.log(`${player.name} finished MedScan animation`);
        } else {
            console.log('Player not found or is local player');
        }
    }

    renderTaskDebug(ctx) {
        // Task area debug shapes
        // Scale factor: 0.25 (map is scaled down)
        const s = 0.25;
        const camera = this.camera;

        // Yellow - Task areas
        ctx.strokeStyle = "#FFFF00";
        ctx.lineWidth = 2;

        // Rectangle at (1850, 661) size 73x46
        ctx.strokeRect(1850 * s - camera.x, 661 * s - camera.y, 73 * s, 46 * s);

        // Rectangle at (2153, 2054) size 68x48
        ctx.strokeRect(2153 * s - camera.x, 2054 * s - camera.y, 68 * s, 48 * s);

        // Line
        ctx.beginPath();
        ctx.moveTo(2497 * s - camera.x, 1684 * s - camera.y);
        ctx.lineTo(2547 * s - camera.x, 1643 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2497 * s - camera.x, 1679 * s - camera.y);
        ctx.lineTo(2489 * s - camera.x, 1730 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2489 * s - camera.x, 1730 * s - camera.y);
        ctx.lineTo(2547 * s - camera.x, 1693 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2547 * s - camera.x, 1693 * s - camera.y);
        ctx.lineTo(2565 * s - camera.x, 1709 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2565 * s - camera.x, 1708 * s - camera.y);
        ctx.lineTo(2550 * s - camera.x, 1746 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2550 * s - camera.x, 1747 * s - camera.y);
        ctx.lineTo(2552 * s - camera.x, 1762 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2553 * s - camera.x, 1762 * s - camera.y);
        ctx.lineTo(2714 * s - camera.x, 1763 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2714 * s - camera.x, 1763 * s - camera.y);
        ctx.lineTo(2719 * s - camera.x, 1747 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2719 * s - camera.x, 1747 * s - camera.y);
        ctx.lineTo(2703 * s - camera.x, 1713 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2703 * s - camera.x, 1713 * s - camera.y);
        ctx.lineTo(2706 * s - camera.x, 1693 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2706 * s - camera.x, 1693 * s - camera.y);
        ctx.lineTo(2785 * s - camera.x, 1741 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2786 * s - camera.x, 1741 * s - camera.y);
        ctx.lineTo(2775 * s - camera.x, 1687 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2775 * s - camera.x, 1687 * s - camera.y);
        ctx.lineTo(2724 * s - camera.x, 1647 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2724 * s - camera.x, 1647 * s - camera.y);
        ctx.lineTo(2712 * s - camera.x, 1638 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2712 * s - camera.x, 1638 * s - camera.y);
        ctx.lineTo(2709 * s - camera.x, 1621 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2709 * s - camera.x, 1621 * s - camera.y);
        ctx.lineTo(2552 * s - camera.x, 1619 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2552 * s - camera.x, 1620 * s - camera.y);
        ctx.lineTo(2547 * s - camera.x, 1639 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2790 * s - camera.x, 1762 * s - camera.y);
        ctx.lineTo(2790 * s - camera.x, 1810 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2790 * s - camera.x, 1810 * s - camera.y);
        ctx.lineTo(2831 * s - camera.x, 1842 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2831 * s - camera.x, 1842 * s - camera.y);
        ctx.lineTo(2834 * s - camera.x, 1791 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(2834 * s - camera.x, 1791 * s - camera.y);
        ctx.lineTo(2794 * s - camera.x, 1760 * s - camera.y);
        ctx.stroke();

        // Rectangle at (1712, 2889) size 72x52
        ctx.strokeRect(1712 * s - camera.x, 2889 * s - camera.y, 72 * s, 52 * s);

        // Rectangle at (1348, 1788) size 76x55
        ctx.strokeRect(1348 * s - camera.x, 1788 * s - camera.y, 76 * s, 55 * s);

        // Rectangle at (1492, 3473) size 98x97
        ctx.strokeRect(1492 * s - camera.x, 3473 * s - camera.y, 98 * s, 97 * s);

        // Line
        ctx.beginPath();
        ctx.moveTo(5119 * s - camera.x, 4250 * s - camera.y);
        ctx.lineTo(5120 * s - camera.x, 4210 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5120 * s - camera.x, 4210 * s - camera.y);
        ctx.lineTo(5137 * s - camera.x, 4210 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5138 * s - camera.x, 4210 * s - camera.y);
        ctx.lineTo(5141 * s - camera.x, 4223 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5141 * s - camera.x, 4223 * s - camera.y);
        ctx.lineTo(5146 * s - camera.x, 4256 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5119 * s - camera.x, 4249 * s - camera.y);
        ctx.lineTo(5116 * s - camera.x, 4259 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5117 * s - camera.x, 4259 * s - camera.y);
        ctx.lineTo(5151 * s - camera.x, 4299 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5146 * s - camera.x, 4255 * s - camera.y);
        ctx.lineTo(5157 * s - camera.x, 4252 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5157 * s - camera.x, 4252 * s - camera.y);
        ctx.lineTo(5157 * s - camera.x, 4300 * s - camera.y);
        ctx.stroke();

        // Rectangle at (4607, 2797) size 69x47
        ctx.strokeRect(4607 * s - camera.x, 2797 * s - camera.y, 69 * s, 47 * s);

        // Rectangle at (5202, 2382) size 70x47
        ctx.strokeRect(5202 * s - camera.x, 2382 * s - camera.y, 70 * s, 47 * s);

        // Rectangle at (5403, 2347) size 73x61
        ctx.strokeRect(5403 * s - camera.x, 2347 * s - camera.y, 73 * s, 61 * s);

        // Line
        ctx.beginPath();
        ctx.moveTo(5963 * s - camera.x, 2864 * s - camera.y);
        ctx.lineTo(5964 * s - camera.x, 2727 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5970 * s - camera.x, 2727 * s - camera.y);
        ctx.lineTo(6039 * s - camera.x, 2733 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6039 * s - camera.x, 2734 * s - camera.y);
        ctx.lineTo(6039 * s - camera.x, 2788 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6040 * s - camera.x, 2788 * s - camera.y);
        ctx.lineTo(6019 * s - camera.x, 2786 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6023 * s - camera.x, 2786 * s - camera.y);
        ctx.lineTo(6020 * s - camera.x, 2878 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6020 * s - camera.x, 2878 * s - camera.y);
        ctx.lineTo(5962 * s - camera.x, 2871 * s - camera.y);
        ctx.stroke();

        // Rectangle at (6121, 2373) size 57x60
        ctx.strokeRect(6121 * s - camera.x, 2373 * s - camera.y, 57 * s, 60 * s);

        // Line
        ctx.beginPath();
        ctx.moveTo(5850 * s - camera.x, 1901 * s - camera.y);
        ctx.lineTo(5894 * s - camera.x, 1859 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5894 * s - camera.x, 1859 * s - camera.y);
        ctx.lineTo(5888 * s - camera.x, 1832 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5888 * s - camera.x, 1832 * s - camera.y);
        ctx.lineTo(5881 * s - camera.x, 1822 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5882 * s - camera.x, 1822 * s - camera.y);
        ctx.lineTo(5894 * s - camera.x, 1814 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5894 * s - camera.x, 1815 * s - camera.y);
        ctx.lineTo(5899 * s - camera.x, 1798 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5899 * s - camera.x, 1798 * s - camera.y);
        ctx.lineTo(5886 * s - camera.x, 1786 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5885 * s - camera.x, 1786 * s - camera.y);
        ctx.lineTo(5872 * s - camera.x, 1793 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5872 * s - camera.x, 1793 * s - camera.y);
        ctx.lineTo(5869 * s - camera.x, 1803 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5869 * s - camera.x, 1803 * s - camera.y);
        ctx.lineTo(5854 * s - camera.x, 1818 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5854 * s - camera.x, 1818 * s - camera.y);
        ctx.lineTo(5837 * s - camera.x, 1827 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5837 * s - camera.x, 1827 * s - camera.y);
        ctx.lineTo(5837 * s - camera.x, 1849 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5837 * s - camera.x, 1848 * s - camera.y);
        ctx.lineTo(5850 * s - camera.x, 1851 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5852 * s - camera.x, 1850 * s - camera.y);
        ctx.lineTo(5852 * s - camera.x, 1858 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5852 * s - camera.x, 1858 * s - camera.y);
        ctx.lineTo(5839 * s - camera.x, 1868 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5842 * s - camera.x, 1868 * s - camera.y);
        ctx.lineTo(5849 * s - camera.x, 1895 * s - camera.y);
        ctx.stroke();

        // Rectangle at (6170, 1734) size 53x58
        ctx.strokeRect(6170 * s - camera.x, 1734 * s - camera.y, 53 * s, 58 * s);

        // Rectangle at (6461, 1671) size 75x55
        ctx.strokeRect(6461 * s - camera.x, 1671 * s - camera.y, 75 * s, 55 * s);

        // Rectangle at (7569, 1908) size 71x51
        ctx.strokeRect(7569 * s - camera.x, 1908 * s - camera.y, 71 * s, 51 * s);

        // Rectangle at (7834, 1666) size 79x55
        ctx.strokeRect(7834 * s - camera.x, 1666 * s - camera.y, 79 * s, 55 * s);

        // Rectangle at (8018, 1665) size 69x56
        ctx.strokeRect(8018 * s - camera.x, 1665 * s - camera.y, 69 * s, 56 * s);

        // Line
        ctx.beginPath();
        ctx.moveTo(8289 * s - camera.x, 2014 * s - camera.y);
        ctx.lineTo(8289 * s - camera.x, 1969 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8289 * s - camera.x, 1969 * s - camera.y);
        ctx.lineTo(8311 * s - camera.x, 1949 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8311 * s - camera.x, 1949 * s - camera.y);
        ctx.lineTo(8426 * s - camera.x, 1964 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8428 * s - camera.x, 1965 * s - camera.y);
        ctx.lineTo(8433 * s - camera.x, 1983 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8292 * s - camera.x, 2010 * s - camera.y);
        ctx.lineTo(8316 * s - camera.x, 2024 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8317 * s - camera.x, 2023 * s - camera.y);
        ctx.lineTo(8334 * s - camera.x, 2066 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8334 * s - camera.x, 2066 * s - camera.y);
        ctx.lineTo(8341 * s - camera.x, 2148 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8343 * s - camera.x, 2148 * s - camera.y);
        ctx.lineTo(8298 * s - camera.x, 2175 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8298 * s - camera.x, 2175 * s - camera.y);
        ctx.lineTo(8310 * s - camera.x, 2210 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8311 * s - camera.x, 2210 * s - camera.y);
        ctx.lineTo(8319 * s - camera.x, 2238 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8323 * s - camera.x, 2243 * s - camera.y);
        ctx.lineTo(8350 * s - camera.x, 2261 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8351 * s - camera.x, 2261 * s - camera.y);
        ctx.lineTo(8433 * s - camera.x, 2197 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8322 * s - camera.x, 2166 * s - camera.y);
        ctx.lineTo(8351 * s - camera.x, 2197 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8352 * s - camera.x, 2195 * s - camera.y);
        ctx.lineTo(8434 * s - camera.x, 2137 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8434 * s - camera.x, 2137 * s - camera.y);
        ctx.lineTo(8430 * s - camera.x, 1981 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8173 * s - camera.x, 2046 * s - camera.y);
        ctx.lineTo(8203 * s - camera.x, 2145 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8204 * s - camera.x, 2145 * s - camera.y);
        ctx.lineTo(8296 * s - camera.x, 2144 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8297 * s - camera.x, 2142 * s - camera.y);
        ctx.lineTo(8314 * s - camera.x, 2069 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8313 * s - camera.x, 2063 * s - camera.y);
        ctx.lineTo(8247 * s - camera.x, 2062 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8247 * s - camera.x, 2059 * s - camera.y);
        ctx.lineTo(8226 * s - camera.x, 1982 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8226 * s - camera.x, 1985 * s - camera.y);
        ctx.lineTo(8204 * s - camera.x, 1983 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8204 * s - camera.x, 1983 * s - camera.y);
        ctx.lineTo(8162 * s - camera.x, 2029 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(8166 * s - camera.x, 2031 * s - camera.y);
        ctx.lineTo(8167 * s - camera.x, 2054 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6503 * s - camera.x, 993 * s - camera.y);
        ctx.lineTo(6507 * s - camera.x, 922 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6508 * s - camera.x, 922 * s - camera.y);
        ctx.lineTo(6504 * s - camera.x, 908 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6504 * s - camera.x, 907 * s - camera.y);
        ctx.lineTo(6521 * s - camera.x, 885 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6521 * s - camera.x, 884 * s - camera.y);
        ctx.lineTo(6539 * s - camera.x, 886 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6539 * s - camera.x, 885 * s - camera.y);
        ctx.lineTo(6588 * s - camera.x, 853 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6589 * s - camera.x, 853 * s - camera.y);
        ctx.lineTo(6650 * s - camera.x, 842 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6651 * s - camera.x, 843 * s - camera.y);
        ctx.lineTo(6715 * s - camera.x, 856 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6718 * s - camera.x, 856 * s - camera.y);
        ctx.lineTo(6737 * s - camera.x, 843 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6737 * s - camera.x, 843 * s - camera.y);
        ctx.lineTo(6763 * s - camera.x, 865 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6764 * s - camera.x, 865 * s - camera.y);
        ctx.lineTo(6767 * s - camera.x, 889 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6769 * s - camera.x, 889 * s - camera.y);
        ctx.lineTo(6797 * s - camera.x, 951 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6797 * s - camera.x, 956 * s - camera.y);
        ctx.lineTo(6815 * s - camera.x, 976 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6820 * s - camera.x, 978 * s - camera.y);
        ctx.lineTo(6824 * s - camera.x, 1015 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6825 * s - camera.x, 1016 * s - camera.y);
        ctx.lineTo(6808 * s - camera.x, 1033 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6808 * s - camera.x, 1033 * s - camera.y);
        ctx.lineTo(6785 * s - camera.x, 1028 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6787 * s - camera.x, 1028 * s - camera.y);
        ctx.lineTo(6761 * s - camera.x, 1054 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6761 * s - camera.x, 1054 * s - camera.y);
        ctx.lineTo(6745 * s - camera.x, 1052 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6745 * s - camera.x, 1052 * s - camera.y);
        ctx.lineTo(6692 * s - camera.x, 1070 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6692 * s - camera.x, 1071 * s - camera.y);
        ctx.lineTo(6634 * s - camera.x, 1077 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6634 * s - camera.x, 1077 * s - camera.y);
        ctx.lineTo(6602 * s - camera.x, 1076 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6602 * s - camera.x, 1076 * s - camera.y);
        ctx.lineTo(6596 * s - camera.x, 1081 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6596 * s - camera.x, 1080 * s - camera.y);
        ctx.lineTo(6562 * s - camera.x, 1067 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6563 * s - camera.x, 1067 * s - camera.y);
        ctx.lineTo(6540 * s - camera.x, 1073 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6544 * s - camera.x, 1075 * s - camera.y);
        ctx.lineTo(6520 * s - camera.x, 1061 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6520 * s - camera.x, 1061 * s - camera.y);
        ctx.lineTo(6524 * s - camera.x, 1037 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6525 * s - camera.x, 1037 * s - camera.y);
        ctx.lineTo(6504 * s - camera.x, 999 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6559 * s - camera.x, 964 * s - camera.y);
        ctx.lineTo(6542 * s - camera.x, 892 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6541 * s - camera.x, 887 * s - camera.y);
        ctx.lineTo(6545 * s - camera.x, 871 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6545 * s - camera.x, 871 * s - camera.y);
        ctx.lineTo(6568 * s - camera.x, 866 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6568 * s - camera.x, 866 * s - camera.y);
        ctx.lineTo(6622 * s - camera.x, 921 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6624 * s - camera.x, 921 * s - camera.y);
        ctx.lineTo(6635 * s - camera.x, 967 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6635 * s - camera.x, 966 * s - camera.y);
        ctx.lineTo(6686 * s - camera.x, 946 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6686 * s - camera.x, 944 * s - camera.y);
        ctx.lineTo(6688 * s - camera.x, 975 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6688 * s - camera.x, 974 * s - camera.y);
        ctx.lineTo(6620 * s - camera.x, 1005 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6621 * s - camera.x, 1005 * s - camera.y);
        ctx.lineTo(6560 * s - camera.x, 965 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6615 * s - camera.x, 903 * s - camera.y);
        ctx.lineTo(6620 * s - camera.x, 900 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6622 * s - camera.x, 900 * s - camera.y);
        ctx.lineTo(6690 * s - camera.x, 940 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6648 * s - camera.x, 833 * s - camera.y);
        ctx.lineTo(6650 * s - camera.x, 703 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6650 * s - camera.x, 699 * s - camera.y);
        ctx.lineTo(6790 * s - camera.x, 760 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6790 * s - camera.x, 760 * s - camera.y);
        ctx.lineTo(6778 * s - camera.x, 891 * s - camera.y);
        ctx.stroke();

        // Rectangle at (6514, 511) size 71x63
        ctx.strokeRect(6514 * s - camera.x, 511 * s - camera.y, 71 * s, 63 * s);

        // Line
        ctx.beginPath();
        ctx.moveTo(5591 * s - camera.x, 373 * s - camera.y);
        ctx.lineTo(5592 * s - camera.x, 316 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5593 * s - camera.x, 318 * s - camera.y);
        ctx.lineTo(5642 * s - camera.x, 361 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5642 * s - camera.x, 361 * s - camera.y);
        ctx.lineTo(5638 * s - camera.x, 417 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5639 * s - camera.x, 417 * s - camera.y);
        ctx.lineTo(5589 * s - camera.x, 380 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5775 * s - camera.x, 556 * s - camera.y);
        ctx.lineTo(5775 * s - camera.x, 529 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5777 * s - camera.x, 529 * s - camera.y);
        ctx.lineTo(5783 * s - camera.x, 521 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5780 * s - camera.x, 519 * s - camera.y);
        ctx.lineTo(5772 * s - camera.x, 505 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5772 * s - camera.x, 504 * s - camera.y);
        ctx.lineTo(5781 * s - camera.x, 496 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5783 * s - camera.x, 496 * s - camera.y);
        ctx.lineTo(5794 * s - camera.x, 505 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5794 * s - camera.x, 504 * s - camera.y);
        ctx.lineTo(5822 * s - camera.x, 529 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5823 * s - camera.x, 530 * s - camera.y);
        ctx.lineTo(5815 * s - camera.x, 549 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5815 * s - camera.x, 549 * s - camera.y);
        ctx.lineTo(5805 * s - camera.x, 552 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5808 * s - camera.x, 552 * s - camera.y);
        ctx.lineTo(5816 * s - camera.x, 567 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5818 * s - camera.x, 567 * s - camera.y);
        ctx.lineTo(5812 * s - camera.x, 592 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5812 * s - camera.x, 593 * s - camera.y);
        ctx.lineTo(5775 * s - camera.x, 562 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(4010 * s - camera.x, 298 * s - camera.y);
        ctx.lineTo(4057 * s - camera.x, 258 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(4063 * s - camera.x, 260 * s - camera.y);
        ctx.lineTo(4064 * s - camera.x, 314 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(4064 * s - camera.x, 315 * s - camera.y);
        ctx.lineTo(4019 * s - camera.x, 359 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(4019 * s - camera.x, 358 * s - camera.y);
        ctx.lineTo(4012 * s - camera.x, 300 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(7023 * s - camera.x, 890 * s - camera.y);
        ctx.lineTo(7027 * s - camera.x, 829 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(7035 * s - camera.x, 831 * s - camera.y);
        ctx.lineTo(7075 * s - camera.x, 874 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(7075 * s - camera.x, 874 * s - camera.y);
        ctx.lineTo(7071 * s - camera.x, 922 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(7071 * s - camera.x, 925 * s - camera.y);
        ctx.lineTo(7023 * s - camera.x, 885 * s - camera.y);
        ctx.stroke();

        // Rectangle at (6884, 3050) size 80x58
        ctx.strokeRect(6884 * s - camera.x, 3050 * s - camera.y, 80 * s, 58 * s);

        // Rectangle at (6064, 3764) size 76x52
        ctx.strokeRect(6064 * s - camera.x, 3764 * s - camera.y, 76 * s, 52 * s);

        // Line
        ctx.beginPath();
        ctx.moveTo(6322 * s - camera.x, 3774 * s - camera.y);
        ctx.lineTo(6318 * s - camera.x, 3710 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6322 * s - camera.x, 3708 * s - camera.y);
        ctx.lineTo(6394 * s - camera.x, 3708 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6322 * s - camera.x, 3774 * s - camera.y);
        ctx.lineTo(6396 * s - camera.x, 3774 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6396 * s - camera.x, 3770 * s - camera.y);
        ctx.lineTo(6392 * s - camera.x, 3708 * s - camera.y);
        ctx.stroke();

        // Rectangle at (5650, 3738) size 76x54
        ctx.strokeRect(5650 * s - camera.x, 3738 * s - camera.y, 76 * s, 54 * s);

        // Line
        ctx.beginPath();
        ctx.moveTo(3508 * s - camera.x, 2212 * s - camera.y);
        ctx.lineTo(3546 * s - camera.x, 2144 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3556 * s - camera.x, 2140 * s - camera.y);
        ctx.lineTo(3574 * s - camera.x, 2162 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3572 * s - camera.x, 2160 * s - camera.y);
        ctx.lineTo(3646 * s - camera.x, 2128 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3656 * s - camera.x, 2108 * s - camera.y);
        ctx.lineTo(3686 * s - camera.x, 2092 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3698 * s - camera.x, 2094 * s - camera.y);
        ctx.lineTo(3718 * s - camera.x, 2128 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3722 * s - camera.x, 2126 * s - camera.y);
        ctx.lineTo(3784 * s - camera.x, 2150 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3790 * s - camera.x, 2150 * s - camera.y);
        ctx.lineTo(3830 * s - camera.x, 2220 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3834 * s - camera.x, 2222 * s - camera.y);
        ctx.lineTo(3804 * s - camera.x, 2238 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3802 * s - camera.x, 2238 * s - camera.y);
        ctx.lineTo(3732 * s - camera.x, 2276 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3728 * s - camera.x, 2274 * s - camera.y);
        ctx.lineTo(3682 * s - camera.x, 2290 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3682 * s - camera.x, 2290 * s - camera.y);
        ctx.lineTo(3644 * s - camera.x, 2276 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3646 * s - camera.x, 2276 * s - camera.y);
        ctx.lineTo(3558 * s - camera.x, 2228 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3560 * s - camera.x, 2228 * s - camera.y);
        ctx.lineTo(3496 * s - camera.x, 2206 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3570 * s - camera.x, 2182 * s - camera.y);
        ctx.lineTo(3612 * s - camera.x, 2224 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3616 * s - camera.x, 2224 * s - camera.y);
        ctx.lineTo(3662 * s - camera.x, 2230 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3664 * s - camera.x, 2228 * s - camera.y);
        ctx.lineTo(3684 * s - camera.x, 2206 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3696 * s - camera.x, 2204 * s - camera.y);
        ctx.lineTo(3710 * s - camera.x, 2226 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3712 * s - camera.x, 2228 * s - camera.y);
        ctx.lineTo(3774 * s - camera.x, 2204 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3828 * s - camera.x, 2024 * s - camera.y);
        ctx.lineTo(3894 * s - camera.x, 2102 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3894 * s - camera.x, 2102 * s - camera.y);
        ctx.lineTo(3956 * s - camera.x, 2092 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3960 * s - camera.x, 2088 * s - camera.y);
        ctx.lineTo(3962 * s - camera.x, 2142 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3960 * s - camera.x, 2140 * s - camera.y);
        ctx.lineTo(3888 * s - camera.x, 2110 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3824 * s - camera.x, 2018 * s - camera.y);
        ctx.lineTo(3868 * s - camera.x, 2012 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3872 * s - camera.x, 2012 * s - camera.y);
        ctx.lineTo(3872 * s - camera.x, 1984 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3872 * s - camera.x, 1980 * s - camera.y);
        ctx.lineTo(3850 * s - camera.x, 1992 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3850 * s - camera.x, 1992 * s - camera.y);
        ctx.lineTo(3802 * s - camera.x, 1984 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3802 * s - camera.x, 1984 * s - camera.y);
        ctx.lineTo(3796 * s - camera.x, 1906 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3796 * s - camera.x, 1906 * s - camera.y);
        ctx.lineTo(3858 * s - camera.x, 1930 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3862 * s - camera.x, 1928 * s - camera.y);
        ctx.lineTo(3882 * s - camera.x, 1918 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3882 * s - camera.x, 1916 * s - camera.y);
        ctx.lineTo(3978 * s - camera.x, 2006 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3978 * s - camera.x, 2000 * s - camera.y);
        ctx.lineTo(3980 * s - camera.x, 2102 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(3980 * s - camera.x, 2102 * s - camera.y);
        ctx.lineTo(3886 * s - camera.x, 2018 * s - camera.y);
        ctx.stroke();

        // Rectangle at (3560, 2610) size 72x48
        ctx.strokeRect(3560 * s - camera.x, 2610 * s - camera.y, 72 * s, 48 * s);

        // Rectangle at (3324, 2538) size 84x52
        ctx.strokeRect(3324 * s - camera.x, 2538 * s - camera.y, 84 * s, 52 * s);

        // Rectangle at (3190, 2534) size 90x62
        ctx.strokeRect(3190 * s - camera.x, 2534 * s - camera.y, 90 * s, 62 * s);

        // Rectangle at (3890, 2548) size 92x108
        ctx.strokeRect(3890 * s - camera.x, 2548 * s - camera.y, 92 * s, 108 * s);

        // Line
        ctx.beginPath();
        ctx.moveTo(4438 * s - camera.x, 3786 * s - camera.y);
        ctx.lineTo(4506 * s - camera.x, 3810 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(4508 * s - camera.x, 3810 * s - camera.y);
        ctx.lineTo(4508 * s - camera.x, 3728 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(4440 * s - camera.x, 3782 * s - camera.y);
        ctx.lineTo(4446 * s - camera.x, 3722 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(4518 * s - camera.x, 3726 * s - camera.y);
        ctx.lineTo(4464 * s - camera.x, 3708 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1486 * s - camera.x, 1284 * s - camera.y);
        ctx.lineTo(1486 * s - camera.x, 1378 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1486 * s - camera.x, 1378 * s - camera.y);
        ctx.lineTo(1590 * s - camera.x, 1378 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1590 * s - camera.x, 1376 * s - camera.y);
        ctx.lineTo(1578 * s - camera.x, 1282 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1578 * s - camera.x, 1282 * s - camera.y);
        ctx.lineTo(1496 * s - camera.x, 1284 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6010 * s - camera.x, 1778 * s - camera.y);
        ctx.lineTo(6016 * s - camera.x, 1860 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6016 * s - camera.x, 1860 * s - camera.y);
        ctx.lineTo(6070 * s - camera.x, 1800 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6070 * s - camera.x, 1800 * s - camera.y);
        ctx.lineTo(6066 * s - camera.x, 1730 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6066 * s - camera.x, 1728 * s - camera.y);
        ctx.lineTo(6008 * s - camera.x, 1774 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5922 * s - camera.x, 1850 * s - camera.y);
        ctx.lineTo(5974 * s - camera.x, 1860 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5974 * s - camera.x, 1858 * s - camera.y);
        ctx.lineTo(6008 * s - camera.x, 1832 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5914 * s - camera.x, 1844 * s - camera.y);
        ctx.lineTo(5938 * s - camera.x, 1780 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5938 * s - camera.x, 1780 * s - camera.y);
        ctx.lineTo(5970 * s - camera.x, 1786 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5972 * s - camera.x, 1786 * s - camera.y);
        ctx.lineTo(6034 * s - camera.x, 1726 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(6034 * s - camera.x, 1726 * s - camera.y);
        ctx.lineTo(6054 * s - camera.x, 1726 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(5976 * s - camera.x, 1784 * s - camera.y);
        ctx.lineTo(6008 * s - camera.x, 1780 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1014 * s - camera.x, 2290 * s - camera.y);
        ctx.lineTo(1024 * s - camera.x, 2234 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1024 * s - camera.x, 2232 * s - camera.y);
        ctx.lineTo(1044 * s - camera.x, 2200 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1044 * s - camera.x, 2200 * s - camera.y);
        ctx.lineTo(1118 * s - camera.x, 2224 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1120 * s - camera.x, 2226 * s - camera.y);
        ctx.lineTo(1094 * s - camera.x, 2262 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1094 * s - camera.x, 2264 * s - camera.y);
        ctx.lineTo(1100 * s - camera.x, 2318 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1102 * s - camera.x, 2318 * s - camera.y);
        ctx.lineTo(1028 * s - camera.x, 2304 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1096 * s - camera.x, 2314 * s - camera.y);
        ctx.lineTo(1122 * s - camera.x, 2284 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(1122 * s - camera.x, 2282 * s - camera.y);
        ctx.lineTo(1120 * s - camera.x, 2232 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(910 * s - camera.x, 1684 * s - camera.y);
        ctx.lineTo(952 * s - camera.x, 1668 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(956 * s - camera.x, 1670 * s - camera.y);
        ctx.lineTo(966 * s - camera.x, 1688 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(934 * s - camera.x, 1700 * s - camera.y);
        ctx.lineTo(966 * s - camera.x, 1688 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(912 * s - camera.x, 1708 * s - camera.y);
        ctx.lineTo(930 * s - camera.x, 1698 * s - camera.y);
        ctx.stroke();

        // Line
        ctx.beginPath();
        ctx.moveTo(916 * s - camera.x, 1710 * s - camera.y);
        ctx.lineTo(910 * s - camera.x, 1682 * s - camera.y);
        ctx.stroke();

        // White - Other areas (vents)
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;

        // Rectangle at (1004, 1778) size 96x72
        ctx.strokeRect(1004 * s - camera.x, 1778 * s - camera.y, 96 * s, 72 * s);

        // Rectangle at (1196, 2474) size 104x78
        ctx.strokeRect(1196 * s - camera.x, 2474 * s - camera.y, 104 * s, 78 * s);

        // Rectangle at (2686, 2476) size 98x76
        ctx.strokeRect(2686 * s - camera.x, 2476 * s - camera.y, 98 * s, 76 * s);

        // Rectangle at (3034, 1968) size 100x92
        ctx.strokeRect(3034 * s - camera.x, 1968 * s - camera.y, 100 * s, 92 * s);

        // Rectangle at (3180, 2668) size 104x78
        ctx.strokeRect(3180 * s - camera.x, 2668 * s - camera.y, 104 * s, 78 * s);

        // Rectangle at (2194, 3680) size 108x80
        ctx.strokeRect(2194 * s - camera.x, 3680 * s - camera.y, 108 * s, 80 * s);

        // Rectangle at (5398, 3014) size 104x78
        ctx.strokeRect(5398 * s - camera.x, 3014 * s - camera.y, 104 * s, 78 * s);

        // Rectangle at (5706, 1272) size 106x80
        ctx.strokeRect(5706 * s - camera.x, 1272 * s - camera.y, 106 * s, 80 * s);

        // Rectangle at (6530, 624) size 100x84
        ctx.strokeRect(6530 * s - camera.x, 624 * s - camera.y, 100 * s, 84 * s);

        // Rectangle at (6630, 2380) size 104x80
        ctx.strokeRect(6630 * s - camera.x, 2380 * s - camera.y, 104 * s, 80 * s);

        // Rectangle at (7822, 1794) size 104x86
        ctx.strokeRect(7822 * s - camera.x, 1794 * s - camera.y, 104 * s, 86 * s);

        // Rectangle at (7828, 2374) size 94x78
        ctx.strokeRect(7828 * s - camera.x, 2374 * s - camera.y, 94 * s, 78 * s);

        // Rectangle at (6656, 3800) size 106x90
        ctx.strokeRect(6656 * s - camera.x, 3800 * s - camera.y, 106 * s, 90 * s);

        // Rectangle at (2188, 768) size 108x84
        ctx.strokeRect(2188 * s - camera.x, 768 * s - camera.y, 108 * s, 84 * s);

        // OLD task-based debug (keep for reference)
        const taskRadius = 100;

        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 1;

        for (const task of this.tasks) {
            const screenX = task.x - camera.x;
            const screenY = task.y - camera.y;

            // Draw green circle around task location
            ctx.beginPath();
            ctx.arc(screenX, screenY, taskRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Draw small X at exact task position
            ctx.beginPath();
            ctx.moveTo(screenX - 10, screenY - 10);
            ctx.lineTo(screenX + 10, screenY + 10);
            ctx.moveTo(screenX + 10, screenY - 10);
            ctx.lineTo(screenX - 10, screenY + 10);
            ctx.stroke();

            // Draw task name
            ctx.fillStyle = '#00FF00';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(task.name, screenX, screenY - taskRadius - 5);

            // Show completed status
            if (task.completed) {
                ctx.fillStyle = '#00FF00';
                ctx.fillText('✓ DONE', screenX, screenY + taskRadius + 15);
            } else if (task.enabled === false) {
                ctx.fillStyle = '#888888';
                ctx.fillText('(disabled)', screenX, screenY + taskRadius + 15);
            }
        }
    }
}
