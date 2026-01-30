// Extract sprite frame data from Unity JSON files
const fs = require('fs');
const path = require('path');

const spriteDir = path.join(__dirname, '../../daTA/Assets/Sprite');
const outputFile = path.join(__dirname, '../public/assets/sprite-data.json');

// Frames we want to extract
// idle.json works for idle, Astronaut_Walk for walk animation
const framePatterns = [
    { pattern: /^idle\.json$/, category: 'idle' },
    { pattern: /^Astronaut_Walk\d+\.json$/, category: 'walk' },
    { pattern: /^ghost\d+\.json$/, category: 'ghost' },
];

const spriteData = {
    idle: [],
    walk: [],
    ghost: []
};

function extractFrameData(jsonPath) {
    try {
        const content = fs.readFileSync(jsonPath, 'utf8');
        const json = JSON.parse(content);

        // Use m_RD.m_TextureRect for actual texture coordinates (m_Rect can have different values)
        const rect = json.m_RD?.m_TextureRect || json.m_Rect;
        if (!rect || rect.m_Width === 0) return null;

        return {
            name: json.m_Name,
            x: Math.round(rect.m_X),
            y: Math.round(rect.m_Y),
            width: Math.round(rect.m_Width),
            height: Math.round(rect.m_Height),
            pivot: json.m_Pivot ? {
                x: json.m_Pivot.m_X,
                y: json.m_Pivot.m_Y
            } : { x: 0.5, y: 0.5 }
        };
    } catch (e) {
        return null;
    }
}

console.log('Extracting sprite frame data...');

const files = fs.readdirSync(spriteDir);

for (const file of files) {
    if (!file.endsWith('.json')) continue;

    for (const { pattern, category } of framePatterns) {
        if (pattern.test(file)) {
            const framePath = path.join(spriteDir, file);
            const frameData = extractFrameData(framePath);
            if (frameData) {
                spriteData[category].push(frameData);
                console.log(`  Found ${category}: ${frameData.name} at (${frameData.x}, ${frameData.y})`);
            }
        }
    }
}

// Sort walk frames by name
spriteData.walk.sort((a, b) => {
    const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
    const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
    return numA - numB;
});

// Write output
fs.writeFileSync(outputFile, JSON.stringify(spriteData, null, 2));
console.log(`\nWrote sprite data to ${outputFile}`);
console.log(`  Idle frames: ${spriteData.idle.length}`);
console.log(`  Walk frames: ${spriteData.walk.length}`);
console.log(`  Ghost frames: ${spriteData.ghost.length}`);
