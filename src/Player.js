// Player class - handles movement, animation, and rendering

export class Player {
    constructor(id, x, y, color = 0, isLocal = false) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.color = color; // 0-17 for different colors
        this.isLocal = isLocal;

        // Movement
        this.velocityX = 0;
        this.velocityY = 0;
        this.speed = 100; // pixels per second (scaled for 0.25 map)
        this.moving = false;
        this.facingLeft = false;

        // Animation
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.animationSpeed = 0.1; // seconds per frame

        // State
        this.isDead = false;
        this.isImpostor = false;
        this.inVent = false;
        this.visible = true; // Can be set to false during MedScan
        this.name = `Player ${id}`;
        this.hasVoted = false;
        this.votesReceived = 0;

        // Task state (for showing others when doing a task)
        this.doingTask = false;
        this.currentTaskName = null;

        // MedScan animation state (for other players doing MedScan)
        this.isScanningMedBay = false;
        this.medScanFrame = 0;
        this.medScanTimer = 0;
        this.medScanFrameDuration = 0.1; // Match MedScanTask frame speed

        // Cosmetics
        this.hat = null;
        this.skin = null;
        this.pet = null;

        // Spawn animation state
        this.isSpawning = false;
        this.spawnFrame = 0;
        this.spawnTimer = 0;
        this.spawnFrameDelay = 0.08; // seconds per frame (faster animation)
        this.spawnFrameCount = 10;
    }

    // Start spawn animation
    startSpawnAnimation() {
        this.isSpawning = true;
        this.spawnFrame = 0;
        this.spawnTimer = 0;
    }

    // Update spawn animation
    updateSpawnAnimation(dt) {
        if (!this.isSpawning) return;

        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnFrameDelay) {
            this.spawnTimer = 0;
            this.spawnFrame++;
            if (this.spawnFrame >= this.spawnFrameCount) {
                this.isSpawning = false;
                this.spawnFrame = 0;
            }
        }
    }

    // Player colors (exact hex codes from Among Us)
    static COLORS = [
        { name: 'Red', body: '#c51111', shadow: '#7a0838' },
        { name: 'Blue', body: '#132ed1', shadow: '#09158e' },
        { name: 'Green', body: '#117f2d', shadow: '#0a4d2e' },
        { name: 'Pink', body: '#ed54ba', shadow: '#ab2bad' },
        { name: 'Orange', body: '#ef7d0d', shadow: '#b33e15' },
        { name: 'Yellow', body: '#f5f557', shadow: '#c28722' },
        { name: 'Black', body: '#3f474e', shadow: '#1e1f26' },
        { name: 'White', body: '#d6e0f0', shadow: '#8394bf' },
        { name: 'Purple', body: '#6b2fbb', shadow: '#3b177c' },
        { name: 'Brown', body: '#71491e', shadow: '#5e2615' },
        { name: 'Cyan', body: '#38fedc', shadow: '#24a8be' },
        { name: 'Lime', body: '#50ef39', shadow: '#15a742' },
    ];

    // Walk animation frames (indices into frames array: 0=idle, 1-12=walk)
    static WALK_FRAMES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    static IDLE_FRAME = 0;

    update(dt, inputState) {
        // Debug: log update call periodically
        if (!this._lastUpdateLog || Date.now() - this._lastUpdateLog > 2000) {
            console.log('Player.update called - isLocal:', this.isLocal, 'isSpawning:', this.isSpawning, 'inVent:', this.inVent, 'inputState:', JSON.stringify(inputState));
            this._lastUpdateLog = Date.now();
        }

        // Update spawn animation if active
        if (this.isSpawning) {
            this.updateSpawnAnimation(dt);
            return; // Don't process movement during spawn
        }

        // Dead players can still move as ghosts (but not if in vent)
        if (this.inVent) return;

        // Handle input for local player
        if (this.isLocal && inputState) {
            this.velocityX = 0;
            this.velocityY = 0;

            if (inputState.left) this.velocityX -= 1;
            if (inputState.right) this.velocityX += 1;
            if (inputState.up) this.velocityY -= 1;
            if (inputState.down) this.velocityY += 1;

            // Normalize diagonal movement
            const mag = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
            if (mag > 0) {
                this.velocityX = (this.velocityX / mag) * this.speed;
                this.velocityY = (this.velocityY / mag) * this.speed;
                this.moving = true;
                if (this.velocityX < 0) this.facingLeft = true;
                else if (this.velocityX > 0) this.facingLeft = false;
            } else {
                this.moving = false;
            }
        }

        // Apply movement (only for local player - remote player positions come from network)
        if (this.isLocal) {
            this.x += this.velocityX * dt;
            this.y += this.velocityY * dt;
        }

        // Update animation (for all players based on moving state)
        if (this.moving) {
            this.animationTimer += dt;
            if (this.animationTimer >= this.animationSpeed) {
                this.animationTimer = 0;
                this.animationFrame = (this.animationFrame + 1) % Player.WALK_FRAMES.length;
            }
        } else {
            this.animationFrame = Player.IDLE_FRAME;
            this.animationTimer = 0;
        }
    }

    // Render player using canvas with recolored sprites
    render(ctx, assetLoader, camera, scaleOverride = null, isGhost = false) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // Apply ghost transparency if player is dead
        if (isGhost) {
            ctx.save();
            ctx.globalAlpha = 0.5;
        }

        // If spawning, draw spawn animation instead of player
        if (this.isSpawning && assetLoader?.spawnFrames) {
            const spawnFrame = assetLoader.spawnFrames[this.spawnFrame];
            if (spawnFrame) {
                // Scale spawn animation - 2.3x multiplier for lobby
                const spawnScale = scaleOverride !== null ? scaleOverride * 2.3 : 0.4;
                const drawW = spawnFrame.width * spawnScale;
                const drawH = spawnFrame.height * spawnScale;

                // Frame 10 character position in 1456x816 image:
                // Character center X: ~380px (26% from left)
                // Character feet Y: ~530px (65% from top)
                // Player position is at their feet, so we align feet
                const charFeetX = 380 / 1456; // 0.261
                const charFeetY = 530 / 816;  // 0.65

                const drawX = screenX - (drawW * charFeetX);
                const drawY = screenY - (drawH * charFeetY);

                // Recolor spawn frame to player's color
                const playerColor = Player.COLORS[this.color % Player.COLORS.length];
                const recoloredFrame = this.recolorSpawnFrame(spawnFrame, playerColor);

                ctx.drawImage(
                    recoloredFrame,
                    drawX,
                    drawY,
                    drawW,
                    drawH
                );
            }
            return; // Don't draw normal player during spawn
        }

        ctx.save();
        ctx.translate(screenX, screenY);

        // Flip if facing left
        if (this.facingLeft) {
            ctx.scale(-1, 1);
        }

        // Scale down sprite - use override for lobby (1.0 scale map) vs default for Skeld (0.25 scale)
        const spriteScale = scaleOverride !== null ? scaleOverride : 0.17;

        // Get the player's color
        const playerColor = Player.COLORS[this.color % Player.COLORS.length];

        if (this.moving) {
            const walkSprite = assetLoader?.getSprite('player_walk');
            if (walkSprite && walkSprite.frames.length > 0) {
                const frameIndex = this.animationFrame % walkSprite.frames.length;
                const frame = walkSprite.frames[frameIndex];
                this.drawRecoloredFrame(ctx, walkSprite.texture, frame, spriteScale, playerColor);
            }
        } else {
            const idleSprite = assetLoader?.getSprite('player_idle');
            if (idleSprite && idleSprite.frames.length > 0) {
                const frame = idleSprite.frames[0];
                this.drawRecoloredFrame(ctx, idleSprite.texture, frame, spriteScale, playerColor);
            }
        }

        ctx.restore();

        // Calculate name offset based on scale (lobby uses 0.45, game uses 0.17)
        const nameScale = scaleOverride !== null ? scaleOverride / 0.17 : 1;
        const nameOffset = 28 * nameScale;

        // Draw task indicator if player is doing a task (shows for other players)
        if (this.doingTask && !this.isLocal) {
            this.drawTaskIndicator(ctx, screenX, screenY - 45 * nameScale);
        }

        // Draw name above player
        this.drawName(ctx, screenX, screenY - nameOffset, nameScale);

        // Restore context if ghost mode was applied
        if (isGhost) {
            ctx.restore();
        }
    }

    // Draw a visual indicator that this player is doing a task
    drawTaskIndicator(ctx, x, y) {
        ctx.save();

        // Animated pulsing effect
        const pulse = Math.sin(Date.now() / 200) * 0.2 + 0.8;

        // Draw task icon background (yellow/orange circle)
        ctx.fillStyle = `rgba(255, 200, 50, ${pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();

        // Draw wrench/task icon
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#FFFFFF';

        // Simple wrench shape
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 5);
        ctx.lineTo(x + 5, y + 5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x - 5, y - 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + 5, y + 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    // Draw a sprite frame with recolored pixels (red->body, blue->shadow)
    drawRecoloredFrame(ctx, texture, frame, scale, color) {
        // Create offscreen canvas for recoloring if needed
        if (!Player._recolorCanvas) {
            Player._recolorCanvas = document.createElement('canvas');
            Player._recolorCtx = Player._recolorCanvas.getContext('2d', { willReadFrequently: true });
        }

        const canvas = Player._recolorCanvas;
        const rctx = Player._recolorCtx;

        // Convert Unity coordinates (bottom-left origin) to canvas (top-left origin)
        const textureHeight = texture.height;
        const srcY = textureHeight - frame.y - frame.height;

        canvas.width = frame.width;
        canvas.height = frame.height;

        // Draw original sprite frame
        rctx.clearRect(0, 0, frame.width, frame.height);
        rctx.drawImage(texture, frame.x, srcY, frame.width, frame.height, 0, 0, frame.width, frame.height);

        // Get image data and replace red/blue with player colors
        const imageData = rctx.getImageData(0, 0, frame.width, frame.height);
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
            // Visor outline - dark green becomes black
            else if (g > 50 && g < 120 && r < 80 && b < 80) {
                data[i] = 0;       // R - black
                data[i + 1] = 0;   // G
                data[i + 2] = 0;   // B
            }
            // Visor colors - 3 shades based on green brightness
            else if (g > 100 && r < 120 && b < 180) {
                // Very bright green = visor highlight (inner semicircle)
                if (g > 220) {
                    data[i] = 195;     // R - very light cyan
                    data[i + 1] = 227; // G
                    data[i + 2] = 230; // B
                }
                // Medium green = visor main (middle)
                else if (g > 160) {
                    data[i] = 137;     // R - light cyan
                    data[i + 1] = 207; // G
                    data[i + 2] = 220; // B
                }
                // Darker green = visor shadow (outer edge)
                else {
                    data[i] = 80;      // R - dark cyan/teal
                    data[i + 1] = 140; // G
                    data[i + 2] = 170; // B
                }
            }
        }

        rctx.putImageData(imageData, 0, 0);

        // Apply scale and draw centered on pivot
        const frameScale = frame.renderScale || 1;
        const totalScale = scale * frameScale;

        ctx.save();
        ctx.scale(totalScale, totalScale);
        ctx.drawImage(
            canvas, 0, 0, frame.width, frame.height,
            -frame.width * (frame.pivot?.x || 0.5),
            -frame.height * (frame.pivot?.y || 0.5),
            frame.width, frame.height
        );
        ctx.restore();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    // Recolor spawn animation frame to player's color
    recolorSpawnFrame(frame, color) {
        // Create offscreen canvas for recoloring
        if (!Player._spawnRecolorCanvas) {
            Player._spawnRecolorCanvas = document.createElement('canvas');
            Player._spawnRecolorCtx = Player._spawnRecolorCanvas.getContext('2d', { willReadFrequently: true });
        }

        const canvas = Player._spawnRecolorCanvas;
        const ctx = Player._spawnRecolorCtx;

        canvas.width = frame.width;
        canvas.height = frame.height;

        // Draw original frame
        ctx.clearRect(0, 0, frame.width, frame.height);
        ctx.drawImage(frame, 0, 0);

        // Get image data and replace red/blue with player colors
        const imageData = ctx.getImageData(0, 0, frame.width, frame.height);
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
            // Visor outline - dark green becomes black
            else if (g > 50 && g < 120 && r < 80 && b < 80) {
                data[i] = 0;       // R - black
                data[i + 1] = 0;   // G
                data[i + 2] = 0;   // B
            }
            // Visor colors - 3 shades based on green brightness
            else if (g > 100 && r < 120 && b < 180) {
                // Very bright green = visor highlight
                if (g > 220) {
                    data[i] = 195;
                    data[i + 1] = 227;
                    data[i + 2] = 230;
                }
                // Medium green = visor main
                else if (g > 160) {
                    data[i] = 137;
                    data[i + 1] = 207;
                    data[i + 2] = 220;
                }
                // Darker green = visor shadow
                else {
                    data[i] = 80;
                    data[i + 1] = 140;
                    data[i + 2] = 170;
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    drawName(ctx, x, y, scale = 1) {
        ctx.save();
        const fontSize = Math.round(8 * scale);
        ctx.font = `${fontSize}px "Varela Round", Arial`;
        ctx.textAlign = 'center';
        // Truncate name to first 4 and last 4 characters for display
        const displayName = this.truncateNameForDisplay(this.name);
        // Thin black outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(1, scale * 0.5);
        ctx.strokeText(displayName, x, y);
        // White fill (or red for impostor)
        ctx.fillStyle = this.isImpostor ? '#FF0000' : '#FFFFFF';
        ctx.fillText(displayName, x, y);
        ctx.restore();
    }

    // Truncate name for in-game display (first 4...last 4)
    truncateNameForDisplay(name) {
        if (!name || name.length <= 10) return name;
        return name.slice(0, 4) + '...' + name.slice(-4);
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }

    kill() {
        this.isDead = true;
    }

    // Serialize for network
    serialize() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            color: this.color,
            velocityX: this.velocityX,
            velocityY: this.velocityY,
            moving: this.moving,
            facingLeft: this.facingLeft,
            isDead: this.isDead,
            name: this.name
        };
    }

    // Update from network data
    deserialize(data) {
        this.x = data.x;
        this.y = data.y;
        this.velocityX = data.velocityX || 0;
        this.velocityY = data.velocityY || 0;
        this.moving = data.moving || false;
        this.facingLeft = data.facingLeft || false;
        this.isDead = data.isDead || false;
        this.name = data.name || this.name;
    }
}
