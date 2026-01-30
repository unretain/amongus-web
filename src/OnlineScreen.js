// Online Screen - shown after clicking Online from main menu
// Shows HOST, PUBLIC, PRIVATE options

import { Player } from './Player.js';

export class OnlineScreen {
    constructor() {
        this.active = false;

        // UI sprites from main-menu.png
        this.sprites = {
            hostText: { x: 943, y: 503, w: 82, h: 40 },
            hostIcon: { x: 1446, y: 105, w: 144, h: 141 },
            privateText: { x: 703, y: 456, w: 140, h: 41 },
            privateIcon: { x: 1304, y: 106, w: 142, h: 139 },
            publicText: { x: 468, y: 501, w: 135, h: 43 },
            publicIcon: { x: 655, y: 227, w: 162, h: 164 },
            arrow: { x: 1633, y: 328, w: 58, h: 53 },
        };

        // Code input state
        this.codeInput = '';
        this.codeShaking = false;
        this.codeShakeTime = 0;
        this.codeShakeDuration = 0.5;
        this.codeInputFocused = false; // Only accept typing when focused
        this.nameInputFocused = false; // For editing player name

        // Floating crew members (same as main menu)
        this.crewSprites = [
            { x: 2, y: 0, w: 133, h: 230 },
            { x: 131, y: 1, w: 202, h: 211 },
            { x: 330, y: 1, w: 168, h: 188 },
            { x: 3, y: 229, w: 137, h: 234 },
            { x: 144, y: 213, w: 189, h: 206 },
            { x: 333, y: 188, w: 157, h: 231 },
        ];

        this.tintedCrewCache = new Map();
        this.floatingCrew = [];

        // Button hitboxes
        this.backButton = null;
        this.hostButton = null;
        this.publicButton = null;
        this.privateButton = null;

        // Player name (loaded from Solana wallet)
        this.playerName = 'Player';
        this.loadWalletName();
    }

    // Load Solana address from localStorage and use as player name
    loadWalletName() {
        const publicKey = localStorage.getItem('solanaPublicKey');
        if (publicKey) {
            // Truncate to first 4 and last 4 characters with ... in middle
            this.playerName = this.truncateAddress(publicKey);
            this.fullAddress = publicKey;
        }
    }

    // Truncate address for display (e.g., "AbCdEfG...WxYzAbC")
    truncateAddress(address) {
        if (!address || address.length < 16) return address;
        return address.slice(0, 7) + '...' + address.slice(-7);
    }

    initFloatingCrew() {
        if (this.floatingCrew.length > 0) return; // Already initialized

        const colorIndices = [...Array(Player.COLORS.length).keys()];
        for (let i = colorIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [colorIndices[i], colorIndices[j]] = [colorIndices[j], colorIndices[i]];
        }

        const sizes = [0.4, 0.5, 0.6, 0.7, 0.8];
        for (let i = sizes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sizes[i], sizes[j]] = [sizes[j], sizes[i]];
        }

        const screenW = window.innerWidth || 1920;
        const screenH = window.innerHeight || 1080;

        for (let i = 0; i < 5; i++) {
            const scale = sizes[i];
            const spriteIndex = i % this.crewSprites.length;
            const sprite = this.crewSprites[spriteIndex];
            const radius = Math.max(sprite.w, sprite.h) * scale / 2;
            const speedMult = 0.5 + scale;

            let x, y, attempts = 0;
            do {
                x = radius + Math.random() * (screenW - radius * 2);
                y = radius + Math.random() * (screenH - radius * 2);
                attempts++;
            } while (attempts < 50 && this.overlapsExisting(x, y, radius, i));

            this.floatingCrew.push({
                spriteIndex,
                colorIndex: colorIndices[i],
                x, y,
                vx: (Math.random() - 0.5) * 30 * speedMult,
                vy: (Math.random() - 0.5) * 30 * speedMult,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.5 * speedMult,
                scale,
                radius,
            });
        }

        this.floatingCrew.sort((a, b) => a.scale - b.scale);
    }

    overlapsExisting(x, y, radius, currentIndex) {
        for (let i = 0; i < currentIndex; i++) {
            const other = this.floatingCrew[i];
            const dx = x - other.x;
            const dy = y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = radius + other.radius + 20;
            if (dist < minDist) return true;
        }
        return false;
    }

    show() {
        this.active = true;
        this.initFloatingCrew();

        // Reload wallet name in case it was created/changed
        this.loadWalletName();

        // Add keyboard listener for code input
        this.keyHandler = (e) => this.handleKeyDown(e);
        window.addEventListener('keydown', this.keyHandler);
    }

    hide() {
        this.active = false;

        // Remove keyboard listener
        if (this.keyHandler) {
            window.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = null;
        }
    }

    handleKeyDown(e) {
        if (!this.active) return;

        // Handle name input
        if (this.nameInputFocused) {
            if (e.key.length === 1 && this.playerName.length < 12) {
                this.playerName += e.key;
                e.preventDefault();
            } else if (e.key === 'Backspace' && this.playerName.length > 0) {
                this.playerName = this.playerName.slice(0, -1);
                e.preventDefault();
            } else if (e.key === 'Enter' || e.key === 'Escape') {
                this.nameInputFocused = false;
                e.preventDefault();
            }
            return;
        }

        // Handle code input - only when focused
        if (this.codeInputFocused) {
            // Only allow numbers and letters for game codes (6 character codes typically)
            if (e.key.length === 1 && /[A-Za-z0-9]/.test(e.key) && this.codeInput.length < 6) {
                this.codeInput += e.key.toUpperCase();
                e.preventDefault();
            } else if (e.key === 'Backspace' && this.codeInput.length > 0) {
                this.codeInput = this.codeInput.slice(0, -1);
                e.preventDefault();
            } else if (e.key === 'Enter' && this.codeInput.length > 0) {
                // Try to join game with code
                this.validateAndJoinCode();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                // Unfocus the input
                this.codeInputFocused = false;
            }
        }
    }

    validateAndJoinCode() {
        // For now, no valid codes exist, so always shake and clear
        // In the future this would check against a server
        this.codeShaking = true;
        this.codeShakeTime = this.codeShakeDuration;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    createTintedCrew(texture, spriteIndex, colorIndex) {
        const key = `${spriteIndex}-${colorIndex}`;
        if (this.tintedCrewCache.has(key)) {
            return this.tintedCrewCache.get(key);
        }

        const sprite = this.crewSprites[spriteIndex];
        const color = Player.COLORS[colorIndex];
        const bodyRgb = this.hexToRgb(color.body);
        const shadowRgb = this.hexToRgb(color.shadow);

        const canvas = document.createElement('canvas');
        canvas.width = sprite.w;
        canvas.height = sprite.h;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(
            texture,
            sprite.x, sprite.y, sprite.w, sprite.h,
            0, 0, sprite.w, sprite.h
        );

        const imageData = ctx.getImageData(0, 0, sprite.w, sprite.h);
        const data = imageData.data;

        for (let p = 0; p < data.length; p += 4) {
            const a = data[p + 3];
            if (a === 0) continue;

            const r = data[p];
            const g = data[p + 1];
            const b = data[p + 2];

            if (r > 150 && g < 80 && b < 80) {
                data[p] = bodyRgb.r;
                data[p + 1] = bodyRgb.g;
                data[p + 2] = bodyRgb.b;
            } else if (b > 150 && r < 80 && g < 80) {
                data[p] = shadowRgb.r;
                data[p + 1] = shadowRgb.g;
                data[p + 2] = shadowRgb.b;
            } else if (g > 100 && r < 120 && b < 180) {
                if (g > 220) {
                    data[p] = 195; data[p + 1] = 227; data[p + 2] = 230;
                } else if (g > 160) {
                    data[p] = 137; data[p + 1] = 207; data[p + 2] = 220;
                } else {
                    data[p] = 80; data[p + 1] = 140; data[p + 2] = 170;
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        this.tintedCrewCache.set(key, canvas);
        return canvas;
    }

    update(dt, screenW, screenH) {
        if (!this.active) return;

        const w = screenW || window.innerWidth || 1920;
        const h = screenH || window.innerHeight || 1080;

        // Update shake timer
        if (this.codeShaking) {
            this.codeShakeTime -= dt;
            if (this.codeShakeTime <= 0) {
                this.codeShaking = false;
                this.codeShakeTime = 0;
                this.codeInput = ''; // Clear the code after shake ends
            }
        }

        for (const crew of this.floatingCrew) {
            crew.x += crew.vx * dt;
            crew.y += crew.vy * dt;
            crew.rotation += crew.rotationSpeed * dt;

            const margin = crew.radius;
            if (crew.x < -margin) crew.x = w + margin;
            else if (crew.x > w + margin) crew.x = -margin;
            if (crew.y < -margin) crew.y = h + margin;
            else if (crew.y > h + margin) crew.y = -margin;
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Design dimensions (layout was made for 1920x1080)
        const designW = 1920;
        const designH = 1080;

        // Calculate scale factor to fit screen while maintaining aspect ratio
        const scaleX = screenW / designW;
        const scaleY = screenH / designH;
        const scale = Math.min(scaleX, scaleY);

        // Calculate offset to center the UI
        const offsetX = (screenW - designW * scale) / 2;
        const offsetY = (screenH - designH * scale) / 2;

        // Helper to scale positions
        const s = (val) => val * scale;
        const sx = (val) => val * scale + offsetX;
        const sy = (val) => val * scale + offsetY;

        // Black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, screenW, screenH);

        // Draw stars
        const starsBg = assetLoader?.getTexture('stars_bg');
        if (starsBg) {
            for (let x = 0; x < screenW; x += starsBg.width) {
                for (let y = 0; y < screenH; y += starsBg.height) {
                    ctx.drawImage(starsBg, x, y);
                }
            }
        }

        // Draw floating crew
        const crewTexture = assetLoader?.getTexture('main_crew');
        if (crewTexture) {
            for (const crew of this.floatingCrew) {
                const sprite = this.crewSprites[crew.spriteIndex];
                const tintedCrew = this.createTintedCrew(crewTexture, crew.spriteIndex, crew.colorIndex);

                ctx.save();
                ctx.translate(crew.x, crew.y);
                ctx.rotate(crew.rotation);
                ctx.scale(crew.scale, crew.scale);
                ctx.drawImage(tintedCrew, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
                ctx.restore();
            }
        }

        // Get textures
        const guiButtons = assetLoader?.getTexture('gui_buttons');
        const mainMenuUI = assetLoader?.getTexture('main_menu_ui');

        // TEXT BACKERS (from buttons sheet):
        // backer_1: (1262, 110) 108x110
        // backer_2: (303, 120) 56x56

        // === TOP TITLE BACKER (backer_1 9-sliced to 1000x160 at 460,47) ===
        if (guiButtons) {
            this.draw9Slice(ctx, guiButtons,
                { x: 1262, y: 110, w: 108, h: 110 },
                { x: sx(460), y: sy(47), w: s(1000), h: s(160) },
                s(25)
            );
        }

        // Draw player name (Solana address) inside the top backer
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${Math.round(64 * scale)}px "Varela Round", Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.playerName, sx(460 + 500), sy(47 + 80));
        ctx.textBaseline = 'alphabetic';

        // === CREATE GAME SECTION ===
        // Host icon (circle cropped) at (478, 268) scaled 2x (278x272)
        if (mainMenuUI) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(sx(478 + 139), sy(268 + 136), s(136), 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(mainMenuUI, 1449, 109, 139, 136, sx(478), sy(268), s(278), s(272));
            ctx.restore();
        }

        // "HOST" text from mainmenu at (777, 311) scaled 2x
        if (mainMenuUI) {
            ctx.drawImage(mainMenuUI, 945, 503, 81, 41, sx(777), sy(311), s(162), s(82));
        }

        // White line under Create Game section at (748, 404) width 600
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(sx(748), sy(404), s(600), s(8), s(4));
        ctx.fill();

        // Backer_2 for "Create Game" button (9-sliced to 300x80) at (810, 439)
        if (guiButtons) {
            this.draw9Slice(ctx, guiButtons,
                { x: 303, y: 120, w: 56, h: 56 },
                { x: sx(810), y: sy(439), w: s(300), h: s(80) },
                s(15)
            );
        }

        // "Create Game" text inside the backer
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${Math.round(28 * scale)}px "Varela Round", Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('Create Game', sx(810 + 150), sy(439 + 50));

        // === FIND GAME SECTION ===
        // Private/Public icon (circle cropped) at (478, 690) scaled 2x
        if (mainMenuUI) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(sx(478 + 135), sy(690 + 137), s(135), 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(mainMenuUI, 1310, 108, 135, 137, sx(478), sy(690), s(270), s(274));
            ctx.restore();
        }

        // "PUBLIC" text from mainmenu at (777, 723) scaled 2x
        if (mainMenuUI) {
            ctx.drawImage(mainMenuUI, 468, 502, 137, 40, sx(777), sy(723), s(274), s(80));
        }

        // White line under Find Game section at (748, 827) width 600
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(sx(748), sy(827), s(600), s(8), s(4));
        ctx.fill();

        // Backer_2 for "Find Game" button (9-sliced to 300x80) at (810, 860)
        if (guiButtons) {
            this.draw9Slice(ctx, guiButtons,
                { x: 303, y: 120, w: 56, h: 56 },
                { x: sx(810), y: sy(860), w: s(300), h: s(80) },
                s(15)
            );
        }

        // "Find Game" text inside the backer
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${Math.round(28 * scale)}px "Varela Round", Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('Find Game', sx(810 + 150), sy(860 + 50));

        // === HITBOXES (also scaled) ===
        // Create Game button hitbox
        this.hostButton = { x: sx(810), y: sy(439), w: s(300), h: s(80) };

        // Find Game button hitbox
        this.publicButton = { x: sx(810), y: sy(860), w: s(300), h: s(80) };

        // Back button (bottom left - larger, consistent across screens)
        const backX = sx(30);
        const backY = sy(1080 - 90);
        const backW = s(150);
        const backH = s(60);
        this.backButton = { x: backX, y: backY, w: backW, h: backH };

        // Draw back button with backer_2
        if (guiButtons) {
            this.draw9Slice(ctx, guiButtons,
                { x: 303, y: 120, w: 56, h: 56 },
                { x: backX, y: backY, w: backW, h: backH },
                s(15)
            );
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${Math.round(24 * scale)}px "Varela Round", Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('Back', backX + backW / 2, backY + backH / 2 + s(8));
    }

    handleClick(x, y) {
        if (!this.active) return null;

        // Back button
        if (this.backButton && this.isInBounds(x, y, this.backButton)) {
            return 'back';
        }

        // Create Game button (hosts a new game)
        if (this.hostButton && this.isInBounds(x, y, this.hostButton)) {
            return 'host';
        }

        // Find Game button (goes to public lobby list)
        if (this.publicButton && this.isInBounds(x, y, this.publicButton)) {
            return 'public';
        }

        return null;
    }

    isInBounds(x, y, bounds) {
        return x >= bounds.x && x <= bounds.x + bounds.w &&
               y >= bounds.y && y <= bounds.y + bounds.h;
    }

    // Draw a 9-slice scaled sprite from a square source
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
        const cs = cornerSize;

        const scale = Math.min(dw / sw, dh / sh, 1);
        const dc = Math.floor(cs * scale);
        const maxCorner = Math.min(dw / 2, dh / 2);
        const dcClamped = Math.min(dc, maxCorner);

        // Corners
        ctx.drawImage(texture, sx, sy, cs, cs, dx, dy, dcClamped, dcClamped);
        ctx.drawImage(texture, sx + sw - cs, sy, cs, cs, dx + dw - dcClamped, dy, dcClamped, dcClamped);
        ctx.drawImage(texture, sx, sy + sh - cs, cs, cs, dx, dy + dh - dcClamped, dcClamped, dcClamped);
        ctx.drawImage(texture, sx + sw - cs, sy + sh - cs, cs, cs, dx + dw - dcClamped, dy + dh - dcClamped, dcClamped, dcClamped);

        // Edges
        ctx.drawImage(texture, sx + cs, sy, sw - cs * 2, cs, dx + dcClamped, dy, dw - dcClamped * 2, dcClamped);
        ctx.drawImage(texture, sx + cs, sy + sh - cs, sw - cs * 2, cs, dx + dcClamped, dy + dh - dcClamped, dw - dcClamped * 2, dcClamped);
        ctx.drawImage(texture, sx, sy + cs, cs, sh - cs * 2, dx, dy + dcClamped, dcClamped, dh - dcClamped * 2);
        ctx.drawImage(texture, sx + sw - cs, sy + cs, cs, sh - cs * 2, dx + dw - dcClamped, dy + dcClamped, dcClamped, dh - dcClamped * 2);

        // Center
        ctx.drawImage(texture, sx + cs, sy + cs, sw - cs * 2, sh - cs * 2, dx + dcClamped, dy + dcClamped, dw - dcClamped * 2, dh - dcClamped * 2);
    }
}
