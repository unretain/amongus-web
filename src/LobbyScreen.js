// Lobby Screen - shown after clicking Online from main menu

export class LobbyScreen {
    constructor() {
        this.active = false;

        // UI sprites from main-menu.png
        this.sprites = {
            playerCount: { x: 1636, y: 80, w: 69, h: 44 },      // /10 players icon
            playerIcon: { x: 1025, y: 501, w: 44, h: 43 },      // crewmate icon for lobby list
            mapIcon: { x: 1229, y: 327, w: 210, h: 51 },        // map selection icon (building)
        };

        // Real lobbies (empty by default - would be populated from server)
        this.lobbies = [];

        // Selected map
        this.selectedMap = 'skeld'; // skeld, mira, polus

        // Button hitboxes
        this.backButton = null;
        this.lobbyButtons = [];
        this.mapButtons = { skeld: null, mira: null, polus: null };
    }

    show() {
        this.active = true;
        // Clear lobbies when showing - will be populated by network callback
        this.lobbies = [];
    }

    hide() {
        this.active = false;
    }

    updateLobbies(lobbies) {
        // Called by network callback when lobbies list is received
        this.lobbies = lobbies || [];
        console.log('LobbyScreen updated with', this.lobbies.length, 'lobbies');
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

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

        const guiButtons = assetLoader?.getTexture('gui_buttons');
        const menuTexture = assetLoader?.getTexture('main_menu_ui');

        // TEXT BACKERS (from buttons sheet):
        // backer_1: (1262, 110) 108x110
        // backer_2: (303, 120) 56x56

        // Draw The Skeld map icon from sprite sheet (top left area)
        if (menuTexture) {
            const mapSprite = this.sprites.mapIcon;
            ctx.drawImage(
                menuTexture,
                mapSprite.x, mapSprite.y, mapSprite.w, mapSprite.h,
                40, 40, mapSprite.w, mapSprite.h
            );
        }

        // Lobby list panel area
        const panelX = 60;
        const panelY = 100;
        const panelW = screenW - 120;
        const panelH = screenH - 200;

        // Draw lobby container - white border, no fill (same style as back button)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, 20);
        ctx.stroke();

        // Clear lobby buttons for this frame
        this.lobbyButtons = [];

        // Draw lobby entries
        const entryHeight = 70;
        const entryPadding = 10;
        const entryStartY = panelY + 20;
        const maxVisible = Math.floor((panelH - 40) / (entryHeight + entryPadding));

        if (this.lobbies.length === 0) {
            // No lobbies message
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '24px "Varela Round", Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No lobbies available', panelX + panelW / 2, panelY + panelH / 2);
            ctx.fillText('Create a game or wait for others', panelX + panelW / 2, panelY + panelH / 2 + 35);
        } else {
            // Draw each lobby entry
            for (let i = 0; i < Math.min(this.lobbies.length, maxVisible); i++) {
                const lobby = this.lobbies[i];
                const entryY = entryStartY + i * (entryHeight + entryPadding);
                const entryX = panelX + 20;
                const entryW = panelW - 40;

                // Entry background - white border, no fill
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(entryX, entryY, entryW, entryHeight, 10);
                ctx.stroke();

                // Store hitbox for this lobby
                this.lobbyButtons.push({
                    x: entryX,
                    y: entryY,
                    w: entryW,
                    h: entryHeight,
                    lobby: lobby
                });

                // Draw player icon
                if (menuTexture) {
                    const iconSprite = this.sprites.playerIcon;
                    ctx.drawImage(
                        menuTexture,
                        iconSprite.x, iconSprite.y, iconSprite.w, iconSprite.h,
                        entryX + 15, entryY + (entryHeight - 40) / 2, 40, 40
                    );
                }

                // Lobby name (host's name + "'s Lobby")
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '22px "Varela Round", Arial';
                ctx.textAlign = 'left';
                const lobbyName = lobby.hostName ? `${lobby.hostName}'s Lobby` : `Room ${lobby.code}`;
                ctx.fillText(lobbyName, entryX + 70, entryY + 30);

                // Map name
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = '16px "Varela Round", Arial';
                const mapName = lobby.map || 'The Skeld';
                ctx.fillText(mapName, entryX + 70, entryY + 52);

                // Room code
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = '14px "Varela Round", Arial';
                ctx.fillText(lobby.code, entryX + entryW - 150, entryY + 30);

                // Player count (right side)
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '20px "Varela Round", Arial';
                ctx.textAlign = 'right';
                const playerCount = `${lobby.playerCount || 1}/10`;
                ctx.fillText(playerCount, entryX + entryW - 20, entryY + entryHeight / 2 + 7);
            }
        }

        // Reset text align
        ctx.textAlign = 'left';

        // Draw backer_2 for Back button (consistent size: 150x60)
        const backBtnW = 150;
        const backBtnH = 60;
        const backBtnX = 30;
        const backBtnY = screenH - backBtnH - 30;

        if (guiButtons) {
            this.draw9Slice(ctx, guiButtons,
                { x: 303, y: 120, w: 56, h: 56 },
                { x: backBtnX, y: backBtnY, w: backBtnW, h: backBtnH },
                15
            );
        }

        // "Back" text inside backer_2
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '24px "Varela Round", Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Back', backBtnX + backBtnW / 2, backBtnY + backBtnH / 2 + 8);

        // Back button hitbox
        this.backButton = { x: backBtnX, y: backBtnY, w: backBtnW, h: backBtnH };
    }

    handleClick(x, y) {
        if (!this.active) return null;

        // Check back button
        if (this.backButton && this.isInBounds(x, y, this.backButton)) {
            console.log('Back clicked');
            return 'back';
        }

        // Check lobby buttons
        for (const btn of this.lobbyButtons) {
            if (this.isInBounds(x, y, btn)) {
                console.log('Lobby clicked:', btn.lobby.code);
                return { type: 'lobby', code: btn.lobby.code, lobby: btn.lobby };
            }
        }

        // Check map buttons
        for (const [mapId, btn] of Object.entries(this.mapButtons)) {
            if (btn && this.isInBounds(x, y, btn)) {
                this.selectedMap = mapId;
                return null;
            }
        }

        return null;
    }

    isInBounds(x, y, bounds) {
        return x >= bounds.x && x <= bounds.x + bounds.w &&
               y >= bounds.y && y <= bounds.y + bounds.h;
    }

    // Draw a 9-slice scaled sprite
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
