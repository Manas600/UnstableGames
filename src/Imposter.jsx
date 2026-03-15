import { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import './App.css'; // This can stay, even if the file is empty now

function Imposter() {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [currentScreen, setCurrentScreen] = useState('home');
  const [userId, setUserId] = useState('');
  const [gameData, setGameData] = useState(null);
  const [myAnswer, setMyAnswer] = useState('');

  const [playerQuestion, setPlayerQuestion] = useState('');
  const [imposterQuestion, setImposterQuestion] = useState('');
  const [imposterCount, setImposterCount] = useState(1);

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
    if (!playerName) return alert("Please enter your name first!");
    const newCode = generateCode();
    const newUserId = Math.random().toString(36).substring(2, 9);
    const gameRef = doc(db, 'games', newCode);

    await setDoc(gameRef, {
      status: 'lobby',
      adminUid: newUserId,
      settings: { imposterCount: 1, playerQuestion: '', imposterQuestion: '' },
      players: {
        [newUserId]: { name: playerName, role: 'player', answer: '', isReady: false }
      }
    });

    setUserId(newUserId);
    setRoomCode(newCode);
    setCurrentScreen('lobby');
  };

  const joinGame = async () => {
    if (!playerName || !roomCode) return alert("Enter both your name and a room code!");
    const codeUpper = roomCode.toUpperCase();
    const gameRef = doc(db, 'games', codeUpper);
    const gameSnap = await getDoc(gameRef);

    if (gameSnap.exists()) {
      const newUserId = Math.random().toString(36).substring(2, 9);
      await updateDoc(gameRef, {
        [`players.${newUserId}`]: { name: playerName, role: 'player', answer: '', isReady: false }
      });
      setUserId(newUserId);
      setRoomCode(codeUpper);
      setCurrentScreen('lobby');
    } else {
      alert("Room not found! Check the code and try again.");
    }
  };

  const startGame = async () => {
    if (!playerQuestion || !imposterQuestion) return alert("Please enter both questions!");
    const allIds = Object.keys(gameData.players);
    const playerIds = allIds.filter(id => id !== gameData.adminUid);

    if (playerIds.length < imposterCount) return alert("You need more players to have that many imposters!");

    let shuffledIds = [...playerIds].sort(() => 0.5 - Math.random());
    let imposterIds = shuffledIds.slice(0, imposterCount);

    let updatedPlayers = { ...gameData.players };
    for (let id of playerIds) {
      updatedPlayers[id].role = imposterIds.includes(id) ? 'imposter' : 'player';
    }
    updatedPlayers[gameData.adminUid].role = 'admin';

    const gameRef = doc(db, 'games', roomCode);
    await updateDoc(gameRef, {
      status: 'answering',
      'settings.playerQuestion': playerQuestion,
      'settings.imposterQuestion': imposterQuestion,
      'settings.imposterCount': imposterCount,
      players: updatedPlayers
    });
  };

  const submitAnswer = async () => {
    if (!myAnswer) return alert("Please type an answer first!");
    const gameRef = doc(db, 'games', roomCode);
    await updateDoc(gameRef, {
      [`players.${userId}.answer`]: myAnswer,
      [`players.${userId}.isReady`]: true
    });
  };

  const revealAnswers = async () => {
    const gameRef = doc(db, 'games', roomCode);
    await updateDoc(gameRef, { status: 'reveal' });
  };

  const startVoting = async () => {
    const gameRef = doc(db, 'games', roomCode);
    await updateDoc(gameRef, { status: 'voting' });
  };

  const submitVote = async (suspectId) => {
    const gameRef = doc(db, 'games', roomCode);
    await updateDoc(gameRef, { [`players.${userId}.votedFor`]: suspectId });
  };

  const revealResults = async () => {
    const gameRef = doc(db, 'games', roomCode);
    await updateDoc(gameRef, { status: 'results' });
  };

  const resetGame = async () => {
    const gameRef = doc(db, 'games', roomCode);
    let resetPlayers = { ...gameData.players };
    for (let id in resetPlayers) {
      resetPlayers[id].answer = '';
      resetPlayers[id].isReady = false;
      resetPlayers[id].votedFor = null;
      resetPlayers[id].role = resetPlayers[id].role === 'admin' ? 'admin' : 'player';
    }
    await updateDoc(gameRef, {
      status: 'lobby',
      players: resetPlayers,
      'settings.playerQuestion': '',
      'settings.imposterQuestion': ''
    });
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

  // --- THE RESULTS PHASE UI ---
  if (gameData && gameData.status === 'results') {
    const isAdmin = gameData.adminUid === userId;
    const actualPlayers = Object.entries(gameData.players).map(([id, data]) => ({ id, ...data }));
    const imposters = actualPlayers.filter(p => p.role === 'imposter');
    const imposterNames = imposters.map(i => i.name).join(' & ');

    const voteCounts = {};
    actualPlayers.forEach(p => {
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
    const mostVotedNames = mostVotedIds.map(id => gameData.players[id].name).join(' & ');
    const playersWon = mostVotedIds.length === 1 && imposters.some(i => i.id === mostVotedIds[0]);

    return (
      <div className="batman-container App">
        <h1>Game Over!</h1>
        <div className="glass-panel">
          <h2 style={{ color: '#ff4b2b' }}>The Imposter: {imposterNames}</h2>
          <h3>Group voted out: {mostVotedNames || "Nobody"}</h3>
          <h1>{playersWon ? "PLAYERS WIN! 🎉" : "IMPOSTER WINS! 😈"}</h1>
        </div>

        <div className="glass-panel">
          <h3>Vote Breakdown:</h3>
          <ul>
            {actualPlayers.map(p => {
              const votedForName = p.votedFor ? gameData.players[p.votedFor].name : 'No one';
              return (
                <li key={p.id}>
                  <strong>{p.name}</strong> voted for ➡️ <span>{votedForName}</span>
                </li>
              );
            })}
          </ul>
        </div>
        {isAdmin && <button className="btn-success" onClick={resetGame}>Play Again</button>}
      </div>
    );
  }

  // --- THE VOTING PHASE UI ---
  if (gameData && gameData.status === 'voting') {
    const isAdmin = gameData.adminUid === userId;
    const actualPlayers = Object.entries(gameData.players)
      .filter(([id, _]) => id !== gameData.adminUid)
      .map(([id, data]) => ({ id, ...data }));

    const totalPlayers = actualPlayers.length;
    const votedPlayers = actualPlayers.filter(p => p.votedFor).length;
    const myPlayerData = gameData.players[userId];

    if (isAdmin) {
      return (
        <div className="batman-container App">
          <div className="glass-panel">
            <h1>Voting in Progress...</h1>
            <h2>{votedPlayers} / {totalPlayers} votes cast.</h2>
            {votedPlayers === totalPlayers && (
              <button className="btn-danger" onClick={revealResults}>Reveal Imposter!</button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="batman-container App">
        <div className="glass-panel">
          <h1>Time to Vote!</h1>
          <p>Who is the Imposter?</p>
          {!myPlayerData.votedFor ? (
            <div>
              {actualPlayers.map(player => (
                <button key={player.id} onClick={() => submitVote(player.id)}>
                  Vote for {player.name}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <h2>Vote Locked In! 🔒</h2>
              <p>Waiting for the remaining players...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- THE REVEAL & DEBATE PHASE UI ---
  if (gameData && gameData.status === 'reveal') {
    const isAdmin = gameData.adminUid === userId;
    const myPlayerData = gameData.players[userId];

    if (isAdmin) {
      return (
        <div className="batman-container App">
          <div className="glass-panel">
            <h1>Discussion Time!</h1>
            <p>Players are showing their screens.</p>
            <p>Listen to the debate. Once everyone is ready, click below.</p>
            <button className="btn-danger" onClick={startVoting}>Start Voting Phase</button>
          </div>
        </div>
      );
    }

    return (
      <div className="batman-container App">
        <div className="glass-panel">
          <h2>Your Answer:</h2>
          <h1 className="massive-answer">{myPlayerData.answer}</h1>
          <p>📱 Turn your screen around to show everyone!</p>
        </div>
      </div>
    );
  }

  // --- THE ANSWERING PHASE UI ---
  if (gameData && gameData.status === 'answering') {
    const isAdmin = gameData.adminUid === userId;
    const allUsers = Object.keys(gameData.players);
    const actualPlayers = allUsers.filter(id => id !== gameData.adminUid).map(id => gameData.players[id]);
    const totalPlayers = actualPlayers.length;
    const readyPlayers = actualPlayers.filter(p => p.isReady).length;

    if (isAdmin) {
      return (
        <div className="batman-container App">
          <div className="glass-panel">
            <h1>Moderator Dashboard</h1>
            <h2>{readyPlayers} / {totalPlayers} players ready.</h2>
            {readyPlayers === totalPlayers && (
              <button className="btn-warning" onClick={revealAnswers}>Reveal Answers!</button>
            )}
          </div>
        </div>
      );
    }

    const myPlayerData = gameData.players[userId];
    const amIImposter = myPlayerData.role === 'imposter';
    const myQuestion = amIImposter ? gameData.settings.imposterQuestion : gameData.settings.playerQuestion;

    return (
      <div className="batman-container App">
        <div className="glass-panel">
          {!myPlayerData.isReady ? (
            <>
              <h2>Your Prompt:</h2>
              <h1>{myQuestion}</h1>
              <input type="text" placeholder="Type your answer..." value={myAnswer} onChange={(e) => setMyAnswer(e.target.value)} />
              <button className="btn-success" onClick={submitAnswer}>Submit Answer</button>
            </>
          ) : (
            <>
              <h2>Answer Submitted!</h2>
              <p>Waiting for others...</p>
              <h2>{readyPlayers} / {totalPlayers} players ready.</h2>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- THE LOBBY UI ---
  if (currentScreen === 'lobby' && gameData) {
    const isAdmin = gameData.adminUid === userId;
    const playersList = Object.entries(gameData.players).map(([id, data]) => ({ id, ...data }));

    return (
      <div className="batman-container App">
        <h1>Room: {roomCode}</h1>
        <div className="glass-panel">
          <h2>Players ({playersList.length})</h2>
          <ul>
            {playersList.map((player) => (
              <li key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🟢 {player.name} {gameData.adminUid === player.id ? "(Admin)" : ""}</span>
                {isAdmin && player.id !== userId && (
                  <button style={{ width: 'auto', padding: '5px 15px', fontSize: '0.9rem', marginBottom: '0' }} onClick={() => transferAdmin(player.id)}>Make Admin</button>
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
            <input type="text" placeholder="Player Question (e.g., Name a soft fruit)" value={playerQuestion} onChange={(e) => setPlayerQuestion(e.target.value)} />
            <input type="text" placeholder="Imposter Question (e.g., Name a hard vegetable)" value={imposterQuestion} onChange={(e) => setImposterQuestion(e.target.value)} />
            <button className="btn-success" onClick={startGame}>Start Game</button>
          </div>
        ) : (
          <p>Waiting for Admin to set up the game...</p>
        )}
      </div>
    );
  }

  // --- THE DEFAULT HOME UI ---
  return (
    <div className="batman-container App">
      <h1>Who is the Imposter?</h1>
      <div className="glass-panel">
        <input type="text" placeholder="Enter your name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
        <hr />
        <button className="btn-success" onClick={createGame}>Create New Game</button>
        <hr />
        <input type="text" placeholder="Room Code (e.g. ABCD)" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} maxLength={4} />
        <button onClick={joinGame}>Join Game</button>
      </div>
    </div>
  );
}

export default Imposter;
