const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Paths to executables
const ffprobePath = path.join(__dirname, 'ffprobe.exe');

app.get('/api/metadata', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send('No URL provided');

    // Run ffprobe with more detail to find all tracks
    const command = `"${ffprobePath}" -v quiet -show_entries stream=index,codec_type,codec_name:stream_tags=language,title -print_format json "${videoUrl}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return res.status(500).json({ error: 'Failed to probe video' });
        }
        try {
            const data = JSON.parse(stdout);
            const audioTracks = data.streams
                .filter(s => s.codec_type === 'audio')
                .map((s, i) => ({
                    id: s.index,
                    label: (s.tags?.title || s.tags?.language || `Track ${i + 1}`).toUpperCase(),
                    codec: s.codec_name,
                    language: s.tags?.language || 'und'
                }));

            const subtitleTracks = data.streams
                .filter(s => s.codec_type === 'subtitle')
                .map((s, i) => ({
                    id: s.index,
                    label: (s.tags?.title || s.tags?.language || `Subtitle ${i + 1}`).toUpperCase(),
                    codec: s.codec_name,
                    language: s.tags?.language || 'und'
                }));

            res.json({ audio: audioTracks, subtitles: subtitleTracks });
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse metadata' });
        }
    });
});

// Streaming endpoint to switch tracks via FFmpeg remuxing
app.get('/api/stream', (req, res) => {
    const videoUrl = req.query.url;
    const audioIndex = req.query.audio || 0;
    const subIndex = req.query.sub || -1;

    if (!videoUrl) return res.status(400).send('No URL provided');

    const ffmpegPath = path.join(__dirname, 'ffmpeg.exe');
    
    // Command to remux on the fly: copy video, transcode audio to stereo AAC for mobile compatibility
    let command = `"${ffmpegPath}" -i "${videoUrl}" -map 0:v:0 -map 0:${audioIndex} -c:v copy -c:a aac -ac 2 -f matroska -`;
    
    if (subIndex !== -1) {
        command = `"${ffmpegPath}" -i "${videoUrl}" -map 0:v:0 -map 0:${audioIndex} -map 0:${subIndex} -c:v copy -c:a aac -ac 2 -c:s copy -f matroska -`;
    }

    res.setHeader('Content-Type', 'video/x-matroska');
    
    const ffmpegProcess = exec(command);
    
    ffmpegProcess.stdout.pipe(res);
    
    ffmpegProcess.stderr.on('data', (data) => {
        // Optional: Log ffmpeg progress
    });

    req.on('close', () => {
        ffmpegProcess.kill();
    });
});

app.listen(port, () => {
    console.log(`OnixPlay+ Backend running at http://localhost:${port}`);
});
