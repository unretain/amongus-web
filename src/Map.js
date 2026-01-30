// Map class - handles map rendering and collision

export class GameMap {
    constructor(name = 'skeld') {
        this.name = name;
        // Full Skeld map is 8564x4793
        // We use a scale factor to make it playable
        this.scale = 0.25;
        this.width = Math.round(8564 * 0.25);  // ~2141
        this.height = Math.round(4793 * 0.25); // ~1198
        this.loaded = false;

        // Collision mask - image-based collision detection
        this.collisionMask = null;
        this.collisionData = null; // ImageData for pixel checking
        this.collisionCanvas = null;
        this.collisionCtx = null;

        // Collision data (simplified rectangles as fallback)
        this.colliders = [];
        this.vents = [];
        this.tasks = [];

        // Map texture pieces with their positions (will be loaded)
        this.mapPieces = [];

        this.initSkeld();
    }

    // Load collision mask image
    async loadCollisionMask(imagePath) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Create offscreen canvas to read pixel data
                this.collisionCanvas = document.createElement('canvas');
                this.collisionCanvas.width = img.width;
                this.collisionCanvas.height = img.height;
                this.collisionCtx = this.collisionCanvas.getContext('2d');
                this.collisionCtx.drawImage(img, 0, 0);

                // Store the image data for fast pixel access
                this.collisionData = this.collisionCtx.getImageData(0, 0, img.width, img.height);
                this.collisionMask = img;

                console.log(`Collision mask loaded: ${img.width}x${img.height}`);
                resolve(img);
            };
            img.onerror = reject;
            img.src = imagePath;
        });
    }

    // Check if a pixel in the collision mask is blocked (non-black)
    isPixelBlocked(x, y) {
        if (!this.collisionData) return false;

        // Scale coordinates to match collision mask size
        const maskX = Math.floor(x * (this.collisionData.width / this.width));
        const maskY = Math.floor(y * (this.collisionData.height / this.height));

        // Bounds check
        if (maskX < 0 || maskX >= this.collisionData.width ||
            maskY < 0 || maskY >= this.collisionData.height) {
            return true; // Out of bounds = blocked
        }

        // Get pixel data (RGBA)
        const index = (maskY * this.collisionData.width + maskX) * 4;
        const r = this.collisionData.data[index];
        const g = this.collisionData.data[index + 1];
        const b = this.collisionData.data[index + 2];
        const a = this.collisionData.data[index + 3];

        // Black = walkable, white/bright = walls
        if (a < 50) return true; // Transparent = blocked (outside map)
        if (r < 50 && g < 50 && b < 50) return false; // Black/dark = walkable

        return true; // White/bright = blocked (walls)
    }

    initSkeld() {
        // Room positions for 8564x4793 map, scaled by 0.25
        const s = this.scale;

        this.rooms = [
            { name: 'Cafeteria', x: Math.round(4837 * s), y: Math.round(742 * s), width: 400 * s, height: 300 * s },
            { name: 'Weapons', x: Math.round(6838 * s), y: Math.round(904 * s), width: 200 * s, height: 200 * s },
            { name: 'Navigation', x: Math.round(7975 * s), y: Math.round(2110 * s), width: 250 * s, height: 200 * s },
            { name: 'O2', x: Math.round(6168 * s), y: Math.round(1922 * s), width: 200 * s, height: 200 * s },
            { name: 'Admin', x: Math.round(5504 * s), y: Math.round(2706 * s), width: 250 * s, height: 200 * s },
            { name: 'Storage', x: Math.round(4680 * s), y: Math.round(3586 * s), width: 300 * s, height: 250 * s },
            { name: 'Electrical', x: Math.round(3456 * s), y: Math.round(3242 * s), width: 200 * s, height: 200 * s },
            { name: 'Lower Engine', x: Math.round(1928 * s), y: Math.round(3346 * s), width: 200 * s, height: 200 * s },
            { name: 'Security', x: Math.round(2560 * s), y: Math.round(2218 * s), width: 150 * s, height: 150 * s },
            { name: 'Reactor', x: Math.round(1260 * s), y: Math.round(2242 * s), width: 250 * s, height: 250 * s },
            { name: 'Upper Engine', x: Math.round(1910 * s), y: Math.round(1122 * s), width: 200 * s, height: 200 * s },
            { name: 'MedBay', x: Math.round(3338 * s), y: Math.round(1796 * s), width: 200 * s, height: 200 * s },
            { name: 'Shields', x: Math.round(6652 * s), y: Math.round(3494 * s), width: 150 * s, height: 150 * s },
            { name: 'Communications', x: Math.round(5736 * s), y: Math.round(4080 * s), width: 200 * s, height: 150 * s }
        ];

        // Define vent connections (positions from vent editor)
        // Vents in the same group can travel to each other
        this.vents = [
            // Group 1: Admin/Cafeteria area
            { id: 0, x: 554, y: 199, group: 1, connections: [1] },
            { id: 1, x: 259, y: 452, group: 1, connections: [0] },
            // Group 2: Reactor/Engine area
            { id: 2, x: 315, y: 625, group: 2, connections: [3] },
            { id: 3, x: 559, y: 927, group: 2, connections: [2] },
            // Group 3: MedBay/Security/Electrical triangle
            { id: 4, x: 688, y: 631, group: 3, connections: [5, 6] },
            { id: 5, x: 773, y: 501, group: 3, connections: [4, 6] },
            { id: 6, x: 813, y: 675, group: 3, connections: [4, 5] },
            // Group 4: Storage/Shields/Comms/Navigation quad
            { id: 7, x: 1364, y: 756, group: 4, connections: [8, 9, 13] },
            { id: 8, x: 1669, y: 603, group: 4, connections: [7, 9, 13] },
            { id: 9, x: 1676, y: 962, group: 4, connections: [7, 8, 13] },
            { id: 13, x: 1965, y: 604, group: 4, connections: [7, 8, 9] },
            // Group 5: Weapons/O2/Admin upper area
            { id: 10, x: 1441, y: 330, group: 5, connections: [11, 12] },
            { id: 11, x: 1648, y: 160, group: 5, connections: [10, 12] },
            { id: 12, x: 1975, y: 457, group: 5, connections: [10, 11] }
        ];

        // Define walls/collision (simplified outer boundary + room walls)
        this.colliders = this.generateColliders();

        // Spawn points - custom positions around the cafeteria table
        // Coordinates are already at game scale (2141x1198 map), use directly
        this.spawnPoints = [
            { x: 1214, y: 207 },
            { x: 1258, y: 221 },
            { x: 1284, y: 252 },
            { x: 1284, y: 293 },
            { x: 1250, y: 319 },
            { x: 1208, y: 333 },
            { x: 1160, y: 326 },
            { x: 1130, y: 299 },
            { x: 1125, y: 247 },
            { x: 1163, y: 209 }
        ];

        // Default spawn point (first position)
        this.spawnPoint = this.spawnPoints[0];
    }

    generateColliders() {
        // For now, just define the outer boundary
        // Full collision would need pixel-perfect data from the map
        const colliders = [];

        // Outer walls based on map size
        colliders.push({ x: 0, y: 0, width: this.width, height: 20 }); // Top
        colliders.push({ x: 0, y: this.height - 20, width: this.width, height: 20 }); // Bottom
        colliders.push({ x: 0, y: 0, width: 20, height: this.height }); // Left
        colliders.push({ x: this.width - 20, y: 0, width: 20, height: this.height }); // Right

        return colliders;
    }

    checkCollision(x, y, width = 20, height = 20) {
        // If collision mask is loaded, use pixel-based collision
        if (this.collisionData) {
            // Check multiple points around the player's feet area
            const checkPoints = [
                { x: x, y: y },           // Center
                { x: x - width/2, y: y }, // Left
                { x: x + width/2, y: y }, // Right
                { x: x, y: y - height/2 }, // Top
                { x: x, y: y + height/2 }, // Bottom
            ];

            for (const point of checkPoints) {
                if (this.isPixelBlocked(point.x, point.y)) {
                    return true;
                }
            }
            return false;
        }

        // Fallback to rectangle collision
        const playerLeft = x - width / 2;
        const playerRight = x + width / 2;
        const playerTop = y - height / 2;
        const playerBottom = y + height / 2;

        for (const col of this.colliders) {
            if (playerRight > col.x &&
                playerLeft < col.x + col.width &&
                playerBottom > col.y &&
                playerTop < col.y + col.height) {
                return true;
            }
        }
        return false;
    }

    getSpawnPoint(playerIndex = 0) {
        // Return a spawn point based on player index, or random if no index
        if (this.spawnPoints && this.spawnPoints.length > 0) {
            const index = playerIndex % this.spawnPoints.length;
            return { ...this.spawnPoints[index] };
        }
        return { ...this.spawnPoint };
    }

    getRandomSpawnPoint() {
        if (this.spawnPoints && this.spawnPoints.length > 0) {
            const index = Math.floor(Math.random() * this.spawnPoints.length);
            return { ...this.spawnPoints[index] };
        }
        return { ...this.spawnPoint };
    }

    getVentAt(x, y, radius = 50) {
        for (const vent of this.vents) {
            const dx = x - vent.x;
            const dy = y - vent.y;
            if (Math.sqrt(dx * dx + dy * dy) < radius) {
                return vent;
            }
        }
        return null;
    }

    getRoomAt(x, y) {
        for (const room of this.rooms) {
            if (x >= room.x && x <= room.x + room.width &&
                y >= room.y && y <= room.y + room.height) {
                return room.name;
            }
        }
        return 'Hallway';
    }

    render(ctx, camera, assetLoader) {
        // Fill background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Try to draw map texture
        const mapTexture = assetLoader?.getTexture('map_skeld');
        if (mapTexture) {
            // Draw map scaled down by 0.25, offset by camera position
            ctx.drawImage(
                mapTexture,
                -camera.x, -camera.y,
                this.width, this.height
            );
        } else {
            // Fallback: draw room placeholders
            this.drawPlaceholderMap(ctx, camera);
        }

        // Debug: draw colliders
        if (window.DEBUG_COLLIDERS) {
            this.drawColliders(ctx, camera);
        }
    }

    drawPlaceholderMap(ctx, camera) {
        // Draw rooms as colored rectangles
        for (const room of this.rooms) {
            const screenX = room.x - camera.x;
            const screenY = room.y - camera.y;

            // Room floor
            ctx.fillStyle = '#2a2a4a';
            ctx.fillRect(screenX, screenY, room.width, room.height);

            // Room border
            ctx.strokeStyle = '#4a4a6a';
            ctx.lineWidth = 3;
            ctx.strokeRect(screenX, screenY, room.width, room.height);

            // Room name
            ctx.fillStyle = '#8888aa';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(room.name, screenX + room.width / 2, screenY + room.height / 2);
        }

        // Draw hallways connecting rooms (simplified)
        ctx.strokeStyle = '#2a2a4a';
        ctx.lineWidth = 80;
        ctx.lineCap = 'round';

        // Some hallway connections
        const hallways = [
            [[1500, 500], [1500, 600]], // Cafe to Admin
            [[1200, 350], [1400, 350]], // MedBay to Cafe
            [[750, 350], [1100, 350]], // Upper Engine area to MedBay
            [[750, 550], [750, 800]], // Security to Lower Engine
            [[900, 800], [1300, 800]], // Electrical to Storage
            [[1600, 800], [1700, 800]], // Storage to Shields
            [[1900, 350], [2100, 350]], // O2 area to Nav
        ];

        ctx.beginPath();
        for (const [start, end] of hallways) {
            ctx.moveTo(start[0] - camera.x, start[1] - camera.y);
            ctx.lineTo(end[0] - camera.x, end[1] - camera.y);
        }
        ctx.stroke();

        // Draw vents
        for (const vent of this.vents) {
            const screenX = vent.x - camera.x;
            const screenY = vent.y - camera.y;

            ctx.fillStyle = '#333344';
            ctx.beginPath();
            ctx.ellipse(screenX, screenY, 25, 15, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#555566';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Vent grill lines
            ctx.strokeStyle = '#222233';
            ctx.lineWidth = 2;
            for (let i = -15; i <= 15; i += 6) {
                ctx.beginPath();
                ctx.moveTo(screenX + i, screenY - 10);
                ctx.lineTo(screenX + i, screenY + 10);
                ctx.stroke();
            }
        }
    }

    drawColliders(ctx, camera) {
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        for (const col of this.colliders) {
            ctx.strokeRect(
                col.x - camera.x,
                col.y - camera.y,
                col.width,
                col.height
            );
        }
    }
}
