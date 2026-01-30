// AssetLoader - Parses Unity sprite JSON and loads textures

export class AssetLoader {
    constructor() {
        this.textures = new Map();
        this.sprites = new Map();
        this.audioFiles = new Map();
    }

    async loadTexture(name, path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.textures.set(name, img);
                resolve(img);
            };
            img.onerror = reject;
            img.src = path;
        });
    }

    // Parse Unity sprite JSON format to get frame data
    parseSpriteJSON(json) {
        const rect = json.m_Rect || json.m_RD?.m_TextureRect;
        if (!rect) return null;

        return {
            name: json.m_Name,
            x: rect.m_X,
            y: rect.m_Y,
            width: rect.m_Width,
            height: rect.m_Height,
            pivot: json.m_Pivot ? {
                x: json.m_Pivot.m_X,
                y: json.m_Pivot.m_Y
            } : { x: 0.5, y: 0.5 },
            pixelsPerUnit: json.m_PixelsToUnits || 100
        };
    }

    async loadSpriteSheet(name, texturePath, jsonPaths) {
        const texture = await this.loadTexture(name, texturePath);
        const frames = [];

        for (const jsonPath of jsonPaths) {
            try {
                const response = await fetch(jsonPath);
                const json = await response.json();
                const frame = this.parseSpriteJSON(json);
                if (frame) {
                    frames.push(frame);
                }
            } catch (e) {
                console.warn(`Failed to load sprite JSON: ${jsonPath}`, e);
            }
        }

        this.sprites.set(name, { texture, frames });
        return { texture, frames };
    }

    // Load a simple spritesheet with uniform grid
    loadGridSpriteSheet(name, texture, frameWidth, frameHeight, frameCount, columns) {
        const frames = [];
        for (let i = 0; i < frameCount; i++) {
            const col = i % columns;
            const row = Math.floor(i / columns);
            frames.push({
                name: `${name}_${i}`,
                x: col * frameWidth,
                y: row * frameHeight,
                width: frameWidth,
                height: frameHeight,
                pivot: { x: 0.5, y: 0.5 }
            });
        }
        this.sprites.set(name, { texture, frames });
        return { texture, frames };
    }

    getTexture(name) {
        return this.textures.get(name);
    }

    getSprite(name) {
        return this.sprites.get(name);
    }

    // Draw a specific frame from a spritesheet
    // Unity uses bottom-left origin, we need to convert to top-left
    drawFrame(ctx, spriteName, frameIndex, x, y, scale = 1, flipX = false) {
        const sprite = this.sprites.get(spriteName);
        if (!sprite || !sprite.frames[frameIndex]) return;

        const frame = sprite.frames[frameIndex];
        const { texture } = sprite;

        // Apply per-frame renderScale if present (for walk frames that need scaling up)
        const frameScale = frame.renderScale || 1;
        const totalScale = scale * frameScale;

        ctx.save();
        ctx.translate(x, y);
        if (flipX) {
            ctx.scale(-1, 1);
        }
        ctx.scale(totalScale, totalScale);

        // Convert Unity coordinates (bottom-left origin) to canvas (top-left origin)
        const textureHeight = texture.height;
        const srcY = textureHeight - frame.y - frame.height;

        // Draw from spritesheet - center on pivot point
        ctx.drawImage(
            texture,
            frame.x, srcY, frame.width, frame.height,
            -frame.width * (frame.pivot?.x || 0.5),
            -frame.height * (frame.pivot?.y || 0.5),
            frame.width, frame.height
        );

        ctx.restore();
    }
}

export const assetLoader = new AssetLoader();
