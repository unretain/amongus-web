// Main entry point

import { Game } from './Game.js';

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game');

    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }

    // Create and start game
    const game = new Game(canvas);

    // Start game (shows menu first)
    game.start();

    // Expose game to console for debugging
    window.game = game;
    window.DEBUG_COLLIDERS = false;
    window.DEBUG_TASKS = false;

    console.log('Among Us Web Clone initialized');
    console.log('Press F12 to open console for debug options:');
    console.log('  window.DEBUG_COLLIDERS = true  -> show collision boxes');
    console.log('  window.DEBUG_TASKS = true      -> show yellow task outlines');
});
