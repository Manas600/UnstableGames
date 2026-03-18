import { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

function LetterRace() {
    const [playerName, setPlayerName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [currentScreen, setCurrentScreen] = useState('home');
    const [userId, setUserId] = useState('');
    const [gameData, setGameData] = useState(null);

    // Helper: Generate random letters (excluding some notoriously difficult letters like Q and X)
    const generateRandomLetters = () => {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const start = alphabet[Math.floor(Math.random() * alphabet.length)];
        const end = alphabet[Math.floor(Math.random() * alphabet.length)];
        return { start, end };
    };

    const generateCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    };

    useEffect(() => {
        if (roomCode && currentScreen !== 'home') {
            const gameRef = doc(db, 'games', roomCode);
            const unsubscribe = onSnapshot(gameRef, (docSnap) => {
                if (docSnap.exists()) setGameData(docSnap.data());
            });
            return () => unsubscribe();
        }
    }, [roomCode, currentScreen]);

    const createGame = async () => {
        if (!playerName) return alert("Please enter your name!");
        const newCode = generateCode();
        const newUserId = Math.random().toString(36).substring(2, 9);
        const gameRef = doc(db, 'games', newCode);

        await setDoc(gameRef, {
            type: 'letter_race',
            status: 'lobby',
            adminUid: newUserId,
            letters: { start: '?', end: '?' },
            players: {
                [newUserId]: { name: playerName, score: 0 }
            }
        });

        setUserId(newUserId);
        setRoomCode(newCode);
        setCurrentScreen('lobby');
    };

    const joinGame = async () => {
        if (!playerName || !roomCode) return alert("Enter name and room code!");
        const codeUpper = roomCode.toUpperCase();
        const gameRef = doc(db, 'games', codeUpper);
        const gameSnap = await getDoc(gameRef);

        if (gameSnap.exists() && gameSnap.data().type === 'letter_race') {
            const newUserId = Math.random().toString(36).substring(2, 9);
            await updateDoc(gameRef, {
                [`players.${newUserId}`]: { name: playerName, score: 0 }
            });
            setUserId(newUserId);
            setRoomCode(codeUpper);
            setCurrentScreen('lobby');
        } else {
            alert("Letter Race Room not found!");
        }
    };

    const startGame = async () => {
        const gameRef = doc(db, 'games', roomCode);
        await updateDoc(gameRef, {
            status: 'playing',
            letters: generateRandomLetters()
        });
    };

    // --- GAME CONTROLS ---
    const nextLetters = async () => {
        const gameRef = doc(db, 'games', roomCode);
        await updateDoc(gameRef, {
            letters: generateRandomLetters()
        });
    };

    const adjustScore = async (targetUserId, amount) => {
        const gameRef = doc(db, 'games', roomCode);
        const currentScore = gameData.players[targetUserId].score;
        await updateDoc(gameRef, {
            [`players.${targetUserId}.score`]: currentScore + amount
        });
    };

    const endGame = async () => {
        const gameRef = doc(db, 'games', roomCode);
        await updateDoc(gameRef, { status: 'results' });
    };

    const resetGame = async () => {
        const gameRef = doc(db, 'games', roomCode);
        let resetPlayers = { ...gameData.players };
        for (let id in resetPlayers) {
            resetPlayers[id].score = 0; // Reset scores
        }
        await updateDoc(gameRef, {
            status: 'lobby',
            letters: { start: '?', end: '?' },
            players: resetPlayers
        });
    };

    // --- UI COMPONENTS ---

    // 1. HOME SCREEN
    if (currentScreen === 'home') {
        return (
            <div className="batman-container App">
                <h1>LETTER RACE</h1>
                <p>Think fast. Speak faster.</p>
                <div className="glass-panel">
                    <input type="text" placeholder="Enter your name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
                    <hr />
                    <button className="btn-danger" onClick={createGame}>Create Game</button>
                    <hr />
                    <input type="text" placeholder="Room Code" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} maxLength={4} />
                    <button className="btn-success" onClick={joinGame}>Join Race</button>
                </div>
                <Link to="/" style={{ color: '#00f2fe', textDecoration: 'none' }}>⬅ Back to Hub</Link>
            </div>
        );
    }

    // 2. LOBBY SCREEN
    if (currentScreen === 'lobby' && gameData && gameData.status === 'lobby') {
        const isAdmin = gameData.adminUid === userId;
        const playersList = Object.entries(gameData.players).map(([id, data]) => ({ id, ...data }));

        return (
            <div className="batman-container App">
                <h1>Room: {roomCode}</h1>
                <div className="glass-panel">
                    <h2>Racers ({playersList.length})</h2>
                    <ul>
                        {playersList.map((player) => (
                            <li key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>🟢 {player.name} {gameData.adminUid === player.id ? "(Admin)" : ""}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {isAdmin ? (
                    <div className="glass-panel">
                        <button className="btn-success" onClick={startGame}>Start Race</button>
                    </div>
                ) : (
                    <p>Waiting for Admin to start the race...</p>
                )}
            </div>
        );
    }

    // 3. ACTIVE GAME SCREEN
    if (gameData && gameData.status === 'playing') {
        const isAdmin = gameData.adminUid === userId;
        const playersList = Object.entries(gameData.players)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.score - a.score); // Sort by highest score

        return (
            <div className="batman-container App" style={{ maxWidth: '600px' }}>
                <h2 style={{ margin: '0', color: '#aaa' }}>ROOM: {roomCode}</h2>

                {/* THE LETTERS DISPLAY */}
                <div className="glass-panel" style={{ margin: '20px 0', padding: '40px 20px' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: '#00f2fe' }}>Starts With ... Ends With</p>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px' }}>
                        <div style={{ fontSize: '5rem', fontWeight: 'bold', color: '#ffeb3b', textShadow: '0 0 20px rgba(255, 235, 59, 0.4)' }}>
                            {gameData.letters.start}
                        </div>
                        <div style={{ fontSize: '3rem', color: '#aaa' }}>...</div>
                        <div style={{ fontSize: '5rem', fontWeight: 'bold', color: '#ff4b2b', textShadow: '0 0 20px rgba(255, 75, 43, 0.4)' }}>
                            {gameData.letters.end}
                        </div>
                    </div>

                    <button className="btn-success" onClick={nextLetters} style={{ marginTop: '30px', padding: '20px', fontSize: '1.5rem' }}>
                        ⚡ Generate Next Letters ⚡
                    </button>
                </div>

                {/* THE MANUAL SCOREBOARD */}
                <div className="glass-panel">
                    <h3 style={{ marginBottom: '15px' }}>Live Scoreboard</h3>
                    <ul style={{ padding: 0 }}>
                        {playersList.map(player => (
                            <li key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px' }}>
                                <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{player.name}</span>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <button
                                        onClick={() => adjustScore(player.id, -1)}
                                        style={{ width: '40px', padding: '5px', margin: 0, backgroundColor: '#333', color: '#ff4b2b' }}
                                    >
                                        -1
                                    </button>

                                    <span style={{ fontSize: '1.5rem', width: '30px', textAlign: 'center' }}>{player.score}</span>

                                    <button
                                        onClick={() => adjustScore(player.id, 1)}
                                        style={{ width: '40px', padding: '5px', margin: 0, backgroundColor: '#333', color: '#4CAF50' }}
                                    >
                                        +1
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                {isAdmin && <button className="btn-danger" onClick={endGame} style={{ marginTop: '20px' }}>End Game</button>}
            </div>
        );
    }

    // 4. RESULTS SCREEN
    if (gameData && gameData.status === 'results') {
        const isAdmin = gameData.adminUid === userId;
        const playersList = Object.entries(gameData.players)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.score - a.score);

        const winner = playersList[0];

        return (
            <div className="batman-container App">
                <h1>RACE OVER</h1>
                <div className="glass-panel">
                    <h2 style={{ color: '#4CAF50', fontSize: '2.5rem' }}>🏆 {winner.name} WINS! 🏆</h2>
                    <h3 style={{ color: '#ffeb3b' }}>Total Score: {winner.score}</h3>

                    <hr />
                    <h3>Final Standings:</h3>
                    <ul style={{ textAlign: 'left' }}>
                        {playersList.map((player, index) => (
                            <li key={player.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{index + 1}. {player.name}</span>
                                <strong>{player.score} pts</strong>
                            </li>
                        ))}
                    </ul>
                </div>
                {isAdmin && <button className="btn-success" onClick={resetGame}>Play Again</button>}
            </div>
        );
    }

    return null;
}

export default LetterRace;