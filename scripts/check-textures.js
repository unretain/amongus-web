const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '../public/assets');
const files = fs.readdirSync(assetsDir).filter(f => f.startsWith('PlayerAnimations') && f.endsWith('.png'));

for (const file of files) {
    const filePath = path.join(assetsDir, file);
    const buffer = fs.readFileSync(filePath);

    // PNG dimensions are at bytes 16-23 (width at 16-19, height at 20-23)
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        console.log(`${file}: ${width} x ${height}`);
    }
}
