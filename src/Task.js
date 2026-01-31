// Task system - base class and task implementations

export class Task {
    constructor(name, room, x, y) {
        this.name = name;
        this.room = room;
        this.x = x;
        this.y = y;
        this.completed = false;
        this.active = false;
    }

    // Override in subclasses
    start() {
        this.active = true;
    }

    close() {
        this.active = false;
    }

    update(dt) {}

    render(ctx, assetLoader) {}

    handleClick(x, y) {
        return false;
    }

    handleDrag(x, y) {}

    handleRelease() {}
}

export class WiresTask extends Task {
    constructor(room, x, y) {
        super('Fix Wiring', room, x, y);

        // Multi-step task properties
        this.enabled = true;   // Whether this step is enabled
        this.nextWire = null;  // Next wiring task in sequence

        // Task panel dimensions - using actual sprite size
        this.panelWidth = 508;
        this.panelHeight = 500;
        this.scale = 1.2;

        // Wire connection state
        this.connections = new Map(); // left index -> right index
        this.draggingWire = null;
        this.dragX = 0;
        this.dragY = 0;

        // Wire colors (RGB values) - red, yellow, pink, blue
        this.wireColors = [
            { r: 197, g: 17, b: 17 },    // Red
            { r: 245, g: 245, b: 87 },   // Yellow
            { r: 237, g: 84, b: 186 },   // Pink
            { r: 19, g: 46, b: 209 }     // Blue
        ];

        // Wire sprite coordinates from texture (the wire extension piece)
        this.wireSprite = { x: 164, y: 505, w: 91, h: 23 };

        // Wire fill sprite (darker color to fill transparent gaps)
        this.wireFill = { x: 3, y: 509, w: 29, h: 13 };

        // Copper wire end pieces (not color-tinted)
        this.copperLeft = { x: 93, y: 509, w: 36, h: 24 };   // Left side copper
        this.copperRight = { x: 128, y: 508, w: 37, h: 29 }; // Right side copper (flip horizontally)

        // Slot dimensions for hitbox detection
        this.slotWidth = 28;
        this.slotHeight = 55;

        // Wire colors order will be randomized on start
        this.leftColors = [];
        this.rightColors = [];

        // Cached tinted wire canvases
        this.tintedWires = null;
    }

    start() {
        super.start();
        // Reset and randomize wire colors
        this.connections.clear();
        this.draggingWire = null;

        // Randomize which color goes to which slot (0-3)
        const colors = [0, 1, 2, 3];
        this.leftColors = [...colors].sort(() => Math.random() - 0.5);
        this.rightColors = [...colors].sort(() => Math.random() - 0.5);

        // Clear tinted wire cache so it regenerates
        this.tintedWires = null;
    }

    // Create tinted versions of the wire sprite for each color
    createTintedWires(texture) {
        this.tintedWires = [];

        for (let i = 0; i < 4; i++) {
            const color = this.wireColors[i];

            // Create canvas for the wire extension sprite
            const wireCanvas = document.createElement('canvas');
            wireCanvas.width = this.wireSprite.w;
            wireCanvas.height = this.wireSprite.h;
            const wireCtx = wireCanvas.getContext('2d');

            // First draw the fill sprite tiled (NOT tinted - keep original colors)
            // Scale the fill height a bit to make it wider behind the wire
            const fillScaleH = 1.4;
            const scaledFillH = this.wireFill.h * fillScaleH;
            for (let x = 0; x < this.wireSprite.w; x += this.wireFill.w) {
                const yOffset = (this.wireSprite.h - scaledFillH) / 2;
                wireCtx.drawImage(
                    texture,
                    this.wireFill.x, this.wireFill.y,
                    this.wireFill.w, this.wireFill.h,
                    x, yOffset,
                    this.wireFill.w, scaledFillH
                );
            }

            // Create a separate canvas for the tinted main wire sprite
            const mainWireCanvas = document.createElement('canvas');
            mainWireCanvas.width = this.wireSprite.w;
            mainWireCanvas.height = this.wireSprite.h;
            const mainWireCtx = mainWireCanvas.getContext('2d');

            // Draw the main wire sprite
            mainWireCtx.drawImage(
                texture,
                this.wireSprite.x, this.wireSprite.y,
                this.wireSprite.w, this.wireSprite.h,
                0, 0,
                this.wireSprite.w, this.wireSprite.h
            );

            // Tint only the main wire sprite pixels
            const imageData = mainWireCtx.getImageData(0, 0, this.wireSprite.w, this.wireSprite.h);
            const data = imageData.data;

            for (let p = 0; p < data.length; p += 4) {
                const a = data[p + 3];
                if (a === 0) continue;

                const r = data[p];
                const g = data[p + 1];
                const b = data[p + 2];

                const brightness = (r + g + b) / (3 * 255);
                const adjustedBrightness = 0.3 + brightness * 0.7;

                data[p] = Math.round(color.r * adjustedBrightness);
                data[p + 1] = Math.round(color.g * adjustedBrightness);
                data[p + 2] = Math.round(color.b * adjustedBrightness);
            }

            mainWireCtx.putImageData(imageData, 0, 0);

            // Draw the tinted main wire on top of the untinted fill
            wireCtx.drawImage(mainWireCanvas, 0, 0);

            this.tintedWires.push({
                wire: wireCanvas,
                color: color
            });
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const texture = assetLoader?.getTexture('wires_panel');
        if (!texture) return;

        // Create tinted wires if not already done
        if (!this.tintedWires) {
            this.createTintedWires(texture);
        }

        // Center the panel on screen
        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;
        const panelW = this.panelWidth * this.scale;
        const panelH = this.panelHeight * this.scale;
        const panelX = (screenW - panelW) / 2;
        const panelY = (screenH - panelH) / 2;

        // Dark overlay behind panel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        // Draw the panel background (already has the colored wires in it)
        ctx.drawImage(texture, 0, 0, 508, 500, panelX, panelY, panelW, panelH);

        // Y positions of the 4 wire slots (center Y where wires connect)
        const wireYPositions = [
            panelY + 90 * this.scale,
            panelY + 207 * this.scale,
            panelY + 324 * this.scale,
            panelY + 440 * this.scale
        ];

        const wireH = this.wireSprite.h * this.scale;
        const copperW = this.copperLeft.w * this.scale;
        const copperH = this.copperLeft.h * this.scale;

        // Where copper pieces are positioned
        const leftCopperX = panelX + 58 * this.scale;  // Left copper position
        const rightCopperX = panelX + panelW - 58 * this.scale - copperW;  // Right copper position

        // Store hitboxes for interaction
        this.leftHitboxes = [];
        this.rightHitboxes = [];

        // Build hitboxes first (before drawing anything)
        for (let i = 0; i < 4; i++) {
            const colorIndex = this.leftColors[i];
            const centerY = wireYPositions[i];

            this.leftHitboxes.push({
                x: panelX,
                y: centerY - 30,
                w: leftCopperX + copperW - panelX,
                h: 60,
                colorIndex: colorIndex,
                slotIndex: i,
                centerY: centerY,
                copperX: leftCopperX,
                copperCenterX: leftCopperX + copperW / 2
            });
        }

        for (let i = 0; i < 4; i++) {
            const colorIndex = this.rightColors[i];
            const centerY = wireYPositions[i];

            this.rightHitboxes.push({
                x: rightCopperX,
                y: centerY - 30,
                w: panelX + panelW - rightCopperX,
                h: 60,
                colorIndex: colorIndex,
                slotIndex: i,
                centerY: centerY,
                copperX: rightCopperX,
                copperCenterX: rightCopperX + copperW / 2
            });
        }

        // Draw RIGHT side: wire from panel edge to copper, then copper on top
        for (let i = 0; i < 4; i++) {
            const colorIndex = this.rightColors[i];
            const tinted = this.tintedWires[colorIndex];
            const centerY = wireYPositions[i];

            // Draw wire from right panel edge to copper
            const wireEndX = panelX + panelW - 5 * this.scale;  // Right edge
            const wireLength = wireEndX - (rightCopperX + copperW);

            ctx.save();
            ctx.translate(rightCopperX + copperW, centerY);
            ctx.drawImage(tinted.wire, 0, -wireH / 2, wireLength, wireH);
            ctx.restore();

            // Right copper piece (flipped horizontally)
            ctx.save();
            ctx.translate(rightCopperX + copperW, centerY - copperH / 2);
            ctx.scale(-1, 1);
            ctx.drawImage(
                texture,
                this.copperRight.x, this.copperRight.y,
                this.copperRight.w, this.copperRight.h,
                0, 0,
                copperW, copperH
            );
            ctx.restore();
        }

        // Draw each left wire: wire from panel edge to copper, then copper on top
        // Left copper MOVES when dragging or connected
        for (let i = 0; i < 4; i++) {
            const colorIndex = this.leftColors[i];
            const tinted = this.tintedWires[colorIndex];
            const startY = this.leftHitboxes[i].centerY;
            const wireStartX = panelX + 5 * this.scale; // Wire starts at left panel edge

            let copperEndX, copperEndY;

            if (this.draggingWire === i) {
                // Dragging this wire - copper follows mouse
                copperEndX = this.dragX - copperW / 2;
                copperEndY = this.dragY;
            } else if (this.connections.has(i)) {
                // Connected - copper is at the right side target
                const rightSlot = this.connections.get(i);
                copperEndX = this.rightHitboxes[rightSlot].copperX;
                copperEndY = this.rightHitboxes[rightSlot].centerY;
            } else {
                // Not dragging, not connected - copper stays at start position
                copperEndX = leftCopperX;
                copperEndY = startY;
            }

            // Draw the wire from panel edge to copper position
            const dx = copperEndX - wireStartX;
            const dy = copperEndY - startY;
            const angle = Math.atan2(dy, dx);
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length > 5) {
                ctx.save();
                ctx.translate(wireStartX, startY);
                ctx.rotate(angle);
                ctx.drawImage(tinted.wire, 0, -wireH / 2, length, wireH);
                ctx.restore();
            }

            // Draw the left copper piece at its current position
            ctx.drawImage(
                texture,
                this.copperLeft.x, this.copperLeft.y,
                this.copperLeft.w, this.copperLeft.h,
                copperEndX, copperEndY - copperH / 2,
                copperW, copperH
            );
        }

    }

    handleClick(x, y) {
        if (!this.active) return false;

        // Check if clicking on a left side wire
        if (this.leftHitboxes) {
            for (let i = 0; i < this.leftHitboxes.length; i++) {
                const hb = this.leftHitboxes[i];
                if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) {
                    // Don't allow re-dragging already connected wires
                    if (!this.connections.has(hb.slotIndex)) {
                        this.draggingWire = hb.slotIndex;
                        this.dragX = x;
                        this.dragY = y;
                        return true;
                    }
                }
            }
        }
        return false;
    }

    handleDrag(x, y) {
        if (this.draggingWire !== null) {
            this.dragX = x;
            this.dragY = y;
        }
    }

    handleRelease() {
        if (this.draggingWire === null) return;

        // Check if releasing on a right side wire with matching color
        if (this.rightHitboxes) {
            const dragColorIndex = this.leftColors[this.draggingWire];

            for (let i = 0; i < this.rightHitboxes.length; i++) {
                const hb = this.rightHitboxes[i];
                if (this.dragX >= hb.x && this.dragX <= hb.x + hb.w &&
                    this.dragY >= hb.y && this.dragY <= hb.y + hb.h) {
                    // Check if colors match
                    if (hb.colorIndex === dragColorIndex) {
                        // Connect the wire
                        this.connections.set(this.draggingWire, hb.slotIndex);
                        console.log(`Connected wire ${this.draggingWire} to slot ${hb.slotIndex}`);

                        // Check if all 4 wires are connected
                        if (this.connections.size === 4) {
                            this.completed = true;
                            console.log('Wires task completed!');
                            // Enable the next wiring task if this is a multi-step task
                            if (this.nextWire) {
                                this.nextWire.enabled = true;
                                console.log('Next wiring panel enabled: ' + this.nextWire.room);
                            }
                        }
                    }
                    break;
                }
            }
        }

        this.draggingWire = null;
    }
}

// Divert Power Task - Part 1 (in Electrical) - slide switch up
export class DivertPowerTask extends Task {
    constructor(room, x, y, targetRoom = 'Weapons', receiveTask = null) {
        super('Divert Power', room, x, y);
        this.targetRoom = targetRoom;
        this.receiveTask = receiveTask; // Link to the receive task

        // Slide switch up
        this.switchY = 0; // 0 = bottom, 1 = top
        this.isDragging = false;
        this.dragStartY = 0;
        this.switchStartY = 0;
    }

    start() {
        super.start();
        this.switchY = 0;
        this.isDragging = false;
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const baseTexture = assetLoader?.getTexture('divert_base');
        const switchTexture = assetLoader?.getTexture('divert_switch');

        if (!baseTexture) return;

        // Scale to fit nicely on screen
        const scale = 1.2;
        const baseW = 500 * scale;
        const baseH = 500 * scale;
        const baseX = (screenW - baseW) / 2;
        const baseY = (screenH - baseH) / 2;

        // Draw base panel
        ctx.drawImage(baseTexture, baseX, baseY, baseW, baseH);

        // Draw switch - slides from bottom to top on one of the slider tracks
        if (switchTexture) {
            const switchW = 46 * scale * 0.6;
            const switchH = 36 * scale * 0.6;

            // Track positions
            const trackPositions = [47, 102, 157, 212, 267, 322, 377, 432];
            const trackIndex = 3; // Shields track
            const trackCenterX = baseX + (trackPositions[trackIndex] + 8) * scale;

            const trackTop = baseY + 320 * scale;
            const trackBottom = baseY + 470 * scale;
            const trackHeight = trackBottom - trackTop - switchH;

            const switchX = trackCenterX - switchW / 2;
            const switchYPos = trackBottom - switchH - (this.switchY * trackHeight);

            this.switchHitbox = { x: switchX, y: switchYPos, w: switchW, h: switchH };
            this.trackTop = trackTop;
            this.trackBottom = trackBottom - switchH;

            ctx.drawImage(switchTexture, switchX, switchYPos, switchW, switchH);
        }
    }

    handleClick(x, y) {
        if (!this.active) return false;

        if (this.switchHitbox &&
            x >= this.switchHitbox.x && x <= this.switchHitbox.x + this.switchHitbox.w &&
            y >= this.switchHitbox.y && y <= this.switchHitbox.y + this.switchHitbox.h) {
            this.isDragging = true;
            this.dragStartY = y;
            this.switchStartY = this.switchY;
            return true;
        }
        return false;
    }

    handleDrag(x, y) {
        if (!this.isDragging) return;

        const deltaY = this.dragStartY - y;
        const trackHeight = this.trackBottom - this.trackTop;
        this.switchY = Math.max(0, Math.min(1, this.switchStartY + deltaY / trackHeight));
    }

    handleRelease() {
        if (!this.isDragging) return;
        this.isDragging = false;

        if (this.switchY >= 0.9) {
            console.log('Divert phase complete! Go to ' + this.targetRoom + ' to accept power.');
            this.completed = true;
            // Enable the receive task
            if (this.receiveTask) {
                this.receiveTask.enabled = true;
            }
        } else {
            this.switchY = 0;
        }
    }
}

// Receive Power Task - Part 2 (in target room) - rotate switch
export class ReceivePowerTask extends Task {
    constructor(room, x, y) {
        super('Accept Diverted Power', room, x, y);

        // This task is disabled until divert is completed
        this.enabled = false;

        // Rotate switch
        this.switchAngle = 0;
        this.isDragging = false;
        this.dragStartAngle = 0;
        this.rotationStartAngle = 0;
    }

    start() {
        if (!this.enabled) {
            console.log('Power not diverted yet! Go to Electrical first.');
            this.active = false;
            return;
        }
        super.start();
        this.switchAngle = 0;
        this.isDragging = false;
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const bgTexture = assetLoader?.getTexture('receive_bg');
        const switchTexture = assetLoader?.getTexture('receive_switch');

        if (!bgTexture) return;

        const scale = 1.5;
        const bgW = 424 * scale;
        const bgH = 250 * scale;
        const bgX = (screenW - bgW) / 2;
        const bgY = (screenH - bgH) / 2;

        ctx.drawImage(bgTexture, bgX, bgY, bgW, bgH);

        if (switchTexture) {
            const switchW = 19 * scale;
            const switchH = 57 * scale;
            const centerX = bgX + bgW / 2;
            const centerY = bgY + bgH / 2;

            this.switchCenter = { x: centerX, y: centerY };
            this.switchRadius = switchH / 2;

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(this.switchAngle);
            ctx.drawImage(switchTexture, -switchW / 2, -switchH / 2, switchW, switchH);
            ctx.restore();
        }
    }

    handleClick(x, y) {
        if (!this.active) return false;

        if (this.switchCenter) {
            const dx = x - this.switchCenter.x;
            const dy = y - this.switchCenter.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.switchRadius * 1.5) {
                this.isDragging = true;
                this.dragStartAngle = Math.atan2(dy, dx);
                this.rotationStartAngle = this.switchAngle;
                return true;
            }
        }
        return false;
    }

    handleDrag(x, y) {
        if (!this.isDragging || !this.switchCenter) return;

        const dx = x - this.switchCenter.x;
        const dy = y - this.switchCenter.y;
        const currentAngle = Math.atan2(dy, dx);
        const deltaAngle = currentAngle - this.dragStartAngle;
        this.switchAngle = this.rotationStartAngle + deltaAngle;
    }

    handleRelease() {
        if (!this.isDragging) return;
        this.isDragging = false;

        const angleDeg = Math.abs(this.switchAngle) * (180 / Math.PI);
        if (angleDeg >= 80 && angleDeg <= 100) {
            console.log('Power accepted! Task complete!');
            this.completed = true;
        }
    }
}

// MedScan Task - Two phases: 1) show panel until click, 2) scanning sprite for 5 seconds
export class MedScanTask extends Task {
    constructor(room, x, y) {
        super('Submit Scan', room, x, y);

        // Phase: 'panel' or 'scanning'
        this.phase = 'panel';

        // Timer for scanning - 5 seconds total
        this.scanDuration = 5.0;
        this.timer = 0;

        // Animation frames for scanning - cycle through all 5 frames rapidly
        // 10 full cycles in 5 seconds = 50 frames total, so each frame ~0.1s
        this.scanFrames = [
            { x: 954, y: 0, w: 45, h: 62 },
            { x: 971, y: 116, w: 53, h: 68 },
            { x: 935, y: 243, w: 50, h: 66 },
            { x: 984, y: 184, w: 49, h: 61 },
            { x: 1023, y: 119, w: 53, h: 65 },
        ];
        this.currentFrame = 0;
        this.frameTimer = 0;
        this.frameDuration = 0.1; // Each frame lasts 0.1 seconds (10 cycles in 5 sec)

        // Map position where scanning happens
        this.scanMapX = 922;
        this.scanMapY = 533;

        // Reference to game
        this.game = null;
    }

    start() {
        super.start();
        this.phase = 'panel';
        this.timer = 0;
        this.currentFrame = 0;
        this.frameTimer = 0;
    }

    update(dt) {
        if (!this.active) return;

        // Only count down during scanning phase
        if (this.phase === 'scanning') {
            this.timer -= dt;
            this.frameTimer += dt;

            // Advance animation frame - loop through all frames
            if (this.frameTimer >= this.frameDuration) {
                this.frameTimer = 0;
                this.currentFrame = (this.currentFrame + 1) % this.scanFrames.length;
            }

            if (this.timer <= 0) {
                // Scanning complete - show player again
                if (this.game && this.game.localPlayer) {
                    this.game.localPlayer.visible = true;
                }
                // Notify network that scan is complete
                if (this.game && this.game.network && this.game.network.connected) {
                    console.log('Sending medscan_end to network');
                    this.game.network.sendMedScanEnd();
                }
                this.completed = true;
            }
        }
    }

    render(ctx, assetLoader, camera, game) {
        if (!this.active) return;

        this.game = game;
        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        if (this.phase === 'panel') {
            // Show SCAN-MO-TRON-2000 panel
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, screenW, screenH);

            const panelTexture = assetLoader?.getTexture('medscan_panel');
            if (panelTexture) {
                const scale = 0.6;
                const panelW = panelTexture.width * scale;
                const panelH = panelTexture.height * scale;
                const panelX = (screenW - panelW) / 2;
                const panelY = (screenH - panelH) / 2;

                ctx.drawImage(panelTexture, panelX, panelY, panelW, panelH);
            }
        } else if (this.phase === 'scanning') {
            // Hide player during scanning
            if (this.game && this.game.localPlayer && this.game.localPlayer.visible !== false) {
                this.game.localPlayer.visible = false;
                this.game.localPlayer.x = this.scanMapX;
                this.game.localPlayer.y = this.scanMapY;
            }
        }
    }

    // Render the scanning sprite on the map
    renderWorldSprite(ctx, assetLoader, camera) {
        if (!this.active || this.phase !== 'scanning') return;

        const medbaySprites = assetLoader?.getTexture('medbay_sprites');
        if (!medbaySprites) return;

        // Get current animation frame
        const frame = this.scanFrames[this.currentFrame];

        // Draw scanning sprite at map position
        const screenX = this.scanMapX - camera.x;
        const screenY = this.scanMapY - camera.y;

        // Use consistent scale factor for all frames (scale source to ~0.5x)
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

    handleClick(x, y) {
        if (!this.active) return false;

        // Click during panel phase starts scanning
        if (this.phase === 'panel') {
            this.phase = 'scanning';
            this.timer = this.scanDuration;

            // Notify network that scanning animation started
            if (this.game && this.game.network && this.game.network.connected) {
                console.log('Sending medscan_start to network');
                this.game.network.sendMedScanStart();
            } else {
                console.log('Cannot send medscan_start - network not available:',
                    !!this.game, !!this.game?.network, this.game?.network?.connected);
            }
            return true;
        }
        return false;
    }

    handleDrag(x, y) {}
    handleRelease() {}
}

// Stabilize Steering Task - Drag target crosshair to center of radar circle
export class StabilizeSteeringTask extends Task {
    constructor(room, x, y) {
        super('Stabilize Steering', room, x, y);

        // Target position (offset from center, 0,0 = centered)
        this.targetOffsetX = 0;
        this.targetOffsetY = 0;

        // Drag state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.targetStartX = 0;
        this.targetStartY = 0;

        // Hitbox for target
        this.targetHitbox = null;

        // Center position (calculated during render)
        this.centerX = 0;
        this.centerY = 0;
        this.maxOffset = 0; // Max distance target can be from center
    }

    start() {
        super.start();
        this.isDragging = false;

        // Randomize target starting position within the circle
        // Place it at a random angle and distance from center
        const angle = Math.random() * Math.PI * 2;
        const distance = 60 + Math.random() * 40; // 60-100 pixels from center
        this.targetOffsetX = Math.cos(angle) * distance;
        this.targetOffsetY = Math.sin(angle) * distance;
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const baseTexture = assetLoader?.getTexture('stabilize_base');
        const graphTexture = assetLoader?.getTexture('stabilize_graph');
        const targetTexture = assetLoader?.getTexture('stabilize_target');

        if (!baseTexture || !graphTexture) return;

        // Scale to fit nicely on screen
        const scale = 1.2;
        const baseW = baseTexture.width * scale;
        const baseH = baseTexture.height * scale;
        const baseX = (screenW - baseW) / 2;
        const baseY = (screenH - baseH) / 2;

        // Draw base panel (gray frame)
        ctx.drawImage(baseTexture, baseX, baseY, baseW, baseH);

        // Draw graph (blue radar circle) centered in the base
        const graphW = graphTexture.width * scale;
        const graphH = graphTexture.height * scale;
        const graphX = baseX + (baseW - graphW) / 2;
        const graphY = baseY + (baseH - graphH) / 2;

        ctx.drawImage(graphTexture, graphX, graphY, graphW, graphH);

        // Calculate center point (where target needs to go)
        this.centerX = graphX + graphW / 2;
        this.centerY = graphY + graphH / 2;
        this.maxOffset = (graphW / 2) - 20; // Keep target inside circle

        // Draw target crosshair at current offset position
        if (targetTexture) {
            const targetW = targetTexture.width * scale;
            const targetH = targetTexture.height * scale;
            const targetX = this.centerX + this.targetOffsetX - targetW / 2;
            const targetY = this.centerY + this.targetOffsetY - targetH / 2;

            ctx.drawImage(targetTexture, targetX, targetY, targetW, targetH);

            // Store hitbox for click detection (larger than visual for easier grabbing)
            this.targetHitbox = {
                x: targetX - 10,
                y: targetY - 10,
                w: targetW + 20,
                h: targetH + 20
            };
        }
    }

    handleClick(x, y) {
        if (!this.active) return false;

        // Check if clicking on the target crosshair
        if (this.targetHitbox &&
            x >= this.targetHitbox.x && x <= this.targetHitbox.x + this.targetHitbox.w &&
            y >= this.targetHitbox.y && y <= this.targetHitbox.y + this.targetHitbox.h) {
            this.isDragging = true;
            this.dragStartX = x;
            this.dragStartY = y;
            this.targetStartX = this.targetOffsetX;
            this.targetStartY = this.targetOffsetY;
            return true;
        }
        return false;
    }

    handleDrag(x, y) {
        if (!this.isDragging) return;

        // Update target position based on drag
        const deltaX = x - this.dragStartX;
        const deltaY = y - this.dragStartY;

        let newOffsetX = this.targetStartX + deltaX;
        let newOffsetY = this.targetStartY + deltaY;

        // Clamp to stay within the circle
        const dist = Math.sqrt(newOffsetX * newOffsetX + newOffsetY * newOffsetY);
        if (dist > this.maxOffset) {
            const scale = this.maxOffset / dist;
            newOffsetX *= scale;
            newOffsetY *= scale;
        }

        this.targetOffsetX = newOffsetX;
        this.targetOffsetY = newOffsetY;
    }

    handleRelease() {
        if (!this.isDragging) return;
        this.isDragging = false;

        // Check if target is close enough to center
        const dist = Math.sqrt(this.targetOffsetX * this.targetOffsetX + this.targetOffsetY * this.targetOffsetY);

        if (dist < 15) {
            // Snap to center and complete
            this.targetOffsetX = 0;
            this.targetOffsetY = 0;
            this.completed = true;
            console.log('Stabilize Steering complete!');
        }
    }
}

// Download Data Task - Part 1 of Upload/Download multi-task
// Player clicks to start, then waits 10 seconds while progress bar fills
export class DownloadDataTask extends Task {
    constructor(room, x, y, uploadTask = null) {
        super('Download Data', room, x, y);
        this.uploadTask = uploadTask; // Link to the upload task (part 2)

        // Progress state
        this.isDownloading = false;
        this.progress = 0; // 0 to 1
        this.duration = 10.0; // 10 seconds to complete

        // Sprite coordinates from assembler (UploadData sprite sheet)
        // Note: y:656 = Download button, y:689 = Upload button in the sprite sheet
        this.sprites = {
            panel: { x: 0, y: 1, w: 504, h: 327 },         // Main panel with folders
            progressBar: { x: 0, y: 562, w: 392, h: 27 },  // Progress bar background
            downloadBtn: { x: 118, y: 656, w: 90, h: 31 }, // "Download" button
            uploadBtn: { x: 118, y: 689, w: 90, h: 27 },   // "Upload" button
            antenna: { x: 208, y: 655, w: 56, h: 45 },     // Wifi/antenna icon
        };

        // Panel layout
        this.panelScale = 1.3;
    }

    start() {
        super.start();
        this.isDownloading = false;
        this.progress = 0;
    }

    update(dt) {
        if (!this.active || !this.isDownloading) return;

        // Progress the download
        this.progress += dt / this.duration;

        if (this.progress >= 1) {
            this.progress = 1;
            this.isDownloading = false;
            this.completed = true;
            console.log('Download complete! Go to Admin to upload.');

            // Enable the upload task
            if (this.uploadTask) {
                this.uploadTask.enabled = true;
            }
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const texture = assetLoader?.getTexture('upload_data');
        if (!texture) return;

        const scale = this.panelScale;
        const panel = this.sprites.panel;
        const panelW = panel.w * scale;
        const panelH = panel.h * scale;
        const panelX = (screenW - panelW) / 2;
        const panelY = (screenH - panelH) / 2;

        // Draw main panel
        ctx.drawImage(
            texture,
            panel.x, panel.y, panel.w, panel.h,
            panelX, panelY, panelW, panelH
        );

        // Draw progress bar background (white bar)
        const bar = this.sprites.progressBar;
        const barW = bar.w * scale;
        const barH = bar.h * scale;
        const barX = panelX + (panelW - barW) / 2;
        const barY = panelY + 200 * scale;

        ctx.drawImage(
            texture,
            bar.x, bar.y, bar.w, bar.h,
            barX, barY, barW, barH
        );

        // Draw green progress fill on top
        if (this.progress > 0) {
            const fillW = barW * this.progress;
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(barX + 4, barY + 4, fillW - 8, barH - 8);
        }

        // Draw download button sprite (centered above progress bar)
        const btn = this.sprites.downloadBtn;
        const btnW = btn.w * scale;
        const btnH = btn.h * scale;
        const btnX = panelX + (panelW - btnW) / 2;
        const btnY = barY - btnH - 20 * scale;

        ctx.drawImage(
            texture,
            btn.x, btn.y, btn.w, btn.h,
            btnX, btnY, btnW, btnH
        );

        // Draw antenna icon above the button
        const antenna = this.sprites.antenna;
        const antennaW = antenna.w * scale;
        const antennaH = antenna.h * scale;
        const antennaX = panelX + (panelW - antennaW) / 2;
        const antennaY = btnY - antennaH - 10 * scale;

        ctx.drawImage(
            texture,
            antenna.x, antenna.y, antenna.w, antenna.h,
            antennaX, antennaY, antennaW, antennaH
        );
    }

    handleClick(x, y) {
        if (!this.active) return false;

        // Click anywhere to start downloading (if not already)
        if (!this.isDownloading && this.progress === 0) {
            this.isDownloading = true;
            console.log('Starting download...');
            return true;
        }
        return false;
    }

    handleDrag(x, y) {}
    handleRelease() {}
}

// Upload Data Task - Part 2 of Upload/Download multi-task
// Only enabled after download is complete
export class UploadDataTask extends Task {
    constructor(room, x, y) {
        super('Upload Data', room, x, y);

        // This task is disabled until download is complete
        this.enabled = false;

        // Progress state
        this.isUploading = false;
        this.progress = 0;
        this.duration = 10.0; // 10 seconds

        // Same sprites as download
        // Note: y:656 = Download button, y:689 = Upload button in the sprite sheet
        this.sprites = {
            panel: { x: 0, y: 1, w: 504, h: 327 },
            progressBar: { x: 0, y: 562, w: 392, h: 27 },
            downloadBtn: { x: 118, y: 656, w: 90, h: 31 },
            uploadBtn: { x: 118, y: 689, w: 90, h: 27 },
            antenna: { x: 208, y: 655, w: 56, h: 45 },
        };

        this.panelScale = 1.3;
    }

    start() {
        if (!this.enabled) {
            console.log('Download not complete yet! Go download data first.');
            this.active = false;
            return;
        }
        super.start();
        this.isUploading = false;
        this.progress = 0;
    }

    update(dt) {
        if (!this.active || !this.isUploading) return;

        this.progress += dt / this.duration;

        if (this.progress >= 1) {
            this.progress = 1;
            this.isUploading = false;
            this.completed = true;
            console.log('Upload complete! Task finished.');
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const texture = assetLoader?.getTexture('upload_data');
        if (!texture) return;

        const scale = this.panelScale;
        const panel = this.sprites.panel;
        const panelW = panel.w * scale;
        const panelH = panel.h * scale;
        const panelX = (screenW - panelW) / 2;
        const panelY = (screenH - panelH) / 2;

        // Draw main panel
        ctx.drawImage(
            texture,
            panel.x, panel.y, panel.w, panel.h,
            panelX, panelY, panelW, panelH
        );

        // Draw progress bar background
        const bar = this.sprites.progressBar;
        const barW = bar.w * scale;
        const barH = bar.h * scale;
        const barX = panelX + (panelW - barW) / 2;
        const barY = panelY + 200 * scale;

        ctx.drawImage(
            texture,
            bar.x, bar.y, bar.w, bar.h,
            barX, barY, barW, barH
        );

        // Draw green progress fill
        if (this.progress > 0) {
            const fillW = barW * this.progress;
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(barX + 4, barY + 4, fillW - 8, barH - 8);
        }

        // Draw upload button sprite (centered above progress bar)
        const btn = this.sprites.uploadBtn;
        const btnW = btn.w * scale;
        const btnH = btn.h * scale;
        const btnX = panelX + (panelW - btnW) / 2;
        const btnY = barY - btnH - 20 * scale;

        ctx.drawImage(
            texture,
            btn.x, btn.y, btn.w, btn.h,
            btnX, btnY, btnW, btnH
        );

        // Draw antenna icon above the button (flipped for upload)
        const antenna = this.sprites.antenna;
        const antennaW = antenna.w * scale;
        const antennaH = antenna.h * scale;
        const antennaX = panelX + (panelW - antennaW) / 2;
        const antennaY = btnY - antennaH - 10 * scale;

        ctx.save();
        ctx.translate(antennaX + antennaW / 2, antennaY + antennaH / 2);
        ctx.scale(1, -1); // Flip vertically for upload
        ctx.drawImage(
            texture,
            antenna.x, antenna.y, antenna.w, antenna.h,
            -antennaW / 2, -antennaH / 2, antennaW, antennaH
        );
        ctx.restore();
    }

    handleClick(x, y) {
        if (!this.active) return false;

        if (!this.isUploading && this.progress === 0) {
            this.isUploading = true;
            console.log('Starting upload...');
            return true;
        }
        return false;
    }

    handleDrag(x, y) {}
    handleRelease() {}
}

// Clear Asteroids Task - Shoot 20 asteroids flying across the screen
export class ClearAsteroidsTask extends Task {
    constructor(room, x, y) {
        super('Clear Asteroids', room, x, y);

        // Sprite coordinates from lasso cutter
        this.sprites = {
            bg: { x: 0, y: 0, w: 509, h: 509 },
            aimer: { x: 439, y: 711, w: 75, h: 77 },
            explosion: { x: 275, y: 703, w: 168, h: 161 },
            // Normal asteroids
            asteroids: [
                { x: 6, y: 822, w: 129, h: 108 },    // asteroid5
                { x: 124, y: 773, w: 177, h: 125 },  // asteroid6
                { x: 148, y: 891, w: 114, h: 91 },   // asteroid7
                { x: 256, y: 856, w: 163, h: 90 },   // asteroid8
                { x: 416, y: 783, w: 99, h: 123 },   // asteroid9
            ],
            // Broken asteroids (shown after hit)
            broken: [
                { x: 6, y: 822, w: 129, h: 108 },      // asteroid5 break (reuse normal for now)
                { x: 4, y: 505, w: 216, h: 181 },      // asteroid6 break
                { x: 1, y: 675, w: 169, h: 154 },      // asteroid7 break
                { x: 145, y: 488, w: 290, h: 126 },    // asteroid8 break
                { x: 341, y: 558, w: 153, h: 166 },    // asteroid9 break
            ],
        };

        // Game state
        this.asteroidsDestroyed = 0;
        this.targetCount = 20;
        this.activeAsteroids = [];
        this.explosions = []; // {x, y, timer}
        this.spawnTimer = 0;
        this.spawnInterval = 0.8; // seconds between spawns

        // Aimer position (follows mouse)
        this.aimerX = 0;
        this.aimerY = 0;

        // Panel layout
        this.scale = 1.4;
    }

    start() {
        super.start();
        this.asteroidsDestroyed = 0;
        this.activeAsteroids = [];
        this.explosions = [];
        this.spawnTimer = 0;
    }

    spawnAsteroid(screenW, screenH) {
        const bg = this.sprites.bg;
        const bgW = bg.w * this.scale;
        const bgH = bg.h * this.scale;
        const bgX = (screenW - bgW) / 2;
        const bgY = (screenH - bgH) / 2;

        // Pick random asteroid type
        const typeIndex = Math.floor(Math.random() * this.sprites.asteroids.length);
        const sprite = this.sprites.asteroids[typeIndex];
        const brokenSprite = this.sprites.broken[typeIndex];

        // Spawn from right side, moving left at different angles
        const speed = 300 + Math.random() * 200; // 300-500 pixels per second

        const asteroidW = sprite.w * this.scale * 0.5;
        const asteroidH = sprite.h * this.scale * 0.5;

        // Start from right edge at random Y position
        const startX = bgX + bgW + asteroidW;
        const startY = bgY + Math.random() * bgH;

        // Move left with random angle variation (-45 to +45 degrees)
        const angle = Math.PI + (Math.random() - 0.5) * Math.PI / 2; // 135 to 225 degrees (leftward)
        const velX = Math.cos(angle) * speed;
        const velY = Math.sin(angle) * speed;

        this.activeAsteroids.push({
            x: startX,
            y: startY,
            velX,
            velY,
            typeIndex,
            sprite,
            brokenSprite,
            w: asteroidW,
            h: asteroidH,
            hit: false,
            hitTimer: 0,
        });
    }

    update(dt, screenW, screenH) {
        if (!this.active || this.completed) return;

        // Spawn asteroids
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval && this.activeAsteroids.length < 8) {
            this.spawnAsteroid(screenW || 1920, screenH || 1080);
            this.spawnTimer = 0;
        }

        const bg = this.sprites.bg;
        const bgW = bg.w * this.scale;
        const bgH = bg.h * this.scale;
        const bgX = ((screenW || 1920) - bgW) / 2;
        const bgY = ((screenH || 1080) - bgH) / 2;

        // Update asteroids
        for (let i = this.activeAsteroids.length - 1; i >= 0; i--) {
            const asteroid = this.activeAsteroids[i];

            if (asteroid.hit) {
                asteroid.hitTimer += dt;
                if (asteroid.hitTimer > 0.5) {
                    this.activeAsteroids.splice(i, 1);
                }
            } else {
                asteroid.x += asteroid.velX * dt;
                asteroid.y += asteroid.velY * dt;

                // Remove if out of bounds
                if (asteroid.x < bgX - asteroid.w * 2 ||
                    asteroid.x > bgX + bgW + asteroid.w ||
                    asteroid.y < bgY - asteroid.h * 2 ||
                    asteroid.y > bgY + bgH + asteroid.h) {
                    this.activeAsteroids.splice(i, 1);
                }
            }
        }

        // Update explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            this.explosions[i].timer += dt;
            if (this.explosions[i].timer > 0.3) {
                this.explosions.splice(i, 1);
            }
        }

        // Check win condition
        if (this.asteroidsDestroyed >= this.targetCount) {
            this.completed = true;
            this.active = false;
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const texture = assetLoader?.getTexture('weapons');
        if (!texture) return;

        const scale = this.scale;
        const bg = this.sprites.bg;
        const bgW = bg.w * scale;
        const bgH = bg.h * scale;
        const bgX = (screenW - bgW) / 2;
        const bgY = (screenH - bgH) / 2;

        // Draw background
        ctx.drawImage(
            texture,
            bg.x, bg.y, bg.w, bg.h,
            bgX, bgY, bgW, bgH
        );

        // Clip to background area
        ctx.save();
        ctx.beginPath();
        ctx.rect(bgX, bgY, bgW, bgH);
        ctx.clip();

        // Draw asteroids
        for (const asteroid of this.activeAsteroids) {
            const sprite = asteroid.hit ? asteroid.brokenSprite : asteroid.sprite;
            ctx.drawImage(
                texture,
                sprite.x, sprite.y, sprite.w, sprite.h,
                asteroid.x, asteroid.y, asteroid.w, asteroid.h
            );
        }

        // Draw explosions
        const explosion = this.sprites.explosion;
        for (const exp of this.explosions) {
            const alpha = 1 - (exp.timer / 0.3);
            ctx.globalAlpha = alpha;
            const expScale = scale * 0.6;
            ctx.drawImage(
                texture,
                explosion.x, explosion.y, explosion.w, explosion.h,
                exp.x - explosion.w * expScale / 2,
                exp.y - explosion.h * expScale / 2,
                explosion.w * expScale,
                explosion.h * expScale
            );
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        // Draw aimer (crosshair) at mouse position
        const aimer = this.sprites.aimer;
        const aimerW = aimer.w * scale * 0.8;
        const aimerH = aimer.h * scale * 0.8;
        ctx.drawImage(
            texture,
            aimer.x, aimer.y, aimer.w, aimer.h,
            this.aimerX - aimerW / 2,
            this.aimerY - aimerH / 2,
            aimerW, aimerH
        );

        // Draw counter text with Valera font style
        ctx.font = 'bold 32px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.textAlign = 'center';
        const counterText = `${this.asteroidsDestroyed} / ${this.targetCount}`;
        const textX = screenW / 2;
        const textY = bgY - 20;
        ctx.strokeText(counterText, textX, textY);
        ctx.fillText(counterText, textX, textY);
    }

    handleClick(x, y) {
        if (!this.active) return false;

        // Update aimer position
        this.aimerX = x;
        this.aimerY = y;

        // Check if clicking on an asteroid
        for (const asteroid of this.activeAsteroids) {
            if (!asteroid.hit &&
                x >= asteroid.x && x <= asteroid.x + asteroid.w &&
                y >= asteroid.y && y <= asteroid.y + asteroid.h) {
                // Hit!
                asteroid.hit = true;
                asteroid.hitTimer = 0;
                this.asteroidsDestroyed++;

                // Add explosion at asteroid center
                this.explosions.push({
                    x: asteroid.x + asteroid.w / 2,
                    y: asteroid.y + asteroid.h / 2,
                    timer: 0
                });

                return true;
            }
        }

        return true; // Consumed click even if missed
    }

    handleDrag(x, y) {
        // Update aimer to follow mouse
        this.aimerX = x;
        this.aimerY = y;
    }

    handleRelease() {}
}

// Reactor Meltdown Sabotage - Two players must hold handprints simultaneously
export class ReactorMeltdownTask extends Task {
    constructor(room, x, y, isLeftPanel = true) {
        super('Stop Reactor Meltdown', room, x, y);
        this.isLeftPanel = isLeftPanel;
        this.isSabotage = true; // This is a sabotage task, not a regular task

        // Sprite info
        this.sprites = {
            handprintBase: { width: 500, height: 500 },
            glowBar: { width: 481, height: 72 }
        };

        // State
        this.isHolding = false;
        this.glowBarY = 500; // Starts at bottom (500), goes to top (0)
        this.partnerPanel = null; // Reference to the other reactor panel
        this.completed = false;
        this.showSuccess = false;
        this.successTimer = 0;
        this.sabotageActive = false; // Only true when reactor sabotage is triggered

        // Panel layout
        this.scale = 0.8;
    }

    start() {
        super.start();
        this.isHolding = false;
        this.glowBarY = 500;
        this.completed = false;
        this.showSuccess = false;
        this.successTimer = 0;
    }

    update(dt) {
        if (!this.active || this.completed) return;

        // Show success message
        if (this.showSuccess) {
            this.successTimer += dt;
            if (this.successTimer > 2) {
                this.completed = true;
                this.active = false;
            }
            return;
        }

        // Check if partner panel is being held by another player
        const partnerHolding = this.partnerPanel ? this.partnerPanel.isHolding : false;

        // If BOTH panels are being held (this one AND the partner), glow bar rises
        if (this.isHolding && partnerHolding) {
            this.glowBarY -= 200 * dt; // Rise speed
            if (this.glowBarY <= 0) {
                this.glowBarY = 0;
                // Only show success and complete if sabotage is actually active
                if (this.sabotageActive) {
                    this.showSuccess = true;
                    this.successTimer = 0;
                    // Play task complete sound would go here
                    console.log('Sabotage stopped!');
                }
            }
        } else {
            // If not both holding, bar falls back down
            this.glowBarY += 100 * dt;
            if (this.glowBarY > 500) this.glowBarY = 500;
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const handprintTexture = assetLoader?.getTexture('reactor_handprint');
        const glowBarTexture = assetLoader?.getTexture('reactor_glowbar');

        const scale = this.scale;
        const panelW = this.sprites.handprintBase.width * scale;
        const panelH = this.sprites.handprintBase.height * scale;

        // Center single panel
        const panelX = (screenW - panelW) / 2;
        const panelY = (screenH - panelH) / 2;

        // Flash blue background when BOTH panels are being held (this AND partner)
        const partnerHolding = this.partnerPanel ? this.partnerPanel.isHolding : false;
        if (this.isHolding && partnerHolding) {
            const flashSpeed = 8;
            const flash = Math.sin(Date.now() / 1000 * flashSpeed) * 0.5 + 0.5;
            ctx.fillStyle = `rgba(100, 200, 255, ${0.4 * flash})`;
            ctx.fillRect(panelX - 30, panelY - 30, panelW + 60, panelH + 60);
        }

        // Draw glow bar BEHIND the handprint (clip to panel area)
        const glowBarW = this.sprites.glowBar.width * scale;
        const glowBarH = this.sprites.glowBar.height * scale;
        const glowBarYPos = panelY + this.glowBarY * scale;

        ctx.save();
        ctx.beginPath();
        ctx.rect(panelX, panelY, panelW, panelH);
        ctx.clip();
        if (glowBarTexture) {
            ctx.drawImage(glowBarTexture, panelX + (panelW - glowBarW) / 2, glowBarYPos, glowBarW, glowBarH);
        }
        ctx.restore();

        // Draw handprint panel ON TOP of glow bar
        if (handprintTexture) {
            ctx.drawImage(handprintTexture, panelX, panelY, panelW, panelH);
        }

        // Store hitbox for click detection
        this.panelHitbox = { x: panelX, y: panelY, w: panelW, h: panelH };

        // Draw success overlay when sabotage is stopped
        if (this.showSuccess) {
            ctx.fillStyle = 'rgba(0, 100, 255, 0.5)';
            ctx.fillRect(0, 0, screenW, screenH);
        }
    }

    handleClick(x, y) {
        if (!this.active || this.showSuccess) return false;

        // Check if clicking on the panel
        if (this.panelHitbox &&
            x >= this.panelHitbox.x && x <= this.panelHitbox.x + this.panelHitbox.w &&
            y >= this.panelHitbox.y && y <= this.panelHitbox.y + this.panelHitbox.h) {
            this.isHolding = true;
            return true;
        }

        return true;
    }

    handleDrag(x, y) {
        // Keep holding while dragging on panel
    }

    handleRelease() {
        // Release when mouse is released
        this.isHolding = false;
    }
}

// O2 Sabotage - Enter Code Task (keypad with post-it note showing 4-digit code)
export class EnterCodeTask extends Task {
    constructor(room, x, y) {
        super('Enter Code', room, x, y);
        this.isSabotage = true;

        // Sprite coordinates from lasso cutter
        this.sprites = {
            keypad: { x: 2, y: 1, w: 371, h: 504 },
            postIt: { x: 1, y: 508, w: 242, h: 176 }  // Tight bounds from lasso cutter
        };

        // Button layout on the keypad (relative to keypad sprite)
        // Row 1: 1, 2, 3
        // Row 2: 4, 5, 6
        // Row 3: 7, 8, 9
        // Row 4: X, 0, checkmark
        this.buttonSize = 85;
        this.buttonStartX = 25;
        this.buttonStartY = 75;
        this.buttonSpacingX = 105;
        this.buttonSpacingY = 95;

        // State
        this.targetCode = '';      // The 4-digit code to enter
        this.enteredCode = '';     // What user has entered so far
        this.completed = false;
        this.showSuccess = false;
        this.successTimer = 0;
        this.sabotageActive = false;
        this.partnerTask = null;   // Reference to the other O2 panel

        // Panel layout
        this.scale = 1.2;
    }

    start() {
        super.start();
        // Generate random 4-digit code
        this.targetCode = '';
        for (let i = 0; i < 4; i++) {
            this.targetCode += Math.floor(Math.random() * 10).toString();
        }
        this.enteredCode = '';
        this.completed = false;
        this.showSuccess = false;
        this.successTimer = 0;
    }

    update(dt) {
        if (!this.active || this.completed) return;

        if (this.showSuccess) {
            this.successTimer += dt;
            if (this.successTimer > 1.5) {
                this.completed = true;
                this.active = false;
            }
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const texture = assetLoader?.getTexture('keypad');
        if (!texture) return;

        const scale = this.scale;
        const keypad = this.sprites.keypad;
        const keypadW = keypad.w * scale;
        const keypadH = keypad.h * scale;
        const keypadX = (screenW - keypadW) / 2;
        const keypadY = (screenH - keypadH) / 2;

        // Draw keypad
        ctx.drawImage(
            texture,
            keypad.x, keypad.y, keypad.w, keypad.h,
            keypadX, keypadY, keypadW, keypadH
        );

        // Draw entered code on the display (black area at top of keypad)
        const displayX = keypadX + 30 * scale;
        const displayY = keypadY + 25 * scale;
        const displayW = 310 * scale;
        const displayH = 45 * scale;

        // Draw entered digits (adjusted position)
        ctx.font = `bold ${36 * scale}px "Varela Round", Arial`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.enteredCode, keypadX + keypadW / 2 - 5 * scale, displayY + displayH / 2 + 15 * scale);

        // Draw post-it note with target code (offset to the side)
        const postIt = this.sprites.postIt;
        const postItW = postIt.w * scale * 0.8;
        const postItH = postIt.h * scale * 0.8;
        const postItX = keypadX - postItW - 20;
        const postItY = keypadY + 50;

        ctx.drawImage(
            texture,
            postIt.x, postIt.y, postIt.w, postIt.h,
            postItX, postItY, postItW, postItH
        );

        // Draw target code on post-it note (or "No Sabotage" message)
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.sabotageActive) {
            ctx.font = `bold ${32 * scale}px "Varela Round", Arial`;
            ctx.fillText(this.targetCode, postItX + postItW / 2, postItY + postItH / 2 + 10);
        } else {
            ctx.font = `bold ${16 * scale}px "Varela Round", Arial`;
            ctx.fillText('No Sabotage', postItX + postItW / 2, postItY + postItH / 2);
            ctx.fillText('Active', postItX + postItW / 2, postItY + postItH / 2 + 20 * scale);
        }

        // Store button hitboxes for click detection
        this.buttonHitboxes = [];
        const buttons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'X', '0', '✓'];
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 3; col++) {
                const btnX = keypadX + (this.buttonStartX + col * this.buttonSpacingX) * scale;
                const btnY = keypadY + (this.buttonStartY + row * this.buttonSpacingY) * scale;
                const btnW = this.buttonSize * scale;
                const btnH = this.buttonSize * scale;
                this.buttonHitboxes.push({
                    x: btnX, y: btnY, w: btnW, h: btnH,
                    value: buttons[row * 3 + col]
                });
            }
        }

        // Draw success overlay
        if (this.showSuccess) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            ctx.fillRect(0, 0, screenW, screenH);

            ctx.font = `bold ${48}px "Varela Round", Arial`;
            ctx.fillStyle = '#00FF00';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.textAlign = 'center';
            ctx.strokeText('CODE ACCEPTED', screenW / 2, screenH / 2 - keypadH / 2 - 30);
            ctx.fillText('CODE ACCEPTED', screenW / 2, screenH / 2 - keypadH / 2 - 30);
        }
    }

    handleClick(x, y) {
        if (!this.active || this.showSuccess) return false;

        // Check which button was clicked
        for (const btn of this.buttonHitboxes || []) {
            if (x >= btn.x && x <= btn.x + btn.w &&
                y >= btn.y && y <= btn.y + btn.h) {
                this.pressButton(btn.value);
                return true;
            }
        }

        return true;
    }

    pressButton(value) {
        if (value === 'X') {
            // Clear entered code
            this.enteredCode = '';
        } else if (value === '✓') {
            // Check if code is correct
            if (this.enteredCode === this.targetCode) {
                this.showSuccess = true;
                this.successTimer = 0;
                console.log('O2 code correct!');
            } else {
                // Wrong code - clear and try again
                this.enteredCode = '';
            }
        } else {
            // Add digit if less than 4 digits entered
            if (this.enteredCode.length < 4) {
                this.enteredCode += value;
            }
        }
    }

    handleDrag(x, y) {}
    handleRelease() {}
}

// Card Swipe Task - Swipe card at correct speed
export class SwipeCardTask extends Task {
    constructor(room, x, y) {
        super('Swipe Card', room, x, y);

        // Sprite coordinates from assembler
        this.sprites = {
            // Main background (wallet area)
            bg: { x: 2, y: 0, w: 499, h: 502 },
            // Top slot cover (card slides under this)
            slotCover: { x: 501, y: 0, w: 503, h: 169 },
            // The card itself
            card: { x: 982, y: 172, w: 237, h: 148 },
            // Bar element (card slides over this)
            slotBar: { x: 507, y: 370, w: 505, h: 84 },
            // Green result text box
            resultBox: { x: 502, y: 452, w: 425, h: 44 },
            // Additional element
            sprite6: { x: 502, y: 172, w: 480, h: 181 }
        };

        // Card state
        this.cardState = 'wallet'; // 'wallet', 'dragging', 'swiping', 'done'
        this.cardX = 0;
        this.cardY = 0;
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Swipe timing
        this.swipeStartTime = 0;
        this.swipeStartX = 0;
        this.swipeEndX = 0;

        // Result
        this.resultText = '';
        this.resultColor = '#FFFFFF';
        this.showResult = false;
        this.resultTimer = 0;

        // Layout
        this.scale = 1.0;

        // Positions calculated during render
        this.walletCardPos = { x: 0, y: 0 };
        this.slotY = 0;
        this.slotLeftX = 0;
        this.slotRightX = 0;
        this.greenBarY = 0;
    }

    start() {
        super.start();
        this.cardState = 'wallet';
        this.isDragging = false;
        this.resultText = '';
        this.showResult = false;
        this.resultTimer = 0;
    }

    update(dt) {
        if (!this.active) return;

        // Result display timer
        if (this.showResult) {
            this.resultTimer += dt;

            // If success, complete after showing message
            if (this.resultText === 'Card Accepted' && this.resultTimer > 1.5) {
                this.completed = true;
                this.active = false;
            }

            // If failed, reset card after showing message
            if ((this.resultText === 'Too Fast' || this.resultText === 'Too Slow') && this.resultTimer > 1.5) {
                this.showResult = false;
                this.resultText = '';
                this.cardState = 'wallet';
                this.resultTimer = 0;
            }
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const texture = assetLoader?.getTexture('card_swipe');
        if (!texture) return;

        const scale = this.scale;

        // Use exact placements from assembler (500x600 preview centered on screen)
        // Placements: sprite(wallet) y:85, sprite2(cover) y:117, sprite4(bar) y:23, card y:350, sprite6 y:412
        const previewW = 500 * scale;
        const previewH = 600 * scale;
        const offsetX = (screenW - previewW) / 2;
        const offsetY = (screenH - previewH) / 2;

        // Sprite dimensions
        const bg = this.sprites.bg;
        const slotCover = this.sprites.slotCover;
        const slotBar = this.sprites.slotBar;
        const card = this.sprites.card;
        const sprite6 = this.sprites.sprite6;
        const resultBox = this.sprites.resultBox;

        // Exact positions from assembler placements
        const bgX = offsetX + 3 * scale;
        const bgY = offsetY + 85 * scale;
        const slotCoverX = offsetX + (-2) * scale;
        const slotCoverY = offsetY + 117 * scale;
        const slotBarX = offsetX + 2 * scale;
        const slotBarY = offsetY + 23 * scale;
        const sprite6X = offsetX + (-9) * scale;
        const sprite6Y = offsetY + 412 * scale;

        // Card wallet position from assembler
        const cardW = card.w * scale;
        const cardH = card.h * scale;
        this.walletCardPos = {
            x: offsetX + 9 * scale,
            y: offsetY + 350 * scale
        };

        // Store positions for swipe interaction
        this.slotY = slotBarY + (slotBar.h * scale) / 2;
        this.slotLeftX = slotBarX + 20 * scale;
        this.slotRightX = slotBarX + slotBar.w * scale - cardW - 20 * scale;
        this.greenBarY = slotCoverY + slotCover.h * scale;

        // Initialize card position if in wallet state
        if (this.cardState === 'wallet' && !this.isDragging) {
            this.cardX = this.walletCardPos.x;
            this.cardY = this.walletCardPos.y;
        }

        // === DRAW LAYERS (z-order bottom to top: wallet, sprite4, card, sprite2, sprite6) ===

        // 1. Draw wallet background (sprite1) - bottom layer
        ctx.drawImage(
            texture,
            bg.x, bg.y, bg.w, bg.h,
            bgX, bgY, bg.w * scale, bg.h * scale
        );

        // 2. Draw slot bar (sprite4) - second layer
        ctx.drawImage(
            texture,
            slotBar.x, slotBar.y, slotBar.w, slotBar.h,
            slotBarX, slotBarY, slotBar.w * scale, slotBar.h * scale
        );

        // 3. Draw card - third layer
        if (this.cardState === 'wallet' || this.cardState === 'dragging') {
            ctx.drawImage(
                texture,
                card.x, card.y, card.w, card.h,
                this.cardX, this.cardY, cardW, cardH
            );
        } else if (this.cardState === 'swiping') {
            // Card snaps to slot - top of card aligns with top of sprite4 (slotBar)
            const lockedY = slotBarY;
            ctx.drawImage(
                texture,
                card.x, card.y, card.w, card.h,
                this.cardX, lockedY, cardW, cardH
            );
        }

        // 4. Draw slot cover (sprite2) - fourth layer
        ctx.drawImage(
            texture,
            slotCover.x, slotCover.y, slotCover.w, slotCover.h,
            slotCoverX, slotCoverY, slotCover.w * scale, slotCover.h * scale
        );

        // 5. Draw sprite6 - top layer
        ctx.drawImage(
            texture,
            sprite6.x, sprite6.y, sprite6.w, sprite6.h,
            sprite6X, sprite6Y, sprite6.w * scale, sprite6.h * scale
        );

        // 7. Draw result text in green box area (part of slotCover sprite)
        if (this.showResult && this.resultText) {
            const textX = slotCoverX + (slotCover.w * scale) / 2;
            const textY = slotCoverY + 30 * scale;
            ctx.font = `bold ${24 * scale}px "Varela Round", Arial`;
            ctx.fillStyle = this.resultColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.resultText, textX, textY);
        }

        // Store card hitbox for interaction
        this.cardHitbox = {
            x: this.cardX,
            y: this.cardY,
            w: cardW,
            h: cardH
        };
    }

    handleClick(x, y) {
        if (!this.active || this.showResult) return false;

        // Check if clicking on the card
        if (this.cardHitbox &&
            x >= this.cardHitbox.x && x <= this.cardHitbox.x + this.cardHitbox.w &&
            y >= this.cardHitbox.y && y <= this.cardHitbox.y + this.cardHitbox.h) {

            this.isDragging = true;
            this.dragOffsetX = x - this.cardX;
            this.dragOffsetY = y - this.cardY;

            if (this.cardState === 'wallet') {
                this.cardState = 'dragging';
            }

            return true;
        }

        return true;
    }

    handleDrag(x, y) {
        if (!this.isDragging) return;

        if (this.cardState === 'dragging') {
            // Move card with mouse
            this.cardX = x - this.dragOffsetX;
            this.cardY = y - this.dragOffsetY;

            // Check if card entered the swipe slot area (near green bar)
            if (this.cardY <= this.greenBarY && this.cardX >= this.slotLeftX - 50) {
                // Lock card to swipe slot - snap to LEFT side to start swipe
                this.cardState = 'swiping';
                this.cardX = this.slotLeftX; // Start from left
                this.swipeStartTime = performance.now();
                this.swipeStartX = this.cardX;
            }
        } else if (this.cardState === 'swiping') {
            // Only move horizontally in swipe mode
            this.cardX = x - this.dragOffsetX;

            // Clamp to slot bounds
            if (this.cardX < this.slotLeftX) this.cardX = this.slotLeftX;
            if (this.cardX > this.slotRightX) this.cardX = this.slotRightX;
        }
    }

    handleRelease() {
        if (!this.isDragging) return;
        this.isDragging = false;

        if (this.cardState === 'swiping') {
            // Calculate swipe time
            const swipeEndTime = performance.now();
            const swipeTime = (swipeEndTime - this.swipeStartTime) / 1000; // Convert to seconds

            // Check if card reached the RIGHT side (within 10px of the right edge)
            const reachedRight = this.cardX >= this.slotRightX - 10;

            if (reachedRight) {
                // Evaluate swipe speed
                // 1.3 to 3 seconds = Card Accepted
                // 0 to 1.3 seconds = Too Fast
                // Over 3 seconds = Too Slow

                if (swipeTime >= 1.3 && swipeTime <= 3.0) {
                    this.resultText = 'Card Accepted';
                    this.resultColor = '#00FF00';
                } else if (swipeTime < 1.3) {
                    this.resultText = 'Too Fast';
                    this.resultColor = '#FF0000';
                } else {
                    this.resultText = 'Too Slow';
                    this.resultColor = '#FF0000';
                }

                this.showResult = true;
                this.resultTimer = 0;
            } else {
                // Didn't swipe all the way to the right - reset to wallet
                this.cardState = 'wallet';
            }
        } else if (this.cardState === 'dragging') {
            // Dropped card outside slot - return to wallet
            this.cardState = 'wallet';
        }
    }
}

// Unlock Manifolds Task - Click numbers 1-10 in order
export class UnlockManifoldsTask extends Task {
    constructor(room, x, y) {
        super('Unlock Manifolds', room, x, y);

        // Sprite coordinates from assembler
        this.sprites = {
            // Number buttons 1-10
            '1': { x: 124, y: 176, w: 85, h: 89 },
            '2': { x: 208, y: 176, w: 86, h: 108 },
            '3': { x: 39, y: 171, w: 86, h: 95 },
            '4': { x: 72, y: 87, w: 88, h: 87 },
            '5': { x: 291, y: 177, w: 86, h: 97 },
            '6': { x: 214, y: 590, w: 89, h: 86 },
            '7': { x: 375, y: 177, w: 86, h: 107 },
            '8': { x: 130, y: 590, w: 86, h: 86 },
            '9': { x: 459, y: 177, w: 86, h: 93 },
            '10': { x: 543, y: 177, w: 89, h: 94 },
            // Backgrounds
            'panel': { x: 129, y: 338, w: 506, h: 254 },
            'header': { x: 158, y: 0, w: 435, h: 178 }
        };

        // Layout positions (where each sprite is drawn on screen, relative to task area)
        // Background elements (not randomized)
        this.bgLayout = [
            { sprite: 'panel', x: 90, y: 341 },
            { sprite: 'header', x: 125, y: 379 }
        ];

        // Number button positions (fixed slots where numbers will be placed)
        this.buttonSlots = [
            { x: 133, y: 385 },
            { x: 217, y: 385 },
            { x: 300, y: 385 },
            { x: 383, y: 384 },
            { x: 467, y: 386 },
            { x: 134, y: 467 },
            { x: 219, y: 468 },
            { x: 302, y: 468 },
            { x: 385, y: 467 },
            { x: 466, y: 468 }
        ];

        // Randomized mapping: which number appears at which slot
        // Will be shuffled on start()
        this.numberToSlot = null; // Maps number (1-10) to slot index

        // Track which numbers have been clicked correctly
        this.clickedNumbers = new Set();
        this.nextNumber = 1; // Next number player needs to click

        // Pre-rendered canvases for normal and blue versions
        this.normalCanvases = {};
        this.blueCanvases = {};
        this.textureLoaded = false;

        // Hitboxes for click detection (populated during render)
        this.buttonHitboxes = [];

        // Scale
        this.scale = 1.0;
    }

    start() {
        super.start();
        this.clickedNumbers = new Set();
        this.nextNumber = 1;
        this.textureLoaded = false;

        // Randomize which number appears at which slot
        // Create array [0,1,2,...,9] representing slot indices
        const slotIndices = [...Array(10).keys()];
        // Fisher-Yates shuffle
        for (let i = slotIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [slotIndices[i], slotIndices[j]] = [slotIndices[j], slotIndices[i]];
        }
        // Map each number (1-10) to a random slot index
        this.numberToSlot = {};
        for (let num = 1; num <= 10; num++) {
            this.numberToSlot[num] = slotIndices[num - 1];
        }
    }

    // Create blue-tinted version of a sprite by modifying pixel data
    createBlueVersion(texture, spriteData) {
        const canvas = document.createElement('canvas');
        canvas.width = spriteData.w;
        canvas.height = spriteData.h;
        const ctx = canvas.getContext('2d');

        // Draw original sprite
        ctx.drawImage(
            texture,
            spriteData.x, spriteData.y, spriteData.w, spriteData.h,
            0, 0, spriteData.w, spriteData.h
        );

        // Get image data and tint grey pixels blue
        const imageData = ctx.getImageData(0, 0, spriteData.w, spriteData.h);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Skip transparent pixels
            if (a < 10) continue;

            // Check if pixel is greyish (R, G, B are similar)
            const avg = (r + g + b) / 3;
            const maxDiff = Math.max(Math.abs(r - avg), Math.abs(g - avg), Math.abs(b - avg));

            // If pixel is grey-ish (low color variance) and not too dark/light
            if (maxDiff < 30 && avg > 40 && avg < 220) {
                // Tint it blue - keep some of original brightness
                const brightness = avg / 255;
                data[i] = Math.round(30 * brightness);      // R - low
                data[i + 1] = Math.round(144 * brightness); // G - medium
                data[i + 2] = Math.round(255 * brightness); // B - high (blue)
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    // Pre-render all number sprites (normal and blue versions)
    prepareSprites(texture) {
        if (this.textureLoaded) return;

        for (let i = 1; i <= 10; i++) {
            const key = i.toString();
            const spriteData = this.sprites[key];

            // Create normal canvas
            const normalCanvas = document.createElement('canvas');
            normalCanvas.width = spriteData.w;
            normalCanvas.height = spriteData.h;
            const normalCtx = normalCanvas.getContext('2d');
            normalCtx.drawImage(
                texture,
                spriteData.x, spriteData.y, spriteData.w, spriteData.h,
                0, 0, spriteData.w, spriteData.h
            );
            this.normalCanvases[key] = normalCanvas;

            // Create blue version
            this.blueCanvases[key] = this.createBlueVersion(texture, spriteData);
        }

        this.textureLoaded = true;
    }

    update(dt) {
        if (!this.active) return;

        // Check if all 10 numbers clicked
        if (this.nextNumber > 10) {
            this.completed = true;
            this.active = false;
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const texture = assetLoader?.getTexture('unlock_manifolds');
        if (!texture) return;

        // Prepare blue versions of sprites on first render
        this.prepareSprites(texture);

        const scale = this.scale;

        // Center the task area (700x700 from assembler)
        const taskW = 700 * scale;
        const taskH = 700 * scale;
        const offsetX = (screenW - taskW) / 2;
        const offsetY = (screenH - taskH) / 2;

        // Clear hitboxes
        this.buttonHitboxes = [];

        // Draw background elements first
        for (const item of this.bgLayout) {
            const spriteData = this.sprites[item.sprite];
            if (!spriteData) continue;

            const drawX = offsetX + item.x * scale;
            const drawY = offsetY + item.y * scale;
            const drawW = spriteData.w * scale;
            const drawH = spriteData.h * scale;

            ctx.drawImage(
                texture,
                spriteData.x, spriteData.y, spriteData.w, spriteData.h,
                drawX, drawY, drawW, drawH
            );
        }

        // Draw number buttons at randomized positions
        for (let num = 1; num <= 10; num++) {
            const slotIndex = this.numberToSlot[num];
            const slot = this.buttonSlots[slotIndex];
            const spriteData = this.sprites[num.toString()];

            const drawX = offsetX + slot.x * scale;
            const drawY = offsetY + slot.y * scale;
            const drawW = spriteData.w * scale;
            const drawH = spriteData.h * scale;

            // Use blue version if clicked, otherwise normal
            if (this.clickedNumbers.has(num)) {
                ctx.drawImage(this.blueCanvases[num.toString()], drawX, drawY, drawW, drawH);
            } else {
                ctx.drawImage(this.normalCanvases[num.toString()], drawX, drawY, drawW, drawH);
            }

            // Store hitbox for click detection
            this.buttonHitboxes.push({
                num: num,
                x: drawX,
                y: drawY,
                w: drawW,
                h: drawH
            });
        }
    }

    handleClick(x, y) {
        if (!this.active) return false;

        // Check if clicked on any number button
        for (const hitbox of this.buttonHitboxes) {
            if (x >= hitbox.x && x <= hitbox.x + hitbox.w &&
                y >= hitbox.y && y <= hitbox.y + hitbox.h) {

                // Check if this is the next number in sequence
                if (hitbox.num === this.nextNumber) {
                    // Correct! Mark as clicked and advance
                    this.clickedNumbers.add(hitbox.num);
                    this.nextNumber++;
                }
                // Wrong number - do nothing (don't reset, just ignore)

                return true;
            }
        }

        return true; // Consume click even if missed
    }

    handleDrag(x, y) {}
    handleRelease() {}
}

// Simon Says Task - Repeat the pattern shown on the left grid by clicking buttons on the right
export class SimonSaysTask extends Task {
    constructor(room, x, y) {
        super('Start Reactor', room, x, y);

        // Sprite coordinates from the sprite sheet
        this.sprites = {
            // Main panel backgrounds (the black 3x3 grid areas)
            leftPanel: { x: 0, y: 282, w: 156, h: 158 },
            rightPanel: { x: 0, y: 441, w: 155, h: 159 },
            // Button for the right side (clickable)
            button: { x: 248, y: 195, w: 51, h: 52 },
            // Progress lights - base sprite (we'll tint the inner circle programmatically)
            lightBase: { x: 190, y: 410, w: 29, h: 31 },
            // Inner circle relative to lightBase (the part that lights up)
            lightInnerCircle: { cx: 12.5, cy: 10.5, r: 8 },  // center x, center y, radius relative to light sprite
            // Decorative panels
            topPanel: { x: 1, y: 1, w: 250, h: 282 }
        };

        // Layout positions
        this.layout = {
            leftPanelX: 80,
            leftPanelY: 213,
            rightPanelX: 400,
            rightPanelY: 208,
            // Light positions (5 lights on each side)
            leftLights: [
                { x: 73, y: 169 },
                { x: 109, y: 169 },
                { x: 145, y: 168 },
                { x: 182, y: 168 },
                { x: 217, y: 167 }
            ],
            rightLights: [
                { x: 399, y: 174 },
                { x: 432, y: 174 },
                { x: 465, y: 174 },
                { x: 499, y: 174 },
                { x: 531, y: 173 }
            ]
        };

        // Grid cell size (panel divided into 3x3)
        this.cellSize = 52; // ~156/3

        // Game state
        this.currentRound = 0; // 0-4 (5 rounds total)
        this.sequence = []; // Array of cell indices (0-8) for the pattern
        this.playerIndex = 0; // Which step of the sequence player is on
        this.gamePhase = 'showing'; // 'showing', 'waiting', 'correct', 'wrong', 'complete'

        // Animation state
        this.showingIndex = 0; // Which cell in sequence is being shown
        this.showTimer = 0;
        this.showDuration = 0.6; // How long each cell lights up
        this.pauseDuration = 0.3; // Pause between cells
        this.isPaused = false;
        this.highlightedCell = -1; // Currently highlighted cell on left panel (-1 = none)

        // Button press feedback
        this.pressedButton = -1; // Currently pressed button on right panel
        this.pressTimer = 0;
        this.pressDuration = 0.15;

        // Result display
        this.resultTimer = 0;
        this.resultDuration = 0.8;

        // Hitboxes for buttons (populated during render)
        this.buttonHitboxes = [];

        // Scale
        this.scale = 1.0;

        // Pre-rendered blue cell canvas
        this.blueCellCanvas = null;
        this.darkButtonCanvas = null;

        // Pre-rendered tinted light canvases
        this.greenLightCanvas = null;
        this.redLightCanvas = null;
    }

    start() {
        super.start();
        this.currentRound = 0;
        this.sequence = [];
        this.playerIndex = 0;
        this.gamePhase = 'showing';
        this.showingIndex = 0;
        this.showTimer = 0;
        this.isPaused = false;
        this.highlightedCell = -1;
        this.pressedButton = -1;
        this.pressTimer = 0;
        this.resultTimer = 0;
        this.blueCellCanvas = null;
        this.darkButtonCanvas = null;
        this.greenLightCanvas = null;
        this.redLightCanvas = null;

        // Start first round
        this.startNewRound();
    }

    startNewRound() {
        // Add a new random cell to the sequence
        const newCell = Math.floor(Math.random() * 9);
        this.sequence.push(newCell);

        // Reset for showing phase
        this.gamePhase = 'showing';
        this.showingIndex = 0;
        this.showTimer = 0;
        this.isPaused = false;
        this.highlightedCell = -1;
        this.playerIndex = 0;
    }

    // Create blue-tinted version of a cell for highlighting
    createBlueCell(texture, cellW, cellH) {
        if (this.blueCellCanvas) return;

        const canvas = document.createElement('canvas');
        canvas.width = cellW;
        canvas.height = cellH;
        const ctx = canvas.getContext('2d');

        // Fill with blue color
        ctx.fillStyle = '#1E90FF'; // Dodger blue
        ctx.fillRect(0, 0, cellW, cellH);

        // Add slight gradient for depth
        const gradient = ctx.createLinearGradient(0, 0, cellW, cellH);
        gradient.addColorStop(0, 'rgba(100, 180, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 50, 150, 0.3)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, cellW, cellH);

        this.blueCellCanvas = canvas;
    }

    // Create darker version of button for pressed state
    createDarkButton(texture) {
        if (this.darkButtonCanvas) return;

        const btn = this.sprites.button;
        const canvas = document.createElement('canvas');
        canvas.width = btn.w;
        canvas.height = btn.h;
        const ctx = canvas.getContext('2d');

        // Draw original button
        ctx.drawImage(texture, btn.x, btn.y, btn.w, btn.h, 0, 0, btn.w, btn.h);

        // Darken it
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, btn.w, btn.h);

        this.darkButtonCanvas = canvas;
    }

    // Create tinted light canvases - directly edit the sprite pixels
    createTintedLights(texture) {
        if (this.greenLightCanvas && this.redLightCanvas) return;

        const light = this.sprites.lightBase;
        const inner = this.sprites.lightInnerCircle;

        // Create green light
        const greenCanvas = document.createElement('canvas');
        greenCanvas.width = light.w;
        greenCanvas.height = light.h;
        const greenCtx = greenCanvas.getContext('2d');

        // Draw base light sprite
        greenCtx.drawImage(texture, light.x, light.y, light.w, light.h, 0, 0, light.w, light.h);

        // Get pixel data and directly tint pixels inside the circle
        const greenData = greenCtx.getImageData(0, 0, light.w, light.h);
        const gPixels = greenData.data;

        for (let py = 0; py < light.h; py++) {
            for (let px = 0; px < light.w; px++) {
                const dx = px - inner.cx;
                const dy = py - inner.cy;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= inner.r) {
                    const idx = (py * light.w + px) * 4;
                    // Only tint if pixel is not transparent
                    if (gPixels[idx + 3] > 0) {
                        // Tint green - boost green channel, reduce red/blue
                        gPixels[idx] = Math.min(255, gPixels[idx] * 0.3);      // R - reduce
                        gPixels[idx + 1] = Math.min(255, gPixels[idx + 1] * 1.5 + 100); // G - boost
                        gPixels[idx + 2] = Math.min(255, gPixels[idx + 2] * 0.3);      // B - reduce
                    }
                }
            }
        }
        greenCtx.putImageData(greenData, 0, 0);
        this.greenLightCanvas = greenCanvas;

        // Create red light
        const redCanvas = document.createElement('canvas');
        redCanvas.width = light.w;
        redCanvas.height = light.h;
        const redCtx = redCanvas.getContext('2d');

        // Draw base light sprite
        redCtx.drawImage(texture, light.x, light.y, light.w, light.h, 0, 0, light.w, light.h);

        // Get pixel data and directly tint pixels inside the circle
        const redData = redCtx.getImageData(0, 0, light.w, light.h);
        const rPixels = redData.data;

        for (let py = 0; py < light.h; py++) {
            for (let px = 0; px < light.w; px++) {
                const dx = px - inner.cx;
                const dy = py - inner.cy;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= inner.r) {
                    const idx = (py * light.w + px) * 4;
                    // Only tint if pixel is not transparent
                    if (rPixels[idx + 3] > 0) {
                        // Tint red - boost red channel, reduce green/blue
                        rPixels[idx] = Math.min(255, rPixels[idx] * 1.5 + 100);     // R - boost
                        rPixels[idx + 1] = Math.min(255, rPixels[idx + 1] * 0.3);   // G - reduce
                        rPixels[idx + 2] = Math.min(255, rPixels[idx + 2] * 0.3);   // B - reduce
                    }
                }
            }
        }
        redCtx.putImageData(redData, 0, 0);
        this.redLightCanvas = redCanvas;
    }

    update(dt) {
        if (!this.active) return;

        // Handle button press visual feedback
        if (this.pressedButton >= 0) {
            this.pressTimer += dt;
            if (this.pressTimer >= this.pressDuration) {
                this.pressedButton = -1;
                this.pressTimer = 0;
            }
        }

        // Handle result display (correct/wrong feedback)
        if (this.gamePhase === 'correct' || this.gamePhase === 'wrong') {
            this.resultTimer += dt;
            if (this.resultTimer >= this.resultDuration) {
                this.resultTimer = 0;
                if (this.gamePhase === 'correct') {
                    // Move to next round or complete
                    this.currentRound++;
                    if (this.currentRound >= 5) {
                        this.gamePhase = 'complete';
                        this.completed = true;
                        this.active = false;
                    } else {
                        this.startNewRound();
                    }
                } else {
                    // Wrong - reset completely back to round 0
                    this.currentRound = 0;
                    this.sequence = [];
                    this.playerIndex = 0;
                    this.startNewRound();
                }
            }
            return;
        }

        // Handle showing phase animation
        if (this.gamePhase === 'showing') {
            this.showTimer += dt;

            if (this.isPaused) {
                // In pause between cells
                this.highlightedCell = -1;
                if (this.showTimer >= this.pauseDuration) {
                    this.showTimer = 0;
                    this.isPaused = false;
                    this.showingIndex++;

                    // Check if done showing
                    if (this.showingIndex >= this.sequence.length) {
                        this.gamePhase = 'waiting';
                        this.playerIndex = 0;
                        this.highlightedCell = -1;
                    }
                }
            } else {
                // Showing a cell
                if (this.showingIndex < this.sequence.length) {
                    this.highlightedCell = this.sequence[this.showingIndex];
                }

                if (this.showTimer >= this.showDuration) {
                    this.showTimer = 0;
                    this.isPaused = true;
                    this.highlightedCell = -1;
                }
            }
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        const texture = assetLoader?.getTexture('simon_says');
        if (!texture) return;

        // Create helper canvases on first render
        this.createBlueCell(texture, this.cellSize, this.cellSize);
        this.createDarkButton(texture);
        this.createTintedLights(texture);

        const scale = this.scale;

        // Center the task area (700x700)
        const taskW = 700 * scale;
        const taskH = 700 * scale;
        const offsetX = (screenW - taskW) / 2;
        const offsetY = (screenH - taskH) / 2;

        const layout = this.layout;

        // Draw decorative top panels
        ctx.drawImage(
            texture,
            this.sprites.topPanel.x, this.sprites.topPanel.y,
            this.sprites.topPanel.w, this.sprites.topPanel.h,
            offsetX + 34 * scale, offsetY + 134 * scale,
            this.sprites.topPanel.w * scale, this.sprites.topPanel.h * scale
        );
        ctx.drawImage(
            texture,
            this.sprites.topPanel.x, this.sprites.topPanel.y,
            this.sprites.topPanel.w, this.sprites.topPanel.h,
            offsetX + 355 * scale, offsetY + 142 * scale,
            this.sprites.topPanel.w * scale, this.sprites.topPanel.h * scale
        );

        // Draw left panel (Simon's pattern display)
        const leftPanelX = offsetX + layout.leftPanelX * scale;
        const leftPanelY = offsetY + layout.leftPanelY * scale;
        ctx.drawImage(
            texture,
            this.sprites.leftPanel.x, this.sprites.leftPanel.y,
            this.sprites.leftPanel.w, this.sprites.leftPanel.h,
            leftPanelX, leftPanelY,
            this.sprites.leftPanel.w * scale, this.sprites.leftPanel.h * scale
        );

        // Draw highlighted cell on left panel if showing
        if (this.highlightedCell >= 0) {
            const cellRow = Math.floor(this.highlightedCell / 3);
            const cellCol = this.highlightedCell % 3;
            const cellX = leftPanelX + cellCol * this.cellSize * scale + 2 * scale;
            const cellY = leftPanelY + cellRow * this.cellSize * scale + 2 * scale;

            ctx.drawImage(
                this.blueCellCanvas,
                cellX, cellY,
                (this.cellSize - 4) * scale, (this.cellSize - 4) * scale
            );
        }

        // Draw right panel (player's buttons)
        const rightPanelX = offsetX + layout.rightPanelX * scale;
        const rightPanelY = offsetY + layout.rightPanelY * scale;
        ctx.drawImage(
            texture,
            this.sprites.rightPanel.x, this.sprites.rightPanel.y,
            this.sprites.rightPanel.w, this.sprites.rightPanel.h,
            rightPanelX, rightPanelY,
            this.sprites.rightPanel.w * scale, this.sprites.rightPanel.h * scale
        );

        // Clear and populate button hitboxes
        this.buttonHitboxes = [];

        // Draw 3x3 buttons on right panel
        const btnSprite = this.sprites.button;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const btnIndex = row * 3 + col;
                const btnX = rightPanelX + col * this.cellSize * scale + 2 * scale;
                const btnY = rightPanelY + row * this.cellSize * scale + 2 * scale;
                const btnW = (this.cellSize - 4) * scale;
                const btnH = (this.cellSize - 4) * scale;

                // Draw button (normal or pressed)
                if (this.pressedButton === btnIndex) {
                    ctx.drawImage(this.darkButtonCanvas, btnX, btnY, btnW, btnH);
                } else {
                    ctx.drawImage(
                        texture,
                        btnSprite.x, btnSprite.y, btnSprite.w, btnSprite.h,
                        btnX, btnY, btnW, btnH
                    );
                }

                // Store hitbox
                this.buttonHitboxes.push({
                    index: btnIndex,
                    x: btnX,
                    y: btnY,
                    w: btnW,
                    h: btnH
                });
            }
        }

        // Draw progress lights - LEFT side (shows current round progress)
        const lightBase = this.sprites.lightBase;
        for (let i = 0; i < 5; i++) {
            const lightPos = layout.leftLights[i];
            const lightX = offsetX + lightPos.x * scale;
            const lightY = offsetY + lightPos.y * scale;
            const lightW = lightBase.w * scale;
            const lightH = lightBase.h * scale;

            // Determine light state and draw appropriate canvas
            if (this.gamePhase === 'wrong' && i <= this.currentRound) {
                // During wrong phase, ALL lights up to current round show red (overrides green)
                ctx.drawImage(this.redLightCanvas, lightX, lightY, lightW, lightH);
            } else if (i < this.currentRound) {
                // Completed rounds show green
                ctx.drawImage(this.greenLightCanvas, lightX, lightY, lightW, lightH);
            } else {
                // Not yet reached - draw base (off) light
                ctx.drawImage(
                    texture,
                    lightBase.x, lightBase.y, lightBase.w, lightBase.h,
                    lightX, lightY, lightW, lightH
                );
            }
        }

        // Draw progress lights - RIGHT side (mirrors left side)
        for (let i = 0; i < 5; i++) {
            const lightPos = layout.rightLights[i];
            const lightX = offsetX + lightPos.x * scale;
            const lightY = offsetY + lightPos.y * scale;
            const lightW = lightBase.w * scale;
            const lightH = lightBase.h * scale;

            // Determine light state and draw appropriate canvas
            if (this.gamePhase === 'wrong' && i <= this.currentRound) {
                // During wrong phase, ALL lights up to current round show red (overrides green)
                ctx.drawImage(this.redLightCanvas, lightX, lightY, lightW, lightH);
            } else if (i < this.currentRound) {
                // Completed rounds show green
                ctx.drawImage(this.greenLightCanvas, lightX, lightY, lightW, lightH);
            } else {
                // Not yet reached - draw base (off) light
                ctx.drawImage(
                    texture,
                    lightBase.x, lightBase.y, lightBase.w, lightBase.h,
                    lightX, lightY, lightW, lightH
                );
            }
        }

    }

    handleClick(x, y) {
        if (!this.active) return false;

        // Only accept clicks during waiting phase
        if (this.gamePhase !== 'waiting') return true;

        // Check if clicked on any button
        for (const hitbox of this.buttonHitboxes) {
            if (x >= hitbox.x && x <= hitbox.x + hitbox.w &&
                y >= hitbox.y && y <= hitbox.y + hitbox.h) {

                // Visual feedback
                this.pressedButton = hitbox.index;
                this.pressTimer = 0;

                // Check if correct
                const expectedCell = this.sequence[this.playerIndex];
                if (hitbox.index === expectedCell) {
                    // Correct!
                    this.playerIndex++;

                    // Check if completed this round's sequence
                    if (this.playerIndex >= this.sequence.length) {
                        this.gamePhase = 'correct';
                        this.resultTimer = 0;
                    }
                } else {
                    // Wrong!
                    this.gamePhase = 'wrong';
                    this.resultTimer = 0;
                    this.playerIndex = 0;
                }

                return true;
            }
        }

        return true; // Consume click
    }

    handleDrag(x, y) {}
    handleRelease() {}
}

// Shields Task - Click infected (red) hexes to restore them
export class ShieldsTask extends Task {
    constructor(room, x, y) {
        super('Prime Shields', room, x, y);

        // Task panel dimensions (from assembler export)
        this.panelWidth = 600;
        this.panelHeight = 550;
        this.scale = 0.95;

        // Sprite source coordinates from the Shields sprite sheet (from JS export)
        // Note: sprite2 in assembler has x:-8 but we use 0, circleCrop means apply circle mask
        this.sprites = {
            mainBg: { x: 1, y: 0, w: 511, h: 507 },
            bgOverlay: { x: 0, y: 502, w: 458, h: 458, circleCrop: true }, // circular overlay to tint red
            miniHex: { x: 387, y: 836, w: 154, h: 154, circleCrop: true }   // hex cell (also circular)
        };

        // Placement positions from assembler JS export (where sprites are drawn)
        this.mainBgPos = { x: 84, y: 23 };
        this.bgOverlayPos = { x: 104, y: 47 };

        // Hex positions (7 total, honeycomb pattern) - from assembler layout
        this.hexPositions = [
            { x: 388, y: 123 },  // right top
            { x: 267, y: 333 },  // bottom center
            { x: 387, y: 262 },  // right bottom
            { x: 146, y: 264 },  // left bottom
            { x: 146, y: 125 },  // left top
            { x: 268, y: 53 },   // top center
            { x: 266, y: 192 }   // middle center
        ];

        // State
        this.infectedHexes = new Set(); // indices of infected (red) hexes
        this.hexStates = []; // 'normal', 'infected', 'cleared'

        // Cached tinted canvases
        this.tintedBgOverlay = null;
        this.tintedInfectedHex = null;
        this.normalHexCanvas = null;

        // Tint colors - bg is red, infected hexes are VERY DARK red
        this.bgTintColor = { r: 255, g: 50, b: 50 }; // strong red tint for bg overlay
        this.infectedTintColor = { r: 150, g: 0, b: 0 }; // VERY DARK red for infected hexes

        // Click feedback
        this.clickedHex = -1;
        this.clickTimer = 0;
    }

    start() {
        super.start();

        // Reset state
        this.hexStates = this.hexPositions.map(() => 'normal');
        this.infectedHexes.clear();
        this.clickedHex = -1;
        this.clickTimer = 0;

        // Randomly select 4 hexes to be infected
        const indices = [0, 1, 2, 3, 4, 5, 6];
        // Shuffle
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        // Pick first 4
        for (let i = 0; i < 4; i++) {
            this.infectedHexes.add(indices[i]);
            this.hexStates[indices[i]] = 'infected';
        }

        // Clear cached canvases to regenerate
        this.tintedBgOverlay = null;
        this.tintedInfectedHex = null;
        this.normalHexCanvas = null;
    }

    // Create tinted versions of sprites
    createTintedSprites(texture) {
        // Tinted background overlay (red tint, circular)
        this.tintedBgOverlay = this.createTintedCanvas(
            texture,
            this.sprites.bgOverlay,
            this.bgTintColor,
            0.5, // strong red tint
            true // apply circular mask
        );

        // Tinted infected hex (VERY DARK red) - apply circle mask
        this.tintedInfectedHex = this.createTintedCanvas(
            texture,
            this.sprites.miniHex,
            this.infectedTintColor,
            0.7, // very strong dark red tint
            this.sprites.miniHex.circleCrop // apply circular mask if specified
        );

        // Normal hex (no tint, but apply circle mask if specified)
        this.normalHexCanvas = this.createTintedCanvas(
            texture,
            this.sprites.miniHex,
            { r: 255, g: 255, b: 255 }, // no tint (white)
            0, // zero intensity = no tint
            this.sprites.miniHex.circleCrop // apply circular mask if specified
        );
    }

    createTintedCanvas(texture, sprite, tintColor, intensity, applyCircleMask = false) {
        const canvas = document.createElement('canvas');
        canvas.width = sprite.w;
        canvas.height = sprite.h;
        const ctx = canvas.getContext('2d');

        // Draw original sprite
        ctx.drawImage(
            texture,
            sprite.x, sprite.y, sprite.w, sprite.h,
            0, 0, sprite.w, sprite.h
        );

        // Get image data and apply tint
        const imageData = ctx.getImageData(0, 0, sprite.w, sprite.h);
        const data = imageData.data;

        const centerX = sprite.w / 2;
        const centerY = sprite.h / 2;
        const radius = Math.min(sprite.w, sprite.h) / 2;

        for (let y = 0; y < sprite.h; y++) {
            for (let x = 0; x < sprite.w; x++) {
                const i = (y * sprite.w + x) * 4;

                // Apply circular mask if requested
                if (applyCircleMask) {
                    const dx = x - centerX;
                    const dy = y - centerY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > radius) {
                        data[i + 3] = 0; // Set alpha to 0 outside circle
                        continue;
                    }
                }

                if (data[i + 3] === 0) continue; // Skip transparent pixels

                // Blend toward tint color
                data[i] = Math.round(data[i] * (1 - intensity) + tintColor.r * intensity);
                data[i + 1] = Math.round(data[i + 1] * (1 - intensity) + tintColor.g * intensity);
                data[i + 2] = Math.round(data[i + 2] * (1 - intensity) + tintColor.b * intensity);
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    update(dt) {
        if (!this.active) return;

        // Update click feedback timer
        if (this.clickTimer > 0) {
            this.clickTimer -= dt;
            if (this.clickTimer <= 0) {
                this.clickedHex = -1;
            }
        }

        // Check for completion
        if (this.infectedHexes.size === 0 && !this.completed) {
            this.completed = true;
            // Small delay before closing
            setTimeout(() => this.close(), 500);
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const texture = assetLoader.getTexture('shields');
        if (!texture) return;

        // Create tinted sprites if not yet created
        if (!this.tintedBgOverlay) {
            this.createTintedSprites(texture);
        }

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Center the panel
        const panelW = this.panelWidth * this.scale;
        const panelH = this.panelHeight * this.scale;
        const panelX = (screenW - panelW) / 2;
        const panelY = (screenH - panelH) / 2;

        ctx.save();
        ctx.translate(panelX, panelY);
        ctx.scale(this.scale, this.scale);

        // Draw main background at position from assembler JSON
        ctx.drawImage(
            texture,
            this.sprites.mainBg.x, Math.max(0, this.sprites.mainBg.y),
            this.sprites.mainBg.w, this.sprites.mainBg.h,
            this.mainBgPos.x, this.mainBgPos.y,
            this.sprites.mainBg.w, this.sprites.mainBg.h
        );

        // Draw tinted background overlay at position from assembler JSON
        ctx.drawImage(this.tintedBgOverlay, this.bgOverlayPos.x, this.bgOverlayPos.y);

        // Draw hexes at positions from assembler JSON
        for (let i = 0; i < this.hexPositions.length; i++) {
            const pos = this.hexPositions[i];
            const state = this.hexStates[i];

            // Hex position is top-left corner (as exported by assembler)
            const hexX = pos.x;
            const hexY = pos.y;

            // Choose canvas based on state
            let hexCanvas;
            if (state === 'infected') {
                hexCanvas = this.tintedInfectedHex;
            } else {
                hexCanvas = this.normalHexCanvas;
            }

            // Click feedback - flash brighter
            if (i === this.clickedHex) {
                ctx.globalAlpha = 0.7 + Math.sin(this.clickTimer * 20) * 0.3;
            }

            ctx.drawImage(hexCanvas, hexX, hexY);
            ctx.globalAlpha = 1.0;
        }

        ctx.restore();

        // Store panel position for hit detection
        this.renderPanelX = panelX;
        this.renderPanelY = panelY;
    }

    handleClick(x, y) {
        if (!this.active) return false;

        // Transform click to panel coordinates
        const localX = (x - this.renderPanelX) / this.scale;
        const localY = (y - this.renderPanelY) / this.scale;

        // Check if clicked on any hex
        for (let i = 0; i < this.hexPositions.length; i++) {
            const pos = this.hexPositions[i];
            const hexW = this.sprites.miniHex.w;
            const hexH = this.sprites.miniHex.h;

            // Hex bounding box (position is top-left corner from assembler)
            const hexX = pos.x;
            const hexY = pos.y;

            if (localX >= hexX && localX <= hexX + hexW &&
                localY >= hexY && localY <= hexY + hexH) {

                // Check if this hex is infected
                if (this.hexStates[i] === 'infected') {
                    // Clear the infection!
                    this.hexStates[i] = 'cleared';
                    this.infectedHexes.delete(i);
                    this.clickedHex = i;
                    this.clickTimer = 0.3;

                    console.log(`Cleared hex ${i}, ${this.infectedHexes.size} remaining`);
                }

                return true;
            }
        }

        return true; // Consume click
    }

    handleDrag(x, y) {}
    handleRelease() {}
}

export class EngineAlignTask extends Task {
    constructor(room, x, y) {
        super('Align Engine Output', room, x, y);

        // Task panel dimensions
        this.panelWidth = 500;
        this.panelHeight = 500;
        this.scale = 1.0;

        // Sprite info (sizes from the assembler)
        this.sprites = {
            base: { w: 500, h: 500 },
            engine: { w: 381, h: 189 },
            slider: { w: 95, h: 41 },
            dot: { w: 20, h: 4 }
        };

        // Engine position (center point for rotation)
        this.enginePos = { x: 30 + 381/2, y: 157 + 189/2 }; // center of engine

        // Dotted line config (horizontal reference line)
        this.dottedLine = {
            x: 200,
            y: 250,
            dotCount: 21,
            dotSpacing: 15,
            angle: 0 // always horizontal (target)
        };

        // Slider track path (from the marked coordinates - the curved path on right side)
        // These are the CENTER points of the curve from top to bottom
        this.sliderTrack = [
            { x: 465, y: 34 }, { x: 463, y: 51 }, { x: 455, y: 68 }, { x: 448, y: 83 },
            { x: 439, y: 100 }, { x: 437, y: 118 }, { x: 435, y: 138 }, { x: 430, y: 157 },
            { x: 428, y: 178 }, { x: 425, y: 195 }, { x: 421, y: 214 }, { x: 421, y: 237 },
            { x: 419, y: 258 }, { x: 419, y: 280 }, { x: 423, y: 301 }, { x: 427, y: 320 },
            { x: 430, y: 342 }, { x: 435, y: 364 }, { x: 440, y: 386 }, { x: 446, y: 405 },
            { x: 451, y: 422 }, { x: 457, y: 440 }, { x: 465, y: 459 }, { x: 468, y: 476 }
        ];

        // State
        this.engineAngle = 0; // Current engine angle in degrees (-45 to 45)
        this.sliderT = 0.5; // Slider position on track (0 = top, 1 = bottom)
        this.isDraggingSlider = false;

        // Tolerance for completion (degrees)
        this.angleTolerance = 3;
    }

    start() {
        super.start();

        // Randomize starting angle between -45 and 45, but NOT near 0
        const sign = Math.random() < 0.5 ? -1 : 1;
        this.engineAngle = sign * (20 + Math.random() * 25); // 20-45 degrees

        // Set slider position to match the angle
        // angle -45 = top (t=0), angle 0 = middle (t=0.5), angle 45 = bottom (t=1)
        this.sliderT = (this.engineAngle + 45) / 90;

        this.isDraggingSlider = false;
    }

    // Get slider position on track based on t (0-1)
    getSliderPosition(t) {
        t = Math.max(0, Math.min(1, t));
        const index = t * (this.sliderTrack.length - 1);
        const i = Math.floor(index);
        const frac = index - i;

        if (i >= this.sliderTrack.length - 1) {
            return this.sliderTrack[this.sliderTrack.length - 1];
        }

        // Linear interpolation between track points
        const p1 = this.sliderTrack[i];
        const p2 = this.sliderTrack[i + 1];
        return {
            x: p1.x + (p2.x - p1.x) * frac,
            y: p1.y + (p2.y - p1.y) * frac
        };
    }

    // Convert slider t to engine angle
    tToAngle(t) {
        // t=0 -> -45, t=0.5 -> 0, t=1 -> +45
        return (t - 0.5) * 90;
    }

    // Find closest t on track to a given point
    findClosestT(x, y) {
        let closestT = 0;
        let closestDist = Infinity;

        // Sample along the track
        for (let t = 0; t <= 1; t += 0.01) {
            const pos = this.getSliderPosition(t);
            const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
            if (dist < closestDist) {
                closestDist = dist;
                closestT = t;
            }
        }

        return closestT;
    }

    update(dt) {
        if (!this.active) return;

        // Update engine angle based on slider
        this.engineAngle = this.tToAngle(this.sliderT);

        // Check completion
        if (Math.abs(this.engineAngle) <= this.angleTolerance && !this.completed) {
            this.completed = true;
            setTimeout(() => this.close(), 500);
        }
    }

    render(ctx, assetLoader) {
        if (!this.active) return;

        const baseTexture = assetLoader.getTexture('engine_align_base');
        const engineTexture = assetLoader.getTexture('engine_align_engine');
        const sliderTexture = assetLoader.getTexture('engine_align_slider');
        const dotTexture = assetLoader.getTexture('engine_align_dot');

        if (!baseTexture) return;

        const screenW = ctx.canvas.width;
        const screenH = ctx.canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, screenW, screenH);

        // Center the panel
        const panelW = this.panelWidth * this.scale;
        const panelH = this.panelHeight * this.scale;
        const panelX = (screenW - panelW) / 2;
        const panelY = (screenH - panelH) / 2;

        ctx.save();
        ctx.translate(panelX, panelY);
        ctx.scale(this.scale, this.scale);

        // Check if aligned for green tint
        const isAligned = Math.abs(this.engineAngle) <= this.angleTolerance;

        // 1. Draw engine FIRST (bottom layer - so it goes behind the base)
        if (engineTexture) {
            ctx.save();
            ctx.translate(this.enginePos.x, this.enginePos.y);
            ctx.rotate(this.engineAngle * Math.PI / 180);
            ctx.drawImage(
                engineTexture,
                -this.sprites.engine.w / 2,
                -this.sprites.engine.h / 2,
                this.sprites.engine.w,
                this.sprites.engine.h
            );
            // Green tint overlay when aligned
            if (isAligned) {
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
                ctx.fillRect(
                    -this.sprites.engine.w / 2,
                    -this.sprites.engine.h / 2,
                    this.sprites.engine.w,
                    this.sprites.engine.h
                );
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.restore();
        }

        // 2. Draw base background (second to top - covers engine edges)
        ctx.drawImage(baseTexture, 0, 0, this.panelWidth, this.panelHeight);

        // 3. Draw dotted reference line (always horizontal at y=250)
        if (dotTexture) {
            const totalWidth = (this.dottedLine.dotCount - 1) * this.dottedLine.dotSpacing;
            const startX = this.dottedLine.x - totalWidth / 2;

            for (let i = 0; i < this.dottedLine.dotCount; i++) {
                const dotX = startX + i * this.dottedLine.dotSpacing;
                // Green tint when aligned
                if (isAligned) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
                    ctx.fillRect(
                        dotX - this.sprites.dot.w / 2,
                        this.dottedLine.y - this.sprites.dot.h / 2,
                        this.sprites.dot.w,
                        this.sprites.dot.h
                    );
                    ctx.restore();
                } else {
                    ctx.drawImage(
                        dotTexture,
                        dotX - this.sprites.dot.w / 2,
                        this.dottedLine.y - this.sprites.dot.h / 2,
                        this.sprites.dot.w,
                        this.sprites.dot.h
                    );
                }
            }
        }

        // 4. Draw slider at current position (top layer)
        if (sliderTexture) {
            const sliderPos = this.getSliderPosition(this.sliderT);
            ctx.drawImage(
                sliderTexture,
                sliderPos.x - this.sprites.slider.w / 2,
                sliderPos.y - this.sprites.slider.h / 2,
                this.sprites.slider.w,
                this.sprites.slider.h
            );
        }

        ctx.restore();

        // Store for hit detection
        this.renderPanelX = panelX;
        this.renderPanelY = panelY;
    }

    handleClick(x, y) {
        if (!this.active) return false;

        // Transform to panel coordinates
        const localX = (x - this.renderPanelX) / this.scale;
        const localY = (y - this.renderPanelY) / this.scale;

        // Check if clicking near slider
        const sliderPos = this.getSliderPosition(this.sliderT);
        const dist = Math.sqrt((localX - sliderPos.x) ** 2 + (localY - sliderPos.y) ** 2);

        if (dist < 60) { // Within 60px of slider
            this.isDraggingSlider = true;
            return true;
        }

        // Check if clicking on the track area (right side of panel)
        if (localX > 380 && localX < 500) {
            // Move slider to closest point on track
            this.sliderT = this.findClosestT(localX, localY);
            this.isDraggingSlider = true;
            return true;
        }

        return true;
    }

    handleDrag(x, y) {
        if (!this.isDraggingSlider) return;

        // Transform to panel coordinates
        const localX = (x - this.renderPanelX) / this.scale;
        const localY = (y - this.renderPanelY) / this.scale;

        // Find closest point on track
        this.sliderT = this.findClosestT(localX, localY);
    }

    handleRelease() {
        this.isDraggingSlider = false;
    }
}
