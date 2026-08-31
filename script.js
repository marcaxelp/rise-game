"use strict";

/* ============================================================
   RISE & FALL
   iOS / Capacitor Ready Game Script
============================================================ */


/* ============================================================
   CANVAS
============================================================ */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", {
    alpha: false
});

const W = canvas.width;
const H = canvas.height;


/* ============================================================
   GAME STATE
============================================================ */

let gameState = "ready";

let score = 0;
let best = 0;

let worldDistance = 0;

let energy = 100;

let combo = 0;

let perfectTimer = 0;

let world = "grass";

let worldProgress = 0;

let autoTheme = true;

let isHolding = false;

let lastTime = 0;

let gameOverTimer = null;


/* ============================================================
   LOCAL STORAGE
============================================================ */

try {

    best = Number(
        localStorage.getItem("riseFallBest") || 0
    );

} catch (error) {

    best = 0;
}


/* ============================================================
   TUTORIAL
============================================================ */

const tutorialOverlay =
    document.getElementById("tutorialOverlay");

let tutorialTimer = 0;

let tutorialSeen = false;

try {

    tutorialSeen =
        localStorage.getItem(
            "riseFallTutorialSeen"
        ) === "1";

} catch (error) {

    tutorialSeen = false;
}


function showTutorial() {

    if (tutorialSeen) {
        return;
    }

    tutorialTimer = 600;

    if (tutorialOverlay) {

        tutorialOverlay.classList.remove(
            "hidden"
        );
    }
}


function updateTutorial(delta) {

    if (tutorialTimer <= 0) {
        return;
    }

    tutorialTimer -= delta;

    if (tutorialTimer <= 0) {

        tutorialTimer = 0;

        if (tutorialOverlay) {

            tutorialOverlay.classList.add(
                "hidden"
            );
        }

        try {

            localStorage.setItem(
                "riseFallTutorialSeen",
                "1"
            );

        } catch (error) {
            // Storage unavailable.
        }
    }
}


/* ============================================================
   SCREEN SHAKE
============================================================ */

let shakeTime = 0;
let shakeStrength = 0;


function startScreenShake(
    strength = 8,
    duration = 16
) {

    shakeStrength = strength;
    shakeTime = duration;
}


function updateScreenShake(delta) {

    if (shakeTime <= 0) {

        shakeTime = 0;
        shakeStrength = 0;

        return;
    }

    shakeTime -= delta;

    if (shakeTime <= 0) {

        shakeTime = 0;
        shakeStrength = 0;
    }
}


function resetScreenShake() {

    shakeTime = 0;
    shakeStrength = 0;

    ctx.setTransform(
        1,
        0,
        0,
        1,
        0,
        0
    );
}


/* ============================================================
   AUDIO
============================================================ */

let audioCtx = null;


function initAudio() {

    if (!audioCtx) {

        try {

            const AudioContextClass =
                window.AudioContext ||
                window.webkitAudioContext;

            if (!AudioContextClass) {
                return;
            }

            audioCtx =
                new AudioContextClass();

        } catch (error) {

            audioCtx = null;

            return;
        }
    }

    if (
        audioCtx &&
        audioCtx.state === "suspended"
    ) {

        audioCtx.resume().catch(() => {});
    }
}


function suspendAudio() {

    if (
        audioCtx &&
        audioCtx.state === "running"
    ) {

        audioCtx.suspend().catch(() => {});
    }
}


function playTone(
    freq,
    duration,
    type = "sine",
    volume = 0.05,
    endFreq = null
) {

    initAudio();

    if (!audioCtx) {
        return;
    }

    if (audioCtx.state !== "running") {
        return;
    }

    try {

        const now =
            audioCtx.currentTime;

        const osc =
            audioCtx.createOscillator();

        const gain =
            audioCtx.createGain();

        osc.type = type;

        osc.frequency.setValueAtTime(
            freq,
            now
        );

        if (endFreq !== null) {

            osc.frequency.exponentialRampToValueAtTime(
                Math.max(1, endFreq),
                now + duration
            );
        }

        gain.gain.setValueAtTime(
            volume,
            now
        );

        gain.gain.exponentialRampToValueAtTime(
            0.001,
            now + duration
        );

        osc.connect(gain);

        gain.connect(
            audioCtx.destination
        );

        osc.start(now);

        osc.stop(
            now + duration
        );

    } catch (error) {
        // Audio unavailable.
    }
}


/* ============================================================
   SOUND EFFECTS
============================================================ */

function playJumpSound() {

    playTone(
        420,
        0.07,
        "sine",
        0.035,
        520
    );
}


function playOrbSound() {

    playTone(
        680,
        0.06,
        "triangle",
        0.045,
        820
    );

    window.setTimeout(() => {

        playTone(
            950,
            0.08,
            "triangle",
            0.035,
            1100
        );

    }, 45);
}


function playPerfectSound() {

    playTone(
        600,
        0.06,
        "triangle",
        0.055,
        760
    );

    window.setTimeout(() => {

        playTone(
            850,
            0.08,
            "triangle",
            0.05,
            1100
        );

    }, 55);

    window.setTimeout(() => {

        playTone(
            1200,
            0.08,
            "sine",
            0.025,
            1350
        );

    }, 105);
}


function playWhooshSound() {

    playTone(
        230,
        0.13,
        "sine",
        0.025,
        90
    );
}


function playWorldChangeSound() {

    playTone(
        280,
        0.16,
        "sine",
        0.035,
        480
    );

    window.setTimeout(() => {

        playTone(
            520,
            0.18,
            "triangle",
            0.04,
            760
        );

    }, 90);
}


function playGameOverSound() {

    playTone(
        260,
        0.12,
        "sawtooth",
        0.045,
        170
    );

    window.setTimeout(() => {

        playTone(
            170,
            0.24,
            "sawtooth",
            0.055,
            75
        );

    }, 100);
}


/* ============================================================
   PLAYER
============================================================ */

const player = {

    x: W * 0.25,

    y: H / 2,

    radius: 15,

    velocity: 0,

    trail: []
};


const physics = {

    gravity: 0.32,

    riseForce: -0.75,

    maxFall: 7,

    maxRise: -6
};


/* ============================================================
   WORLDS
============================================================ */

const worlds = {

    grass: {

        name: "GRASSLAND",

        backgroundTop: "#18291d",

        backgroundBottom: "#07110b",

        obstacle: "#3b8f5c",

        obstacleEdge: "#6ee7a0",

        accent: "#8affc1"
    },

    night: {

        name: "NIGHT",

        backgroundTop: "#11182e",

        backgroundBottom: "#050711",

        obstacle: "#5367c7",

        obstacleEdge: "#94a3ff",

        accent: "#9eaaff"
    },

    storm: {

        name: "STORM",

        backgroundTop: "#1d2430",

        backgroundBottom: "#080b10",

        obstacle: "#64748b",

        obstacleEdge: "#cbd5e1",

        accent: "#facc15"
    },

    lava: {

        name: "LAVA",

        backgroundTop: "#30120d",

        backgroundBottom: "#090504",

        obstacle: "#a63d20",

        obstacleEdge: "#ff9f43",

        accent: "#ffb347"
    },

    space: {

        name: "SPACE",

        backgroundTop: "#120b2b",

        backgroundBottom: "#030207",

        obstacle: "#7347c8",

        obstacleEdge: "#c4a7ff",

        accent: "#d8b4fe"
    }
};


/* ============================================================
   OBSTACLES
============================================================ */

let obstacles = [];

const obstacleWidth = 54;

const baseGap = 180;

let spawnTimer = 0;

let spawnInterval = 120;

let scrollSpeed = 2.45;


/* ============================================================
   COLLECTIBLES
============================================================ */

let collectibles = [];


/* ============================================================
   PARTICLES
============================================================ */

let particles = [];


/* ============================================================
   RESET GAME
============================================================ */

function resetGame() {

    if (gameOverTimer !== null) {

        window.clearTimeout(
            gameOverTimer
        );

        gameOverTimer = null;
    }

    score = 0;

    worldDistance = 0;

    energy = 100;

    combo = 0;

    perfectTimer = 0;

    if (autoTheme) {

        world = "grass";
    }

    worldProgress = 0;

    player.y = H / 2;

    player.velocity = 0;

    player.trail = [];

    obstacles = [];

    collectibles = [];

    particles = [];

    spawnTimer = 0;

    scrollSpeed = 2.45;

    spawnInterval = 120;

    isHolding = false;

    resetScreenShake();

    if (tutorialOverlay) {

        tutorialOverlay.classList.add(
            "hidden"
        );
    }

    const pauseScreen =
        document.getElementById(
            "pauseScreen"
        );

    if (pauseScreen) {

        pauseScreen.classList.add(
            "hidden"
        );
    }

    updatePauseButton();

    updateScoreDisplay();
}


/* ============================================================
   THEME
============================================================ */

function changeWorldTheme(
    selectedWorld
) {

    if (selectedWorld === "auto") {

        autoTheme = true;

        world = "grass";

    } else {

        autoTheme = false;

        if (worlds[selectedWorld]) {

            world = selectedWorld;
        }
    }

    worldProgress = 0;
}


/* ============================================================
   WORLD TRANSITION
============================================================ */

function showWorldTransition(
    worldName
) {

    const transition =
        document.getElementById(
            "worldTransition"
        );

    const text =
        document.getElementById(
            "worldTransitionText"
        );

    if (!transition || !text) {
        return;
    }

    text.innerText = worldName;

    transition.classList.add(
        "active"
    );

    window.setTimeout(() => {

        transition.classList.remove(
            "active"
        );

    }, 700);
}


/* ============================================================
   START GAME
============================================================ */

function startGame() {

    if (
        gameState !== "ready"
    ) {
        return;
    }

    initAudio();

    resetScreenShake();

    gameState = "playing";

    lastTime =
        performance.now();

    const startScreen =
        document.getElementById(
            "startScreen"
        );

    if (startScreen) {

        startScreen.classList.add(
            "hidden"
        );
    }

    showTutorial();
}


/* ============================================================
   WORLD PROGRESSION
============================================================ */

function updateWorld() {

    if (!autoTheme) {
        return;
    }

    const newWorld =
        score < 25
            ? "grass"
            : score < 60
            ? "night"
            : score < 110
            ? "storm"
            : score < 180
            ? "lava"
            : "space";

    if (newWorld !== world) {

        world = newWorld;

        worldProgress = 1;

        createWorldParticles();

        playWorldChangeSound();

        showWorldTransition(
            worlds[newWorld].name
        );
    }

    if (worldProgress > 0) {

        worldProgress -= 0.01;
    }
}


/* ============================================================
   WORLD PARTICLES
============================================================ */

function createWorldParticles() {

    for (let i = 0; i < 30; i++) {

        particles.push({

            x:
                Math.random() * W,

            y:
                Math.random() * H,

            vx:
                (Math.random() - 0.5) * 2,

            vy:
                (Math.random() - 0.5) * 2,

            life: 1,

            size:
                2 +
                Math.random() * 3,

            type: "world"
        });
    }
}


/* ============================================================
   SPAWN OBSTACLE
============================================================ */

function spawnObstacle() {

    const difficulty =
        Math.min(
            1,
            score / 120
        );

    const gapHeight =
        Math.max(
            115,
            baseGap -
            difficulty * 55
        );

    const margin = 80;

    let gapCenter;

    if (obstacles.length > 0) {

        const previous =
            obstacles[
                obstacles.length - 1
            ];

        const movement =
            55 +
            difficulty * 95;

        gapCenter =
            previous.gapCenter +
            (
                Math.random() *
                movement *
                2 -
                movement
            );

        gapCenter =
            Math.max(
                margin,
                Math.min(
                    H - margin,
                    gapCenter
                )
            );

    } else {

        gapCenter = H / 2;
    }

    const obstacle = {

        x:
            W + obstacleWidth,

        gapCenter,

        gapHeight,

        passed: false,

        perfect: false,

        whooshPlayed: false,

        seed:
            Math.random()
    };

    obstacles.push(
        obstacle
    );


    if (
        Math.random() < 0.75
    ) {

        collectibles.push({

            x:
                obstacle.x - 35,

            y:
                gapCenter +
                (
                    Math.random() - 0.5
                ) *
                Math.max(
                    20,
                    gapHeight - 50
                ),

            radius: 7,

            collected: false,

            pulse:
                Math.random() *
                Math.PI *
                2
        });
    }
}


/* ============================================================
   INPUT STATE
============================================================ */

let activePointerId = null;


/* ============================================================
   START HOLD
============================================================ */

function startHold(
    pointerId = null
) {

    initAudio();

    if (
        activePointerId !== null &&
        pointerId !== null &&
        activePointerId !== pointerId
    ) {
        return;
    }

    if (
        gameState === "ready"
    ) {

        startGame();
    }

    if (
        gameState === "playing"
    ) {

        isHolding = true;

        if (pointerId !== null) {
            activePointerId = pointerId;
        }

        playJumpSound();

        if (tutorialTimer > 0) {

            tutorialTimer =
                Math.min(
                    tutorialTimer,
                    120
                );
        }
    }
}


/* ============================================================
   END HOLD
============================================================ */

function endHold(
    pointerId = null
) {

    if (
        pointerId !== null &&
        activePointerId !== null &&
        pointerId !== activePointerId
    ) {
        return;
    }

    isHolding = false;

    activePointerId = null;
}


/* ============================================================
   POINTER CONTROLS
============================================================ */

canvas.addEventListener(
    "pointerdown",
    event => {

        event.preventDefault();

        if (
            gameState !== "playing" &&
            gameState !== "ready"
        ) {
            return;
        }

        try {

            if (
                canvas.setPointerCapture
            ) {

                canvas.setPointerCapture(
                    event.pointerId
                );
            }

        } catch (error) {
            // Pointer capture unavailable.
        }

        startHold(
            event.pointerId
        );

    },
    {
        passive: false
    }
);


canvas.addEventListener(
    "pointerup",
    event => {

        event.preventDefault();

        endHold(
            event.pointerId
        );

    },
    {
        passive: false
    }
);


canvas.addEventListener(
    "pointercancel",
    event => {

        event.preventDefault();

        endHold(
            event.pointerId
        );

    },
    {
        passive: false
    }
);


/* ============================================================
   GLOBAL POINTER RELEASE
============================================================ */

window.addEventListener(
    "pointerup",
    event => {

        endHold(
            event.pointerId
        );

    },
    {
        passive: true
    }
);


window.addEventListener(
    "pointercancel",
    event => {

        endHold(
            event.pointerId
        );

    },
    {
        passive: true
    }
);


/* ============================================================
   KEYBOARD
============================================================ */

window.addEventListener(
    "keydown",
    event => {

        if (
            event.code === "Space"
        ) {

            event.preventDefault();

            if (!event.repeat) {

                startHold();
            }
        }
    }
);


window.addEventListener(
    "keyup",
    event => {

        if (
            event.code === "Space"
        ) {

            event.preventDefault();

            endHold();
        }
    }
);


/* ============================================================
   PAUSE SYSTEM
============================================================ */

const pauseBtn =
    document.getElementById(
        "pauseBtn"
    );

const resumeBtn =
    document.getElementById(
        "resumeBtn"
    );

const pauseRestartBtn =
    document.getElementById(
        "pauseRestartBtn"
    );

const pauseScreen =
    document.getElementById(
        "pauseScreen"
    );


function updatePauseButton() {

    if (!pauseBtn) {
        return;
    }

    if (
        gameState === "paused"
    ) {

        pauseBtn.innerText = "▶";

        pauseBtn.setAttribute(
            "aria-label",
            "Resume Game"
        );

    } else {

        pauseBtn.innerText = "Ⅱ";

        pauseBtn.setAttribute(
            "aria-label",
            "Pause Game"
        );
    }
}


function pauseGame() {

    if (
        gameState !== "playing"
    ) {
        return;
    }

    gameState = "paused";

    isHolding = false;

    activePointerId = null;

    lastTime =
        performance.now();

    if (pauseScreen) {

        pauseScreen.classList.remove(
            "hidden"
        );
    }

    suspendAudio();

    updatePauseButton();
}


function resumeGame() {

    if (
        gameState !== "paused"
    ) {
        return;
    }

    initAudio();

    lastTime =
        performance.now();

    gameState = "playing";

    isHolding = false;

    activePointerId = null;

    if (pauseScreen) {

        pauseScreen.classList.add(
            "hidden"
        );
    }

    updatePauseButton();
}


function restartFromPause() {

    if (
        gameState !== "paused"
    ) {
        return;
    }

    initAudio();

    resetScreenShake();

    isHolding = false;

    activePointerId = null;

    if (pauseScreen) {

        pauseScreen.classList.add(
            "hidden"
        );
    }

    resetGame();

    gameState = "playing";

    lastTime =
        performance.now();

    updatePauseButton();
}


/* ============================================================
   PAUSE BUTTON EVENTS
============================================================ */

if (pauseBtn) {

    pauseBtn.addEventListener(
        "click",
        event => {

            event.preventDefault();

            event.stopPropagation();

            if (
                gameState === "playing"
            ) {

                pauseGame();

            } else if (
                gameState === "paused"
            ) {

                resumeGame();
            }
        }
    );
}


if (resumeBtn) {

    resumeBtn.addEventListener(
        "click",
        event => {

            event.preventDefault();

            event.stopPropagation();

            resumeGame();
        }
    );
}


if (pauseRestartBtn) {

    pauseRestartBtn.addEventListener(
        "click",
        event => {

            event.preventDefault();

            event.stopPropagation();

            restartFromPause();
        }
    );
}


/* ============================================================
   START BUTTON
============================================================ */

const startBtn =
    document.getElementById(
        "startBtn"
    );


if (startBtn) {

    startBtn.addEventListener(
        "click",
        event => {

            event.preventDefault();

            event.stopPropagation();

            initAudio();

            startGame();
        }
    );
}


/* ============================================================
   THEME SELECTS
============================================================ */

const worldThemeSelect =
    document.getElementById(
        "worldThemeSelect"
    );

const gameOverThemeSelect =
    document.getElementById(
        "gameOverThemeSelect"
    );


if (worldThemeSelect) {

    worldThemeSelect.addEventListener(
        "change",
        event => {

            changeWorldTheme(
                event.target.value
            );
        }
    );
}


if (gameOverThemeSelect) {

    gameOverThemeSelect.addEventListener(
        "change",
        event => {

            changeWorldTheme(
                event.target.value
            );
        }
    );
}


/* ============================================================
   RETRY
============================================================ */

const retryBtn =
    document.getElementById(
        "retryBtn"
    );


if (retryBtn) {

    retryBtn.addEventListener(
        "click",
        event => {

            event.preventDefault();

            event.stopPropagation();

            initAudio();

            resetScreenShake();

            isHolding = false;

            activePointerId = null;

            const gameOverScreen =
                document.getElementById(
                    "gameOverScreen"
                );

            if (gameOverScreen) {

                gameOverScreen.classList.add(
                    "hidden"
                );
            }

            resetGame();

            gameState = "playing";

            lastTime =
                performance.now();

            updatePauseButton();
        }
    );
}


/* ============================================================
   iOS / MOBILE APP LIFECYCLE
============================================================ */

document.addEventListener(
    "visibilitychange",
    () => {

        if (
            document.hidden
        ) {

            if (
                gameState === "playing"
            ) {

                pauseGame();
            }

            isHolding = false;

            activePointerId = null;

            suspendAudio();

            lastTime =
                performance.now();

        } else {

            lastTime =
                performance.now();

            if (
                audioCtx &&
                gameState === "playing"
            ) {

                initAudio();
            }
        }
    }
);


/* ============================================================
   PAGE HIDE / SHOW
============================================================ */

window.addEventListener(
    "pagehide",
    () => {

        if (
            gameState === "playing"
        ) {

            pauseGame();
        }

        isHolding = false;

        activePointerId = null;

        suspendAudio();
    }
);


window.addEventListener(
    "pageshow",
    () => {

        lastTime =
            performance.now();
    }
);


/* ============================================================
   UPDATE
============================================================ */

function update(
    delta = 1
) {

    updateScreenShake(
        delta
    );

    updateTutorial(
        delta
    );

    if (
        gameState !== "playing"
    ) {
        return;
    }


    /* --------------------------------------------------------
       DIFFICULTY
    -------------------------------------------------------- */

    scrollSpeed =
        Math.min(
            6.2,
            2.45 +
            score * 0.023
        );


    /* --------------------------------------------------------
       WORLD
    -------------------------------------------------------- */

    worldDistance +=
        scrollSpeed *
        delta;

    updateWorld();


    /* --------------------------------------------------------
       PLAYER PHYSICS
    -------------------------------------------------------- */

    if (isHolding) {

        player.velocity +=
            physics.riseForce *
            delta;

        energy -=
            0.20 *
            delta;

        if (energy < 0) {
            energy = 0;
        }

    } else {

        player.velocity +=
            physics.gravity *
            delta;

        energy +=
            0.08 *
            delta;

        if (energy > 100) {
            energy = 100;
        }
    }


    player.velocity =
        Math.max(
            physics.maxRise,

            Math.min(
                physics.maxFall,
                player.velocity
            )
        );


    player.y +=
        player.velocity *
        delta;


    /* --------------------------------------------------------
       TRAIL
    -------------------------------------------------------- */

    player.trail.push({

        x: player.x,

        y: player.y,

        life: 1
    });


    if (
        player.trail.length > 12
    ) {

        player.trail.shift();
    }


    player.trail.forEach(
        trail => {

            trail.life -=
                0.08 *
                delta;
        }
    );


    /* --------------------------------------------------------
       BOUNDS
    -------------------------------------------------------- */

    if (
        player.y -
            player.radius <
            0 ||
        player.y +
            player.radius >
            H
    ) {

        triggerGameOver();

        return;
    }


    /* --------------------------------------------------------
       SPAWN
    -------------------------------------------------------- */

    spawnTimer += delta;

    if (
        spawnTimer >=
        spawnInterval
    ) {

        spawnTimer = 0;

        spawnObstacle();

        spawnInterval =
            Math.max(
                78,
                120 -
                score * 0.12
            );
    }


    /* --------------------------------------------------------
       OBSTACLES
    -------------------------------------------------------- */

    for (
        const obs of obstacles
    ) {

        obs.x -=
            scrollSpeed *
            delta;


        const topEdge =
            obs.gapCenter -
            obs.gapHeight / 2;

        const bottomEdge =
            obs.gapCenter +
            obs.gapHeight / 2;


        const withinX =
            player.x +
                player.radius >
                obs.x &&
            player.x -
                player.radius <
                obs.x +
                obstacleWidth;


        /* WHOOSH */

        if (
            !obs.whooshPlayed &&
            obs.x +
                obstacleWidth <
                player.x +
                10 &&
            obs.x +
                obstacleWidth >
                player.x -
                20
        ) {

            obs.whooshPlayed = true;

            playWhooshSound();
        }


        /* COLLISION */

        if (withinX) {

            const hitsTop =
                player.y -
                    player.radius <
                    topEdge;

            const hitsBottom =
                player.y +
                    player.radius >
                    bottomEdge;

            if (
                hitsTop ||
                hitsBottom
            ) {

                triggerGameOver();

                return;
            }


            /* PERFECT PASS */

            if (!obs.perfect) {

                const distanceToCenter =
                    Math.abs(
                        player.y -
                        obs.gapCenter
                    );

                if (
                    distanceToCenter <
                    obs.gapHeight *
                    0.20
                ) {

                    obs.perfect = true;

                    combo++;

                    score += 2;

                    perfectTimer = 40;

                    playPerfectSound();

                    createPerfectParticles(
                        player.x,
                        player.y
                    );

                    updateScoreDisplay();
                }
            }
        }


        /* NORMAL PASS */

        if (
            !obs.passed &&
            obs.x +
                obstacleWidth <
                player.x
        ) {

            obs.passed = true;

            score++;

            playOrbSound();

            updateScoreDisplay();
        }
    }


    obstacles =
        obstacles.filter(
            obstacle =>
                obstacle.x +
                    obstacleWidth >
                -20
        );


    /* --------------------------------------------------------
       COLLECTIBLES
    -------------------------------------------------------- */

    for (
        const item of collectibles
    ) {

        item.x -=
            scrollSpeed *
            delta;

        item.pulse +=
            0.08 *
            delta;


        const dx =
            player.x -
            item.x;

        const dy =
            player.y -
            item.y;

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );


        if (
            !item.collected &&
            distance <
            player.radius +
            item.radius
        ) {

            item.collected = true;

            energy += 25;

            if (energy > 100) {
                energy = 100;
            }

            createCollectParticles(
                item.x,
                item.y
            );

            playOrbSound();
        }
    }


    collectibles =
        collectibles.filter(
            collectible =>
                !collectible.collected &&
                collectible.x > -30
        );


    /* --------------------------------------------------------
       PERFECT TIMER
    -------------------------------------------------------- */

    if (
        perfectTimer > 0
    ) {

        perfectTimer -=
            delta;
    }


    /* --------------------------------------------------------
       PARTICLES
    -------------------------------------------------------- */

    updateParticles(
        delta
    );
}


/* ============================================================
   COLLECT PARTICLES
============================================================ */

function createCollectParticles(
    x,
    y
) {

    for (let i = 0; i < 10; i++) {

        const angle =
            Math.random() *
            Math.PI *
            2;

        const speed =
            1.5 +
            Math.random() *
            3;

        particles.push({

            x,
            y,

            vx:
                Math.cos(angle) *
                speed,

            vy:
                Math.sin(angle) *
                speed,

            life: 1,

            size:
                2 +
                Math.random() *
                3,

            type: "collect"
        });
    }
}


/* ============================================================
   PERFECT PARTICLES
============================================================ */

function createPerfectParticles(
    x,
    y
) {

    for (let i = 0; i < 18; i++) {

        const angle =
            Math.random() *
            Math.PI *
            2;

        const speed =
            2 +
            Math.random() *
            4;

        particles.push({

            x,
            y,

            vx:
                Math.cos(angle) *
                speed,

            vy:
                Math.sin(angle) *
                speed,

            life: 1,

            size:
                2 +
                Math.random() *
                4,

            type: "perfect"
        });
    }
}


/* ============================================================
   UPDATE PARTICLES
============================================================ */

function updateParticles(
    delta
) {

    particles.forEach(
        particle => {

            particle.x +=
                particle.vx *
                delta;

            particle.y +=
                particle.vy *
                delta;

            if (
                particle.type !==
                "world"
            ) {

                particle.vy +=
                    0.08 *
                    delta;
            }

            particle.life -=
                0.025 *
                delta;
        }
    );


    particles =
        particles.filter(
            particle =>
                particle.life > 0
        );
}


/* ============================================================
   GAME OVER
============================================================ */

function triggerGameOver() {

    if (
        gameState !== "playing"
    ) {
        return;
    }

    gameState = "gameover";

    isHolding = false;

    activePointerId = null;

    playGameOverSound();

    startScreenShake(
        8,
        16
    );

    createPerfectParticles(
        player.x,
        player.y
    );


    /* SAVE BEST SCORE */

    if (
        score > best
    ) {

        best = score;

        try {

            localStorage.setItem(
                "riseFallBest",
                String(best)
            );

        } catch (error) {
            // Storage unavailable.
        }
    }


    /* DELAY GAME OVER SCREEN */

    if (
        gameOverTimer !== null
    ) {

        window.clearTimeout(
            gameOverTimer
        );
    }


    gameOverTimer =
        window.setTimeout(
            () => {

                gameOverTimer = null;

                resetScreenShake();

                const finalScoreText =
                    document.getElementById(
                        "finalScoreText"
                    );

                const gameOverScreen =
                    document.getElementById(
                        "gameOverScreen"
                    );


                if (
                    finalScoreText
                ) {

                    finalScoreText.innerText =
                        `Score: ${score}`;
                }


                if (
                    gameOverScreen
                ) {

                    gameOverScreen.classList.remove(
                        "hidden"
                    );
                }


                updateScoreDisplay();

            },
            400
        );
}


/* ============================================================
   SCORE UI
============================================================ */

function updateScoreDisplay() {

    const scoreDisplay =
        document.getElementById(
            "scoreDisplay"
        );

    const bestDisplay =
        document.getElementById(
            "bestDisplay"
        );


    if (
        scoreDisplay
    ) {

        scoreDisplay.innerText =
            score;
    }


    if (
        bestDisplay
    ) {

        bestDisplay.innerText =
            `BEST: ${best}`;
    }
}


/* ============================================================
   BACKGROUND
============================================================ */

function drawBackground() {

    const currentWorld =
        worlds[world];


    const gradient =
        ctx.createLinearGradient(
            0,
            0,
            0,
            H
        );


    gradient.addColorStop(
        0,
        currentWorld.backgroundTop
    );


    gradient.addColorStop(
        1,
        currentWorld.backgroundBottom
    );


    ctx.fillStyle =
        gradient;


    ctx.fillRect(
        0,
        0,
        W,
        H
    );


    drawWorldDecor();
}


/* ============================================================
   WORLD DECORATION
============================================================ */

function drawWorldDecor() {

    const currentWorld =
        worlds[world];

    ctx.save();

    ctx.globalAlpha = 0.35;

    for (
        let i = 0;
        i < 35;
        i++
    ) {

        const x =
            (
                i * 97 -
                worldDistance *
                0.25
            ) % W;

        const normalizedX =
            x < 0
                ? x + W
                : x;

        const y =
            (i * 53) % H;

        const size =
            i % 4 === 0
                ? 2
                : 1;

        ctx.fillStyle =
            currentWorld.accent;

        ctx.fillRect(
            normalizedX,
            y,
            size,
            size
        );
    }


    ctx.globalAlpha = 0.15;

    ctx.strokeStyle =
        currentWorld.accent;

    ctx.lineWidth = 1;

    ctx.beginPath();


    const offset =
        -(
            worldDistance *
            0.4
        ) % 60;


    for (
        let x = offset;
        x < W;
        x += 60
    ) {

        ctx.moveTo(
            x,
            H - 35
        );

        ctx.lineTo(
            x + 30,
            H - 45
        );

        ctx.lineTo(
            x + 60,
            H - 35
        );
    }


    ctx.stroke();

    ctx.restore();
}


/* ============================================================
   DRAW OBSTACLE
============================================================ */

function drawObstacle(
    obs
) {

    const currentWorld =
        worlds[world];


    const topEdge =
        obs.gapCenter -
        obs.gapHeight / 2;

    const bottomEdge =
        obs.gapCenter +
        obs.gapHeight / 2;


    ctx.save();


    ctx.fillStyle =
        currentWorld.obstacle;

    ctx.strokeStyle =
        currentWorld.obstacleEdge;

    ctx.lineWidth = 2;


    ctx.fillRect(
        obs.x,
        0,
        obstacleWidth,
        topEdge
    );

    ctx.strokeRect(
        obs.x,
        0,
        obstacleWidth,
        topEdge
    );


    ctx.fillRect(
        obs.x,
        bottomEdge,
        obstacleWidth,
        H -
            bottomEdge
    );

    ctx.strokeRect(
        obs.x,
        bottomEdge,
        obstacleWidth,
        H -
            bottomEdge
    );


    ctx.globalAlpha = 0.25;

    ctx.fillStyle =
        currentWorld.accent;


    ctx.fillRect(
        obs.x + 7,
        0,
        2,
        topEdge
    );


    ctx.fillRect(
        obs.x + 7,
        bottomEdge,
        2,
        H -
            bottomEdge
    );


    ctx.restore();
}


/* ============================================================
   DRAW COLLECTIBLES
============================================================ */

function drawCollectibles() {

    const currentWorld =
        worlds[world];


    collectibles.forEach(
        item => {

            const pulse =
                Math.sin(
                    item.pulse
                ) * 2;


            ctx.save();


            ctx.shadowColor =
                currentWorld.accent;

            ctx.shadowBlur = 12;

            ctx.fillStyle =
                currentWorld.accent;


            ctx.beginPath();


            ctx.arc(
                item.x,
                item.y,
                item.radius +
                    pulse * 0.2,
                0,
                Math.PI * 2
            );


            ctx.fill();

            ctx.restore();
        }
    );
}


/* ============================================================
   DRAW PLAYER
============================================================ */

function drawPlayer() {

    const currentWorld =
        worlds[world];


    player.trail.forEach(
        (
            trail,
            index
        ) => {

            if (
                trail.life <= 0
            ) {
                return;
            }


            ctx.save();

            ctx.globalAlpha =
                trail.life * 0.35;

            ctx.fillStyle =
                currentWorld.accent;


            const size =
                4 +
                index * 0.3;


            ctx.beginPath();


            ctx.arc(
                trail.x -
                    index * 2,
                trail.y,
                size,
                0,
                Math.PI * 2
            );


            ctx.fill();

            ctx.restore();
        }
    );


    ctx.save();


    ctx.shadowColor =
        currentWorld.accent;

    ctx.shadowBlur =
        isHolding
            ? 25
            : 15;

    ctx.fillStyle =
        currentWorld.accent;


    ctx.beginPath();


    ctx.arc(
        player.x,
        player.y,
        player.radius,
        0,
        Math.PI * 2
    );


    ctx.fill();


    ctx.shadowBlur = 0;

    ctx.fillStyle = "#ffffff";

    ctx.globalAlpha = 0.75;


    ctx.beginPath();


    ctx.arc(
        player.x - 4,
        player.y - 4,
        4,
        0,
        Math.PI * 2
    );


    ctx.fill();

    ctx.restore();
}


/* ============================================================
   DRAW PARTICLES
============================================================ */

function drawParticles() {

    particles.forEach(
        particle => {

            ctx.save();

            ctx.globalAlpha =
                particle.life;

            ctx.fillStyle =
                worlds[world].accent;


            ctx.beginPath();


            ctx.arc(
                particle.x,
                particle.y,
                particle.size || 2,
                0,
                Math.PI * 2
            );


            ctx.fill();

            ctx.restore();
        }
    );
}


/* ============================================================
   HUD
============================================================ */

function drawHUD() {

    ctx.save();


    const barWidth = 120;
    const barHeight = 7;

    const x = 20;
    const y = H - 25;


    /* ENERGY BACKGROUND */

    ctx.fillStyle =
        "rgba(255,255,255,0.12)";


    ctx.fillRect(
        x,
        y,
        barWidth,
        barHeight
    );


    /* ENERGY */

    ctx.fillStyle =
        worlds[world].accent;


    ctx.fillRect(
        x,
        y,
        barWidth *
            (energy / 100),
        barHeight
    );


    /* ENERGY TEXT */

    ctx.font =
        "bold 10px Arial";

    ctx.fillStyle =
        "rgba(255,255,255,0.65)";


    ctx.fillText(
        "ENERGY",
        x,
        y - 6
    );


    /* WORLD */

    ctx.textAlign =
        "right";

    ctx.font =
        "bold 11px Arial";

    ctx.fillStyle =
        "rgba(255,255,255,0.5)";


    ctx.fillText(
        worlds[world].name,
        W - 20,
        H - 20
    );


    /* PERFECT */

    if (
        perfectTimer > 0
    ) {

        ctx.textAlign =
            "center";

        ctx.font =
            "bold 20px Arial";

        ctx.fillStyle =
            worlds[world].accent;

        ctx.globalAlpha =
            Math.min(
                1,
                perfectTimer / 15
            );


        ctx.fillText(
            "PERFECT!",
            W / 2,
            55
        );


        ctx.font =
            "bold 12px Arial";


        ctx.fillText(
            `COMBO x${combo}`,
            W / 2,
            75
        );
    }


    ctx.restore();
}


/* ============================================================
   DRAW
============================================================ */

function draw() {

    ctx.setTransform(
        1,
        0,
        0,
        1,
        0,
        0
    );


    /* SCREEN SHAKE */

    if (
        shakeTime > 0
    ) {

        const intensity =
            shakeStrength *
            (
                shakeTime /
                16
            );


        const shakeX =
            (
                Math.random() -
                0.5
            ) *
            intensity;


        const shakeY =
            (
                Math.random() -
                0.5
            ) *
            intensity;


        ctx.translate(
            shakeX,
            shakeY
        );
    }


    drawBackground();


    obstacles.forEach(
        drawObstacle
    );


    drawCollectibles();

    drawPlayer();

    drawParticles();

    drawHUD();


    ctx.setTransform(
        1,
        0,
        0,
        1,
        0,
        0
    );
}


/* ============================================================
   GAME LOOP
============================================================ */

function gameLoop(
    timestamp
) {

    if (!lastTime) {

        lastTime =
            timestamp;
    }


    let delta =
        (
            timestamp -
            lastTime
        ) / 16.67;


    /*
       Prevent huge physics jumps when
       iOS wakes the WebView.
    */

    delta =
        Math.min(
            2,
            Math.max(
                0,
                delta
            )
        );


    lastTime =
        timestamp;


    update(
        delta
    );

    draw();


    requestAnimationFrame(
        gameLoop
    );
}


/* ============================================================
   CONTEXT MENU
============================================================ */

canvas.addEventListener(
    "contextmenu",
    event => {

        event.preventDefault();
    }
);


/* ============================================================
   INIT
============================================================ */

resetGame();

updatePauseButton();

updateScoreDisplay();

requestAnimationFrame(
    gameLoop
);