import chalk from "chalk";

import { playMatch } from "./chess-ai-match";

async function runTournament(numberOfGames: number = 5) {
    const results = {
        fischer: 0,
        kasparov: 0,
        draws: 0
    };

    console.log(chalk.blue("\n=== Chess AI Tournament ==="));
    console.log(chalk.yellow(`Running ${numberOfGames} games between Fischer and Kasparov\n`));

    for (let i = 0; i < numberOfGames; i++) {
        console.log(chalk.cyan(`\n=== Game ${i + 1} ===`));
        const result = await playMatch(`tournament_${i}`);
        
        if (result.winner === 'Fischer') results.fischer++;
        else if (result.winner === 'Kasparov') results.kasparov++;
        else results.draws++;

        // Print current standings
        console.log(chalk.green("\nTournament Standings:"));
        console.log(`Fischer: ${results.fischer}`);
        console.log(`Kasparov: ${results.kasparov}`);
        console.log(`Draws: ${results.draws}\n`);
        
        // Add delay between games
        if (i < numberOfGames - 1) {
            console.log("Starting next game in 5 seconds...");
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    // Print final results
    console.log(chalk.blue("\n=== Tournament Results ==="));
    console.log(`Total Games: ${numberOfGames}`);
    console.log(`Fischer Wins: ${results.fischer}`);
    console.log(`Kasparov Wins: ${results.kasparov}`);
    console.log(`Draws: ${results.draws}`);
}

runTournament().catch(console.error);