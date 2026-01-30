// Script to copy Among Us assets to the public folder
const fs = require('fs');
const path = require('path');

const sourceBase = path.join(__dirname, '../../daTA/Assets');
const destBase = path.join(__dirname, '../public/assets');

// Create destination if it doesn't exist
if (!fs.existsSync(destBase)) {
    fs.mkdirSync(destBase, { recursive: true });
}

// Assets to copy
const assetsToCopy = [
    // Player animations
    { src: 'Texture2D/PlayerAnimations.png', dest: 'PlayerAnimations.png' },
    { src: 'Texture2D/PlayerAnimations_0.png', dest: 'PlayerAnimations_0.png' },
    { src: 'Texture2D/PlayerAnimations_1.png', dest: 'PlayerAnimations_1.png' },
    { src: 'Texture2D/PlayerHands.png', dest: 'PlayerHands.png' },

    // Map textures (Skeld)
    { src: 'Texture2D/Admin-Comms-Elec-Engine-Halls-Shields-Storage.png', dest: 'Admin-Comms-Elec-Engine-Halls-Shields-Storage.png' },
    { src: 'Texture2D/Admin-Comms-Elec-Engine-Halls-Shields-Storage_0.png', dest: 'Admin-Comms-Elec-Engine-Halls-Shields-Storage_0.png' },
    { src: 'Texture2D/Cafeteria.png', dest: 'Cafeteria.png' },
    { src: 'Texture2D/Cafeteria_0.png', dest: 'Cafeteria_0.png' },
    { src: 'Texture2D/cafeteriaWalls.png', dest: 'cafeteriaWalls.png' },
    { src: 'Texture2D/Electrical.png', dest: 'Electrical.png' },
    { src: 'Texture2D/engine.png', dest: 'engine.png' },
    { src: 'Texture2D/Engine_0.png', dest: 'Engine_0.png' },
    { src: 'Texture2D/HallwayMain.png', dest: 'HallwayMain.png' },
    { src: 'Texture2D/hallwayL.png', dest: 'hallwayL.png' },
    { src: 'Texture2D/BG_Skeld.png', dest: 'BG_Skeld.png' },
    { src: 'Texture2D/BG_Skeld_0.png', dest: 'BG_Skeld_0.png' },

    // Kill animations
    { src: 'Texture2D/KillAnimations1.png', dest: 'KillAnimations1.png' },
    { src: 'Texture2D/KillAnimations2.png', dest: 'KillAnimations2.png' },
    { src: 'Texture2D/KillAnimations3.png', dest: 'KillAnimations3.png' },

    // UI elements
    { src: 'Texture2D/action-button.png', dest: 'action-button.png' },
    { src: 'Texture2D/Background.png', dest: 'Background.png' },

    // Astronaut colors (for reference)
    { src: 'Texture2D/Astronaut-Blue.png', dest: 'Astronaut-Blue.png' },
    { src: 'Texture2D/Astronaut-Cyan.png', dest: 'Astronaut-Cyan.png' },
    { src: 'Texture2D/Astronaut-Orange.png', dest: 'Astronaut-Orange.png' },
];

// Copy audio files too
const audioFiles = [
    { src: 'AudioClip/alarm_emergencymeeting.ogg', dest: 'audio/alarm_emergencymeeting.ogg' },
    { src: 'AudioClip/Alarm_sabotage.ogg', dest: 'audio/alarm_sabotage.ogg' },
    { src: 'AudioClip/AMB_Cafeteria.ogg', dest: 'audio/amb_cafeteria.ogg' },
];

console.log('Copying assets...');

let copied = 0;
let failed = 0;

for (const asset of assetsToCopy) {
    const srcPath = path.join(sourceBase, asset.src);
    const destPath = path.join(destBase, asset.dest);

    try {
        if (fs.existsSync(srcPath)) {
            // Create subdirectory if needed
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            fs.copyFileSync(srcPath, destPath);
            console.log(`  Copied: ${asset.dest}`);
            copied++;
        } else {
            console.log(`  Not found: ${asset.src}`);
            failed++;
        }
    } catch (e) {
        console.log(`  Error copying ${asset.src}: ${e.message}`);
        failed++;
    }
}

// Audio folder
const audioDir = path.join(destBase, 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}

for (const asset of audioFiles) {
    const srcPath = path.join(sourceBase, asset.src);
    const destPath = path.join(destBase, asset.dest);

    try {
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`  Copied: ${asset.dest}`);
            copied++;
        }
    } catch (e) {
        // Skip audio errors silently
    }
}

console.log(`\nDone! Copied ${copied} files, ${failed} not found/failed.`);
console.log('You can now run: npm run dev');
