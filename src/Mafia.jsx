import { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

function Mafia() {
    const [playerName, setPlayerName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [currentScreen, setCurrentScreen] = useState('home');
    const [userId, setUserId] = useState('');
    const [gameData, setGameData] = useState(null);

    // Game Setup States
    const [mafiaCount, setMafiaCount] = useState(1);
    const [showRules, setShowRules] = useState(false);
    const [lobbyError, setLobbyError] = useState(''); // NEW: On-screen error tracker

    // Night Action States
    const [myTarget, setMyTarget] = useState(null);

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
            type: 'mafia',
            status: 'lobby',
            adminUid: newUserId,
            phase: 'setup',
            history: [],
            settings: { mafiaCount: 1 },
            players: {
                [newUserId]: { name: playerName, role: 'god', isAlive: true }
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

        if (gameSnap.exists() && gameSnap.data().type === 'mafia') {
            const newUserId = Math.random().toString(36).substring(2, 9);
            await updateDoc(gameRef, {
                [`players.${newUserId}`]: { name: playerName, role: 'unassigned', isAlive: true }
            });
            setUserId(newUserId);
            setRoomCode(codeUpper);
            setCurrentScreen('lobby');
        } else {
            alert("Mafia Room not found!");
        }
    };

    const startGame = async () => {
        try {
            setLobbyError(''); // Clear previous errors

            const allIds = Object.keys(gameData.players);
            const playerIds = allIds.filter(id => id !== gameData.adminUid);

            // MATH: 4 Specials (Police, Doc, Jester, Bomber) + 1 Villager (Minimum) + N Mafia
            const requiredPlayers = 5 + mafiaCount;

            if (playerIds.length < requiredPlayers) {
                setLobbyError(`Not enough citizens! You need at least ${requiredPlayers} players (excluding God) to support ${mafiaCount} Mafia and guarantee at least 1 Villager.`);
                return; // Stop the function here
            }

            let shuffledIds = [...playerIds].sort(() => 0.5 - Math.random());

            // FIX: "Deep Copy" the players to prevent React from silently crashing
            const newPlayers = JSON.parse(JSON.stringify(gameData.players));

            newPlayers[shuffledIds[0]].role = 'police';
            newPlayers[shuffledIds[1]].role = 'doctor';
            newPlayers[shuffledIds[2]].role = 'jester';
            newPlayers[shuffledIds[3]].role = 'bomber';

            for (let i = 0; i < mafiaCount; i++) {
                newPlayers[shuffledIds[4 + i]].role = 'mafia';
            }

            for (let i = 4 + mafiaCount; i < shuffledIds.length; i++) {
                newPlayers[shuffledIds[i]].role = 'villager';
            }

            const gameRef = doc(db, 'games', roomCode);
            await updateDoc(gameRef, {
                status: 'playing',
                phase: 'night_police',
                players: newPlayers,
                doctorSelfHealCooldown: 0,
                nightActions: { policeGuess: null, mafiaKill: null, doctorHeal: null }
            });
        } catch (error) {
            console.error("Game Start Error:", error);
            setLobbyError("A system error occurred. Check the console.");
        }
    };

    // --- ACTIONS ---
    const submitNightAction = async () => {
        if (!myTarget) return;
        const gameRef = doc(db, 'games', roomCode);
        const myRole = gameData.players[userId].role;

        let actionField = '';
        if (myRole === 'police') actionField = 'policeGuess';
        if (myRole === 'mafia') actionField = 'mafiaKill';
        if (myRole === 'doctor') actionField = 'doctorHeal';

        await updateDoc(gameRef, { [`nightActions.${actionField}`]: myTarget });
        setMyTarget(null);
    };

    const bomberExplode = async (targetId) => {
        if (!window.confirm("Are you sure? You will die too!")) return;
        const gameRef = doc(db, 'games', roomCode);

        let updatedPlayers = { ...gameData.players };
        updatedPlayers[userId].isAlive = false;
        updatedPlayers[targetId].isAlive = false;

        await updateDoc(gameRef, {
            players: updatedPlayers,
            history: [...gameData.history, `The Suicide Bomber blew up ${gameData.players[targetId].name}!`]
        });
        checkWinCondition(updatedPlayers);
    };

    const submitDayVote = async (targetId) => {
        const gameRef = doc(db, 'games', roomCode);
        await updateDoc(gameRef, { [`players.${userId}.votedFor`]: targetId });
    };

    const transferGod = async (newGodId) => {
        if (gameData.status !== 'lobby') return alert("You can only pass the God role in the lobby!");

        const gameRef = doc(db, 'games', roomCode);
        await updateDoc(gameRef, {
            adminUid: newGodId,
            [`players.${userId}.role`]: 'unassigned',
            [`players.${newGodId}.role`]: 'god'
        });
    };

    // --- GOD (ADMIN) CONTROLS ---
    const advancePhase = async (nextPhase) => {
        const gameRef = doc(db, 'games', roomCode);
        let updates = { phase: nextPhase };

        if (nextPhase === 'day_debate') {
            const { mafiaKill, doctorHeal } = gameData.nightActions;
            let newHistory = [...gameData.history];
            let updatedPlayers = { ...gameData.players };

            if (mafiaKill && mafiaKill !== doctorHeal) {
                updatedPlayers[mafiaKill].isAlive = false;
                newHistory.push(`${updatedPlayers[mafiaKill].name} was killed in the night.`);
            } else if (mafiaKill === doctorHeal) {
                newHistory.push(`Someone was attacked, but the Doctor saved them!`);
            } else {
                newHistory.push(`It was a quiet night.`);
            }

            if (doctorHeal === Object.keys(updatedPlayers).find(id => updatedPlayers[id].role === 'doctor')) {
                updates.doctorSelfHealCooldown = 3;
            } else if (gameData.doctorSelfHealCooldown > 0) {
                updates.doctorSelfHealCooldown = gameData.doctorSelfHealCooldown - 1;
            }

            updates.players = updatedPlayers;
            updates.history = newHistory;
            updates.nightActions = { policeGuess: null, mafiaKill: null, doctorHeal: null };

            await updateDoc(gameRef, updates);
            checkWinCondition(updatedPlayers);
            return;
        }

        if (nextPhase === 'night_police') {
            let clearedPlayers = { ...gameData.players };
            for (let id in clearedPlayers) clearedPlayers[id].votedFor = null;
            updates.players = clearedPlayers;
        }

        await updateDoc(gameRef, updates);
    };

    const processDayVotes = async () => {
        const actualPlayers = Object.entries(gameData.players).filter(([id, p]) => p.role !== 'god' && p.isAlive);
        const voteCounts = {};
        actualPlayers.forEach(([id, p]) => {
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

        let updatedPlayers = { ...gameData.players };
        let newHistory = [...gameData.history];

        if (mostVotedIds.length === 1) {
            const eliminatedId = mostVotedIds[0];
            updatedPlayers[eliminatedId].isAlive = false;
            newHistory.push(`The village voted out ${updatedPlayers[eliminatedId].name}.`);

            // JESTER WIN CHECK
            if (updatedPlayers[eliminatedId].role === 'jester') {
                const gameRef = doc(db, 'games', roomCode);
                await updateDoc(gameRef, { status: 'results', winner: 'Jester', players: updatedPlayers, history: newHistory });
                return;
            }
        } else {
            newHistory.push(`The village tied. Nobody was voted out.`);
        }

        const gameRef = doc(db, 'games', roomCode);
        await updateDoc(gameRef, { players: updatedPlayers, history: newHistory, phase: 'night_police' });

        checkWinCondition(updatedPlayers);
    };

    const checkWinCondition = async (playersObj) => {
        const alivePlayers = Object.values(playersObj).filter(p => p.role !== 'god' && p.isAlive);
        const aliveMafia = alivePlayers.filter(p => p.role === 'mafia').length;
        const aliveNonMafia = alivePlayers.length - aliveMafia;

        let winner = null;
        if (aliveMafia === 0) winner = 'Village';
        else if (aliveMafia >= aliveNonMafia) winner = 'Mafia';

        if (winner) {
            const gameRef = doc(db, 'games', roomCode);
            await updateDoc(gameRef, { status: 'results', winner });
        }
    };

    const resetGame = async () => {
        const gameRef = doc(db, 'games', roomCode);
        let resetPlayers = { ...gameData.players };
        for (let id in resetPlayers) {
            resetPlayers[id].isAlive = true;
            resetPlayers[id].votedFor = null;
            resetPlayers[id].role = resetPlayers[id].role === 'god' ? 'god' : 'unassigned';
        }
        await updateDoc(gameRef, {
            status: 'lobby',
            phase: 'setup',
            history: [],
            players: resetPlayers
        });
    };

    // --- UI COMPONENTS ---

    // 1. RULES SCREEN
    if (showRules) {
        return (
            <div className="batman-container App" style={{ textAlign: 'left', overflowY: 'auto', maxHeight: '90vh' }}>
                <h1 style={{ textAlign: 'center' }}>Protocol: MAFIA</h1>
                <div className="glass-panel">
                    <h3>The Factions</h3>
                    <ul>
                        <li>🟢 <strong>Villager:</strong> Find the Mafia. No special powers.</li>
                        <li>🏥 <strong>Doctor:</strong> Heals 1 person per night. Can heal self once every 3 nights.</li>
                        <li>🚓 <strong>Police:</strong> Suspects 1 person per night. <br /><span style={{ color: '#ffeb3b' }}>Twist:</span> Gets a "Suspicious" read on Mafia AND the Jester!</li>
                        <li>💣 <strong>Suicide Bomber:</strong> Can detonate during the Day Debate, killing themselves and a target.</li>
                        <li>🔪 <strong>Mafia:</strong> Kill 1 person every night. Win if they equal the number of villagers.</li>
                        <li>🤡 <strong>Jester:</strong> Anti-village. Wins instantly if the village votes them out.</li>
                        <li>👁️ <strong>God (Admin):</strong> Controls the flow of time and oversees the chaos.</li>
                    </ul>
                    <button className="btn-warning" onClick={() => setShowRules(false)}>Back to Setup</button>
                </div>
            </div>
        );
    }

    // 2. HOME SCREEN
    if (currentScreen === 'home') {
        return (
            <div className="batman-container App">
                <h1>MAFIA</h1>
                <p>Trust no one.</p>
                <div className="glass-panel">
                    <input type="text" placeholder="Enter your name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
                    <hr />
                    <button className="btn-danger" onClick={createGame}>Create Game (God Mode)</button>
                    <hr />
                    <input type="text" placeholder="Room Code" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} maxLength={4} />
                    <button className="btn-success" onClick={joinGame}>Join Village</button>
                </div>
                <Link to="/" style={{ color: '#00f2fe', textDecoration: 'none' }}>⬅ Back to Hub</Link>
            </div>
        );
    }

    // 3. LOBBY SCREEN
    if (currentScreen === 'lobby' && gameData && gameData.status === 'lobby') {
        const isAdmin = gameData.adminUid === userId;
        const playersList = Object.entries(gameData.players).map(([id, data]) => ({ id, ...data }));

        return (
            <div className="batman-container App">
                <h1>Room: {roomCode}</h1>
                <button className="btn-warning btn-small" onClick={() => setShowRules(true)} style={{ marginBottom: '20px' }}>View Rules & Roles</button>

                <div className="glass-panel">
                    <h2>Players ({playersList.length})</h2>
                    <ul>
                        {playersList.map((player) => (
                            <li key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>
                                    {player.role === 'god' ? '👁️' : '👤'} {player.name} {gameData.adminUid === player.id ? "(God)" : ""}
                                </span>

                                {isAdmin && player.id !== userId && (
                                    <button
                                        className="btn-warning"
                                        style={{ width: 'auto', padding: '5px 15px', fontSize: '0.9rem', marginBottom: '0' }}
                                        onClick={() => transferGod(player.id)}
                                    >
                                        Make God
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                {isAdmin ? (
                    <div className="glass-panel">
                        <h3>God Setup</h3>
                        <label>Number of Mafias:</label>
                        <input type="number" min="1" value={mafiaCount} onChange={(e) => setMafiaCount(Number(e.target.value))} />
                        <p style={{ fontSize: '0.9rem', color: '#aaa' }}>Note: You need at least {mafiaCount + 5} players.</p>

                        {/* THE NEW ERROR DISPLAY */}
                        {lobbyError && <p style={{ color: '#ff4b2b', fontWeight: 'bold', margin: '15px 0' }}>⚠️ {lobbyError}</p>}

                        <button className="btn-danger" onClick={startGame}>Initiate Night 1</button>
                    </div>
                ) : (
                    <p>Waiting for God to initiate the sequence...</p>
                )}
            </div>
        );
    }

    // 4. ACTIVE GAME SCREEN
    if (gameData && gameData.status === 'playing') {
        const isAdmin = gameData.adminUid === userId;
        const myData = gameData.players[userId];
        const alivePlayers = Object.entries(gameData.players).filter(([id, p]) => p.isAlive && p.role !== 'god');

        // -- ADMIN (GOD) DASHBOARD --
        if (isAdmin) {
            return (
                <div className="batman-container App">
                    <h1>God's Eye View</h1>
                    <div className="glass-panel" style={{ textAlign: 'left' }}>
                        <h3>Phase: <span style={{ color: '#00f2fe', textTransform: 'uppercase' }}>{gameData.phase.replace('_', ' ')}</span></h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '20px 0' }}>
                            <button className="btn-small" onClick={() => advancePhase('night_police')}>1. Police</button>
                            <button className="btn-danger btn-small" onClick={() => advancePhase('night_mafia')}>2. Mafia</button>
                            <button className="btn-success btn-small" onClick={() => advancePhase('night_doctor')}>3. Doctor</button>
                            <button className="btn-warning btn-small" onClick={() => advancePhase('day_debate')}>4. Wake Up (Debate)</button>
                            <button className="btn-small" onClick={() => advancePhase('day_voting')}>5. Voting</button>
                        </div>
                        {gameData.phase === 'day_voting' && (
                            <button className="btn-danger" onClick={processDayVotes} style={{ marginTop: '10px' }}>Process Votes & Kill</button>
                        )}
                    </div>

                    <div className="glass-panel" style={{ textAlign: 'left' }}>
                        <h3>The Living</h3>
                        <ul style={{ fontSize: '0.9rem' }}>
                            {alivePlayers.map(([id, p]) => (
                                <li key={id}>{p.name} - <strong style={{ color: '#ffeb3b' }}>{p.role}</strong></li>
                            ))}
                        </ul>
                    </div>
                </div>
            );
        }

        // -- DEAD PLAYER VIEW --
        if (!myData.isAlive) {
            return (
                <div className="batman-container App">
                    <h1 style={{ color: '#ff4b2b' }}>YOU ARE DEAD</h1>
                    <p>Do not speak. Watch the chaos unfold.</p>
                </div>
            );
        }

        // -- NIGHT PHASES (PLAYER VIEW) --
        if (gameData.phase.startsWith('night_')) {
            const activeRole = gameData.phase.split('_')[1];
            const isMyTurn = myData.role === activeRole;

            let policeResult = null;
            if (myData.role === 'police' && gameData.nightActions.policeGuess) {
                const targetRole = gameData.players[gameData.nightActions.policeGuess].role;
                policeResult = (targetRole === 'mafia' || targetRole === 'jester') ? "SUSPICIOUS!" : "Innocent.";
            }

            return (
                <div className="batman-container App">
                    <h1>NIGHT TIME</h1>
                    <h2>You are: <span style={{ color: '#ffeb3b', textTransform: 'uppercase' }}>{myData.role}</span></h2>

                    <div className="glass-panel">
                        {!isMyTurn ? (
                            <p>Close your eyes. The {activeRole} is taking action...</p>
                        ) : (
                            <div>
                                <h3>Make your move:</h3>

                                {myData.role === 'doctor' && gameData.doctorSelfHealCooldown > 0 && (
                                    <p style={{ color: '#ff4b2b', fontSize: '0.9rem' }}>Cannot heal self for {gameData.doctorSelfHealCooldown} more nights.</p>
                                )}

                                {(gameData.nightActions.policeGuess && myData.role === 'police') ||
                                    (gameData.nightActions.mafiaKill && myData.role === 'mafia') ||
                                    (gameData.nightActions.doctorHeal && myData.role === 'doctor') ? (
                                    <div>
                                        <h3 style={{ color: '#4CAF50' }}>Action Locked!</h3>
                                        {policeResult && <h1 style={{ color: policeResult === 'SUSPICIOUS!' ? '#ff4b2b' : '#4CAF50' }}>{policeResult}</h1>}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <select
                                            onChange={(e) => setMyTarget(e.target.value)}
                                            style={{ padding: '10px', borderRadius: '5px', background: '#333', color: 'white' }}
                                        >
                                            <option value="">Select Target...</option>
                                            {alivePlayers.map(([id, p]) => {
                                                if (myData.role === 'doctor' && id === userId && gameData.doctorSelfHealCooldown > 0) return null;
                                                return <option key={id} value={id}>{p.name}</option>;
                                            })}
                                        </select>
                                        <button className="btn-success" onClick={submitNightAction}>Confirm Target</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // -- DAY DEBATE PHASE --
        if (gameData.phase === 'day_debate') {
            return (
                <div className="batman-container App">
                    <h1>DAYTIME: DEBATE</h1>
                    <h2>You are: <span style={{ color: '#ffeb3b', textTransform: 'uppercase' }}>{myData.role}</span></h2>

                    <div className="glass-panel" style={{ textAlign: 'left' }}>
                        <h3>Recent Events:</h3>
                        <p style={{ color: '#ff4b2b', fontStyle: 'italic' }}>{gameData.history[gameData.history.length - 1]}</p>
                    </div>

                    {myData.role === 'bomber' && (
                        <div className="glass-panel" style={{ border: '1px solid #ff4b2b' }}>
                            <h3 style={{ color: '#ff4b2b' }}>💣 DETONATE</h3>
                            <p style={{ fontSize: '0.9rem' }}>Take someone down with you.</p>
                            <select onChange={(e) => setMyTarget(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', background: '#333', color: 'white' }}>
                                <option value="">Select Target...</option>
                                {alivePlayers.filter(([id]) => id !== userId).map(([id, p]) => (
                                    <option key={id} value={id}>{p.name}</option>
                                ))}
                            </select>
                            <button className="btn-danger" onClick={() => bomberExplode(myTarget)}>BLOW UP</button>
                        </div>
                    )}
                    <p>Discuss! Wait for God to start the voting phase.</p>
                </div>
            );
        }

        // -- DAY VOTING PHASE --
        if (gameData.phase === 'day_voting') {
            return (
                <div className="batman-container App">
                    <h1>VOTING PHASE</h1>

                    <div className="glass-panel">
                        {!myData.votedFor ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {alivePlayers.map(([id, p]) => (
                                    <button key={id} onClick={() => submitDayVote(id)}>Vote out {p.name}</button>
                                ))}
                            </div>
                        ) : (
                            <h2>Vote Locked In! 🔒</h2>
                        )}
                    </div>
                </div>
            );
        }
    }

    // 5. RESULTS SCREEN
    if (gameData && gameData.status === 'results') {
        const isAdmin = gameData.adminUid === userId;
        let winColor = gameData.winner === 'Village' ? '#4CAF50' : gameData.winner === 'Jester' ? '#9c27b0' : '#ff4b2b';

        return (
            <div className="batman-container App">
                <h1>GAME OVER</h1>
                <div className="glass-panel">
                    <h1 style={{ color: winColor, fontSize: '3rem' }}>{gameData.winner.toUpperCase()} WINS!</h1>

                    <h3 style={{ marginTop: '20px' }}>Final Roles:</h3>
                    <ul style={{ textAlign: 'left' }}>
                        {Object.entries(gameData.players).filter(([id, p]) => p.role !== 'god').map(([id, p]) => (
                            <li key={id}>
                                {p.name} - <span style={{ color: '#ffeb3b' }}>{p.role}</span> {p.isAlive ? '(Alive)' : '💀'}
                            </li>
                        ))}
                    </ul>
                </div>
                {isAdmin && <button className="btn-success" onClick={resetGame}>Return to Lobby</button>}
            </div>
        );
    }

    return null;
}

export default Mafia;