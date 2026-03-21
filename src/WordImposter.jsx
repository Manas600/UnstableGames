import { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

function WordImposter() {
    const [playerName, setPlayerName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [currentScreen, setCurrentScreen] = useState('home');
    const [userId, setUserId] = useState('');
    const [gameData, setGameData] = useState(null);

    // Setup States
    const [imposterCount, setImposterCount] = useState(1);
    const [secretWord, setSecretWord] = useState('');
    const [theme, setTheme] = useState(''); // NEW: Theme State
    const [showRules, setShowRules] = useState(false);
    const [lobbyError, setLobbyError] = useState('');

    // Gameplay States
    const [imposterGuess, setImposterGuess] = useState('');

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
            type: 'word_imposter',
            status: 'lobby',
            adminUid: newUserId,
            settings: { imposterCount: 1, secretWord: '', theme: '' },
            caughtImposterId: null,
            players: {
                [newUserId]: { name: playerName, role: 'admin', votedFor: null }
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

        if (gameSnap.exists() && gameSnap.data().type === 'word_imposter') {
            const newUserId = Math.random().toString(36).substring(2, 9);
            await updateDoc(gameRef, {
                [`players.${newUserId}`]: { name: playerName, role: 'player', votedFor: null }
            });
            setUserId(newUserId);
            setRoomCode(codeUpper);
            setCurrentScreen('lobby');
        } else {
            alert("Room not found!");
        }
    };

    const transferAdmin = async (newAdminId) => {
        if (gameData.status !== 'lobby') return alert("You can only change admins in the lobby!");
        const gameRef = doc(db, 'games', roomCode);
        await updateDoc(gameRef, {
            adminUid: newAdminId,
            [`players.${userId}.role`]: 'player',
            [`players.${newAdminId}.role`]: 'admin'
        });
    };

    const startGame = async () => {
        // Ensure both fields are filled out!
        if (!secretWord.trim() || !theme.trim()) {
            setLobbyError("You must enter both a Secret Word and a Theme!");
            return;
        }

        const allIds = Object.keys(gameData.players);
        const playerIds = allIds.filter(id => id !== gameData.adminUid);
        const requiredPlayers = imposterCount + 2;

        if (playerIds.length < requiredPlayers) {
            setLobbyError(`Not enough players! You need at least ${requiredPlayers} players (excluding the Admin) for ${imposterCount} Imposter(s).`);
            return;
        }

        setLobbyError('');
        let shuffledIds = [...playerIds].sort(() => 0.5 - Math.random());
        const newPlayers = JSON.parse(JSON.stringify(gameData.players));

        for (let i = 0; i < imposterCount; i++) {
            newPlayers[shuffledIds[i]].role = 'imposter';
        }
        for (let i = imposterCount; i < shuffledIds.length; i++) {
            newPlayers[shuffledIds[i]].role = 'player';
        }

        const gameRef = doc(db, 'games', roomCode);
        await updateDoc(gameRef, {
            status: 'playing',
            'settings.secretWord': secretWord.trim().toUpperCase(),
            'settings.theme': theme.trim().toUpperCase(),
            'settings.imposterCount': imposterCount,
            players: newPlayers
        });
    };

    const startVoting = async () => {
        const gameRef = doc(db, 'games', roomCode);
        await updateDoc(gameRef, { status: 'voting' });
    };

    const submitVote = async (targetId) => {
        const gameRef = doc(db, 'games', roomCode);
        await updateDoc(gameRef, { [`players.${userId}.votedFor`]: targetId });
    };

    const processVotes = async () => {
        const voteCounts = {};
        Object.values(gameData.players).filter(p => p.role !== 'admin').forEach(p => {
            if (p.votedFor) voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
        });

        let maxVotes = 0;
        let mostVotedIds = [];
        for (const [id, count] of Object.entries(voteCounts)) {
            if (count > maxVotes) {
                maxVotes = count;
                mostVotedIds = [id];
            } else if (count === maxVotes) {
                mostVotedIds.push(id);
            }
        }

        const gameRef = doc(db, 'games', roomCode);

        if (mostVotedIds.length !== 1) {
            await updateDoc(gameRef, { status: 'results', winner: 'Imposter', method: 'The village tied on the vote!' });
            return;
        }

        const eliminatedId = mostVotedIds[0];
        const eliminatedRole = gameData.players[eliminatedId].role;

        if (eliminatedRole === 'imposter') {
            await updateDoc(gameRef, { status: 'imposter_guessing', caughtImposterId: eliminatedId });
        } else {
            await updateDoc(gameRef, { status: 'results', winner: 'Imposter', method: 'The village voted out an innocent player!' });
        }
    };

    const submitImposterGuess = async () => {
        if (!imposterGuess.trim()) return;
        const gameRef = doc(db, 'games', roomCode);
        const actualWord = gameData.settings.secretWord.toUpperCase();
        const guessedWord = imposterGuess.trim().toUpperCase();

        if (guessedWord === actualWord) {
            await updateDoc(gameRef, {
                status: 'results',
                winner: 'Imposter',
                method: `The Imposter guessed the secret word: ${actualWord}!`,
                finalGuess: guessedWord
            });
        } else {
            await updateDoc(gameRef, {
                status: 'results',
                winner: 'Players',
                method: `The Imposter guessed "${guessedWord}" and was WRONG!`,
                finalGuess: guessedWord
            });
        }
    };

    const resetGame = async () => {
        const gameRef = doc(db, 'games', roomCode);
        let resetPlayers = { ...gameData.players };
        for (let id in resetPlayers) {
            resetPlayers[id].role = id === gameData.adminUid ? 'admin' : 'player';
            resetPlayers[id].votedFor = null;
        }
        await updateDoc(gameRef, {
            status: 'lobby',
            caughtImposterId: null,
            'settings.secretWord': '',
            'settings.theme': '',
            players: resetPlayers
        });
        setSecretWord('');
        setTheme('');
        setImposterGuess('');
    };

    // --- UI COMPONENTS ---

    if (showRules) {
        return (
            <div className="batman-container App">
                <h1 style={{ textAlign: 'center' }}>Protocol: WORD IMPOSTER</h1>
                <div className="glass-panel" style={{ textAlign: 'left' }}>
                    <h3>How to Play:</h3>
                    <ul>
                        <li>👁️ <strong>The Admin:</strong> Chooses the secret word and theme. They do not play!</li>
                        <li>🟢 <strong>Normal Players:</strong> Receive the Secret Word on their screen.</li>
                        <li>🔴 <strong>The Imposter:</strong> Receives ONLY the Theme (e.g., "Person"). They must blend in!</li>
                        <li>🗣️ <strong>The Debate:</strong> Go around the room. Each person says exactly ONE WORD to describe the secret word.</li>
                        <li>🗳️ <strong>The Vote:</strong> Vote out the most suspicious person.</li>
                        <li>🚨 <strong>The Twist:</strong> If the Imposter is voted out, they get ONE chance to type the secret word. If they guess it, they steal the win!</li>
                    </ul>
                    <button className="btn-warning" onClick={() => setShowRules(false)}>Back to Game</button>
                </div>
            </div>
        );
    }

    if (currentScreen === 'home') {
        return (
            <div className="batman-container App">
                <h1>WORD IMPOSTER</h1>
                <p>Blend in. Don't be suspicious.</p>
                <div className="glass-panel">
                    <input type="text" placeholder="Enter your name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
                    <hr />
                    <button className="btn-danger" onClick={createGame}>Create Game</button>
                    <hr />
                    <input type="text" placeholder="Room Code" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} maxLength={4} />
                    <button className="btn-success" onClick={joinGame}>Join Game</button>
                </div>
                <Link to="/" style={{ color: '#00f2fe', textDecoration: 'none' }}>⬅ Back to Hub</Link>
            </div>
        );
    }

    if (currentScreen === 'lobby' && gameData && gameData.status === 'lobby') {
        const isAdmin = gameData.adminUid === userId;
        const playersList = Object.entries(gameData.players).map(([id, data]) => ({ id, ...data }));

        return (
            <div className="batman-container App">
                <h1>Room: {roomCode}</h1>
                <button className="btn-warning btn-small" onClick={() => setShowRules(true)} style={{ marginBottom: '20px' }}>View Rules</button>

                <div className="glass-panel">
                    <h2>Players ({playersList.length - 1})</h2>
                    <ul>
                        {playersList.map((player) => (
                            <li key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>
                                    {gameData.adminUid === player.id ? "👁️ " : "👤 "}
                                    {player.name} {gameData.adminUid === player.id ? "(Admin)" : ""}
                                </span>
                                {isAdmin && player.id !== userId && (
                                    <button className="btn-warning" style={{ padding: '5px 15px', fontSize: '0.9rem', width: 'auto', margin: 0 }} onClick={() => transferAdmin(player.id)}>
                                        Make Admin
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                {isAdmin ? (
                    <div className="glass-panel">
                        <h3>Admin Setup</h3>
                        <label>Number of Imposters:</label>
                        <input type="number" min="1" value={imposterCount} onChange={(e) => setImposterCount(Number(e.target.value))} />

                        <label>The Theme (For the Imposter):</label>
                        <input type="text" placeholder="e.g., Person, Movie, Animal..." value={theme} onChange={(e) => setTheme(e.target.value)} />

                        <label>The Secret Word (For the Players):</label>
                        <input type="text" placeholder="e.g., Elon Musk, Inception, Dog..." value={secretWord} onChange={(e) => setSecretWord(e.target.value)} />

                        {lobbyError && <p style={{ color: '#ff4b2b', fontWeight: 'bold' }}>⚠️ {lobbyError}</p>}
                        <button className="btn-success" onClick={startGame} style={{ marginTop: '15px' }}>Start Game</button>
                    </div>
                ) : (
                    <p>Waiting for Admin to set the secret word...</p>
                )}
            </div>
        );
    }

    if (gameData && gameData.status === 'playing') {
        const isAdmin = gameData.adminUid === userId;
        const myRole = gameData.players[userId].role;

        return (
            <div className="batman-container App">
                {isAdmin ? <h1>ADMIN DASHBOARD</h1> : <h1>YOUR SCREEN</h1>}
                <div className="glass-panel" style={{ padding: '50px 20px' }}>
                    {isAdmin ? (
                        <>
                            <h3 style={{ color: '#aaa' }}>You are the Game Master!</h3>
                            <p>Secret Word:</p>
                            <h1 className="massive-answer" style={{ color: '#00f2fe' }}>{gameData.settings.secretWord}</h1>
                            <p>Imposter's Theme:</p>
                            <h2 style={{ color: '#ffeb3b' }}>{gameData.settings.theme}</h2>
                        </>
                    ) : myRole === 'player' ? (
                        <>
                            <h3 style={{ color: '#aaa' }}>The Secret Word is:</h3>
                            <h1 className="massive-answer" style={{ color: '#00f2fe' }}>{gameData.settings.secretWord}</h1>
                            <p>Describe it in ONE word out loud!</p>
                        </>
                    ) : (
                        <>
                            <h1 style={{ color: '#ff4b2b', fontSize: '2.5rem' }}>YOU ARE THE IMPOSTER</h1>
                            <h3 style={{ color: '#aaa', marginTop: '20px' }}>The Theme is:</h3>
                            <h1 className="massive-answer" style={{ color: '#ffeb3b' }}>{gameData.settings.theme}</h1>
                            <p style={{ fontSize: '1.2rem' }}>Blend in. Listen carefully and make a generic guess!</p>
                        </>
                    )}
                </div>

                {isAdmin && <button className="btn-danger" onClick={startVoting}>Everyone has spoken ➡ Start Voting</button>}
            </div>
        );
    }

    if (gameData && gameData.status === 'voting') {
        const isAdmin = gameData.adminUid === userId;
        const actualPlayers = Object.entries(gameData.players)
            .map(([id, data]) => ({ id, ...data }))
            .filter(p => p.id !== gameData.adminUid);
        const myData = gameData.players[userId];

        return (
            <div className="batman-container App">
                <h1>VOTING PHASE</h1>
                <div className="glass-panel">
                    {isAdmin ? (
                        <h2>Waiting for players to cast their votes...</h2>
                    ) : !myData.votedFor ? (
                        <>
                            <p>Who is the Imposter?</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {actualPlayers.map((player) => (
                                    <button key={player.id} onClick={() => submitVote(player.id)}>Vote out {player.name}</button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <h2>Vote Locked In! 🔒</h2>
                    )}
                </div>
                {isAdmin && <button className="btn-danger" onClick={processVotes}>Process Votes</button>}
            </div>
        );
    }

    if (gameData && gameData.status === 'imposter_guessing') {
        const isAdmin = gameData.adminUid === userId;
        const isCaughtImposter = gameData.caughtImposterId === userId;

        return (
            <div className="batman-container App">
                <h1 style={{ color: '#ffeb3b' }}>IMPOSTER CAUGHT!</h1>
                <div className="glass-panel">
                    {isAdmin ? (
                        <>
                            <h2>The village caught the Imposter!</h2>
                            <p style={{ color: '#aaa' }}>Waiting to see if they can guess the secret word to steal the win...</p>
                        </>
                    ) : isCaughtImposter ? (
                        <>
                            <h2 style={{ color: '#ff4b2b' }}>They voted you out!</h2>
                            <p>You have ONE chance to steal the win. What was the secret word?</p>
                            <input
                                type="text"
                                placeholder="Type the secret word..."
                                value={imposterGuess}
                                onChange={(e) => setImposterGuess(e.target.value)}
                            />
                            <button className="btn-danger" onClick={submitImposterGuess}>Submit Final Guess</button>
                        </>
                    ) : (
                        <>
                            <h2>You caught the Imposter!</h2>
                            <p style={{ color: '#aaa' }}>Waiting for the Imposter to submit their final guess...</p>
                        </>
                    )}
                </div>
            </div>
        );
    }

    if (gameData && gameData.status === 'results') {
        const isAdmin = gameData.adminUid === userId;
        const playersWon = gameData.winner === 'Players';
        const winColor = playersWon ? '#4CAF50' : '#ff4b2b';

        return (
            <div className="batman-container App">
                <h1>GAME OVER</h1>
                <div className="glass-panel">
                    <h1 style={{ color: winColor, fontSize: '2.5rem' }}>{gameData.winner.toUpperCase()} WIN!</h1>
                    <p style={{ fontSize: '1.2rem', marginBottom: '20px' }}>{gameData.method}</p>

                    <hr />
                    <h2 style={{ color: '#00f2fe' }}>Word: {gameData.settings.secretWord}</h2>
                    <h4 style={{ color: '#aaa', marginTop: '0' }}>Theme: {gameData.settings.theme}</h4>

                    <ul style={{ textAlign: 'left', marginTop: '20px' }}>
                        {Object.entries(gameData.players)
                            .filter(([id, p]) => p.role !== 'admin')
                            .map(([id, p]) => (
                                <li key={id}>
                                    {p.name} - <strong style={{ color: p.role === 'imposter' ? '#ff4b2b' : '#aaa' }}>{p.role.toUpperCase()}</strong>
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

export default WordImposter;