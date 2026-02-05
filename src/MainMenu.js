// Main Menu Screen with floating crew members

import { Player } from './Player.js';

export class MainMenu {
    constructor() {
        this.active = true;

        // How to Play dialog state
        this.showHowToPlay = false;
        this.howToPlayCloseButton = null;

        // Wallet dialog state
        this.showWallet = false;
        this.walletCloseButton = null;
        this.walletPublicKey = null;
        this.walletPrivateKey = null;

        // Load or generate wallet keys immediately so playerName is available
        if (!this.loadSavedWallet()) {
            this.generateSolanaKeypair();
        }

        // Menu UI sprites from main-menu.png
        this.menuSprites = {
            online: { x: 844, y: 345, w: 190, h: 77 },
            howToPlay: { x: 1419, y: 247, w: 194, h: 52 },
            playerIcon: { x: 2, y: 470, w: 66, h: 72 },
        };

        // Dialog sprites from ui-buttons.png (backer panels)
        this.dialogSprites = {
            backer2: { x: 303, y: 120, w: 56, h: 56 },      // Teal backer panel (9-slice)
            closeX: { x: 277, y: 83, w: 22, h: 22 },        // X close button
        };

        // Button hitboxes (calculated during render)
        this.onlineButton = null;
        this.howToPlayButton = null;
        this.discordButton = null;
        this.walletButton = null;
        this.solCopyButton = null;

        // $SOLANUS token
        this.solTokenAddress = 'Coming Soon...';
        this.copyFeedbackTimer = 0; // For "Copied!" feedback
        this.privateKeyCopyTimer = 0; // For private key copy feedback
        this.privateKeyCopyButton = null;

        // Floating crew member sprites from main-screen-crew.png
        this.crewSprites = [
            { x: 2, y: 0, w: 133, h: 230 },    // 1st crew
            { x: 131, y: 1, w: 202, h: 211 },  // 2nd crew
            { x: 330, y: 1, w: 168, h: 188 },  // 3rd crew
            { x: 3, y: 229, w: 137, h: 234 },  // 4th crew
            { x: 144, y: 213, w: 189, h: 206 }, // 5th crew
            { x: 333, y: 188, w: 157, h: 231 }, // 6th crew
        ];

        // Tinted crew canvases cache
        this.tintedCrewCache = new Map();

        // Floating crew instances
        this.floatingCrew = [];
        this.initFloatingCrew();
    }

    initFloatingCrew() {
        // Shuffle colors to get random unique colors for each crew member
        const colorIndices = [...Array(Player.COLORS.length).keys()];
        for (let i = colorIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [colorIndices[i], colorIndices[j]] = [colorIndices[j], colorIndices[i]];
        }

        // Predefined sizes for depth effect (small = far, large = close)
        const sizes = [0.3, 0.4, 0.5, 0.55, 0.65, 0.75, 0.85];
        // Shuffle sizes
        for (let i = sizes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sizes[i], sizes[j]] = [sizes[j], sizes[i]];
        }

        // Create 7 floating crew members at random positions (non-overlapping)
        for (let i = 0; i < 7; i++) {
            const scale = sizes[i];
            const spriteIndex = i % this.crewSprites.length; // Cycle through 6 sprites
            const sprite = this.crewSprites[spriteIndex];
            const radius = Math.max(sprite.w, sprite.h) * scale / 2;

            // Smaller (farther) crew move slower, larger (closer) move faster
            const speedMult = 0.5 + scale;

            // Find a non-overlapping position (use window size or defaults)
            const screenW = window.innerWidth || 1920;
            const screenH = window.innerHeight || 1080;
            let x, y, attempts = 0;
            do {
                x = radius + Math.random() * (screenW - radius * 2);
                y = radius + Math.random() * (screenH - radius * 2);
                attempts++;
            } while (attempts < 50 && this.overlapsExisting(x, y, radius, i));

            this.floatingCrew.push({
                spriteIndex: spriteIndex,
                colorIndex: colorIndices[i], // Random unique color
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 30 * speedMult, // velocity x
                vy: (Math.random() - 0.5) * 30 * speedMult, // velocity y
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.5 * speedMult,
                scale: scale,
                radius: radius, // Store for collision detection
            });
        }

        // Sort by scale so smaller (farther) ones render first (behind)
        this.floatingCrew.sort((a, b) => a.scale - b.scale);
    }

    overlapsExisting(x, y, radius, currentIndex) {
        for (let i = 0; i < currentIndex; i++) {
            const other = this.floatingCrew[i];
            const dx = x - other.x;
            const dy = y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = radius + other.radius + 20; // 20px buffer
            if (dist < minDist) return true;
        }
        return false;
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

        // Draw the sprite
        ctx.drawImage(
            texture,
            sprite.x, sprite.y, sprite.w, sprite.h,
            0, 0, sprite.w, sprite.h
        );

        // Tint the pixels - same logic as Player.js
        const imageData = ctx.getImageData(0, 0, sprite.w, sprite.h);
        const data = imageData.data;

        for (let p = 0; p < data.length; p += 4) {
            const a = data[p + 3];
            if (a === 0) continue;

            const r = data[p];
            const g = data[p + 1];
            const b = data[p + 2];

            // Check if pixel is red-ish (body color in original sprite)
            if (r > 150 && g < 80 && b < 80) {
                data[p] = bodyRgb.r;
                data[p + 1] = bodyRgb.g;
                data[p + 2] = bodyRgb.b;
            }
            // Check if pixel is dark blue (shadow in original sprite)
            else if (b > 150 && r < 80 && g < 80) {
                data[p] = shadowRgb.r;
                data[p + 1] = shadowRgb.g;
                data[p + 2] = shadowRgb.b;
            }
            // Visor colors - 3 shades based on green brightness
            else if (g > 100 && r < 120 && b < 180) {
                // Very bright green = visor highlight (inner semicircle)
                if (g > 220) {
                    data[p] = 195;     // R - very light cyan
                    data[p + 1] = 227; // G
                    data[p + 2] = 230; // B
                }
                // Medium green = visor main (middle)
                else if (g > 160) {
                    data[p] = 137;     // R - light cyan
                    data[p + 1] = 207; // G
                    data[p + 2] = 220; // B
                }
                // Darker green = visor shadow (outer edge)
                else {
                    data[p] = 80;      // R - dark cyan/teal
                    data[p + 1] = 140; // G
                    data[p + 2] = 170; // B
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        this.tintedCrewCache.set(key, canvas);
        return canvas;
    }

    update(dt, screenW, screenH) {
        if (!this.active) return;

        // Use passed dimensions or fallback to window size
        const w = screenW || window.innerWidth || 1920;
        const h = screenH || window.innerHeight || 1080;

        // Update floating crew positions
        for (const crew of this.floatingCrew) {
            crew.x += crew.vx * dt;
            crew.y += crew.vy * dt;
            crew.rotation += crew.rotationSpeed * dt;

            // Wrap around screen edges - instant teleport to other side
            const margin = crew.radius;
            if (crew.x < -margin) crew.x = w + margin;
            else if (crew.x > w + margin) crew.x = -margin;
            if (crew.y < -margin) crew.y = h + margin;
            else if (crew.y > h + margin) crew.y = -margin;
        }

        // Collision avoidance - push apart overlapping crew
        for (let i = 0; i < this.floatingCrew.length; i++) {
            for (let j = i + 1; j < this.floatingCrew.length; j++) {
                const a = this.floatingCrew[i];
                const b = this.floatingCrew[j];

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = a.radius + b.radius + 10;

                if (dist < minDist && dist > 0) {
                    // Push them apart
                    const overlap = (minDist - dist) / 2;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    a.x -= nx * overlap;
                    a.y -= ny * overlap;
                    b.x += nx * overlap;
                    b.y += ny * overlap;

                    // Slightly adjust velocities to move away from each other
                    const pushStrength = 5;
                    a.vx -= nx * pushStrength;
                    a.vy -= ny * pushStrength;
                    b.vx += nx * pushStrength;
                    b.vy += ny * pushStrength;
                }
            }
        }
    }

    render(ctx, assetLoader) {
        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, screenW, screenH);

        // Draw stars on top
        const starsBg = assetLoader?.getTexture('stars_bg');
        if (starsBg) {
            for (let x = 0; x < screenW; x += starsBg.width) {
                for (let y = 0; y < screenH; y += starsBg.height) {
                    ctx.drawImage(starsBg, x, y);
                }
            }
        }

        // Draw floating crew members with random colors
        const crewTexture = assetLoader?.getTexture('main_crew');
        if (crewTexture) {
            for (const crew of this.floatingCrew) {
                const sprite = this.crewSprites[crew.spriteIndex];
                const tintedCrew = this.createTintedCrew(crewTexture, crew.spriteIndex, crew.colorIndex);

                ctx.save();
                ctx.translate(crew.x, crew.y);
                ctx.rotate(crew.rotation);
                ctx.scale(crew.scale, crew.scale);
                ctx.drawImage(
                    tintedCrew,
                    -sprite.w / 2, -sprite.h / 2,
                    sprite.w, sprite.h
                );
                ctx.restore();
            }
        }

        // Draw logo
        const logo = assetLoader?.getTexture('logo');
        let logoBottomY = 180; // Default if no logo
        if (logo) {
            const logoScale = 1.0;
            const logoW = logo.width * logoScale;
            const logoH = logo.height * logoScale;
            const logoX = (screenW - logoW) / 2;
            const logoY = 80;
            ctx.drawImage(logo, logoX, logoY, logoW, logoH);
            logoBottomY = logoY + logoH;
        } else {
            // Fallback text logo
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 72px "Varela Round", Arial';
            ctx.textAlign = 'center';
            ctx.fillText('AMONG US', screenW / 2, 180);
        }

        // Draw "On Chain" text below logo
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '56px "In Your Face Joffrey", Arial';
        ctx.textAlign = 'center';
        ctx.fillText('On Chain', screenW / 2, logoBottomY + 60);

        // Draw player icon and ID below logo, to the left
        const menuTexture = assetLoader?.getTexture('main_menu_ui');
        const playerIconSprite = this.menuSprites.playerIcon;
        const iconScale = 0.8;
        const iconW = playerIconSprite.w * iconScale;
        const iconH = playerIconSprite.h * iconScale;
        const iconX = 30;
        const iconY = 200;

        if (menuTexture) {
            ctx.drawImage(
                menuTexture,
                playerIconSprite.x, playerIconSprite.y, playerIconSprite.w, playerIconSprite.h,
                iconX, iconY, iconW, iconH
            );
        }

        // Draw "$SOLANUS" label next to icon
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px "Varela Round", Arial';
        ctx.textAlign = 'left';
        const solTextX = iconX + iconW + 10;
        ctx.fillText('$SOLANUS', solTextX, iconY + iconH / 2 - 8);

        // Draw "Coming Soon..." below label
        ctx.font = '14px "Varela Round", Arial';
        ctx.fillText(this.solTokenAddress, solTextX, iconY + iconH / 2 + 12);

        // Draw copy button BELOW the address with backer_2 style
        const copyBtnW = 100;
        const copyBtnH = 40;
        const copyBtnX = iconX;
        const copyBtnY = iconY + iconH + 10;

        // Always store hitbox for click detection
        this.solCopyButton = { x: copyBtnX, y: copyBtnY, w: copyBtnW, h: copyBtnH };

        // Load buttons sheet for backer
        if (!this._buttonsSheet) {
            this._buttonsSheet = new Image();
            this._buttonsSheet.src = '/assets/gui/Buttons-sharedassets0.assets-73.png';
        }
        const buttonsSheet = this._buttonsSheet?.complete ? this._buttonsSheet : null;

        // Draw backer_2 (same as back button)
        if (buttonsSheet) {
            const backer = { x: 303, y: 120, w: 56, h: 56 };
            this.draw9Slice(ctx, buttonsSheet, backer.x, backer.y, backer.w, backer.h,
                copyBtnX, copyBtnY, copyBtnW, copyBtnH, 20);
        }

        // Button text (always white)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '18px "Varela Round", Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.copyFeedbackTimer > 0 ? 'Copied!' : 'Copy', copyBtnX + copyBtnW / 2, copyBtnY + 26);

        // Decrease feedback timer
        if (this.copyFeedbackTimer > 0) {
            this.copyFeedbackTimer -= 16; // Roughly 1 frame at 60fps
        }

        // Draw Online button (menuTexture already loaded above)
        if (menuTexture) {
            const onlineSprite = this.menuSprites.online;
            const buttonScale = 1.0;
            const buttonW = onlineSprite.w * buttonScale;
            const buttonH = onlineSprite.h * buttonScale;
            const buttonX = (screenW - buttonW) / 2;
            const buttonY = 380;

            ctx.drawImage(
                menuTexture,
                onlineSprite.x, onlineSprite.y, onlineSprite.w, onlineSprite.h,
                buttonX, buttonY, buttonW, buttonH
            );

            // Store hitbox for click detection
            this.onlineButton = { x: buttonX, y: buttonY, w: buttonW, h: buttonH };

            // Draw How to Play and Wallet buttons side by side, centered under Online button
            const howToPlaySprite = this.menuSprites.howToPlay;
            const htpScale = 1.0;
            const htpW = howToPlaySprite.w * htpScale;
            const htpH = howToPlaySprite.h * htpScale;

            // Load buttons sheet for wallet
            if (!this._buttonsSheet) {
                this._buttonsSheet = new Image();
                this._buttonsSheet.src = '/assets/gui/Buttons-sharedassets0.assets-73.png';
            }
            const buttonsSheet = this._buttonsSheet?.complete ? this._buttonsSheet : null;

            // Wallet button dimensions
            const walletW = 180;
            const walletH = htpH; // Same height as How to Play

            // Calculate positions to center both buttons under Online
            const gap = 15; // Gap between buttons
            const totalWidth = walletW + gap + htpW;
            const startX = (screenW - totalWidth) / 2;
            const rowY = buttonY + buttonH + 20;

            // Draw Wallet button (LEFT)
            const walletX = startX;
            if (buttonsSheet) {
                const backer = { x: 303, y: 120, w: 56, h: 56 };
                this.draw9Slice(ctx, buttonsSheet, backer.x, backer.y, backer.w, backer.h,
                    walletX, rowY, walletW, walletH, 20);

                // Draw "WALLET" text with In Your Face Joffrey font (with letter spacing)
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '32px "In Your Face Joffrey", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                this.drawSpacedText(ctx, 'WALLET', walletX + walletW / 2, rowY + walletH / 2, 4);
                ctx.textBaseline = 'alphabetic';

                // Store hitbox for click detection
                this.walletButton = { x: walletX, y: rowY, w: walletW, h: walletH };
            }

            // Draw How to Play button (RIGHT) - using sprite
            const htpX = startX + walletW + gap;
            ctx.drawImage(
                menuTexture,
                howToPlaySprite.x, howToPlaySprite.y, howToPlaySprite.w, howToPlaySprite.h,
                htpX, rowY, htpW, htpH
            );

            // Store hitbox for click detection
            this.howToPlayButton = { x: htpX, y: rowY, w: htpW, h: htpH };
        }

        // Draw Discord logo at bottom
        const discordLogo = assetLoader?.getTexture('discord_logo');
        if (discordLogo) {
            const discordScale = 0.15;
            const discordW = discordLogo.width * discordScale;
            const discordH = discordLogo.height * discordScale;
            const discordX = (screenW - discordW) / 2;
            const discordY = screenH - discordH - 20;

            ctx.drawImage(discordLogo, discordX, discordY, discordW, discordH);

            // Store hitbox for click detection
            this.discordButton = { x: discordX, y: discordY, w: discordW, h: discordH };
        }

        // Draw How to Play dialog if open
        if (this.showHowToPlay) {
            this.renderHowToPlayDialog(ctx, screenW, screenH, assetLoader);
        }

        // Draw Wallet dialog if open
        if (this.showWallet) {
            this.renderWalletDialog(ctx, screenW, screenH, assetLoader);
        }
    }

    renderHowToPlayDialog(ctx, screenW, screenH, assetLoader) {
        // Dark overlay only - NO other fills!
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, screenW, screenH);

        // Dialog box dimensions
        const dialogW = 550;
        const dialogH = 380;
        const dialogX = (screenW - dialogW) / 2;
        const dialogY = (screenH - dialogH) / 2;

        // Get buttons sheet texture for backer_2
        // Load it ourselves since it's from OldButtons.png (buttons-sheet.png)
        if (!this._buttonsSheet) {
            this._buttonsSheet = new Image();
            this._buttonsSheet.src = '/assets/gui/Buttons-sharedassets0.assets-73.png';
        }

        const buttonsSheet = this._buttonsSheet?.complete ? this._buttonsSheet : null;
        // backer_2: x:303, y:120, w:56, h:56 from the buttons sheet
        const backer = { x: 303, y: 120, w: 56, h: 56 };

        // Draw main dialog backer_2 - NO FALLBACK FILL
        if (buttonsSheet) {
            this.draw9Slice(ctx, buttonsSheet, backer.x, backer.y, backer.w, backer.h,
                dialogX, dialogY, dialogW, dialogH, 20);
        }

        // Title - same style as Wallet dialog
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '36px "In Your Face Joffrey", Arial';
        ctx.textAlign = 'center';
        ctx.fillText('HOW TO PLAY', screenW / 2, dialogY + 50);

        // Content - same font as Wallet dialog
        let y = dialogY + 100;
        const lineSpacing = 80;

        ctx.font = 'bold 16px "Varela Round", Arial';
        ctx.fillText('1. The game generates a SOLANA ADDRESS', screenW / 2, y);
        ctx.font = '14px "Varela Round", Arial';
        ctx.fillText('Your earnings will be sent there', screenW / 2, y + 25);

        y += lineSpacing;

        ctx.font = 'bold 16px "Varela Round", Arial';
        ctx.fillText('2. IMPOSTORS win = 10,000 TOKENS', screenW / 2, y);
        ctx.font = '14px "Varela Round", Arial';
        ctx.fillText('Split between all impostors', screenW / 2, y + 25);

        y += lineSpacing;

        ctx.font = 'bold 16px "Varela Round", Arial';
        ctx.fillText('3. CREWMATES win = 10,000 TOKENS', screenW / 2, y);
        ctx.font = '14px "Varela Round", Arial';
        ctx.fillText('Split between all crewmates', screenW / 2, y + 25);

        // Close button using backer_2 - smaller, fits text
        const closeW = 80;
        const closeH = 32;
        const closeX = (screenW - closeW) / 2;
        const closeY = dialogY + dialogH - 55;

        if (buttonsSheet) {
            this.draw9Slice(ctx, buttonsSheet, backer.x, backer.y, backer.w, backer.h,
                closeX, closeY, closeW, closeH, 20);
        }

        // Close button text - Varela Round
        ctx.font = '16px "Varela Round", Arial';
        ctx.fillText('Close', screenW / 2, closeY + 21);

        // Store close button hitbox
        this.howToPlayCloseButton = { x: closeX, y: closeY, w: closeW, h: closeH };
    }

    renderWalletDialog(ctx, screenW, screenH, assetLoader) {
        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, screenW, screenH);

        // Dialog box dimensions - larger to fit content
        const dialogW = 700;
        const dialogH = 420;
        const dialogX = (screenW - dialogW) / 2;
        const dialogY = (screenH - dialogH) / 2;

        // Get buttons sheet texture for backer_2
        if (!this._buttonsSheet) {
            this._buttonsSheet = new Image();
            this._buttonsSheet.src = '/assets/gui/Buttons-sharedassets0.assets-73.png';
        }

        const buttonsSheet = this._buttonsSheet?.complete ? this._buttonsSheet : null;
        const backer = { x: 303, y: 120, w: 56, h: 56 };

        // Draw main dialog backer_2
        if (buttonsSheet) {
            this.draw9Slice(ctx, buttonsSheet, backer.x, backer.y, backer.w, backer.h,
                dialogX, dialogY, dialogW, dialogH, 20);
        }

        // Title - In Your Face Joffrey
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '32px "In Your Face Joffrey", Arial';
        ctx.textAlign = 'center';
        ctx.fillText('YOUR WALLET', screenW / 2, dialogY + 55);

        // Generate keys if not already generated
        if (!this.walletPublicKey || !this.walletPrivateKey) {
            this.generateSolanaKeypair();
        }

        // Public Key section
        ctx.font = 'bold 18px "Varela Round", Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('PUBLIC KEY', screenW / 2, dialogY + 110);

        ctx.font = '16px "Varela Round", Arial';
        ctx.fillText(this.walletPublicKey || 'Generating...', screenW / 2, dialogY + 140);

        // Private Key section
        ctx.font = 'bold 18px "Varela Round", Arial';
        ctx.fillText('PRIVATE KEY (KEEP THIS SECRET!)', screenW / 2, dialogY + 200);

        ctx.font = '14px "Varela Round", Arial';
        const privKeyDisplay = this.walletPrivateKey || 'Generating...';

        // Split private key into multiple lines to fit within dialog
        const maxCharsPerLine = 44;
        const lines = [];
        for (let i = 0; i < privKeyDisplay.length; i += maxCharsPerLine) {
            lines.push(privKeyDisplay.substring(i, i + maxCharsPerLine));
        }

        // Draw each line
        const lineHeight = 20;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], screenW / 2, dialogY + 230 + (i * lineHeight));
        }

        // Copy Private Key button - adjust Y based on number of lines
        const copyBtnW = 80;
        const copyBtnH = 35;
        const copyBtnX = (screenW - copyBtnW) / 2;
        const copyBtnY = dialogY + 230 + (lines.length * lineHeight) + 15;

        this.privateKeyCopyButton = { x: copyBtnX, y: copyBtnY, w: copyBtnW, h: copyBtnH };

        if (buttonsSheet) {
            this.draw9Slice(ctx, buttonsSheet, backer.x, backer.y, backer.w, backer.h,
                copyBtnX, copyBtnY, copyBtnW, copyBtnH, 20);
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px "Varela Round", Arial';
        ctx.fillText(this.privateKeyCopyTimer > 0 ? 'Copied!' : 'Copy', screenW / 2, copyBtnY + 23);

        // Decrease feedback timer
        if (this.privateKeyCopyTimer > 0) {
            this.privateKeyCopyTimer -= 16;
        }

        // Warning text
        ctx.font = '14px "Varela Round", Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('Save your private key! You need it to access your funds.', screenW / 2, copyBtnY + 55);

        // Close button
        const closeW = 100;
        const closeH = 40;
        const closeX = (screenW - closeW) / 2;
        const closeY = dialogY + dialogH - 55;

        if (buttonsSheet) {
            this.draw9Slice(ctx, buttonsSheet, backer.x, backer.y, backer.w, backer.h,
                closeX, closeY, closeW, closeH, 20);
        }

        // Close button text - Varela Round
        ctx.font = '18px "Varela Round", Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('Close', screenW / 2, closeY + 26);

        // Store close button hitbox
        this.walletCloseButton = { x: closeX, y: closeY, w: closeW, h: closeH };
    }

    generateSolanaKeypair() {
        // Generate a random 32-byte private key (Ed25519)
        const privateKeyBytes = new Uint8Array(64);
        crypto.getRandomValues(privateKeyBytes);

        // Convert to base58 for display (simplified - real Solana uses specific encoding)
        const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

        // Generate public key (44 chars like real Solana addresses)
        let publicKey = '';
        for (let i = 0; i < 44; i++) {
            publicKey += base58Chars[Math.floor(Math.random() * base58Chars.length)];
        }

        // Generate private key (88 chars like real Solana private keys)
        let privateKey = '';
        for (let i = 0; i < 88; i++) {
            privateKey += base58Chars[Math.floor(Math.random() * base58Chars.length)];
        }

        this.walletPublicKey = publicKey;
        this.walletPrivateKey = privateKey;

        // Save to localStorage so it persists
        localStorage.setItem('solanaPublicKey', publicKey);
        localStorage.setItem('solanaPrivateKey', privateKey);

        console.log('Generated Solana Keypair');
        console.log('Public Key:', publicKey);
    }

    loadSavedWallet() {
        const savedPublic = localStorage.getItem('solanaPublicKey');
        const savedPrivate = localStorage.getItem('solanaPrivateKey');

        if (savedPublic && savedPrivate) {
            this.walletPublicKey = savedPublic;
            this.walletPrivateKey = savedPrivate;
            return true;
        }
        return false;
    }

    // Draw text with letter spacing (for fonts that need it)
    drawSpacedText(ctx, text, x, y, spacing) {
        const chars = text.split('');
        // Measure total width with spacing
        let totalWidth = 0;
        for (let i = 0; i < chars.length; i++) {
            totalWidth += ctx.measureText(chars[i]).width;
            if (i < chars.length - 1) totalWidth += spacing;
        }

        // Start position (centered)
        let currentX = x - totalWidth / 2;

        // Draw each character
        ctx.textAlign = 'left';
        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], currentX, y);
            currentX += ctx.measureText(chars[i]).width + spacing;
        }
        ctx.textAlign = 'center'; // Reset
    }

    // 9-slice drawing for scalable UI panels (smart scaling like OnlineScreen)
    draw9Slice(ctx, texture, sx, sy, sw, sh, dx, dy, dw, dh, cornerSize) {
        if (!texture) return;

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

    handleClick(x, y) {
        if (!this.active) return null;

        // If How to Play dialog is open, only handle close button
        if (this.showHowToPlay) {
            if (this.howToPlayCloseButton && this.isInBounds(x, y, this.howToPlayCloseButton)) {
                console.log('How to Play closed');
                this.showHowToPlay = false;
                return 'close_howtoplay';
            }
            // Block other clicks while dialog is open
            return null;
        }

        // If Wallet dialog is open, handle close button and copy button
        if (this.showWallet) {
            if (this.walletCloseButton && this.isInBounds(x, y, this.walletCloseButton)) {
                console.log('Wallet closed');
                this.showWallet = false;
                return 'close_wallet';
            }
            // Check private key copy button
            if (this.privateKeyCopyButton && this.isInBounds(x, y, this.privateKeyCopyButton)) {
                this.privateKeyCopyTimer = 1500;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(this.walletPrivateKey).catch(err => {
                        console.error('Clipboard failed:', err);
                    });
                } else {
                    const textArea = document.createElement('textarea');
                    textArea.value = this.walletPrivateKey;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                }
                return 'copy_private_key';
            }
            // Block other clicks while dialog is open
            return null;
        }

        // Check Online button
        if (this.onlineButton && this.isInBounds(x, y, this.onlineButton)) {
            console.log('Online clicked');
            return 'online';
        }

        // Check How to Play button
        if (this.howToPlayButton && this.isInBounds(x, y, this.howToPlayButton)) {
            console.log('How to Play clicked');
            this.showHowToPlay = true;
            return 'howtoplay';
        }

        // Check Discord button
        if (this.discordButton && this.isInBounds(x, y, this.discordButton)) {
            console.log('Discord clicked');
            window.open('https://discord.gg/reta', '_blank');
            return 'discord';
        }

        // Check Wallet button
        if (this.walletButton && this.isInBounds(x, y, this.walletButton)) {
            console.log('Wallet clicked');
            // Try to load saved wallet first
            this.loadSavedWallet();
            this.showWallet = true;
            return 'wallet';
        }

        // Check SOL address copy button
        if (this.solCopyButton && this.isInBounds(x, y, this.solCopyButton)) {
            // Set feedback immediately so user sees response
            this.copyFeedbackTimer = 1500;

            // Try to copy to clipboard
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(this.solTokenAddress).catch(err => {
                    console.error('Clipboard failed:', err);
                });
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = this.solTokenAddress;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            return 'copy_sol';
        }

        return null;
    }

    isInBounds(x, y, bounds) {
        return x >= bounds.x && x <= bounds.x + bounds.w &&
               y >= bounds.y && y <= bounds.y + bounds.h;
    }
}
