const TMDB_API_KEY = 'd0c153faeb709eb8deffeece3081d375';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';

// User Links
const PUSHPA_LINK = 'https://sgpo1-4.download.real-debrid.com/d/S23YS2FUNO77M40/They%20Call%20Him%20OG%20%282025%29%20Hin%20720p%20WEBRip%20x265%20DD%205.1%20ESub.mkv';

// State
let ytPlayer;
let playerReady = false;
let currentMedia = {
    id: null,
    type: 'movie',
    title: 'They Call Him OG'
};

let uiTimeout;
let isLocked = false;
let lastTap = 0;
let isFitScreen = false;

// DOM Elements
const mainVideo = document.getElementById('main-video');
const playerOverlay = document.getElementById('player-overlay');
const playerUI = document.querySelectorAll('.player-ui-element');
const brightnessSlider = document.getElementById('brightness-slider');
const brightnessFill = document.getElementById('brightness-fill');
const lockMessage = document.getElementById('lock-message');

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch for OG
    fetchMediaData('They Call Him OG', 'movie');
    initAppEvents();
    initPlayerLogic();
    registerServiceWorker();
});

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registered'))
                .catch(err => console.log('SW registration failed', err));
        });
    }
}

// --- Data Fetching ---

async function fetchMediaData(query, type) {
    try {
        // Use hardcoded ID for They Call Him OG (1080365) to ensure real poster
        const id = query === 'They Call Him OG' ? 1080365 : null;
        
        let details;
        if (id) {
            const detailRes = await fetch(`${BASE_URL}/${type}/${id}?api_key=${TMDB_API_KEY}&append_to_response=videos,credits`);
            details = await detailRes.json();
            currentMedia.id = id;
        } else {
            const searchRes = await fetch(`${BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
            const searchData = await searchRes.json();
            if (!searchData.results || searchData.results.length === 0) return;
            const media = searchData.results[0];
            const detailRes = await fetch(`${BASE_URL}/${type}/${media.id}?api_key=${TMDB_API_KEY}&append_to_response=videos,credits`);
            details = await detailRes.json();
            currentMedia.id = media.id;
        }
        
        currentMedia.type = type;
        updateHeroUI(details);
        loadTrailer(details.videos.results);
        
        if (type === 'tv') {
            fetchEpisodes(currentMedia.id, 1);
            document.getElementById('episodes-section').style.display = 'block';
        }
    } catch (err) { console.error(err); }
}

function updateHeroUI(details) {
    document.getElementById('movie-title').textContent = details.title || details.name;
    document.getElementById('release-year').textContent = (details.release_date || details.first_air_date || '').split('-')[0];
    document.getElementById('movie-description').textContent = details.overview;
    document.getElementById('hero').style.backgroundImage = `url(${IMAGE_BASE_URL}${details.backdrop_path})`;
}

function loadTrailer(videos) {
    const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') || videos[0];
    if (!trailer) return;

    if (ytPlayer && playerReady) {
        ytPlayer.loadVideoById(trailer.key);
    } else {
        window.onYouTubeIframeAPIReady = () => {
            ytPlayer = new YT.Player('youtube-player', {
                videoId: trailer.key,
                playerVars: { autoplay: 1, controls: 0, mute: 1, loop: 1, playlist: trailer.key },
                events: { onReady: (e) => { e.target.playVideo(); playerReady = true; } }
            });
        };
    }
}

// --- Player Logic ---

function initPlayerLogic() {
    // Play Button
    document.getElementById('play-btn').onclick = openPlayer;
    document.getElementById('close-player').onclick = closePlayer;

    // Center Controls
    const playCenter = document.getElementById('toggle-play-center');
    playCenter.onclick = togglePlay;
    document.getElementById('rewind-10').onclick = () => mainVideo.currentTime -= 10;
    document.getElementById('forward-10').onclick = () => mainVideo.currentTime += 10;

    // Progress Bar
    const progressContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('player-progress-bar');
    const previewThumbnail = document.getElementById('preview-thumbnail');
    const previewVideo = document.getElementById('preview-video');
    const previewTime = document.getElementById('preview-time');
    
    mainVideo.ontimeupdate = () => {
        const percent = (mainVideo.currentTime / mainVideo.duration) * 100;
        progressBar.style.width = `${percent}%`;
        
        // Move Red Dot with progress
        const handle = document.getElementById('player-progress-handle');
        handle.style.left = `${percent}%`;

        document.getElementById('current-time-display').textContent = formatTime(mainVideo.currentTime);
        document.getElementById('duration-display').textContent = formatTime(mainVideo.duration);
    };

    mainVideo.onerror = (e) => {
        console.error("Video Error:", mainVideo.error);
        let msg = "Playback failed. ";
        if (mainVideo.error.code === 4) msg += "Your browser might not support this 4K HEVC format.";
        else if (mainVideo.error.code === 2) msg += "Network error. Please check your internet or Real-Debrid link.";
        else msg += "Error code: " + mainVideo.error.code;
        
        showToast(msg);
        document.getElementById('player-loading').style.display = 'none';
    };

    // Hover/Touch Preview Logic
    progressContainer.onmousemove = (e) => showPreview(e);
    progressContainer.ontouchmove = (e) => showPreview(e.touches[0]);
    progressContainer.onmouseleave = () => previewThumbnail.classList.remove('active');
    progressContainer.ontouchend = () => previewThumbnail.classList.remove('active');
    
    let previewTask;
    function showPreview(e) {
        const rect = progressContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.pageX - rect.left) / rect.width));
        const time = pos * mainVideo.duration;
        
        previewThumbnail.classList.add('active');
        previewThumbnail.style.left = `${pos * 100}%`;
        previewTime.textContent = formatTime(time);
        
        if (!previewVideo.src) {
            previewVideo.src = mainVideo.src;
            previewVideo.preload = 'auto';
        }
        
        // Cancel previous update to avoid backlog
        if (previewTask) cancelAnimationFrame(previewTask);
        
        previewTask = requestAnimationFrame(() => {
            if (previewVideo.fastSeek) {
                previewVideo.fastSeek(time);
            } else {
                previewVideo.currentTime = time;
            }
        });
    }

    progressContainer.onclick = (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.pageX - rect.left) / rect.width;
        mainVideo.currentTime = pos * mainVideo.duration;
    };

    // UI Visibility
    playerOverlay.onclick = (e) => {
        if (isLocked) {
            handleLockClick();
            return;
        }
        
        // If clicking on video wrapper (empty space)
        if (e.target.id === 'video-wrapper' || e.target.id === 'main-video') {
            const isHidden = playerUI[0].classList.contains('hidden');
            if (isHidden) showUI(); else hideUI();
        } else {
            resetUITimer();
        }
    };

    // Brightness
    brightnessSlider.oninput = (e) => {
        const val = e.target.value;
        brightnessFill.style.height = `${val}%`;
        playerOverlay.style.filter = `brightness(${0.3 + (val / 100) * 0.7})`;
    };

    // Set initial brightness
    playerOverlay.style.filter = `brightness(1)`;

    // Lock System
    document.getElementById('lock-player').onclick = toggleLock;
    lockMessage.onclick = handleLockClick;

    // Speed Modal
    const speedBtn = document.getElementById('speed-btn');
    const speedModal = document.getElementById('speed-modal');
    speedBtn.onclick = () => speedModal.style.display = 'flex';
    
    document.querySelectorAll('.speed-opt').forEach(opt => {
        opt.onclick = () => {
            const speed = parseFloat(opt.dataset.speed);
            mainVideo.playbackRate = speed;
            document.getElementById('current-speed-text').textContent = speed === 1 ? 'Normal (1x)' : `${speed}x`;
            document.querySelectorAll('.speed-opt').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            speedModal.style.display = 'none';
        };
    });

    // Audio & Subs
    const audioSubsBtn = document.getElementById('audio-subs-btn');
    const audioSubsModal = document.getElementById('audio-subs-modal');
    audioSubsBtn.onclick = () => {
        audioSubsModal.style.display = 'flex';
        loadTracks();
    };

    // Modal Buttons
    document.querySelector('.cancel-btn').onclick = () => audioSubsModal.style.display = 'none';
    document.querySelector('.apply-btn').onclick = () => audioSubsModal.style.display = 'none';

    // Zoom (Fit to Screen)
    document.getElementById('fit-screen-btn').onclick = toggleFitScreen;

    // Rotate Screen
    document.getElementById('rotate-screen-btn').onclick = toggleRotation;

    playerOverlay.addEventListener('dblclick', (e) => {
        if (e.target.id === 'main-video') {
            toggleFitScreen();
        }
    });

    // Pinch to Zoom (Fit Screen) detection
    let initialPinchDist = 0;
    playerOverlay.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialPinchDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
        }
    }, { passive: true });

    playerOverlay.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDist > 0) {
            const currentDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            
            const diff = currentDist - initialPinchDist;
            
            // If pinched out (zoomed) by more than 50px
            if (diff > 50 && !isFitScreen) {
                toggleFitScreen();
                initialPinchDist = 0; // Reset to prevent multiple triggers
            } 
            // If pinched in by more than 50px
            else if (diff < -50 && isFitScreen) {
                toggleFitScreen();
                initialPinchDist = 0;
            }
        }
    }, { passive: true });

    // Modals Close
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.onclick = () => btn.closest('.player-modal').style.display = 'none';
    });
}

function toggleFitScreen() {
    isFitScreen = !isFitScreen;
    mainVideo.classList.toggle('fit-screen', isFitScreen);
    
    const icon = document.querySelector('#fit-screen-btn i');
    icon.className = isFitScreen ? 'fas fa-compress' : 'fas fa-expand';
    
    // Show a small toast message
    showToast(isFitScreen ? "Fit to Screen" : "Original Ratio");
}

function toggleRotation() {
    if (screen.orientation && screen.orientation.lock) {
        const type = screen.orientation.type.includes('portrait') ? 'landscape' : 'portrait';
        screen.orientation.lock(type).catch(e => console.log(e));
    } else {
        // Fallback for browsers that don't support locking
        showToast("Rotation not supported on this browser");
    }
}

function showToast(text) {
    let toast = document.getElementById('player-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'player-toast';
        toast.className = 'player-toast';
        playerOverlay.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function openPlayer() {
    playerOverlay.style.display = 'flex';
    document.getElementById('player-loading').style.display = 'block';
    
    // Update player title dynamically
    document.getElementById('player-media-title').textContent = currentMedia.title;
    
    if (ytPlayer && playerReady) ytPlayer.pauseVideo();
    
    mainVideo.src = PUSHPA_LINK;
    mainVideo.preload = 'auto';
    mainVideo.load();
    
    // Play with a slight delay to ensure source is set
    setTimeout(() => {
        mainVideo.play().catch(err => {
            console.error("Auto-play failed:", err);
            showToast("Tap anywhere to start playback");
        });
    }, 100);
    
    // Note: Removed previewVideo preloading to save bandwidth for 4K stream
    
    showUI();

    // Hide spinner when video starts playing
    mainVideo.onplaying = () => {
        document.getElementById('player-loading').style.display = 'none';
    };

    mainVideo.oncanplay = () => {
        document.getElementById('player-loading').style.display = 'none';
    };

    // Show spinner if buffering
    mainVideo.onwaiting = () => {
        document.getElementById('player-loading').style.display = 'block';
    };

    // Force Landscape on Mobile (Auto Detector)
    const forceLandscape = () => {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(e => {
                console.log("Orientation lock failed:", e);
                // If lock fails, we still suggest rotation via UI
                checkOrientation();
            });
        }
    };

    if (playerOverlay.requestFullscreen) {
        playerOverlay.requestFullscreen().then(forceLandscape);
    } else if (playerOverlay.webkitRequestFullscreen) {
        playerOverlay.webkitRequestFullscreen();
        setTimeout(forceLandscape, 500);
    } else {
        forceLandscape();
    }

    // Handle Orientation change manually as fallback
    window.addEventListener("orientationchange", checkOrientation);
    checkOrientation();
}

function checkOrientation() {
    const warning = document.getElementById('orientation-warning');
    if (playerOverlay.style.display === 'flex' && window.innerHeight > window.innerWidth) {
        warning.style.display = 'flex';
    } else {
        warning.style.display = 'none';
    }
}

function closePlayer() {
    playerOverlay.style.display = 'none';
    mainVideo.pause();
    if (ytPlayer && playerReady) ytPlayer.playVideo();
    checkOrientation();
}

function togglePlay() {
    const btn = document.getElementById('toggle-play-center');
    if (mainVideo.paused) {
        mainVideo.play();
        btn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        mainVideo.pause();
        btn.innerHTML = '<i class="fas fa-play"></i>';
    }
}

function showUI() {
    if (isLocked) return;
    playerUI.forEach(el => el.classList.remove('hidden'));
    resetUITimer();
}

function hideUI() {
    if (isLocked) return;
    playerUI.forEach(el => el.classList.add('hidden'));
}

function resetUITimer() {
    clearTimeout(uiTimeout);
    if (!isLocked) {
        uiTimeout = setTimeout(hideUI, 4000);
    }
}

function toggleLock() {
    isLocked = !isLocked;
    const btn = document.getElementById('lock-player');
    
    if (isLocked) {
        btn.innerHTML = '<i class="fas fa-lock"></i>';
        // Hide all UI
        playerUI.forEach(el => el.classList.add('hidden'));
        showLockMessage();
    } else {
        btn.innerHTML = '<i class="fas fa-unlock"></i>';
        lockMessage.style.display = 'none';
        showUI();
    }
}

function showLockMessage() {
    lockMessage.style.display = 'flex';
    // Auto hide lock message after 4s, but only if it's currently showing
    setTimeout(() => {
        if (isLocked) lockMessage.style.display = 'none';
    }, 4000);
}

function handleLockClick() {
    // Show lock message on any click when locked
    if (isLocked) {
        showLockMessage();
    }
    
    // Double tap to unlock logic
    const now = new Date().getTime();
    if (now - lastTap < 300) {
        toggleLock();
    }
    lastTap = now;
}

async function loadTracks() {
    const audioList = document.getElementById('audio-track-list');
    const subList = document.getElementById('subtitle-track-list');
    
    audioList.innerHTML = '<div class="track-item">Scanning tracks...</div>';
    subList.innerHTML = '<div class="track-item">Scanning tracks...</div>';

    try {
        // Fetch real metadata from our local Node server
        const response = await fetch(`http://localhost:3000/api/metadata?url=${encodeURIComponent(PUSHPA_LINK)}`);
        const data = await response.json();

        if (data.audio && data.audio.length > 0) {
            // Find Hindi track index
            let hindiTrack = data.audio.find(t => t.label.includes('HINDI'));
            let activeId = hindiTrack ? hindiTrack.id : data.audio[0].id;
            
            const audioTracks = data.audio.map((t) => ({ 
                id: t.id, 
                label: t.label, 
                active: t.id === activeId 
            }));
            
            renderTracks(audioList, audioTracks, 'audio');
            
            // If we found a specific Hindi track that isn't the first one, or just to be safe, switch to it
            if (activeId !== data.audio[0].id || hindiTrack) {
                switchTrack(activeId, -1);
            }
        } else {
            renderTracks(audioList, [{ id: 0, label: 'Hindi [Original]', active: true }], 'audio');
        }

        if (data.subtitles && data.subtitles.length > 0) {
            const subTracks = [{ id: -1, label: 'Off', active: true }];
            data.subtitles.forEach(t => subTracks.push({ id: t.id, label: t.label, active: false }));
            renderTracks(subList, subTracks, 'sub');
        } else {
            renderTracks(subList, [{ id: -1, label: 'Off', active: true }], 'sub');
        }
    } catch (err) {
        console.warn("Backend not running or error fetching tracks.");
        renderTracks(audioList, [{ id: 0, label: 'Hindi [Original]', active: true }, { id: 1, label: 'English', active: false }], 'audio');
        renderTracks(subList, [{ id: -1, label: 'Off', active: true }, { id: 0, label: 'English', active: false }], 'sub');
    }
}

function renderTracks(container, tracks, type) {
    container.innerHTML = '';
    tracks.forEach(track => {
        const item = document.createElement('div');
        item.className = `track-item ${track.active ? 'active' : ''}`;
        item.innerHTML = `<i class="fas fa-check"></i> ${track.label}`;
        item.onclick = () => {
            container.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            
            // Switch Track via Server Remuxing
            if (type === 'audio') {
                switchTrack(track.id, -1);
            }
        };
        container.appendChild(item);
    });
}

function switchTrack(audioId, subId) {
    const currentTime = mainVideo.currentTime;
    const isPaused = mainVideo.paused;
    
    // Construct new URL that selects the specific audio index
    const newUrl = `http://localhost:3000/api/stream?url=${encodeURIComponent(PUSHPA_LINK)}&audio=${audioId}`;
    
    mainVideo.src = newUrl;
    mainVideo.load();
    
    mainVideo.onloadedmetadata = () => {
        mainVideo.currentTime = currentTime;
        if (!isPaused) mainVideo.play();
    };
}

function formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '00:00:00';
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = Math.floor(sec % 60);

    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    const s = seconds.toString().padStart(2, '0');
    
    return `${h}:${m}:${s}`;
}

function initAppEvents() {
    // My List toggle
    const myListBtn = document.getElementById('mylist-btn');
    myListBtn.onclick = () => {
        const icon = myListBtn.querySelector('i');
        if (icon.classList.contains('fa-plus')) {
            icon.className = 'fas fa-check';
            myListBtn.innerHTML = '<i class="fas fa-check"></i> Added';
        } else {
            icon.className = 'fas fa-plus';
            myListBtn.innerHTML = '<i class="fas fa-plus"></i> My List';
        }
    };
}
