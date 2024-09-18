const fs = require('fs');

// Third-party imports
const express = require('express');
const os = require('os');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { exec } = require('child_process');

// Load env variables
dotenv.config();

// Create express app
const app = express();

const PORT = 3000;

app.use(
    cors({
        origin: `${process.env.FRONTEND_URL}`,
    })
);

const downloadDir = path.join(os.homedir(), 'Downloads', 'PlaylistPlunge');

if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}

// Get path to cookies.txt in the same folder as server.js
const cookiesFilePath = path.join(__dirname, 'cookies.txt');

function getExistingFiles() {
    return fs
        .readdirSync(downloadDir)
        .map(file => path.basename(file, path.extname(file)));
}

app.get('/download', (req, res) => {
    const playlistUrl = req.query.url;
    if (!playlistUrl) {
        return res.status(400).send('Playlist URL is required.');
    }

    // Prepare Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Get list of existing files
    const existingFiles = getExistingFiles();

    // yt-dlp command to download the playlist
    const command = `yt-dlp --cookies ${cookiesFilePath} --progress --no-post-overwrites --ignore-errors -o "${downloadDir}/%(title)s.%(ext)s" ${playlistUrl}`;
    const process = exec(command);

    process.stdout.on('data', data => {
        const dataStr = data.toString();
        console.log(dataStr);

        // Send data back to client via SSE
        res.write(`data: ${JSON.stringify({ message: dataStr })}\n\n`);

        // Title extraction logic (depending on yt-dlp output)
        const match = dataStr.match(/[\w\s-]+(?=\.mp4|\.mkv)/i);
        if (match) {
            const newFile = match[0].trim();
            if (existingFiles.includes(newFile)) {
                console.log(`Skipping ${newFile}, already exists.`);
                res.write(
                    `data: ${JSON.stringify({ message: `Skipping ${newFile}, already exists.` })}\n\n`
                );
            }
        }
    });

    process.stderr.on('data', data => {
        console.error(`Error -> ${data}`);
        res.write(`data: ${JSON.stringify({ error: data.toString() })}\n\n`);
    });

    process.on('exit', code => {
        console.log(`Process exited with code ${code}`);
        res.write(
            `data: ${JSON.stringify({ message: `Process exited with code ${code}` })}\n\n`
        );
        res.end();
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on ${PORT}`);
});
